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
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseCatalog } from './release-catalog.js';
// Captured when this module loads: a changed manifest alone is not a running-code upgrade.
const runningVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export function updateSource(source) {
    if (/^(?:link:|workspace:)/u.test(source) || (/^(?:file:|\/|[A-Za-z]:[\\/])/u.test(source) && !/\.tgz$/u.test(source)))
        return 'development';
    if (/^(?:file:|\/|[A-Za-z]:[\\/]).*\.tgz$/u.test(source)
        || /^https:\/\/github\.com\/CrazyShout\/dsh-ssh-remote\/releases\/download\/v[^/]+\/dsh-ssh-remote-[^/]+\.tgz$/u.test(source)
        || /^(?:github:CrazyShout\/dsh-ssh-remote|git\+https:\/\/github\.com\/CrazyShout\/dsh-ssh-remote(?:\.git)?)#/u.test(source))
        return 'release';
    return 'unsupported';
}
/** Observation only. DSH's independent pluginManager owns all package writes and activation. */
let SshRemoteUpdates = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    let _check_decorators;
    return class SshRemoteUpdates extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _info_decorators = [Remote('info')];
            _check_decorators = [Remote('check')];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _check_decorators, { kind: "method", name: "check", static: false, private: false, access: { has: obj => "check" in obj, get: obj => obj.check }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        owner = __runInitializers(this, _instanceExtraInitializers);
        catalog = new ReleaseCatalog();
        profileId;
        constructor(owner) {
            super(owner, 'sshRemoteUpdates');
            this.owner = owner;
            this.profileId = createHash('sha256').update(realpathSync(owner.profileContext.dir)).digest('hex').slice(0, 24);
            owner.effect(() => () => this.catalog.dispose());
        }
        async info() {
            const bundle = (await this.owner.pluginManager.listBundles()).find(row => row.name === 'dsh-ssh-remote');
            // DSH 0.2.0 does not include source in BundleInfo. Read the current public
            // profile manifest, never infer a package's source from its resolved path.
            const manifest = JSON.parse(readFileSync(join(this.owner.profileContext.dir, 'package.json'), 'utf8'));
            const recorded = manifest.dependencies?.['dsh-ssh-remote'];
            const source = typeof recorded === 'string' ? recorded.replace(/^((?:git\+)?https?:\/\/)[^/]*@/u, '$1') : '';
            return { profileId: this.profileId, runningVersion, installedVersion: bundle?.version ?? '', source,
                sourceKind: bundle?.installed ? updateSource(source) : 'unsupported', enabled: bundle?.enabled ?? false };
        }
        check(force) { return this.catalog.check(force); }
    };
})();
export { SshRemoteUpdates };
//# sourceMappingURL=updates.js.map