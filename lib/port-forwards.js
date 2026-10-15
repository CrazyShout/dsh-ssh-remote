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
import { fork } from 'node:child_process';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { parseSshUri } from './types.js';
import { hasConcreteSshAlias } from './ssh-config.js';
import { bounded, validateForwardSpec } from './port-forward-transport.js';
import { redactHelperDiagnostic } from './helper/installer.js';
const idPattern = /^[a-zA-Z0-9-]{16,80}$/u;
const unknown = () => ({ state: 'unknown', message: '尚未检查远端 TCP 端口。' });
/** A Host owns listeners; authenticated Sessions can manage only their workspace's records. */
export class PortForwardManager {
    resolve;
    options;
    records = new Map();
    ports = new Map();
    disposed = false;
    now;
    constructor(resolve, options = {}) {
        this.resolve = resolve;
        this.options = options;
        this.now = options.now ?? Date.now;
    }
    identity(scope) {
        if (!scope?.sessionId || !scope.workspaceRoot)
            throw new Error('需要有效会话。');
        const uri = this.resolve(scope.workspaceRoot);
        if (!uri)
            throw new Error('端口转发只支持已注册的 SSH 工作区。');
        const alias = parseSshUri(uri).host;
        return { owner: uri, alias };
    }
    list(scope) {
        const { owner, alias } = this.identity(scope);
        this.prune();
        return { host: hostname(), alias, supported: process.platform !== 'win32', items: [...this.records.values()]
                .filter(r => r.owner === owner && r.fingerprint).sort((a, b) => Number(this.ports.get(b.view.localPort) === b) - Number(this.ports.get(a.view.localPort) === a) || b.view.createdAt - a.view.createdAt)
                .slice(0, 32).map(r => this.view(r)) };
    }
    create(scope, input) {
        if (this.disposed)
            throw new Error('端口转发已关闭。');
        if (process.platform === 'win32')
            throw new Error('首版端口转发只支持 macOS/Linux DSH Host。');
        const { owner, alias } = this.identity(scope);
        // Configuration changes must not revoke the owner's ability to list/stop
        // an already-running connection. Only a new allocation needs this check.
        if (!(this.options.aliasValidator ?? hasConcreteSshAlias)(alias))
            throw new Error('SSH alias 已失效，请检查本机 OpenSSH 配置。');
        if (!idPattern.test(input.id) || !['http', 'https'].includes(input.protocol))
            throw new Error('转发请求参数无效。');
        validateForwardSpec({ ...input, alias });
        const key = `${owner}\0${input.id}`, fingerprint = JSON.stringify([input.localPort, input.remotePort, input.protocol]);
        const previous = this.records.get(key);
        if (previous) {
            if (!previous.fingerprint)
                throw new Error('该请求已被停止；请发起新的转发请求。');
            if (previous.fingerprint !== fingerprint)
                throw new Error('不能用同一个请求标识修改转发目标。');
            return this.view(previous); // Including stopped records: retries never reactivate them.
        }
        this.prune();
        if (this.records.size >= 1024)
            throw new Error('转发请求回执已达到上限，请稍后重试。');
        if (this.ports.size >= 8)
            throw new Error('最多同时建立八条转发，请先停止不用的转发。');
        if (this.ports.has(input.localPort))
            throw new Error('该本机端口已由另一条转发占用；不会接管其他工作区的连接。');
        const entry = { owner, view: { ...input, alias, state: 'starting', probe: unknown(), error: '', createdAt: this.now(), canRetry: false },
            fingerprint, stopRequested: false, cleanupConfirmed: false, probeInFlight: false };
        this.records.set(key, entry);
        this.ports.set(input.localPort, entry);
        try {
            const worker = entry.worker = this.options.forkWorker?.() ?? fork(fileURLToPath(new URL('./port-forward-entry.js', import.meta.url)), [], {
                stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [],
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            });
            worker.stderr?.on('data', () => { }); // Do not collect URLs, credentials or arbitrary remote banners.
            entry.ended = new Promise(resolve => {
                worker.once('close', () => {
                    if (!entry.cleanupConfirmed) {
                        entry.view.state = 'error';
                        entry.view.error ||= '转发进程已退出，但资源释放未确认；请核查本机端口。';
                        // Do not silently reuse a potentially still-listening port.
                    }
                    else {
                        if (entry.stopRequested)
                            entry.view.state = 'stopped';
                        else if (entry.view.state !== 'error') {
                            entry.view.state = 'error';
                            entry.view.error = '转发已退出，请手动重试。';
                        }
                        this.ports.delete(input.localPort);
                    }
                    entry.finishedAt = this.now();
                    resolve();
                });
            });
            worker.on('error', error => {
                entry.view.state = 'error';
                entry.view.error = `转发进程启动失败：${redactHelperDiagnostic(error.message)}`;
                // No pid means the guardian never existed and could not allocate SSH.
                if (worker.pid === undefined)
                    entry.cleanupConfirmed = true;
            });
            worker.on('message', message => {
                if (!message || typeof message !== 'object')
                    return;
                const event = message;
                if (event.type === 'stopped') {
                    entry.cleanupConfirmed = true;
                    return;
                }
                if (event.type === 'cleanup-error') {
                    entry.view.error = '资源释放待确认，请再次停止。';
                    return;
                }
                if (entry.stopRequested || this.disposed)
                    return; // Late ready/probe cannot undo Stop.
                if (event.type === 'notice') {
                    entry.view.error = String(event.message ?? '').slice(0, 512);
                    return;
                }
                if (event.type === 'ready' && entry.view.state === 'starting') {
                    entry.view.state = 'listening';
                    this.sendProbe(entry);
                }
                else if (event.type === 'probe' && event.probe && ['reachable', 'unreachable', 'unknown'].includes(event.probe.state)) {
                    entry.probeInFlight = false;
                    if (entry.view.state === 'listening')
                        entry.view.probe = { state: event.probe.state, message: String(event.probe.message).slice(0, 512) };
                }
                else if (event.type === 'error') {
                    entry.view.state = 'error';
                    entry.view.error = redactHelperDiagnostic(String(event.message ?? 'SSH 连接失败。')).slice(0, 2048);
                }
            });
            worker.send({ type: 'start', spec: { alias, localPort: input.localPort, remotePort: input.remotePort } }, error => {
                if (error) {
                    entry.view.state = 'error';
                    entry.view.error = '无法将转发请求交给资源管理进程。';
                    void this.stopEntry(entry).catch(() => { });
                }
            });
        }
        catch (error) {
            entry.cleanupConfirmed = true;
            entry.finishedAt = this.now();
            this.ports.delete(input.localPort);
            entry.view.state = 'error';
            entry.view.error = String(error);
        }
        return this.view(entry);
    }
    async stop(scope, id) {
        const { owner, alias } = this.identity(scope);
        if (!idPattern.test(id))
            throw new Error('转发标识无效。');
        const key = `${owner}\0${id}`;
        let entry = this.records.get(key);
        if (!entry) {
            this.prune();
            if (this.records.size >= 1024)
                throw new Error('停止请求回执容量不足，请稍后重试。');
            entry = { owner, view: { id, alias, localPort: 0, remotePort: 0, protocol: 'http', state: 'stopped', probe: unknown(), error: '', createdAt: this.now(), canRetry: false },
                stopRequested: true, cleanupConfirmed: true, finishedAt: this.now(), probeInFlight: false };
            this.records.set(key, entry); // Stop-before-create tombstone.
        }
        await this.stopEntry(entry);
        return this.view(entry);
    }
    probe(scope, id) {
        const { owner } = this.identity(scope);
        const entry = this.records.get(`${owner}\0${id}`);
        if (!entry || entry.stopRequested || entry.view.state !== 'listening')
            throw new Error('请先建立转发监听。');
        this.sendProbe(entry);
        return this.view(entry);
    }
    sendProbe(entry) {
        if (entry.probeInFlight || (entry.lastProbe !== undefined && this.now() - entry.lastProbe < 1500))
            return;
        entry.probeInFlight = true;
        entry.lastProbe = this.now();
        entry.view.probe = { state: 'unknown', message: '正在检查远端 TCP 端口…' };
        entry.worker?.send({ type: 'probe' }, error => { if (error) {
            entry.probeInFlight = false;
            entry.view.probe = unknown();
        } });
    }
    stopEntry(entry) {
        entry.stopRequested = true;
        if (!entry.worker) {
            entry.view.state = 'stopped';
            return Promise.resolve();
        }
        if (entry.stopTask)
            return entry.stopTask;
        if (entry.finishedAt !== undefined) {
            if (!entry.cleanupConfirmed)
                return Promise.reject(new Error('转发进程已退出，但端口释放未确认；未自动接管或重试。'));
            entry.view.state = 'stopped';
            return Promise.resolve();
        }
        entry.view.state = 'stopping';
        entry.stopTask = (async () => {
            if (entry.worker.connected)
                entry.worker.send({ type: 'stop' }, () => { });
            try {
                await bounded(entry.ended, 10_000);
            }
            catch {
                // SIGTERM asks the guardian to clean its owned ChildProcess handles.
                // Never SIGKILL the guardian or kill a remembered numeric SSH PID.
                entry.worker.kill('SIGTERM');
                throw new Error('停止仍在清理中；请再次停止，不会重新建立连接。');
            }
            if (!entry.cleanupConfirmed)
                throw new Error('端口释放尚未确认，未自动重用该端口。');
        })().finally(() => { entry.stopTask = undefined; });
        return entry.stopTask;
    }
    view(entry) {
        return { ...entry.view, probe: { ...entry.view.probe },
            canRetry: entry.cleanupConfirmed && entry.finishedAt !== undefined };
    }
    prune() {
        for (const [key, entry] of this.records)
            if (entry.finishedAt !== undefined && entry.cleanupConfirmed
                && this.now() - entry.finishedAt > 24 * 60 * 60 * 1000)
                this.records.delete(key);
    }
    async dispose() {
        this.disposed = true;
        const results = await Promise.allSettled([...this.records.values()].map(entry => this.stopEntry(entry)));
        const failures = results.flatMap(r => r.status === 'rejected' ? [r.reason] : []);
        if (failures.length)
            throw new AggregateError(failures, 'SSH port forwarding cleanup incomplete');
    }
}
let SshRemotePorts = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _create_decorators;
    let _stop_decorators;
    let _probe_decorators;
    return class SshRemotePorts extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _create_decorators = [Remote];
            _stop_decorators = [Remote];
            _probe_decorators = [Remote];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stop_decorators, { kind: "method", name: "stop", static: false, private: false, access: { has: obj => "stop" in obj, get: obj => obj.stop }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _probe_decorators, { kind: "method", name: "probe", static: false, private: false, access: { has: obj => "probe" in obj, get: obj => obj.probe }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        manager = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, manager) {
            super(ctx, 'sshRemotePorts');
            this.manager = manager;
        }
        async list(scope, signal) { signal.throwIfAborted(); return this.manager.list(scope); }
        async create(scope, input) {
            try {
                return this.manager.create(scope, input);
            }
            catch (error) {
                throw new RemoteError('ssh-ports/refused', error instanceof Error ? error.message : String(error), { reason: 'preflight' });
            }
        }
        async stop(scope, id) { return this.manager.stop(scope, id); }
        async probe(scope, id) { return this.manager.probe(scope, id); }
    };
})();
export { SshRemotePorts };
//# sourceMappingURL=port-forwards.js.map