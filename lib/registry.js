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
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { AnchorRegistry } from './anchors.js';
import { SshMigration } from './migration.js';
import { RemoteHelperManager, } from './helper/manager.js';
import { collectSshAliases, discoverSshHosts, hasConcreteSshAlias, userSshConfigPath, } from './ssh-config.js';
import { formatSshUri, parseSshUri } from './types.js';
const DIRECTORY_PAGE_LIMIT = 1000;
/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * import source for the explicit OpenSSH migration wizard.
 * Declared as the plugin's Cordis `Config`; resolved values reach
 * `apply(ctx, config)` and the service constructor.
 */
export const LegacySshRemoteSettingsSchema = z.object({
    hosts: z
        .array(z.object({
        name: z.string(),
        host: z.string(),
        port: z.number().min(1).max(65535).default(22),
        user: z.string().default(''),
        identityFile: z.string().default(''),
        proxyJump: z.string().default(''),
    }))
        .default([]),
});
function anchorPersistPath() {
    return dshHomePath('ssh-workspace-anchors.json');
}
function anchorRootPath() {
    return dshHomePath('ssh-workspace-anchors');
}
/**
 * Host-facing Web facade and durable anchor registry. Helper lifecycle is
 * delegated to RemoteHelperManager. Legacy config is import-only.
 */
let SshRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _migrationPreview_decorators;
    let _migrationApply_decorators;
    let _migrationRollback_decorators;
    let _config_decorators;
    let _statuses_decorators;
    let _browse_decorators;
    let _createDirectory_decorators;
    let _materializeWorkspace_decorators;
    let _workspaceInfo_decorators;
    let _connectHost_decorators;
    let _disconnectHost_decorators;
    let _retryHost_decorators;
    let _diagnostics_decorators;
    return class SshRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _migrationPreview_decorators = [Remote('migrationPreview')];
            _migrationApply_decorators = [Remote('migrationApply')];
            _migrationRollback_decorators = [Remote('migrationRollback')];
            _config_decorators = [Remote('config')];
            _statuses_decorators = [Remote('statuses')];
            _browse_decorators = [Remote('browse')];
            _createDirectory_decorators = [Remote('createDirectory')];
            _materializeWorkspace_decorators = [Remote('materializeWorkspace')];
            _workspaceInfo_decorators = [Remote('workspaceInfo')];
            _connectHost_decorators = [Remote('connectHost')];
            _disconnectHost_decorators = [Remote('disconnectHost')];
            _retryHost_decorators = [Remote('retryHost')];
            _diagnostics_decorators = [Remote('diagnostics')];
            __esDecorate(this, null, _migrationPreview_decorators, { kind: "method", name: "migrationPreview", static: false, private: false, access: { has: obj => "migrationPreview" in obj, get: obj => obj.migrationPreview }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _migrationApply_decorators, { kind: "method", name: "migrationApply", static: false, private: false, access: { has: obj => "migrationApply" in obj, get: obj => obj.migrationApply }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _migrationRollback_decorators, { kind: "method", name: "migrationRollback", static: false, private: false, access: { has: obj => "migrationRollback" in obj, get: obj => obj.migrationRollback }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _config_decorators, { kind: "method", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _statuses_decorators, { kind: "method", name: "statuses", static: false, private: false, access: { has: obj => "statuses" in obj, get: obj => obj.statuses }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _browse_decorators, { kind: "method", name: "browse", static: false, private: false, access: { has: obj => "browse" in obj, get: obj => obj.browse }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createDirectory_decorators, { kind: "method", name: "createDirectory", static: false, private: false, access: { has: obj => "createDirectory" in obj, get: obj => obj.createDirectory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _materializeWorkspace_decorators, { kind: "method", name: "materializeWorkspace", static: false, private: false, access: { has: obj => "materializeWorkspace" in obj, get: obj => obj.materializeWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _workspaceInfo_decorators, { kind: "method", name: "workspaceInfo", static: false, private: false, access: { has: obj => "workspaceInfo" in obj, get: obj => obj.workspaceInfo }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connectHost_decorators, { kind: "method", name: "connectHost", static: false, private: false, access: { has: obj => "connectHost" in obj, get: obj => obj.connectHost }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _disconnectHost_decorators, { kind: "method", name: "disconnectHost", static: false, private: false, access: { has: obj => "disconnectHost" in obj, get: obj => obj.disconnectHost }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _retryHost_decorators, { kind: "method", name: "retryHost", static: false, private: false, access: { has: obj => "retryHost" in obj, get: obj => obj.retryHost }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _diagnostics_decorators, { kind: "method", name: "diagnostics", static: false, private: false, access: { has: obj => "diagnostics" in obj, get: obj => obj.diagnostics }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        helpers = __runInitializers(this, _instanceExtraInitializers);
        legacyConfig;
        anchors;
        migration;
        ownsHelpers;
        constructor(ctx, helpers, config) {
            super(ctx, 'sshRemote');
            this.legacyConfig = config;
            this.helpers = helpers ?? new RemoteHelperManager();
            this.ownsHelpers = helpers === undefined;
            this.anchors = new AnchorRegistry(anchorPersistPath(), anchorRootPath());
            this.migration = new SshMigration(userSshConfigPath(), dshHomePath('ssh-migrations'), config.hosts, async (alias) => { await this.helpers.client(alias); }, aliases => this.anchors.migrateAliases(aliases));
        }
        async migrationPreview(selections) { return this.migration.preview(selections); }
        async migrationApply(token) { return this.migration.apply(token); }
        async migrationRollback(id) { await this.migration.rollback(id); return true; }
        /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
        async config() {
            const configPath = userSshConfigPath();
            const hosts = await discoverSshHosts(configPath);
            // A transient failure of one remote host must not hide local directories
            // or other configured hosts. Its manager snapshot carries the error.
            await Promise.allSettled(hosts.map(host => this.helpers.refreshEnvironment(host.host)));
            return {
                configPath,
                configExists: existsSync(configPath),
                hosts: hosts.map((host) => {
                    const status = this.helpers.status(host.host);
                    return {
                        alias: host.host,
                        host: host.hostName ?? host.host,
                        port: host.port ?? 22,
                        user: host.user ?? '',
                        identityFile: host.identityFile ?? '',
                        proxyJump: host.proxyJump ?? '',
                        proxyCommand: host.proxyCommand ?? '',
                        helper: helperStatusView(status),
                    };
                }),
                legacyHostCount: this.legacyConfig.hosts.length,
            };
        }
        /** Cheap live status snapshot; unlike config(), this does not run ssh -G. */
        async statuses() {
            return Object.fromEntries(collectSshAliases().map(alias => [alias, helperStatusView(this.helpers.status(alias))]));
        }
        /** Browse one remote directory level for the Add Workspace flow. */
        async browse(alias, path) {
            this.assertHelperAlias(alias);
            return this.browseWithHelper(alias, path);
        }
        async browseWithHelper(alias, path) {
            const client = await this.helpers.client(alias);
            const home = await helperHome(client);
            const requested = normalizeRemotePath(path || home);
            const workspaceId = randomUUID();
            const workspace = await client.call('workspace/open', {
                path: requested,
                access: 'read-only',
                workspaceId,
                operationId: workspaceId,
            }, { timeoutMs: 20_000, mutation: true });
            try {
                const result = await client.call('fs/list', {
                    workspaceId: workspace.workspaceId,
                    path: '',
                    limit: DIRECTORY_PAGE_LIMIT,
                    allowTruncated: true,
                    types: ['directory'],
                }, { timeoutMs: 30_000 });
                const directories = result.entries
                    .filter((entry) => entry.metadata.type === 'directory')
                    .sort((left, right) => left.name.localeCompare(right.name));
                const truncated = result.truncated === true || directories.length > DIRECTORY_PAGE_LIMIT;
                return {
                    path: normalizeRemotePath(workspace.path),
                    home,
                    crumbs: remoteCrumbs(workspace.path),
                    entries: directories.slice(0, DIRECTORY_PAGE_LIMIT).map((entry) => ({
                        name: entry.name,
                        path: posix.join(workspace.path, entry.name),
                        hidden: entry.name.startsWith('.'),
                    })),
                    truncated,
                };
            }
            finally {
                await client.call('workspace/close', {
                    workspaceId: workspace.workspaceId,
                    operationId: `close:${workspace.workspaceId}`,
                }, {
                    timeoutMs: 5_000,
                    mutation: true,
                }).catch(() => { });
            }
        }
        /** Create one remote child directory from the remote directory picker. */
        async createDirectory(alias, parent, name) {
            const clean = name.trim();
            if (!clean || clean === '.' || clean === '..' || clean.includes('/')) {
                throw new Error('folder name must be one non-empty path segment');
            }
            this.assertHelperAlias(alias);
            {
                const client = await this.helpers.client(alias);
                const workspaceId = randomUUID();
                const workspace = await client.call('workspace/open', {
                    path: normalizeRemotePath(parent),
                    access: 'workspace-write',
                    workspaceId,
                    operationId: workspaceId,
                }, { timeoutMs: 20_000, mutation: true });
                try {
                    await client.call('fs/mkdir', {
                        workspaceId: workspace.workspaceId,
                        path: clean,
                        recursive: false,
                        mode: 0o755,
                        operationId: randomUUID(),
                    }, { timeoutMs: 30_000, mutation: true });
                    return posix.join(workspace.path, clean);
                }
                finally {
                    await client.call('workspace/close', {
                        workspaceId: workspace.workspaceId,
                        operationId: `close:${workspace.workspaceId}`,
                    }, {
                        timeoutMs: 5_000,
                        mutation: true,
                    }).catch(() => { });
                }
            }
        }
        /**
         * Verify a remote directory and materialize the local anchor handed to the
         * stock DSH Workspace API. Repeated calls for one URI reuse one anchor.
         */
        async materializeWorkspace(alias, remotePath) {
            const uri = formatSshUri({
                host: alias,
                port: 22,
                user: '',
                path: normalizeRemotePath(remotePath),
            });
            await this.ensureDirectory(uri);
            return this.anchors.materialize(uri);
        }
        /** Exact anchor/descendant resolver consumed by fs and subprocess routers. */
        resolveRemotePath(localPath) {
            return this.anchors.resolve(localPath);
        }
        async workspaceInfo(path) {
            if (!path || path.includes('\0') || path.length > 32_768)
                return null;
            const uri = this.resolveRemotePath(path);
            if (uri === undefined)
                return null;
            const parsed = parseSshUri(uri);
            return { alias: parsed.host, remotePath: parsed.path, uri };
        }
        async ensureDirectory(uri) {
            const parsed = parseSshUri(uri);
            this.assertHelperAlias(parsed.host);
            {
                const client = await this.helpers.client(uri);
                const workspaceId = randomUUID();
                const workspace = await client.call('workspace/open', {
                    path: normalizeRemotePath(parsed.path),
                    access: 'read-only',
                    workspaceId,
                    operationId: workspaceId,
                }, { timeoutMs: 20_000, mutation: true });
                await client.call('workspace/close', {
                    workspaceId: workspace.workspaceId,
                    operationId: `close:${workspace.workspaceId}`,
                }, {
                    timeoutMs: 5_000,
                    mutation: true,
                }).catch(() => { });
                return;
            }
        }
        async connectHost(alias) {
            this.assertHelperAlias(alias);
            await this.helpers.client(alias);
            return helperStatusView(this.helpers.status(alias));
        }
        async disconnectHost(alias) {
            this.assertHelperAlias(alias);
            await this.helpers.close(alias);
            return helperStatusView(this.helpers.status(alias));
        }
        async retryHost(alias) {
            this.assertHelperAlias(alias);
            await this.helpers.retry(alias);
            return helperStatusView(this.helpers.status(alias));
        }
        async diagnostics(alias) {
            this.assertHelperAlias(alias);
            await this.helpers.refreshEnvironment(alias).catch(() => { });
            return helperDiagnosticsView(this.helpers.diagnostics(alias));
        }
        async dispose() {
            if (this.ownsHelpers)
                await this.helpers.dispose();
            await this.anchors.dispose();
        }
        // ── internals ──────────────────────────────────────────────────────────
        assertHelperAlias(alias) {
            if (!hasConcreteSshAlias(alias)) {
                throw new Error(`SSH helper requires a concrete Host alias in ${userSshConfigPath()}; open Remote settings → Migrate legacy hosts before using this workspace`);
            }
        }
    };
})();
export { SshRemoteService };
function normalizeRemotePath(path) {
    if (!path.startsWith('/'))
        throw new Error(`remote workspace path must be absolute: ${path}`);
    return path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}
function remoteCrumbs(path) {
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ name: '/', path: '/', hidden: false }];
    let current = '';
    for (const part of parts) {
        current = `${current}/${part}`;
        crumbs.push({ name: part, path: current, hidden: false });
    }
    return crumbs;
}
async function helperHome(client) {
    const fromHello = client.hello.platform.home;
    if (typeof fromHello === 'string' && fromHello.startsWith('/')) {
        return normalizeRemotePath(fromHello);
    }
    const health = await client.call('health/status', {}, { timeoutMs: 5_000 });
    if (typeof health.home !== 'string' || !health.home.startsWith('/')) {
        throw new Error('remote helper did not report an absolute home directory');
    }
    return normalizeRemotePath(health.home);
}
function helperStatusView(status) {
    return {
        status: status.state,
        version: status.helperVersion ?? '',
        sessionId: status.sessionId ?? '',
        capabilities: status.capabilities === undefined ? {} : { ...status.capabilities },
        error: status.lastError ?? '',
        ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
        ...(status.retryable === undefined ? {} : { retryable: status.retryable }),
        ...(status.hint === undefined ? {} : { hint: status.hint }),
        ...(status.environment === undefined ? {} : { environment: status.environment }),
    };
}
function helperDiagnosticsView(diagnostics) {
    return {
        alias: diagnostics.alias,
        ...helperStatusView(diagnostics),
        helperSha256: diagnostics.helperSha256 ?? '',
        lastConnectedAt: diagnostics.lastConnectedAt ?? 0,
        lastHealthAt: diagnostics.lastHealthAt ?? 0,
        nextRetryAt: diagnostics.nextRetryAt ?? 0,
        stderr: diagnostics.stderr,
        assetPath: diagnostics.assetPath,
    };
}
//# sourceMappingURL=registry.js.map