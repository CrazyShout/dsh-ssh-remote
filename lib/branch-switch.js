import { GitBranchError, createBranch, redactGitText, searchBranches, switchBranch, } from './git-branches.js';
const ROUTE = '/api/ssh-branches';
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const SEARCH_TIMEOUT_MS = 30_000;
const MUTATION_TIMEOUT_MS = 300_000;
const GIT_ENV = {
    ...Object.fromEntries([
        'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
        'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
        'GIT_CEILING_DIRECTORIES', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE',
        'GIT_REPLACE_REF_BASE', 'GIT_ATTR_SOURCE',
    ].map(key => [key, undefined])),
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1',
    LC_ALL: 'C',
};
const GIT_PREFIX = [
    '--no-optional-locks',
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
];
function response(value, status = 200) {
    return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}
function failure(code, message, status) {
    return response({ ok: false, error: { code, message: redactGitText(message) } }, status);
}
function firstLine(value, fallback) {
    return redactGitText(value.split(/\r?\n/gu).map(line => line.trim()).find(Boolean) ?? fallback);
}
async function requestBody(request) {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
        throw new GitBranchError('BAD_REQUEST', 'The branch request is too large.');
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
        throw new GitBranchError('BAD_REQUEST', 'The branch request is too large.');
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new GitBranchError('BAD_REQUEST', 'The branch request must be valid JSON.');
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new GitBranchError('BAD_REQUEST', 'The branch request must be an object.');
    }
    return value;
}
function createGit(scope, session, cwd, requestSignal, options = {}) {
    const policy = scope.sandboxPolicy.resolve({ session });
    const cancellable = options.cancellable !== false;
    const defaultTimeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
    return async (name, args, allowedExitCodes = [0], configOverrides = {}, timeoutMs = defaultTimeoutMs) => {
        const timeout = new AbortController();
        const timer = setTimeout(() => timeout.abort(new Error(`git ${name} timed out`)), timeoutMs);
        const signal = cancellable && requestSignal !== undefined
            ? AbortSignal.any([requestSignal, timeout.signal])
            : timeout.signal;
        try {
            const program = await scope.subprocess.resolveExecutable('git', undefined, signal);
            const command = [program, ...GIT_PREFIX, ...args];
            const confinedPolicy = policy;
            const argv = policy.mode === 'danger-full-access'
                ? command
                : (await scope.sandbox.confine(command, confinedPolicy, signal)).argv;
            signal.throwIfAborted();
            const overrides = Object.entries(configOverrides);
            const child = scope.subprocess.spawn({
                argv,
                cwd,
                env: {
                    ...GIT_ENV,
                    GIT_CONFIG_COUNT: String(overrides.length),
                    ...Object.fromEntries(overrides.flatMap(([key, value], index) => [
                        [`GIT_CONFIG_KEY_${index}`, key],
                        [`GIT_CONFIG_VALUE_${index}`, value],
                    ])),
                },
                signal,
                graceMs: 1_000,
                stdio: {
                    stdin: 'ignore',
                    stdout: { maxBytes: MAX_OUTPUT_BYTES },
                    stderr: { maxBytes: MAX_OUTPUT_BYTES },
                },
            });
            try {
                const outcome = await child.done;
                signal.throwIfAborted();
                const captured = child.collected;
                const stdout = captured.stdout.readFrom(0);
                const stderr = captured.stderr.readFrom(0);
                if (outcome.exitCode === null || !allowedExitCodes.includes(outcome.exitCode)) {
                    throw new GitBranchError('GIT_FAILED', `git ${name} failed (${outcome.signal ?? outcome.exitCode}): ${firstLine(stderr.text, 'no diagnostic')}`);
                }
                if (stdout.lossy || stderr.lossy) {
                    throw new GitBranchError('GIT_OUTPUT_TOO_LARGE', `git ${name} output exceeded the plugin limit.`);
                }
                return { stdout: stdout.text, stderr: stderr.text, exitCode: outcome.exitCode };
            }
            finally {
                child.terminate();
                await child.waitForExit();
            }
        }
        catch (error) {
            if (timeout.signal.aborted) {
                throw new GitBranchError('GIT_TIMEOUT', `git ${name} timed out after ${Math.ceil(timeoutMs / 1000)}s.`);
            }
            if (error instanceof GitBranchError)
                throw error;
            throw new GitBranchError('GIT_FAILED', `git ${name} failed: ${redactGitText(error instanceof Error ? error.message : String(error))}`);
        }
        finally {
            clearTimeout(timer);
        }
    };
}
function hasStarted(session) {
    const events = session.snapshotEvents();
    for (let index = events.length - 1; index >= 0; index -= 1) {
        if (events[index]?.type === 'turn/start')
            return true;
    }
    return false;
}
async function asMaintenance(scope, session, work) {
    if (hasStarted(session)) {
        throw new GitBranchError('SESSION_STARTED', 'The Session has started, so its branch can no longer change.');
    }
    const agent = scope.agents.get(session.id);
    if (agent === undefined)
        throw new GitBranchError('SESSION_BUSY', 'The Session is not loaded.');
    let claimed = false;
    try {
        return await agent.runMaintenance(async () => {
            claimed = true;
            if (hasStarted(session)) {
                throw new GitBranchError('SESSION_STARTED', 'The Session has started, so its branch can no longer change.');
            }
            return await work();
        });
    }
    catch (error) {
        if (claimed || error instanceof GitBranchError)
            throw error;
        throw new GitBranchError('SESSION_BUSY', 'The Session is busy; the branch cannot change now.', { cause: error });
    }
}
function statusFor(code) {
    if (code === 'BAD_REQUEST' || code === 'INVALID_ACTION' || code === 'INVALID_BRANCH')
        return 400;
    if (code === 'SESSION_NOT_FOUND' || code === 'REF_MISSING')
        return 404;
    if (code === 'READ_ONLY')
        return 403;
    if (code === 'BRANCH_EXISTS')
        return 409;
    return 409;
}
async function handle(scope, request) {
    const payload = await requestBody(request);
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (sessionId.length === 0 || sessionId.length > 512) {
        throw new GitBranchError('BAD_REQUEST', 'A Session id is required.');
    }
    let session;
    try {
        session = await scope.typert.lookups.get('session')?.resolve(sessionId);
    }
    catch (error) {
        throw new GitBranchError('SESSION_NOT_FOUND', 'The Session is no longer available.', { cause: error });
    }
    if (session === undefined || session === null) {
        throw new GitBranchError('SESSION_NOT_FOUND', 'The Session is no longer available.');
    }
    const workingDirectory = scope.workingDirectory;
    const cwd = workingDirectory.get(session);
    const policy = scope.sandboxPolicy.resolve({ session });
    const action = payload.action;
    if (action !== 'search' && action !== 'switch' && action !== 'create') {
        throw new GitBranchError('INVALID_ACTION', 'Unknown branch action.');
    }
    if (action !== 'search' && policy.mode === 'read-only') {
        throw new GitBranchError('READ_ONLY', 'This Session is read-only; branch changes are disabled.');
    }
    if (action === 'search') {
        const git = createGit(scope, session, cwd, request.signal);
        return response({
            ok: true,
            value: await searchBranches(git, {
                query: typeof payload.query === 'string' ? payload.query.slice(0, 200) : '',
                includeRemote: payload.includeRemote === true,
                fetchMissing: payload.fetchMissing === true && payload.includeRemote === true && policy.mode !== 'read-only',
            }),
        });
    }
    const git = createGit(scope, session, cwd, undefined, { cancellable: false, timeoutMs: MUTATION_TIMEOUT_MS });
    if (action === 'switch') {
        return response({
            ok: true,
            value: await asMaintenance(scope, session, () => switchBranch(git, String(payload.ref ?? ''))),
        });
    }
    return response({
        ok: true,
        value: await asMaintenance(scope, session, () => createBranch(git, String(payload.name ?? ''))),
    });
}
/** Mount the authenticated branch request route used by the Forge-compatible picker. */
export function mountBranchSwitchHttp(ctx) {
    const fiber = ctx.inject(['connection', 'typert', 'workingDirectory', 'subprocess', 'sandbox', 'sandboxPolicy', 'agents'], scope => scope.effect(() => scope.connection.fetch.register({
        path: ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
            try {
                return await handle(scope, request);
            }
            catch (error) {
                if (error instanceof GitBranchError)
                    return failure(error.code, error.message, statusFor(error.code));
                return failure('GIT_FAILED', error instanceof Error ? error.message : String(error), 500);
            }
        },
    }), 'SSH branch request route'));
    return async () => { await fiber.dispose(); };
}
//# sourceMappingURL=branch-switch.js.map