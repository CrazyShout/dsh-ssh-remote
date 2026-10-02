import type { ShellExecutor, ShellProcess } from '@deepseek-ai/dsh-shell';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
/**
 * Route model-facing shell execution before local sandbox argv is materialized.
 * Newer DSH exposes a single `ShellExecutor.execute(spec)` returning a
 * `ShellExecution` (a `ShellProcess` with a `result()` projection); the older
 * `run`/`start` pair was removed. A remote workdir selects the helper-backed
 * remote process; local workdirs fall through to the stock executor untouched.
 */
export declare function installRemoteShellRouter(shell: ShellExecutor, helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver, processes?: RemoteShellProcessTracker): () => void;
/** Owns helper background jobs across shell-provider reloads and plugin teardown. */
export declare class RemoteShellProcessTracker {
    private readonly processes;
    track<T extends ShellProcess>(process: T): T;
    dispose(): Promise<void>;
}
//# sourceMappingURL=helper-shell.d.ts.map