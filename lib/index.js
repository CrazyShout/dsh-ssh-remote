import { SshRemoteService } from './registry.js';
import { installRemoteFileSystemRouter, installRemoteSubprocessRouter, installRemoteTerminalRouter, } from './runtime-router.js';
import { RemoteTerminalBackend } from './terminal.js';
export const name = 'dsh-ssh-remote';
export const inject = ['settings', 'fs', 'subprocess'];
export function apply(ctx) {
    const service = new SshRemoteService(ctx);
    const resolveRemotePath = service.resolveRemotePath.bind(service);
    const restoreFileSystem = installRemoteFileSystemRouter(ctx.fs, service.connections, resolveRemotePath);
    const restoreSubprocess = installRemoteSubprocessRouter(ctx.subprocess, resolveRemotePath);
    // Persistent PTY routing is optional: a deployment without the terminal
    // service (e.g. a preset that composes only sandboxed bash) skips it.
    const terminals = ctx.get('terminals');
    let unregisterTerminal;
    let restoreTerminal;
    if (terminals !== undefined) {
        unregisterTerminal = terminals.registerBackend(new RemoteTerminalBackend(service.connections, resolveRemotePath));
        restoreTerminal = installRemoteTerminalRouter(terminals, resolveRemotePath);
    }
    return async () => {
        restoreTerminal?.();
        unregisterTerminal?.();
        restoreSubprocess();
        restoreFileSystem();
        await service.dispose();
    };
}
//# sourceMappingURL=index.js.map