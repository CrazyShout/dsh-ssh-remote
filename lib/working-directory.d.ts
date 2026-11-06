import type { Agent } from '@deepseek-ai/dsh-agent';
import type FileSystem from '@deepseek-ai/dsh-fs';
import type { RemotePathResolver } from './runtime-router.js';
/** Optional public service introduced after the oldest supported DSH SDK. */
export interface WorkingDirectory {
    ensure(agent: Agent, signal?: AbortSignal): Promise<string>;
    set(agent: Agent, path: string, signal?: AbortSignal): Promise<string>;
}
/**
 * DSH canonicalizes child/cd directories with fs.processPath(). That is a
 * remote POSIX path, not an identity on a Windows/macOS Host. Keep the official
 * validation, serialization, change events and notices, but project directories
 * to registered anchors inside these two calls only. Ordinary file results and
 * process arguments still use the real remote path.
 */
export declare function installRemoteWorkingDirectoryRouter(directories: WorkingDirectory, fs: FileSystem, resolve: RemotePathResolver, executionPath: (uri: string) => Promise<string>): {
    dispose(): Promise<void>;
};
//# sourceMappingURL=working-directory.d.ts.map