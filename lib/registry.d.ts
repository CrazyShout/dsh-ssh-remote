import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import { type SshWorkspaceAnchor } from './anchors.js';
export type { SshWorkspaceAnchor } from './anchors.js';
import type { HelperHostStatus, HelperHostDiagnostics, SshConfig, RemoteDirectoryListing, RemoteWorkspaceInfo } from '../shared/ssh.js';
import type { LegacyHost as SshHostEntry } from '../shared/migration.js';
export type { LegacyHost as SshHostEntry } from '../shared/migration.js';
export type { DiscoveredHost as DiscoveredSshHost, HelperHostStatus, HelperHostDiagnostics, SshConfig, RemoteDirectoryEntry, RemoteDirectoryListing, RemoteWorkspaceInfo } from '../shared/ssh.js';
import type { MigrationSelection } from '../shared/migration.js';
import { RemoteHelperManager } from './helper/manager.js';
/**
 * Pre-Codex-style settings schema. Existing entries remain a read-only
 * import source for the explicit OpenSSH migration wizard.
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
export interface LegacySshConfig {
    hosts: SshHostEntry[];
}
export type HelperHostStatuses = Record<string, HelperHostStatus>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** SSH remote workspaces service (this plugin). */
        sshRemote: SshRemoteService;
    }
}
/**
 * Host-facing Web facade and durable anchor registry. Helper lifecycle is
 * delegated to RemoteHelperManager. Legacy config is import-only.
 */
export declare class SshRemoteService extends TypertRemoteService {
    readonly helpers: RemoteHelperManager;
    private readonly legacyConfig;
    private readonly anchors;
    private readonly migration;
    private readonly ownsHelpers;
    constructor(ctx: Context, helpers: RemoteHelperManager | undefined, config: LegacySshConfig);
    migrationPreview(selections: MigrationSelection[]): Promise<import("../shared/migration.js").MigrationPreview>;
    migrationApply(token: string): Promise<import("../shared/migration.js").MigrationResult>;
    migrationRollback(id: string): Promise<boolean>;
    /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
    config(): Promise<SshConfig>;
    /** Cheap live status snapshot; unlike config(), this does not run ssh -G. */
    statuses(): Promise<HelperHostStatuses>;
    /** Browse one remote directory level for the Add Workspace flow. */
    browse(alias: string, path: string): Promise<RemoteDirectoryListing>;
    private browseWithHelper;
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
    /**
     * Re-probe the login-shell environment of a live helper.
     *
     * The capability verdict is captured once when the helper connects, so a tool
     * installed later (for example ripgrep) leaves a stale `degraded` status on
     * every surface that reads it. Unlike config() this needs no ssh -G pass and
     * cannot disturb running work; a caller that renders a status surface can
     * therefore revalidate lazily instead of asking the user to reconnect.
     */
    refreshEnvironment(alias: string): Promise<HelperHostStatus>;
    dispose(): Promise<void>;
    private assertHelperAlias;
}
//# sourceMappingURL=registry.d.ts.map