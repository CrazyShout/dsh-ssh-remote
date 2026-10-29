import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseCheck, ReleaseTarget, UpdateInfo, UpdatesRemote } from 'dsh-ssh-remote/updates';
type Installer = Pick<ClientRemote['pluginManager'], 'installBundle' | 'waitForInstall' | 'cancelInstall'>;
import { type StorageLike } from './update-receipt.js';
type Phase = 'installing' | 'applying' | 'unknown' | 'failed' | 'cancelled' | 'restart' | 'done';
export interface UpdateOperation {
    requestId: string;
    target: ReleaseTarget;
    phase: Phase;
    message: string;
    canDismiss?: boolean;
    recovering?: boolean;
    logPath?: string;
    stage?: string;
}
export interface UpdateSnapshot {
    info?: UpdateInfo;
    release?: ReleaseCheck;
    checking: boolean;
    automatic: boolean;
    dismissed: string;
    error: string;
    infoError: string;
    receiptError: string;
    operation?: UpdateOperation;
}
/** Releases are stable triples; an installed prerelease of that same triple precedes the stable version. */
export declare function newerRelease(target: string, current: string): boolean;
export declare function validTarget(value: unknown): value is ReleaseTarget;
export declare function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined;
/** One controller per client. Package writes remain owned by the official installer. */
export declare class UpdateStore {
    private readonly remote;
    private readonly installer;
    private readonly preferences?;
    private readonly receipts?;
    private state;
    private readonly listeners;
    private epoch;
    private operationGeneration;
    private infoSequence;
    private disposed;
    private key;
    private pending?;
    private infoTask?;
    private checkTask?;
    private recovery?;
    private timer?;
    private visible;
    constructor(remote: UpdatesRemote, installer: Installer, preferences?: StorageLike | undefined, receipts?: StorageLike | undefined);
    getSnapshot: () => UpdateSnapshot;
    subscribe: (listener: () => void) => () => void;
    private patch;
    private acceptInfo;
    /** Post-operation callers force a new read instead of joining a pre-install snapshot. */
    private readInfo;
    /** Public plugin-manager/changed notifications coalesce within one event turn. */
    private refreshTask?;
    refreshInstallation(): Promise<void>;
    private remember;
    private forget;
    private guard;
    start(): Promise<void>;
    setVisible(visible: boolean): void;
    setAutomatic(automatic: boolean): void;
    dismiss(): void;
    private savePreferences;
    check(force?: boolean): Promise<void>;
    available(): ReleaseTarget | undefined;
    busy(): boolean;
    install(target: ReleaseTarget): Promise<void>;
    progress(requestId: string, phase: string): void;
    cancel(): Promise<void>;
    reconcile(): Promise<void>;
    finishUnknown(): Promise<void>;
    private installed;
    private result;
    dispose(): void;
}
export {};
//# sourceMappingURL=update-store.d.ts.map