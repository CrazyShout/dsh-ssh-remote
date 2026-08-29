import type {
  CollectedOutput,
  ShellExecSpec,
  ShellExecutor,
  ShellProcess,
  ShellProcessRead,
  ShellRunResult,
  ShellSandboxInfo,
} from '@deepseek-ai/dsh-shell';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import type { RemoteHelperClient } from './helper/rpc-client.js';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
import { formatSshUri, parseSshUri, type SshUri } from './types.js';

interface HelperProcessStart {
  processId: string;
  pid: number;
  pgid: number;
  tty: boolean;
  running: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | number | null;
  latestSeq: string;
  sandbox?: {
    mode: SandboxExecutionPolicy['mode'];
    enforcement: 'full' | 'partial';
  };
}

interface HelperProcessRead {
  chunks: Array<{ seq: string; stream: 'stdout' | 'stderr' | 'pty'; data: string }>;
  earliestSeq: string;
  nextSeq: string;
  truncated: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | number | null;
}

interface ProcessScope {
  client: RemoteHelperClient;
  uri: string;
  workspaceId: string;
  cwd: string;
  mode: SandboxExecutionPolicy['mode'];
}

interface ShellAllocationIds {
  workspaceId: string;
  processId: string;
}

const DEFAULT_OUTPUT_MAX_BYTES = 64 * 1024;
const PROCESS_INPUT_CHUNK_BYTES = 192 * 1024;
const SHELL_TIMEOUT_CODE = 'SSH_REMOTE_SHELL_TIMEOUT';

class RemoteShellTimeoutReason extends Error {
  constructor(readonly timeoutMs: number) {
    super(`${SHELL_TIMEOUT_CODE} after ${timeoutMs}ms`);
    this.name = 'RemoteShellTimeoutReason';
  }
}

function shellDeadline(upstream: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose(): void;
} {
  const timer = new AbortController();
  const id = setTimeout(() => timer.abort(new RemoteShellTimeoutReason(timeoutMs)), timeoutMs);
  return {
    signal: upstream === undefined ? timer.signal : AbortSignal.any([upstream, timer.signal]),
    dispose: () => clearTimeout(id),
  };
}

/** Route model-facing shell execution before local sandbox argv is materialized. */
export function installRemoteShellRouter(
  shell: ShellExecutor,
  helpers: RemoteHelperProvider,
  resolveRemotePath: RemotePathResolver,
  processes?: RemoteShellProcessTracker,
): () => void {
  const originalRun = shell.run;
  const originalStart = shell.start;

  shell.run = function (spec: ShellExecSpec): Promise<ShellRunResult> {
    const uri = remoteUri(spec.workdir, resolveRemotePath);
    return uri === undefined
      ? originalRun.call(shell, spec)
      : runRemoteShell(uri, spec, helpers, resolveRemotePath);
  };

  shell.start = function (spec: ShellExecSpec): ShellProcess {
    const uri = remoteUri(spec.workdir, resolveRemotePath);
    return uri === undefined
      ? originalStart.call(shell, spec)
      : processes?.track(new RemoteShellProcess(uri, spec, helpers, resolveRemotePath))
        ?? new RemoteShellProcess(uri, spec, helpers, resolveRemotePath);
  };

  return () => {
    shell.run = originalRun;
    shell.start = originalStart;
  };
}

/** Owns helper background jobs across shell-provider reloads and plugin teardown. */
export class RemoteShellProcessTracker {
  private readonly processes = new Set<ShellProcess>();

  track<T extends ShellProcess>(process: T): T {
    this.processes.add(process);
    void process.done.finally(() => this.processes.delete(process));
    return process;
  }

  async dispose(): Promise<void> {
    const active = [...this.processes];
    for (const process of active) process.kill();
    await Promise.allSettled(active.map(process => process.done));
    this.processes.clear();
  }
}

async function runRemoteShell(
  uri: string,
  spec: ShellExecSpec,
  helpers: RemoteHelperProvider,
  resolveRemotePath: RemotePathResolver,
): Promise<ShellRunResult> {
  const stdout = new BoundedOutput(spec.stdoutMaxBytes);
  const stderr = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
  const decoder = new ProcessOutputDecoder(stdout, stderr);
  const executionDeadline = shellDeadline(spec.signal, spec.timeoutMs);
  const ids: ShellAllocationIds = { workspaceId: randomUUID(), processId: randomUUID() };
  let timedOut = false;
  let aborted = false;
  let scope: ProcessScope | undefined;
  let process: HelperProcessStart | undefined;
  let rolledBack = false;
  let cursor = '0';
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let terminationRequested = false;
  try {
    scope = await openProcessScope(
      uri,
      spec.sandboxPolicy,
      helpers,
      resolveRemotePath,
      executionDeadline.signal,
      ids.workspaceId,
    );
    try {
      process = await startProcess(scope, spec, executionDeadline.signal, ids.processId);
    } finally {
      await closeWorkspaceBestEffort(scope);
    }
    if (spec.stdin !== undefined) {
      await writeAndCloseStdin(scope.client, process.processId, spec.stdin, executionDeadline.signal);
    }
    for (;;) {
      if (!terminationRequested && executionDeadline.signal.aborted) {
        terminationRequested = true;
        timedOut = executionDeadline.signal.reason instanceof RemoteShellTimeoutReason;
        aborted = !timedOut;
        await terminateBestEffort(scope.client, process.processId);
      }
      const read = await scope.client.call<HelperProcessRead>('process/read', {
        processId: process.processId,
        afterSeq: cursor,
        maxBytes: 192 * 1024,
        waitMs: 1_000,
      }, { timeoutMs: 5_000 });
      cursor = read.nextSeq;
      decoder.append(read);
      if (read.exited) {
        exitCode = read.exitCode;
        exitSignal = normalizeProcessSignal(read.signal);
        decoder.flush();
        break;
      }
    }
  } catch (error) {
    decoder.flush();
    if (executionDeadline.signal.aborted) {
      timedOut = executionDeadline.signal.reason instanceof RemoteShellTimeoutReason;
      aborted = !timedOut;
      await rollbackShellAllocation(helpers, uri, ids);
      rolledBack = true;
      return {
        exitCode: null,
        signal: process === undefined ? null : 'SIGTERM',
        timedOut,
        aborted,
        timeoutMs: spec.timeoutMs,
        stdout: stdout.final(),
        stderr: stderr.final(),
        ...(process?.sandbox === undefined ? {} : {
          sandbox: sandboxInfo(process.sandbox, stderr.snapshot()),
        }),
      };
    }
    if (process === undefined) {
      await rollbackShellAllocation(helpers, uri, ids);
      rolledBack = true;
      throw error;
    }
    await rollbackShellAllocation(helpers, uri, ids);
    rolledBack = true;
    throw new Error(`remote helper transport failed after process start: ${messageOf(error)}`, {
      cause: error as Error,
    });
  } finally {
    executionDeadline.dispose();
    if (!rolledBack && scope !== undefined && process !== undefined) {
      await releaseBestEffort(scope.client, process.processId);
    }
  }
  return {
    exitCode,
    signal: exitSignal,
    timedOut,
    aborted,
    timeoutMs: spec.timeoutMs,
    stdout: stdout.final(),
    stderr: stderr.final(),
    ...(process?.sandbox === undefined ? {} : {
      sandbox: sandboxInfo(process.sandbox, stderr.snapshot()),
    }),
  };
}

class RemoteShellProcess implements ShellProcess {
  status = 'running' as const as ShellProcess['status'];
  exitCode: number | null = null;
  signal: NodeJS.Signals | null = null;
  sandbox?: ShellSandboxInfo;
  readonly done: Promise<void>;
  private readonly unread = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
  private readonly stdout = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
  private readonly stderr = new BoundedOutput(DEFAULT_OUTPUT_MAX_BYTES);
  private readonly decoder = new ProcessOutputDecoder(
    this.stdout,
    this.stderr,
    value => this.unread.append(value),
    () => this.unread.markTruncated(),
  );
  private scope: ProcessScope | undefined;
  private process: HelperProcessStart | undefined;
  private killed = false;
  private removeAbort: (() => void) | undefined;

  constructor(
    uri: string,
    spec: ShellExecSpec,
    helpers: RemoteHelperProvider,
    resolveRemotePath: RemotePathResolver,
  ) {
    if (spec.signal !== undefined) {
      const onAbort = (): void => { this.kill(); };
      spec.signal.addEventListener('abort', onAbort, { once: true });
      this.removeAbort = () => spec.signal?.removeEventListener('abort', onAbort);
      if (spec.signal.aborted) onAbort();
    }
    this.done = this.run(uri, spec, helpers, resolveRemotePath);
  }

  readOutput(): ShellProcessRead {
    const read = this.unread.consume();
    return { delta: read.text, lossy: read.truncated };
  }

  kill(): boolean {
    if (this.status !== 'running' || this.killed) return false;
    this.killed = true;
    if (this.scope !== undefined && this.process !== undefined) {
      void terminateBestEffort(this.scope.client, this.process.processId);
    }
    return true;
  }

  private async run(
    uri: string,
    spec: ShellExecSpec,
    helpers: RemoteHelperProvider,
    resolveRemotePath: RemotePathResolver,
  ): Promise<void> {
    let cursor = '0';
    const ids: ShellAllocationIds = { workspaceId: randomUUID(), processId: randomUUID() };
    let rolledBack = false;
    try {
      this.scope = await openProcessScope(
        uri,
        spec.sandboxPolicy,
        helpers,
        resolveRemotePath,
        spec.signal,
        ids.workspaceId,
      );
      try {
        this.process = await startProcess(this.scope, spec, spec.signal, ids.processId);
      } finally {
        await closeWorkspaceBestEffort(this.scope);
      }
      if (this.killed) await terminateBestEffort(this.scope.client, this.process.processId);
      if (spec.stdin !== undefined) {
        await writeAndCloseStdin(this.scope.client, this.process.processId, spec.stdin, spec.signal);
      }
      for (;;) {
        const read = await this.scope.client.call<HelperProcessRead>('process/read', {
          processId: this.process.processId,
          afterSeq: cursor,
          maxBytes: 192 * 1024,
          waitMs: 1_000,
        }, { timeoutMs: 5_000 });
        cursor = read.nextSeq;
        this.decoder.append(read);
        if (read.exited) {
          this.decoder.flush();
          this.exitCode = read.exitCode;
          this.signal = normalizeProcessSignal(read.signal);
          this.status = this.killed || this.signal !== null ? 'killed' : 'completed';
          break;
        }
      }
      if (this.process.sandbox !== undefined) {
        this.sandbox = sandboxInfo(this.process.sandbox, this.stderr.snapshot());
      }
    } catch (error) {
      this.status = 'killed';
      this.signal = 'SIGKILL';
      this.decoder.flush();
      this.unread.append(`[stderr]\nspawn failed: ${messageOf(error)}\n`);
      try {
        await rollbackShellAllocation(helpers, uri, ids);
        rolledBack = true;
      } catch (cleanupError) {
        this.unread.append(`[stderr]\ncleanup failed: ${messageOf(cleanupError)}\n`);
      }
    } finally {
      this.removeAbort?.();
      this.removeAbort = undefined;
      if (!rolledBack && this.scope !== undefined && this.process !== undefined) {
        await releaseBestEffort(this.scope.client, this.process.processId);
      }
    }
  }
}

async function openProcessScope(
  uriString: string,
  policy: SandboxExecutionPolicy | undefined,
  helpers: RemoteHelperProvider,
  resolveRemotePath: RemotePathResolver,
  signal?: AbortSignal,
  workspaceId: string = randomUUID(),
): Promise<ProcessScope> {
  const uri = parseSshUri(uriString);
  const mode = policy?.mode ?? 'danger-full-access';
  let root = '/';
  if (mode !== 'danger-full-access') {
    if (policy === undefined) throw new Error('remote confined shell requires a sandbox policy');
    const mapped = resolveRemotePath(policy.workspaceRoot);
    if (mapped === undefined) throw new Error('remote sandbox workspace root is not mapped');
    const rootUri = parseSshUri(mapped);
    if (!sameHost(rootUri, uri)) throw new Error('remote sandbox root belongs to another SSH host');
    root = rootUri.path;
    if (!containsPath(root, uri.path)) throw new Error('remote shell cwd is outside sandbox workspace');
  }
  const client = await helpers.client(formatSshUri(uri), signal);
  const opened = await client.call<{ workspaceId: string; path: string }>('workspace/open', {
    path: root,
    access: mode,
    workspaceId,
    operationId: workspaceId,
  }, { signal, timeoutMs: 20_000, mutation: true });
  return {
    client,
    uri: formatSshUri(uri),
    workspaceId: opened.workspaceId,
    cwd: posix.relative(opened.path, uri.path),
    mode,
  };
}

async function startProcess(
  scope: ProcessScope,
  spec: ShellExecSpec,
  signal?: AbortSignal,
  processId: string = randomUUID(),
): Promise<HelperProcessStart> {
  const environment = { ...spec.env, ...spec.dshEnv };
  return scope.client.call<HelperProcessStart>('process/start', {
    workspaceId: scope.workspaceId,
    cwd: scope.cwd,
    argv: ['bash', '-c', spec.command],
    env: environment,
    stdin: spec.stdin === undefined ? 'closed' : 'pipe',
    tty: null,
    processId,
    operationId: processId,
  }, { signal, timeoutMs: 30_000, mutation: true });
}

class ProcessOutputDecoder {
  private readonly stdoutDecoder = new TextDecoder();
  private readonly stderrDecoder = new TextDecoder();
  private flushed = false;

  constructor(
    private readonly stdout: BoundedOutput,
    private readonly stderr: BoundedOutput,
    private readonly mirror?: (value: string) => void,
    private readonly markMirrorTruncated?: () => void,
  ) {}

  append(read: HelperProcessRead): void {
    for (const chunk of read.chunks) {
      const bytes = Buffer.from(chunk.data, 'base64');
      const isStderr = chunk.stream === 'stderr';
      const text = (isStderr ? this.stderrDecoder : this.stdoutDecoder).decode(bytes, { stream: true });
      if (isStderr) {
        this.stderr.append(text);
        if (text.length > 0) this.mirror?.(`[stderr]\n${text}`);
      } else {
        this.stdout.append(text);
        this.mirror?.(text);
      }
    }
    if (read.truncated) {
      this.stdout.markTruncated();
      this.stderr.markTruncated();
      this.markMirrorTruncated?.();
    }
  }

  flush(): void {
    if (this.flushed) return;
    this.flushed = true;
    const stdout = this.stdoutDecoder.decode();
    const stderr = this.stderrDecoder.decode();
    this.stdout.append(stdout);
    this.stderr.append(stderr);
    this.mirror?.(stdout);
    if (stderr.length > 0) this.mirror?.(`[stderr]\n${stderr}`);
  }
}

async function writeAndCloseStdin(
  client: RemoteHelperClient,
  processId: string,
  stdin: string | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const data = Buffer.from(stdin ?? '', 'utf8');
  if (data.length === 0) {
    await writeProcessChunk(client, processId, data, true, signal);
    return;
  }
  for (let offset = 0; offset < data.length; offset += PROCESS_INPUT_CHUNK_BYTES) {
    const chunk = data.subarray(offset, Math.min(data.length, offset + PROCESS_INPUT_CHUNK_BYTES));
    signal?.throwIfAborted();
    await writeProcessChunk(client, processId, chunk, offset + chunk.length === data.length, signal);
  }
}

async function writeProcessChunk(
  client: RemoteHelperClient,
  processId: string,
  data: Buffer,
  eof: boolean,
  signal?: AbortSignal,
): Promise<void> {
  const result = await client.call<{ written: number }>('process/write', {
    processId,
    data: data.toString('base64'),
    encoding: 'base64',
    eof,
    operationId: randomUUID(),
  }, { signal, timeoutMs: 15_000, mutation: true });
  if (result.written !== data.length) {
    throw new Error(`remote helper accepted ${result.written} of ${data.length} stdin bytes`);
  }
}

async function terminateBestEffort(client: RemoteHelperClient, processId: string): Promise<void> {
  await client.call('process/terminate', {
    processId,
    graceMs: 3_000,
    operationId: randomUUID(),
  }, { timeoutMs: 8_000, mutation: true }).catch(() => {});
}

async function releaseBestEffort(client: RemoteHelperClient, processId: string): Promise<void> {
  await client.call('process/release', {
    processId,
    operationId: randomUUID(),
  }, { timeoutMs: 5_000, mutation: true }).catch(() => {});
}

async function rollbackShellAllocation(
  helpers: RemoteHelperProvider,
  uri: string,
  ids: ShellAllocationIds,
): Promise<void> {
  const client = await helpers.client(uri);
  const failures: Error[] = [];
  const cleanup = async (
    method: string,
    params: Record<string, unknown>,
    unknownCodes: readonly string[],
  ): Promise<void> => {
    try {
      await client.call(method, params, { timeoutMs: 8_000, mutation: true });
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (typeof code === 'string' && unknownCodes.includes(code)) return;
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  };
  await cleanup('process/terminate', {
    processId: ids.processId,
    force: true,
    operationId: `rollback-terminate:${ids.processId}`,
  }, ['E_UNKNOWN_PROCESS']);
  await cleanup('process/release', {
    processId: ids.processId,
    operationId: `rollback-release:${ids.processId}`,
  }, ['E_UNKNOWN_PROCESS']);
  await cleanup('workspace/close', {
    workspaceId: ids.workspaceId,
    operationId: `rollback-close:${ids.workspaceId}`,
  }, ['E_UNKNOWN_WORKSPACE']);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'remote shell allocation cleanup failed');
}

async function closeWorkspaceBestEffort(scope: ProcessScope): Promise<void> {
  await scope.client.call('workspace/close', {
    workspaceId: scope.workspaceId,
    operationId: `close:${scope.workspaceId}`,
  }, { timeoutMs: 5_000, mutation: true }).catch(() => {});
}

function normalizeProcessSignal(value: NodeJS.Signals | number | null): NodeJS.Signals | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.startsWith('SIG') ? value : `SIG${value}` as NodeJS.Signals;
  return SIGNAL_NAMES[value] ?? null;
}

const SIGNAL_NAMES: Partial<Record<number, NodeJS.Signals>> = {
  1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 6: 'SIGABRT', 9: 'SIGKILL',
  13: 'SIGPIPE', 14: 'SIGALRM', 15: 'SIGTERM',
};

function sandboxInfo(
  sandbox: NonNullable<HelperProcessStart['sandbox']>,
  stderr: { text: string; truncated: boolean },
): ShellSandboxInfo {
  return {
    mode: sandbox.mode,
    enforcement: sandbox.enforcement,
    denied: /permission denied|read-only file system|operation not permitted/iu.test(stderr.text),
  };
}

class BoundedOutput {
  private text = '';
  private dropped = false;

  constructor(private readonly maxBytes: number) {}

  append(value: string): void {
    if (value.length === 0) return;
    const bytes = Buffer.from(this.text + value, 'utf8');
    if (bytes.length <= this.maxBytes) {
      this.text += value;
      return;
    }
    let start = bytes.length - this.maxBytes;
    while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
    this.text = bytes.subarray(start).toString('utf8');
    this.dropped = true;
  }

  markTruncated(): void {
    this.dropped = true;
  }

  snapshot(): { text: string; truncated: boolean } {
    return { text: this.text, truncated: this.dropped };
  }

  consume(): { text: string; truncated: boolean } {
    const result = this.snapshot();
    this.text = '';
    this.dropped = false;
    return result;
  }

  final(): CollectedOutput {
    return { text: this.text, truncated: this.dropped };
  }
}

function remoteUri(path: string, resolveRemotePath: RemotePathResolver): string | undefined {
  return path.startsWith('ssh://') ? path : resolveRemotePath(path);
}

function sameHost(left: SshUri, right: SshUri): boolean {
  return left.host === right.host && left.port === right.port && left.user === right.user;
}

function containsPath(root: string, child: string): boolean {
  const normalizedRoot = posix.normalize(root);
  const normalizedChild = posix.normalize(child);
  return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot.replace(/\/+$/u, '')}/`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
