import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { AnchorRegistry, type SshWorkspaceAnchor } from './anchors.js';
export type { SshWorkspaceAnchor } from './anchors.js';
import { SshMigration } from './migration.js';
import type { HelperHostStatus, HelperHostDiagnostics, SshConfig, RemoteDirectoryEntry, RemoteDirectoryListing, RemoteWorkspaceInfo } from '../shared/ssh.js';
import type { LegacyHost as SshHostEntry } from '../shared/migration.js';
export type { LegacyHost as SshHostEntry } from '../shared/migration.js';
export type { DiscoveredHost as DiscoveredSshHost, HelperHostStatus, HelperHostDiagnostics, SshConfig, RemoteDirectoryEntry, RemoteDirectoryListing, RemoteWorkspaceInfo } from '../shared/ssh.js';
import type { MigrationSelection } from '../shared/migration.js';
import {
  RemoteHelperManager,
  type RemoteHelperDiagnostics,
  type RemoteHelperStatus,
} from './helper/manager.js';
import type { RemoteHelperClient } from './helper/rpc-client.js';
import {
  collectSshAliases,
  discoverSshHosts,
  hasConcreteSshAlias,
  userSshConfigPath,
} from './ssh-config.js';
import { formatSshUri, parseSshUri } from './types.js';

const DIRECTORY_PAGE_LIMIT = 1000;

/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * import source for the explicit OpenSSH migration wizard.
 * Declared as the plugin's Cordis `Config`; resolved values reach
 * `apply(ctx, config)` and the service constructor.
 */
export const LegacySshRemoteSettingsSchema = z.object({
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

export interface LegacySshConfig { hosts: SshHostEntry[] }
export type HelperHostStatuses = Record<string, HelperHostStatus>;

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
 * delegated to RemoteHelperManager. Legacy config is import-only.
 */
export class SshRemoteService extends TypertRemoteService {
  readonly helpers: RemoteHelperManager;
  private readonly legacyConfig: LegacySshConfig;
  private readonly anchors: AnchorRegistry;
  private readonly migration: SshMigration;
  private readonly ownsHelpers: boolean;

  constructor(ctx: Context, helpers: RemoteHelperManager | undefined, config: LegacySshConfig) {
    super(ctx, 'sshRemote');
    this.legacyConfig = config;
    this.helpers = helpers ?? new RemoteHelperManager();
    this.ownsHelpers = helpers === undefined;
    this.anchors = new AnchorRegistry(anchorPersistPath(), anchorRootPath());
    this.migration = new SshMigration(userSshConfigPath(), dshHomePath('ssh-migrations'), config.hosts,
      async alias => { await this.helpers.client(alias); }, aliases => this.anchors.migrateAliases(aliases));
  }

  @Remote('migrationPreview')
  async migrationPreview(selections: MigrationSelection[]) { return this.migration.preview(selections); }

  @Remote('migrationApply')
  async migrationApply(token: string) { return this.migration.apply(token); }

  @Remote('migrationRollback')
  async migrationRollback(id: string) { await this.migration.rollback(id); return true; }

  /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
  @Remote('config')
  async config(): Promise<SshConfig> {
    const configPath = userSshConfigPath();
    const hosts = await discoverSshHosts(configPath);
    // Configuration discovery must not wait for remote health checks. Connect,
    // diagnostics and the visible degraded-host observer own those probes.
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
      legacyHostCount: this.legacyConfig.hosts.length,
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
    this.assertHelperAlias(alias);
    return this.browseWithHelper(alias, path);
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

  /** Create one remote child directory from the remote directory picker. */
  @Remote('createDirectory')
  async createDirectory(alias: string, parent: string, name: string): Promise<string> {
    const clean = name.trim();
    if (!clean || clean === '.' || clean === '..' || clean.includes('/')) {
      throw new Error('folder name must be one non-empty path segment');
    }
    this.assertHelperAlias(alias);
    {
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
    return this.anchors.materialize(uri);
  }

  /** Exact anchor/descendant resolver consumed by fs and subprocess routers. */
  resolveRemotePath(localPath: string): string | undefined {
    return this.anchors.resolve(localPath);
  }

  @Remote('workspaceInfo')
  async workspaceInfo(path: string): Promise<RemoteWorkspaceInfo | null> {
    if (!path || path.includes('\0') || path.length > 32_768) return null;
    const uri = this.resolveRemotePath(path);
    if (uri === undefined) return null;
    const parsed = parseSshUri(uri);
    return { alias: parsed.host, remotePath: parsed.path, uri };
  }

  async ensureDirectory(uri: string): Promise<void> {
    const parsed = parseSshUri(uri);
    this.assertHelperAlias(parsed.host);
    {
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
    await this.helpers.refreshEnvironment(alias).catch(() => {});
    return helperDiagnosticsView(this.helpers.diagnostics(alias));
  }

  /**
   * Re-probe the login-shell environment of a live helper.
   *
   * The capability verdict is captured once when the helper connects, so a tool
   * installed later (for example ripgrep) leaves a stale `degraded` status on
   * every surface that reads it. Unlike config() this needs no ssh -G pass and
   * cannot disturb running work; a caller that renders a status surface can
   * therefore revalidate lazily instead of asking the user to reconnect.
   */
  @Remote('refreshEnvironment')
  async refreshEnvironment(alias: string): Promise<HelperHostStatus> {
    this.assertHelperAlias(alias);
    await this.helpers.refreshEnvironment(alias);
    return helperStatusView(this.helpers.status(alias));
  }

  async dispose(): Promise<void> {
    if (this.ownsHelpers) await this.helpers.dispose();
    await this.anchors.dispose();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private assertHelperAlias(alias: string): void {
    if (!hasConcreteSshAlias(alias)) {
      throw new Error(
        `SSH helper requires a concrete Host alias in ${userSshConfigPath()}; open Remote settings → Migrate legacy hosts before using this workspace`,
      );
    }
  }

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
    ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    ...(status.retryable === undefined ? {} : { retryable: status.retryable }),
    ...(status.hint === undefined ? {} : { hint: status.hint }),
    ...(status.environment === undefined ? {} : { environment: status.environment }),
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
