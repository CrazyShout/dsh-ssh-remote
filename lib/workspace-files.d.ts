import type { WorkspaceFiles } from '@deepseek-ai/dsh-api-workspace-files';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
/**
 * The official file tree can represent a truncated listing; generic fs.listDir
 * cannot. Adapt only this directory-list seam, leaving file previews, local
 * calls, and generic filesystem completeness guarantees with their owners.
 */
export declare function installRemoteWorkspaceFilesRouter(workspaceFiles: Pick<WorkspaceFiles, 'list'>, helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver): () => void;
//# sourceMappingURL=workspace-files.d.ts.map