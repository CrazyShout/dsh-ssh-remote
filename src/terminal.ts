import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import { TerminalBackendCleanupError } from '@deepseek-ai/dsh-terminal';
import type {
  TerminalBackend,
  TerminalBackendSession,
  TerminalBackendSpawnSpec,
  TerminalReadRequest,
  TerminalReadResult,
  TerminalSendOperation,
  TerminalSendRequest,
  TerminalSendResult,
  TerminalSessionStatus,
  TerminalSignal,
  TerminalSignalResult,
} from '@deepseek-ai/dsh-terminal';
import type SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy';
import type { ClientChannel } from 'ssh2';
import type { SshConnectionManager } from './connection.js';
import type { RemotePathResolver } from './runtime-router.js';
import { parseSshUri } from './types.js';

/** Output silence before a send is considered idle. */
const IDLE_MS = 3_000;
/** Hard deadline for one send (matches the local backend's timeout shape). */
const TIMEOUT_MS = 30_000;
/** Bounded retained scrollback and per-send output, measured as UTF-8 bytes. */
const OUTPUT_MAX_BYTES = 64 * 1024;
/** Graceful channel-close bound before force-destroying the SSH channel. */
const CLOSE_DEADLINE_MS = 3_000;
/** Short final join after destroy; a transport that never closes then fails loud. */
const DESTROY_JOIN_MS = 1_000;
/** Long-poll duration used by the helper output pump. */
const HELPER_READ_WAIT_MS = 1_000;
/** Transport deadline around a helper long-poll. */
const HELPER_READ_TIMEOUT_MS = 6_000;
/** Safe retries for an interrupted, non-mutating output read. */
const HELPER_READ_RETRIES = 5;
const HELPER_RETRY_DELAY_MS = 100;
/** Bound for ordinary helper mutations. */
const HELPER_MUTATION_TIMEOUT_MS = 30_000;
const HELPER_INPUT_CHUNK_BYTES = 192 * 1024;
/** Default terminal geometry until DSH exposes resize in its terminal seam. */
const DEFAULT_ROWS = 24;
const DEFAULT_COLS = 80;

/** Minimal RPC client surface consumed by the terminal backend. */
export interface RemoteHelperClient {
  readonly hello?: { platform?: { shell?: string } };
  call<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: {
      signal?: AbortSignal;
      timeoutMs?: number;
      mutation?: boolean;
    },
  ): Promise<T>;
}

/** Structural provider implemented by the helper manager. */
export interface RemoteHelperProvider {
  client(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient>;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/** Keep a valid UTF-8 tail no larger than maxBytes. */
function utf8Tail(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) return { text, truncated: false };
  let start = bytes.length - maxBytes;
  // Never decode from the middle of a multi-byte code point.
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return { text: bytes.subarray(start).toString('utf8'), truncated: true };
}

class BoundedTextBuffer {
  private value = '';
  private dropped = false;

  constructor(private readonly maxBytes: number) {}

  append(text: string): void {
    if (text.length === 0) return;
    const bounded = utf8Tail(this.value + text, this.maxBytes);
    this.value = bounded.text;
    this.dropped ||= bounded.truncated;
  }

  markTruncated(): void {
    this.dropped = true;
  }

  snapshot(): { text: string; truncated: boolean } {
    return { text: this.value, truncated: this.dropped };
  }

  consume(): { text: string; truncated: boolean } {
    const snapshot = this.snapshot();
    this.value = '';
    this.dropped = false;
    return snapshot;
  }
}

function posixShellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Race one unpublished setup operation against its owner signal. */
function raceAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = (): void => {
      finish(() => reject(signal.reason ?? new Error('remote terminal setup aborted')));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      value => finish(() => resolve(value)),
      reason => finish(() => reject(reason)),
    );
  });
}

function waitBounded(operation: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    void operation.then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * An allocated channel that never became a session still needs the same
 * bounded graceful-close/destroy lifecycle as a published terminal. Keep an
 * error listener installed while retiring it so a late transport error cannot
 * become an unhandled EventEmitter error.
 */
async function retireUnpublishedChannel(channel: ClientChannel): Promise<void> {
  let closeObserved = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const onClose = (): void => {
    if (closeObserved) return;
    closeObserved = true;
    resolveClosed();
  };
  const onError = (): void => {
    // Cleanup is best effort; the setup/cancellation error remains primary.
  };
  channel.on('close', onClose);
  channel.on('error', onError);
  let endFailed = false;
  try {
    try {
      channel.end();
    } catch {
      endFailed = true;
    }
    if (!endFailed && await waitBounded(closed, CLOSE_DEADLINE_MS)) return;
    try {
      channel.destroy();
    } catch {
      return;
    }
    await waitBounded(closed, DESTROY_JOIN_MS);
  } finally {
    channel.removeListener('close', onClose);
    channel.removeListener('error', onError);
  }
}

/** One live send over the ssh2 shell channel. */
class RemoteSendOperation implements TerminalSendOperation {
  readonly done: Promise<TerminalSendResult>;
  private readonly viewport = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
  private readonly unread = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
  private settled = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private removeAbort: (() => void) | undefined;
  private idleArmed = false;
  private resolveDone!: (value: TerminalSendResult) => void;
  private rejectDone!: (error: Error) => void;

  constructor(
    private readonly onCancel: () => void,
    private readonly onSettle: () => void,
    private readonly getSessionStatus: () => TerminalSessionStatus,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    this.done = new Promise<TerminalSendResult>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    if (signal !== undefined) {
      const onAbort = (): void => { this.cancel(); };
      signal.addEventListener('abort', onAbort, { once: true });
      this.removeAbort = () => signal.removeEventListener('abort', onAbort);
    }
    this.deadlineTimer = setTimeout(() => this.settle('timeout'), TIMEOUT_MS);
  }

  armIdle(): void {
    if (this.settled || this.idleArmed) return;
    this.idleArmed = true;
    this.resetIdle();
  }

  markTruncated(): void {
    if (this.settled) return;
    this.viewport.markTruncated();
    this.unread.markTruncated();
  }

  append(text: string): void {
    if (this.settled) return;
    this.viewport.append(text);
    this.unread.append(text);
    if (this.idleArmed) this.resetIdle();
  }

  private resetIdle(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.settle('inferred_idle'), IDLE_MS);
  }

  readOutput(): { delta: string; truncated: boolean } {
    const read = this.unread.consume();
    return { delta: read.text, truncated: read.truncated };
  }

  settle(waitReason: TerminalSendResult['waitReason']): void {
    if (!this.finish()) return;
    const output = this.viewport.snapshot();
    this.resolveDone({
      viewport: output.text,
      waitReason,
      sessionStatus: this.getSessionStatus(),
      truncated: output.truncated,
    });
  }

  fail(reason: unknown): void {
    if (!this.finish()) return;
    this.rejectDone(asError(reason));
  }

  cancel(): boolean {
    if (this.settled) return false;
    try {
      this.onCancel();
    } catch (error) {
      this.fail(error);
    }
    return true;
  }

  private finish(): boolean {
    if (this.settled) return false;
    this.settled = true;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    if (this.deadlineTimer !== undefined) clearTimeout(this.deadlineTimer);
    this.idleTimer = undefined;
    this.deadlineTimer = undefined;
    this.removeAbort?.();
    this.removeAbort = undefined;
    this.onSettle();
    return true;
  }
}

function normalizeExitSignal(signal: string | undefined): NodeJS.Signals | null {
  if (!signal) return null;
  return (signal.startsWith('SIG') ? signal : `SIG${signal}`) as NodeJS.Signals;
}

type RemoteSandboxPolicy = ReturnType<SandboxPolicyService['resolve']>;

interface HelperWorkspaceOpenResult {
  workspaceId: string;
  path: string;
  access: RemoteSandboxPolicy['mode'];
}

interface HelperProcessStartResult {
  processId: string;
  pid: number;
  pgid: number;
  tty: boolean;
  running: boolean;
  exitCode: number | null;
  signal: string | null;
  latestSeq: string;
}

interface HelperProcessChunk {
  seq: string;
  stream: 'stdout' | 'stderr' | 'pty';
  data: string;
}

interface HelperProcessReadResult {
  chunks: HelperProcessChunk[];
  earliestSeq: string;
  nextSeq: string;
  truncated: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: string | null;
}

interface HelperForegroundResult {
  pgid: number;
  verified: boolean;
}

interface HelperProcessStatusResult {
  running: boolean;
  exitCode: number | null;
  signal: string | null;
}

function helperTerminalIds(sessionId: string): {
  workspaceId: string;
  processId: string;
  workspaceOpenOperationId: string;
  workspaceCloseOperationId: string;
  processStartOperationId: string;
} {
  const digest = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
  return {
    workspaceId: `term-ws-${digest}`,
    processId: `term-proc-${digest}`,
    workspaceOpenOperationId: `term-ws-open-${digest}`,
    workspaceCloseOperationId: `term-ws-close-${digest}`,
    processStartOperationId: `term-start-${digest}`,
  };
}

function stableHelperOperationId(kind: string, identity: string): string {
  const digest = createHash('sha256').update(`${kind}\0${identity}`).digest('hex').slice(0, 32);
  return `term-${kind}-${digest}`;
}

function assertNonEmptyHelperId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`remote helper returned an invalid ${label}`);
  }
}

function isAlreadyCleanHelperError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'E_UNKNOWN_PROCESS' || code === 'E_UNKNOWN_WORKSPACE';
}

function recordCleanupFailure(failures: Error[], error: unknown): void {
  if (!isAlreadyCleanHelperError(error)) failures.push(asError(error));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRemoteDescendant(root: string, child: string): { contained: boolean; relative: string } {
  const relative = posix.relative(root, child);
  return {
    contained: relative === ''
      || (relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative)),
    relative: relative || '.',
  };
}

function sameSshAuthority(
  left: ReturnType<typeof parseSshUri>,
  right: ReturnType<typeof parseSshUri>,
): boolean {
  return left.host === right.host && left.port === right.port && left.user === right.user;
}

function readStatus(result: Pick<HelperProcessReadResult, 'exitCode' | 'signal'>): TerminalSessionStatus {
  return {
    kind: 'exited',
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : null,
    signal: normalizeExitSignal(result.signal ?? undefined),
  };
}

function decodeHelperChunk(chunk: HelperProcessChunk): Uint8Array {
  if (typeof chunk !== 'object' || chunk === null || typeof chunk.data !== 'string') {
    throw new Error('remote helper returned a malformed process output chunk');
  }
  if (chunk.stream !== 'pty' && chunk.stream !== 'stdout' && chunk.stream !== 'stderr') {
    throw new Error(`remote helper returned an invalid process output stream: ${String(chunk.stream)}`);
  }
  return Buffer.from(chunk.data, 'base64');
}

/** A helper-owned PTY process with a continuously drained bounded output tail. */
export class RemoteHelperTerminalBackendSession implements TerminalBackendSession {
  readonly motd = '';
  readonly pid: number;

  private readonly scrollback = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
  private readonly pumpController = new AbortController();
  private readonly pumpDone: Promise<void>;
  private statusValue: TerminalSessionStatus;
  private active: RemoteSendOperation | undefined;
  private afterSeq: string | undefined;
  private closing = false;
  private closePromise: Promise<void> | undefined;
  private pumpFailure: Error | undefined;
  private remoteExited: boolean;
  private decoder = new TextDecoder();
  private mutationSequence = 0;

  constructor(
    private readonly helpers: RemoteHelperProvider,
    private readonly uri: string,
    private readonly workspaceId: string,
    private readonly workspaceCloseOperationId: string,
    private readonly processId: string,
    started: HelperProcessStartResult,
    private readonly onClosed: () => void = () => {},
  ) {
    assertNonEmptyHelperId(processId, 'process id');
    if (!Number.isSafeInteger(started.pid) || started.pid <= 0) {
      throw new Error(`remote helper returned an invalid terminal pid: ${String(started.pid)}`);
    }
    this.pid = started.pid;
    // A newly published session owns the complete retained helper stream,
    // including prompt bytes emitted before process/start returned.
    this.afterSeq = undefined;
    this.statusValue = started.running
      ? { kind: 'running' }
      : readStatus(started);
    this.remoteExited = !started.running;
    this.pumpDone = this.pumpOutput();
  }

  startSend(request: TerminalSendRequest): TerminalSendOperation {
    if (this.closing || this.statusValue.kind === 'exited') throw new Error('PTY session has exited');
    if (this.pumpFailure !== undefined) throw this.pumpFailure;
    if (this.active !== undefined) throw new Error('PTY session already has an active send');
    request.signal?.throwIfAborted();
    let operation!: RemoteSendOperation;
    operation = new RemoteSendOperation(
      () => {
        void this.signalForeground('SIGINT').catch((error: unknown) => operation.fail(error));
      },
      () => {
        if (this.active === operation) this.active = undefined;
      },
      () => this.statusValue,
      request.signal,
    );
    this.active = operation;
    // The helper owns a real POSIX PTY, whose line discipline consumes LF as
    // the portable Enter sequence. A bare CR worked with ssh2's channel
    // translation but can leave a helper shell waiting without executing.
    const data = `${request.text}${request.submit ? '\n' : ''}`;
    if (data.length > 0) {
      void this.writeInput(data, request.signal).then(
        () => operation.armIdle(),
        (error: unknown) => {
          operation.armIdle();
          if (request.signal?.aborted !== true) operation.fail(error);
        },
      );
    } else operation.armIdle();
    return operation;
  }

  read(request: TerminalReadRequest): TerminalReadResult {
    const offset = request.offset ?? 0;
    const count = request.count ?? 500;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('PTY read offset must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error('PTY read count must be a positive safe integer');
    }
    const snapshot = this.scrollback.snapshot();
    const lines = snapshot.text.length === 0 ? [] : snapshot.text.split('\n');
    const totalLines = lines.length;
    if (offset >= totalLines) {
      return { text: '', totalLines, lineBegin: offset, lineEnd: offset, truncated: snapshot.truncated };
    }
    const end = totalLines - offset;
    const start = Math.max(0, end - count);
    const text = lines.slice(start, end).join('\n');
    const returnedLines = text.length === 0 ? 0 : text.split('\n').length;
    return {
      text,
      totalLines,
      lineBegin: offset,
      lineEnd: offset + returnedLines,
      truncated: snapshot.truncated,
    };
  }

  async signal(signal: TerminalSignal): Promise<TerminalSignalResult> {
    if (this.closing || this.statusValue.kind === 'exited') throw new Error('PTY session has exited');
    const targetPgid = await this.signalForeground(signal);
    return { delivered: true, targetPgid };
  }

  status(): TerminalSessionStatus {
    return this.statusValue;
  }

  /** Helper support exists ahead of the rc.2 terminal seam's model-facing resize verb. */
  async resize(rows: number, cols: number): Promise<void> {
    if (!Number.isSafeInteger(rows) || rows <= 0 || !Number.isSafeInteger(cols) || cols <= 0) {
      throw new Error('PTY dimensions must be positive safe integers');
    }
    if (this.closing || this.statusValue.kind === 'exited') throw new Error('PTY session has exited');
    await this.call(
      'process/resize',
      { processId: this.processId, operationId: this.nextOperationId('resize'), rows, cols },
      { timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true },
    );
  }

  close(_reason: string): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.closing = true;
    this.pumpController.abort(new Error('remote terminal is closing'));
    if (this.statusValue.kind === 'running') {
      this.statusValue = { kind: 'exited', exitCode: null, signal: null };
    }
    this.active?.settle('session_exit');
    const closing = this.closeOnce()
      .finally(() => this.onClosed())
      .catch((error: unknown) => {
        if (this.closePromise === closing) this.closePromise = undefined;
        throw error;
      });
    this.closePromise = closing;
    return closing;
  }

  private async signalForeground(signal: TerminalSignal): Promise<number> {
    const foreground = await this.call<HelperForegroundResult>(
      'process/inspectForeground',
      { processId: this.processId },
      { timeoutMs: HELPER_MUTATION_TIMEOUT_MS },
    );
    if (foreground.verified !== true
      || !Number.isSafeInteger(foreground.pgid)
      || foreground.pgid <= 1) {
      throw new Error(`remote helper cannot verify a foreground process group for ${signal}`);
    }
    await this.call(
      'process/signal',
      {
        processId: this.processId,
        operationId: this.nextOperationId('signal'),
        signal,
        target: 'foreground',
      },
      { timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true },
    );
    return foreground.pgid;
  }

  private async writeInput(text: string, signal?: AbortSignal): Promise<void> {
    const data = Buffer.from(text, 'utf8');
    for (let offset = 0; offset < data.length; offset += HELPER_INPUT_CHUNK_BYTES) {
      signal?.throwIfAborted();
      const chunk = data.subarray(offset, Math.min(data.length, offset + HELPER_INPUT_CHUNK_BYTES));
      const result = await this.call<{ written: number }>(
        'process/write',
        {
          processId: this.processId,
          operationId: this.nextOperationId('write'),
          data: chunk.toString('base64'),
          encoding: 'base64',
        },
        { signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true },
      );
      if (result.written !== chunk.length) {
        throw new Error(`remote helper accepted ${result.written} of ${chunk.length} terminal input bytes`);
      }
    }
  }

  private async pumpOutput(): Promise<void> {
    try {
      let consecutiveFailures = 0;
      while (!this.pumpController.signal.aborted && this.statusValue.kind === 'running') {
        let result: HelperProcessReadResult;
        try {
          result = await this.call<HelperProcessReadResult>(
            'process/read',
            {
              processId: this.processId,
              ...(this.afterSeq === undefined ? {} : { afterSeq: this.afterSeq }),
              maxBytes: OUTPUT_MAX_BYTES,
              waitMs: HELPER_READ_WAIT_MS,
            },
            { signal: this.pumpController.signal, timeoutMs: HELPER_READ_TIMEOUT_MS },
          );
          consecutiveFailures = 0;
        } catch (error: unknown) {
          if (this.pumpController.signal.aborted) throw error;
          consecutiveFailures += 1;
          if (consecutiveFailures > HELPER_READ_RETRIES) throw error;
          await abortableDelay(HELPER_RETRY_DELAY_MS * consecutiveFailures, this.pumpController.signal);
          continue;
        }
        if (!Array.isArray(result.chunks) || typeof result.nextSeq !== 'string') {
          throw new Error('remote helper returned a malformed process/read result');
        }
        this.afterSeq = result.nextSeq;
        if (result.truncated) {
          this.appendOutput(this.decoder.decode());
          this.decoder = new TextDecoder();
          this.scrollback.markTruncated();
          this.active?.markTruncated();
        }
        for (const chunk of result.chunks) {
          this.appendOutput(this.decoder.decode(decodeHelperChunk(chunk), { stream: true }));
        }
        if (result.exited) {
          this.appendOutput(this.decoder.decode());
          this.remoteExited = true;
          this.statusValue = readStatus(result);
          this.active?.settle('session_exit');
          return;
        }
      }
    } catch (error: unknown) {
      if (this.closing && this.pumpController.signal.aborted) return;
      const failure = asError(error);
      this.pumpFailure = failure;
      this.statusValue = { kind: 'exited', exitCode: null, signal: null };
      this.active?.fail(failure);
    }
  }

  private async closeOnce(): Promise<void> {
    const failures: Error[] = [];
    if (!await waitBounded(this.pumpDone, DESTROY_JOIN_MS)) {
      failures.push(new Error('remote helper terminal output pump did not stop after cancellation'));
    }

    let terminated = this.remoteExited;
    if (!terminated) {
      try {
        const requested = await this.call<{ running: boolean }>(
          'process/terminate',
          {
            processId: this.processId,
            operationId: stableHelperOperationId('terminate-grace', this.processId),
            force: false,
            graceMs: CLOSE_DEADLINE_MS,
          },
          { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
        );
        terminated = requested.running === false || await this.waitForRemoteExit(CLOSE_DEADLINE_MS);
      } catch (error: unknown) {
        terminated = isAlreadyCleanHelperError(error);
        this.remoteExited ||= terminated;
      }
      if (!terminated) {
        try {
          await this.call(
            'process/terminate',
            {
              processId: this.processId,
              operationId: stableHelperOperationId('terminate-force', this.processId),
              force: true,
            },
            { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
          );
          terminated = true;
          this.remoteExited = true;
        } catch (error: unknown) {
          failures.push(asError(error));
        }
      }
    }
    let released = false;
    if (terminated) {
      try {
        await this.call(
          'process/release',
          {
            processId: this.processId,
            operationId: stableHelperOperationId('release', this.processId),
          },
          { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
        );
        released = true;
      } catch (error: unknown) {
        if (isAlreadyCleanHelperError(error)) released = true;
        else failures.push(asError(error));
      }
    }
    if (released) {
      try {
        await this.call(
          'workspace/close',
          { workspaceId: this.workspaceId, operationId: this.workspaceCloseOperationId },
          { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
        );
      } catch (error: unknown) {
        recordCleanupFailure(failures, error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'remote helper terminal cleanup failed');
  }

  private async call<T>(
    method: string,
    params: Record<string, unknown>,
    options: { signal?: AbortSignal; timeoutMs?: number; mutation?: boolean },
  ): Promise<T> {
    const client = await this.helpers.client(this.uri, options.signal);
    return client.call<T>(method, params, options);
  }

  private appendOutput(text: string): void {
    if (text.length === 0) return;
    this.scrollback.append(text);
    this.active?.append(text);
  }

  private async waitForRemoteExit(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.call<HelperProcessStatusResult>(
        'process/status',
        { processId: this.processId },
        { timeoutMs: Math.max(1, Math.min(HELPER_READ_TIMEOUT_MS, deadline - Date.now())) },
      );
      if (status.running !== true) {
        this.remoteExited = true;
        this.statusValue = readStatus(status);
        return true;
      }
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    }
    return false;
  }

  private nextOperationId(kind: string): string {
    this.mutationSequence += 1;
    return stableHelperOperationId(`${kind}-${this.mutationSequence}`, this.processId);
  }
}

/** Helper-backed `ssh` backend used by default. */
export class RemoteTerminalBackend implements TerminalBackend {
  readonly type = 'ssh';
  private readonly sessions = new Set<RemoteHelperTerminalBackendSession>();
  private readonly helpers: RemoteHelperProvider;
  private readonly resolveRemotePath: RemotePathResolver;
  private readonly sandboxPolicy: Pick<SandboxPolicyService, 'resolve'> | undefined;

  constructor(
    helpers: RemoteHelperProvider | SshConnectionManager,
    resolveRemotePath: RemotePathResolver,
    sandboxPolicy?: Pick<SandboxPolicyService, 'resolve'>,
  ) {
    this.helpers = helpers as RemoteHelperProvider;
    this.resolveRemotePath = resolveRemotePath;
    this.sandboxPolicy = sandboxPolicy;
  }

  async spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession> {
    spec.signal?.throwIfAborted();
    if (this.sandboxPolicy === undefined || typeof this.helpers.client !== 'function') {
      throw new Error(
        'remote terminal helper backend is not wired; use LegacySsh2RemoteTerminalBackend explicitly for compatibility',
      );
    }
    const cwdUri = this.remoteUri(spec.cwd);
    if (cwdUri === undefined) throw new Error('remote terminal requires an SSH cwd');
    const policy = this.sandboxPolicy.resolve({ session: spec.owner.session });
    const workspaceUri = this.remoteUri(policy.workspaceRoot);
    if (workspaceUri === undefined) {
      throw new Error('remote terminal sandbox root is not mapped to an SSH workspace');
    }
    const cwd = parseSshUri(cwdUri);
    const workspace = parseSshUri(workspaceUri);
    if (!sameSshAuthority(cwd, workspace)) {
      throw new Error('remote terminal cwd and sandbox root belong to different SSH hosts');
    }
    const containment = isRemoteDescendant(workspace.path, cwd.path);
    if (!containment.contained) {
      throw new Error('remote terminal cwd lies outside its sandbox workspace');
    }

    const ids = helperTerminalIds(String(spec.sessionId));
    let workspaceOpenAttempted = false;
    let openedWorkspaceId = ids.workspaceId;
    let started: HelperProcessStartResult | undefined;
    try {
      const client = await this.helpers.client(cwdUri, spec.signal);
      spec.signal?.throwIfAborted();
      const loginShell = client.hello?.platform?.shell;
      const terminalArgv = typeof loginShell === 'string' && loginShell.startsWith('/')
        ? [loginShell, '-l']
        : ['/bin/sh', '-i'];
      workspaceOpenAttempted = true;
      const opened = await client.call<HelperWorkspaceOpenResult>(
        'workspace/open',
        {
          path: workspace.path,
          access: policy.mode,
          workspaceId: ids.workspaceId,
          operationId: ids.workspaceOpenOperationId,
        },
        { signal: spec.signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true },
      );
      assertNonEmptyHelperId(opened.workspaceId, 'workspace id');
      openedWorkspaceId = opened.workspaceId;
      started = await client.call<HelperProcessStartResult>(
        'process/start',
        {
          workspaceId: openedWorkspaceId,
          cwd: containment.relative,
          argv: terminalArgv,
          env: { TERM: 'xterm-256color' },
          processId: ids.processId,
          operationId: ids.processStartOperationId,
          tty: { rows: DEFAULT_ROWS, cols: DEFAULT_COLS, term: 'xterm-256color' },
        },
        { signal: spec.signal, timeoutMs: HELPER_MUTATION_TIMEOUT_MS, mutation: true },
      );
      assertNonEmptyHelperId(started.processId, 'process id');
      spec.signal?.throwIfAborted();
      let session!: RemoteHelperTerminalBackendSession;
      session = new RemoteHelperTerminalBackendSession(
        this.helpers,
        cwdUri,
        openedWorkspaceId,
        ids.workspaceCloseOperationId,
        started.processId,
        started,
        () => this.sessions.delete(session),
      );
      this.sessions.add(session);
      return session;
    } catch (error: unknown) {
      if (!workspaceOpenAttempted) throw error;
      try {
        await rollbackHelperProcess(
          this.helpers,
          cwdUri,
          openedWorkspaceId,
          ids.workspaceCloseOperationId,
          started?.processId && started.processId.length > 0 ? started.processId : ids.processId,
        );
      } catch (cleanupError: unknown) {
        throw new TerminalBackendCleanupError(error, cleanupError);
      }
      throw error;
    }
  }

  private remoteUri(path: string | undefined): string | undefined {
    if (path === undefined) return undefined;
    return path.startsWith('ssh://') ? path : this.resolveRemotePath(path);
  }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions];
    const results = await Promise.allSettled(sessions.map(session => session.close('remote backend disposed')));
    this.sessions.clear();
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'remote terminal backend cleanup failed');
  }
}

async function rollbackHelperProcess(
  helpers: RemoteHelperProvider,
  uri: string,
  workspaceId: string,
  workspaceCloseOperationId: string,
  processId: string,
): Promise<void> {
  const failures: Error[] = [];
  try {
    const client = await helpers.client(uri);
    await client.call(
      'process/terminate',
      { processId, operationId: stableHelperOperationId('rollback-terminate', processId), force: true },
      { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
    );
  } catch (error: unknown) {
    recordCleanupFailure(failures, error);
  }
  try {
    const client = await helpers.client(uri);
    await client.call(
      'process/release',
      { processId, operationId: stableHelperOperationId('rollback-release', processId) },
      { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
    );
  } catch (error: unknown) {
    recordCleanupFailure(failures, error);
  }
  try {
    const client = await helpers.client(uri);
    await client.call(
      'workspace/close',
      { workspaceId, operationId: workspaceCloseOperationId },
      { timeoutMs: CLOSE_DEADLINE_MS, mutation: true },
    );
  } catch (error: unknown) {
    recordCleanupFailure(failures, error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'remote helper terminal rollback failed');
}

/** Backend-owned compatibility ssh2 PTY session. */
class LegacySsh2TerminalBackendSession implements TerminalBackendSession {
  motd = '';
  pid = undefined as number | undefined;
  private readonly scrollback = new BoundedTextBuffer(OUTPUT_MAX_BYTES);
  private statusValue: TerminalSessionStatus = { kind: 'running' };
  private active: RemoteSendOperation | undefined;
  private closing = false;
  private closeObserved = false;
  private closePromise: Promise<void> | undefined;
  private readonly closed: Promise<void>;
  private resolveClosed!: () => void;

  constructor(private readonly channel: ClientChannel) {
    this.closed = new Promise<void>((resolve) => { this.resolveClosed = resolve; });
    channel.on('data', this.onData);
    channel.on('exit', this.onExit);
    channel.on('close', this.onClose);
    channel.on('error', this.onError);
  }

  /** Queue the initial cwd change after all channel listeners are installed. */
  enterDirectory(path: string): void {
    if (!path.startsWith('/')) throw new Error(`remote terminal cwd must be absolute: ${path}`);
    this.channel.write(`cd ${posixShellQuote(path)} || exit $?\r`);
  }

  private readonly onData = (data: Buffer | Uint8Array | string): void => {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    this.scrollback.append(text);
    this.active?.append(text);
  };

  private readonly onExit = (code: number | null, signal?: string): void => {
    this.statusValue = typeof code === 'number'
      ? { kind: 'exited', exitCode: code, signal: null }
      : { kind: 'exited', exitCode: null, signal: normalizeExitSignal(signal) };
  };

  private readonly onError = (error: Error): void => {
    if (this.statusValue.kind === 'running') {
      this.statusValue = { kind: 'exited', exitCode: null, signal: null };
    }
    this.closing = true;
    this.active?.fail(error);
  };

  private readonly onClose = (): void => {
    if (this.closeObserved) return;
    this.closeObserved = true;
    this.closing = true;
    if (this.statusValue.kind === 'running') {
      this.statusValue = { kind: 'exited', exitCode: null, signal: null };
    }
    this.active?.settle('session_exit');
    this.resolveClosed();
    this.channel.removeListener('data', this.onData);
    this.channel.removeListener('exit', this.onExit);
    this.channel.removeListener('close', this.onClose);
    this.channel.removeListener('error', this.onError);
  };

  startSend(request: TerminalSendRequest): TerminalSendOperation {
    if (this.closing || this.statusValue.kind === 'exited') throw new Error('PTY session has exited');
    if (this.active !== undefined) throw new Error('PTY session already has an active send');
    request.signal?.throwIfAborted();
    const operation = new RemoteSendOperation(
      () => this.channel.signal('INT'),
      () => {
        if (this.active === operation) this.active = undefined;
      },
      () => this.statusValue,
      request.signal,
    );
    this.active = operation;
    try {
      if (request.text) this.channel.write(request.text);
      if (request.submit) this.channel.write('\r');
    } catch (error) {
      operation.fail(error);
    }
    operation.armIdle();
    return operation;
  }

  read(request: TerminalReadRequest): TerminalReadResult {
    const offset = request.offset ?? 0;
    const count = request.count ?? 500;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('PTY read offset must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error('PTY read count must be a positive safe integer');
    }
    const snapshot = this.scrollback.snapshot();
    const lines = snapshot.text.length === 0 ? [] : snapshot.text.split('\n');
    const totalLines = lines.length;
    if (offset >= totalLines) {
      return { text: '', totalLines, lineBegin: offset, lineEnd: offset, truncated: snapshot.truncated };
    }
    const end = totalLines - offset;
    const start = Math.max(0, end - count);
    const text = lines.slice(start, end).join('\n');
    const returnedLines = text.length === 0 ? 0 : text.split('\n').length;
    return {
      text,
      totalLines,
      lineBegin: offset,
      lineEnd: offset + returnedLines,
      truncated: snapshot.truncated,
    };
  }

  async signal(signal: TerminalSignal): Promise<TerminalSignalResult> {
    if (this.closing || this.statusValue.kind === 'exited') throw new Error('PTY session has exited');
    throw new Error(
      `remote SSH PTY cannot verify a foreground process group for ${signal}; `
      + 'explicit terminal_signal requires the Phase 2 remote helper',
    );
  }

  status(): TerminalSessionStatus {
    return this.statusValue;
  }

  close(_reason: string): Promise<void> {
    if (this.closeObserved) return Promise.resolve();
    if (this.closePromise !== undefined) return this.closePromise;
    this.closing = true;
    if (this.statusValue.kind === 'running') {
      this.statusValue = { kind: 'exited', exitCode: null, signal: null };
    }
    const closing = this.closeOnce().catch((error: unknown) => {
      if (this.closePromise === closing) this.closePromise = undefined;
      throw error;
    });
    this.closePromise = closing;
    return closing;
  }

  private async closeOnce(): Promise<void> {
    try {
      this.channel.end();
    } catch (error) {
      this.active?.fail(error);
      this.channel.destroy();
      throw error;
    }
    if (await this.waitForClose(CLOSE_DEADLINE_MS)) return;
    this.channel.destroy();
    if (await this.waitForClose(DESTROY_JOIN_MS)) return;
    const error = new Error(`remote PTY channel did not close within ${CLOSE_DEADLINE_MS + DESTROY_JOIN_MS}ms`);
    this.active?.fail(error);
    throw error;
  }

  private waitForClose(timeoutMs: number): Promise<boolean> {
    if (this.closeObserved) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);
      void this.closed.then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      });
    });
  }
}

/**
 * Compatibility backend that opens a raw ssh2 login shell. It does not provide
 * helper-backed sandboxing or verified foreground-process signalling and must
 * therefore be selected explicitly by legacy compositions.
 */
export class LegacySsh2RemoteTerminalBackend implements TerminalBackend {
  readonly type = 'ssh';

  constructor(
    private readonly connections: SshConnectionManager,
    private readonly resolveRemotePath: RemotePathResolver,
  ) {}

  async spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession> {
    spec.signal?.throwIfAborted();
    const cwd = spec.cwd;
    const uri = cwd !== undefined && cwd.startsWith('ssh://')
      ? cwd
      : cwd !== undefined
        ? this.resolveRemotePath(cwd)
        : undefined;
    if (uri === undefined) throw new Error('remote terminal requires an SSH cwd');
    const parsed = parseSshUri(uri);
    const transport = await raceAbort(this.connections.transport(uri), spec.signal);
    spec.signal?.throwIfAborted();
    const shell = transport.shell({ cols: 80, rows: 24 });
    let channel: ClientChannel;
    try {
      channel = await raceAbort(shell, spec.signal);
    } catch (error) {
      // Allocation may finish after cancellation won the race; retire that
      // unpublished channel instead of leaking it into the transport pool.
      if (spec.signal?.aborted === true) {
        void shell.then((lateChannel) => {
          void retireUnpublishedChannel(lateChannel);
        }, () => {});
      }
      throw error;
    }
    try {
      spec.signal?.throwIfAborted();
      const session = new LegacySsh2TerminalBackendSession(channel);
      session.enterDirectory(parsed.path);
      return session;
    } catch (error) {
      await retireUnpublishedChannel(channel);
      throw error;
    }
  }
}

/** Explicit short name for the compatibility backend. */
export { LegacySsh2RemoteTerminalBackend as Ssh2RemoteTerminalBackend };
