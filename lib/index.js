import { RemoteHelperManager } from './helper/manager.js';
import { hasConcreteSshAlias } from './ssh-config.js';
import { SshRemoteService, LegacySshRemoteSettingsSchema } from './registry.js';
import { installRemoteShellRouter, RemoteShellProcessTracker } from './helper-shell.js';
import { installRemoteFileSystemRouter, installRemoteSubprocessRouter, installRemoteTerminalRouter, } from './runtime-router.js';
import { RemoteTerminalBackend } from './terminal.js';
import { installRemoteUserSubprocessRouter } from './user-subprocess.js';
import { installRemoteWorkspaceFilesRouter } from './workspace-files.js';
import { SshRemoteEditor } from './editor.js';
import { RemoteFileIndex, installRemoteFileReferencesRouter } from './file-index.js';
import { SshRemoteFiles } from './file-search.js';
import { PortForwardManager, SshRemotePorts } from './port-forwards.js';
import { TransferManager, SshRemoteTransfers, mountTransferHttp } from './transfers.js';
import { TerminalStateManager, SshRemoteTerminalState } from './terminal-state.js';
import { mountRemoteSkills } from './remote-skills.js';
import { SshRemoteUpdates } from './updates.js';
export const name = 'dsh-ssh-remote';
export const inject = ['fs', 'subprocess'];
/** Legacy SSH host import source consumed through the standard Cordis Config. */
export const Config = LegacySshRemoteSettingsSchema;
export function apply(ctx, config) {
    const updatesFiber = ctx.inject(['pluginManager', 'profileContext'], scope => { new SshRemoteUpdates(scope); return () => { }; });
    const helpers = new RemoteHelperManager({ aliasValidator: hasConcreteSshAlias });
    const shellProcesses = new RemoteShellProcessTracker();
    const service = new SshRemoteService(ctx, helpers, config);
    const resolveRemotePath = service.resolveRemotePath.bind(service);
    const fileIndex = new RemoteFileIndex(helpers, resolveRemotePath);
    const remoteSkills = mountRemoteSkills(ctx, helpers, resolveRemotePath);
    const filesChanged = (root) => { fileIndex.invalidate(root); remoteSkills.invalidate(); };
    const portForwards = new PortForwardManager(resolveRemotePath);
    const transfers = new TransferManager(helpers, resolveRemotePath, filesChanged);
    const terminalState = new TerminalStateManager(resolveRemotePath);
    const terminalStateFiber = ctx.inject(['terminalController', 'workspaceFiles', 'sessions'], scope => {
        new SshRemoteTerminalState(scope, terminalState);
        return terminalState.mount(scope.terminalController);
    });
    const disposeTransferHttp = mountTransferHttp(ctx, transfers);
    const referencesFiber = ctx.inject(['fileReferences'], scope => installRemoteFileReferencesRouter(scope.fileReferences, fileIndex, resolveRemotePath));
    const restoreFileSystem = installRemoteFileSystemRouter(ctx.fs, resolveRemotePath, helpers);
    const restoreSubprocess = installRemoteSubprocessRouter(ctx.subprocess, resolveRemotePath);
    const userSubprocess = installRemoteUserSubprocessRouter(ctx, ctx.subprocess, helpers, resolveRemotePath, terminalState);
    const workspaceFilesFiber = ctx.inject(['workspaceFiles'], scope => installRemoteWorkspaceFilesRouter(scope.workspaceFiles, helpers, resolveRemotePath));
    const editorFiber = ctx.inject(['workspaceFiles', 'sessions'], scope => {
        new SshRemoteEditor(scope, helpers, resolveRemotePath, filesChanged);
        new SshRemoteFiles(scope, fileIndex, helpers, resolveRemotePath);
        new SshRemotePorts(scope, portForwards);
        new SshRemoteTransfers(scope, transfers);
        scope.on('session/event', (session, event) => {
            if (event.type === 'tool/result' && session.header.cwd)
                fileIndex.invalidate(session.header.cwd);
        });
        return () => { };
    });
    // Optional capability seams use child fibers: they activate whenever the
    // corresponding host services exist, unload cleanly when providers reload,
    // and never leave the whole plugin pending in a smaller DSH composition.
    const shellFiber = ctx.inject(['shell'], scope => installRemoteShellRouter(scope.shell, helpers, resolveRemotePath, shellProcesses));
    // Persistent PTY routing is optional: a deployment without the terminal
    // service (e.g. a preset that composes only sandboxed bash) skips it.
    const terminalFiber = ctx.inject(['terminals', 'sandboxPolicy'], (scope) => {
        const backend = new RemoteTerminalBackend(helpers, resolveRemotePath, scope.sandboxPolicy);
        const unregisterTerminal = scope.terminals.registerBackend(backend);
        const restoreTerminal = installRemoteTerminalRouter(scope.terminals, resolveRemotePath);
        return async () => {
            restoreTerminal();
            unregisterTerminal();
            await backend.dispose();
        };
    });
    return async () => {
        // Child capability adapters own live remote processes and must quiesce
        // before the host-level helper session is explicitly closed.
        const childResults = await Promise.allSettled([
            updatesFiber.dispose(),
            terminalFiber.dispose(),
            shellFiber.dispose(),
            workspaceFilesFiber.dispose(),
            editorFiber.dispose(),
            referencesFiber.dispose(),
            remoteSkills.dispose(),
            disposeTransferHttp(),
            terminalStateFiber.dispose(),
            userSubprocess.dispose(),
        ]);
        restoreSubprocess();
        terminalState.dispose();
        restoreFileSystem();
        const shellResult = await Promise.allSettled([shellProcesses.dispose(), fileIndex.dispose(), portForwards.dispose(), transfers.dispose()]);
        const results = [
            ...childResults,
            ...shellResult,
            ...await Promise.allSettled([service.dispose(), helpers.dispose()]),
        ];
        const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
        if (failures.length === 1)
            throw failures[0];
        if (failures.length > 1)
            throw new AggregateError(failures, 'dsh-ssh-remote cleanup failed');
    };
}
//# sourceMappingURL=index.js.map