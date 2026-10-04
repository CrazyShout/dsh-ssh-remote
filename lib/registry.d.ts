import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import { SshConnectionManager } from './connection.js';
import { RemoteHelperManager, type RemoteHelperStatus } from './helper/manager.js';
/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * fallback so an upgrade does not break already registered workspaces.
 * Declared as the plugin's Cordis `Config`; resolved values reach
 * `apply(ctx, config)` and the service constructor.
 */
export declare const LegacySshRemoteSettingsSchema: z<Schemastery.ObjectS<NoInfer<{
    hosts: z<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        identityFile?: string | null | undefined;
        proxyJump?: string | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: z<string, string, "plain">;
        host: z<string, string, "plain">;
        port: z<number, number, "defined">;
        user: z<string, string, "defined">;
        identityFile: z<string, string, "defined">;
        proxyJump: z<string, string, "defined">;
    }>>[], "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    hosts: z<({
        name?: string | null | undefined;
        host?: string | null | undefined;
        port?: number | null | undefined;
        user?: string | null | undefined;
        identityFile?: string | null | undefined;
        proxyJump?: string | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        name: z<string, string, "plain">;
        host: z<string, string, "plain">;
        port: z<number, number, "defined">;
        user: z<string, string, "defined">;
        identityFile: z<string, string, "defined">;
        proxyJump: z<string, string, "defined">;
    }>>[], "defined">;
}>>, "plain">;
export interface SshHostEntry {
    name: string;
    host: string;
    port: number;
    user: string;
    identityFile: string;
    proxyJump: string;
}
export interface LegacySshConfig {
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
    errorCode?: string;
    retryable?: boolean;
    hint?: string;
    environment?: RemoteHelperStatus['environment'];
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
/** Display identity for a persisted SSH workspace; no connection is made. */
export interface RemoteWorkspaceInfo {
    alias: string;
    remotePath: string;
    uri: string;
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
    private readonly legacyConfig;
    private readonly anchors;
    private readonly hostResolver?;
    private anchorSaveQueue;
    private readonly ownsHelpers;
    constructor(ctx: Context, helpers: RemoteHelperManager | undefined, config: LegacySshConfig);
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
    workspaceInfo(path: string): Promise<RemoteWorkspaceInfo | null>;
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