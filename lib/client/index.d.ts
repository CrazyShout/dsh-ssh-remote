import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client';
export declare const name = "dsh-ssh-remote-client";
export declare const inject: string[];
interface DiscoveredHost {
    alias: string;
    host: string;
    port: number;
    user: string;
    identityFile: string;
    proxyJump: string;
    proxyCommand: string;
    helper: HelperHostStatus;
}
interface HelperHostStatus {
    status: 'disconnected' | 'installing' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error';
    version: string;
    sessionId: string;
    capabilities: Record<string, unknown>;
    error: string;
    errorCode?: string;
    retryable?: boolean;
    hint?: string;
    environment?: {
        search: {
            available: boolean;
            path?: string;
            version?: string;
            error?: string;
        };
    };
}
interface HelperHostDiagnostics extends HelperHostStatus {
    alias: string;
    helperSha256: string;
    lastConnectedAt: number;
    lastHealthAt: number;
    nextRetryAt: number;
    stderr: string;
    assetPath: string;
}
interface SshConfig {
    configPath: string;
    configExists: boolean;
    hosts: DiscoveredHost[];
    legacyHostCount: number;
}
interface RemoteDirectoryEntry {
    name: string;
    path: string;
    hidden: boolean;
}
interface RemoteDirectoryListing {
    path: string;
    home: string;
    crumbs: RemoteDirectoryEntry[];
    entries: RemoteDirectoryEntry[];
    truncated: boolean;
}
interface SshWorkspaceAnchor {
    anchorPath: string;
    uri: string;
    alias: string;
    remotePath: string;
    title: string;
    createdAt: number;
}
type RemoteResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        message: string;
    };
};
interface SshRemote {
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
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
type SshDirectoryFlowProps = DirectoryFlowOwnerProps & {
    ssh: SshRemote;
    pickLocal: () => Promise<string | null>;
    /** One local directory level via the composed picker's browse capability. */
    listLocal: (path?: string) => Promise<RemoteDirectoryListing>;
    /** Create one child directory under an existing local parent. */
    createLocalDirectory: (path: string, name: string) => Promise<string>;
    createWorkspace: (input: {
        path: string;
    }) => Promise<WorkspaceView>;
    renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<WorkspaceView>;
};
export declare function SshDirectoryFlow({ open, busy, onPicked, onCancel, onError, ssh, pickLocal, listLocal, createLocalDirectory, createWorkspace, renameWorkspace, }: SshDirectoryFlowProps): import("react").JSX.Element;
export declare function SshRemotePanel({ ssh }: {
    ssh: SshRemote;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=index.d.ts.map