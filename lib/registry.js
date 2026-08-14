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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SshConnectionManager } from './connection.js';
import { expandHome } from './ssh-config.js';
import { formatSshUri, parseSshUri } from './types.js';
const SETTINGS_NS = settingsNamespace('ssh-remote');
/** `ssh-remote` settings schema: named hosts with optional ProxyJump. */
const SshRemoteSettingsSchema = z.object({
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
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
let SshRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _config_decorators;
    let _saveConfig_decorators;
    return class SshRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _config_decorators = [Remote('config')];
            _saveConfig_decorators = [Remote('saveConfig')];
            __esDecorate(this, null, _config_decorators, { kind: "method", name: "config", static: false, private: false, access: { has: obj => "config" in obj, get: obj => obj.config }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _saveConfig_decorators, { kind: "method", name: "saveConfig", static: false, private: false, access: { has: obj => "saveConfig" in obj, get: obj => obj.saveConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        connections = __runInitializers(this, _instanceExtraInitializers);
        workspaces = new Map();
        listeners = new Set();
        hostResolver;
        constructor(ctx) {
            super(ctx, 'sshRemote');
            this.hostResolver = this.registerSettings();
            this.connections = new SshConnectionManager(this.hostResolver);
            this.load();
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
        get settings() {
            return this.ctx.get('settings');
        }
        registerSettings() {
            const settings = this.settings;
            if (!settings)
                return undefined;
            settings.register(SETTINGS_NS, SshRemoteSettingsSchema);
            return (host) => {
                const hosts = settings.get(SETTINGS_NS)?.hosts ?? [];
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
        /** Read the configured hosts (Web Remote). */
        config() {
            return { hosts: this.settings?.get(SETTINGS_NS)?.hosts ?? [] };
        }
        /** Replace the configured hosts (Web Remote). */
        async saveConfig(request) {
            if (!this.settings)
                throw new Error('settings provider not mounted');
            await this.settings.update(SETTINGS_NS, { hosts: request.hosts });
            return { ok: true };
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
    };
})();
export { SshRemoteService };
// ── sftp promisify helpers ────────────────────────────────────────────────
function statP(sftp, path) {
    return new Promise((resolve) => {
        sftp.stat(path, (err, st) => resolve(err ? undefined : st));
    });
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