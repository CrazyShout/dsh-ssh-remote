import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SshConnectionManager } from './connection.js';
import type { RemoteWorkspace, SshConnectionStatus } from './types.js';
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
type StatusListener = (change: {
    workspaceId: string;
    status: SshConnectionStatus;
    reason?: string;
}) => void;
/**
 * The `ctx.sshRemote` service: registers remote workspaces, owns their SSH
 * connections and status, and exposes workspace + host-config operations to
 * both the model tool and (through `@Remote` methods) the Web client.
 */
export declare class SshRemoteService extends TypertRemoteService {
    readonly connections: SshConnectionManager;
    private readonly settings;
    private readonly workspaces;
    private readonly anchors;
    private readonly listeners;
    private readonly hostResolver?;
    constructor(ctx: Context);
    private createHostResolver;
    private readKey;
    /** Discover and resolve the user's local OpenSSH aliases (Web Remote). */
    config(): Promise<SshConfig>;
    /** Browse one remote directory level for the Add Workspace flow. */
    browse(alias: string, path: string): Promise<RemoteDirectoryListing>;
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
    onStatus(listener: StatusListener): () => void;
    list(): RemoteWorkspace[];
    get(id: string): RemoteWorkspace | undefined;
    add(uri: string, title?: string): RemoteWorkspace;
    remove(id: string): boolean;
    connect(id: string): Promise<void>;
    disconnect(id: string): Promise<void>;
    exec(id: string, command: string): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    stat(id: string, path: string): Promise<{
        type: string;
        size: number;
    } | undefined>;
    listDir(id: string, path: string): Promise<Array<{
        name: string;
        type: string;
        size: number;
    }>>;
    readText(id: string, path: string): Promise<string>;
    writeText(id: string, path: string, content: string): Promise<void>;
    dispose(): Promise<void>;
    private require;
    private keyOf;
    private remotePath;
    private emit;
    private load;
    private save;
    private loadAnchors;
    private saveAnchors;
}
export {};
//# sourceMappingURL=registry.d.ts.map