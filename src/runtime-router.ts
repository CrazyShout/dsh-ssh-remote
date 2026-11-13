import FileSystem, { FsError, type FsTarget } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import type {
  SubprocessHandle,
  SubprocessRuntime,
  SubprocessSpawnSpec,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess';
import type { TerminalSessionService, TerminalSpawnRequest } from '@deepseek-ai/dsh-terminal';
import { HelperRemoteFileSystem, type RemoteHelperProvider } from './helper-fs.js';
import { RemoteGitProbeFailureCircuit } from './git-probe-circuit.js';
import type { RemoteHelperManager } from './helper/manager.js';
import { parseSshUri, type SshUri } from './types.js';
import { quotePosix, remoteShCommand } from './ssh-command.js';

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
 * persisted remote Workspace anchor use the helper.
 */
export function installRemoteFileSystemRouter(
  fs: FileSystem,
  resolveRemotePath: RemotePathResolver,
  helpers: RemoteHelperProvider,
): () => void {
  const remote = new HelperRemoteFileSystem(helpers, resolveRemotePath);
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

  const checkedRemoteWriteTarget = async (
    target: FsTarget,
    policy?: SandboxExecutionPolicy,
  ): Promise<FsTarget> => {
    const fallbackMode = (fs as unknown as { sandboxMode?: string }).sandboxMode;
    const mode = policy?.mode ?? fallbackMode;
    if (mode === 'read-only') {
      throw new FsError(`cannot write "${target.displayPath}": remote file access denied under read-only mode`, 'FS_SANDBOX_DENIED');
    }
    if (mode === 'danger-full-access' || mode === undefined) return target;
    if (mode !== 'workspace-write' || policy === undefined) {
      throw new FsError(`cannot write "${target.displayPath}": missing remote workspace policy`, 'FS_SANDBOX_DENIED');
    }
    const remoteRoot = asRemotePath(policy.workspaceRoot);
    if (remoteRoot === undefined) {
      throw new FsError(`cannot write "${target.displayPath}": workspace root is not mapped to this SSH host`, 'FS_SANDBOX_DENIED');
    }
    // Re-canonicalize both identities immediately before mutation. This is the
    // remote equivalent of dsh-fs-sandbox's checkedTarget critical edge.
    const [fresh, root] = await Promise.all([
      remote.resolve(String(target.targetKey)),
      remote.resolve(remoteRoot),
    ]);
    if (!remote.contains(root, fresh)) {
      throw new FsError(`cannot write "${target.displayPath}": remote file access denied outside workspace`, 'FS_SANDBOX_DENIED');
    }
    return fresh;
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

  // DSH 0.1.2 adds this optional host→execution-world visibility seam. Keep
  // rc.2 compatibility while mapping persisted anchors when the newer method
  // exists, so an upgrade does not reinterpret an anchor as a local path.
  const processPathFromHostPath = (fs as unknown as Record<string, AnyFunction>).processPathFromHostPath;
  if (typeof processPathFromHostPath === 'function') {
    originals.set('processPathFromHostPath', processPathFromHostPath);
    (fs as unknown as Record<string, AnyFunction>).processPathFromHostPath = (hostPath: string) => {
      const remotePath = resolveRemotePath(hostPath);
      return remotePath === undefined
        ? processPathFromHostPath.call(fs, hostPath)
        : parseSshUri(remotePath).path;
    };
  }

  for (const name of [
    'processPath',
    'fileUrl',
    'stat',
    'readText',
    'streamText',
    'readBytes',
    'listDir',
  ]) {
    const original = remember(name);
    (fs as unknown as Record<string, AnyFunction>)[name] = (...args: any[]) =>
      isSshTarget(args[0])
        ? (remote as unknown as Record<string, AnyFunction>)[name](...args)
        : original.call(fs, ...args);
  }

  // DSH 0.2.0 adds readByteRange for ranged file reads (e.g. workspace file
  // previews). Intercept it the same way when the host provides it; older DSH
  // versions and test mocks without it are unaffected.
  const originalReadByteRange = (fs as unknown as Record<string, AnyFunction>).readByteRange;
  if (typeof originalReadByteRange === 'function') {
    originals.set('readByteRange', originalReadByteRange);
    (fs as unknown as Record<string, AnyFunction>).readByteRange = (...args: any[]) =>
      isSshTarget(args[0])
        ? (remote as unknown as Record<string, AnyFunction>).readByteRange(...args)
        : originalReadByteRange.call(fs, ...args);
  }

  // The native Files/Preview UI subscribes through ctx.fs.watch. Never hand
  // an execution-world SSH target to the local watcher. The official feed
  // translates this unsupported-provider error into its manual-refresh mode.
  const originalWatch = (fs as unknown as Record<string, AnyFunction>).watch;
  if (typeof originalWatch === 'function') {
    originals.set('watch', originalWatch);
    (fs as unknown as Record<string, AnyFunction>).watch = (...args: any[]) => isSshTarget(args[0])
      ? Promise.reject(new FsError('Remote file watching is unavailable; use the file panel refresh control.', 'FS_IO_ERROR'))
      : originalWatch.call(fs, ...args);
  }

  const originalWriteText = remember('writeText');
  (fs as any).writeText = async (
    target: FsTarget,
    content: string,
    expected?: unknown,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ) => isSshTarget(target)
    ? remote.writeText(await checkedRemoteWriteTarget(target, sandboxPolicy), content, expected as never, signal, sandboxPolicy)
    : originalWriteText.call(fs, target, content, expected, signal, sandboxPolicy);

  const originalEditText = remember('editText');
  (fs as any).editText = async (
    target: FsTarget,
    edit: unknown,
    expected?: unknown,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ) => isSshTarget(target)
    ? remote.editText(await checkedRemoteWriteTarget(target, sandboxPolicy), edit as never, expected as never, signal, sandboxPolicy)
    : originalEditText.call(fs, target, edit, expected, signal, sandboxPolicy);

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

function sameRemote(left: SshUri, right: SshUri): boolean {
  return left.host === right.host && left.port === right.port && left.user === right.user;
}

const PACKAGED_RIPGREP = /(?:^|\/)@vscode\/ripgrep(?:-[a-z0-9-]+)?\/bin\/rg(?:\.exe)?$/u;
const WINDOWS_ACL_RUNNER = /(?:^|\/)dsh-sandbox-windows-acl\/(?:lib|src)\/runner\.[cm]?[jt]s$/u;

interface RemoteSandbox {
  mode: 'read-only' | 'workspace-write';
  root: string;
}

interface WindowsAclCommand {
  argv: readonly string[];
  sandbox?: RemoteSandbox;
}

interface PreparedRemoteCommand {
  argv: readonly string[];
  sandbox?: RemoteSandbox;
}

export const REMOTE_SANDBOX_LAUNCHER = `
import hashlib, json, os, re, shutil, sys
config = json.loads(sys.argv[1])
mode = config["mode"]
root = os.path.realpath(config["root"])
cwd = os.path.realpath(config["cwd"])
if mode not in ("read-only", "workspace-write"):
    raise SystemExit("remote sandbox mode is invalid")
if not os.path.isabs(root) or not os.path.isdir(root) or not os.path.isdir(cwd):
    raise SystemExit("remote sandbox workspace does not exist")
if os.path.commonpath((root, cwd)) != root:
    raise SystemExit("remote sandbox cwd is outside workspace")
bwrap = shutil.which("bwrap")
if bwrap is None or not os.path.isabs(bwrap):
    raise SystemExit("remote sandbox unavailable: bwrap was not found on PATH")
bwrap = os.path.realpath(bwrap)
command = [bwrap, "--die-with-parent", "--unshare-pid", "--ro-bind", "/", "/",
           "--proc", "/proc", "--dev", "/dev"]
workspace_fd = None
if mode == "workspace-write":
    command += ["--tmpfs", "/tmp"]
    if root == "/tmp" or root.startswith("/tmp/"):
        workspace_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        os.set_inheritable(workspace_fd, True)
        command += ["--dir", root, "--bind-fd", str(workspace_fd), root]
    else:
        command += ["--bind", root, root]
private_roots = set()
runtime_base = os.environ.get("DSH_REMOTE_HELPER_RUNTIME_DIR") or os.environ.get("XDG_RUNTIME_DIR")
if runtime_base:
    runtime_root_original = os.path.join(runtime_base, "dsh-remote-helper")
    runtime_root = os.path.realpath(runtime_root_original)
    private_roots.add(runtime_root)
    probe_socket = os.path.join(runtime_root_original, "daemon-" + "0" * 16 + ".sock")
    if len(probe_socket.encode()) >= 100:
        suffix = hashlib.sha256(runtime_root_original.encode()).hexdigest()[:12]
        private_roots.add(os.path.realpath(os.path.join("/tmp", "dsh-rh-" + str(os.getuid()) + "-" + suffix)))
private_roots.add(os.path.realpath("/tmp/dsh-remote-helper-" + str(os.getuid())))
for private in sorted(private_roots):
    hidden_by_tmpfs = (mode == "workspace-write"
                       and private != "/tmp" and private.startswith("/tmp/")
                       and root not in ("/", "/tmp")
                       and private != root and not private.startswith(root + "/"))
    if not hidden_by_tmpfs and os.path.isdir(private):
        command += ["--tmpfs", private, "--remount-ro", private]
environment = {key: value for key, value in os.environ.items()
               if not key.upper().startswith("DSH_")
               and re.search("KEY|PASSWORD|SECRET|TOKEN", key, re.IGNORECASE) is None}
environment.update(config.get("env", {}))
command += ["--clearenv"]
for key in sorted(environment):
    command += ["--setenv", key, environment[key]]
command += ["--chdir", cwd, "--"] + config["argv"]
os.execv(bwrap, command)
`.trim();

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\');
}

/** Recover the remote command and file policy from DSH's local Windows sandbox wrapper. */
function unwrapWindowsAclRunner(
  cwd: SshUri,
  argv: readonly string[],
  resolveRemotePath?: RemotePathResolver,
): WindowsAclCommand {
  if (!isWindowsAbsolutePath(argv[0] ?? '')) return { argv };
  const delimiter = argv.indexOf('--');
  const runner = argv.slice(0, delimiter < 0 ? undefined : delimiter)
    .findIndex(value => WINDOWS_ACL_RUNNER.test(value.replaceAll('\\', '/')));
  if (runner === -1) return { argv };
  // Published DSH uses [node, built runner, ...options, --, ...command].
  // Never drop unknown Node loaders or wrapper options while claiming the
  // original policy was preserved. Source-only development runners fail closed.
  if (runner !== 1
    || !/\/lib\/runner\.[cm]?js$/u.test(argv[runner].replaceAll('\\', '/'))) {
    throw new Error('remote subprocess sandbox wrapper has an unsupported runner prefix');
  }
  const separator = argv.indexOf('--', 2);
  if (separator === -1) throw new Error('remote subprocess sandbox wrapper contains no command separator');
  const command = argv.slice(separator + 1);
  if (command.length === 0) throw new Error('remote subprocess sandbox wrapper contains no command');
  const options = new Map<string, string>();
  const known = new Set(['--workspace', '--temp', '--mode', '--write-sid', '--temp-write-sid']);
  for (let index = 2; index < separator; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!known.has(key) || options.has(key) || index + 1 >= separator || !value || value.startsWith('--')) {
      throw new Error('remote subprocess sandbox wrapper has invalid or unsupported options');
    }
    options.set(key, value);
  }
  const workspace = options.get('--workspace'), mode = options.get('--mode');
  const writeSid = options.has('--write-sid'), tempWriteSid = options.has('--temp-write-sid');
  if (workspace === undefined || !options.has('--temp') || (mode !== 'read-only' && mode !== 'workspace-write')
    || writeSid !== tempWriteSid || (mode === 'read-only' && writeSid)) {
    throw new Error('remote subprocess sandbox wrapper has an invalid workspace policy');
  }
  const mappedRoot = isSshPath(workspace) ? workspace : resolveRemotePath?.(workspace);
  if (mappedRoot === undefined) throw new Error('remote subprocess sandbox workspace is not mapped to SSH');
  const root = parseSshUri(mappedRoot);
  if (!sameRemote(cwd, root)) throw new Error('remote subprocess sandbox workspace belongs to another SSH host');
  return { argv: command, sandbox: { mode, root: root.path } };
}

/** Map a host-only Windows executable path to its command name on the remote PATH. */
function normalizeWindowsExecutable(executable: string): string {
  if (!isWindowsAbsolutePath(executable)) return executable;
  const normalized = executable.replaceAll('\\', '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.exe$/iu, '');
  return name.length === 0 ? executable : name;
}

function remoteArgv(
  cwd: SshUri,
  originalArgv: readonly string[],
  resolveRemotePath?: RemotePathResolver,
): PreparedRemoteCommand {
  const unwrapped = unwrapWindowsAclRunner(cwd, originalArgv, resolveRemotePath);
  const argv = unwrapped.argv;
  const executable = argv[0];
  if (executable === undefined) return unwrapped;
  const normalized = executable.replaceAll('\\', '/');
  const packagedRipgrep = PACKAGED_RIPGREP.test(normalized);
  const hostExecutable = normalizeWindowsExecutable(executable);
  const normalizedArgv = hostExecutable === executable ? argv : [hostExecutable, ...argv.slice(1)];
  const prepared = (args: readonly string[]): PreparedRemoteCommand => unwrapped.sandbox === undefined
    ? { argv: args }
    : { argv: args, sandbox: unwrapped.sandbox };
  if (!packagedRipgrep) return prepared(normalizedArgv);
  const rewritten = ['rg', ...normalizedArgv.slice(1)];
  const separator = rewritten.indexOf('--');
  // DSH's glob/grep templates use long flags (values in --flag=value form)
  // followed by optional roots behind `--`. Limit path rewriting to those
  // templates: arbitrary rg invocations may put a PATTERN behind `--`, and
  // explicit roots without a separator must not be widened by appending `.`.
  const options = rewritten.slice(1, separator === -1 ? undefined : separator);
  const dshSearch = options.every(value => value.startsWith('--')) && (
    options.includes('--files')
    || (options.includes('--json') && options.some(value => value.startsWith('--regexp=')))
  );
  if (!dshSearch) return prepared(rewritten);
  const protect = (args: string[]): string[] => {
    const end = args.indexOf('--');
    // Native grep bypasses ctx.fs. Keep control credentials out of recursive
    // results, and reject explicit paths after realpath so a workspace symlink
    // cannot turn grep into a reader for the helper authentication key.
    args.splice(end, 0, '--iglob=!*.sock.auth');
    return ['python3', '-c',
      "import os,sys; a=sys.argv[1:]; paths=a[a.index('--')+1:]; "
      + "blocked=any(os.path.realpath(p).lower().endswith('.sock.auth') for p in paths); "
      + "sys.exit('helper control credentials are private') if blocked else os.execvp(a[0],a)",
      ...args];
  };
  // In particular, pathless grep must search cwd, not the SSH stdin pipe.
  if (separator === -1) return prepared(protect([...rewritten, '--', '.']));
  if (separator === rewritten.length - 1) return prepared(protect([...rewritten, '.']));
  return prepared(protect(rewritten.map((value, index) => {
    if (index <= separator) return value;
    const mapped = isSshPath(value) ? value : resolveRemotePath?.(value);
    if (mapped === undefined) return value;
    const mappedUri = parseSshUri(mapped);
    if (!sameRemote(cwd, mappedUri)) throw new Error('remote ripgrep search root belongs to a different SSH host');
    return mappedUri.path;
  })));
}

function remoteSandboxCommand(
  cwd: SshUri,
  sandbox: RemoteSandbox,
  argv: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
): readonly string[] {
  const environment = Object.fromEntries(Object.entries(env ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)));
  return [
    // -I excludes cwd/user site/PYTHONPATH before any launcher import occurs.
    'python3', '-I', '-c', REMOTE_SANDBOX_LAUNCHER,
    JSON.stringify({
      mode: sandbox.mode,
      root: sandbox.root,
      cwd: cwd.path,
      argv,
      env: environment,
    }),
  ];
}

/** Build the local OpenSSH argv used for a remote process or terminal. */
export function buildRemoteSshInvocation(
  cwd: string,
  argv: readonly string[],
  env: NodeJS.ProcessEnv | undefined,
  terminal: boolean,
  resolveRemotePath?: RemotePathResolver,
): readonly string[] {
  if (argv.length === 0) throw new Error('remote subprocess argv is empty');
  const uri = parseSshUri(cwd);
  const destination = `${uri.user ? `${uri.user}@` : ''}${uri.host}`;
  const prepared = remoteArgv(uri, argv, resolveRemotePath);
  const command = prepared.sandbox === undefined
    ? prepared.argv.map(quotePosix)
    : remoteSandboxCommand(uri, prepared.sandbox, prepared.argv, env).map(quotePosix);
  const environment = prepared.sandbox === undefined
    ? Object.entries(env ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      .map(([key, value]) => quotePosix(`${key}=${value}`))
    : [];
  const exec = environment.length > 0
    ? `exec env ${environment.join(' ')} ${command.join(' ')}`
    : `exec ${command.join(' ')}`;
  const script = `cd ${quotePosix(uri.path)} && ${exec}`;
  const args = ['ssh', terminal ? '-tt' : '-T'];
  // Port 22 stays absent so an alias-specific Port from ~/.ssh/config wins.
  if (uri.port !== 22) args.push('-p', String(uri.port));
  // End local OpenSSH option parsing before the destination. URI validation
  // also rejects option-like users/hosts; this is defense in depth.
  args.push('--', destination, remoteShCommand(script, true));
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
  connections?: Pick<RemoteHelperManager, 'status' | 'onStatus'>,
): () => void {
  const originalSpawn = subprocess.spawn;
  const originalSpawnTerminal = subprocess.spawnTerminal;
  const gitProbeFailures = new RemoteGitProbeFailureCircuit(undefined, undefined, connections?.status.bind(connections));
  const detachStatus = connections?.onStatus(status => gitProbeFailures.connectionChanged(status));

  subprocess.spawn = function (spec: SubprocessSpawnSpec) {
    const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
    if (remoteCwd === undefined) return originalSpawn.call(subprocess, spec);
    const routed = {
      ...spec,
      argv: buildRemoteSshInvocation(remoteCwd, spec.argv, spec.env, false, resolveRemotePath),
      cwd: process.cwd(),
      env: undefined,
    };
    // A piped stdin payload is not part of the argv/environment fingerprint.
    const probe = spec.stdio?.stdin === 'pipe' ? undefined
      : gitProbeFailures.begin(remoteCwd, spec.argv, spec.env, spec.signal);
    let handle: SubprocessHandle;
    try {
      handle = originalSpawn.call(subprocess, routed);
    } catch (error) {
      gitProbeFailures.launchFailed(probe, error, spec.signal);
      throw error;
    }
    gitProbeFailures.observe(probe, handle, spec.signal);
    return handle;
  };

  subprocess.spawnTerminal = function (spec: SubprocessTerminalSpawnSpec) {
    const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
    if (remoteCwd === undefined) return originalSpawnTerminal.call(subprocess, spec);
    return originalSpawnTerminal.call(subprocess, {
      ...spec,
      argv: buildRemoteSshInvocation(remoteCwd, spec.argv, spec.env, true, resolveRemotePath),
      cwd: process.cwd(),
      env: undefined,
    });
  };

  return () => {
    detachStatus?.();
    gitProbeFailures.dispose();
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
