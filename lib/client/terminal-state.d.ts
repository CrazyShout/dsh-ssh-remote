import type { Context } from '@deepseek-ai/cordis';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { TerminalStateRemote } from 'dsh-ssh-remote/terminal-state';
export declare function mountTerminalState(ctx: Context): () => Promise<void>;
export declare function TerminalStatePane({ sessionId, remote, inputActions }: {
    sessionId: string;
    remote: TerminalStateRemote;
    inputActions?: InputActions;
}): import("react").JSX.Element;
//# sourceMappingURL=terminal-state.d.ts.map