import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { detectSshCapabilities, assertSshAlias, redactHelperDiagnostic } from './helper/installer.js';

export interface ForwardSpec {
  alias: string; localPort: number; remotePort: number;
}
export interface ForwardProbe { state: 'reachable' | 'unreachable' | 'unknown'; message: string }
export function validateForwardSpec(spec: ForwardSpec): void {
  assertSshAlias(spec.alias);
  if (!Number.isInteger(spec.localPort) || spec.localPort < 1024 || spec.localPort > 65535
    || !Number.isInteger(spec.remotePort) || spec.remotePort < 1 || spec.remotePort > 65535) {
    throw new Error('本机端口须为 1024–65535，远端端口须为 1–65535。');
  }
}
export function masterArguments(spec: ForwardSpec, socket: string, modern: boolean): string[] {
  validateForwardSpec(spec);
  return ['-M', '-N', '-T', '-S', socket, '-o', 'BatchMode=yes', '-o', 'ControlMaster=yes',
    '-o', 'ControlPersist=no', '-o', 'ClearAllForwardings=yes', '-o', 'ExitOnForwardFailure=yes',
    '-o', 'GatewayPorts=no', '-o', 'PermitLocalCommand=no', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no',
    '-o', 'RemoteCommand=none', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2',
    ...(modern ? ['-o', 'SessionType=none', '-o', 'StdinNull=yes', '-o', 'ForkAfterAuthentication=no'] : []),
    '--', spec.alias];
}
export function controlArguments(socket: string, operation: 'check' | 'forward', spec: ForwardSpec): string[] {
  // Never reload Host/Match forwardings for a multiplexed control request.
  return ['-F', '/dev/null', '-S', socket, '-o', 'BatchMode=yes', '-o', 'ControlMaster=no',
    '-o', 'ExitOnForwardFailure=yes', '-O', operation,
    ...(operation === 'forward' ? ['-L', `127.0.0.1:${spec.localPort}:127.0.0.1:${spec.remotePort}`] : []),
    '--', spec.alias];
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export function probeArguments(socket: string, spec: ForwardSpec): string[] {
  const script = `import socket\ntry:\n s=socket.create_connection(('127.0.0.1',${spec.remotePort}),2); s.close(); print('DSH_PORT_TCP:reachable')\nexcept OSError:\n print('DSH_PORT_TCP:unreachable')`;
  // A lost control socket MUST NOT fall back to an unrelated fresh connection.
  return ['-F', '/dev/null', '-T', '-S', socket, '-o', 'ControlMaster=no', '-o', 'BatchMode=yes',
    '-o', 'ProxyCommand=false', '-o', 'ClearAllForwardings=yes', '--', spec.alias, `python3 -c ${quote(script)}`];
}

/** Runs in a child guardian: parent IPC disconnect disposes this entire owner. */
export class OpenSshForward {
  private directory?: string;
  private readonly children = new Map<ChildProcess, Promise<void>>();
  private diagnostics = '';
  private stopped = false;
  private startTask?: Promise<void>;
  private stopTask?: Promise<void>;
  private readonly lifetime = new AbortController();
  private probeTask?: Promise<ForwardProbe>;
  onNotice?: (message: string) => void;
  private lastNotice = '';
  constructor(private readonly spec: ForwardSpec, private readonly onFailure: (message: string) => void,
    private readonly ssh = 'ssh', private readonly spawnProcess: typeof spawn = spawn) { validateForwardSpec(spec); }

  start(): Promise<void> { return this.startTask ??= this.startOnce(); }
  private async startOnce(): Promise<void> {
    if (process.platform === 'win32') throw new Error('首版端口转发需要 macOS/Linux Host 的 OpenSSH 控制套接字。');
    const capabilities = await detectSshCapabilities(this.ssh);
    this.checkActive();
    // Keep Unix socket paths short even under macOS's long TMPDIR.
    this.directory = await mkdtemp('/tmp/dsh-ports-');
    await chmod(this.directory, 0o700);
    this.checkActive();
    const child = this.spawn(masterArguments(this.spec, this.socket, capabilities.sessionTypeSupported));
    child.stderr?.on('data', chunk => {
      const text = String(chunk); this.diagnostics = redactHelperDiagnostic((this.diagnostics + text).slice(-8192));
      const notice = /administratively prohibited/iu.test(text) ? '最近一次连接被 SSH 服务端拒绝转发；请检查 AllowTcpForwarding / PermitOpen。'
        : /open failed:.*connect failed/iu.test(text) ? '最近一次 SSH 通道未能连接远端服务；监听仍保留，请检查端口。' : '';
      if (notice && notice !== this.lastNotice && !this.stopped) { this.lastNotice = notice; this.onNotice?.(notice); }
    });
    child.on('error', () => { if (!this.stopped) this.onFailure('无法启动本机 OpenSSH。'); });
    child.on('exit', () => { if (!this.stopped) this.onFailure(this.diagnostics || 'SSH 转发连接已断开，请手动重试。'); });
    const deadline = Date.now() + 20_000;
    while (true) {
      this.checkActive();
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(this.diagnostics || 'SSH 连接在转发建立前退出。');
      if (Date.now() > deadline) throw new Error('SSH 转发连接超时。');
      const info = await lstat(this.socket).catch(() => undefined);
      if (info?.isSocket()) {
        const check = await this.command(controlArguments(this.socket, 'check', this.spec), 2500);
        if (check.code === 0) break;
      }
      await delay(75, undefined, { signal: this.lifetime.signal });
    }
    const result = await this.command(controlArguments(this.socket, 'forward', this.spec), 5000);
    this.checkActive();
    if (result.code !== 0) {
      const detail = redactHelperDiagnostic(`${result.stderr}\n${this.diagnostics}`).trim();
      throw new Error(/address already in use/iu.test(detail) ? '本机端口已被占用；没有接管或关闭已有程序。' : `SSH 拒绝建立本地转发：${detail || '请检查服务端转发权限。'}`);
    }
  }
  probe(): Promise<ForwardProbe> {
    if (this.probeTask) return this.probeTask;
    this.probeTask = this.probeOnce().finally(() => { this.probeTask = undefined; });
    return this.probeTask;
  }
  private async probeOnce(): Promise<ForwardProbe> {
    this.checkActive();
    const result = await this.command(probeArguments(this.socket, this.spec), 5000);
    this.checkActive();
    if (result.code === 0 && /(?:^|\n)DSH_PORT_TCP:reachable\r?\n?$/u.test(result.stdout)) {
      return { state: 'reachable', message: '远端 TCP 端口可连接；不代表 HTTP 应用已就绪。' };
    }
    if (result.code === 0 && /(?:^|\n)DSH_PORT_TCP:unreachable\r?\n?$/u.test(result.stdout)) {
      return { state: 'unreachable', message: '远端 127.0.0.1 端口暂不可连接；请先启动服务，再检查。转发监听仍保留。' };
    }
    return { state: 'unknown', message: '无法检查远端端口（需要 Python 3 或连接已断开）；不自动安装依赖。' };
  }
  stop(): Promise<void> {
    this.stopped = true; this.lifetime.abort();
    return this.stopTask ??= this.stopOnce().catch(error => { this.stopTask = undefined; throw error; });
  }
  private async stopOnce(): Promise<void> {
    // Drain admission as well as processes: mkdtemp/spawn may be in flight.
    await this.startTask?.catch(() => {});
    const results = await Promise.allSettled([...this.children.keys()].map(child => this.killOwned(child)));
    const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason] : []);
    if (failures.length) throw new AggregateError(failures, 'SSH 转发清理未确认，请再次停止。');
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true }); this.directory = undefined;
    }
  }
  /** Synchronous last-resort fallback on guardian exit; never signal a numeric PID. */
  killOnExit(): void { for (const child of this.children.keys()) child.kill('SIGKILL'); }
  private get socket() { if (!this.directory) throw new Error('转发资源尚未建立。'); return join(this.directory, 'control'); }
  private checkActive() { if (this.stopped) throw new Error('转发已停止。'); }
  private spawn(args: string[]): ChildProcess {
    this.checkActive();
    const child = this.spawnProcess(this.ssh, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const finished = new Promise<void>(resolve => {
      child.once('close', () => { this.children.delete(child); resolve(); });
    });
    // All child errors must have a listener before spawn can fail asynchronously.
    child.on('error', () => {}); this.children.set(child, finished);
    return child;
  }
  private async command(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
    this.checkActive();
    const child = this.spawn(args); const done = this.children.get(child)!;
    let stdout = '', stderr = '', overflow = false;
    const collect = (chunk: Buffer, out: boolean) => {
      const value = (out ? stdout : stderr) + String(chunk);
      if (Buffer.byteLength(value) > 16_384) { overflow = true; child.kill('SIGTERM'); }
      if (out) stdout = value.slice(0, 8192); else stderr = value.slice(0, 8192);
    };
    child.stdout?.on('data', chunk => collect(chunk, true)); child.stderr?.on('data', chunk => collect(chunk, false));
    const cancel = () => { child.kill('SIGTERM'); };
    this.lifetime.signal.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    const kill = setTimeout(() => child.kill('SIGKILL'), timeoutMs + 500);
    try { await bounded(done, timeoutMs + 2000); }
    finally { clearTimeout(timeout); clearTimeout(kill); this.lifetime.signal.removeEventListener('abort', cancel); }
    return { code: overflow || timedOut ? -1 : child.exitCode ?? -1, stdout, stderr };
  }
  private async killOwned(child: ChildProcess): Promise<void> {
    const done = this.children.get(child); if (!done) return;
    child.kill('SIGTERM');
    try { await bounded(done, 800); return; } catch { /* Escalate only this live ChildProcess handle. */ }
    child.kill('SIGKILL'); await bounded(done, 1200);
  }
}
export async function bounded<T>(promise: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SSH 转发操作超时，结果待确认。')), timeout); })]); }
  finally { clearTimeout(timer!); }
}
