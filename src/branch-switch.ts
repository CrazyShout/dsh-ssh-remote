import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-client-connection';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type { ShellExecSpec, ShellExecution } from '@deepseek-ai/dsh-shell';
import { posix } from 'node:path';
import { formatSshUri, parseSshUri } from './types.js';
import { quotePosix } from './ssh-command.js';
import {
  GitBranchError,
  createBranch,
  redactGitText,
  searchBranches,
  switchBranch,
  type GitRunner,
} from './git-branches.js';

const ROUTE = '/api/ssh-branches';
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const SEARCH_TIMEOUT_MS = 30_000;
const MUTATION_TIMEOUT_MS = 300_000;
const UNSET_GIT_ENV = [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT',
    'GIT_CEILING_DIRECTORIES', 'GIT_PREFIX', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE',
    'GIT_REPLACE_REF_BASE', 'GIT_ATTR_SOURCE',
] as const;
const GIT_ENV = {
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

interface BranchWorkingDirectory {
  get(session: Session): string;
}

interface BranchRequest {
  sessionId?: unknown;
  action?: unknown;
  query?: unknown;
  includeRemote?: unknown;
  discoverRemote?: unknown;
  ref?: unknown;
  name?: unknown;
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

function failure(code: string, message: string, status: number): Response {
  return response({ ok: false, error: { code, message: redactGitText(message) } }, status);
}

function firstLine(value: string, fallback: string): string {
  return redactGitText(value.split(/\r?\n/gu).map(line => line.trim()).find(Boolean) ?? fallback);
}

async function requestBody(request: Request): Promise<BranchRequest> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new GitBranchError('BAD_REQUEST', 'The branch request is too large.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new GitBranchError('BAD_REQUEST', 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        throw new GitBranchError('BAD_REQUEST', 'The branch request is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString('utf8');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GitBranchError('BAD_REQUEST', 'The branch request must be valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GitBranchError('BAD_REQUEST', 'The branch request must be an object.');
  }
  return value as BranchRequest;
}

interface RemoteBranchRuntime {
  resolve(path: string): string | undefined;
  execute(uri: string, spec: ShellExecSpec): Promise<ShellExecution>;
}

function createGit(runtime: RemoteBranchRuntime, uri: string, policy: ShellExecSpec['sandboxPolicy'],
  signal: AbortSignal, timeout: number): GitRunner {
  return async (name, args, allowed = [0], overrides = {}, timeoutMs = timeout) => {
    signal.throwIfAborted();
    const argv = ['env', ...UNSET_GIT_ENV.flatMap(key => ['-u', key]), 'git', ...GIT_PREFIX,
      ...Object.entries(overrides).flatMap(([key, value]) => ['-c', `${key}=${value}`]), ...args];
    const child = await runtime.execute(uri, {
      command: 'exec ' + argv.map(quotePosix).join(' '), workdir: uri, sandboxPolicy: policy,
      env: GIT_ENV, signal, timeoutMs, onExpiry: 'kill', stdoutMaxBytes: MAX_OUTPUT_BYTES,
    });
    const result = await child.result();
    signal.throwIfAborted();
    if (result.timedOut) throw new GitBranchError('GIT_TIMEOUT', `git ${name} timed out.`);
    if (result.aborted || result.exitCode === null || !allowed.includes(result.exitCode))
      throw new GitBranchError('GIT_FAILED', `git ${name}: ${firstLine(result.stderr.text, 'command did not complete')}`);
    if (result.stdout.truncated || result.stderr.truncated) throw new GitBranchError('GIT_OUTPUT_TOO_LARGE', `git ${name} output exceeded the limit.`);
    return { stdout: result.stdout.text, stderr: result.stderr.text, exitCode: result.exitCode };
  };
}

function hasStarted(session: Session): boolean {
  const events = session.snapshotEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === 'turn/start') return true;
  }
  return false;
}

async function asMaintenance<T>(scope: Context, session: Session, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (hasStarted(session)) {
    throw new GitBranchError('SESSION_STARTED', 'The Session has started, so its branch can no longer change.');
  }
  const agent = scope.agents.get(session.id);
  if (agent === undefined) throw new GitBranchError('SESSION_BUSY', 'The Session is not loaded.');
  let claimed = false;
  try {
    return await agent.runMaintenance(async (signal) => {
      claimed = true;
      if (hasStarted(session)) {
        throw new GitBranchError('SESSION_STARTED', 'The Session has started, so its branch can no longer change.');
      }
      return await work(signal);
    });
  } catch (error) {
    if (claimed || error instanceof GitBranchError) throw error;
    throw new GitBranchError('SESSION_BUSY', 'The Session is busy; the branch cannot change now.', { cause: error });
  }
}

function statusFor(code: string): number {
  if (code === 'BAD_REQUEST' || code === 'INVALID_ACTION' || code === 'INVALID_BRANCH') return 400;
  if (code === 'SESSION_NOT_FOUND' || code === 'REF_MISSING') return 404;
  if (code === 'READ_ONLY' || code === 'NOT_REMOTE') return 403;
  if (code === 'BRANCH_EXISTS') return 409;
  return 409;
}

async function handle(scope: Context, request: Request, runtime: RemoteBranchRuntime, mutations: Set<string>, lifetime: AbortSignal): Promise<Response> {
  const payload = await requestBody(request);
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
  if (sessionId.length === 0 || sessionId.length > 512) {
    throw new GitBranchError('BAD_REQUEST', 'A Session id is required.');
  }
  let session: Session | null | undefined;
  try {
    session = await scope.typert.lookups.get('session')?.resolve(sessionId as SessionId) as Session | null | undefined;
  } catch (error) {
    throw new GitBranchError('SESSION_NOT_FOUND', 'The Session is no longer available.', { cause: error });
  }
  if (session === undefined || session === null) {
    throw new GitBranchError('SESSION_NOT_FOUND', 'The Session is no longer available.');
  }
  const workingDirectory = (scope as Context & { workingDirectory: BranchWorkingDirectory }).workingDirectory;
  const cwd = workingDirectory.get(session);
  const origin = session.header.cwd && runtime.resolve(session.header.cwd);
  const target = runtime.resolve(cwd);
  if (!origin || !target) throw new GitBranchError('NOT_REMOTE', 'Open an SSH workspace to use remote branches.');
  const root = parseSshUri(origin), dir = parseSshUri(target);
  const rel = posix.relative(root.path, dir.path);
  if (formatSshUri({ ...dir, path: root.path }) !== origin || rel === '..' || rel.startsWith('../'))
    throw new GitBranchError('NOT_REMOTE', 'The working directory is outside the SSH workspace.');
  const policy = scope.sandboxPolicy.resolve({ session });
  const action = payload.action;
  if (action !== 'search' && action !== 'switch' && action !== 'create') {
    throw new GitBranchError('INVALID_ACTION', 'Unknown branch action.');
  }
  if (action !== 'search' && policy.mode === 'read-only') {
    throw new GitBranchError('READ_ONLY', 'This Session is read-only; branch changes are disabled.');
  }
  if (action === 'search') {
    const git = createGit(runtime, target, policy, AbortSignal.any([request.signal, lifetime]), SEARCH_TIMEOUT_MS);
    return response({
      ok: true,
      value: await searchBranches(git, {
        query: typeof payload.query === 'string' ? payload.query.slice(0, 200) : '',
        includeRemote: payload.includeRemote === true,
        discoverRemote: payload.discoverRemote === true && payload.includeRemote === true,
      }),
    });
  }
  const value = await asMaintenance(scope, session, async maintenanceSignal => {
    const currentPolicy = scope.sandboxPolicy.resolve({ session });
    if (currentPolicy.mode === 'read-only') throw new GitBranchError('READ_ONLY', 'This Session is read-only.');
    if (workingDirectory.get(session) !== cwd) throw new GitBranchError('CWD_CHANGED', 'Working directory changed. Reopen the picker.');
    const signal = AbortSignal.any([maintenanceSignal, lifetime]);
    const git = createGit(runtime, target, currentPolicy, signal, MUTATION_TIMEOUT_MS);
    const top = (await git('rev-parse', ['rev-parse', '--show-toplevel'])).stdout.replace(/\n$/u, '');
    const repoRel = posix.relative(root.path, top);
    if (repoRel === '..' || repoRel.startsWith('../')) throw new GitBranchError('NOT_REMOTE', 'Open the Git root as the SSH workspace before changing branches.');
    if (!posix.isAbsolute(top)) throw new GitBranchError('GIT_FAILED', 'Cannot identify Git worktree.');
    const key = formatSshUri({ ...dir, path: top });
    if (mutations.has(key)) throw new GitBranchError('SESSION_BUSY', 'Another branch operation is in progress in this worktree.');
    mutations.add(key);
    try {
      return action === 'switch' ? await switchBranch(git, String(payload.ref ?? '')) : await createBranch(git, String(payload.name ?? ''));
    } finally { mutations.delete(key); }
  });
  return response({ ok: true, value });
}

/** Mount the authenticated branch request route used by the Forge-compatible picker. */
export function mountBranchSwitchHttp(ctx: Context, runtime: RemoteBranchRuntime): () => Promise<void> {
  const mutations = new Set<string>();
  const lifetime = new AbortController();
  const fiber = ctx.inject(
    ['connection', 'typert', 'workingDirectory', 'sandboxPolicy', 'agents'],
    scope => scope.effect(() => scope.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'streaming',
      fetch: async (request) => {
        try {
          return await handle(scope, request, runtime, mutations, lifetime.signal);
        } catch (error) {
          if (error instanceof GitBranchError) return failure(error.code, error.message, statusFor(error.code));
          return failure('GIT_FAILED', error instanceof Error ? error.message : String(error), 500);
        }
      },
    }), 'SSH branch request route'),
  );
  return async () => { lifetime.abort(); await fiber.dispose(); };
}
