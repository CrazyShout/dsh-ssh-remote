import type FileSystem from '@deepseek-ai/dsh-fs';
import type {
  SubprocessRuntime,
  SubprocessSpawnSpec,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess';
import type { TerminalSessionService, TerminalSpawnRequest } from '@deepseek-ai/dsh-terminal';
import { createRemoteFileSystemAdapter } from './fs.js';
import type { SshConnectionManager } from './connection.js';
import { parseSshUri } from './types.js';

type AnyFunction = (...args: any[]) => any;

/** Resolve a registered local anchor or descendant to an SSH URI. */
export type RemotePathResolver = (path: string) => string | undefined;

function isSshPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('ssh://');
}

function isSshTarget(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return isSshPath(String((value as { targetKey?: unknown }).targetKey ?? ''));
}

/**
 * Add exact SSH URI routing to DSH's filesystem service. Local paths always
 * call the original provider; only direct SSH URIs and paths beneath a
 * persisted remote Workspace anchor use SFTP.
 */
export function installRemoteFileSystemRouter(
  fs: FileSystem,
  connections: SshConnectionManager,
  resolveRemotePath: RemotePathResolver,
): () => void {
  const remote = createRemoteFileSystemAdapter(connections);
  const originals = new Map<string, AnyFunction>();
  const remember = (name: string) => {
    const original = (fs as unknown as Record<string, AnyFunction>)[name];
    if (typeof original !== 'function') throw new Error(`ctx.fs.${name} is unavailable`);
    originals.set(name, original);
    return original;
  };
  const asRemotePath = (path: string | undefined) => {
    if (path === undefined) return undefined;
    return isSshPath(path) ? path : resolveRemotePath(path);
  };

  const originalResolve = remember('resolve');
  (fs as any).resolve = (path: string, opts?: { cwd?: string; signal?: AbortSignal }) => {
    const remoteCwd = asRemotePath(opts?.cwd);
    const remotePath = asRemotePath(path);
    if (remoteCwd !== undefined) {
      return remote.resolve(remotePath ?? path, { ...opts, cwd: remoteCwd });
    }
    if (remotePath !== undefined) return remote.resolve(remotePath, opts);
    return originalResolve.call(fs, path, opts);
  };

  const originalLstat = remember('lstat');
  (fs as any).lstat = (path: string, opts?: { cwd?: string }, signal?: AbortSignal) => {
    const remoteCwd = asRemotePath(opts?.cwd);
    const remotePath = asRemotePath(path);
    if (remoteCwd !== undefined) {
      return remote.lstat(remotePath ?? path, { ...opts, cwd: remoteCwd }, signal);
    }
    if (remotePath !== undefined) return remote.lstat(remotePath, opts, signal);
    return originalLstat.call(fs, path, opts, signal);
  };

  for (const name of [
    'processPath',
    'fileUrl',
    'stat',
    'readText',
    'streamText',
    'readBytes',
    'listDir',
    'writeText',
    'editText',
  ]) {
    const original = remember(name);
    (fs as unknown as Record<string, AnyFunction>)[name] = (...args: any[]) =>
      isSshTarget(args[0])
        ? (remote as unknown as Record<string, AnyFunction>)[name](...args)
        : original.call(fs, ...args);
  }

  const originalContains = remember('contains');
  (fs as any).contains = (parent: unknown, child: unknown) => {
    const parentRemote = isSshTarget(parent);
    const childRemote = isSshTarget(child);
    if (parentRemote !== childRemote) return false;
    return parentRemote
      ? remote.contains(parent as any, child as any)
      : originalContains.call(fs, parent, child);
  };

  return () => {
    for (const [name, original] of originals) {
      (fs as unknown as Record<string, AnyFunction>)[name] = original;
    }
  };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Build the local OpenSSH argv used for a remote process or terminal. */
export function buildRemoteSshInvocation(
  cwd: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
  terminal: boolean,
): readonly string[] {
  if (argv.length === 0) throw new Error('remote subprocess argv is empty');
  const uri = parseSshUri(cwd);
  const destination = `${uri.user ? `${uri.user}@` : ''}${uri.host}`;
  const environment = Object.entries(env ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .map(([key, value]) => shellQuote(`${key}=${value}`));
  const command = argv.map(shellQuote);
  const exec = environment.length > 0
    ? `exec env ${environment.join(' ')} ${command.join(' ')}`
    : `exec ${command.join(' ')}`;
  const script = `cd ${shellQuote(uri.path)} && ${exec}`;
  const args = ['ssh', terminal ? '-tt' : '-T'];
  // Port 22 stays absent so an alias-specific Port from ~/.ssh/config wins.
  if (uri.port !== 22) args.push('-p', String(uri.port));
  args.push(destination, '--', `sh -lc ${shellQuote(script)}`);
  return args;
}

/**
 * Route process execution by Workspace cwd. The stock local provider still
 * owns stream collection, PTY behavior, cancellation and teardown; for a
 * mapped cwd its managed child is the system OpenSSH client.
 */
export function installRemoteSubprocessRouter(
  subprocess: SubprocessRuntime,
  resolveRemotePath: RemotePathResolver,
): () => void {
  const originalSpawn = subprocess.spawn;
  const originalSpawnTerminal = subprocess.spawnTerminal;

  subprocess.spawn = function (spec: SubprocessSpawnSpec) {
    const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
    if (remoteCwd === undefined) return originalSpawn.call(subprocess, spec);
    return originalSpawn.call(subprocess, {
      ...spec,
      argv: buildRemoteSshInvocation(remoteCwd, spec.argv, spec.env, false),
      cwd: process.cwd(),
      env: undefined,
    });
  };

  subprocess.spawnTerminal = function (spec: SubprocessTerminalSpawnSpec) {
    const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
    if (remoteCwd === undefined) return originalSpawnTerminal.call(subprocess, spec);
    return originalSpawnTerminal.call(subprocess, {
      ...spec,
      argv: buildRemoteSshInvocation(remoteCwd, spec.argv, spec.env, true),
      cwd: process.cwd(),
      env: undefined,
    });
  };

  return () => {
    subprocess.spawn = originalSpawn;
    subprocess.spawnTerminal = originalSpawnTerminal;
  };
}

/**
 * Route persistent PTY sessions by workspace cwd. A remote cwd selects the
 * `ssh` backend (see `RemoteTerminalBackend`); local sessions keep the stock
 * `bash` backend untouched.
 */
export function installRemoteTerminalRouter(
  terminals: TerminalSessionService,
  resolveRemotePath: RemotePathResolver,
): () => void {
  const originalSpawn = terminals.spawn;
  terminals.spawn = function (owner, request: TerminalSpawnRequest, signal?: AbortSignal) {
    const cwd = request.cwd;
    const remote = cwd !== undefined && (cwd.startsWith('ssh://') || resolveRemotePath(cwd) !== undefined);
    if (!remote) return originalSpawn.call(terminals, owner, request, signal);
    return originalSpawn.call(terminals, owner, { ...request, type: 'ssh' }, signal);
  };
  return () => {
    terminals.spawn = originalSpawn;
  };
}
