import { createHash } from 'node:crypto';
import { parseSshUri } from './types.js';
// Reconnect clears the cache immediately; independent SSH recovery is probed
// after 2s rather than leaving a stale failure in the UI for thirty seconds.
const DEFAULT_COOLDOWN_MS = 2_000;
const MAX_CIRCUITS = 64;
const READ_COMMANDS = new Set(['cat-file', 'describe', 'diff', 'diff-index', 'diff-tree',
    'for-each-ref', 'log', 'ls-files', 'merge-base', 'name-rev', 'rev-list', 'rev-parse', 'show', 'show-ref', 'status']);
const GLOBAL_FLAGS = new Set(['--no-optional-locks', '--no-pager', '--literal-pathspecs',
    '--no-replace-objects', '--no-lazy-fetch', '--icase-pathspecs', '--glob-pathspecs', '--noglob-pathspecs']);
const GLOBAL_VALUES = new Set(['-C', '--git-dir', '--namespace', '--work-tree']);
const ACL_VALUES = new Set(['--workspace', '--temp', '--mode', '--write-sid', '--temp-write-sid']);
const INFRASTRUCTURE_CODES = new Set(['ENOENT', 'EACCES', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    'SUBPROCESS_EXECUTABLE_NOT_FOUND', 'SUBPROCESS_SPAWN_NOT_FOUND', 'SUBPROCESS_SPAWN_FAILED',
    'SUBPROCESS_RUNNER_FAILED', 'SUBPROCESS_RUNNER_IPC_FAILED']);
export class RemoteGitProbeCooldownError extends Error {
    retryAfterMs;
    authority;
    code = 'REMOTE_GIT_PROBE_COOLDOWN';
    constructor(retryAfterMs, authority) {
        super(retryAfterMs > 0
            ? `remote Git probe for ${authority} is suppressed for ${Math.ceil(retryAfterMs / 1000)}s after an SSH or executable failure; retry after the cooldown`
            : `remote Git probe for ${authority}: one recovery check is still running`);
        this.retryAfterMs = retryAfterMs;
        this.authority = authority;
        this.name = 'RemoteGitProbeCooldownError';
    }
}
function commandName(value) {
    // POSIX names are case-sensitive and .exe is a valid literal suffix.
    if (/^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value)) {
        return value.replaceAll('\\', '/').split('/').at(-1).replace(/\.exe$/iu, '').toLowerCase();
    }
    return value.slice(value.lastIndexOf('/') + 1);
}
function sandboxPayload(argv) {
    const executable = commandName(argv[0] ?? '');
    const separator = argv.indexOf('--');
    if (separator < 1)
        return argv;
    if (executable === 'bwrap' || executable === 'sandbox-exec')
        return argv.slice(separator + 1);
    // Only a built Windows runner prefix, never a positional filename or source
    // loader. Runtime routing separately validates the actual sandbox policy.
    if (!/^[A-Za-z]:[\\/]/u.test(argv[0] ?? '') && !/^\\\\/u.test(argv[0] ?? ''))
        return argv;
    if (!/(?:^|\/)dsh-sandbox-windows-acl\/lib\/runner\.js$/u.test((argv[1] ?? '').replaceAll('\\', '/')))
        return argv;
    const seen = new Set();
    for (let i = 2; i < separator; i += 2) {
        const key = argv[i];
        if (!ACL_VALUES.has(key) || seen.has(key) || i + 1 >= separator)
            return argv;
        seen.add(key);
    }
    return argv.slice(separator + 1);
}
/** Conservative classification, not an authorization or sandbox boundary. */
export function isReadOnlyGitProbeArgv(argv) {
    const command = sandboxPayload(argv);
    if (commandName(command[0] ?? '') !== 'git')
        return false;
    let i = 1;
    for (; i < command.length && command[i].startsWith('-'); i++) {
        const value = command[i];
        if (GLOBAL_FLAGS.has(value))
            continue;
        if (GLOBAL_VALUES.has(value)) {
            if (command[++i] === undefined)
                return false;
            continue;
        }
        if (/^(?:--git-dir|--namespace|--work-tree)=.+/u.test(value) || /^-C.+/u.test(value))
            continue;
        // Unknown config can replace aliases or execute external helpers.
        if (value === '-c' && /^(?:core\.quotePath=(?:true|false)|color\.ui=(?:false|never))$/u.test(command[i + 1] ?? '')) {
            i++;
            continue;
        }
        return false;
    }
    const name = command[i++], args = command.slice(i);
    // Git accepts unique long-option abbreviations, e.g. --out=report.patch.
    if (args.some(value => (value.startsWith('--') && '--output'.startsWith(value.split('=')[0]))
        || value === '--ext-diff' || value === '--textconv'))
        return false;
    if (name !== undefined && READ_COMMANDS.has(name))
        return true;
    if (name === 'symbolic-ref') {
        const flags = new Set(['-q', '--quiet', '--short', '--recurse', '--no-recurse']);
        const values = args.filter(value => !flags.has(value));
        return values.length === 1 && !values[0].startsWith('-');
    }
    if (name === 'config') {
        const flags = new Set(['--null', '-z', '--name-only', '--show-origin', '--show-scope', '--includes', '--no-includes']);
        let index = 0;
        while (flags.has(args[index] ?? ''))
            index++;
        const query = args[index++], values = args.slice(index);
        if (values.some(value => value.startsWith('-')))
            return false;
        if (query === '--list' || query === '-l')
            return values.length === 0;
        return ['--get', '--get-all', '--get-regexp'].includes(query ?? '') && values.length >= 1 && values.length <= 2;
    }
    if (name === 'hash-object') {
        for (let index = 0; index < args.length; index++) {
            const value = args[index];
            if (value === '--')
                return true;
            if (value === '-t') {
                if (args[++index] === undefined)
                    return false;
                continue;
            }
            if (['--stdin', '--stdin-paths', '--no-filters', '--literally'].includes(value) || value.startsWith('--path='))
                continue;
            if (value.startsWith('-'))
                return false;
        }
        return true;
    }
    if (name !== 'remote')
        return false;
    if (args.length === 0 || args.every(value => value === '-v' || value === '--verbose'))
        return true;
    return ['show', 'get-url'].includes(args[0] ?? '');
}
function isCancellationError(error, signal) {
    if (signal?.aborted)
        return true;
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR';
}
export function isInfrastructureFailureError(error, signal) {
    if (isCancellationError(error, signal) || !error || typeof error !== 'object')
        return false;
    return INFRASTRUCTURE_CODES.has(String(error.code));
}
function ready(status) { return status.state === 'connected' || status.state === 'degraded'; }
function connectionStamp(status) {
    return JSON.stringify([status?.sessionId, status?.lastConnectedAt, status?.helperSha256]);
}
/** Bounded negative cache for identical probes; never a host-wide failure flag. */
export class RemoteGitProbeFailureCircuit {
    cooldownMs;
    now;
    status;
    circuits = new Map();
    disposed = false;
    constructor(cooldownMs = DEFAULT_COOLDOWN_MS, now = () => performance.now(), status) {
        this.cooldownMs = cooldownMs;
        this.now = now;
        this.status = status;
        if (!Number.isFinite(cooldownMs) || cooldownMs <= 0)
            throw new Error('Git probe cooldown must be positive');
    }
    begin(cwd, argv, env, signal) {
        if (this.disposed || signal?.aborted || !isReadOnlyGitProbeArgv(argv))
            return undefined;
        const uri = parseSshUri(cwd);
        const key = createHash('sha256').update(JSON.stringify([cwd, argv,
            Object.entries(env ?? {}).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)),
        ])).digest('hex');
        let entry = this.circuits.get(key);
        if (entry === undefined) {
            const alias = uri.user === '' && uri.port === 22 ? uri.host : undefined;
            const status = alias === undefined ? undefined : this.status?.(alias);
            entry = { authority: `${uri.user ? uri.user + '@' : ''}${uri.host}:${uri.port}`, alias,
                connectionStamp: connectionStamp(status), awaitingRecovery: status !== undefined && !ready(status), sequence: 0, settled: 0 };
        }
        // Evicted entries cannot mutate replacement state on late completion.
        this.circuits.delete(key);
        this.circuits.set(key, entry);
        if (this.circuits.size > MAX_CIRCUITS)
            this.circuits.delete(this.circuits.keys().next().value);
        const remaining = (entry.until ?? 0) - this.now();
        if (entry.retry !== undefined || remaining > 0)
            throw new RemoteGitProbeCooldownError(Math.max(0, remaining), entry.authority);
        const id = ++entry.sequence;
        if (entry.until !== undefined)
            entry.retry = id;
        const current = entry;
        let finished = false;
        return result => {
            if (finished || this.disposed || this.circuits.get(key) !== current)
                return;
            finished = true;
            if (current.retry === id)
                current.retry = undefined;
            if (result === 'ignore' || id < current.settled || (current.retry !== undefined && id < current.retry))
                return;
            current.settled = id;
            if (result === 'healthy')
                current.until = undefined;
            else if (current.until === undefined || current.until <= this.now())
                current.until = this.now() + this.cooldownMs;
        };
    }
    observe(finish, handle, signal) {
        if (finish === undefined)
            return;
        void handle.done.then(outcome => {
            if (signal?.aborted || outcome.signal !== null || outcome.exitCode === null)
                finish('ignore');
            else
                finish(outcome.exitCode === 127 || outcome.exitCode === 255 ? 'open' : 'healthy');
        }, error => finish(isInfrastructureFailureError(error, signal) ? 'open' : 'ignore'));
    }
    launchFailed(finish, error, signal) {
        finish?.(isInfrastructureFailureError(error, signal) ? 'open' : 'ignore');
    }
    connectionChanged(status) {
        for (const [key, entry] of this.circuits) {
            if (entry.alias !== status.alias)
                continue;
            if (!ready(status))
                entry.awaitingRecovery = true;
            else if (entry.awaitingRecovery || entry.connectionStamp !== connectionStamp(status))
                this.circuits.delete(key);
        }
    }
    dispose() { this.disposed = true; this.circuits.clear(); }
}
//# sourceMappingURL=git-probe-circuit.js.map