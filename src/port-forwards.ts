import { fork, type ChildProcess } from 'node:child_process';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import type { RemotePathResolver } from './runtime-router.js';
import { parseSshUri } from './types.js';
import { hasConcreteSshAlias } from './ssh-config.js';
import { bounded, validateForwardSpec, type ForwardProbe } from './port-forward-transport.js';
import { redactHelperDiagnostic } from './helper/installer.js';

export interface PortForwardInput { id: string; localPort: number; remotePort: number; protocol: 'http' | 'https' }
export interface PortForwardView extends PortForwardInput {
  alias: string; state: 'starting' | 'listening' | 'stopping' | 'stopped' | 'error';
  probe: ForwardProbe; error: string; createdAt: number; canRetry: boolean;
}
interface RecordEntry {
  owner: string; view: PortForwardView; fingerprint?: string; worker?: ChildProcess;
  ended?: Promise<void>; stopTask?: Promise<void>; stopRequested: boolean; cleanupConfirmed: boolean;
  finishedAt?: number; lastProbe?: number; probeInFlight: boolean;
}
export interface PortForwardList { host: string; alias: string; supported: boolean; items: PortForwardView[] }
interface Options { forkWorker?: () => ChildProcess; now?: () => number; aliasValidator?: (alias: string) => boolean }
const idPattern = /^[a-zA-Z0-9-]{16,80}$/u;
const unknown = (): ForwardProbe => ({ state: 'unknown', message: '尚未检查远端 TCP 端口。' });

/** A Host owns listeners; authenticated Sessions can manage only their workspace's records. */
export class PortForwardManager {
  private readonly records = new Map<string, RecordEntry>();
  private readonly ports = new Map<number, RecordEntry>();
  private disposed = false;
  private readonly now: () => number;
  constructor(private readonly resolve: RemotePathResolver, private readonly options: Options = {}) { this.now = options.now ?? Date.now; }
  private identity(scope: WorkspaceFileScope) {
    if (!scope?.sessionId || !scope.workspaceRoot) throw new Error('需要有效会话。');
    const uri = this.resolve(scope.workspaceRoot);
    if (!uri) throw new Error('端口转发只支持已注册的 SSH 工作区。');
    const alias = parseSshUri(uri).host;
    return { owner: uri, alias };
  }
  list(scope: WorkspaceFileScope): PortForwardList {
    const { owner, alias } = this.identity(scope); this.prune();
    return { host: hostname(), alias, supported: process.platform !== 'win32', items: [...this.records.values()]
      .filter(r => r.owner === owner && r.fingerprint).sort((a, b) =>
        Number(this.ports.get(b.view.localPort) === b) - Number(this.ports.get(a.view.localPort) === a) || b.view.createdAt - a.view.createdAt)
      .slice(0, 32).map(r => this.view(r)) };
  }
  create(scope: WorkspaceFileScope, input: PortForwardInput): PortForwardView {
    if (this.disposed) throw new Error('端口转发已关闭。');
    if (process.platform === 'win32') throw new Error('首版端口转发只支持 macOS/Linux DSH Host。');
    const { owner, alias } = this.identity(scope);
    // Configuration changes must not revoke the owner's ability to list/stop
    // an already-running connection. Only a new allocation needs this check.
    if (!(this.options.aliasValidator ?? hasConcreteSshAlias)(alias)) throw new Error('SSH alias 已失效，请检查本机 OpenSSH 配置。');
    if (!idPattern.test(input.id) || !['http', 'https'].includes(input.protocol)) throw new Error('转发请求参数无效。');
    validateForwardSpec({ ...input, alias });
    const key = `${owner}\0${input.id}`, fingerprint = JSON.stringify([input.localPort, input.remotePort, input.protocol]);
    const previous = this.records.get(key);
    if (previous) {
      if (!previous.fingerprint) throw new Error('该请求已被停止；请发起新的转发请求。');
      if (previous.fingerprint !== fingerprint) throw new Error('不能用同一个请求标识修改转发目标。');
      return this.view(previous); // Including stopped records: retries never reactivate them.
    }
    this.prune();
    if (this.records.size >= 1024) throw new Error('转发请求回执已达到上限，请稍后重试。');
    if (this.ports.size >= 8) throw new Error('最多同时建立八条转发，请先停止不用的转发。');
    if (this.ports.has(input.localPort)) throw new Error('该本机端口已由另一条转发占用；不会接管其他工作区的连接。');
    const entry: RecordEntry = { owner, view: { ...input, alias, state: 'starting', probe: unknown(), error: '', createdAt: this.now(), canRetry: false },
      fingerprint, stopRequested: false, cleanupConfirmed: false, probeInFlight: false };
    this.records.set(key, entry); this.ports.set(input.localPort, entry);
    try {
      const worker = entry.worker = this.options.forkWorker?.() ?? fork(fileURLToPath(new URL('./port-forward-entry.js', import.meta.url)), [], {
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      worker.stderr?.on('data', () => {}); // Do not collect URLs, credentials or arbitrary remote banners.
      entry.ended = new Promise(resolve => {
        worker.once('close', () => {
          if (!entry.cleanupConfirmed) {
            entry.view.state = 'error'; entry.view.error ||= '转发进程已退出，但资源释放未确认；请核查本机端口。';
            // Do not silently reuse a potentially still-listening port.
          } else {
            if (entry.stopRequested) entry.view.state = 'stopped';
            else if (entry.view.state !== 'error') { entry.view.state = 'error'; entry.view.error = '转发已退出，请手动重试。'; }
            this.ports.delete(input.localPort);
          }
          entry.finishedAt = this.now(); resolve();
        });
      });
      worker.on('error', error => {
        entry.view.state = 'error'; entry.view.error = `转发进程启动失败：${redactHelperDiagnostic(error.message)}`;
        // No pid means the guardian never existed and could not allocate SSH.
        if (worker.pid === undefined) entry.cleanupConfirmed = true;
      });
      worker.on('message', message => {
        if (!message || typeof message !== 'object') return;
        const event = message as { type?: string; message?: string; probe?: ForwardProbe };
        if (event.type === 'stopped') { entry.cleanupConfirmed = true; return; }
        if (event.type === 'cleanup-error') { entry.view.error = '资源释放待确认，请再次停止。'; return; }
        if (entry.stopRequested || this.disposed) return; // Late ready/probe cannot undo Stop.
        if (event.type === 'notice') { entry.view.error = String(event.message ?? '').slice(0, 512); return; }
        if (event.type === 'ready' && entry.view.state === 'starting') { entry.view.state = 'listening'; this.sendProbe(entry); }
        else if (event.type === 'probe' && event.probe && ['reachable', 'unreachable', 'unknown'].includes(event.probe.state)) {
          entry.probeInFlight = false;
          if (entry.view.state === 'listening') entry.view.probe = { state: event.probe.state, message: String(event.probe.message).slice(0, 512) };
        } else if (event.type === 'error') {
          entry.view.state = 'error'; entry.view.error = redactHelperDiagnostic(String(event.message ?? 'SSH 连接失败。')).slice(0, 2048);
        }
      });
      worker.send({ type: 'start', spec: { alias, localPort: input.localPort, remotePort: input.remotePort } }, error => {
        if (error) { entry.view.state = 'error'; entry.view.error = '无法将转发请求交给资源管理进程。'; void this.stopEntry(entry).catch(() => {}); }
      });
    } catch (error) {
      entry.cleanupConfirmed = true; entry.finishedAt = this.now(); this.ports.delete(input.localPort);
      entry.view.state = 'error'; entry.view.error = String(error);
    }
    return this.view(entry);
  }
  async stop(scope: WorkspaceFileScope, id: string): Promise<PortForwardView> {
    const { owner, alias } = this.identity(scope);
    if (!idPattern.test(id)) throw new Error('转发标识无效。');
    const key = `${owner}\0${id}`;
    let entry = this.records.get(key);
    if (!entry) {
      this.prune(); if (this.records.size >= 1024) throw new Error('停止请求回执容量不足，请稍后重试。');
      entry = { owner, view: { id, alias, localPort: 0, remotePort: 0, protocol: 'http', state: 'stopped', probe: unknown(), error: '', createdAt: this.now(), canRetry: false },
        stopRequested: true, cleanupConfirmed: true, finishedAt: this.now(), probeInFlight: false };
      this.records.set(key, entry); // Stop-before-create tombstone.
    }
    await this.stopEntry(entry); return this.view(entry);
  }
  probe(scope: WorkspaceFileScope, id: string): PortForwardView {
    const { owner } = this.identity(scope); const entry = this.records.get(`${owner}\0${id}`);
    if (!entry || entry.stopRequested || entry.view.state !== 'listening') throw new Error('请先建立转发监听。');
    this.sendProbe(entry); return this.view(entry);
  }
  private sendProbe(entry: RecordEntry): void {
    if (entry.probeInFlight || (entry.lastProbe !== undefined && this.now() - entry.lastProbe < 1500)) return;
    entry.probeInFlight = true; entry.lastProbe = this.now();
    entry.view.probe = { state: 'unknown', message: '正在检查远端 TCP 端口…' };
    entry.worker?.send({ type: 'probe' }, error => { if (error) { entry.probeInFlight = false; entry.view.probe = unknown(); } });
  }
  private stopEntry(entry: RecordEntry): Promise<void> {
    entry.stopRequested = true;
    if (!entry.worker) { entry.view.state = 'stopped'; return Promise.resolve(); }
    if (entry.stopTask) return entry.stopTask;
    if (entry.finishedAt !== undefined) {
      if (!entry.cleanupConfirmed) return Promise.reject(new Error('转发进程已退出，但端口释放未确认；未自动接管或重试。'));
      entry.view.state = 'stopped'; return Promise.resolve();
    }
    entry.view.state = 'stopping';
    entry.stopTask = (async () => {
      if (entry.worker!.connected) entry.worker!.send({ type: 'stop' }, () => {});
      try { await bounded(entry.ended!, 10_000); }
      catch {
        // SIGTERM asks the guardian to clean its owned ChildProcess handles.
        // Never SIGKILL the guardian or kill a remembered numeric SSH PID.
        entry.worker!.kill('SIGTERM');
        throw new Error('停止仍在清理中；请再次停止，不会重新建立连接。');
      }
      if (!entry.cleanupConfirmed) throw new Error('端口释放尚未确认，未自动重用该端口。');
    })().finally(() => { entry.stopTask = undefined; });
    return entry.stopTask;
  }
  private view(entry: RecordEntry): PortForwardView { return { ...entry.view, probe: { ...entry.view.probe },
    canRetry: entry.cleanupConfirmed && entry.finishedAt !== undefined }; }
  private prune() {
    for (const [key, entry] of this.records) if (entry.finishedAt !== undefined && entry.cleanupConfirmed
      && this.now() - entry.finishedAt > 24 * 60 * 60 * 1000) this.records.delete(key);
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    const results = await Promise.allSettled([...this.records.values()].map(entry => this.stopEntry(entry)));
    const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason] : []);
    if (failures.length) throw new AggregateError(failures, 'SSH port forwarding cleanup incomplete');
  }
}

declare module '@deepseek-ai/cordis' { interface Context { sshRemotePorts: SshRemotePorts } }
declare module '@deepseek-ai/dsh-typert-protocol' { interface RemoteErrorDetailsMap { 'ssh-ports/refused': { reason: string } } }
export class SshRemotePorts extends TypertRemoteService {
  constructor(ctx: Context, private readonly manager: PortForwardManager) { super(ctx, 'sshRemotePorts'); }
  @Remote async list(scope: WorkspaceFileScope, signal: AbortSignal): Promise<PortForwardList> { signal.throwIfAborted(); return this.manager.list(scope); }
  @Remote async create(scope: WorkspaceFileScope, input: PortForwardInput): Promise<PortForwardView> {
    try { return this.manager.create(scope, input); }
    catch (error) { throw new RemoteError('ssh-ports/refused', error instanceof Error ? error.message : String(error), { reason: 'preflight' }); }
  }
  @Remote async stop(scope: WorkspaceFileScope, id: string): Promise<PortForwardView> { return this.manager.stop(scope, id); }
  @Remote async probe(scope: WorkspaceFileScope, id: string): Promise<PortForwardView> { return this.manager.probe(scope, id); }
}
