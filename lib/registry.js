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
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { SshConnectionManager } from './connection.js';
import { discoverSshHosts, expandHome, hasConcreteSshAlias, userSshConfigPath, } from './ssh-config.js';
import { formatSshUri, parseSshUri } from './types.js';
const SETTINGS_NS = settingsNamespace('ssh-remote');
/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * fallback so an upgrade does not break already registered workspaces.
 */
const LegacySshRemoteSettingsSchema = z.object({
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
function persistPath() {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-remote-workspaces.json');
}
function anchorPersistPath() {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-workspace-anchors.json');
}
function anchorRootPath() {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-workspace-anchors');
}
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
let SshRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _config_decorators;
    let _browse_decorators;
    let _createDirectory_decorators;
    let _materializeWorkspace_decorators;
    return class SshRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _config_decorators = [Remote('config')];
            _browse_decorators = [Remote('browse')];
            _createDirectory_decorators = [Remote('createDirectory')];
            _materializeWorkspace_decorators = [Remote('materializeWorkspace')];
            __esDecorate(this, null, _config_decorators, { kind: "method", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _browse_decorators, { kind: "method", name: "browse", static: false, private: false, access: { has: obj => "browse" in obj, get: obj => obj.browse }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createDirectory_decorators, { kind: "method", name: "createDirectory", static: false, private: false, access: { has: obj => "createDirectory" in obj, get: obj => obj.createDirectory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _materializeWorkspace_decorators, { kind: "method", name: "materializeWorkspace", static: false, private: false, access: { has: obj => "materializeWorkspace" in obj, get: obj => obj.materializeWorkspace }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        connections = __runInitializers(this, _instanceExtraInitializers);
        settings;
        workspaces = new Map();
        anchors = new Map();
        listeners = new Set();
        hostResolver;
        constructor(ctx) {
            super(ctx, 'sshRemote');
            this.settings = ctx.settings.register(SETTINGS_NS, LegacySshRemoteSettingsSchema);
            this.hostResolver = this.createHostResolver();
            this.connections = new SshConnectionManager(this.hostResolver);
            this.load();
            this.loadAnchors();
            this.connections.onStatus((key, status, reason) => {
                for (const ws of this.workspaces.values()) {
                    if (this.keyOf(ws.uri) === key) {
                        ws.status = status;
                        if (reason)
                            ws.lastError = reason;
                        this.emit({ workspaceId: ws.id, status, reason });
                    }
                }
                this.save();
            });
        }
        createHostResolver() {
            return (host) => {
                // `~/.ssh/config` is authoritative. Only consult the old DSH settings
                // namespace when the workspace names no concrete OpenSSH alias.
                if (hasConcreteSshAlias(host))
                    return undefined;
                const hosts = this.settings.get().hosts;
                const h = hosts.find((x) => x.name === host || x.host === host);
                if (!h)
                    return undefined;
                return {
                    host: h.host,
                    port: h.port,
                    username: h.user || undefined,
                    privateKey: h.identityFile ? this.readKey(h.identityFile) : undefined,
                    proxyJump: h.proxyJump || undefined,
                };
            };
        }
        readKey(path) {
            try {
                return readFileSync(expandHome(path), 'utf8');
            }
            catch {
                return undefined;
            }
        }
        /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
        async config() {
            const configPath = userSshConfigPath();
            const hosts = await discoverSshHosts(configPath);
            return {
                configPath,
                configExists: existsSync(configPath),
                hosts: hosts.map((host) => ({
                    alias: host.host,
                    host: host.hostName ?? host.host,
                    port: host.port ?? 22,
                    user: host.user ?? '',
                    identityFile: host.identityFile ?? '',
                    proxyJump: host.proxyJump ?? '',
                    proxyCommand: host.proxyCommand ?? '',
                })),
                legacyHostCount: this.settings.get().hosts.length,
            };
        }
        /** Browse one remote directory level for the Add Workspace flow. */
        async browse(alias, path) {
            const transport = await this.connections.transport(formatSshUri({
                host: alias,
                port: 22,
                user: '',
                path: '/',
            }));
            return transport.sftp(async (sftp) => {
                const home = await realpathP(sftp, '.');
                const target = await realpathP(sftp, path || home);
                const status = await statP(sftp, target);
                if (!status?.isDirectory())
                    throw new Error(`remote path is not a directory: ${target}`);
                const rows = await readdirP(sftp, target);
                const directories = (await Promise.all(rows.map(async (row) => {
                    const childPath = posix.join(target, row.filename);
                    const child = row.attrs.isDirectory() ? row.attrs : await statP(sftp, childPath);
                    if (!child?.isDirectory())
                        return undefined;
                    return {
                        name: row.filename,
                        path: childPath,
                        hidden: row.filename.startsWith('.'),
                    };
                }))).filter((entry) => entry !== undefined)
                    .sort((left, right) => left.name.localeCompare(right.name));
                const truncated = directories.length > 1000;
                return {
                    path: target,
                    home,
                    crumbs: remoteCrumbs(target),
                    entries: directories.slice(0, 1000),
                    truncated,
                };
            });
        }
        /** Create one remote child directory from the remote directory picker. */
        async createDirectory(alias, parent, name) {
            const clean = name.trim();
            if (!clean || clean === '.' || clean === '..' || clean.includes('/')) {
                throw new Error('folder name must be one non-empty path segment');
            }
            const transport = await this.connections.transport(formatSshUri({
                host: alias,
                port: 22,
                user: '',
                path: '/',
            }));
            const path = posix.join(parent, clean);
            await transport.sftp((sftp) => mkdirP(sftp, path));
            return path;
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
            const existing = [...this.anchors.values()].find((anchor) => anchor.uri === uri);
            if (existing) {
                mkdirSync(existing.anchorPath, { recursive: true });
                return existing;
            }
            const title = `${basename(remotePath.replace(/\/+$/, '')) || 'root'} · ${alias}`;
            const safeTitle = title.replace(/[/:]/g, '-').replace(/\s+/g, ' ').trim();
            const digest = createHash('sha256').update(uri).digest('hex').slice(0, 8);
            const rawAnchor = join(anchorRootPath(), `${safeTitle} [${digest}]`);
            mkdirSync(rawAnchor, { recursive: true });
            const anchor = {
                anchorPath: realpathSync(rawAnchor),
                uri,
                alias,
                remotePath: normalizeRemotePath(remotePath),
                title,
                createdAt: Date.now(),
            };
            this.anchors.set(anchor.anchorPath, anchor);
            this.saveAnchors();
            return anchor;
        }
        /** Exact anchor/descendant resolver consumed by fs and subprocess routers. */
        resolveRemotePath(localPath) {
            const absolute = resolve(localPath);
            const candidates = [...this.anchors.values()].sort((left, right) => right.anchorPath.length - left.anchorPath.length);
            for (const anchor of candidates) {
                if (absolute !== anchor.anchorPath && !absolute.startsWith(`${anchor.anchorPath}${sep}`))
                    continue;
                const suffix = relative(anchor.anchorPath, absolute).split(sep).filter(Boolean);
                const base = parseSshUri(anchor.uri);
                return formatSshUri({ ...base, path: posix.join(base.path, ...suffix) });
            }
            return undefined;
        }
        async ensureDirectory(uri) {
            const parsed = parseSshUri(uri);
            const transport = await this.connections.transport(uri);
            const status = await transport.sftp((sftp) => statP(sftp, parsed.path));
            if (!status?.isDirectory())
                throw new Error(`remote path is not a directory: ${parsed.path}`);
        }
        onStatus(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }
        list() {
            return [...this.workspaces.values()];
        }
        get(id) {
            return this.workspaces.get(id);
        }
        add(uri, title) {
            const parsed = parseSshUri(uri);
            const id = `${parsed.host}-${Date.now().toString(36)}`;
            const record = {
                id,
                uri: formatSshUri(parsed),
                title: title ?? `${parsed.user ? parsed.user + '@' : ''}${parsed.host}`,
                status: 'disconnected',
                createdAt: Date.now(),
            };
            this.workspaces.set(id, record);
            this.save();
            return record;
        }
        remove(id) {
            const ws = this.workspaces.get(id);
            if (!ws)
                return false;
            void this.connections.close(ws.uri);
            this.workspaces.delete(id);
            this.save();
            return true;
        }
        async connect(id) {
            const ws = this.workspaces.get(id);
            if (!ws)
                throw new Error(`no such workspace: ${id}`);
            await this.connections.transport(ws.uri);
        }
        async disconnect(id) {
            const ws = this.workspaces.get(id);
            if (!ws)
                throw new Error(`no such workspace: ${id}`);
            await this.connections.close(ws.uri);
        }
        async exec(id, command) {
            const ws = this.require(id);
            const transport = await this.connections.transport(ws.uri);
            return transport.exec(command);
        }
        async stat(id, path) {
            const ws = this.require(id);
            const transport = await this.connections.transport(ws.uri);
            return transport.sftp(async (sftp) => {
                const st = await statP(sftp, this.remotePath(ws.uri, path));
                return st ? { type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other', size: st.size } : undefined;
            });
        }
        async listDir(id, path) {
            const ws = this.require(id);
            const transport = await this.connections.transport(ws.uri);
            return transport.sftp(async (sftp) => {
                const entries = await readdirP(sftp, this.remotePath(ws.uri, path));
                return entries.map((e) => ({
                    name: e.filename,
                    type: e.attrs.isDirectory() ? 'directory' : e.attrs.isFile() ? 'file' : 'other',
                    size: e.attrs.size,
                }));
            });
        }
        async readText(id, path) {
            const ws = this.require(id);
            const transport = await this.connections.transport(ws.uri);
            return transport.sftp(async (sftp) => {
                const buf = await readFileP(sftp, this.remotePath(ws.uri, path));
                return buf.toString('utf8');
            });
        }
        async writeText(id, path, content) {
            const ws = this.require(id);
            const transport = await this.connections.transport(ws.uri);
            await transport.sftp(async (sftp) => {
                await writeFileP(sftp, this.remotePath(ws.uri, path), Buffer.from(content, 'utf8'));
            });
        }
        async dispose() {
            await this.connections.dispose();
            this.workspaces.clear();
            this.anchors.clear();
        }
        // ── internals ──────────────────────────────────────────────────────────
        require(id) {
            const ws = this.workspaces.get(id);
            if (!ws)
                throw new Error(`no such workspace: ${id}`);
            return ws;
        }
        keyOf(uri) {
            const u = parseSshUri(uri);
            return `${u.host}:${u.port}:${u.user}`;
        }
        remotePath(uri, path) {
            if (path.startsWith('/'))
                return path;
            return join(parseSshUri(uri).path, path).replace(/\/+$/, '') || '/';
        }
        emit(change) {
            for (const l of this.listeners)
                l(change);
        }
        load() {
            try {
                const raw = readFileSync(persistPath(), 'utf8');
                const list = JSON.parse(raw);
                for (const ws of list) {
                    if (ws && typeof ws.id === 'string' && typeof ws.uri === 'string') {
                        ws.status = 'disconnected';
                        ws.lastError = undefined;
                        this.workspaces.set(ws.id, ws);
                    }
                }
            }
            catch {
                /* no persisted workspaces */
            }
        }
        save() {
            try {
                const file = persistPath();
                mkdirSync(dirname(file), { recursive: true });
                writeFileSync(file, JSON.stringify([...this.workspaces.values()], null, 2));
            }
            catch {
                /* best effort */
            }
        }
        loadAnchors() {
            try {
                const list = JSON.parse(readFileSync(anchorPersistPath(), 'utf8'));
                for (const anchor of list) {
                    if (!anchor || typeof anchor.anchorPath !== 'string' || typeof anchor.uri !== 'string')
                        continue;
                    const anchorPath = resolve(anchor.anchorPath);
                    this.anchors.set(anchorPath, { ...anchor, anchorPath });
                    mkdirSync(anchorPath, { recursive: true });
                }
            }
            catch {
                /* no persisted anchors */
            }
        }
        saveAnchors() {
            const file = anchorPersistPath();
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, JSON.stringify([...this.anchors.values()], null, 2));
        }
    };
})();
export { SshRemoteService };
// ── sftp promisify helpers ────────────────────────────────────────────────
function statP(sftp, path) {
    return new Promise((resolve) => {
        sftp.stat(path, (err, st) => resolve(err ? undefined : st));
    });
}
function realpathP(sftp, path) {
    return new Promise((resolvePath, reject) => {
        sftp.realpath(path, (err, resolved) => (err ? reject(err) : resolvePath(resolved)));
    });
}
function mkdirP(sftp, path) {
    return new Promise((resolveDirectory, reject) => {
        sftp.mkdir(path, (err) => (err ? reject(err) : resolveDirectory()));
    });
}
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
function readdirP(sftp, path) {
    return new Promise((resolve, reject) => {
        sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list)));
    });
}
function readFileP(sftp, path) {
    return new Promise((resolve, reject) => {
        sftp.readFile(path, (err, buf) => (err ? reject(err) : resolve(buf)));
    });
}
function writeFileP(sftp, path, data) {
    return new Promise((resolve, reject) => {
        sftp.writeFile(path, data, (err) => (err ? reject(err) : resolve()));
    });
}
//# sourceMappingURL=registry.js.map