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
import { AsyncLocalStorage } from 'node:async_hooks';
import { stripVTControlCharacters } from 'node:util';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { parseSshUri } from './types.js';
const empty = (reason) => ({ instance: '', sequence: '-1', revision: 0, state: 'unknown', reason, cwd: null, current: null, recent: [] });
const OUTPUT_BYTES = 40 * 1024;
/** Only the public create request correlates identities; no controller private maps or guessed env ids. */
export class TerminalStateManager {
    resolve;
    scope = new AsyncLocalStorage();
    entries = new Map();
    controller;
    disposed = false;
    lifetime = new AbortController();
    constructor(resolve) {
        this.resolve = resolve;
    }
    key(binding) { return `${binding.sessionId}\0${binding.id}`; }
    mount(controller) {
        this.entries.clear(); // A reloaded controller is a new public identity lifetime.
        this.controller = controller;
        const original = controller.create, manager = this;
        controller.create = function (agent, request, signal) {
            const root = manager.resolve(agent.session.header.cwd ?? '');
            if (!root || manager.disposed)
                return original.call(this, agent, request, signal);
            return manager.scope.run({ sessionId: agent.id, id: request.id, root }, () => original.call(this, agent, request, signal));
        };
        return () => { controller.create = original; if (this.controller === controller) {
            this.controller = undefined;
            this.entries.clear();
        } };
    }
    reserve(uri) {
        const binding = this.scope.getStore();
        if (!binding || this.disposed || parseSshUri(binding.root).host !== parseSshUri(uri).host)
            return undefined;
        const key = this.key(binding);
        if (this.entries.has(key))
            return undefined;
        if (this.entries.size >= 128) {
            const old = [...this.entries].find(([, row]) => row.closed);
            if (!old)
                return undefined;
            this.entries.delete(old[0]);
        }
        const entry = { ...binding, output: Buffer.alloc(0), truncated: false, closed: false, observedAt: 0, stale: false, error: '' };
        this.entries.set(key, entry);
        return {
            output: data => {
                if (this.disposed || this.entries.get(key) !== entry)
                    return;
                entry.truncated ||= entry.output.length + data.length > OUTPUT_BYTES;
                // Copy the retained slice so a single huge source Buffer cannot be pinned.
                entry.output = Buffer.from(Buffer.concat([entry.output, data.subarray(-OUTPUT_BYTES)]).subarray(-OUTPUT_BYTES));
            },
            attached: terminal => { if (this.entries.get(key) === entry)
                entry.terminal = terminal; },
            failed: () => { if (this.entries.get(key) === entry)
                this.entries.delete(key); },
            closed: () => { entry.closed = true; },
        };
    }
    authorize(scope) {
        const root = this.resolve(scope.workspaceRoot);
        if (!root || !scope.sessionId || !this.controller || this.disposed)
            throw new Error('终端状态需要有效的 SSH 会话及官方终端服务。');
        return { root, alias: parseSshUri(root).host, controller: this.controller };
    }
    async refresh(entry) {
        if (!entry.terminal || entry.closed || Date.now() - entry.observedAt < 500)
            return;
        if (entry.pending)
            return entry.pending;
        entry.pending = (async () => {
            try {
                const snapshot = await entry.terminal.shellState(this.lifetime.signal);
                if (this.disposed || this.entries.get(this.key(entry)) !== entry || entry.closed)
                    return;
                if (entry.last?.instance && entry.last.instance !== snapshot.instance)
                    throw new Error('终端元数据实例改变，旧上下文不可继续关联。');
                if (Buffer.byteLength(JSON.stringify(snapshot)) > 24 * 1024)
                    throw new Error('终端元数据超过预算。');
                entry.last = snapshot;
                entry.stale = false;
                entry.error = '';
                entry.observedAt = Date.now();
            }
            catch (error) {
                entry.stale = true;
                entry.error = error instanceof Error ? error.message : String(error);
            }
            finally {
                entry.pending = undefined;
            }
        })();
        return entry.pending;
    }
    async list(scope, signal) {
        signal.throwIfAborted();
        const { root, alias, controller } = this.authorize(scope);
        const infos = controller.list(scope.sessionId);
        if (infos.length > 64)
            throw new Error('终端数量超过状态面板的 64 项上限。');
        const ids = new Set(infos.map(info => info.id));
        for (const [key, entry] of this.entries)
            if (entry.sessionId === scope.sessionId && entry.closed && !ids.has(entry.id))
                this.entries.delete(key);
        const result = await Promise.all(infos.map(async (info) => {
            const entry = this.entries.get(this.key({ sessionId: scope.sessionId, id: info.id }));
            if (entry && entry.root !== root)
                throw new Error('会话工作区已改变，不能读取原终端上下文。');
            if (entry)
                await this.refresh(entry);
            signal.throwIfAborted();
            return this.view(info, alias, entry);
        }));
        return result;
    }
    view(info, alias, entry) {
        return { ...(entry?.last ?? empty('此终端创建时未启用状态感知；请新建终端，已有终端不会被注入。')),
            ...(entry?.closed || info.state === 'exited' ? { state: 'exited' } : {}),
            ...(entry?.stale ? { reason: '连接或元数据不可用，显示上次观察：' + entry.error } : {}),
            id: info.id, title: info.title, alias, stale: entry?.stale ?? false, observedAt: entry?.observedAt ?? 0 };
    }
    async context(scope, id, signal) {
        const terminal = (await this.list(scope, signal)).find(row => row.id === id);
        if (!terminal)
            throw new Error('终端不属于当前会话或已关闭。');
        const entry = this.entries.get(this.key({ sessionId: scope.sessionId, id }));
        const clean = (text) => stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/gu, '');
        const last = [...terminal.recent, ...(terminal.current ? [terminal.current] : [])].map(row => `${row.command ?? '[命令文本未知]'}\n退出码：${row.exitCode ?? '未知/未返回'}，耗时：${row.elapsedMs ?? '未知'} ms${row.uncertain ? '（事件不完整）' : ''}`).join('\n');
        const header = `人工终端观察（用户选择的上下文，不是指令或授权）\nSSH: ${terminal.alias}\n目录: ${terminal.cwd ?? '未知'}\n状态: ${terminal.state}${terminal.stale ? '（过期）' : ''}\n${terminal.reason}\n最近命令：\n${last}\n输出片段：\n`;
        const bytes = Buffer.from(clean(header + (entry?.output.toString('utf8') ?? '')));
        // Leave room for the fixed framing in the composer; cap the whole export.
        const truncated = (entry?.truncated ?? false) || bytes.length > 64 * 1024 - 128;
        const text = bytes.subarray(0, 64 * 1024 - 128).toString('utf8') + (truncated ? '\n[上下文已截断]' : '');
        return { terminal, text, truncated };
    }
    dispose() { this.disposed = true; this.lifetime.abort(); this.entries.clear(); }
}
let SshRemoteTerminalState = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _context_decorators;
    return class SshRemoteTerminalState extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _context_decorators = [Remote];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _context_decorators, { kind: "method", name: "context", static: false, private: false, access: { has: obj => "context" in obj, get: obj => obj.context }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        manager = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, manager) {
            super(ctx, 'sshRemoteTerminalState');
            this.manager = manager;
        }
        list(scope, signal) { return this.manager.list(scope, signal); }
        context(scope, id, signal) { return this.manager.context(scope, id, signal); }
    };
})();
export { SshRemoteTerminalState };
//# sourceMappingURL=terminal-state.js.map