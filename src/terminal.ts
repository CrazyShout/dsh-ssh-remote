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

/** Debounce after the last output before a send is considered idle. */
const IDLE_MS = 400;
/** Hard deadline for one send (matches the local backend's timeout shape). */
const TIMEOUT_MS = 30000;
/** Bounded retained scrollback. */
const SCROLLBACK_MAX = 64 * 1024;

function tail(text: string, max: number): string {
  return text.length > max ? text.slice(text.length - max) : text;
}

/** One live send over the ssh2 shell channel. */
class RemoteSendOperation implements TerminalSendOperation {
  readonly done: Promise<TerminalSendResult>;
  private output = '';
  private readCursor = 0;
  private settled = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private resolveDone!: (v: TerminalSendResult) => void;
  private rejectDone!: (e: Error) => void;

  constructor(
    private readonly onCancel: () => void,
    private readonly onSettle: () => void,
    private readonly getSessionStatus: () => TerminalSessionStatus,
  ) {
    this.done = new Promise<TerminalSendResult>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    this.deadlineTimer = setTimeout(() => this.settle('timeout'), TIMEOUT_MS);
    this.resetIdle();
  }

  append(text: string) {
    if (this.settled) return;
    this.output += text;
    this.resetIdle();
  }

  private resetIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.settle('inferred_idle'), IDLE_MS);
  }

  readOutput() {
    const delta = this.output.slice(this.readCursor);
    this.readCursor = this.output.length;
    return { delta, truncated: false };
  }

  settle(waitReason: TerminalSendResult['waitReason']) {
    if (this.settled) return;
    this.settled = true;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    if (this.deadlineTimer !== undefined) clearTimeout(this.deadlineTimer);
    this.onSettle();
    this.resolveDone({ viewport: this.output, waitReason, sessionStatus: this.getSessionStatus(), truncated: false });
  }

  fail(error: Error) {
    if (this.settled) return;
    this.settled = true;
    this.onSettle();
    this.rejectDone(error);
  }

  cancel() {
    if (this.settled) return false;
    this.onCancel();
    return true;
  }
}

/** Backend-owned ssh2 PTY session. */
class RemoteTerminalBackendSession implements TerminalBackendSession {
  motd = '';
  pid = undefined as number | undefined;
  private channel: ClientChannel;
  private scrollback = '';
  private statusValue: TerminalSessionStatus = { kind: 'running' };
  private active: RemoteSendOperation | undefined;
  private closed = false;

  constructor(channel: ClientChannel) {
    this.channel = channel;
    channel.on('data', (d: Buffer) => this.onData(d.toString('utf8')));
    channel.on('close', () => this.onClose());
    channel.on('error', () => this.onClose());
  }

  private onData(text: string) {
    this.scrollback = tail(this.scrollback + text, SCROLLBACK_MAX);
    this.active?.append(text);
  }

  private onClose() {
    this.closed = true;
    this.statusValue = { kind: 'exited', exitCode: null, signal: null };
    this.active?.settle('session_exit');
  }

  startSend(request: TerminalSendRequest): TerminalSendOperation {
    if (this.closed) throw new Error('PTY session has exited');
    if (this.active !== undefined) throw new Error('PTY session already has an active send');
    const op = new RemoteSendOperation(
      () => this.channel.signal('INT'),
      () => {
        if (this.active === op) this.active = undefined;
      },
      () => this.statusValue,
    );
    this.active = op;
    if (request.text) this.channel.write(request.text);
    if (request.submit) this.channel.write('\r');
    return op;
  }

  read(request: TerminalReadRequest): TerminalReadResult {
    const lines = this.scrollback.length === 0 ? [] : this.scrollback.split('\n');
    const totalLines = lines.length;
    const offset = request.offset ?? 0;
    const count = request.count ?? 500;
    const start = Math.max(0, totalLines - offset - count);
    const end = Math.max(start, totalLines - offset);
    return {
      text: lines.slice(start, end).join('\n'),
      totalLines,
      lineBegin: offset,
      lineEnd: offset + (end - start),
      truncated: this.scrollback.length >= SCROLLBACK_MAX,
    };
  }

  async signal(signal: TerminalSignal): Promise<TerminalSignalResult> {
    if (this.closed) throw new Error('PTY session has exited');
    this.channel.signal(signal.replace(/^SIG/, ''));
    return { delivered: true, targetPgid: 0 };
  }

  status(): TerminalSessionStatus {
    return this.statusValue;
  }

  async close(_reason: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.channel.end();
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
    const cwd = spec.cwd;
    const uri = cwd !== undefined && cwd.startsWith('ssh://') ? cwd : cwd !== undefined ? this.resolveRemotePath(cwd) : undefined;
    if (uri === undefined) throw new Error('remote terminal requires an SSH cwd');
    const transport = await this.connections.transport(uri);
    const channel = await transport.shell({ cols: 80, rows: 24 });
    return new RemoteTerminalBackendSession(channel);
  }
}
