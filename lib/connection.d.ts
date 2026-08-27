import { Client, type SFTPWrapper, type ConnectConfig, type ClientChannel } from 'ssh2';
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
    shell(opts?: {
        cols?: number;
        rows?: number;
        term?: string;
    }): Promise<ClientChannel>;
    close(): void;
}
type StatusListener = (key: string, status: SshConnectionStatus, reason?: string) => void;
export interface SshConnectionManagerOptions {
    resolveConnectConfig?: typeof toConnectConfig;
    createClient?: () => Client;
}
interface ProxySpec {
    kind: 'jump' | 'command';
    value: string;
}
/** Parse a `user@host:port` jump spec into its parts. */
export declare function parseJumpSpec(spec: string): SshHostConfig;
/** Resolve effective connection settings through the local OpenSSH client. */
export declare function toConnectConfig(uri: SshUri, hostConfig?: SshHostConfig): Promise<{
    config: ConnectConfig;
    proxy?: ProxySpec;
}>;
/** Build the system OpenSSH command used for one or more ProxyJump hops. */
export declare function buildOpenSshJumpArgs(proxyJump: string, targetHost: string, targetPort: number): string[];
/**
 * Owns the SSH transport pool. Connections are keyed by `host:port:user`, and
 * each connection auto-reconnects with exponential backoff while still wanted.
 * Effective host settings are refreshed through `ssh -G`. ProxyJump streams
 * use system OpenSSH; ProxyCommand is launched from the effective configured
 * command with the subset of tokens expanded by {@link expandProxyCommand}.
 */
export declare class SshConnectionManager {
    private readonly connections;
    private readonly listeners;
    /** Read-only fallback for legacy DSH settings that have not been migrated. */
    private readonly hostResolver?;
    private readonly resolveConnectConfig;
    private readonly createClient;
    constructor(hostResolver?: (host: string) => SshHostConfig | undefined, options?: SshConnectionManagerOptions);
    onStatus(listener: StatusListener): () => void;
    private emit;
    private keyOf;
    transport(uriString: string): Promise<SshTransport>;
    close(uriString: string): Promise<void>;
    dispose(): Promise<void>;
    private allocate;
    private connect;
    private open;
    private finishConnect;
    private fail;
    private scheduleReconnect;
    private teardown;
    private setStatus;
    private waitConnected;
    private wrap;
    private isCurrent;
}
export { formatSshUri };
//# sourceMappingURL=connection.d.ts.map