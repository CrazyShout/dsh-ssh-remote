import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseCheck, ReleaseTarget, UpdateInfo, UpdatesRemote } from 'dsh-ssh-remote/updates';
type Installer = Pick<ClientRemote['pluginManager'], 'installBundle' | 'waitForInstall' | 'cancelInstall'>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Phase = 'installing' | 'applying' | 'unknown' | 'failed' | 'cancelled' | 'restart' | 'done';
export interface UpdateOperation {
    requestId: string;
    target: ReleaseTarget;
    phase: Phase;
    message: string;
}
export interface UpdateSnapshot {
    info?: UpdateInfo;
    release?: ReleaseCheck;
    checking: boolean;
    automatic: boolean;
    dismissed: string;
    error: string;
    operation?: UpdateOperation;
}
/** Releases are stable triples; an installed prerelease of that same triple precedes the stable version. */
export declare function newerRelease(target: string, current: string): boolean;
export declare function validTarget(value: unknown): value is ReleaseTarget;
export declare function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined;
/** One instance per client. No package writes except DSH's public installer; disposal never cancels an install. */
export declare class UpdateStore {
    private readonly remote;
    private readonly installer;
    private readonly preferences?;
    private readonly receipts?;
    private state;
    private readonly listeners;
    private epoch;
    private disposed;
    private key;
    private checkTask?;
    private recovery?;
    private timer?;
    private visible;
    constructor(remote: UpdatesRemote, installer: Installer, preferences?: StorageLike | undefined, receipts?: StorageLike | undefined);
    getSnapshot: () => UpdateSnapshot;
    subscribe: (listener: () => void) => () => void;
    private patch;
    private receipt;
    start(): Promise<void>;
    setVisible(visible: boolean): void;
    setAutomatic(automatic: boolean): void;
    dismiss(): void;
    private savePreferences;
    check(force?: boolean): Promise<void>;
    available(): ReleaseTarget | undefined;
    busy(): boolean;
    /** Called only by the explicit confirmation button. Recheck installation identity before any write. */
    install(target: ReleaseTarget): Promise<void>;
    progress(requestId: string, phase: string): void;
    cancel(): Promise<void>;
    reconcile(): Promise<void>;
    private installed;
    private result;
    dispose(): void;
}
export {};
//# sourceMappingURL=update-store.d.ts.map