import { Client, type SFTPWrapper, type ConnectConfig, type ClientChannel } from 'ssh2';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import { readFileSync } from 'node:fs';
import { formatSshUri, parseSshUri, type SshConnectionStatus, type SshUri } from './types.js';
import { resolveOpenSshHost } from './ssh-config.js';
import {
  assertHostTrustReady,
  createHostVerifier,
  loadOpenSshHostTrust,
} from './known-hosts.js';

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

export interface SshConnectionManagerOptions {
  resolveConnectConfig?: typeof toConnectConfig;
  createClient?: () => Client;
}

interface ManagedConnection {
  key: string;
  uri: SshUri;
  client: Client | null;
  sftp: SFTPWrapper | null;
  status: SshConnectionStatus;
  lastError?: string;
  reconnectDelay: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  proxyClose: (() => void) | null;
  wanted: boolean;
  /** Monotonic fence: late callbacks from an older attempt are ignored. */
  attempt: number;
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
const CONNECT_WAIT_TIMEOUT_MS = 25000;

/** Parse a `user@host:port` jump spec into its parts. */
export function parseJumpSpec(spec: string): SshHostConfig {
  let s = spec;
  let username: string | undefined;
  const at = s.lastIndexOf('@');
  if (at !== -1) {
    username = s.slice(0, at);
    s = s.slice(at + 1);
  }
  let host = s;
  let port = 22;
  if (s.startsWith('[')) {
    const bracket = s.indexOf(']');
    if (bracket === -1) throw new Error(`invalid ProxyJump host: ${spec}`);
    host = s.slice(1, bracket);
    const suffix = s.slice(bracket + 1);
    if (suffix) {
      if (!suffix.startsWith(':')) throw new Error(`invalid ProxyJump host: ${spec}`);
      port = parseJumpPort(suffix.slice(1), spec);
    }
  } else {
    const firstColon = s.indexOf(':');
    const lastColon = s.lastIndexOf(':');
    if (firstColon !== -1 && firstColon !== lastColon) {
      throw new Error(`invalid ProxyJump IPv6 host (use brackets): ${spec}`);
    }
    if (lastColon !== -1) {
      host = s.slice(0, lastColon);
      port = parseJumpPort(s.slice(lastColon + 1), spec);
    }
  }
  if (!host || host.startsWith('-')) throw new Error(`invalid ProxyJump host: ${spec}`);
  if (username?.startsWith('-') || (username !== undefined && /[\s\0]/u.test(username))) {
    throw new Error(`invalid ProxyJump user: ${spec}`);
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
  const trust = await loadOpenSshHostTrust(alias, host, port);
  assertHostTrustReady(trust, uri.host);
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
      hostVerifier: createHostVerifier(trust),
    },
    proxy,
  };
}

/** Build the system OpenSSH command used for one or more ProxyJump hops. */
export function buildOpenSshJumpArgs(proxyJump: string, targetHost: string, targetPort: number): string[] {
  const hops = proxyJump.split(',').map((hop) => hop.trim()).filter(Boolean);
  if (hops.length === 0) throw new Error('ProxyJump is empty');
  const finalJump = hops.pop() as string;
  const parsedFinal = parseJumpSpec(finalJump);
  const finalHost = parsedFinal.host.includes(':') ? `[${parsedFinal.host}]` : parsedFinal.host;
  const destination = `${parsedFinal.username ? `${parsedFinal.username}@` : ''}${finalHost}`;
  const forwardHost = targetHost.includes(':') ? `[${targetHost}]` : targetHost;
  const args = ['-T'];
  if (hops.length > 0) args.push('-J', hops.join(','));
  if (parsedFinal.port !== 22) args.push('-p', String(parsedFinal.port));
  args.push('-W', `${forwardHost}:${targetPort}`, '--', destination);
  return args;
}

function parseJumpPort(value: string, spec: string): number {
  if (!/^\d+$/u.test(value)) throw new Error(`invalid ProxyJump port: ${spec}`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ProxyJump port: ${spec}`);
  }
  return port;
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
 * Effective host settings are refreshed through `ssh -G`. ProxyJump streams
 * use system OpenSSH; ProxyCommand is launched from the effective configured
 * command with the subset of tokens expanded by {@link expandProxyCommand}.
 */
export class SshConnectionManager {
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly listeners = new Set<StatusListener>();
  /** Read-only fallback for legacy DSH settings that have not been migrated. */
  private readonly hostResolver?: (host: string) => SshHostConfig | undefined;
  private readonly resolveConnectConfig: typeof toConnectConfig;
  private readonly createClient: () => Client;

  constructor(
    hostResolver?: (host: string) => SshHostConfig | undefined,
    options: SshConnectionManagerOptions = {},
  ) {
    this.hostResolver = hostResolver;
    this.resolveConnectConfig = options.resolveConnectConfig ?? toConnectConfig;
    this.createClient = options.createClient ?? (() => new Client());
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
      // Allocation is deliberately synchronous and published before any
      // `ssh -G`/known_hosts I/O. Concurrent first callers therefore share one
      // state machine instead of racing two invisible transports.
      existing = this.allocate(uri);
      this.connections.set(key, existing);
    }
    existing.wanted = true;
    if (existing.status === 'disconnected' || (existing.status === 'error' && !existing.reconnectTimer)) {
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
    conn.attempt += 1;
    this.teardown(conn);
    this.setStatus(conn, 'disconnected', 'closed');
  }

  async dispose(): Promise<void> {
    for (const conn of this.connections.values()) {
      conn.wanted = false;
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);
      conn.attempt += 1;
      this.teardown(conn);
    }
    this.connections.clear();
  }

  private allocate(uri: SshUri): ManagedConnection {
    return {
      key: this.keyOf(uri),
      uri,
      client: null,
      sftp: null,
      status: 'disconnected',
      reconnectDelay: RETRY_BASE_MS,
      reconnectTimer: null,
      proxyClose: null,
      wanted: false,
      attempt: 0,
    };
  }

  private connect(key: string): void {
    const conn = this.connections.get(key);
    if (!conn || !conn.wanted) return;
    const attempt = ++conn.attempt;
    this.setStatus(conn, conn.status === 'error' ? 'reconnecting' : 'connecting');
    void this.open(conn, attempt);
  }

  private async open(conn: ManagedConnection, attempt: number): Promise<void> {
    try {
      // Re-resolve on every attempt so Refresh/disconnect and automatic
      // reconnects observe edits to ~/.ssh/config and known_hosts.
      const hostConfig = this.hostResolver?.(conn.uri.host);
      const { config, proxy } = await this.resolveConnectConfig(conn.uri, hostConfig);
      if (!this.isCurrent(conn, attempt)) return;
      if (!proxy) {
        this.finishConnect(conn, attempt, config);
        return;
      }
      const { stream, close } = await openProxyStream(
        proxy,
        config.host as string,
        config.port as number,
        config.username,
      );
      if (!this.isCurrent(conn, attempt)) {
        close();
        return;
      }
      conn.proxyClose = close;
      this.finishConnect(conn, attempt, { ...config, sock: stream } as ConnectConfig);
    } catch (reason) {
      this.fail(conn, attempt, reason instanceof Error ? reason.message : String(reason));
    }
  }

  private finishConnect(conn: ManagedConnection, attempt: number, config: ConnectConfig): void {
    if (!this.isCurrent(conn, attempt)) return;
    const client = this.createClient();
    conn.client = client;
    client
      .on('ready', () => {
        if (!this.isCurrent(conn, attempt, client)) return;
        client.sftp((err, sftp) => {
          if (!this.isCurrent(conn, attempt, client)) {
            sftp?.end();
            return;
          }
          if (err) {
            this.fail(conn, attempt, `sftp unavailable: ${err.message}`);
            return;
          }
          conn.sftp = sftp;
          conn.lastError = undefined;
          conn.reconnectDelay = RETRY_BASE_MS;
          this.setStatus(conn, 'connected');
        });
      })
      .on('error', (err) => {
        this.fail(conn, attempt, err.message);
      })
      .on('close', () => {
        if (this.isCurrent(conn, attempt, client) && (conn.status === 'connected' || conn.status === 'connecting' || conn.status === 'reconnecting')) {
          this.fail(conn, attempt, 'connection lost');
        }
      })
      .connect(config);
  }

  private fail(conn: ManagedConnection, attempt: number, reason: string): void {
    if (!this.isCurrent(conn, attempt)) return;
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
    const client = conn.client;
    conn.client = null;
    if (client) {
      try {
        // Fenced callbacks must not tear down a newer replacement client.
        client.removeAllListeners();
        client.end();
      } catch {
        /* ignore */
      }
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
      const startedAt = Date.now();
      const poll = setInterval(() => {
        if (
          conn.status === 'connected'
          || conn.status === 'error'
          || conn.status === 'disconnected'
          || Date.now() - startedAt >= CONNECT_WAIT_TIMEOUT_MS
        ) {
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
        if (conn.wanted) void this.close(uriString);
      },
    };
  }

  private isCurrent(conn: ManagedConnection, attempt: number, client?: Client): boolean {
    return conn.wanted
      && conn.attempt === attempt
      && this.connections.get(conn.key) === conn
      && (client === undefined || conn.client === client);
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
      let exitCode: number | undefined;
      let exitSignal: string | undefined;
      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      stream.on('exit', (code: number | undefined, signal: string | undefined) => {
        exitCode = code;
        exitSignal = signal;
      });
      stream.on('close', () => {
        // RFC 4254 permits an absent exit-status. A clean channel with no
        // signal is treated as success; a signalled exit uses shell-style 128.
        resolve({ code: exitCode ?? (exitSignal ? 128 : 0), stdout, stderr });
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
