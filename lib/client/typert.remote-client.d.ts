import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
interface HelperStatus {
    status: 'disconnected' | 'installing' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error';
    version: string;
    sessionId: string;
    capabilities: Record<string, unknown>;
    error: string;
}
interface HelperDiagnostics extends HelperStatus {
    alias: string;
    helperSha256: string;
    lastConnectedAt: number;
    lastHealthAt: number;
    nextRetryAt: number;
    stderr: string;
    assetPath: string;
}
interface ConfigResult {
    configPath: string;
    configExists: boolean;
    hosts: Array<{
        alias: string;
        host: string;
        port: number;
        user: string;
        identityFile: string;
        proxyJump: string;
        proxyCommand: string;
        helper: HelperStatus;
    }>;
    legacyHostCount: number;
}
interface DirectoryListing {
    path: string;
    home: string;
    crumbs: Array<{
        name: string;
        path: string;
        hidden: boolean;
    }>;
    entries: Array<{
        name: string;
        path: string;
        hidden: boolean;
    }>;
    truncated: boolean;
}
interface WorkspaceAnchor {
    anchorPath: string;
    uri: string;
    alias: string;
    remotePath: string;
    title: string;
    createdAt: number;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        sshRemote: {
            config: () => Promise<RemoteResult<ConfigResult>>;
            statuses: () => Promise<RemoteResult<Record<string, HelperStatus>>>;
            browse: (alias: string, path: string) => Promise<RemoteResult<DirectoryListing>>;
            createDirectory: (alias: string, parent: string, name: string) => Promise<RemoteResult<string>>;
            materializeWorkspace: (alias: string, path: string) => Promise<RemoteResult<WorkspaceAnchor>>;
            connectHost: (alias: string) => Promise<RemoteResult<HelperStatus>>;
            disconnectHost: (alias: string) => Promise<RemoteResult<HelperStatus>>;
            retryHost: (alias: string) => Promise<RemoteResult<HelperStatus>>;
            diagnostics: (alias: string) => Promise<RemoteResult<HelperDiagnostics>>;
        };
    }
}
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export default TYPERT_REMOTE;
//# sourceMappingURL=typert.remote-client.d.ts.map