import type FileSystem from '@deepseek-ai/dsh-fs';
import type { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime';
import { type default as Sandbox } from '@deepseek-ai/dsh-sandbox';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperProvider } from './helper-fs.js';
import type { RemotePathResolver } from './runtime-router.js';
/** Keep the official PTC protocol/binding runtime; adapt only its public execution seams. */
export declare function installRemotePtcRouter(runtime: PtcRuntime, fs: FileSystem, subprocess: SubprocessRuntime, sandbox: Sandbox, helpers: RemoteHelperProvider, resolve: RemotePathResolver): {
    dispose(): Promise<void>;
};
//# sourceMappingURL=ptc-router.d.ts.map