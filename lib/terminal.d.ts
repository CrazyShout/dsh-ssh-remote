import type { TerminalBackend, TerminalBackendSession, TerminalBackendSpawnSpec, TerminalReadRequest, TerminalReadResult, TerminalSendOperation, TerminalSendRequest, TerminalSessionStatus, TerminalSignal, TerminalSignalResult } from '@deepseek-ai/dsh-terminal';
import type SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy';
import type { RemotePathResolver } from './runtime-router.js';
/** Minimal RPC client surface consumed by the terminal backend. */
export interface RemoteHelperClient {
    readonly hello?: {
        platform?: {
            shell?: string;
        };
    };
    call<T>(method: string, params?: Record<string, unknown>, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        mutation?: boolean;
    }): Promise<T>;
}
/** Structural provider implemented by the helper manager. */
export interface RemoteHelperProvider {
    client(uriOrAlias: string, signal?: AbortSignal): Promise<RemoteHelperClient>;
}
interface HelperProcessStartResult {
    processId: string;
    pid: number;
    pgid: number;
    tty: boolean;
    running: boolean;
    exitCode: number | null;
    signal: string | null;
    latestSeq: string;
}
/** A helper-owned PTY process with a continuously drained bounded output tail. */
export declare class RemoteHelperTerminalBackendSession implements TerminalBackendSession {
    private readonly helpers;
    private readonly uri;
    private readonly workspaceId;
    private readonly workspaceCloseOperationId;
    private readonly processId;
    private readonly onClosed;
    readonly motd = "";
    readonly pid: number;
    private readonly scrollback;
    private readonly pumpController;
    private readonly pumpDone;
    private statusValue;
    private active;
    private afterSeq;
    private closing;
    private closePromise;
    private pumpFailure;
    private remoteExited;
    private decoder;
    private mutationSequence;
    constructor(helpers: RemoteHelperProvider, uri: string, workspaceId: string, workspaceCloseOperationId: string, processId: string, started: HelperProcessStartResult, onClosed?: () => void);
    startSend(request: TerminalSendRequest): TerminalSendOperation;
    read(request: TerminalReadRequest): TerminalReadResult;
    signal(signal: TerminalSignal): Promise<TerminalSignalResult>;
    status(): TerminalSessionStatus;
    /** Helper support exists ahead of the rc.2 terminal seam's model-facing resize verb. */
    resize(rows: number, cols: number): Promise<void>;
    close(_reason: string): Promise<void>;
    private signalForeground;
    private writeInput;
    private pumpOutput;
    private closeOnce;
    private call;
    private appendOutput;
    private waitForRemoteExit;
    private nextOperationId;
}
/** Helper-backed `ssh` backend used by default. */
export declare class RemoteTerminalBackend implements TerminalBackend {
    readonly type = "ssh";
    private readonly sessions;
    private readonly helpers;
    private readonly resolveRemotePath;
    private readonly sandboxPolicy;
    constructor(helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver, sandboxPolicy?: Pick<SandboxPolicyService, 'resolve'>);
    spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>;
    private remoteUri;
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=terminal.d.ts.map