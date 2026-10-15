import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import type { TransferAppend, TransferControl, TransferFile, TransferFileRequest, TransferFileResult, TransferPage, TransferPlan, TransferSummary } from 'dsh-ssh-remote/transfers';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
import { TransferStore } from './transfer-store.js';
export declare class TransferManager {
    private readonly helpers;
    private readonly resolve;
    private readonly invalidate;
    readonly store: TransferStore;
    private readonly queues;
    private readonly runs;
    private readonly busyFiles;
    private readonly timer;
    private disposed;
    private readonly expiring;
    constructor(helpers: RemoteHelperProvider, resolve: RemotePathResolver, invalidate?: (root: string) => void, directory?: string);
    root(scope: WorkspaceFileScope): string;
    private owned;
    private summary;
    private exclusive;
    private channel;
    private call;
    private closeChannel;
    list(scope: WorkspaceFileScope): Promise<TransferSummary[]>;
    page(scope: WorkspaceFileScope, id: string, cursor?: number): Promise<TransferPage>;
    plan(scope: WorkspaceFileScope, request: TransferPlan): Promise<TransferPage>;
    append(scope: WorkspaceFileScope, request: TransferAppend): Promise<TransferPage>;
    private running;
    control(scope: WorkspaceFileScope, request: TransferControl): Promise<TransferPage>;
    private pauseOwned;
    private remotePath;
    file(scope: WorkspaceFileScope, request: TransferFileRequest): Promise<TransferFileResult>;
    private maybeComplete;
    upload(scope: WorkspaceFileScope, id: string, index: number, runId: string, offset: number, bytes: Uint8Array, expectedHash: string, signal?: AbortSignal): Promise<TransferFile>;
    download(scope: WorkspaceFileScope, id: string, index: number, runId: string, offset: number, signal?: AbortSignal): Promise<{
        bytes: Uint8Array;
        sha256: string;
    }>;
    dispose(): Promise<void>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemoteTransfers: SshRemoteTransfers;
    }
}
export declare class SshRemoteTransfers extends TypertRemoteService {
    private readonly manager;
    constructor(ctx: Context, manager: TransferManager);
    list(scope: WorkspaceFileScope, signal: AbortSignal): Promise<TransferSummary[]>;
    plan(scope: WorkspaceFileScope, request: TransferPlan): Promise<TransferPage>;
    append(scope: WorkspaceFileScope, request: TransferAppend): Promise<TransferPage>;
    page(scope: WorkspaceFileScope, id: string, cursor: number, signal: AbortSignal): Promise<TransferPage>;
    control(scope: WorkspaceFileScope, request: TransferControl): Promise<TransferPage>;
    file(scope: WorkspaceFileScope, request: TransferFileRequest): Promise<TransferFileResult>;
}
/** Existing Connection carrier owns authentication, origin fencing and streaming backpressure. */
export declare function mountTransferHttp(ctx: Context, manager: TransferManager): () => Promise<void>;
//# sourceMappingURL=transfers.d.ts.map