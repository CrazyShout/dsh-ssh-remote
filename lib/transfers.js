var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { randomUUID, createHash } from 'node:crypto';
import { TransferScheduler } from './transfer-scheduler.js';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { parseSshUri } from './types.js';
import { TransferStore, TRANSFER_CHUNK, TRANSFER_PAGE, TRANSFER_RETENTION, TRANSFER_MAX_ENTRIES, transferId, transferBytes, transferPath, validateTransferEntries } from './transfer-store.js';
const digest = (data) => createHash('sha256').update(data).digest('hex');
const supported = (client) => {
    const value = client.capabilities.transfers;
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.persistent !== true) {
        throw new Error('远端 helper 不支持持久传输 v1，请重新连接更新 helper。');
    }
};
export class TransferManager {
    helpers;
    resolve;
    invalidate;
    store;
    scheduler = new TransferScheduler();
    runs = new Map();
    busyFiles = new Set();
    timer;
    disposed = false;
    expiring = new Set();
    constructor(helpers, resolve, invalidate = () => { }, directory = dshHomePath('ssh-transfers', 'v1')) {
        this.helpers = helpers;
        this.resolve = resolve;
        this.invalidate = invalidate;
        this.store = new TransferStore(directory);
        this.timer = setInterval(() => {
            for (const run of this.runs.values())
                if (Date.now() - run.lastActivity > 40_000) {
                    void this.exclusive(run.job, () => this.pauseOwned(run), true).catch(() => { });
                }
        }, 5000);
        this.timer.unref?.();
    }
    root(scope) {
        if (!scope?.sessionId)
            throw new Error('需要有效会话。');
        const root = this.resolve(scope.workspaceRoot);
        if (!root)
            throw new Error('文件传输仅支持 SSH 工作区。');
        return root;
    }
    async owned(scope, id) {
        const job = await this.store.job(transferId(id));
        if (job.rootUri !== this.root(scope))
            throw new Error('此任务属于其他 SSH 工作区。');
        return job;
    }
    summary(job) {
        const { schema: _schema, installation: _installation, sessionId: _session, ...view } = job;
        return { ...view, live: this.runs.has(job.id) };
    }
    exclusive(id, action, stopQueued = false) {
        transferId(id);
        return this.scheduler.control(id, action, stopQueued);
    }
    async channel(rootUri) {
        if (this.disposed)
            throw new Error('传输服务正在关闭。');
        const client = await this.helpers.client(rootUri);
        supported(client);
        const session = client.sessionId;
        const identity = await client.call('transfer/identity');
        if (!/^[0-9a-f]{48}$/u.test(identity.installation))
            throw new Error('远端安装身份无效。');
        const workspaceId = randomUUID(), parsed = parseSshUri(rootUri);
        const channel = { client, session, workspaceId, installation: identity.installation, rootUri };
        try {
            const result = await this.call(channel, 'workspace/open', {
                workspaceId, operationId: workspaceId, path: parsed.path, access: 'workspace-write',
            });
            if (result.path !== parsed.path)
                throw new Error('工作区规范路径已改变，请重新添加工作区。');
            return channel;
        }
        catch (error) {
            await this.closeChannel(channel).catch(() => { });
            throw error;
        }
    }
    call(channel, method, params = {}, signal) {
        if (channel.client.sessionId !== channel.session)
            return Promise.reject(new Error('helper 会话已更换，请重新恢复传输。'));
        const args = { workspaceId: channel.workspaceId, installation: channel.installation, ...params };
        if (channel.client.callInSession)
            return channel.client.callInSession(channel.session, method, args, { timeoutMs: 25_000, mutation: !['transfer/read', 'transfer/status', 'transfer/stat', 'transfer/scan', 'transfer/identity'].includes(method), signal, waitForResume: true });
        return channel.client.call(method, args, { timeoutMs: 25_000, signal, mutation: true });
    }
    async closeChannel(channel) {
        const result = await this.call(channel, 'workspace/close', { operationId: `close:${channel.workspaceId}` });
        if (!result.closed && !result.cancelled)
            throw new Error('传输工作区关闭回执未确认。');
    }
    async list(scope) {
        const root = this.root(scope);
        const jobs = (await this.store.list()).filter(job => job.rootUri === root).sort((a, b) => b.created - a.created);
        // Only reclaim the current, authorized workspace, one bounded job at a time.
        // Browser partial files still require an explicit local directory grant.
        for (const job of jobs) {
            if (!['complete', 'cancelled', 'expired'].includes(job.state) && !this.runs.has(job.id) && Date.now() - job.updated > TRANSFER_RETENTION) {
                if (!this.expiring.size) {
                    this.expiring.add(job.id);
                    void this.control(scope, { id: job.id, run: randomUUID(), action: 'cancel' }).then(async (page) => {
                        if (page.job.state === 'cancelled') {
                            const saved = await this.store.job(job.id);
                            saved.state = 'expired';
                            saved.error = '闲置七天，远端暂存已清理；本地下载暂存仍需重新授权清理。';
                            await this.store.write(job.id, 'job', saved);
                        }
                    }).catch(() => { }).finally(() => this.expiring.delete(job.id));
                }
                job.error = '闲置已超过七天；正在或等待核对远端清理，本地暂存需重新授权。';
            }
        }
        return jobs.map(job => this.summary(job));
    }
    async page(scope, id, cursor = 0) {
        const job = await this.owned(scope, id);
        transferBytes(cursor, job.appended);
        const entries = [];
        let bytes = 0, index = cursor;
        for await (const item of this.store.scan(job, cursor, Math.min(job.appended, cursor + TRANSFER_PAGE))) {
            const size = Buffer.byteLength(JSON.stringify(item));
            if (entries.length && bytes + size > 128 * 1024)
                break;
            entries.push(item);
            bytes += size;
            index++;
        }
        return { job: this.summary(job), entries, next: index, done: index === job.appended };
    }
    async plan(scope, request) {
        return this.exclusive(request.id, async () => {
            const rootUri = this.root(scope), target = transferPath(request.target, true);
            const sources = request.sources;
            if (sources && (request.direction !== 'download' || !sources.length || sources.length > 100))
                throw new Error('多文件下载最多选择 100 个起始路径。');
            if (sources)
                for (const path of sources)
                    transferPath(path, true);
            try {
                const old = await this.owned(scope, request.id);
                if (old.direction !== request.direction || old.target !== target || JSON.stringify(old.sources) !== JSON.stringify(sources))
                    throw new Error('同一任务标识不能改变方向或目标。');
                return this.page(scope, old.id);
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
            const channel = await this.channel(rootUri);
            try {
                const job = { schema: 1, id: request.id, rootUri, sessionId: scope.sessionId, alias: parseSshUri(rootUri).host,
                    direction: request.direction, target, ...(sources ? { sources } : {}), installation: channel.installation, nonce: randomUUID(), state: 'preparing',
                    count: request.direction === 'upload' ? transferBytes(request.count, TRANSFER_MAX_ENTRIES) : 0,
                    totalBytes: request.direction === 'upload' ? transferBytes(request.totalBytes) : 0, appended: 0, created: Date.now(), updated: Date.now() };
                if (!['upload', 'download'].includes(job.direction))
                    throw new Error('无效传输方向。');
                await this.store.create(job);
                if (job.direction === 'download') {
                    const entries = [], started = Date.now();
                    for (const path of sources ?? [target]) {
                        const scanId = randomUUID();
                        let cursor = 0;
                        try {
                            for (;;) {
                                if (Date.now() - started > 15_000)
                                    throw new Error('整批目录扫描超过 15 秒，未静默省略文件。');
                                const result = await this.call(channel, 'transfer/scan', { scanId, path, cursor });
                                entries.push(...result.entries);
                                validateTransferEntries(entries);
                                if (result.done)
                                    break;
                                if (result.next <= cursor)
                                    throw new Error('目录扫描游标未前进。');
                                cursor = result.next;
                            }
                        }
                        finally {
                            await this.call(channel, 'transfer/scanClose', { scanId }).catch(() => { });
                        }
                    }
                    job.count = entries.length;
                    job.totalBytes = entries.reduce((n, e) => n + (e.kind === 'file' ? e.size : 0), 0);
                    for (let offset = 0; offset < entries.length; offset += TRANSFER_PAGE)
                        await this.store.write(job.id, `manifest-${offset / TRANSFER_PAGE}`, entries.slice(offset, offset + TRANSFER_PAGE), true);
                    job.appended = job.count;
                    job.state = 'ready';
                    await this.store.write(job.id, 'job', job);
                }
                else if (!job.count) {
                    job.state = 'ready';
                    await this.store.write(job.id, 'job', job);
                }
                return this.page(scope, job.id);
            }
            catch (error) {
                const job = await this.store.job(request.id).catch(() => undefined);
                if (job) {
                    job.error = String(error);
                    job.state = 'preparing';
                    await this.store.write(job.id, 'job', job);
                }
                throw error;
            }
            finally {
                await this.closeChannel(channel);
            }
        });
    }
    async append(scope, request) {
        return this.exclusive(request.id, async () => {
            const job = await this.owned(scope, request.id);
            if (['cancelled', 'expired', 'running'].includes(job.state))
                throw new Error('任务已开始或终止，不能追加清单。');
            if (job.direction !== 'upload' || request.after % TRANSFER_PAGE || request.entries.length > TRANSFER_PAGE)
                throw new Error('无效上传清单分页。');
            transferBytes(request.after, job.count);
            validateTransferEntries(request.entries);
            const page = `manifest-${request.after / TRANSFER_PAGE}`;
            if (request.after < job.appended) {
                if (JSON.stringify(await this.store.read(job.id, page)) !== JSON.stringify(request.entries))
                    throw new Error('重放的清单内容改变。');
                return this.page(scope, job.id, request.after);
            }
            if (job.appended !== request.after || request.after + request.entries.length > job.count
                || (request.entries.length < TRANSFER_PAGE && request.after + request.entries.length !== job.count))
                throw new Error('上传清单游标不匹配。');
            const prior = [];
            for (let i = 0; i < job.appended; i += TRANSFER_PAGE)
                prior.push(...await this.store.read(job.id, `manifest-${i / TRANSFER_PAGE}`));
            prior.push(...request.entries);
            validateTransferEntries(prior);
            const total = prior.reduce((n, e) => n + (e.kind === 'file' ? e.size : 0), 0);
            if (total > job.totalBytes)
                throw new Error('清单字节数超出声明。');
            try {
                await this.store.write(job.id, page, request.entries, true);
            }
            catch (error) {
                if (error.code !== 'EEXIST' || JSON.stringify(await this.store.read(job.id, page)) !== JSON.stringify(request.entries))
                    throw error;
            }
            job.appended = prior.length;
            job.updated = Date.now();
            if (job.appended === job.count) {
                if (total !== job.totalBytes)
                    throw new Error('清单字节数不匹配。');
                job.state = 'ready';
            }
            await this.store.write(job.id, 'job', job);
            return this.page(scope, job.id, request.after);
        });
    }
    running(job, run) {
        const execution = this.runs.get(job.id);
        if (!execution || execution.run !== transferId(run))
            throw new Error('执行身份已失效，请先恢复任务。');
        if (execution.installation !== job.installation)
            throw new Error('远端身份改变。');
        execution.lastActivity = Date.now();
        return execution;
    }
    async control(scope, request) {
        if (request.action === 'pause' || request.action === 'cancel') {
            transferId(request.id);
            transferId(request.run);
            const run = this.runs.get(request.id);
            if (run) {
                if (run.rootUri !== this.root(scope))
                    throw new Error('此任务属于其他 SSH 工作区。');
                if (run.run !== request.run)
                    throw new Error('任务正在另一个窗口执行，请在那里停止。');
            }
            else
                await this.owned(scope, request.id);
        }
        return this.exclusive(request.id, async () => {
            const job = await this.owned(scope, request.id);
            transferId(request.run);
            if (request.action === 'forget') {
                if (!['complete', 'cancelled', 'expired'].includes(job.state) || this.runs.has(job.id))
                    throw new Error('请先完成或确认取消任务，再清理记录。');
                await this.store.forget(job.id);
                return { job: this.summary(job), entries: [], next: 0, done: true };
            }
            if (request.action === 'resume') {
                if (['cancelled', 'expired', 'complete'].includes(job.state))
                    throw new Error('任务已完成或终止，不会自动重新创建。');
                if (job.appended !== job.count || job.state === 'preparing')
                    throw new Error('清单未准备完成，请重新创建计划。');
                if (Date.now() - job.updated > TRANSFER_RETENTION)
                    throw new Error('任务已闲置超过七天，请清理后重新创建。');
                if (job.direction === 'download') {
                    const destination = transferId(request.destination ?? '');
                    if (job.destination && job.destination !== destination)
                        throw new Error('下载目标目录不是此任务最初授权的目录。');
                    if (!job.destination) {
                        job.destination = destination;
                        await this.store.write(job.id, 'job', job);
                    }
                }
                const previous = this.runs.get(job.id);
                if (previous) {
                    if (previous.run !== request.run)
                        throw new Error('任务正在另一个窗口执行。');
                }
                else {
                    const channel = await this.channel(job.rootUri);
                    try {
                        if (channel.installation !== job.installation)
                            throw new Error('SSH alias 指向的远端安装身份已改变，拒绝续传。');
                        await this.call(channel, 'transfer/job', { jobId: job.id, owner: request.run, action: 'claim' });
                        let remaining = 0;
                        for await (const file of this.store.scan(job))
                            if (!['complete', 'skipped'].includes(file.state))
                                remaining++;
                        this.runs.set(job.id, { ...channel, run: request.run, job: job.id, active: new Set(), lastActivity: Date.now(), remaining });
                    }
                    catch (error) {
                        await this.closeChannel(channel).catch(() => { });
                        throw error;
                    }
                }
                job.state = 'running';
                job.error = undefined;
                job.updated = Date.now();
                await this.store.write(job.id, 'job', job);
                await this.maybeComplete(job, this.runs.get(job.id));
            }
            else if (request.action === 'heartbeat') {
                const run = this.running(job, request.run);
                await this.call(run, 'transfer/job', { jobId: job.id, owner: run.run, action: 'renew' });
                for (const index of run.active) {
                    const file = await this.store.file(job, index);
                    await this.call(run, 'transfer/renew', { id: file.id, owner: run.run });
                }
                job.updated = Date.now();
                await this.store.write(job.id, 'job', job);
            }
            else if (request.action === 'pause') {
                await this.pauseOwned(this.running(job, request.run));
            }
            else if (request.action === 'cancel') {
                let run = this.runs.get(job.id), ownChannel = false;
                if (run && run.run !== request.run)
                    throw new Error('任务正在另一个窗口执行，请在那里停止。');
                if (!run) {
                    const channel = await this.channel(job.rootUri);
                    run = { ...channel, job: job.id, run: request.run, active: new Set(), lastActivity: Date.now(), remaining: 0 };
                    ownChannel = true;
                }
                try {
                    if (run.installation !== job.installation)
                        throw new Error('远端身份改变，无法确认清理。');
                    await this.call(run, 'transfer/job', { jobId: job.id, owner: run.run, action: 'cleanup' });
                    const failures = [], deadline = Date.now() + 15_000;
                    for (let i = 0; i < job.appended; i++) {
                        if (Date.now() > deadline) {
                            failures.push('本次清理已达时间预算；再次取消以继续清理。');
                            break;
                        }
                        const file = await this.store.file(job, i);
                        if (file.kind !== 'file' || ['complete', 'skipped', 'queued'].includes(file.state))
                            continue;
                        try {
                            await this.call(run, 'transfer/cancel', { id: file.id, jobId: job.id, owner: run.run, path: this.remotePath(job, file), direction: job.direction });
                            file.state = 'skipped';
                            file.error = '已取消未完成项';
                            await this.store.saveFile(job, file);
                        }
                        catch (error) {
                            failures.push(String(error));
                        }
                    }
                    if (failures.length)
                        throw new Error('部分暂存清理未确认：' + failures[0]);
                    await this.call(run, 'transfer/job', { jobId: job.id, owner: run.run, action: 'cancel' });
                    job.state = 'cancelled';
                    job.error = undefined;
                }
                catch (error) {
                    job.state = 'cleanup-pending';
                    job.error = String(error);
                }
                finally {
                    job.updated = Date.now();
                    await this.store.write(job.id, 'job', job);
                    for (const index of run.active)
                        this.busyFiles.delete(`${job.id}:${index}`);
                    this.runs.delete(job.id);
                    await this.closeChannel(run).catch(() => { });
                }
                void ownChannel;
            }
            else
                throw new Error('无效任务操作。');
            const result = await this.page(scope, job.id);
            if (request.action === 'resume')
                result.run = request.run;
            return result;
        }, request.action === 'pause' || request.action === 'cancel');
    }
    async pauseOwned(run) {
        if (this.runs.get(run.job) !== run)
            return;
        const job = await this.store.job(run.job);
        const failures = [];
        for (const index of run.active) {
            try {
                const file = await this.store.file(job, index);
                await this.call(run, 'transfer/pause', { id: file.id, owner: run.run });
                file.state = 'paused';
                await this.store.saveFile(job, file);
            }
            catch (error) {
                failures.push(String(error));
            }
            this.busyFiles.delete(`${job.id}:${index}`);
        }
        try {
            await this.call(run, 'transfer/job', { jobId: job.id, owner: run.run, action: 'pause' });
        }
        catch (error) {
            failures.push(String(error));
        }
        try {
            await this.closeChannel(run);
        }
        catch (error) {
            failures.push(String(error));
        }
        this.runs.delete(job.id);
        job.state = failures.length ? 'cleanup-pending' : 'paused';
        job.error = failures[0];
        job.updated = Date.now();
        await this.store.write(job.id, 'job', job);
    }
    remotePath(job, file) { return job.direction === 'upload' ? [job.target, file.path].filter(Boolean).join('/') : file.path; }
    async file(scope, request) {
        return this.scheduler.file(request.id, request.index, async () => {
            const job = await this.owned(scope, request.id), run = this.running(job, request.run), file = await this.store.file(job, request.index);
            const wasComplete = ['complete', 'skipped'].includes(file.state);
            const args = { id: file.id, owner: run.run };
            let result;
            try {
                if (request.action === 'skip') {
                    if (!['queued', 'skipped'].includes(file.state))
                        throw new Error('请先取消已尝试开始的文件，不能隐藏其暂存或未知发布结果。');
                    file.state = 'skipped';
                }
                else if (request.action === 'retry') {
                    if (file.state === 'complete')
                        throw new Error('已完成项不会重传。');
                    file.state = 'paused';
                    file.error = undefined;
                }
                else if (request.action === 'begin') {
                    if (file.state === 'complete' || file.state === 'skipped')
                        return { file };
                    const path = this.remotePath(job, file);
                    transferPath(path);
                    if (file.kind === 'directory') {
                        if (job.direction === 'upload')
                            await this.call(run, 'transfer/mkdir', { path });
                        file.state = 'complete';
                    }
                    else {
                        if (!run.active.has(file.index) && this.busyFiles.size >= 2)
                            throw new Error('同时最多传输两个文件。');
                        run.active.add(file.index);
                        this.busyFiles.add(`${job.id}:${file.index}`);
                        if (job.direction === 'upload') {
                            if (!request.sha256 || !/^[0-9a-f]{64}$/u.test(request.sha256))
                                throw new Error('缺少完整源文件 SHA-256。');
                            if (file.sha256 && file.sha256 !== request.sha256)
                                throw new Error('重新选择的源文件内容已改变，拒绝拼接。');
                            file.sha256 = request.sha256;
                            if (file.replaceVersion === undefined) {
                                const current = await this.call(run, 'transfer/stat', { path });
                                if (current.exists && !request.replace)
                                    throw new Error('远端文件已存在；请明确勾选覆盖并重新尝试。');
                                file.replaceVersion = current.exists ? current.version : null;
                            }
                        }
                        // Persist admission before dispatch: a lost open response remains visible to Cancel.
                        file.state = 'verifying';
                        await this.store.saveFile(job, file);
                        result = await this.call(run, 'transfer/open', { ...args, jobId: job.id, path, direction: job.direction,
                            size: file.size, ...(job.direction === 'upload' ? { sha256: file.sha256, replaceVersion: file.replaceVersion } : { version: file.version }) });
                        if (result.state !== 'complete')
                            result = await this.call(run, 'transfer/claim', { ...args, ...(job.direction === 'download' ? { offset: transferBytes(request.offset ?? 0, file.size) } : {}) });
                    }
                }
                else if (request.action === 'verify')
                    result = await this.call(run, 'transfer/verify', args);
                else if (request.action === 'finish') {
                    result = await this.call(run, 'transfer/finish', { ...args, sha256: request.sha256 });
                    if (result.state !== 'complete')
                        throw new Error('文件发布回执未确认。');
                    if (job.direction === 'upload')
                        this.invalidate(scope.workspaceRoot);
                }
                else
                    throw new Error('无效文件操作。');
                if (result) {
                    file.offset = transferBytes(result.offset, file.size);
                    file.state = result.state === 'complete' ? 'complete' : result.state === 'verifying' ? 'verifying' : 'transferring';
                    if (result.sha256)
                        file.sha256 = result.sha256;
                }
                file.error = undefined;
                await this.store.saveFile(job, file);
                if (!wasComplete && ['complete', 'skipped'].includes(file.state))
                    run.remaining--;
                if (['complete', 'skipped'].includes(file.state)) {
                    run.active.delete(file.index);
                    this.busyFiles.delete(`${job.id}:${file.index}`);
                }
                await this.maybeComplete(job, run);
                return { file, state: result?.state, verifyOffset: result?.verifyOffset, prefix: result?.prefix ?? undefined };
            }
            catch (error) {
                file.state = request.action === 'finish' ? 'unknown' : 'failed';
                file.error = String(error);
                await this.store.saveFile(job, file);
                throw error;
            }
        });
    }
    async maybeComplete(job, run) {
        if (run.active.size || run.remaining > 0)
            return;
        await this.call(run, 'transfer/job', { jobId: job.id, owner: run.run, action: 'pause' });
        await this.closeChannel(run);
        this.runs.delete(job.id);
        job.state = 'complete';
        job.updated = Date.now();
        await this.store.write(job.id, 'job', job);
    }
    async upload(scope, id, index, runId, offset, bytes, expectedHash, signal) {
        return this.scheduler.file(id, index, async () => {
            const job = await this.owned(scope, id), run = this.running(job, runId), file = await this.store.file(job, index);
            if (job.direction !== 'upload' || !run.active.has(index) || bytes.length > TRANSFER_CHUNK || digest(bytes) !== expectedHash)
                throw new Error('上传执行身份、分块大小或校验失败。');
            transferBytes(offset, file.size);
            const result = await this.call(run, 'transfer/write', { id: file.id, owner: run.run, offset, data: Buffer.from(bytes).toString('base64'), sha256: expectedHash }, signal);
            file.offset = transferBytes(result.offset, file.size);
            file.state = 'transferring';
            await this.store.saveFile(job, file);
            return file;
        });
    }
    async download(scope, id, index, runId, offset, signal) {
        return this.scheduler.file(id, index, async () => {
            const job = await this.owned(scope, id), run = this.running(job, runId), file = await this.store.file(job, index);
            if (job.direction !== 'download' || !run.active.has(index))
                throw new Error('下载执行身份失效。');
            transferBytes(offset, file.size);
            const result = await this.call(run, 'transfer/read', { id: file.id, owner: run.run, offset }, signal);
            const bytes = Buffer.from(result.data, 'base64');
            if (result.offset !== offset || bytes.length > TRANSFER_CHUNK || digest(bytes) !== result.sha256)
                throw new Error('远端下载分块校验失败。');
            file.offset = Math.max(file.offset, offset + bytes.length);
            file.state = 'transferring';
            await this.store.saveFile(job, file);
            return { bytes, sha256: result.sha256 };
        });
    }
    async dispose() {
        this.disposed = true;
        clearInterval(this.timer);
        await Promise.allSettled([...this.runs.values()].map(run => this.exclusive(run.job, () => this.pauseOwned(run), true)));
    }
}
let SshRemoteTransfers = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _plan_decorators;
    let _append_decorators;
    let _page_decorators;
    let _control_decorators;
    let _file_decorators;
    return class SshRemoteTransfers extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _plan_decorators = [Remote];
            _append_decorators = [Remote];
            _page_decorators = [Remote];
            _control_decorators = [Remote];
            _file_decorators = [Remote];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _plan_decorators, { kind: "method", name: "plan", static: false, private: false, access: { has: obj => "plan" in obj, get: obj => obj.plan }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _append_decorators, { kind: "method", name: "append", static: false, private: false, access: { has: obj => "append" in obj, get: obj => obj.append }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _page_decorators, { kind: "method", name: "page", static: false, private: false, access: { has: obj => "page" in obj, get: obj => obj.page }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _control_decorators, { kind: "method", name: "control", static: false, private: false, access: { has: obj => "control" in obj, get: obj => obj.control }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _file_decorators, { kind: "method", name: "file", static: false, private: false, access: { has: obj => "file" in obj, get: obj => obj.file }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        manager = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, manager) {
            super(ctx, 'sshRemoteTransfers');
            this.manager = manager;
        }
        async list(scope, signal) { signal.throwIfAborted(); return this.manager.list(scope); }
        plan(scope, request) { return this.manager.plan(scope, request); }
        append(scope, request) { return this.manager.append(scope, request); }
        async page(scope, id, cursor, signal) { signal.throwIfAborted(); return this.manager.page(scope, id, cursor); }
        control(scope, request) { return this.manager.control(scope, request); }
        file(scope, request) { return this.manager.file(scope, request); }
    };
})();
export { SshRemoteTransfers };
/** Existing Connection carrier owns authentication, origin fencing and streaming backpressure. */
export function mountTransferHttp(ctx, manager) {
    const fiber = ctx.inject(['connection', 'workspaceFiles', 'sessions', 'typert'], scope => {
        const disposers = ['upload', 'download'].map(direction => scope.connection.fetch.register({
            path: `/api/ssh-transfers/${direction}`, methods: ['POST'], requestBody: 'streaming',
            fetch: async (request) => {
                try {
                    const url = new URL(request.url), sessionId = url.searchParams.get('sessionId');
                    if (!sessionId)
                        throw new Error('需要会话身份。');
                    const owner = await scope.typert.lookups.get('workspaceFileScope')?.resolve(sessionId);
                    if (!owner)
                        throw new Error('会话不存在或不可访问。');
                    const id = transferId(url.searchParams.get('id') ?? ''), index = transferBytes(Number(url.searchParams.get('index')), TRANSFER_MAX_ENTRIES - 1);
                    const run = transferId(request.headers.get('x-dsh-transfer-run') ?? ''), offset = transferBytes(Number(url.searchParams.get('offset')));
                    if (direction === 'upload') {
                        const reader = request.body?.getReader();
                        if (!reader)
                            throw new Error('缺少上传数据。');
                        const chunks = [];
                        let size = 0;
                        try {
                            for (;;) {
                                const item = await reader.read();
                                if (item.done)
                                    break;
                                size += item.value.length;
                                if (size > TRANSFER_CHUNK)
                                    throw new Error('分块超过 256 KiB。');
                                chunks.push(item.value);
                            }
                        }
                        finally {
                            await reader.cancel().catch(() => { });
                            reader.releaseLock();
                        }
                        const file = await manager.upload(owner, id, index, run, offset, Buffer.concat(chunks), request.headers.get('x-content-sha256') ?? '', request.signal);
                        return Response.json(file, { headers: { 'cache-control': 'no-store' } });
                    }
                    const result = await manager.download(owner, id, index, run, offset, request.signal);
                    return new Response(Buffer.from(result.bytes), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(result.bytes.length),
                            'x-content-sha256': result.sha256, 'cache-control': 'no-store' } });
                }
                catch (error) {
                    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409, headers: { 'cache-control': 'no-store' } });
                }
            },
        }));
        return async () => { await Promise.all(disposers.map(dispose => dispose())); };
    });
    return async () => { await fiber.dispose(); };
}
//# sourceMappingURL=transfers.js.map