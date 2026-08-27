import { Context } from '@deepseek-ai/cordis';
import type { TerminalSessionService } from '@deepseek-ai/dsh-terminal';
import { SshRemoteService } from './registry.js';
import {
  installRemoteFileSystemRouter,
  installRemoteSubprocessRouter,
  installRemoteTerminalRouter,
} from './runtime-router.js';
import { RemoteTerminalBackend } from './terminal.js';
import type {} from '@deepseek-ai/dsh-fs';
import type {} from '@deepseek-ai/dsh-subprocess';

export type {
  DiscoveredSshHost,
  RemoteDirectoryEntry,
  RemoteDirectoryListing,
  SshConfig,
  SshHostEntry,
  SshWorkspaceAnchor,
} from './registry.js';

export const name = 'dsh-ssh-remote';
export const inject = ['settings', 'fs', 'subprocess'];

export function apply(ctx: Context) {
  const service = new SshRemoteService(ctx);
  const resolveRemotePath = service.resolveRemotePath.bind(service);
  const restoreFileSystem = installRemoteFileSystemRouter(
    ctx.fs,
    service.connections,
    resolveRemotePath,
  );
  const restoreSubprocess = installRemoteSubprocessRouter(ctx.subprocess, resolveRemotePath);

  // Persistent PTY routing is optional: a deployment without the terminal
  // service (e.g. a preset that composes only sandboxed bash) skips it.
  const terminals = ctx.get('terminals') as TerminalSessionService | undefined;
  let unregisterTerminal: (() => void) | undefined;
  let restoreTerminal: (() => void) | undefined;
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
