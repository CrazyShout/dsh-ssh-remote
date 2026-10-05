import { type RemoteHelperInstallerOptions } from './installer.js';
import { type RemoteHelperClient } from './rpc-client.js';
import type { HelperCapabilities, HelperLimits, ServerHello } from './protocol.js';
export interface RemoteEnvironment {
    search: {
        available: boolean;
        path?: string;
        version?: string;
        error?: string;
    };
}
export type RemoteHelperConnectionState = 'disconnected' | 'installing' | 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'error';
export interface RemoteHelperStatus {
    alias: string;
    state: RemoteHelperConnectionState;
    attempt: number;
    helperSha256?: string;
    helperVersion?: string;
    sessionId?: string;
    capabilities?: HelperCapabilities;
    limits?: HelperLimits;
    lastError?: string;
    lastConnectedAt?: number;
    lastHealthAt?: number;
    nextRetryAt?: number;
    errorCode?: string;
    retryable?: boolean;
    hint?: string;
    environment?: RemoteEnvironment;
}
export interface RemoteHelperDiagnostics extends RemoteHelperStatus {
    assetPath: string;
    stderr: string;
    hello?: ServerHello;
}
export type RemoteHelperStatusListener = (status: RemoteHelperStatus) => void;
export interface RemoteHelperManagerOptions extends RemoteHelperInstallerOptions {
    aliasValidator?: (alias: string) => boolean;
    reconnectBaseMs?: number;
    reconnectMaxMs?: number;
    healthIntervalMs?: number;
    healthTimeoutMs?: number;
    initializeTimeoutMs?: number;
    clientName?: string;
    clientVersion?: string;
    retentionMs?: number;
    random?: () => number;
    now?: () => number;
}
/** Host-scoped, single-flight controller for managed helper SSH sessions. */
export declare class RemoteHelperManager {
    private readonly installer;
    private readonly entries;
    private readonly listeners;
    private readonly spawnProcess;
    private readonly sshBinary;
    private readonly capabilities?;
    private readonly reconnectBaseMs;
    private readonly reconnectMaxMs;
    private readonly healthIntervalMs;
    private readonly healthTimeoutMs;
    private readonly initializeTimeoutMs;
    private readonly clientName;
    private readonly clientVersion;
    private readonly retentionMs;
    private readonly aliasValidator;
    private readonly random;
    private readonly now;
    private disposed;
    constructor(options?: RemoteHelperManagerOptions);
    /** Get or establish the one helper client owned by the original SSH alias. */
    client(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient>;
    private rawClient;
    status(uriOrAlias: string): RemoteHelperStatus;
    diagnostics(uriOrAlias: string): RemoteHelperDiagnostics;
    onStatus(listener: RemoteHelperStatusListener): () => void;
    onStatusChange(listener: RemoteHelperStatusListener): () => void;
    /** Force one fresh install/connection attempt, preserving the resume token. */
    retry(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient>;
    close(uriOrAlias: string): Promise<void>;
    dispose(): Promise<void>;
    private connect;
    /** Explicit refresh rechecks dependencies without interrupting a live task. */
    refreshEnvironment(uriOrAlias: string): Promise<void>;
    private checkEnvironment;
    private connectedState;
    private onClientClosed;
    private resumeAfterDisconnect;
    /** Acquisition retries do not replay an RPC or create a new process. */
    private acquireSession;
    private scheduleReconnect;
    private scheduleHealth;
    private retireTransport;
    private closeRemoteSessionBestEffort;
    private entry;
    private setState;
    private emit;
    private snapshot;
    private assertCurrent;
    private isCurrent;
    private clearRetry;
    private clearHealth;
    private assertActive;
    private assertAliasConfigured;
}
//# sourceMappingURL=manager.d.ts.map