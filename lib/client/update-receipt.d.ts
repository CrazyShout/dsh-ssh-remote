import type { ChangeResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReleaseTarget } from 'dsh-ssh-remote/updates';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface UpdateResultSummary extends Pick<ChangeResult, 'changed' | 'application' | 'stage' | 'target'> {
    error?: {
        code: string;
        diagnostic?: string;
    };
    pendingBuilds?: string[];
    pendingBuildsOmitted?: number;
    packageResult?: Partial<Pick<NonNullable<ChangeResult['packageResult']>, 'exitCode' | 'kind' | 'timedOut' | 'logPath'>>;
}
export interface UpdateReceipt {
    version: 2;
    requestId: string;
    target: ReleaseTarget;
    result?: UpdateResultSummary;
}
export declare const RECEIPT_BYTES: number;
export declare const LEGACY_RECEIPT_BYTES: number;
/** Do not persist pnpm output, credentials, approvals or the full installer response. */
export declare function compactResult(value: ChangeResult): UpdateResultSummary;
export declare function writeReceipt(storage: StorageLike | undefined, key: string, value: UpdateReceipt): boolean;
export declare function readReceipt(storage: StorageLike | undefined, key: string): {
    receipt?: UpdateReceipt;
    error?: 'unreadable';
};
export declare function clearReceipt(storage: StorageLike | undefined, key: string): void;
export declare function peekRequestId(storage: StorageLike | undefined, key: string): string | undefined;
//# sourceMappingURL=update-receipt.d.ts.map