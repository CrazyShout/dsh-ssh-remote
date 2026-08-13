import { Client } from 'ssh2';
import { readFileSync } from 'node:fs';
import { formatSshUri, parseSshUri } from './types.js';
import { loadUserSshConfig, resolveSshAlias } from './ssh-config.js';
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const READY_TIMEOUT_MS = 15000;
/** Parse a `user@host:port` jump spec into its parts. */
export function parseJumpSpec(spec) {
    let s = spec;
    let username;
    const at = s.lastIndexOf('@');
    if (at !== -1) {
        username = s.slice(0, at);
        s = s.slice(at + 1);
    }
    const colon = s.lastIndexOf(':');
    let host = s;
    let port = 22;
    if (colon !== -1) {
        host = s.slice(0, colon);
        const p = Number.parseInt(s.slice(colon + 1), 10);
        if (!Number.isNaN(p))
            port = p;
    }
    return { host, port, username };
}
/** Resolve a host config from ~/.ssh/config by alias, or from the host itself. */
export function toConnectConfig(uri, hostConfig) {
    const config = loadUserSshConfig();
    const alias = resolveSshAlias(uri.host, config);
    const host = hostConfig?.host ?? alias?.hostName ?? uri.host;
    const port = hostConfig?.port ?? alias?.port ?? uri.port;
    const username = hostConfig?.username ?? alias?.user ?? uri.user ?? undefined;
    let privateKey = hostConfig?.privateKey;
    if (!privateKey && alias?.identityFile) {
        try {
            privateKey = readFileSync(alias.identityFile, 'utf8');
        }
        catch {
            /* fall back to agent */
        }
    }
    const jumpSpec = hostConfig?.proxyJump;
    const proxyJump = jumpSpec ? parseJumpSpec(jumpSpec) : undefined;
    return {
        config: {
            host,
            port,
            username,
            privateKey,
            agent: process.env.SSH_AUTH_SOCK,
            readyTimeout: READY_TIMEOUT_MS,
            keepaliveInterval: 15000,
            keepaliveCountMax: 4,
            tryKeyboard: false,
        },
        proxyJump,
    };
}
/** Establish a jump connection and return a direct-tcpip stream to the target. */
function openJumpStream(jump, targetHost, targetPort) {
    return new Promise((resolve, reject) => {
        const jumpClient = new Client();
        let settled = false;
        const fail = (e) => {
            if (settled)
                return;
            settled = true;
            reject(e);
        };
        jumpClient
            .on('ready', () => {
            jumpClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
                if (err) {
                    jumpClient.end();
                    fail(err);
                    return;
                }
                if (settled)
                    return;
                settled = true;
                resolve({ stream, jumpClient });
            });
        })
            .on('error', fail)
            .connect({
            host: jump.host,
            port: jump.port,
            username: jump.username,
            agent: process.env.SSH_AUTH_SOCK,
            readyTimeout: READY_TIMEOUT_MS,
            tryKeyboard: false,
        });
    });
}
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user`, and
 * each connection auto-reconnects with exponential backoff while still wanted.
 * A connection with a `proxyJump` first opens a direct-tcpip channel through
 * the jump host and uses it as the target's socket.
 */
export class SshConnectionManager {
    connections = new Map();
    listeners = new Set();
    /** Optional resolver: a hostname/alias → explicit host config (from settings). */
    hostResolver;
    constructor(hostResolver) {
        this.hostResolver = hostResolver;
    }
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
        await this.waitConnected(existing);
        if (existing.status !== 'connected' || !existing.sftp) {
            throw new Error(`ssh connect failed: ${existing.lastError ?? 'timeout'}`);
        }
        return this.wrap(uriString, existing);
    }
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
        const hostConfig = this.hostResolver?.(uri.host);
        const { config, proxyJump } = toConnectConfig(uri, hostConfig);
        const withSock = proxyJump ? { ...config, _proxyJump: proxyJump } : config;
        return {
            key: this.keyOf(uri),
            config: withSock,
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
        const proxyJump = conn.config._proxyJump;
        if (proxyJump) {
            openJumpStream(proxyJump, conn.config.host, conn.config.port)
                .then(({ stream, jumpClient }) => {
                if (conn.client) {
                    // stale reconnection raced; discard this attempt
                    jumpClient.end();
                    return;
                }
                this.finishConnect(key, { ...conn.config, sock: stream }, jumpClient);
            })
                .catch((e) => this.fail(conn, `jump failed: ${e.message}`));
        }
        else {
            this.finishConnect(key, conn.config, null);
        }
    }
    finishConnect(key, config, jumpClient) {
        const conn = this.connections.get(key);
        if (!conn || !conn.wanted) {
            jumpClient?.end();
            return;
        }
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
            jumpClient?.end();
            if (conn.status === 'connected') {
                this.fail(conn, 'connection lost');
            }
        })
            .connect(config);
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
                return execOn(conn.client, command);
            },
            close: () => {
                if (conn.wanted) {
                    conn.wanted = false;
                    this.teardown(conn);
                }
            },
        };
    }
}
function execOn(client, command) {
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
export { formatSshUri };
//# sourceMappingURL=connection.js.map