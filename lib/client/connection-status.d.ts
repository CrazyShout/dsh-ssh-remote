import type { ConnectionGenerationState } from '@deepseek-ai/dsh-client-connection/client';
import type { HelperHostStatus, RemoteResult } from 'dsh-ssh-remote/ssh';
export interface ConnectionStatusSnapshot {
    readonly generation?: number;
    readonly hosts: Readonly<Record<string, HelperHostStatus>>;
    readonly unavailable?: string;
}
export interface ConnectionStatusOptions {
    /** Minimum delay between environment re-probes of one host identity. */
    recheckCooldownMs?: number;
}
/** One read-only poll shared by the visible host badge and workbench. */
export declare class ConnectionStatusStore {
    private readonly load;
    private readonly generation;
    private readonly recheck?;
    private snapshot;
    private readonly listeners;
    private readonly owners;
    private readonly rechecks;
    private readonly nextRecheckAt;
    private readonly wanted;
    /** Visible lease count per host alias, so one host can withdraw its own retry. */
    private readonly visible;
    private retryTimer;
    private readonly recheckCooldownMs;
    private epoch;
    private timer;
    private deadline;
    private disposed;
    private readonly stopGeneration;
    constructor(load: () => Promise<RemoteResult<Record<string, HelperHostStatus>>>, generation: ConnectionGenerationState, recheck?: ((alias: string) => Promise<unknown>) | undefined, options?: ConnectionStatusOptions);
    getSnapshot: () => ConnectionStatusSnapshot;
    subscribe: (listener: () => void) => () => void;
    hasOwner(key: string): boolean;
    /**
     * Republish the polled snapshot after out-of-band knowledge changed.
     *
     * The cached capability verdict is only refreshed by an explicit environment
     * probe; without this the badge keeps the connect-time verdict even after the
     * host reports a new one.
     */
    refresh(): void;
    /**
     * Re-probe one host's login-shell environment, then republish.
     *
     * The badge and the workbench are separate components over one store, and the
     * five-second poll re-renders both of them, so the in-flight request, the
     * cooldown and the retry timer have to live here rather than in a per-surface
     * ref: one host identity means one probe. A negative verdict is never final
     * either — the tool may be installed after the helper connected, or after an
     * earlier probe failed — so a degraded host keeps a bounded, low-frequency
     * retry that the store drives on its own clock. That keeps the five-second
     * status poll from becoming an environment check, needs no reconnect or
     * Session switch, and stops as soon as the surface hides or the host recovers.
     */
    recheckHost(alias: string): Promise<void>;
    private identity;
    private isVisible;
    private probe;
    /**
     * Arm one timer for the earliest visible host that is still degraded.
     *
     * A host with a probe in flight has no due time yet: arming on it would fire a
     * zero-delay timer that can only re-enter the same pending probe. Its own
     * completion arms the next round.
     */
    private scheduleRetry;
    private retryDue;
    private identityAlias;
    private isCurrent;
    /** Drop one host's retry demand once its last visible surface is gone. */
    private forget;
    /** A key includes Session, cwd and verified alias; duplicate surfaces share a lease. */
    retain(key: string): () => void;
    private holdAlias;
    private releaseAlias;
    dispose(): void;
    private publish;
    private restart;
    private poll;
}
//# sourceMappingURL=connection-status.d.ts.map