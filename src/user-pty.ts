import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type {
  SubprocessOutcome,
  SubprocessTerminalActivity,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemoteHelperClient, RemoteHelperSessionCallOptions } from './helper/rpc-client.js';
import { parseSshUri } from './types.js';

const READ_BYTES = 64 * 1024;
const INPUT_CHUNK_BYTES = 64 * 1024;
const MAX_QUEUED_INPUT = 1024 * 1024;
const MAX_QUEUED_WRITES = 128;
const MAX_QUEUED_RESIZES = 8;
const READ_WAIT_MS = 500;

interface ProcessStatus {
  pid: number;
  processId: string;
  running: boolean;
  exitCode: number | null;
  signal: string | number | null;
}

interface ProcessRead {
  chunks: Array<{ seq: string; stream: string; data: string }>;
  nextSeq: string;
  truncated: boolean;
  exited: boolean;
  exitCode: number | null;
  signal: string | number | null;
}

interface Allocation {
  uri: string;
  workspaceId: string;
  processId: string;
  sessionId: string;
  client: RemoteHelperClient;
}

/** The router retains this retryable owner when unpublished cleanup fails. */
export class RemoteUserTerminalAllocationError extends AggregateError {
  constructor(spawnError: unknown, cleanupError: unknown, readonly retryCleanup: () => Promise<void>) {
    super([spawnError, cleanupError], 'remote user terminal allocation cleanup failed');
    this.name = 'RemoteUserTerminalAllocationError';
  }
}

/** Human terminals deliberately use the SSH user's permissions, like DSH's local user terminal. */
export async function openRemoteUserTerminal(
  uri: string,
  spec: SubprocessTerminalSpawnSpec,
  helpers: RemoteHelperProvider,
  onClosed: (terminal: RemoteUserTerminal) => void = () => {},
): Promise<RemoteUserTerminal> {
  validateSpawn(spec);
  spec.signal?.throwIfAborted();
  const parsed = parseSshUri(uri);
  const client = await helpers.client(uri, spec.signal);
  if (!supports(client, 'process', 'sequencedWrite') || !supports(client, 'pty', 'sequencedResize')) {
    throw new Error('remote helper does not support sequenced terminal input and resize; reconnect with the current plugin');
  }
  const allocation: Allocation = { uri, workspaceId: randomUUID(), processId: randomUUID(), sessionId: client.sessionId, client };
  let attempted = false;
  try {
    attempted = true;
    await allocationCall(allocation, 'workspace/open', {
      path: '/', access: 'danger-full-access', workspaceId: allocation.workspaceId,
      operationId: allocation.workspaceId,
    }, { signal: spec.signal, timeoutMs: 20_000, mutation: true });
    spec.signal?.throwIfAborted();
    const started = await allocationCall<ProcessStatus>(allocation, 'process/start', {
      workspaceId: allocation.workspaceId, processId: allocation.processId, operationId: allocation.processId,
      cwd: parsed.path.replace(/^\/+/, ''), argv: [...spec.argv],
      env: { ...spec.env, TERM: spec.terminalType }, stdin: 'pipe',
      tty: { rows: spec.rows, cols: spec.cols, term: spec.terminalType },
    }, { signal: spec.signal, timeoutMs: 30_000, mutation: true });
    if (started.processId !== allocation.processId || !Number.isSafeInteger(started.pid) || started.pid <= 0) {
      throw new Error('remote helper returned an invalid user terminal process');
    }
    spec.signal?.throwIfAborted();
    await allocationCall(allocation, 'workspace/close', {
      workspaceId: allocation.workspaceId, operationId: `close:${allocation.workspaceId}`,
    }, { timeoutMs: 5_000, mutation: true });
    spec.signal?.throwIfAborted();
    return new RemoteUserTerminal(helpers, allocation, started, spec.graceMs, onClosed);
  } catch (error) {
    if (!attempted) throw error;
    try { await rollback(helpers, allocation); }
    catch (cleanupError) { throw new RemoteUserTerminalAllocationError(error, cleanupError, () => rollback(helpers, allocation)); }
    throw error;
  }
}

/**
 * Raw helper PTY handle consumed by the OFFICIAL human TerminalController.
 * That controller owns session authorization, exclusive input attachments,
 * xterm screen recovery, UI retention, and input limits; this owns remote I/O.
 */
export class RemoteUserTerminal implements SubprocessTerminalHandle {
  readonly output = new PassThrough({ highWaterMark: READ_BYTES });
  readonly done: Promise<SubprocessOutcome>;
  readonly pid: number;
  private readonly pumpLifetime = new AbortController();
  private readonly operationLifetime = new AbortController();
  private readonly statusLifetime = new AbortController();
  private readonly recoveryLifetime = new AbortController();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly pump: Promise<void>;
  private readonly outcomeWatch: Promise<void>;
  private inputTail: Promise<unknown> = Promise.resolve();
  private resizeTail: Promise<unknown> = Promise.resolve();
  private inputSeq = '0';
  private resizeSeq = '0';
  private inputFailure: Error | undefined;
  private resizeFailure: Error | undefined;
  private queuedInputBytes = 0;
  private queuedWrites = 0;
  private queuedResizes = 0;
  private cursor = '0';
  private revision = 0;
  private closing = false;
  private quiescent = false;
  private outcomeSettled = false;
  private cleanup: Promise<void> | undefined;
  private resolveOutcome!: (outcome: SubprocessOutcome) => void;
  private rejectOutcome!: (error: unknown) => void;

  constructor(
    private readonly helpers: RemoteHelperProvider,
    private readonly allocation: Allocation,
    started: ProcessStatus,
    private readonly graceMs: number,
    private readonly onClosed: (terminal: RemoteUserTerminal) => void,
  ) {
    this.pid = started.pid;
    this.done = new Promise((resolve, reject) => { this.resolveOutcome = resolve; this.rejectOutcome = reject; });
    // Consumers attach immediately after spawn; failures can still precede
    // their first microtask, so never emit an unhandled stream/promise error.
    this.output.on('error', () => {});
    void this.done.catch(() => {});
    if (!started.running) this.observeOutcome(started);
    this.pump = this.pumpOutput();
    this.outcomeWatch = this.watchOutcome();
  }

  write(data: string): Promise<void> {
    this.assertOpen();
    if (typeof data !== 'string') return Promise.reject(new TypeError('terminal input must be text'));
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes === 0) return Promise.resolve();
    if (this.queuedWrites >= MAX_QUEUED_WRITES) {
      return Promise.reject(new Error('remote terminal input queue exceeds 128 pending writes'));
    }
    if (bytes + this.queuedInputBytes > MAX_QUEUED_INPUT) {
      return Promise.reject(new Error('remote terminal queued input exceeds 1 MiB'));
    }
    this.queuedInputBytes += bytes; this.queuedWrites += 1; this.revision += 1;
    const operation = this.inputTail.catch(() => {}).then(async () => {
      this.assertOpen();
      if (this.inputFailure !== undefined) throw this.inputFailure;
      const buffer = Buffer.from(data, 'utf8');
      for (let offset = 0; offset < buffer.length; offset += INPUT_CHUNK_BYTES) {
        this.assertOpen();
        const chunk = buffer.subarray(offset, offset + INPUT_CHUNK_BYTES);
        const result = await this.call<{ written: number; nextSeq?: string }>('process/write', {
          processId: this.allocation.processId, operationId: randomUUID(), encoding: 'base64', data: chunk.toString('base64'),
          afterSeq: this.inputSeq,
        }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 10_000, waitForResume: true });
        if (result.written !== chunk.length) throw new Error('remote helper accepted incomplete terminal input');
        this.inputSeq = advanceSequence(this.inputSeq, result.nextSeq);
      }
    }).catch(error => {
      this.inputFailure ??= new Error('remote terminal input outcome is unresolved; close this terminal before sending more input', { cause: error });
      throw error;
    }).finally(() => { this.queuedInputBytes -= bytes; this.queuedWrites -= 1; });
    this.inputTail = operation;
    return this.track(operation);
  }

  resize(cols: number, rows: number): Promise<void> {
    this.assertOpen();
    validateDimensions(cols, rows);
    // A disconnected lane may wait for the full session retention period.
    // Bound promises as well as wire concurrency; rejected sizes were not
    // applied and callers may retry their latest geometry after recovery.
    if (this.queuedResizes >= MAX_QUEUED_RESIZES) {
      return Promise.reject(new Error('remote terminal resize queue exceeds 8 pending requests; retry the latest size'));
    }
    this.queuedResizes += 1; this.revision += 1;
    const operation = this.resizeTail.catch(() => {}).then(async () => {
      this.assertOpen();
      if (this.resizeFailure !== undefined) throw this.resizeFailure;
      const result = await this.call<{ nextSeq?: string }>('process/resize', {
        processId: this.allocation.processId, operationId: randomUUID(), cols, rows,
        afterSeq: this.resizeSeq,
      }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 5_000, waitForResume: true });
      this.resizeSeq = advanceSequence(this.resizeSeq, result.nextSeq);
    }).catch(error => {
      this.resizeFailure ??= new Error('remote terminal resize outcome is unresolved', { cause: error });
      throw error;
    }).finally(() => { this.queuedResizes -= 1; });
    this.resizeTail = operation;
    return this.track(operation);
  }

  inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    this.assertOpen();
    return this.track(this.call<{ pgid: number; verified: boolean }>('process/inspectForeground', {
      processId: this.allocation.processId,
    }, { signal: this.operationLifetime.signal, timeoutMs: 5_000 }).then(result => {
      if (result.verified !== true || !Number.isSafeInteger(result.pgid) || result.pgid <= 1) return undefined;
      // Silence is not proof of waiting for input. Native prompt observation
      // is intentionally not invented from the remote shell's output.
      return { processGroupId: result.pgid, inputWaiting: false };
    }));
  }

  async inspectActivity(): Promise<SubprocessTerminalActivity> {
    return { state: this.quiescent ? 'idle' : 'unknown', revision: this.revision };
  }

  signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    this.assertOpen(); this.revision += 1;
    return this.track((async () => {
      const result = await this.call<{ delivered: boolean; verified: boolean; targetPgid: number }>('process/signal', {
        processId: this.allocation.processId, operationId: randomUUID(), signal, target: 'foreground', denyOwnShellKill: true,
      }, { mutation: true, signal: this.operationLifetime.signal, timeoutMs: 5_000 });
      if (result.delivered !== true || result.verified !== true || !Number.isSafeInteger(result.targetPgid) || result.targetPgid <= 1) {
        throw new Error('remote terminal foreground signal delivery was not confirmed');
      }
      return result.targetPgid;
    })());
  }

  terminate(): Promise<void> {
    if (this.quiescent) return Promise.resolve();
    if (this.cleanup !== undefined) return this.cleanup;
    this.closing = true;
    this.operationLifetime.abort(new Error('remote user terminal is closing'));
    this.recoveryLifetime.abort(new Error('remote user terminal recovery cancelled'));
    const cleanup = this.cleanupOnce().catch(error => {
      if (this.cleanup === cleanup) this.cleanup = undefined;
      this.failOutcome(error); this.output.destroy(asError(error));
      throw error;
    });
    this.cleanup = cleanup;
    return cleanup;
  }

  private async cleanupOnce(): Promise<void> {
    await Promise.allSettled([...this.operations]);
    let unknown = false;
    try {
      await this.call('process/terminate', {
        processId: this.allocation.processId, operationId: `user-terminate:${this.allocation.processId}`,
        force: false, graceMs: this.graceMs,
      }, { timeoutMs: 5_000, mutation: true });
    } catch (error) {
      if (!isUnknownProcess(error)) throw error;
      unknown = true;
    }
    if (!unknown) {
      await delay(this.graceMs);
      await this.call('process/terminate', {
        processId: this.allocation.processId, operationId: `user-force:${this.allocation.processId}`, force: true,
      }, { timeoutMs: 5_000, mutation: true });
      const deadline = Date.now() + 2_000;
      while (!this.outcomeSettled && Date.now() < deadline) {
        const status = await this.call<ProcessStatus>('process/status', {
          processId: this.allocation.processId,
        }, { timeoutMs: 2_000 });
        if (!status.running) this.observeOutcome(status);
        else await delay(20);
      }
      // Keep pumping through TERM traps and final output. Backpressure cannot
      // hold cleanup forever; exceeding this drain bound is an explicit loss,
      // never a successful, silently truncated terminal stream.
      const drained = await bounded(this.pump, 2_000);
      if (!drained) {
        this.pumpLifetime.abort(new Error('remote terminal final output drain timed out'));
        await this.pump;
        this.output.destroy(new Error('remote terminal output could not be fully drained before cleanup'));
      }
      await this.call('process/release', {
        processId: this.allocation.processId, operationId: `user-release:${this.allocation.processId}`,
      }, { timeoutMs: 8_000, mutation: true });
    }
    if (unknown) {
      this.pumpLifetime.abort(new Error('remote terminal process no longer exists'));
      await this.pump;
    }
    await this.call('workspace/close', {
      workspaceId: this.allocation.workspaceId, operationId: `close:${this.allocation.workspaceId}`,
    }, { timeoutMs: 5_000, mutation: true });
    if (!this.outcomeSettled) this.failOutcome(new Error('remote terminal ended without a confirmed process outcome'));
    await this.outcomeWatch;
    this.quiescent = true; this.revision += 1;
    if (!this.output.destroyed) this.output.end();
    this.onClosed(this);
  }

  private async pumpOutput(): Promise<void> {
    try {
      for (;;) {
        this.pumpLifetime.signal.throwIfAborted();
        const result = await this.call<ProcessRead>('process/read', {
          processId: this.allocation.processId, afterSeq: this.cursor, maxBytes: READ_BYTES, waitMs: READ_WAIT_MS,
        }, { signal: this.pumpLifetime.signal, timeoutMs: 6_000, waitForResume: true, recoverySignal: this.recoveryLifetime.signal });
        if (result.truncated) throw new Error('remote terminal output buffer overflowed during disconnection; reopen this terminal');
        if (!Array.isArray(result.chunks) || typeof result.nextSeq !== 'string') throw new Error('invalid remote terminal output');
        this.cursor = result.nextSeq;
        // Outcome is independent of output backpressure. The controller still
        // drains the output stream before publishing its final screen state.
        if (result.exitCode !== null || result.signal !== null) this.observeOutcome(result);
        for (const chunk of result.chunks) {
          const data = Buffer.from(chunk.data, 'base64');
          if (data.length === 0) continue;
          this.revision += 1;
          if (!this.output.write(data)) await waitForDrain(this.output, this.pumpLifetime.signal);
        }
        if (result.exited) {
          this.observeOutcome(result);
          this.output.end();
          // The pump must settle before cleanup joins it; schedule the owned
          // release outside its own continuation, without a self-await cycle.
          queueMicrotask(() => { void this.terminate().catch(() => {}); });
          return;
        }
      }
    } catch (error) {
      if (this.closing && (this.pumpLifetime.signal.aborted || this.recoveryLifetime.signal.aborted)) return;
      this.failOutcome(error); this.output.destroy(asError(error));
      queueMicrotask(() => { void this.terminate().catch(() => {}); });
    }
  }

  /** Exit facts must remain observable even while a slow consumer applies backpressure. */
  private async watchOutcome(): Promise<void> {
    try {
      while (!this.outcomeSettled) {
        const status = await this.call<ProcessStatus>('process/status', { processId: this.allocation.processId }, {
          signal: this.statusLifetime.signal, timeoutMs: 3_000, waitForResume: true, recoverySignal: this.recoveryLifetime.signal,
        });
        if (!status.running) { this.observeOutcome(status); return; }
        await abortableDelay(250, this.statusLifetime.signal);
      }
    } catch (error) {
      if (this.outcomeSettled || this.statusLifetime.signal.aborted || (this.closing && this.recoveryLifetime.signal.aborted)) return;
      this.failOutcome(error); this.output.destroy(asError(error));
      queueMicrotask(() => { void this.terminate().catch(() => {}); });
    }
  }

  private async client(signal?: AbortSignal): Promise<RemoteHelperClient> {
    const client = await this.helpers.client(this.allocation.uri, signal);
    if (client.sessionId !== this.allocation.sessionId) {
      throw new Error('remote helper session expired; this terminal cannot be silently recreated');
    }
    return client;
  }

  private async call<T>(method: string, params: Record<string, unknown>, options: RemoteHelperSessionCallOptions = {}): Promise<T> {
    if (this.allocation.client.callInSession !== undefined) {
      return this.allocation.client.callInSession<T>(this.allocation.sessionId, method, params, options);
    }
    const client = await this.client(options.signal);
    return client.call<T>(method, params, options);
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation));
    return operation;
  }

  private assertOpen(): void {
    if (this.closing || this.quiescent) throw new Error('remote user terminal is closing or closed');
  }

  private observeOutcome(result: Pick<ProcessStatus, 'exitCode' | 'signal'>): void {
    if (this.outcomeSettled) return;
    this.outcomeSettled = true;
    this.statusLifetime.abort();
    this.resolveOutcome({ exitCode: result.exitCode, signal: normalizeSignal(result.signal) });
  }

  private failOutcome(error: unknown): void {
    if (this.outcomeSettled) return;
    this.outcomeSettled = true; this.rejectOutcome(error);
    this.statusLifetime.abort();
  }
}

async function rollback(helpers: RemoteHelperProvider, allocation: Allocation): Promise<void> {
  const client = allocation.client.callInSession === undefined ? await helpers.client(allocation.uri) : allocation.client;
  if (client.sessionId !== allocation.sessionId) throw new Error('cannot confirm cleanup after remote helper session replacement');
  const call = (method: string, params: Record<string, unknown>, options: RemoteHelperSessionCallOptions) =>
    client.callInSession === undefined ? client.call(method, params, options)
      : client.callInSession(allocation.sessionId, method, params, options);
  const failures: unknown[] = [];
  for (const [method, operationId] of [
    ['process/terminate', `rollback-terminate:${allocation.processId}`],
    ['process/release', `rollback-release:${allocation.processId}`],
  ] as const) {
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        await call(method, { processId: allocation.processId, operationId, force: true }, { timeoutMs: 8_000, mutation: true });
        break;
      } catch (error) {
        if (isUnknownProcess(error)) break;
        if (isStartingProcess(error) && Date.now() < deadline) { await delay(100); continue; }
        failures.push(error); break;
      }
    }
  }
  try {
    await call('workspace/close', { workspaceId: allocation.workspaceId, operationId: `close:${allocation.workspaceId}` }, { timeoutMs: 5_000, mutation: true });
  } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'remote terminal rollback was not confirmed');
}

function allocationCall<T>(allocation: Allocation, method: string, params: Record<string, unknown>, options: RemoteHelperSessionCallOptions): Promise<T> {
  const client = allocation.client;
  if (client.callInSession !== undefined) return client.callInSession<T>(allocation.sessionId, method, params, options);
  if (client.sessionId !== allocation.sessionId) return Promise.reject(new Error('remote helper session expired during terminal allocation'));
  return client.call<T>(method, params, options);
}

function validateSpawn(spec: SubprocessTerminalSpawnSpec): void {
  validateDimensions(spec.cols, spec.rows);
  if (!Array.isArray(spec.argv) || spec.argv.length === 0 || spec.argv.some(value => typeof value !== 'string' || value.includes('\0')) || !spec.argv[0]) {
    throw new TypeError('terminal argv must contain a non-empty executable and NUL-free strings');
  }
  if (!Number.isSafeInteger(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > 30_000) {
    throw new RangeError('remote terminal graceMs must be between 1 and 30000');
  }
  if (typeof spec.terminalType !== 'string' || !spec.terminalType || spec.terminalType.includes('\0')) throw new TypeError('invalid terminal type');
}

function validateDimensions(cols: number, rows: number): void {
  if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows) || cols < 1 || rows < 1 || cols > 10_000 || rows > 10_000) {
    throw new RangeError('terminal dimensions must be integers between 1 and 10000');
  }
}

function normalizeSignal(signal: string | number | null): NodeJS.Signals | null {
  if (typeof signal === 'string') return (signal.startsWith('SIG') ? signal : `SIG${signal}`) as NodeJS.Signals;
  const known: Record<number, NodeJS.Signals> = { 1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 9: 'SIGKILL', 15: 'SIGTERM' };
  return signal === null ? null : known[signal] ?? null;
}

function isUnknownProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'E_UNKNOWN_PROCESS';
}

function isStartingProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'E_PROCESS_STARTING';
}

function asError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }
function supports(client: RemoteHelperClient, capability: string, feature: string): boolean {
  const value = client.capabilities?.[capability];
  return value !== null && typeof value === 'object' && !Array.isArray(value) && value[feature] === true;
}
function advanceSequence(previous: string, next: string | undefined): string {
  const expected = (BigInt(previous) + 1n).toString();
  if (next !== expected) throw new Error('remote helper returned an invalid terminal mutation sequence');
  return expected;
}
function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = (): void => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function bounded(operation: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    void operation.then(() => { clearTimeout(timer); resolve(true); }, error => { clearTimeout(timer); reject(error); });
  });
}

function waitForDrain(stream: PassThrough, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown): void => {
      stream.off('drain', drained); stream.off('error', failed); stream.off('close', closed);
      signal.removeEventListener('abort', aborted);
      if (error === undefined) resolve(); else reject(error);
    };
    const drained = (): void => finish();
    const failed = (error: Error): void => finish(error);
    const closed = (): void => finish(new Error('remote terminal output closed'));
    const aborted = (): void => finish(signal.reason);
    stream.once('drain', drained); stream.once('error', failed); stream.once('close', closed);
    signal.addEventListener('abort', aborted, { once: true });
  });
}
