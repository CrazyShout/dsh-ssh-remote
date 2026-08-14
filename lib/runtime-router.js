import { createRemoteFileSystemAdapter } from './fs.js';
import { parseSshUri } from './types.js';
function isSshPath(value) {
    return typeof value === 'string' && value.startsWith('ssh://');
}
function isSshTarget(value) {
    if (!value || typeof value !== 'object')
        return false;
    return isSshPath(String(value.targetKey ?? ''));
}
/**
 * Add exact SSH URI routing to DSH's filesystem service. Local paths always
 * call the original provider; only direct SSH URIs and paths beneath a
 * persisted remote Workspace anchor use SFTP.
 */
export function installRemoteFileSystemRouter(fs, connections, resolveRemotePath) {
    const remote = createRemoteFileSystemAdapter(connections);
    const originals = new Map();
    const remember = (name) => {
        const original = fs[name];
        if (typeof original !== 'function')
            throw new Error(`ctx.fs.${name} is unavailable`);
        originals.set(name, original);
        return original;
    };
    const asRemotePath = (path) => {
        if (path === undefined)
            return undefined;
        return isSshPath(path) ? path : resolveRemotePath(path);
    };
    const originalResolve = remember('resolve');
    fs.resolve = (path, opts) => {
        const remoteCwd = asRemotePath(opts?.cwd);
        const remotePath = asRemotePath(path);
        if (remoteCwd !== undefined) {
            return remote.resolve(remotePath ?? path, { ...opts, cwd: remoteCwd });
        }
        if (remotePath !== undefined)
            return remote.resolve(remotePath, opts);
        return originalResolve.call(fs, path, opts);
    };
    const originalLstat = remember('lstat');
    fs.lstat = (path, opts, signal) => {
        const remoteCwd = asRemotePath(opts?.cwd);
        const remotePath = asRemotePath(path);
        if (remoteCwd !== undefined) {
            return remote.lstat(remotePath ?? path, { ...opts, cwd: remoteCwd }, signal);
        }
        if (remotePath !== undefined)
            return remote.lstat(remotePath, opts, signal);
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
        fs[name] = (...args) => isSshTarget(args[0])
            ? remote[name](...args)
            : original.call(fs, ...args);
    }
    const originalContains = remember('contains');
    fs.contains = (parent, child) => {
        const parentRemote = isSshTarget(parent);
        const childRemote = isSshTarget(child);
        if (parentRemote !== childRemote)
            return false;
        return parentRemote
            ? remote.contains(parent, child)
            : originalContains.call(fs, parent, child);
    };
    return () => {
        for (const [name, original] of originals) {
            fs[name] = original;
        }
    };
}
function shellQuote(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
/** Build the local OpenSSH argv used for a remote process or terminal. */
export function buildRemoteSshInvocation(cwd, argv, env, terminal) {
    if (argv.length === 0)
        throw new Error('remote subprocess argv is empty');
    const uri = parseSshUri(cwd);
    const destination = `${uri.user ? `${uri.user}@` : ''}${uri.host}`;
    const environment = Object.entries(env ?? {})
        .filter((entry) => entry[1] !== undefined)
        .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        .map(([key, value]) => shellQuote(`${key}=${value}`));
    const command = argv.map(shellQuote);
    const exec = environment.length > 0
        ? `exec env ${environment.join(' ')} ${command.join(' ')}`
        : `exec ${command.join(' ')}`;
    const script = `cd ${shellQuote(uri.path)} && ${exec}`;
    const args = ['ssh', terminal ? '-tt' : '-T'];
    // Port 22 stays absent so an alias-specific Port from ~/.ssh/config wins.
    if (uri.port !== 22)
        args.push('-p', String(uri.port));
    args.push(destination, '--', `sh -lc ${shellQuote(script)}`);
    return args;
}
/**
 * Route process execution by Workspace cwd. The stock local provider still
 * owns stream collection, PTY behavior, cancellation and teardown; for a
 * mapped cwd its managed child is the system OpenSSH client.
 */
export function installRemoteSubprocessRouter(subprocess, resolveRemotePath) {
    const originalSpawn = subprocess.spawn;
    const originalSpawnTerminal = subprocess.spawnTerminal;
    subprocess.spawn = function (spec) {
        const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
        if (remoteCwd === undefined)
            return originalSpawn.call(subprocess, spec);
        return originalSpawn.call(subprocess, {
            ...spec,
            argv: buildRemoteSshInvocation(remoteCwd, spec.argv, spec.env, false),
            cwd: process.cwd(),
            env: undefined,
        });
    };
    subprocess.spawnTerminal = function (spec) {
        const remoteCwd = isSshPath(spec.cwd) ? spec.cwd : resolveRemotePath(spec.cwd);
        if (remoteCwd === undefined)
            return originalSpawnTerminal.call(subprocess, spec);
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
//# sourceMappingURL=runtime-router.js.map