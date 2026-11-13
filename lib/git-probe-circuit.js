import { parseSshUri } from './types.js';
const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_OPEN_CIRCUITS = 64;
const READ_ONLY_GIT_COMMANDS = new Set([
    'cat-file',
    'describe',
    'diff',
    'diff-index',
    'diff-tree',
    'for-each-ref',
    'log',
    'ls-files',
    'merge-base',
    'name-rev',
    'rev-list',
    'rev-parse',
    'show',
    'show-ref',
    'status',
    'symbolic-ref',
]);
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--namespace', '--work-tree']);
export class RemoteGitProbeCooldownError extends Error {
    retryAfterMs;
    authority;
    code = 'REMOTE_GIT_PROBE_COOLDOWN';
    constructor(retryAfterMs, authority) {
        super(`remote Git probe for ${authority} is suppressed for ${Math.ceil(retryAfterMs / 1000)}s after an SSH or executable failure`);
        this.retryAfterMs = retryAfterMs;
        this.authority = authority;
        this.name = 'RemoteGitProbeCooldownError';
    }
}
function normalizedPath(value) {
    return value.replaceAll('\\', '/');
}
function commandName(value) {
    const normalized = normalizedPath(value);
    return normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.exe$/iu, '').toLowerCase();
}
function sandboxPayload(argv) {
    const separator = argv.indexOf('--');
    if (separator < 1)
        return argv;
    const executable = commandName(argv[0] ?? '');
    const runner = ['bwrap', 'sandbox-exec'].includes(executable) || argv.slice(0, separator).some(value => /(?:^|\/)dsh-sandbox-(?:windows-acl|local)\/(?:lib|src)\/runner\.[cm]?[jt]s$/u.test(normalizedPath(value)));
    return runner ? argv.slice(separator + 1) : argv;
}
function gitSubcommand(args) {
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        if (value === '--')
            return undefined;
        if (value === undefined)
            return undefined;
        if (GIT_VALUE_OPTIONS.has(value)) {
            index += 1;
            continue;
        }
        if (value.startsWith('-'))
            continue;
        return { index, name: value.toLowerCase() };
    }
    return undefined;
}
/** Whether an argv is a read-only Git probe used by Forge and status panels. */
export function isReadOnlyGitProbeArgv(argv) {
    const command = sandboxPayload(argv);
    const executable = command[0];
    if (executable === undefined || commandName(executable) !== 'git')
        return false;
    const args = command.slice(1);
    const subcommand = gitSubcommand(args);
    if (subcommand === undefined)
        return false;
    if (READ_ONLY_GIT_COMMANDS.has(subcommand.name))
        return true;
    const operationArgs = args.slice(subcommand.index + 1).map(value => value.toLowerCase());
    if (subcommand.name === 'config') {
        const query = operationArgs.some(value => ['--get', '--get-all', '--get-regexp', '--list', '-l'].includes(value));
        return query && !operationArgs.some(value => ['--add', '--replace-all', '--unset', '--unset-all', '--rename-section', '--remove-section'].includes(value));
    }
    if (subcommand.name === 'hash-object')
        return !operationArgs.some(value => value === '-w' || value === '--write');
    if (subcommand.name !== 'remote')
        return false;
    if (operationArgs.length === 0)
        return true;
    if (operationArgs[0] === 'show' || operationArgs[0] === 'get-url')
        return true;
    return operationArgs.every(value => value === '-v' || value === '--verbose');
}
function authorityOf(cwd) {
    const uri = parseSshUri(cwd);
    return `${uri.user ? `${uri.user}@` : ''}${uri.host}:${uri.port}`;
}
function isCancellationError(error, signal) {
    if (signal?.aborted === true)
        return true;
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR';
}
/** Whether a launch or completion rejection is an SSH/provider failure rather than cancellation. */
export function isInfrastructureFailureError(error, signal) {
    if (isCancellationError(error, signal))
        return false;
    if (!error || typeof error !== 'object')
        return false;
    const code = error.code;
    if (typeof code !== 'string')
        return false;
    return code === 'ENOENT'
        || code === 'EACCES'
        || code === 'ECONNRESET'
        || code === 'EPIPE'
        || code === 'SUBPROCESS_EXECUTABLE_NOT_FOUND'
        || code === 'SUBPROCESS_SPAWN_NOT_FOUND'
        || code === 'SUBPROCESS_SPAWN_FAILED'
        || code === 'SUBPROCESS_RUNNER_FAILED'
        || code === 'SUBPROCESS_RUNNER_IPC_FAILED';
}
function probeResult(handle, signal) {
    return handle.done.then((outcome) => {
        if (outcome.exitCode === 127 || outcome.exitCode === 255)
            return 'open';
        if (outcome.signal !== null || outcome.exitCode === null)
            return 'ignore';
        return 'healthy';
    }, error => isInfrastructureFailureError(error, signal) ? 'open' : 'ignore');
}
/** Suppress repeated remote read-only Git probes after a host-level failure. */
export class RemoteGitProbeFailureCircuit {
    cooldownMs;
    now;
    failures = new Map();
    constructor(cooldownMs = DEFAULT_COOLDOWN_MS, now = Date.now) {
        this.cooldownMs = cooldownMs;
        this.now = now;
        if (!Number.isFinite(cooldownMs) || cooldownMs <= 0)
            throw new Error('Git probe cooldown must be positive');
    }
    /** Throw a short stable error instead of starting another failing SSH command. */
    assertAllowed(cwd, argv) {
        if (!isReadOnlyGitProbeArgv(argv))
            return;
        const authority = authorityOf(cwd);
        const failure = this.failures.get(authority);
        if (failure === undefined)
            return;
        const remaining = failure.until - this.now();
        if (remaining > 0)
            throw new RemoteGitProbeCooldownError(remaining, authority);
        this.failures.delete(authority);
    }
    /** Open the host circuit after a synchronous process launch failure. */
    recordFailure(cwd, argv) {
        if (!isReadOnlyGitProbeArgv(argv))
            return;
        const authority = authorityOf(cwd);
        const openedAt = this.now();
        this.failures.set(authority, { openedAt, until: openedAt + this.cooldownMs });
        this.prune();
    }
    /** Open the host circuit only for infrastructure-level failures. */
    observe(cwd, argv, handle, signal) {
        if (!isReadOnlyGitProbeArgv(argv))
            return;
        const authority = authorityOf(cwd);
        void probeResult(handle, signal).then((result) => {
            if (result === 'open')
                this.recordFailure(cwd, argv);
            else if (result === 'healthy')
                this.failures.delete(authority);
        }).catch(() => { });
    }
    prune() {
        if (this.failures.size <= MAX_OPEN_CIRCUITS)
            return;
        const oldest = [...this.failures.entries()]
            .sort((left, right) => left[1].openedAt - right[1].openedAt)
            .slice(0, this.failures.size - MAX_OPEN_CIRCUITS);
        for (const [authority] of oldest)
            this.failures.delete(authority);
    }
}
//# sourceMappingURL=git-probe-circuit.js.map