import type { Context } from '@deepseek-ai/cordis';
import type { ShellExecSpec, ShellExecution } from '@deepseek-ai/dsh-shell';
interface RemoteBranchRuntime {
    resolve(path: string): string | undefined;
    execute(uri: string, spec: ShellExecSpec): Promise<ShellExecution>;
}
/** Mount the authenticated branch request route used by the Forge-compatible picker. */
export declare function mountBranchSwitchHttp(ctx: Context, runtime: RemoteBranchRuntime): () => Promise<void>;
export {};
//# sourceMappingURL=branch-switch.d.ts.map