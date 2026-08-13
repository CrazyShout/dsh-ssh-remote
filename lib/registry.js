import { Service } from '@deepseek-ai/cordis';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { SshConnectionManager } from './connection.js';
import { formatSshUri, parseSshUri } from './types.js';
function persistPath() {
    return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-remote-workspaces.json');
}
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes file/exec operations for the model tool
 * and (later) the transparent filesystem routing.
 */
export class SshRemoteService extends Service {
    connections;
    workspaces = new Map();
    listeners = new Set();
    constructor(ctx, hostResolver) {
        super(ctx, 'sshRemote');
        this.connections = new SshConnectionManager(hostResolver);
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
}
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