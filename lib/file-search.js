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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { representable } from './file-index.js';
import { HelperRemoteFileSystem } from './helper-fs.js';
import { posix } from 'node:path';
import { formatSshUri, parseSshUri } from './types.js';
/** All public calls use the official session lookup; the caller cannot choose a host/root. */
let SshRemoteFiles = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _preview_decorators;
    let _query_decorators;
    let _status_decorators;
    let _refresh_decorators;
    return class SshRemoteFiles extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _preview_decorators = [Remote];
            _query_decorators = [Remote];
            _status_decorators = [Remote];
            _refresh_decorators = [Remote];
            __esDecorate(this, null, _preview_decorators, { kind: "method", name: "preview", static: false, private: false, access: { has: obj => "preview" in obj, get: obj => obj.preview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _query_decorators, { kind: "method", name: "query", static: false, private: false, access: { has: obj => "query" in obj, get: obj => obj.query }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _refresh_decorators, { kind: "method", name: "refresh", static: false, private: false, access: { has: obj => "refresh" in obj, get: obj => obj.refresh }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        index = __runInitializers(this, _instanceExtraInitializers);
        fs;
        constructor(ctx, index, helpers, resolve) {
            super(ctx, 'sshRemoteFiles');
            this.index = index;
            this.fs = new HelperRemoteFileSystem(helpers, resolve);
        }
        async preview(scope, path, signal) {
            signal.throwIfAborted();
            const rootUri = this.index.root(scope), root = parseSshUri(rootUri);
            if (!path || !representable(path) || path.split('/').includes('..') || /^[a-z][a-z\d+.-]*:/iu.test(path)) {
                throw new Error('路径不能安全表示；不改写文件名，也不允许上级跳转。');
            }
            const absolute = posix.resolve(root.path, path);
            if (!absolute.startsWith(`${root.path.replace(/\/+$/u, '')}/`))
                throw new Error('文件不属于此会话的远程工作区。');
            const uri = formatSshUri({ ...root, path: absolute });
            const target = await this.fs.resolve(uri, { signal });
            if (String(target.targetKey) !== uri)
                throw new Error('不支持符号链接或目标身份变化。');
            const info = await this.fs.stat(target, signal);
            if (info?.type !== 'file')
                throw new Error('完整路径没有指向可预览的普通文件。');
            if (this.index.root(scope) !== rootUri)
                throw new Error('会话工作区已改变，请重新打开。');
            return { sessionId: scope.sessionId, path: posix.relative(root.path, absolute) };
        }
        query(scope, query, includeIgnored, signal) {
            return this.index.query(scope, query, includeIgnored, signal);
        }
        async status(scope, includeIgnored, signal) {
            signal.throwIfAborted();
            return this.index.status(scope, includeIgnored);
        }
        async refresh(scope, includeIgnored, signal) {
            signal.throwIfAborted();
            this.index.root(scope);
            this.index.invalidate(scope.workspaceRoot, includeIgnored);
            return this.index.status(scope, includeIgnored);
        }
    };
})();
export { SshRemoteFiles };
//# sourceMappingURL=file-search.js.map