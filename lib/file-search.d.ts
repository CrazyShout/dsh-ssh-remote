import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { RemoteFileIndex, type FileIndexResult, type FileIndexStatus } from './file-index.js';
import { type RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemoteFiles: SshRemoteFiles;
    }
}
/** All public calls use the official session lookup; the caller cannot choose a host/root. */
export declare class SshRemoteFiles extends TypertRemoteService {
    private readonly index;
    private readonly fs;
    constructor(ctx: Context, index: RemoteFileIndex, helpers: RemoteHelperProvider, resolve: RemotePathResolver);
    preview(scope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<{
        sessionId: string;
        path: string;
    }>;
    query(scope: WorkspaceFileScope, query: string, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexResult>;
    status(scope: WorkspaceFileScope, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexStatus>;
    refresh(scope: WorkspaceFileScope, includeIgnored: boolean, signal: AbortSignal): Promise<FileIndexStatus>;
}
//# sourceMappingURL=file-search.d.ts.map