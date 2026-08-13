import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';
import { formatSshUri, parseSshUri } from './types.js';
import { loadUserSshConfig, resolveSshAlias } from './ssh-config.js';
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const READY_TIMEOUT_MS = 15000;
/** Resolve an SSH uri against ~/.ssh/config into an ssh2 ConnectConfig. */
export function toConnectConfig(uri) {
    const config = loadUserSshConfig();
    // An alias in ~/.ssh/config may name the host; otherwise use the uri host.
    const alias = resolveSshAlias(uri.host, config);
    const host = alias?.hostName ?? uri.host;
    const port = alias?.port ?? uri.port;
    const username = alias?.user ?? uri.user ?? undefined;
    let privateKey;
    if (alias?.identityFile) {
        try {
            privateKey = readFileSync(alias.identityFile, 'utf8');
        }
        catch {
            // leave undefined; fall back to agent
        }
    }
    return {
        host,
        port,
        username,
        privateKey,
        agent: process.env.SSH_AUTH_SOCK,
        readyTimeout: READY_TIMEOUT_MS,
        keepaliveInterval: 15000,
        keepaliveCountMax: 4,
        // Never fall back to interactive password prompts in a headless agent.
        tryKeyboard: false,
    };
}
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user` so
 * multiple workspaces on one host share a single TCP connection, and each
 * connection auto-reconnects with exponential backoff while still wanted.
 */
export class SshConnectionManager {
    connections = new Map();
    listeners = new Set();
    onStatus(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    emit(key, status, reason) {
        for (const l of this.listeners)
            l(key, status, reason);
    }
    keyOf(uri) {
        return `${uri.host}:${uri.port}:${uri.user}`;
    }
    /** Ensure a live transport for a uri string, connecting on demand. */
    async transport(uriString) {
        const uri = parseSshUri(uriString);
        const key = this.keyOf(uri);
        let existing = this.connections.get(key);
        if (existing && existing.status === 'connected' && existing.sftp) {
            return this.wrap(uriString, existing);
        }
        if (!existing) {
            existing = this.allocate(uri);
            this.connections.set(key, existing);
        }
        existing.wanted = true;
        if (existing.status !== 'connecting' && existing.status !== 'connected') {
            void this.connect(key);
        }
        // Wait for the connection to reach connected or error.
        await this.waitConnected(existing);
        if (existing.status !== 'connected' || !existing.sftp) {
            throw new Error(`ssh connect failed: ${existing.lastError ?? 'timeout'}`);
        }
        return this.wrap(uriString, existing);
    }
    /** Disconnect a transport and stop reconnecting it. */
    async close(uriString) {
        const key = this.keyOf(parseSshUri(uriString));
        const conn = this.connections.get(key);
        if (!conn)
            return;
        conn.wanted = false;
        if (conn.reconnectTimer)
            clearTimeout(conn.reconnectTimer);
        conn.reconnectTimer = null;
        this.teardown(conn);
        this.setStatus(conn, 'disconnected', 'closed');
    }
    /** Dispose every connection. */
    async dispose() {
        for (const conn of this.connections.values()) {
            conn.wanted = false;
            if (conn.reconnectTimer)
                clearTimeout(conn.reconnectTimer);
            this.teardown(conn);
        }
        this.connections.clear();
    }
    allocate(uri) {
        return {
            key: this.keyOf(uri),
            config: toConnectConfig(uri),
            client: null,
            sftp: null,
            status: 'disconnected',
            reconnectDelay: RETRY_BASE_MS,
            reconnectTimer: null,
            wanted: false,
        };
    }
    connect(key) {
        const conn = this.connections.get(key);
        if (!conn || !conn.wanted)
            return;
        this.setStatus(conn, conn.status === 'error' ? 'reconnecting' : 'connecting');
        const client = new Client();
        conn.client = client;
        client
            .on('ready', () => {
            client.sftp((err, sftp) => {
                if (err) {
                    this.fail(conn, `sftp unavailable: ${err.message}`);
                    return;
                }
                conn.sftp = sftp;
                conn.reconnectDelay = RETRY_BASE_MS;
                this.setStatus(conn, 'connected');
            });
        })
            .on('error', (err) => {
            this.fail(conn, err.message);
        })
            .on('close', () => {
            if (conn.status === 'connected') {
                this.fail(conn, 'connection lost');
            }
        })
            .connect(conn.config);
    }
    fail(conn, reason) {
        conn.lastError = reason;
        this.teardown(conn, /* keepClient */ true);
        if (!conn.wanted)
            return;
        this.setStatus(conn, 'error');
        this.scheduleReconnect(conn);
    }
    scheduleReconnect(conn) {
        if (!conn.wanted || conn.reconnectTimer)
            return;
        const delay = conn.reconnectDelay;
        conn.reconnectDelay = Math.min(delay * 2, RETRY_MAX_MS);
        conn.reconnectTimer = setTimeout(() => {
            conn.reconnectTimer = null;
            if (conn.wanted)
                this.connect(conn.key);
        }, delay);
    }
    teardown(conn, keepClient = false) {
        conn.sftp = null;
        if (conn.client) {
            try {
                conn.client.end();
            }
            catch {
                /* ignore */
            }
            if (!keepClient)
                conn.client = null;
        }
    }
    setStatus(conn, status, reason) {
        conn.status = status;
        if (reason)
            conn.lastError = reason;
        this.emit(conn.key, status, reason);
    }
    waitConnected(conn) {
        return new Promise((resolve) => {
            const poll = setInterval(() => {
                if (conn.status === 'connected' || conn.status === 'error') {
                    clearInterval(poll);
                    resolve();
                }
            }, 100);
        });
    }
    wrap(uriString, conn) {
        const uri = parseSshUri(uriString);
        return {
            hostKey: conn.key,
            uri,
            get status() {
                return conn.status;
            },
            get lastError() {
                return conn.lastError;
            },
            async sftp(op) {
                if (!conn.sftp)
                    throw new Error('ssh not connected');
                return op(conn.sftp);
            },
            async exec(command) {
                return thisExec(conn.client, command);
            },
            close() {
                if (conn.wanted) {
                    conn.wanted = false;
                    thisTeardown(conn);
                }
            },
        };
    }
}
function thisTeardown(conn) {
    conn.sftp = null;
    if (conn.client) {
        try {
            conn.client.end();
        }
        catch {
            /* ignore */
        }
        conn.client = null;
    }
}
function thisExec(client, command) {
    return new Promise((resolve, reject) => {
        if (!client) {
            reject(new Error('ssh not connected'));
            return;
        }
        client.exec(command, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }
            let stdout = '';
            let stderr = '';
            stream
                .on('data', (d) => {
                stdout += d.toString();
            })
                .stderr.on('data', (d) => {
                stderr += d.toString();
            })
                .on('close', (code) => {
                resolve({ code, stdout, stderr });
            });
        });
    });
}
// re-export used elsewhere
export { formatSshUri };
//# sourceMappingURL=connection.js.map