import { Context } from '@deepseek-ai/cordis';
import { RemoteHelperManager } from './helper/manager.js';
import { hasConcreteSshAlias } from './ssh-config.js';
import { SshRemoteService } from './registry.js';
import { installRemoteShellRouter, RemoteShellProcessTracker } from './helper-shell.js';
import {
  installRemoteFileSystemRouter,
  installRemoteSubprocessRouter,
  installRemoteTerminalRouter,
} from './runtime-router.js';
import { RemoteTerminalBackend } from './terminal.js';
import type {} from '@deepseek-ai/dsh-fs';
import type {} from '@deepseek-ai/dsh-shell';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type {} from '@deepseek-ai/dsh-subprocess';
import type {} from '@deepseek-ai/dsh-terminal';

export type {
  DiscoveredSshHost,
  HelperHostDiagnostics,
  HelperHostStatus,
  HelperHostStatuses,
  RemoteDirectoryEntry,
  RemoteDirectoryListing,
  SshConfig,
  SshHostEntry,
  SshWorkspaceAnchor,
} from './registry.js';
export { LegacySsh2RemoteTerminalBackend, Ssh2RemoteTerminalBackend } from './terminal.js';

export const name = 'dsh-ssh-remote';
export const inject = ['settings', 'fs', 'subprocess'];

export function apply(ctx: Context) {
  const helpers = new RemoteHelperManager({ aliasValidator: hasConcreteSshAlias });
  const shellProcesses = new RemoteShellProcessTracker();
  const service = new SshRemoteService(ctx, helpers);
  const resolveRemotePath = service.resolveRemotePath.bind(service);
  const restoreFileSystem = installRemoteFileSystemRouter(
    ctx.fs,
    service.connections,
    resolveRemotePath,
    helpers,
  );
  const restoreSubprocess = installRemoteSubprocessRouter(ctx.subprocess, resolveRemotePath);

  // Optional capability seams use child fibers: they activate whenever the
  // corresponding host services exist, unload cleanly when providers reload,
  // and never leave the whole plugin pending in a smaller DSH composition.
  const shellFiber = ctx.inject(['shell'], scope => installRemoteShellRouter(
    scope.shell,
    helpers,
    resolveRemotePath,
    shellProcesses,
  ));

  // Persistent PTY routing is optional: a deployment without the terminal
  // service (e.g. a preset that composes only sandboxed bash) skips it.
  const terminalFiber = ctx.inject(['terminals', 'sandboxPolicy'], (scope) => {
    const backend = new RemoteTerminalBackend(
      helpers,
      resolveRemotePath,
      scope.sandboxPolicy,
    );
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
      terminalFiber.dispose(),
      shellFiber.dispose(),
    ]);
    restoreSubprocess();
    restoreFileSystem();
    const shellResult = await Promise.allSettled([shellProcesses.dispose()]);
    const results = [
      ...childResults,
      ...shellResult,
      ...await Promise.allSettled([service.dispose(), helpers.dispose()]),
    ];
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'dsh-ssh-remote cleanup failed');
  };
}
