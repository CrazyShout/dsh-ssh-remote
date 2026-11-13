import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperStatus } from './helper/manager.js';
export declare class RemoteGitProbeCooldownError extends Error {
    readonly retryAfterMs: number;
    readonly authority: string;
    readonly code = "REMOTE_GIT_PROBE_COOLDOWN";
    constructor(retryAfterMs: number, authority: string);
}
/** Conservative classification, not an authorization or sandbox boundary. */
export declare function isReadOnlyGitProbeArgv(argv: readonly string[]): boolean;
export declare function isInfrastructureFailureError(error: unknown, signal?: AbortSignal): boolean;
type ProbeResult = 'open' | 'healthy' | 'ignore';
type FinishProbe = (result: ProbeResult) => void;
/** Bounded negative cache for identical probes; never a host-wide failure flag. */
export declare class RemoteGitProbeFailureCircuit {
    private readonly cooldownMs;
    private readonly now;
    private readonly status?;
    private readonly circuits;
    private disposed;
    constructor(cooldownMs?: number, now?: () => number, status?: ((alias: string) => RemoteHelperStatus) | undefined);
    begin(cwd: string, argv: readonly string[], env?: NodeJS.ProcessEnv, signal?: AbortSignal): FinishProbe | undefined;
    observe(finish: FinishProbe | undefined, handle: SubprocessHandle, signal?: AbortSignal): void;
    launchFailed(finish: FinishProbe | undefined, error: unknown, signal?: AbortSignal): void;
    connectionChanged(status: RemoteHelperStatus): void;
    dispose(): void;
}
export {};
//# sourceMappingURL=git-probe-circuit.d.ts.map