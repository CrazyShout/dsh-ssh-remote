import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import type { SettingsNamespace, SettingsScope } from '@deepseek-ai/dsh-settings';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, join, posix, relative, resolve, sep } from 'node:path';
import { SshConnectionManager, type SshHostConfig } from './connection.js';
import {
  RemoteHelperManager,
  type RemoteHelperDiagnostics,
  type RemoteHelperStatus,
} from './helper/manager.js';
import type { RemoteHelperClient } from './helper/rpc-client.js';
import {
  collectSshAliases,
  discoverSshHosts,
  expandHome,
  hasConcreteSshAlias,
  userSshConfigPath,
} from './ssh-config.js';
import { formatSshUri, parseSshUri } from './types.js';

// Newer DSH validates namespace literals in register(); the old runtime
// settingsNamespace() export was removed. This fixed identifier is valid on
// both APIs; retain the brand only for the rc.2 registration signature.
const SETTINGS_NS = 'ssh-remote' as SettingsNamespace;
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
  helper: HelperHostStatus;
}

export interface HelperHostStatus {
  status: RemoteHelperStatus['state'];
  version: string;
  sessionId: string;
  capabilities: Record<string, unknown>;
  error: string;
}

export type HelperHostStatuses = Record<string, HelperHostStatus>;

export interface HelperHostDiagnostics extends HelperHostStatus {
  alias: string;
  helperSha256: string;
  lastConnectedAt: number;
  lastHealthAt: number;
  nextRetryAt: number;
  stderr: string;
  assetPath: string;
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

interface HelperWorkspaceOpen {
  workspaceId: string;
  path: string;
  access: 'read-only' | 'workspace-write' | 'danger-full-access';
}

interface HelperDirectoryList {
  entries: Array<{
    name: string;
    metadata: { type: 'file' | 'directory' | 'symlink' | 'other' };
  }>;
  truncated?: boolean;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SSH remote workspaces service (this plugin). */
    sshRemote: SshRemoteService;
  }
}

function anchorPersistPath(): string {
  return dshHomePath('ssh-workspace-anchors.json');
}

function anchorRootPath(): string {
  return dshHomePath('ssh-workspace-anchors');
}

/**
 * Host-facing Web facade and durable anchor registry. Helper lifecycle is
 * delegated to RemoteHelperManager; ssh2 remains only for legacy hosts.
 */
export class SshRemoteService extends TypertRemoteService {
  readonly connections: SshConnectionManager;
  readonly helpers: RemoteHelperManager;
  private readonly settings: SettingsScope<LegacySshConfig>;
  private readonly anchors = new Map<string, SshWorkspaceAnchor>();
  private readonly hostResolver?: (host: string) => SshHostConfig | undefined;
  private anchorSaveQueue: Promise<void> = Promise.resolve();
  private readonly ownsHelpers: boolean;

  constructor(ctx: Context, helpers?: RemoteHelperManager) {
    super(ctx, 'sshRemote');
    this.settings = ctx.settings.register(SETTINGS_NS, LegacySshRemoteSettingsSchema);
    this.hostResolver = this.createHostResolver();
    this.connections = new SshConnectionManager(this.hostResolver);
    this.helpers = helpers ?? new RemoteHelperManager();
    this.ownsHelpers = helpers === undefined;
    this.loadAnchors();
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
      hosts: hosts.map((host) => {
        const status = this.helpers.status(host.host);
        return {
          alias: host.host,
          host: host.hostName ?? host.host,
          port: host.port ?? 22,
          user: host.user ?? '',
          identityFile: host.identityFile ?? '',
          proxyJump: host.proxyJump ?? '',
          proxyCommand: host.proxyCommand ?? '',
          helper: helperStatusView(status),
        };
      }),
      legacyHostCount: this.settings.get().hosts.length,
    };
  }

  /** Cheap live status snapshot; unlike config(), this does not run ssh -G. */
  @Remote('statuses')
  async statuses(): Promise<HelperHostStatuses> {
    return Object.fromEntries(
      collectSshAliases().map(alias => [alias, helperStatusView(this.helpers.status(alias))]),
    );
  }

  /** Browse one remote directory level for the Add Workspace flow. */
  @Remote('browse')
  async browse(alias: string, path: string): Promise<RemoteDirectoryListing> {
    if (hasConcreteSshAlias(alias)) return this.browseWithHelper(alias, path);
    return this.browseWithLegacySftp(alias, path);
  }

  private async browseWithHelper(alias: string, path: string): Promise<RemoteDirectoryListing> {
    const client = await this.helpers.client(alias);
    const home = await helperHome(client);
    const requested = normalizeRemotePath(path || home);
    const workspaceId = randomUUID();
    const workspace = await client.call<HelperWorkspaceOpen>('workspace/open', {
      path: requested,
      access: 'read-only',
      workspaceId,
      operationId: workspaceId,
    }, { timeoutMs: 20_000, mutation: true });
    try {
      const result = await client.call<HelperDirectoryList>('fs/list', {
        workspaceId: workspace.workspaceId,
        path: '',
        limit: DIRECTORY_PAGE_LIMIT,
        allowTruncated: true,
        types: ['directory'],
      }, { timeoutMs: 30_000 });
      const directories = result.entries
        .filter((entry) => entry.metadata.type === 'directory')
        .sort((left, right) => left.name.localeCompare(right.name));
      const truncated = result.truncated === true || directories.length > DIRECTORY_PAGE_LIMIT;
      return {
        path: normalizeRemotePath(workspace.path),
        home,
        crumbs: remoteCrumbs(workspace.path),
        entries: directories.slice(0, DIRECTORY_PAGE_LIMIT).map((entry) => ({
          name: entry.name,
          path: posix.join(workspace.path, entry.name),
          hidden: entry.name.startsWith('.'),
        })),
        truncated,
      };
    } finally {
      await client.call('workspace/close', {
        workspaceId: workspace.workspaceId,
        operationId: `close:${workspace.workspaceId}`,
      }, {
        timeoutMs: 5_000,
        mutation: true,
      }).catch(() => {});
    }
  }

  private async browseWithLegacySftp(alias: string, path: string): Promise<RemoteDirectoryListing> {
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
    if (hasConcreteSshAlias(alias)) {
      const client = await this.helpers.client(alias);
      const workspaceId = randomUUID();
      const workspace = await client.call<HelperWorkspaceOpen>('workspace/open', {
        path: normalizeRemotePath(parent),
        access: 'workspace-write',
        workspaceId,
        operationId: workspaceId,
      }, { timeoutMs: 20_000, mutation: true });
      try {
        await client.call('fs/mkdir', {
          workspaceId: workspace.workspaceId,
          path: clean,
          recursive: false,
          mode: 0o755,
          operationId: randomUUID(),
        }, { timeoutMs: 30_000, mutation: true });
        return posix.join(workspace.path, clean);
      } finally {
        await client.call('workspace/close', {
          workspaceId: workspace.workspaceId,
          operationId: `close:${workspace.workspaceId}`,
        }, {
          timeoutMs: 5_000,
          mutation: true,
        }).catch(() => {});
      }
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
    if (hasConcreteSshAlias(parsed.host)) {
      const client = await this.helpers.client(uri);
      const workspaceId = randomUUID();
      const workspace = await client.call<HelperWorkspaceOpen>('workspace/open', {
        path: normalizeRemotePath(parsed.path),
        access: 'read-only',
        workspaceId,
        operationId: workspaceId,
      }, { timeoutMs: 20_000, mutation: true });
      await client.call('workspace/close', {
        workspaceId: workspace.workspaceId,
        operationId: `close:${workspace.workspaceId}`,
      }, {
        timeoutMs: 5_000,
        mutation: true,
      }).catch(() => {});
      return;
    }
    const transport = await this.connections.transport(uri);
    const status = await transport.sftp((sftp) => statP(sftp, parsed.path));
    if (!status?.isDirectory()) throw new Error(`remote path is not a directory: ${parsed.path}`);
  }

  @Remote('connectHost')
  async connectHost(alias: string): Promise<HelperHostStatus> {
    this.assertHelperAlias(alias);
    await this.helpers.client(alias);
    return helperStatusView(this.helpers.status(alias));
  }

  @Remote('disconnectHost')
  async disconnectHost(alias: string): Promise<HelperHostStatus> {
    this.assertHelperAlias(alias);
    await this.helpers.close(alias);
    return helperStatusView(this.helpers.status(alias));
  }

  @Remote('retryHost')
  async retryHost(alias: string): Promise<HelperHostStatus> {
    this.assertHelperAlias(alias);
    await this.helpers.retry(alias);
    return helperStatusView(this.helpers.status(alias));
  }

  @Remote('diagnostics')
  async diagnostics(alias: string): Promise<HelperHostDiagnostics> {
    this.assertHelperAlias(alias);
    return helperDiagnosticsView(this.helpers.diagnostics(alias));
  }

  async dispose(): Promise<void> {
    await this.connections.dispose();
    if (this.ownsHelpers) await this.helpers.dispose();
    await Promise.allSettled([this.anchorSaveQueue]);
    this.anchors.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private assertHelperAlias(alias: string): void {
    if (!hasConcreteSshAlias(alias)) {
      throw new Error(
        `SSH helper requires a concrete Host alias in ${userSshConfigPath()}; legacy settings remain fallback-only`,
      );
    }
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

async function helperHome(client: RemoteHelperClient): Promise<string> {
  const fromHello = (client.hello.platform as unknown as { home?: unknown }).home;
  if (typeof fromHello === 'string' && fromHello.startsWith('/')) {
    return normalizeRemotePath(fromHello);
  }
  const health = await client.call<{ home?: unknown }>('health/status', {}, { timeoutMs: 5_000 });
  if (typeof health.home !== 'string' || !health.home.startsWith('/')) {
    throw new Error('remote helper did not report an absolute home directory');
  }
  return normalizeRemotePath(health.home);
}

function helperStatusView(status: RemoteHelperStatus): HelperHostStatus {
  return {
    status: status.state,
    version: status.helperVersion ?? '',
    sessionId: status.sessionId ?? '',
    capabilities: status.capabilities === undefined ? {} : { ...status.capabilities },
    error: status.lastError ?? '',
  };
}

function helperDiagnosticsView(diagnostics: RemoteHelperDiagnostics): HelperHostDiagnostics {
  return {
    alias: diagnostics.alias,
    ...helperStatusView(diagnostics),
    helperSha256: diagnostics.helperSha256 ?? '',
    lastConnectedAt: diagnostics.lastConnectedAt ?? 0,
    lastHealthAt: diagnostics.lastHealthAt ?? 0,
    nextRetryAt: diagnostics.nextRetryAt ?? 0,
    stderr: diagnostics.stderr,
    assetPath: diagnostics.assetPath,
  };
}
