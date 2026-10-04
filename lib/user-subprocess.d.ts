import { Context } from '@deepseek-ai/cordis';
import { type SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
/**
 * Complete the execution-world seam consumed by DSH's existing human terminal
 * controller. Cordis traces service calls through the calling Agent context;
 * no global "current host", forged Agent, or duplicate user-terminal API.
 */
export declare function installRemoteUserSubprocessRouter(ctx: Context, subprocess: SubprocessRuntime, helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver): {
    dispose(): Promise<void>;
};
//# sourceMappingURL=user-subprocess.d.ts.map