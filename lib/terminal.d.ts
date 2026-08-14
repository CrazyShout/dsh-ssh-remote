import type { TerminalBackend, TerminalBackendSession, TerminalBackendSpawnSpec } from '@deepseek-ai/dsh-terminal';
import type { SshConnectionManager } from './connection.js';
import type { RemotePathResolver } from './runtime-router.js';
/** Replaceable `ssh` PTY backend registered on `ctx.terminals`. */
export declare class RemoteTerminalBackend implements TerminalBackend {
    private readonly connections;
    private readonly resolveRemotePath;
    readonly type = "ssh";
    constructor(connections: SshConnectionManager, resolveRemotePath: RemotePathResolver);
    spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>;
}
//# sourceMappingURL=terminal.d.ts.map