import { Client, type SFTPWrapper, type ConnectConfig, type ClientChannel } from 'ssh2';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import { readFileSync } from 'node:fs';
import { formatSshUri, parseSshUri, type SshConnectionStatus, type SshUri } from './types.js';
import { resolveOpenSshHost } from './ssh-config.js';

/** A resolved host target, possibly reached through a ProxyJump. */
export interface SshHostConfig {
  host: string;
  port: number;
  username?: string;
  privateKey?: string;
  /** `user@host:port` of the jump host, or another host config name. */
  proxyJump?: string;
}

/** A single SSH transport (host-scoped), owned by the connection manager. */
export interface SshTransport {
  readonly hostKey: string;
  readonly uri: SshUri;
  status: SshConnectionStatus;
  lastError?: string;
  sftp<T>(op: (sftp: SFTPWrapper) => Promise<T>): Promise<T>;
  exec(command: string): Promise<{ code: number; stdout: string; stderr: string }>;
  shell(opts?: { cols?: number; rows?: number; term?: string }): Promise<ClientChannel>;
  close(): void;
}

type StatusListener = (key: string, status: SshConnectionStatus, reason?: string) => void;

interface ManagedConnection {
  key: string;
  config: ConnectConfig;
  client: Client | null;
  sftp: SFTPWrapper | null;
  status: SshConnectionStatus;
  lastError?: string;
  reconnectDelay: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  proxyClose: (() => void) | null;
  wanted: boolean;
}

interface ProxySpec {
  kind: 'jump' | 'command';
  value: string;
}

interface ProxyStream {
  stream: Duplex;
  close: () => void;
}

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const READY_TIMEOUT_MS = 15000;

/** Parse a `user@host:port` jump spec into its parts. */
export function parseJumpSpec(spec: string): SshHostConfig {
  let s = spec;
  let username: string | undefined;
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
    if (!Number.isNaN(p)) port = p;
  }
  return { host, port, username };
}

/** Resolve effective connection settings through the local OpenSSH client. */
export async function toConnectConfig(
  uri: SshUri,
  hostConfig?: SshHostConfig,
): Promise<{ config: ConnectConfig; proxy?: ProxySpec }> {
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
      } catch {
        /* OpenSSH may list default keys that do not exist; try the next one. */
      }
    }
  }
  const jumpSpec = hostConfig?.proxyJump ?? alias?.proxyJump;
  const proxy = jumpSpec
    ? { kind: 'jump' as const, value: jumpSpec }
    : alias?.proxyCommand
      ? { kind: 'command' as const, value: alias.proxyCommand }
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
export function buildOpenSshJumpArgs(proxyJump: string, targetHost: string, targetPort: number): string[] {
  const hops = proxyJump.split(',').map((hop) => hop.trim()).filter(Boolean);
  if (hops.length === 0) throw new Error('ProxyJump is empty');
  const finalJump = hops.pop() as string;
  const args = ['-T'];
  if (hops.length > 0) args.push('-J', hops.join(','));
  args.push('-W', `${targetHost}:${targetPort}`, finalJump);
  return args;
}

/** Let OpenSSH establish the configured ProxyJump/ProxyCommand byte stream. */
function openProxyStream(
  proxy: ProxySpec,
  targetHost: string,
  targetPort: number,
  username?: string,
): Promise<ProxyStream> {
  if (proxy.kind === 'jump') {
    return spawnProxyProcess('ssh', buildOpenSshJumpArgs(proxy.value, targetHost, targetPort));
  }
  const command = expandProxyCommand(proxy.value, targetHost, targetPort, username);
  return spawnProxyProcess(process.env.SHELL || '/bin/sh', ['-lc', command]);
}

function spawnProxyProcess(command: string, args: string[]): Promise<ProxyStream> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;
    const stream = new Duplex({
      read() {
        child.stdout.resume();
      },
      write(chunk, encoding, callback) {
        if (child.stdin.write(chunk, encoding)) callback();
        else child.stdin.once('drain', callback);
      },
      final(callback) {
        child.stdin.end(callback);
      },
      destroy(error, callback) {
        if (!child.killed) child.kill();
        callback(error);
      },
    });

    child.stdout.on('data', (chunk: Buffer) => {
      if (!stream.push(chunk)) child.stdout.pause();
    });
    child.stdout.on('end', () => stream.push(null));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_000);
    });
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      } else {
        stream.destroy(error);
      }
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => stream.emit('connect'));
      resolve({
        stream,
        close: () => {
          stream.destroy();
          if (!child.killed) child.kill();
        },
      });
    });
    child.once('close', (code, signal) => {
      if (code === 0 || stream.destroyed) return;
      const detail = stderr.trim() || `exited with code ${String(code)}, signal ${String(signal)}`;
      stream.destroy(new Error(`OpenSSH proxy failed: ${detail}`));
    });
  });
}

function expandProxyCommand(command: string, host: string, port: number, username?: string): string {
  return command
    .replaceAll('%%', '\0')
    .replaceAll('%h', shellQuote(host))
    .replaceAll('%p', String(port))
    .replaceAll('%r', shellQuote(username ?? ''))
    .replaceAll('\0', '%');
}

function shellQuote(value: string): string {
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
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly listeners = new Set<StatusListener>();
  /** Read-only fallback for legacy DSH settings that have not been migrated. */
  private readonly hostResolver?: (host: string) => SshHostConfig | undefined;

  constructor(hostResolver?: (host: string) => SshHostConfig | undefined) {
    this.hostResolver = hostResolver;
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(key: string, status: SshConnectionStatus, reason?: string) {
    for (const l of this.listeners) l(key, status, reason);
  }

  private keyOf(uri: SshUri): string {
    return `${uri.host}:${uri.port}:${uri.user}`;
  }

  async transport(uriString: string): Promise<SshTransport> {
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

  async close(uriString: string): Promise<void> {
    const key = this.keyOf(parseSshUri(uriString));
    const conn = this.connections.get(key);
    if (!conn) return;
    conn.wanted = false;
    if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
    this.teardown(conn);
    this.setStatus(conn, 'disconnected', 'closed');
  }

  async dispose(): Promise<void> {
    for (const conn of this.connections.values()) {
      conn.wanted = false;
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
      this.teardown(conn);
    }
    this.connections.clear();
  }

  private async allocate(uri: SshUri): Promise<ManagedConnection> {
    const hostConfig = this.hostResolver?.(uri.host);
    const { config, proxy } = await toConnectConfig(uri, hostConfig);
    const withProxy = proxy ? { ...config, _proxy: proxy } : config;
    return {
      key: this.keyOf(uri),
      config: withProxy as ConnectConfig,
      client: null,
      sftp: null,
      status: 'disconnected',
      reconnectDelay: RETRY_BASE_MS,
      reconnectTimer: null,
      proxyClose: null,
      wanted: false,
    };
  }

  private connect(key: string): void {
    const conn = this.connections.get(key);
    if (!conn || !conn.wanted) return;
    this.setStatus(conn, conn.status === 'error' ? 'reconnecting' : 'connecting');

    const { _proxy: proxy, ...sshConfig } = conn.config as ConnectConfig & { _proxy?: ProxySpec };
    if (proxy) {
      openProxyStream(
        proxy,
        sshConfig.host as string,
        sshConfig.port as number,
        sshConfig.username,
      )
        .then(({ stream, close }) => {
          if (!conn.wanted || conn.client) {
            // stale reconnection raced; discard this attempt
            close();
            return;
          }
          conn.proxyClose = close;
          this.finishConnect(key, { ...sshConfig, sock: stream } as ConnectConfig);
        })
        .catch((error: Error) => this.fail(conn, `OpenSSH proxy failed: ${error.message}`));
    } else {
      this.finishConnect(key, sshConfig);
    }
  }

  private finishConnect(key: string, config: ConnectConfig): void {
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

  private fail(conn: ManagedConnection, reason: string): void {
    conn.lastError = reason;
    this.teardown(conn);
    if (!conn.wanted) return;
    this.setStatus(conn, 'error');
    this.scheduleReconnect(conn);
  }

  private scheduleReconnect(conn: ManagedConnection): void {
    if (!conn.wanted || conn.reconnectTimer) return;
    const delay = conn.reconnectDelay;
    conn.reconnectDelay = Math.min(delay * 2, RETRY_MAX_MS);
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (conn.wanted) this.connect(conn.key);
    }, delay);
  }

  private teardown(conn: ManagedConnection): void {
    conn.sftp = null;
    if (conn.client) {
      try {
        conn.client.end();
      } catch {
        /* ignore */
      }
      conn.client = null;
    }
    conn.proxyClose?.();
    conn.proxyClose = null;
  }

  private setStatus(conn: ManagedConnection, status: SshConnectionStatus, reason?: string): void {
    conn.status = status;
    if (reason) conn.lastError = reason;
    this.emit(conn.key, status, reason);
  }

  private waitConnected(conn: ManagedConnection): Promise<void> {
    return new Promise((resolve) => {
      const poll = setInterval(() => {
        if (conn.status === 'connected' || conn.status === 'error') {
          clearInterval(poll);
          resolve();
        }
      }, 100);
    });
  }

  private wrap(uriString: string, conn: ManagedConnection): SshTransport {
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
      async sftp<T>(op: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
        if (!conn.sftp) throw new Error('ssh not connected');
        return op(conn.sftp);
      },
      async exec(command: string) {
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

function execOn(client: Client | null, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
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
        .on('data', (d: Buffer) => {
          stdout += d.toString();
        })
        .stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        })
        .on('close', (code: number) => {
          resolve({ code, stdout, stderr });
        });
    });
  });
}

function shellOn(client: Client | null, opts: { cols?: number; rows?: number; term?: string }): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    if (!client) {
      reject(new Error('ssh not connected'));
      return;
    }
    client.shell(
      { term: opts.term ?? 'xterm-256color', cols: opts.cols ?? 80, rows: opts.rows ?? 24 },
      (err, channel) => {
        if (err) reject(err);
        else resolve(channel);
      },
    );
  });
}

export { formatSshUri };
