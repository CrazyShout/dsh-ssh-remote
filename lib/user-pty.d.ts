import { PassThrough } from 'node:stream';
import type { SubprocessOutcome, SubprocessTerminalActivity, SubprocessTerminalForeground, SubprocessTerminalHandle, SubprocessTerminalSignal, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemoteHelperClient } from './helper/rpc-client.js';
interface ProcessStatus {
    pid: number;
    processId: string;
    running: boolean;
    exitCode: number | null;
    signal: string | number | null;
}
interface Allocation {
    uri: string;
    workspaceId: string;
    processId: string;
    sessionId: string;
    client: RemoteHelperClient;
}
/** The router retains this retryable owner when unpublished cleanup fails. */
export declare class RemoteUserTerminalAllocationError extends AggregateError {
    readonly retryCleanup: () => Promise<void>;
    constructor(spawnError: unknown, cleanupError: unknown, retryCleanup: () => Promise<void>);
}
/** Human terminals deliberately use the SSH user's permissions, like DSH's local user terminal. */
export declare function openRemoteUserTerminal(uri: string, spec: SubprocessTerminalSpawnSpec, helpers: RemoteHelperProvider, onClosed?: (terminal: RemoteUserTerminal) => void): Promise<RemoteUserTerminal>;
/**
 * Raw helper PTY handle consumed by the OFFICIAL human TerminalController.
 * That controller owns session authorization, exclusive input attachments,
 * xterm screen recovery, UI retention, and input limits; this owns remote I/O.
 */
export declare class RemoteUserTerminal implements SubprocessTerminalHandle {
    private readonly helpers;
    private readonly allocation;
    private readonly graceMs;
    private readonly onClosed;
    readonly output: PassThrough;
    readonly done: Promise<SubprocessOutcome>;
    readonly pid: number;
    private readonly pumpLifetime;
    private readonly operationLifetime;
    private readonly statusLifetime;
    private readonly recoveryLifetime;
    private readonly operations;
    private readonly pump;
    private readonly outcomeWatch;
    private inputTail;
    private resizeTail;
    private inputSeq;
    private resizeSeq;
    private inputFailure;
    private resizeFailure;
    private queuedInputBytes;
    private queuedWrites;
    private queuedResizes;
    private cursor;
    private revision;
    private closing;
    private quiescent;
    private outcomeSettled;
    private cleanup;
    private resolveOutcome;
    private rejectOutcome;
    constructor(helpers: RemoteHelperProvider, allocation: Allocation, started: ProcessStatus, graceMs: number, onClosed: (terminal: RemoteUserTerminal) => void);
    write(data: string): Promise<void>;
    resize(cols: number, rows: number): Promise<void>;
    inspectForeground(): Promise<SubprocessTerminalForeground | undefined>;
    inspectActivity(): Promise<SubprocessTerminalActivity>;
    signalForeground(signal: SubprocessTerminalSignal): Promise<number>;
    terminate(): Promise<void>;
    private cleanupOnce;
    private pumpOutput;
    /** Exit facts must remain observable even while a slow consumer applies backpressure. */
    private watchOutcome;
    private client;
    private call;
    private track;
    private assertOpen;
    private observeOutcome;
    private failOutcome;
}
export {};
//# sourceMappingURL=user-pty.d.ts.map