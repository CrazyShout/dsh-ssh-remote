import type { ChangeResult, ClientRemote, PluginInstallRequestId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseCheck, ReleaseTarget, UpdateInfo, UpdatesRemote } from 'dsh-ssh-remote/updates';

type Installer = Pick<ClientRemote['pluginManager'], 'installBundle' | 'waitForInstall' | 'cancelInstall'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Phase = 'installing' | 'applying' | 'unknown' | 'failed' | 'cancelled' | 'restart' | 'done';
export interface UpdateOperation { requestId: string; target: ReleaseTarget; phase: Phase; message: string }
interface Receipt { requestId: string; target: ReleaseTarget; result?: ChangeResult }
export interface UpdateSnapshot {
  info?: UpdateInfo; release?: ReleaseCheck; checking: boolean; automatic: boolean;
  dismissed: string; error: string; operation?: UpdateOperation;
}

/** Releases are stable triples; an installed prerelease of that same triple precedes the stable version. */
export function newerRelease(target: string, current: string) {
  const parse = (s: string) => /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(s);
  const a = parse(target), b = parse(current);
  if (!a || !b || a[4]) return false;
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  return Boolean(b[4]);
}
export function validTarget(value: unknown): value is ReleaseTarget {
  if (!value || typeof value !== 'object') return false;
  const r = value as ReleaseTarget;
  return /^\d+\.\d+\.\d+$/u.test(r.version) && r.packageUrl === `https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v${r.version}/dsh-ssh-remote-${r.version}.tgz`
    && r.url === `https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v${r.version}` && /^[a-f0-9]{64}$/u.test(r.sha256);
}
function read<T>(storage: StorageLike | undefined, key: string): T | undefined {
  try { const raw = storage?.getItem(key); return raw && raw.length < 16_384 ? JSON.parse(raw) as T : undefined; } catch { return undefined; }
}
function write(storage: StorageLike | undefined, key: string, value: unknown) {
  try { if (value === undefined) storage?.removeItem(key); else storage?.setItem(key, JSON.stringify(value)); } catch { /* Storage-disabled browsers still support the active operation. */ }
}
export function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  try { return window[kind]; } catch { return undefined; }
}

/** One instance per client. No package writes except DSH's public installer; disposal never cancels an install. */
export class UpdateStore {
  private state: UpdateSnapshot = { checking: false, automatic: true, dismissed: '', error: '' };
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private key = '';
  private checkTask?: Promise<void>;
  private recovery?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private visible = true;
  constructor(private readonly remote: UpdatesRemote, private readonly installer: Installer,
    private readonly preferences?: StorageLike, private readonly receipts?: StorageLike) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(patch: Partial<UpdateSnapshot>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener();
  }
  private receipt(): Receipt | undefined {
    const r = read<Receipt>(this.receipts, `${this.key}:pending`);
    return r && /^[a-z0-9-]{16,80}$/iu.test(r.requestId) && validTarget(r.target) ? r : undefined;
  }
  async start() {
    const epoch = ++this.epoch;
    this.checkTask = undefined;
    this.recovery = undefined;
    clearTimeout(this.timer);
    this.patch({ checking: true, error: '' });
    try {
      const answer = await this.remote.info();
      if (this.disposed || epoch !== this.epoch) return;
      if (!answer.ok) throw new Error(answer.error.message);
      const info = answer.value, key = `dsh-ssh-remote:updates:${info.profileId}`;
      const changed = key !== this.key;
      this.key = key;
      const prefs = read<{ automatic?: boolean; dismissed?: string }>(this.preferences, key);
      this.patch({ info, checking: false, automatic: prefs?.automatic !== false, dismissed: typeof prefs?.dismissed === 'string' ? prefs.dismissed : '',
        error: '', ...(changed ? { release: undefined, operation: undefined } : {}) });
      const receipt = this.receipt();
      if (receipt) void this.reconcile();
      if (this.state.automatic && this.visible) void this.check(false);
    } catch (error) {
      if (epoch !== this.epoch) return;
      const message = String(error instanceof Error ? error.message : error);
      this.patch({ checking: false, error: /HTTP 404|gateway\/(?:service-unavailable|endpoint-not-found)/u.test(message)
        ? '更新服务尚未加载。若刚升级插件，请保存工作后重启当前 DSH，再点击“检查更新”。'
        : `无法读取插件版本：${message}` });
    }
  }
  setVisible(visible: boolean) {
    this.visible = visible; clearTimeout(this.timer);
    if (visible && this.state.info && this.state.automatic) void this.check(false);
  }
  setAutomatic(automatic: boolean) {
    this.patch({ automatic }); this.savePreferences(); clearTimeout(this.timer);
    if (automatic && this.visible) void this.check(false);
  }
  dismiss() { this.patch({ dismissed: this.state.release?.latest?.version ?? '' }); this.savePreferences(); }
  private savePreferences() { if (this.key) write(this.preferences, this.key, { automatic: this.state.automatic, dismissed: this.state.dismissed }); }
  check(force = true): Promise<void> {
    if (this.disposed || !this.state.info) return Promise.resolve();
    if (this.checkTask) return this.checkTask;
    const epoch = this.epoch;
    this.patch({ checking: true });
    const task = this.remote.check(force).then(result => {
      if (epoch !== this.epoch || this.disposed) return;
      this.patch(result.ok ? { release: result.value, error: '' } : { release: undefined, error: result.error.message });
    }, error => { if (epoch === this.epoch) this.patch({ release: undefined, error: `检查更新失败：${String(error instanceof Error ? error.message : error)}` }); })
      .finally(() => {
        if (this.checkTask === task) this.checkTask = undefined;
        if (epoch !== this.epoch || this.disposed) return;
        this.patch({ checking: false }); clearTimeout(this.timer);
        if (this.visible && this.state.automatic) this.timer = setTimeout(() => { void this.check(false); }, 6 * 60 * 60_000);
      });
    this.checkTask = task;
    return task;
  }
  available() {
    const { info, release } = this.state;
    return info && release?.latest && !release.error && validTarget(release.latest)
      && newerRelease(release.latest.version, info.installedVersion) ? release.latest : undefined;
  }
  busy() { return ['installing', 'applying', 'unknown'].includes(this.state.operation?.phase ?? ''); }

  /** Called only by the explicit confirmation button. Recheck installation identity before any write. */
  async install(target: ReleaseTarget) {
    if (this.busy() || this.disposed) return;
    const previous = this.state.info;
    if (!previous || !validTarget(target) || this.available()?.packageUrl !== target.packageUrl) return;
    const epoch = this.epoch;
    this.patch({ operation: { requestId: '', target, phase: 'installing', message: '正在核对安装来源…' } });
    try {
      const fresh = await this.remote.info();
      if (this.disposed || epoch !== this.epoch) return;
      if (!fresh.ok) throw new Error(fresh.error.message);
      const info = fresh.value;
      if (info.profileId !== previous.profileId || info.source !== previous.source || info.installedVersion !== previous.installedVersion) {
        throw new Error('安装来源或版本已改变，请重新检查更新。');
      }
      if (info.sourceKind !== 'release') throw new Error(info.sourceKind === 'development' ? '源码链接安装请使用 Git 同步，不会被安装包覆盖。' : '此安装来源不支持直接更新，请使用官方插件页。');
      if (!newerRelease(target.version, info.installedVersion)) throw new Error('目标不再是更新版本，请重新检查。');
      const requestId = crypto.randomUUID(), key = `${this.key}:pending`;
      write(this.receipts, key, { requestId, target } satisfies Receipt);
      this.patch({ info, operation: { requestId, target, phase: 'installing', message: `正在通过 DSH 安装 ${target.version}…` } });
      // This Remote is owned by the official manager, not this SSH plugin. Never remove ourselves first.
      const result = await this.installer.installBundle(target.packageUrl, { requestId: requestId as PluginInstallRequestId, enabled: info.enabled });
      if (result.ok) {
        // A late answer may outlive this UI during HMR. Persist it only for its own receipt.
        if (read<Receipt>(this.receipts, key)?.requestId === requestId) write(this.receipts, key, { requestId, target, result: result.value } satisfies Receipt);
        if (!this.disposed && epoch === this.epoch) await this.result(requestId, target, result.value);
      } else if (!this.disposed && epoch === this.epoch) this.patch({ operation: { requestId, target, phase: 'unknown', message: '安装响应未确认，请重新确认结果；不会自动重装。' } });
    } catch (error) {
      if (epoch !== this.epoch || this.disposed) return;
      const operation = this.state.operation;
      this.patch({ operation: { requestId: operation?.requestId ?? '', target, phase: operation?.requestId ? 'unknown' : 'failed',
        message: String(error instanceof Error ? error.message : error) } });
    }
  }
  progress(requestId: string, phase: string) {
    const op = this.state.operation;
    if (op?.requestId !== requestId || !this.busy()) return;
    if (phase === 'applying') this.patch({ operation: { ...op, phase: 'applying', message: '安装包已就绪，DSH 正在应用更新…' } });
  }
  async cancel() {
    const op = this.state.operation;
    if (!op?.requestId || !['installing', 'unknown'].includes(op.phase)) return;
    try {
      const result = await this.installer.cancelInstall(op.requestId as PluginInstallRequestId);
      if (this.disposed || this.state.operation?.requestId !== op.requestId || !this.busy()) return;
      if (result.ok && result.value.status === 'cancelled') {
        write(this.receipts, `${this.key}:pending`, undefined);
        this.patch({ operation: { ...op, phase: 'cancelled', message: 'DSH 已确认取消安装。' } });
      } else this.patch({ operation: { ...op, phase: 'unknown', message: '安装可能已进入应用阶段，请重新确认结果。' } });
    } catch { if (this.state.operation?.requestId === op.requestId && this.busy()) this.patch({ operation: { ...op, phase: 'unknown', message: '取消结果未确认，请重新确认安装结果。' } }); }
  }
  reconcile(): Promise<void> {
    if (this.recovery) return this.recovery;
    const receipt = this.receipt();
    if (!receipt || this.disposed) return Promise.resolve();
    const epoch = this.epoch;
    this.patch({ operation: { requestId: receipt.requestId, target: receipt.target, phase: 'installing', message: '正在确认上次更新结果…' } });
    const recovery = (async () => {
      try {
        if (receipt.result) { await this.result(receipt.requestId, receipt.target, receipt.result); return; }
        const info = await this.remote.info();
        if (this.disposed || epoch !== this.epoch) return;
        if (info.ok && info.value.installedVersion === receipt.target.version) {
          this.patch({ info: info.value }); this.installed(receipt.requestId, receipt.target, info.value); return;
        }
        const result = await this.installer.waitForInstall(receipt.requestId as PluginInstallRequestId);
        if (this.disposed || epoch !== this.epoch) return;
        if (result.ok && result.value) await this.result(receipt.requestId, receipt.target, result.value);
        else this.patch({ operation: { requestId: receipt.requestId, target: receipt.target, phase: 'unknown',
          message: '上次安装结果未知。请在官方插件页核对版本，或重新确认；不会自动重装。' } });
      } catch { if (epoch === this.epoch) this.patch({ operation: { requestId: receipt.requestId, target: receipt.target, phase: 'unknown', message: '暂时无法确认更新结果，请稍后重新确认。' } }); }
    })().finally(() => { if (this.recovery === recovery) this.recovery = undefined; });
    this.recovery = recovery;
    return recovery;
  }
  private installed(requestId: string, target: ReleaseTarget, info: UpdateInfo) {
    const running = info.runningVersion === target.version;
    this.patch({ operation: { requestId, target, phase: running ? 'done' : 'restart',
      message: running ? `已更新到 ${target.version}。` : `已安装 ${target.version}；当前仍运行 ${info.runningVersion}，请保存工作后重启 DSH。` } });
    if (running) write(this.receipts, `${this.key}:pending`, undefined);
  }
  private async result(requestId: string, target: ReleaseTarget, result: ChangeResult) {
    if (this.disposed || this.state.operation?.requestId !== requestId) return;
    if (result.application === 'failed' || result.application === 'cancelled' || result.error || result.application === 'overridden') {
      write(this.receipts, `${this.key}:pending`, undefined);
      const cancelled = result.application === 'cancelled';
      this.patch({ operation: { requestId, target, phase: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'DSH 已确认取消安装。'
        : result.pendingBuilds?.length ? `依赖需要构建确认（${result.pendingBuilds.join('、')}）。请到官方插件页按提示处理；本插件不会自动批准脚本。`
        : result.error?.diagnostic || (String(result.error?.code) === 'already-installed' ? 'DSH 拒绝直接替换此安装来源，请到官方插件页处理。' : '安装或激活未完成，请在官方插件页查看诊断。') } });
      return;
    }
    try {
      const info = await this.remote.info();
      if (this.disposed || this.state.operation?.requestId !== requestId) return;
      if (info.ok && info.value.installedVersion === target.version) { this.patch({ info: info.value }); this.installed(requestId, target, info.value); }
      else if (info.ok && result.application === 'applied' && info.value.source !== target.packageUrl) {
        // A completed install can outlive this client; the user may subsequently
        // roll back or change sources in the official manager. It is no longer
        // an in-flight operation and must not block the next explicit update.
        write(this.receipts, `${this.key}:pending`, undefined);
        this.patch({ info: info.value, operation: { requestId, target, phase: 'failed',
          message: '上次安装已结束，但当前版本或来源已被更改。请核对当前安装后重新检查更新。' } });
      }
      else this.patch({ operation: { requestId, target, phase: 'unknown', message: '安装已返回，版本或激活状态仍待确认，请重新确认。' } });
    } catch { this.patch({ operation: { requestId, target, phase: result.application === 'restart-required' ? 'restart' : 'unknown', message: result.application === 'restart-required' ? `DSH 要求重启以加载 ${target.version}，请先保存工作。` : 'DSH 正在重载插件，请稍后重新确认更新结果。' } }); }
  }
  dispose() { this.disposed = true; this.epoch++; clearTimeout(this.timer); this.listeners.clear(); }
}
