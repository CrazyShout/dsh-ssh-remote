import type { ConnectionGenerationState } from '@deepseek-ai/dsh-client-connection/client';
import type { HelperHostStatus, RemoteResult } from 'dsh-ssh-remote/ssh';
export interface ConnectionStatusSnapshot {
    readonly generation?: number;
    readonly hosts: Readonly<Record<string, HelperHostStatus>>;
    readonly unavailable?: string;
}
/** One read-only poll shared by the visible host badge and workbench. */
export declare class ConnectionStatusStore {
    private readonly load;
    private readonly generation;
    private snapshot;
    private readonly listeners;
    private readonly owners;
    private epoch;
    private timer;
    private deadline;
    private disposed;
    private readonly stopGeneration;
    constructor(load: () => Promise<RemoteResult<Record<string, HelperHostStatus>>>, generation: ConnectionGenerationState);
    getSnapshot: () => ConnectionStatusSnapshot;
    subscribe: (listener: () => void) => () => void;
    hasOwner(key: string): boolean;
    /** A key includes Session, cwd and verified alias; duplicate surfaces share a lease. */
    retain(key: string): () => void;
    dispose(): void;
    private publish;
    private restart;
    private poll;
}
//# sourceMappingURL=connection-status.d.ts.map