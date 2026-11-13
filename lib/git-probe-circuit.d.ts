import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess';
export declare class RemoteGitProbeCooldownError extends Error {
    readonly retryAfterMs: number;
    readonly authority: string;
    readonly code = "REMOTE_GIT_PROBE_COOLDOWN";
    constructor(retryAfterMs: number, authority: string);
}
/** Whether an argv is a read-only Git probe used by Forge and status panels. */
export declare function isReadOnlyGitProbeArgv(argv: readonly string[]): boolean;
/** Whether a launch or completion rejection is an SSH/provider failure rather than cancellation. */
export declare function isInfrastructureFailureError(error: unknown, signal?: AbortSignal): boolean;
/** Suppress repeated remote read-only Git probes after a host-level failure. */
export declare class RemoteGitProbeFailureCircuit {
    private readonly cooldownMs;
    private readonly now;
    private readonly failures;
    constructor(cooldownMs?: number, now?: () => number);
    /** Throw a short stable error instead of starting another failing SSH command. */
    assertAllowed(cwd: string, argv: readonly string[]): void;
    /** Open the host circuit after a synchronous process launch failure. */
    recordFailure(cwd: string, argv: readonly string[]): void;
    /** Open the host circuit only for infrastructure-level failures. */
    observe(cwd: string, argv: readonly string[], handle: SubprocessHandle, signal?: AbortSignal): void;
    private prune;
}
//# sourceMappingURL=git-probe-circuit.d.ts.map