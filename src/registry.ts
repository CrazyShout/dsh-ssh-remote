import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, posix, relative, resolve, sep } from 'node:path';
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
const DIRECTORY_PAGE_LIMIT = 1000;
/** Hard input bound so one hostile/huge remote directory cannot exhaust RAM. */
const DIRECTORY_INPUT_LIMIT = 5000;
const DIRECTORY_SCAN_BATCH = 32;

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
  return dshHomePath('ssh-remote-workspaces.json');
}

function anchorPersistPath(): string {
  return dshHomePath('ssh-workspace-anchors.json');
}

function anchorRootPath(): string {
  return dshHomePath('ssh-workspace-anchors');
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
  private workspaceSaveQueue: Promise<void> = Promise.resolve();
  private anchorSaveQueue: Promise<void> = Promise.resolve();

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
      void this.save().catch(() => {
        /* a later transition retries with a fresh complete snapshot */
      });
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
      const page = await readdirBoundedP(sftp, target, DIRECTORY_INPUT_LIMIT);
      const rows = page.rows.sort((left, right) => left.filename.localeCompare(right.filename));
      const directories: RemoteDirectoryEntry[] = [];
      let processed = 0;
      for (; processed < rows.length && directories.length <= DIRECTORY_PAGE_LIMIT; processed += DIRECTORY_SCAN_BATCH) {
        const batch = rows.slice(processed, processed + DIRECTORY_SCAN_BATCH);
        const found = await Promise.all(batch.map(async (row) => {
          const childPath = posix.join(target, row.filename);
          // Normal files cannot become directory choices. Only symlinks need a
          // follow-up stat; this avoids one SFTP round-trip per regular file.
          const child = row.attrs.isDirectory()
            ? row.attrs
            : row.attrs.isSymbolicLink()
              ? await statP(sftp, childPath)
              : undefined;
          if (!child?.isDirectory()) return undefined;
          return {
            name: row.filename,
            path: childPath,
            hidden: row.filename.startsWith('.'),
          } satisfies RemoteDirectoryEntry;
        }));
        directories.push(...found.filter((entry): entry is RemoteDirectoryEntry => entry !== undefined));
      }
      const truncated = page.truncated
        || directories.length > DIRECTORY_PAGE_LIMIT
        || processed < rows.length;
      return {
        path: target,
        home,
        crumbs: remoteCrumbs(target),
        entries: directories.slice(0, DIRECTORY_PAGE_LIMIT),
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
      mkdirSync(existing.anchorPath, { recursive: true, mode: 0o700 });
      // Also repairs a prior atomic-save failure before reporting success.
      await this.saveAnchors();
      return existing;
    }
    const title = `${basename(remotePath.replace(/\/+$/, '')) || 'root'} · ${alias}`;
    const safeTitle = title.replace(/[/:]/g, '-').replace(/\s+/g, ' ').trim();
    const digest = createHash('sha256').update(uri).digest('hex').slice(0, 8);
    const rawAnchor = join(anchorRootPath(), `${safeTitle} [${digest}]`);
    mkdirSync(rawAnchor, { recursive: true, mode: 0o700 });
    const anchor: SshWorkspaceAnchor = {
      anchorPath: realpathSync(rawAnchor),
      uri,
      alias,
      remotePath: normalizeRemotePath(remotePath),
      title,
      createdAt: Date.now(),
    };
    this.anchors.set(anchor.anchorPath, anchor);
    await this.saveAnchors();
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
    void this.save().catch(() => {});
    return record;
  }

  remove(id: string): boolean {
    const ws = this.workspaces.get(id);
    if (!ws) return false;
    void this.connections.close(ws.uri);
    this.workspaces.delete(id);
    void this.save().catch(() => {});
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
    await Promise.allSettled([this.workspaceSaveQueue, this.anchorSaveQueue]);
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
    return posix.join(parseSshUri(uri).path, path).replace(/\/+$/, '') || '/';
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

  private save(): Promise<void> {
    const file = persistPath();
    const content = JSON.stringify([...this.workspaces.values()], null, 2);
    const pending = this.workspaceSaveQueue.then(() => writeFileAtomic(file, content, {
      mode: 0o600,
      dirMode: 0o700,
    }));
    this.workspaceSaveQueue = pending.catch(() => {});
    return pending;
  }

  private loadAnchors(): void {
    try {
      const list = JSON.parse(readFileSync(anchorPersistPath(), 'utf8')) as SshWorkspaceAnchor[];
      const root = resolve(anchorRootPath());
      for (const anchor of list) {
        if (!anchor || typeof anchor.anchorPath !== 'string' || typeof anchor.uri !== 'string') continue;
        const anchorPath = resolve(anchor.anchorPath);
        if (!anchorPath.startsWith(`${root}${sep}`)) continue;
        try {
          parseSshUri(anchor.uri);
        } catch {
          continue;
        }
        this.anchors.set(anchorPath, { ...anchor, anchorPath });
        mkdirSync(anchorPath, { recursive: true, mode: 0o700 });
      }
    } catch {
      /* no persisted anchors */
    }
  }

  private saveAnchors(): Promise<void> {
    const file = anchorPersistPath();
    const content = JSON.stringify([...this.anchors.values()], null, 2);
    const pending = this.anchorSaveQueue.then(() => writeFileAtomic(file, content, {
      mode: 0o600,
      dirMode: 0o700,
    }));
    this.anchorSaveQueue = pending.catch(() => {});
    return pending;
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

/**
 * Read a directory through an explicit SFTP handle so the server is consumed
 * in bounded chunks. Passing a string to ssh2.readdir() silently accumulates
 * the complete directory before invoking its callback.
 */
async function readdirBoundedP(
  sftp: import('ssh2').SFTPWrapper,
  path: string,
  maxEntries: number,
): Promise<{
  rows: Array<{ filename: string; attrs: import('ssh2').Stats }>;
  truncated: boolean;
}> {
  const handle = await new Promise<Buffer>((resolveHandle, reject) => {
    sftp.opendir(path, (error, value) => (error ? reject(error) : resolveHandle(value)));
  });
  const rows: Array<{ filename: string; attrs: import('ssh2').Stats }> = [];
  let truncated = false;
  let operationError: unknown;
  try {
    // Read one entry beyond the public bound to distinguish an exact-size
    // directory from a truncated one without ever retaining the full input.
    while (rows.length <= maxEntries) {
      let chunk: Array<{ filename: string; attrs: import('ssh2').Stats }>;
      try {
        chunk = await new Promise<Array<{ filename: string; attrs: import('ssh2').Stats }>>((resolveRows, reject) => {
          sftp.readdir(handle, (error, value) => (error ? reject(error) : resolveRows(value)));
        });
      } catch (error) {
        if ((error as { code?: unknown })?.code === 1) break; // SSH_FX_EOF
        throw error;
      }
      // A conforming server reports EOF. Guard an empty successful page too,
      // otherwise a broken server could make this loop spin forever.
      if (chunk.length === 0) break;
      const remaining = maxEntries + 1 - rows.length;
      rows.push(...chunk.slice(0, remaining));
      if (rows.length > maxEntries) {
        truncated = true;
        break;
      }
    }
  } catch (error) {
    operationError = error;
  }
  try {
    await new Promise<void>((resolveClose, reject) => {
      sftp.close(handle, (error) => (error ? reject(error) : resolveClose()));
    });
  } catch (closeError) {
    if (operationError === undefined) operationError = closeError;
  }
  if (operationError !== undefined) throw operationError;
  return { rows: rows.slice(0, maxEntries), truncated };
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
