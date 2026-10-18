export { rankCandidates } from './file-ranking.js';
import type { FileReferenceCandidate, FileReferenceService } from '@deepseek-ai/dsh-file-reference';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
export interface FileIndexStatus {
    generation: number;
    state: 'idle' | 'building' | 'ready' | 'partial' | 'error';
    stale: boolean;
    complete: boolean;
    count: number;
    pathBytes: number;
    unsupported: number;
    message: string;
}
export interface FileIndexResult extends FileIndexStatus {
    sessionId: string;
    rootUri: string;
    candidates: FileReferenceCandidate[];
}
/** Resource ownership is separate from individual completion RPC cancellation. */
export declare class RemoteFileIndex {
    private readonly helpers;
    private readonly resolve;
    private readonly now;
    private readonly entries;
    private readonly activeRoots;
    private active;
    private generation;
    private disposed;
    constructor(helpers: RemoteHelperProvider, resolve: RemotePathResolver, now?: () => number);
    root(scope: WorkspaceFileScope): string;
    status(scope: WorkspaceFileScope, ignored: boolean): FileIndexStatus;
    invalidate(workspaceRoot: string, ignored?: boolean): void;
    query(scope: WorkspaceFileScope, query: string, ignored: boolean, signal: AbortSignal): Promise<FileIndexResult>;
    private describe;
    private makeRoom;
    private trimBytes;
    private build;
    dispose(): Promise<void>;
}
export declare function representable(path: string): boolean;
export declare function installRemoteFileReferencesRouter(service: Pick<FileReferenceService, 'list'>, index: RemoteFileIndex, resolve: RemotePathResolver): () => void;
//# sourceMappingURL=file-index.d.ts.map