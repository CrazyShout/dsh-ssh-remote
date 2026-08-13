import { type SFTPWrapper, type ConnectConfig } from 'ssh2';
import { formatSshUri, type SshConnectionStatus, type SshUri } from './types.js';
/** A resolved host target, possibly reached through a ProxyJump. */
export interface SshHostConfig {
    host: string;
    port: number;
    username?: string;
    privateKey?: string;
    /** `user@host:port` of the jump host, or another host config name. */
    proxyJump?: string;
}
/** A single SSH transport (host-scoped), owned by the connection manager. */
export interface SshTransport {
    readonly hostKey: string;
    readonly uri: SshUri;
    status: SshConnectionStatus;
    lastError?: string;
    sftp<T>(op: (sftp: SFTPWrapper) => Promise<T>): Promise<T>;
    exec(command: string): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    close(): void;
}
type StatusListener = (key: string, status: SshConnectionStatus, reason?: string) => void;
/** Parse a `user@host:port` jump spec into its parts. */
export declare function parseJumpSpec(spec: string): SshHostConfig;
/** Resolve a host config from ~/.ssh/config by alias, or from the host itself. */
export declare function toConnectConfig(uri: SshUri, hostConfig?: SshHostConfig): {
    config: ConnectConfig;
    proxyJump?: SshHostConfig;
};
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user`, and
 * each connection auto-reconnects with exponential backoff while still wanted.
 * A connection with a `proxyJump` first opens a direct-tcpip channel through
 * the jump host and uses it as the target's socket.
 */
export declare class SshConnectionManager {
    private readonly connections;
    private readonly listeners;
    /** Optional resolver: a hostname/alias → explicit host config (from settings). */
    private readonly hostResolver?;
    constructor(hostResolver?: (host: string) => SshHostConfig | undefined);
    onStatus(listener: StatusListener): () => void;
    private emit;
    private keyOf;
    transport(uriString: string): Promise<SshTransport>;
    close(uriString: string): Promise<void>;
    dispose(): Promise<void>;
    private allocate;
    private connect;
    private finishConnect;
    private fail;
    private scheduleReconnect;
    private teardown;
    private setStatus;
    private waitConnected;
    private wrap;
}
export { formatSshUri };
//# sourceMappingURL=connection.d.ts.map