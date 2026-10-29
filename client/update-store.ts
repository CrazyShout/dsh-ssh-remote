import { t } from './locale.js';
import type { ClientRemote, PluginInstallRequestId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseCheck, ReleaseTarget, UpdateInfo, UpdatesRemote } from 'dsh-ssh-remote/updates';
type Installer = Pick<ClientRemote['pluginManager'], 'installBundle' | 'waitForInstall' | 'cancelInstall'>;
import { clearReceipt, compactResult, readReceipt, writeReceipt, type StorageLike, type UpdateReceipt, type UpdateResultSummary } from './update-receipt.js';
type Phase = 'installing' | 'applying' | 'unknown' | 'failed' | 'cancelled' | 'restart' | 'done';
export interface UpdateOperation {
    requestId: string;
    target: ReleaseTarget;
    phase: Phase;
    message: string;
    canDismiss?: boolean;
    recovering?: boolean;
    logPath?: string;
    stage?: string;
}
export interface UpdateSnapshot {
    info?: UpdateInfo;
    release?: ReleaseCheck;
    checking: boolean;
    automatic: boolean;
    dismissed: string;
    error: string;
    infoError: string;
    receiptError: string;
    operation?: UpdateOperation;
}
/** Releases are stable triples; an installed prerelease of that same triple precedes the stable version. */
export function newerRelease(target: string, current: string) {
    const parse = (s: string) => /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.exec(s);
    const a = parse(target), b = parse(current);
    if (!a || !b || a[4])
        return false;
    for (let i = 1; i <= 3; i++)
        if (Number(a[i]) !== Number(b[i]))
            return Number(a[i]) > Number(b[i]);
    return Boolean(b[4]);
}
export function validTarget(value: unknown): value is ReleaseTarget {
    if (!value || typeof value !== 'object')
        return false;
    const r = value as ReleaseTarget;
    return /^\d+\.\d+\.\d+$/u.test(r.version) && r.packageUrl === `https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v${r.version}/dsh-ssh-remote-${r.version}.tgz`
        && r.url === `https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v${r.version}` && /^[a-f0-9]{64}$/u.test(r.sha256);
}
function read<T>(storage: StorageLike | undefined, key: string): T | undefined {
    try {
        const raw = storage?.getItem(key);
        return raw && raw.length < 16384 ? JSON.parse(raw) as T : undefined;
    }
    catch {
        return undefined;
    }
}
function write(storage: StorageLike | undefined, key: string, value: unknown) {
    try {
        if (value === undefined)
            storage?.removeItem(key);
        else
            storage?.setItem(key, JSON.stringify(value));
    }
    catch { /* Storage-disabled browsers still support the active operation. */ }
}
export function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
    try {
        return window[kind];
    }
    catch {
        return undefined;
    }
}
/** One controller per client. Package writes remain owned by the official installer. */
export class UpdateStore {
    private state: UpdateSnapshot = { checking: false, automatic: true, dismissed: '', error: '', infoError: '', receiptError: '' };
    private readonly listeners = new Set<() => void>();
    private epoch = 0;
    private operationGeneration = 0;
    private infoSequence = 0;
    private disposed = false;
    private key = '';
    private pending?: UpdateReceipt;
    private infoTask?: Promise<UpdateInfo | undefined>;
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
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener();
    }
    private acceptInfo(info: UpdateInfo) {
        const key = `dsh-ssh-remote:updates:${info.profileId}`;
        if (key !== this.key) {
            this.key = key;
            this.operationGeneration++;
            this.recovery = undefined;
            const prefs = read<{ automatic?: boolean; dismissed?: string }>(this.preferences, key);
            const saved = readReceipt(this.receipts, key + ':pending');
            this.pending = saved.receipt;
            this.patch({ release: undefined, operation: undefined, receiptError: saved.error
                ? t('上次更新记录无法读取。请核对当前版本，并在官方插件页处理。') : '',
                automatic: prefs?.automatic !== false, dismissed: typeof prefs?.dismissed === 'string' ? prefs.dismissed : '' });
        }
        this.patch({ info, infoError: '' });
    }
    /** Post-operation callers force a new read instead of joining a pre-install snapshot. */
    private readInfo(fresh = false): Promise<UpdateInfo | undefined> {
        if (this.disposed) return Promise.resolve(undefined);
        if (!fresh && this.infoTask) return this.infoTask;
        const epoch = this.epoch, sequence = ++this.infoSequence;
        let task!: Promise<UpdateInfo | undefined>;
        task = (async (): Promise<UpdateInfo | undefined> => {
            try {
                const result = await this.remote.info();
                if (this.disposed || epoch !== this.epoch) return;
                if (sequence !== this.infoSequence)
                    return this.infoTask === task ? undefined : this.infoTask ?? (this.state.infoError ? undefined : this.state.info);
                if (!result.ok) throw new Error(result.error.message);
                this.acceptInfo(result.value);
                return result.value;
            } catch (error) {
                if (this.disposed || epoch !== this.epoch) return;
                if (sequence !== this.infoSequence)
                    return this.infoTask === task ? undefined : this.infoTask ?? (this.state.infoError ? undefined : this.state.info);
                this.patch({ infoError: t('无法读取插件版本：{value1}', { value1: String(error instanceof Error ? error.message : error) }) });
            }
        })().finally(() => { if (this.infoTask === task) this.infoTask = undefined; });
        this.infoTask = task;
        return task;
    }
    /** Public plugin-manager/changed notifications coalesce within one event turn. */
    private refreshTask?: Promise<void>;
    refreshInstallation(): Promise<void> {
        if (this.refreshTask) return this.refreshTask;
        const epoch = this.epoch;
        const task = Promise.resolve().then(async () => {
            if (epoch !== this.epoch || this.disposed) return;
            await this.readInfo(true);
        }).finally(() => { if (this.refreshTask === task) this.refreshTask = undefined; });
        this.refreshTask = task;
        return task;
    }
    private remember(receipt: UpdateReceipt) {
        this.pending = receipt;
        writeReceipt(this.receipts, this.key + ':pending', receipt);
    }
    private forget(requestId: string) {
        if (this.pending?.requestId === requestId) this.pending = undefined;
        if (readReceipt(this.receipts, this.key + ':pending').receipt?.requestId === requestId)
            clearReceipt(this.receipts, this.key + ':pending');
    }
    private guard(requestId: string, generation: number, epoch: number, key: string) {
        return !this.disposed && epoch === this.epoch && generation === this.operationGeneration
            && key === this.key && this.state.operation?.requestId === requestId;
    }
    async start() {
        const epoch = ++this.epoch;
        this.operationGeneration++;
        this.infoSequence++;
        this.infoTask = undefined; this.checkTask = undefined; this.recovery = undefined; this.refreshTask = undefined;
        clearTimeout(this.timer);
        this.patch({ checking: true, error: '' });
        const info = await this.readInfo(true);
        if (this.disposed || epoch !== this.epoch) return;
        this.patch({ checking: false });
        if (!info) return;
        const saved = readReceipt(this.receipts, this.key + ':pending');
        if (!this.pending) this.pending = saved.receipt;
        this.patch({ receiptError: saved.error ? t('上次更新记录无法读取。请核对当前版本，并在官方插件页处理。') : '' });
        if (this.pending) void this.reconcile();
        if (this.state.automatic && this.visible) void this.check(false);
    }
    setVisible(visible: boolean) {
        this.visible = visible;
        clearTimeout(this.timer);
        if (visible && this.state.info && this.state.automatic) void this.check(false);
    }
    setAutomatic(automatic: boolean) {
        this.patch({ automatic }); this.savePreferences(); clearTimeout(this.timer);
        if (automatic && this.visible) void this.check(false);
    }
    dismiss() { this.patch({ dismissed: this.state.release?.latest?.version ?? '' }); this.savePreferences(); }
    private savePreferences() {
        if (this.key) write(this.preferences, this.key, { automatic: this.state.automatic, dismissed: this.state.dismissed });
    }
    check(force = true): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.checkTask) return this.checkTask;
        const epoch = this.epoch;
        this.patch({ checking: true });
        const task = (async () => {
            // A failed GitHub call must not discard a successful local-version refresh.
            const info = force || !this.state.info || this.state.infoError ? this.readInfo(true) : Promise.resolve(this.state.info);
            const release = this.remote.check(force).catch(error => ({ ok: false as const,
                error: { message: t('检查更新失败：{value1}', { value1: String(error instanceof Error ? error.message : error) }) } }));
            const [, answer] = await Promise.all([info, release]);
            if (this.disposed || epoch !== this.epoch) return;
            this.patch(answer.ok ? { release: answer.value, error: '' } : { release: undefined, error: answer.error.message });
        })().finally(() => {
            if (this.checkTask === task) this.checkTask = undefined;
            if (epoch !== this.epoch || this.disposed) return;
            this.patch({ checking: false });
            clearTimeout(this.timer);
            if (this.visible && this.state.automatic)
                this.timer = setTimeout(() => { void this.check(false); },
                    this.state.error || this.state.infoError || this.state.release?.error ? 5 * 60000 : 6 * 60 * 60000);
        });
        this.checkTask = task;
        return task;
    }
    available() {
        const { info, release, infoError, receiptError } = this.state;
        return !infoError && !receiptError && info && release?.latest && !release.error && validTarget(release.latest)
            && newerRelease(release.latest.version, info.installedVersion) ? release.latest : undefined;
    }
    busy() { return Boolean(this.state.receiptError) || ['installing', 'applying', 'unknown'].includes(this.state.operation?.phase ?? ''); }
    async install(target: ReleaseTarget) {
        if (this.busy() || this.disposed) return;
        const previous = this.state.info;
        if (!previous || !validTarget(target) || this.available()?.packageUrl !== target.packageUrl) return;
        const epoch = this.epoch, generation = ++this.operationGeneration, key = this.key;
        let requestId = '';
        const live = () => this.guard(requestId, generation, epoch, key);
        this.patch({ operation: { requestId, target, phase: 'installing', message: t('正在核对安装来源…') } });
        try {
            const info = await this.readInfo(true);
            if (!live()) return;
            if (!info) throw new Error(this.state.infoError);
            if (info.profileId !== previous.profileId || info.source !== previous.source || info.installedVersion !== previous.installedVersion)
                throw new Error(t('安装来源或版本已改变，请重新检查更新。'));
            if (info.sourceKind !== 'release')
                throw new Error(info.sourceKind === 'development' ? t('源码链接安装请使用 Git 同步，不会被安装包覆盖。') : t('此安装来源不支持直接更新，请使用官方插件页。'));
            if (!newerRelease(target.version, info.installedVersion)) throw new Error(t('目标不再是更新版本，请重新检查。'));
            requestId = crypto.randomUUID();
            this.remember({ version: 2, requestId, target });
            this.patch({ operation: { requestId, target, phase: 'installing', message: t('正在通过 DSH 安装 {value1}…', { value1: target.version }) } });
            const answer = await this.installer.installBundle(target.packageUrl, { requestId: requestId as PluginInstallRequestId, enabled: info.enabled });
            if (answer.ok) {
                const result = compactResult(answer.value);
                // HMR can dispose the old client before the response. Keep only this receipt's summary.
                if (readReceipt(this.receipts, key + ':pending').receipt?.requestId === requestId)
                    writeReceipt(this.receipts, key + ':pending', { version: 2, requestId, target, result });
                if (live()) {
                    this.remember({ version: 2, requestId, target, result });
                    await this.result(requestId, target, result);
                }
            } else if (live()) {
                this.patch({ operation: { requestId, target, phase: 'unknown', canDismiss: false,
                    message: t('安装响应未确认，请重新确认结果；不会自动重装。') } });
                await this.readInfo(true);
            }
        } catch (error) {
            if (!live()) return;
            this.patch({ operation: { requestId, target, phase: requestId ? 'unknown' : 'failed', canDismiss: false,
                message: String(error instanceof Error ? error.message : error) } });
            if (requestId) await this.readInfo(true);
        }
    }
    progress(requestId: string, phase: string) {
        const op = this.state.operation;
        if (op?.requestId !== requestId || !this.busy() || op.canDismiss) return;
        if (phase === 'applying') this.patch({ operation: { ...op, phase: 'applying', canDismiss: false, message: t('安装包已就绪，DSH 正在应用更新…') } });
    }
    async cancel() {
        const op = this.state.operation;
        if (!op?.requestId || !['installing', 'unknown'].includes(op.phase)) return;
        const epoch = this.epoch, generation = this.operationGeneration, key = this.key;
        const live = () => this.guard(op.requestId, generation, epoch, key);
        try {
            const answer = await this.installer.cancelInstall(op.requestId as PluginInstallRequestId);
            if (!live() || !this.busy()) return;
            await this.readInfo(true);
            if (!live() || !this.busy()) return;
            if (answer.ok && answer.value.status === 'cancelled') {
                this.forget(op.requestId);
                this.operationGeneration++;
                this.patch({ operation: { ...op, phase: 'cancelled', canDismiss: false, recovering: false, message: t('DSH 已确认取消安装。') } });
            } else {
                this.patch({ operation: { ...op, phase: 'unknown', canDismiss: false, recovering: false, message: t('安装可能已进入应用阶段，请重新确认结果。') } });
            }
        } catch {
            if (live() && this.busy()) this.patch({ operation: { ...op, phase: 'unknown', canDismiss: false, recovering: false, message: t('取消结果未确认，请重新确认安装结果。') } });
        }
    }
    reconcile(): Promise<void> {
        if (this.recovery) return this.recovery;
        const stored = readReceipt(this.receipts, this.key + ':pending').receipt;
        // An old HMR instance may publish its final summary after this instance
        // already loaded the pending skeleton. Adopt only that exact request.
        if (this.pending && stored?.requestId === this.pending.requestId && stored.result && !this.pending.result)
            this.pending = stored;
        const receipt = this.pending ?? stored;
        if (!receipt || this.disposed) return Promise.resolve();
        const { requestId, target } = receipt;
        const epoch = this.epoch, generation = this.operationGeneration, key = this.key;
        const live = () => this.guard(requestId, generation, epoch, key);
        this.patch({ operation: { requestId, target, phase: 'unknown', canDismiss: false, recovering: true, message: t('正在确认上次更新结果…') } });
        const task = (async () => {
            try {
                if (receipt.result) { await this.result(requestId, target, receipt.result); return; }
                // null only means this request is no longer active in this Host.
                const answer = await this.installer.waitForInstall(requestId as PluginInstallRequestId);
                if (!live()) return;
                if (!answer.ok) throw new Error(answer.error.message);
                if (answer.value) {
                    const result = compactResult(answer.value);
                    this.remember({ version: 2, requestId, target, result });
                    await this.result(requestId, target, result);
                    return;
                }
                // This read MUST happen after null, not before the manager's lookup.
                const info = await this.readInfo(true);
                if (!live()) return;
                if (!info) throw new Error(this.state.infoError);
                if (info.installedVersion === target.version) this.installed(requestId, target, info);
                else this.patch({ operation: { requestId, target, phase: 'unknown', canDismiss: true, recovering: false,
                    message: t('DSH 中已找不到这次安装请求。当前版本已重新读取。') } });
            } catch {
                if (live()) this.patch({ operation: { requestId, target, phase: 'unknown', canDismiss: false, recovering: false,
                    message: t('暂时无法确认更新结果，请稍后重新确认。') } });
            }
        })().finally(() => { if (this.recovery === task) this.recovery = undefined; });
        this.recovery = task;
        return task;
    }
    async finishUnknown() {
        const op = this.state.operation;
        if (this.disposed || op?.phase !== 'unknown' || !op.canDismiss || op.recovering) return;
        const epoch = this.epoch, generation = this.operationGeneration, key = this.key;
        await this.reconcile();
        if (!this.guard(op.requestId, generation, epoch, key) || !this.state.operation?.canDismiss) return;
        this.forget(op.requestId);
        this.operationGeneration++;
        this.infoSequence++;
        this.patch({ operation: undefined });
    }
    private installed(requestId: string, target: ReleaseTarget, info: UpdateInfo) {
        const running = info.runningVersion === target.version;
        this.patch({ operation: { requestId, target, phase: running ? 'done' : 'restart', canDismiss: false, recovering: false,
            message: running ? t('已更新到 {value1}。', { value1: target.version }) : t('已安装 {value1}；当前仍运行 {value2}，请保存工作后重启 DSH。', { value1: target.version, value2: info.runningVersion }) } });
        if (running) this.forget(requestId);
    }
    private async result(requestId: string, target: ReleaseTarget, result: UpdateResultSummary) {
        const epoch = this.epoch, generation = this.operationGeneration, key = this.key;
        const live = () => this.guard(requestId, generation, epoch, key);
        if (!live()) return;
        const info = await this.readInfo(true);
        if (!live()) return;
        const details = { stage: result.stage, logPath: result.packageResult?.logPath, canDismiss: false, recovering: false };
        if (result.application === 'failed' || result.application === 'cancelled' || result.error || result.application === 'overridden') {
            this.forget(requestId);
            const cancelled = result.application === 'cancelled';
            this.patch({ operation: { requestId, target, ...details, phase: cancelled ? 'cancelled' : 'failed',
                message: cancelled ? t('DSH 已确认取消安装。') : result.pendingBuilds?.length
                    ? t('依赖需要构建确认（{value1}）。请到官方插件页按提示处理；本插件不会自动批准脚本。', { value1: result.pendingBuilds.join('、') })
                    : result.error?.diagnostic || (String(result.error?.code) === 'already-installed'
                        ? t('DSH 拒绝直接替换此安装来源，请到官方插件页处理。') : t('安装或激活未完成，请在官方插件页查看诊断。')) } });
        } else if (info?.installedVersion === target.version) {
            this.installed(requestId, target, info);
        } else if (info && result.application === 'applied') {
            this.forget(requestId);
            this.patch({ operation: { requestId, target, ...details, phase: 'failed',
                message: t('上次安装已结束，但当前版本或来源已被更改。请核对当前安装后重新检查更新。') } });
        } else {
            this.patch({ operation: { requestId, target, ...details, phase: result.application === 'restart-required' ? 'restart' : 'unknown',
                message: result.application === 'restart-required' ? t('DSH 要求重启以加载 {value1}，请先保存工作。', { value1: target.version })
                    : t('安装已返回，版本或激活状态仍待确认，请重新确认。') } });
        }
    }
    dispose() { this.disposed = true; this.epoch++; this.operationGeneration++; this.infoSequence++; clearTimeout(this.timer); this.listeners.clear(); }
}
