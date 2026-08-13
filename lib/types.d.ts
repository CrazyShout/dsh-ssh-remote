/** Shared vocabulary for the SSH remote workspaces plugin. */
/** A remote workspace connection status. */
export type SshConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
/** A parsed `ssh://user@host:port/path` URI. */
export interface SshUri {
    host: string;
    port: number;
    user: string;
    path: string;
}
/** Parse an `ssh://` URI. Throws on a malformed URI. */
export declare function parseSshUri(uri: string): SshUri;
/** Serialize an {@link SshUri} back to an `ssh://` string. */
export declare function formatSshUri(u: SshUri): string;
/** A registered remote workspace, persisted and served to the client. */
export interface RemoteWorkspace {
    id: string;
    uri: string;
    title: string;
    status: SshConnectionStatus;
    lastError?: string;
    createdAt: number;
}
/** A status change payload broadcast to the client. */
export interface SshStatusChange {
    workspaceId: string;
    status: SshConnectionStatus;
    reason?: string;
}
//# sourceMappingURL=types.d.ts.map