import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SshConnectionManager } from './connection.js';
import { RemoteHelperManager, type RemoteHelperStatus } from './helper/manager.js';
export interface SshHostEntry {
    name: string;
    host: string;
    port: number;
    user: string;
    identityFile: string;
    proxyJump: string;
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
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** SSH remote workspaces service (this plugin). */
        sshRemote: SshRemoteService;
    }
}
/**
 * Host-facing Web facade and durable anchor registry. Helper lifecycle is
 * delegated to RemoteHelperManager; ssh2 remains only for legacy hosts.
 */
export declare class SshRemoteService extends TypertRemoteService {
    readonly connections: SshConnectionManager;
    readonly helpers: RemoteHelperManager;
    private readonly settings;
    private readonly anchors;
    private readonly hostResolver?;
    private anchorSaveQueue;
    private readonly ownsHelpers;
    constructor(ctx: Context, helpers?: RemoteHelperManager);
    private createHostResolver;
    private readKey;
    /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
    config(): Promise<SshConfig>;
    /** Cheap live status snapshot; unlike config(), this does not run ssh -G. */
    statuses(): Promise<HelperHostStatuses>;
    /** Browse one remote directory level for the Add Workspace flow. */
    browse(alias: string, path: string): Promise<RemoteDirectoryListing>;
    private browseWithHelper;
    private browseWithLegacySftp;
    /** Create one remote child directory from the remote directory picker. */
    createDirectory(alias: string, parent: string, name: string): Promise<string>;
    /**
     * Verify a remote directory and materialize the local anchor handed to the
     * stock DSH Workspace API. Repeated calls for one URI reuse one anchor.
     */
    materializeWorkspace(alias: string, remotePath: string): Promise<SshWorkspaceAnchor>;
    /** Exact anchor/descendant resolver consumed by fs and subprocess routers. */
    resolveRemotePath(localPath: string): string | undefined;
    ensureDirectory(uri: string): Promise<void>;
    connectHost(alias: string): Promise<HelperHostStatus>;
    disconnectHost(alias: string): Promise<HelperHostStatus>;
    retryHost(alias: string): Promise<HelperHostStatus>;
    diagnostics(alias: string): Promise<HelperHostDiagnostics>;
    dispose(): Promise<void>;
    private assertHelperAlias;
    private loadAnchors;
    private saveAnchors;
}
//# sourceMappingURL=registry.d.ts.map