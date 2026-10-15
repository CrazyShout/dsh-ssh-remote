import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { TransferPage, TransferRemote, TransferSummary } from './transfer-types.js';
import { type LocalDirectory, type LocalFile } from './transfer-local.js';
interface State {
    jobs: TransferSummary[];
    page?: TransferPage;
    selected: LocalFile[];
    error: string;
    listError: string;
    notice: string;
    busy: boolean;
    active?: string;
    progress?: {
        path: string;
        bytes: number;
        size: number;
        phase: string;
    };
}
export declare function transferResult<T>(promise: Promise<RemoteResult<T>>): Promise<T>;
/** One model per Session survives pane close. Reload deliberately loses local file permissions. */
export declare class TransferModel {
    readonly sessionId: string;
    private readonly remote;
    private readonly fetcher;
    private state;
    private readonly listeners;
    private executor?;
    private disposed;
    private revision;
    private readonly folders;
    private readonly beforeUnload;
    constructor(sessionId: string, remote: TransferRemote, fetcher?: typeof fetch);
    snapshot: () => State;
    subscribe: (listener: () => void) => () => void;
    private update;
    report(error: unknown): void;
    select(files: LocalFile[]): void;
    private put;
    refresh(): Promise<void>;
    page(id: string, cursor?: number): Promise<void>;
    plan(direction: 'upload' | 'download', target: string): Promise<void>;
    private manifest;
    start(job: TransferSummary, replace: boolean, folder?: LocalDirectory, onlyIndex?: number): Promise<void>;
    private execute;
    private chunk;
    pause(): Promise<void>;
    cancel(job: TransferSummary, folder?: LocalDirectory): Promise<void>;
    forget(job: TransferSummary, folder?: LocalDirectory): Promise<void>;
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=transfer-model.d.ts.map