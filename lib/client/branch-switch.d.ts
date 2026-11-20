import { type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { BranchListing, BranchMutation } from 'dsh-ssh-remote/branch-switch';
import { useRemoteWorkspace } from './native-panels.js';
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
    refresh(): Promise<{
        ok: boolean;
        message?: string;
    }>;
    search(query: string, options: {
        includeRemote: boolean;
        discoverRemote: boolean;
    }, signal?: AbortSignal): Promise<RemoteBranchListing>;
    switchBranch(ref: string): Promise<RemoteBranchMutation>;
    createBranch(name: string): Promise<RemoteBranchMutation>;
}
/** Branch picker that preserves Forge's worktree option and adds direct switching. */
export declare function WorktreeBranchControl(props: PropsRuntime<'conversation.hero.options'> & WorktreeBranchInjected): ReactNode;
type MappedBranchProps = PropsRuntime<'conversation.hero.options'> & WorktreeBranchInjected & Pick<Parameters<typeof useRemoteWorkspace>[0], 'workspaceInfo' | 'connectionStatus'>;
/** A new session never inherits the previous session's checkout or pending replies. */
export declare function RemoteBranchEntry(props: MappedBranchProps): import("react").FunctionComponentElement<object & import("@deepseek-ai/dsh-client-ui-slots").SessionStandardProps & import("@deepseek-ai/dsh-client-ui-slots").GlobalStandardProps & WorktreeBranchInjected> | null;
/** Register alongside (not instead of) Forge's official worktree control. */
export declare function mountBranchSwitch(ctx: Context): () => Promise<void>;
export {};
//# sourceMappingURL=branch-switch.d.ts.map