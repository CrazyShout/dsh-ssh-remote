import type { Readable, Writable } from 'node:stream';
import { type DshRpcErrorBody, type HelperCapabilities, type HelperLimits, type HelperNotificationListener, type HelperSession, type InitializeParams, type ServerHello } from './protocol.js';
export interface RemoteHelperCallOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** A disconnect/timeout after bytes are written makes the outcome ambiguous. */
    mutation?: boolean;
}
export interface RemoteHelperClientOptions {
    readable: Readable;
    writable: Writable;
    closeTransport?: () => void;
    helloTimeoutMs?: number;
}
export interface RemoteHelperClient {
    readonly hello: ServerHello;
    readonly capabilities: HelperCapabilities;
    readonly limits: HelperLimits;
    readonly sessionId: string;
    readonly session: HelperSession;
    readonly closed: Promise<void>;
    readonly closeReason: Error | undefined;
    call<T>(method: string, params?: Record<string, unknown>, options?: RemoteHelperCallOptions): Promise<T>;
    notify(method: string, params?: Record<string, unknown>): Promise<void>;
    notification(method: string, params?: Record<string, unknown>): Promise<void>;
    onNotification(listener: HelperNotificationListener): () => void;
    onClose(listener: (reason: Error) => void): () => void;
    close(reason?: string): void;
}
export type RemoteHelperInterruptionKind = 'disconnect' | 'timeout' | 'abort' | 'send';
export declare class RemoteHelperRpcError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly data: unknown;
    constructor(error: DshRpcErrorBody);
}
export declare class RemoteHelperCallInterruptedError extends Error {
    readonly mutationMayHaveStarted: boolean;
    readonly kind: RemoteHelperInterruptionKind;
    constructor(message: string, mutationMayHaveStarted: boolean, kind: RemoteHelperInterruptionKind, options?: ErrorOptions);
}
/** One initialized multiplexed client over the helper's JSON-line stdio. */
export declare class RemoteHelperRpcClient implements RemoteHelperClient {
    private readonly options;
    hello: ServerHello;
    capabilities: HelperCapabilities;
    limits: HelperLimits;
    sessionId: string;
    session: HelperSession;
    readonly closed: Promise<void>;
    private readonly decoder;
    private readonly pending;
    private readonly retiredIds;
    private readonly notificationListeners;
    private readonly closeListeners;
    private readonly helloWaiters;
    private nextId;
    private initialized;
    private closing;
    private closeReasonValue;
    private writeChain;
    private resolveClosed;
    constructor(options: RemoteHelperClientOptions);
    get closeReason(): Error | undefined;
    initialize(params: InitializeParams, options?: RemoteHelperCallOptions): Promise<void>;
    call<T>(method: string, params?: Record<string, unknown>, options?: RemoteHelperCallOptions): Promise<T>;
    /** Send one fire-and-forget protocol notification. */
    notify(method: string, params?: Record<string, unknown>): Promise<void>;
    /** Alias retained for callers that name the wire shape directly. */
    notification(method: string, params?: Record<string, unknown>): Promise<void>;
    onNotification(listener: HelperNotificationListener): () => void;
    onClose(listener: (reason: Error) => void): () => void;
    close(reason?: string): void;
    /** Manager hook for a child-process close that may precede stream EOF. */
    transportClosed(reason: unknown): void;
    private callInternal;
    private waitForHello;
    private enqueue;
    private readonly onData;
    private readonly onEnd;
    private readonly onReadableClose;
    private readonly onTransportError;
    private accept;
    private retire;
    private failAll;
    private detach;
}
//# sourceMappingURL=rpc-client.d.ts.map