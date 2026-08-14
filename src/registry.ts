import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { SshConnectionManager, type SshHostConfig } from './connection.js';
import {
  discoverSshHosts,
  expandHome,
  hasConcreteSshAlias,
  userSshConfigPath,
} from './ssh-config.js';
import type { RemoteWorkspace, SshConnectionStatus } from './types.js';
import { formatSshUri, parseSshUri } from './types.js';

const SETTINGS_NS = settingsNamespace('ssh-remote');

/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * fallback so an upgrade does not break already registered workspaces.
 */
const LegacySshRemoteSettingsSchema = z.object({
  hosts: z
    .array(
      z.object({
        name: z.string(),
        host: z.string(),
        port: z.number().min(1).max(65535).default(22),
        user: z.string().default(''),
        identityFile: z.string().default(''),
        proxyJump: z.string().default(''),
      }),
    )
    .default([]),
});

export interface SshHostEntry {
  name: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
}

interface LegacySshConfig {
  hosts: SshHostEntry[];
}

/** A concrete SSH alias discovered and resolved through local OpenSSH. */
export interface DiscoveredSshHost {
  alias: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
}

/** `config` result consumed by the Codex-style settings panel. */
export interface SshConfig {
  configPath: string;
  configExists: boolean;
  hosts: DiscoveredSshHost[];
  legacyHostCount: number;
}

export interface RemoteDirectoryEntry {
  name: string;
  path: string;
  hidden: boolean;
}

export interface RemoteDirectoryListing {
  path: string;
  home: string;
  crumbs: RemoteDirectoryEntry[];
  entries: RemoteDirectoryEntry[];
  truncated: boolean;
}

/** Durable exact mapping between a normal DSH Workspace path and SSH URI. */
export interface SshWorkspaceAnchor {
  anchorPath: string;
  uri: string;
  alias: string;
  remotePath: string;
  title: string;
  createdAt: number;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SSH remote workspaces service (this plugin). */
    sshRemote: SshRemoteService;
  }
}

type StatusListener = (change: { workspaceId: string; status: SshConnectionStatus; reason?: string }) => void;

function persistPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-remote-workspaces.json');
}

function anchorPersistPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-workspace-anchors.json');
}

function anchorRootPath(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'ssh-workspace-anchors');
}

/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
export class SshRemoteService extends TypertRemoteService {
  readonly connections: SshConnectionManager;
  private readonly settings: SettingsScope<LegacySshConfig>;
  private readonly workspaces = new Map<string, RemoteWorkspace>();
  private readonly anchors = new Map<string, SshWorkspaceAnchor>();
  private readonly listeners = new Set<StatusListener>();
  private readonly hostResolver?: (host: string) => SshHostConfig | undefined;

  constructor(ctx: Context) {
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
          if (reason) ws.lastError = reason;
          this.emit({ workspaceId: ws.id, status, reason });
        }
      }
      this.save();
    });
  }

  private createHostResolver(): (host: string) => SshHostConfig | undefined {
    return (host: string) => {
      // `~/.ssh/config` is authoritative. Only consult the old DSH settings
      // namespace when the workspace names no concrete OpenSSH alias.
      if (hasConcreteSshAlias(host)) return undefined;
      const hosts = this.settings.get().hosts;
      const h = hosts.find((x) => x.name === host || x.host === host);
      if (!h) return undefined;
      return {
        host: h.host,
        port: h.port,
        username: h.user || undefined,
        privateKey: h.identityFile ? this.readKey(h.identityFile) : undefined,
        proxyJump: h.proxyJump || undefined,
      };
    };
  }

  private readKey(path: string): string | undefined {
    try {
      return readFileSync(expandHome(path), 'utf8');
    } catch {
      return undefined;
    }
  }

  /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
  @Remote('config')
  async config(): Promise<SshConfig> {
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
  @Remote('browse')
  async browse(alias: string, path: string): Promise<RemoteDirectoryListing> {
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
      if (!status?.isDirectory()) throw new Error(`remote path is not a directory: ${target}`);
      const rows = await readdirP(sftp, target);
      const directories = (await Promise.all(rows.map(async (row) => {
        const childPath = posix.join(target, row.filename);
        const child = row.attrs.isDirectory() ? row.attrs : await statP(sftp, childPath);
        if (!child?.isDirectory()) return undefined;
        return {
          name: row.filename,
          path: childPath,
          hidden: row.filename.startsWith('.'),
        } satisfies RemoteDirectoryEntry;
      }))).filter((entry): entry is RemoteDirectoryEntry => entry !== undefined)
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
  @Remote('createDirectory')
  async createDirectory(alias: string, parent: string, name: string): Promise<string> {
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
  @Remote('materializeWorkspace')
  async materializeWorkspace(alias: string, remotePath: string): Promise<SshWorkspaceAnchor> {
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
    const anchor: SshWorkspaceAnchor = {
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
  resolveRemotePath(localPath: string): string | undefined {
    const absolute = resolve(localPath);
    const candidates = [...this.anchors.values()].sort(
      (left, right) => right.anchorPath.length - left.anchorPath.length,
    );
    for (const anchor of candidates) {
      if (absolute !== anchor.anchorPath && !absolute.startsWith(`${anchor.anchorPath}${sep}`)) continue;
      const suffix = relative(anchor.anchorPath, absolute).split(sep).filter(Boolean);
      const base = parseSshUri(anchor.uri);
      return formatSshUri({ ...base, path: posix.join(base.path, ...suffix) });
    }
    return undefined;
  }

  async ensureDirectory(uri: string): Promise<void> {
    const parsed = parseSshUri(uri);
    const transport = await this.connections.transport(uri);
    const status = await transport.sftp((sftp) => statP(sftp, parsed.path));
    if (!status?.isDirectory()) throw new Error(`remote path is not a directory: ${parsed.path}`);
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): RemoteWorkspace[] {
    return [...this.workspaces.values()];
  }

  get(id: string): RemoteWorkspace | undefined {
    return this.workspaces.get(id);
  }

  add(uri: string, title?: string): RemoteWorkspace {
    const parsed = parseSshUri(uri);
    const id = `${parsed.host}-${Date.now().toString(36)}`;
    const record: RemoteWorkspace = {
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

  remove(id: string): boolean {
    const ws = this.workspaces.get(id);
    if (!ws) return false;
    void this.connections.close(ws.uri);
    this.workspaces.delete(id);
    this.save();
    return true;
  }

  async connect(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    await this.connections.transport(ws.uri);
  }

  async disconnect(id: string): Promise<void> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    await this.connections.close(ws.uri);
  }

  async exec(id: string, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.exec(command);
  }

  async stat(id: string, path: string): Promise<{ type: string; size: number } | undefined> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.sftp(async (sftp) => {
      const st = await statP(sftp, this.remotePath(ws.uri, path));
      return st ? { type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other', size: st.size } : undefined;
    });
  }

  async listDir(id: string, path: string): Promise<Array<{ name: string; type: string; size: number }>> {
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

  async readText(id: string, path: string): Promise<string> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    return transport.sftp(async (sftp) => {
      const buf = await readFileP(sftp, this.remotePath(ws.uri, path));
      return buf.toString('utf8');
    });
  }

  async writeText(id: string, path: string, content: string): Promise<void> {
    const ws = this.require(id);
    const transport = await this.connections.transport(ws.uri);
    await transport.sftp(async (sftp) => {
      await writeFileP(sftp, this.remotePath(ws.uri, path), Buffer.from(content, 'utf8'));
    });
  }

  async dispose(): Promise<void> {
    await this.connections.dispose();
    this.workspaces.clear();
    this.anchors.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private require(id: string): RemoteWorkspace {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`no such workspace: ${id}`);
    return ws;
  }

  private keyOf(uri: string): string {
    const u = parseSshUri(uri);
    return `${u.host}:${u.port}:${u.user}`;
  }

  private remotePath(uri: string, path: string): string {
    if (path.startsWith('/')) return path;
    return join(parseSshUri(uri).path, path).replace(/\/+$/, '') || '/';
  }

  private emit(change: { workspaceId: string; status: SshConnectionStatus; reason?: string }): void {
    for (const l of this.listeners) l(change);
  }

  private load(): void {
    try {
      const raw = readFileSync(persistPath(), 'utf8');
      const list = JSON.parse(raw) as RemoteWorkspace[];
      for (const ws of list) {
        if (ws && typeof ws.id === 'string' && typeof ws.uri === 'string') {
          ws.status = 'disconnected';
          ws.lastError = undefined;
          this.workspaces.set(ws.id, ws);
        }
      }
    } catch {
      /* no persisted workspaces */
    }
  }

  private save(): void {
    try {
      const file = persistPath();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify([...this.workspaces.values()], null, 2));
    } catch {
      /* best effort */
    }
  }

  private loadAnchors(): void {
    try {
      const list = JSON.parse(readFileSync(anchorPersistPath(), 'utf8')) as SshWorkspaceAnchor[];
      for (const anchor of list) {
        if (!anchor || typeof anchor.anchorPath !== 'string' || typeof anchor.uri !== 'string') continue;
        const anchorPath = resolve(anchor.anchorPath);
        this.anchors.set(anchorPath, { ...anchor, anchorPath });
        mkdirSync(anchorPath, { recursive: true });
      }
    } catch {
      /* no persisted anchors */
    }
  }

  private saveAnchors(): void {
    const file = anchorPersistPath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify([...this.anchors.values()], null, 2));
  }
}

// ── sftp promisify helpers ────────────────────────────────────────────────

function statP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<import('ssh2').Stats | undefined>((resolve) => {
    sftp.stat(path, (err, st) => resolve(err ? undefined : st));
  });
}

function realpathP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<string>((resolvePath, reject) => {
    sftp.realpath(path, (err, resolved) => (err ? reject(err) : resolvePath(resolved)));
  });
}

function mkdirP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<void>((resolveDirectory, reject) => {
    sftp.mkdir(path, (err) => (err ? reject(err) : resolveDirectory()));
  });
}

function normalizeRemotePath(path: string): string {
  if (!path.startsWith('/')) throw new Error(`remote workspace path must be absolute: ${path}`);
  return path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function remoteCrumbs(path: string): RemoteDirectoryEntry[] {
  const parts = path.split('/').filter(Boolean);
  const crumbs: RemoteDirectoryEntry[] = [{ name: '/', path: '/', hidden: false }];
  let current = '';
  for (const part of parts) {
    current = `${current}/${part}`;
    crumbs.push({ name: part, path: current, hidden: false });
  }
  return crumbs;
}

function readdirP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<Array<{ filename: string; attrs: import('ssh2').Stats }>>((resolve, reject) => {
    sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list)));
  });
}

function readFileP(sftp: import('ssh2').SFTPWrapper, path: string) {
  return new Promise<Buffer>((resolve, reject) => {
    sftp.readFile(path, (err, buf) => (err ? reject(err) : resolve(buf)));
  });
}

function writeFileP(sftp: import('ssh2').SFTPWrapper, path: string, data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    sftp.writeFile(path, data, (err) => (err ? reject(err) : resolve()));
  });
}
