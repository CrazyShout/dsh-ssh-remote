import { type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { BranchListing, BranchMutation } from 'dsh-ssh-remote/branch-switch';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'conversation.hero.options': {
            kind: 'list';
            scope: 'session';
        };
    }
}
interface RemoteBranchListing extends BranchListing {
}
interface RemoteBranchMutation extends BranchMutation {
}
interface ForgeCheckout {
    root: string;
    branch: string | null;
    linked: boolean;
    commit: string | null;
}
type ForgeCheckoutState = {
    state: 'pending';
} | {
    state: 'none';
} | {
    state: 'failed';
    message: string;
} | {
    state: 'ready';
    checkout: ForgeCheckout;
};
interface ForgeWorktreeState {
    request: {
        from: string | null;
    } | null;
    creation: unknown | null;
    editable: boolean;
    blocker: string | null;
}
interface ForgePanelState {
    checkout: ForgeCheckoutState;
    worktree: ForgeWorktreeState;
}
interface ForgePanelStream extends AsyncIterable<ForgePanelState> {
    dispose?(): void;
}
export interface WorktreeBranchInjected {
    sessionId: SessionId;
    follow(signal: AbortSignal): ForgePanelStream;
    requestWorktree(from: string | null): Promise<{
        ok: boolean;
        message?: string;
    }>;
    cancelWorktree(): Promise<{
        ok: boolean;
        message?: string;
    }>;
    refresh(): Promise<{
        ok: boolean;
        message?: string;
    }>;
    search(query: string, fetchMissing: boolean, signal?: AbortSignal): Promise<RemoteBranchListing>;
    switchBranch(ref: string): Promise<RemoteBranchMutation>;
    createBranch(name: string): Promise<RemoteBranchMutation>;
}
/** Branch picker that preserves Forge's worktree option and adds direct switching. */
export declare function WorktreeBranchControl(props: PropsRuntime<'conversation.hero.options'> & WorktreeBranchInjected): ReactNode;
/** Register the Forge-compatible branch control when the official panel is mounted. */
export declare function mountBranchSwitch(ctx: Context): () => Promise<void>;
export {};
//# sourceMappingURL=branch-switch.d.ts.map