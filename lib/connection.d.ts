import { type SFTPWrapper, type ConnectConfig } from 'ssh2';
import { formatSshUri, type SshConnectionStatus, type SshUri } from './types.js';
/** A single SSH transport (host-scoped), owned by the connection manager. */
export interface SshTransport {
    readonly hostKey: string;
    readonly uri: SshUri;
    status: SshConnectionStatus;
    lastError?: string;
    /** Perform an SFTP operation against the live session. */
    sftp<T>(op: (sftp: SFTPWrapper) => Promise<T>): Promise<T>;
    /** Run a command and collect stdout/stderr. */
    exec(command: string): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    close(): void;
}
type StatusListener = (key: string, status: SshConnectionStatus, reason?: string) => void;
/** Resolve an SSH uri against ~/.ssh/config into an ssh2 ConnectConfig. */
export declare function toConnectConfig(uri: SshUri): ConnectConfig;
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user` so
 * multiple workspaces on one host share a single TCP connection, and each
 * connection auto-reconnects with exponential backoff while still wanted.
 */
export declare class SshConnectionManager {
    private readonly connections;
    private readonly listeners;
    onStatus(listener: StatusListener): () => void;
    private emit;
    private keyOf;
    /** Ensure a live transport for a uri string, connecting on demand. */
    transport(uriString: string): Promise<SshTransport>;
    /** Disconnect a transport and stop reconnecting it. */
    close(uriString: string): Promise<void>;
    /** Dispose every connection. */
    dispose(): Promise<void>;
    private allocate;
    private connect;
    private fail;
    private scheduleReconnect;
    private teardown;
    private setStatus;
    private waitConnected;
    private wrap;
}
export { formatSshUri };
//# sourceMappingURL=connection.d.ts.map