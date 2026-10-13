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
/** All public calls use the official session lookup; the caller cannot choose a host/root. */
let SshRemoteFiles = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _query_decorators;
    let _status_decorators;
    let _refresh_decorators;
    return class SshRemoteFiles extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _query_decorators = [Remote];
            _status_decorators = [Remote];
            _refresh_decorators = [Remote];
            __esDecorate(this, null, _query_decorators, { kind: "method", name: "query", static: false, private: false, access: { has: obj => "query" in obj, get: obj => obj.query }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _refresh_decorators, { kind: "method", name: "refresh", static: false, private: false, access: { has: obj => "refresh" in obj, get: obj => obj.refresh }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        index = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, index) {
            super(ctx, 'sshRemoteFiles');
            this.index = index;
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