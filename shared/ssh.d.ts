import type { MigrationSelection, MigrationPreview, MigrationResult } from './migration.js';
export interface DiscoveredHost {
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
  status: 'disconnected' | 'installing' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error';
  version: string;
  sessionId: string;
  capabilities: Record<string, unknown>;
  error: string;
  errorCode?: string;
  retryable?: boolean;
  hint?: string;
  environment?: { search: { available: boolean; path?: string; version?: string; error?: string } };
}

export interface HelperHostDiagnostics extends HelperHostStatus {
  alias: string;
  helperSha256: string;
  lastConnectedAt: number;
  lastHealthAt: number;
  nextRetryAt: number;
  stderr: string;
  assetPath: string;
}

export interface SshConfig {
  configPath: string;
  configExists: boolean;
  hosts: DiscoveredHost[];
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

export interface SshWorkspaceAnchor {
  anchorPath: string;
  uri: string;
  alias: string;
  remotePath: string;
  title: string;
  createdAt: number;
}

export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

export interface RemoteWorkspaceInfo { alias: string; remotePath: string; uri: string }

export interface SshRemote {
  workspaceInfo(path: string): Promise<RemoteResult<RemoteWorkspaceInfo | null>>;
  migrationPreview(selections: MigrationSelection[]): Promise<RemoteResult<MigrationPreview>>;
  migrationApply(token: string): Promise<RemoteResult<MigrationResult>>;
  migrationRollback(id: string): Promise<RemoteResult<boolean>>;
  config(): Promise<RemoteResult<SshConfig>>;
  statuses(): Promise<RemoteResult<Record<string, HelperHostStatus>>>;
  browse(alias: string, path: string): Promise<RemoteResult<RemoteDirectoryListing>>;
  createDirectory(alias: string, parent: string, name: string): Promise<RemoteResult<string>>;
  materializeWorkspace(alias: string, path: string): Promise<RemoteResult<SshWorkspaceAnchor>>;
  connectHost(alias: string): Promise<RemoteResult<HelperHostStatus>>;
  disconnectHost(alias: string): Promise<RemoteResult<HelperHostStatus>>;
  retryHost(alias: string): Promise<RemoteResult<HelperHostStatus>>;
  diagnostics(alias: string): Promise<RemoteResult<HelperHostDiagnostics>>;
}

export interface DirectoryService {
  pickDirectory(): Promise<string | null>;
  listDirectory(path?: string): Promise<RemoteDirectoryListing>;
  createDirectory(path: string, name: string): Promise<string>;
}
