import type { Context } from '@deepseek-ai/cordis';
import type { TerminalController } from '@deepseek-ai/dsh-api-terminal-controller';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { RemotePathResolver } from './runtime-router.js';
import type { RemoteUserTerminal } from './user-pty.js';
import type { ShellSnapshot, TerminalContext, TerminalObservation } from '../shared/terminal-state.js';
/** Only the public create request correlates identities; no controller private maps or guessed env ids. */
export declare class TerminalStateManager {
    private readonly resolve;
    private readonly scope;
    private readonly entries;
    private controller?;
    private disposed;
    private readonly lifetime;
    constructor(resolve: RemotePathResolver);
    private key;
    mount(controller: TerminalController): () => void;
    reserve(uri: string): {
        output(data: Buffer): void;
        state(snapshot: ShellSnapshot): void;
        attached(terminal: RemoteUserTerminal): void;
        failed(): void;
        closed(): void;
    } | undefined;
    private accept;
    private authorize;
    private refresh;
    list(scope: WorkspaceFileScope, signal: AbortSignal): Promise<TerminalObservation[]>;
    private view;
    context(scope: WorkspaceFileScope, id: string, signal: AbortSignal): Promise<TerminalContext>;
    dispose(): void;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sshRemoteTerminalState: SshRemoteTerminalState;
    }
}
export declare class SshRemoteTerminalState extends TypertRemoteService {
    private readonly manager;
    constructor(ctx: Context, manager: TerminalStateManager);
    list(scope: WorkspaceFileScope, signal: AbortSignal): Promise<TerminalObservation[]>;
    context(scope: WorkspaceFileScope, id: string, signal: AbortSignal): Promise<TerminalContext>;
}
//# sourceMappingURL=terminal-state.d.ts.map