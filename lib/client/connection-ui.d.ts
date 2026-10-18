import type { CSSProperties } from 'react';
import type { RemoteResult, HelperHostStatus } from 'dsh-ssh-remote/ssh';
export declare const READ_DEADLINE_MS = 30000;
/** Wrap a throwing service call into the dialog's result envelope. */
export declare function asResult<T>(run: () => Promise<T>): Promise<RemoteResult<T>>;
/** Bound non-cancellable host RPCs so a wedged transport cannot lock the dialog forever. */
export declare function withMutationDeadline<T>(operation: Promise<T>, label: string): Promise<T>;
export declare function withReadDeadline<T>(operation: Promise<T>, label: string): Promise<T>;
export declare function withDeadline<T>(operation: Promise<T>, message: string, milliseconds: number, onTimeout?: () => void): Promise<T>;
export declare function messageOf(reason: unknown): string;
export declare const subtleText: CSSProperties;
export declare const dimmedText: CSSProperties;
export declare function helperStateLabel(state: HelperHostStatus['status']): string;
export declare function helperCapabilitySummary(capabilities: Record<string, unknown>): string;
export declare function searchSummary(helper: HelperHostStatus): string;
//# sourceMappingURL=connection-ui.d.ts.map