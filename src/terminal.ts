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
    this.resetIdle();
  }

  append(text: string): void {
    if (this.settled) return;
    this.viewport.append(text);
    this.unread.append(text);
    this.resetIdle();
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

/** Backend-owned ssh2 PTY session. */
class RemoteTerminalBackendSession implements TerminalBackendSession {
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

/** Replaceable `ssh` PTY backend registered on `ctx.terminals`. */
export class RemoteTerminalBackend implements TerminalBackend {
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
      const session = new RemoteTerminalBackendSession(channel);
      session.enterDirectory(parsed.path);
      return session;
    } catch (error) {
      await retireUnpublishedChannel(channel);
      throw error;
    }
  }
}
