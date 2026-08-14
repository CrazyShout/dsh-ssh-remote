import { Client } from 'ssh2';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import { readFileSync } from 'node:fs';
import { formatSshUri, parseSshUri } from './types.js';
import { resolveOpenSshHost } from './ssh-config.js';
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
/** Resolve effective connection settings through the local OpenSSH client. */
export async function toConnectConfig(uri, hostConfig) {
    const alias = await resolveOpenSshHost(uri.host);
    const host = hostConfig?.host ?? alias?.hostName ?? uri.host;
    const port = hostConfig?.port ?? alias?.port ?? uri.port;
    const username = hostConfig?.username ?? alias?.user ?? uri.user ?? undefined;
    let privateKey = hostConfig?.privateKey;
    if (!privateKey) {
        for (const identityFile of alias?.identityFiles ?? []) {
            try {
                privateKey = readFileSync(identityFile, 'utf8');
                break;
            }
            catch {
                /* OpenSSH may list default keys that do not exist; try the next one. */
            }
        }
    }
    const jumpSpec = hostConfig?.proxyJump ?? alias?.proxyJump;
    const proxy = jumpSpec
        ? { kind: 'jump', value: jumpSpec }
        : alias?.proxyCommand
            ? { kind: 'command', value: alias.proxyCommand }
            : undefined;
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
        proxy,
    };
}
/** Build the system OpenSSH command used for one or more ProxyJump hops. */
export function buildOpenSshJumpArgs(proxyJump, targetHost, targetPort) {
    const hops = proxyJump.split(',').map((hop) => hop.trim()).filter(Boolean);
    if (hops.length === 0)
        throw new Error('ProxyJump is empty');
    const finalJump = hops.pop();
    const args = ['-T'];
    if (hops.length > 0)
        args.push('-J', hops.join(','));
    args.push('-W', `${targetHost}:${targetPort}`, finalJump);
    return args;
}
/** Let OpenSSH establish the configured ProxyJump/ProxyCommand byte stream. */
function openProxyStream(proxy, targetHost, targetPort, username) {
    if (proxy.kind === 'jump') {
        return spawnProxyProcess('ssh', buildOpenSshJumpArgs(proxy.value, targetHost, targetPort));
    }
    const command = expandProxyCommand(proxy.value, targetHost, targetPort, username);
    return spawnProxyProcess(process.env.SHELL || '/bin/sh', ['-lc', command]);
}
function spawnProxyProcess(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        let settled = false;
        const stream = new Duplex({
            read() {
                child.stdout.resume();
            },
            write(chunk, encoding, callback) {
                if (child.stdin.write(chunk, encoding))
                    callback();
                else
                    child.stdin.once('drain', callback);
            },
            final(callback) {
                child.stdin.end(callback);
            },
            destroy(error, callback) {
                if (!child.killed)
                    child.kill();
                callback(error);
            },
        });
        child.stdout.on('data', (chunk) => {
            if (!stream.push(chunk))
                child.stdout.pause();
        });
        child.stdout.on('end', () => stream.push(null));
        child.stderr.on('data', (chunk) => {
            stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_000);
        });
        child.once('error', (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
            else {
                stream.destroy(error);
            }
        });
        child.once('spawn', () => {
            if (settled)
                return;
            settled = true;
            queueMicrotask(() => stream.emit('connect'));
            resolve({
                stream,
                close: () => {
                    stream.destroy();
                    if (!child.killed)
                        child.kill();
                },
            });
        });
        child.once('close', (code, signal) => {
            if (code === 0 || stream.destroyed)
                return;
            const detail = stderr.trim() || `exited with code ${String(code)}, signal ${String(signal)}`;
            stream.destroy(new Error(`OpenSSH proxy failed: ${detail}`));
        });
    });
}
function expandProxyCommand(command, host, port, username) {
    return command
        .replaceAll('%%', '\0')
        .replaceAll('%h', shellQuote(host))
        .replaceAll('%p', String(port))
        .replaceAll('%r', shellQuote(username ?? ''))
        .replaceAll('\0', '%');
}
function shellQuote(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user`, and
 * each connection auto-reconnects with exponential backoff while still wanted.
 * ProxyJump and ProxyCommand byte streams are delegated to system OpenSSH, so
 * Include files, wildcard defaults, Match rules, and multi-hop jumps keep the
 * same semantics as `ssh <alias>`.
 */
export class SshConnectionManager {
    connections = new Map();
    listeners = new Set();
    /** Read-only fallback for legacy DSH settings that have not been migrated. */
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
            existing = await this.allocate(uri);
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
    async allocate(uri) {
        const hostConfig = this.hostResolver?.(uri.host);
        const { config, proxy } = await toConnectConfig(uri, hostConfig);
        const withProxy = proxy ? { ...config, _proxy: proxy } : config;
        return {
            key: this.keyOf(uri),
            config: withProxy,
            client: null,
            sftp: null,
            status: 'disconnected',
            reconnectDelay: RETRY_BASE_MS,
            reconnectTimer: null,
            proxyClose: null,
            wanted: false,
        };
    }
    connect(key) {
        const conn = this.connections.get(key);
        if (!conn || !conn.wanted)
            return;
        this.setStatus(conn, conn.status === 'error' ? 'reconnecting' : 'connecting');
        const { _proxy: proxy, ...sshConfig } = conn.config;
        if (proxy) {
            openProxyStream(proxy, sshConfig.host, sshConfig.port, sshConfig.username)
                .then(({ stream, close }) => {
                if (!conn.wanted || conn.client) {
                    // stale reconnection raced; discard this attempt
                    close();
                    return;
                }
                conn.proxyClose = close;
                this.finishConnect(key, { ...sshConfig, sock: stream });
            })
                .catch((error) => this.fail(conn, `OpenSSH proxy failed: ${error.message}`));
        }
        else {
            this.finishConnect(key, sshConfig);
        }
    }
    finishConnect(key, config) {
        const conn = this.connections.get(key);
        if (!conn || !conn.wanted) {
            conn?.proxyClose?.();
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
            if (conn.status === 'connected') {
                this.fail(conn, 'connection lost');
            }
        })
            .connect(config);
    }
    fail(conn, reason) {
        conn.lastError = reason;
        this.teardown(conn);
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
    teardown(conn) {
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
        conn.proxyClose?.();
        conn.proxyClose = null;
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
            async shell(opts = {}) {
                return shellOn(conn.client, opts);
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
function shellOn(client, opts) {
    return new Promise((resolve, reject) => {
        if (!client) {
            reject(new Error('ssh not connected'));
            return;
        }
        client.shell({ term: opts.term ?? 'xterm-256color', cols: opts.cols ?? 80, rows: opts.rows ?? 24 }, (err, channel) => {
            if (err)
                reject(err);
            else
                resolve(channel);
        });
    });
}
export { formatSshUri };
//# sourceMappingURL=connection.js.map