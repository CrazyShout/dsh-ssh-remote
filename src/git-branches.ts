import type { BranchListing, BranchMutation, RemoteBranch } from '../shared/branch-switch.js';

const DEFAULT_LIMIT = 300;
const FETCH_MATCH_LIMIT = 20;
const LOCAL_PREFIX = 'refs/heads/';
const REMOTE_PREFIX = 'refs/remotes/';

/** Complete output of one Git command that exited with an allowed code. */
export interface GitOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs one Git subcommand with optional command-local configuration. */
export type GitRunner = (
  name: string,
  args: readonly string[],
  allowedExitCodes?: readonly number[],
  configOverrides?: Readonly<Record<string, string>>,
  timeoutMs?: number,
) => Promise<GitOutput>;

/** Stable branch operation failure shown by the Client. */
export class GitBranchError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitBranchError';
  }
}

/** Redact credentials that a remote URL may echo in a Git diagnostic. */
export function redactGitText(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/giu, '$1[REDACTED]@')
    .replace(/(?:ghp|github_pat|x-access-token)[_A-Za-z0-9-]*/gu, '[REDACTED]');
}

function diagnostic(output: string, fallback: string): string {
  const line = output.split(/\r?\n/gu).map(value => value.trim()).find(Boolean);
  return redactGitText(line || fallback);
}

function lines(value: string): string[] {
  return value.split(/\r?\n/gu).map(line => line.trim()).filter(Boolean);
}

function matches(value: string, query: string): boolean {
  return query.length === 0 || value.toLowerCase().includes(query.toLowerCase());
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function localName(ref: string): string | undefined {
  return ref.startsWith(LOCAL_PREFIX) ? ref.slice(LOCAL_PREFIX.length) : undefined;
}

function remoteParts(ref: string): { remote: string; branch: string } | undefined {
  if (!ref.startsWith(REMOTE_PREFIX)) return undefined;
  const value = ref.slice(REMOTE_PREFIX.length);
  const separator = value.indexOf('/');
  if (separator < 1 || separator === value.length - 1) return undefined;
  return { remote: value.slice(0, separator), branch: value.slice(separator + 1) };
}

function safeRemoteName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
}

function safeBranchName(value: string): boolean {
  return value.length > 0 && !value.startsWith('-') && !/[\0\r\n]/u.test(value);
}

function parseRefLines(output: string): string[] {
  return lines(output).flatMap((line) => {
    const [ref, symref = ''] = line.split('\t');
    return ref === undefined || symref.length > 0 ? [] : [ref];
  });
}

function parseRemoteHeads(output: string): Array<{ ref: string; branch: string }> {
  return lines(output).flatMap((line) => {
    const separator = line.indexOf('\t');
    if (separator < 0) return [];
    const ref = line.slice(separator + 1);
    if (!ref.startsWith(LOCAL_PREFIX)) return [];
    return [{ ref, branch: ref.slice(LOCAL_PREFIX.length) }];
  });
}

async function refExists(git: GitRunner, ref: string): Promise<boolean> {
  const result = await git('show-ref', ['show-ref', '--verify', '--quiet', ref], [0, 1]);
  return result.exitCode === 0;
}

async function checkout(git: GitRunner): Promise<{ current: string | null; commit: string | null }> {
  const branch = await git('symbolic-ref', ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1]);
  const commit = await git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128]);
  return {
    current: branch.exitCode === 0 ? (lines(branch.stdout)[0] ?? null) : null,
    commit: commit.exitCode === 0 ? (lines(commit.stdout)[0] ?? null) : null,
  };
}

async function readRefs(git: GitRunner): Promise<{ localRefs: string[]; remoteRefs: string[] }> {
  const locals = await git('for-each-ref', [
    'for-each-ref', '--sort=-committerdate', '--count=500',
    '--format=%(refname)%09%(symref)', 'refs/heads/',
  ]);
  const remotes = await git('for-each-ref', [
    'for-each-ref', '--sort=-committerdate', '--count=500',
    '--format=%(refname)%09%(symref)', 'refs/remotes/',
  ]);
  return {
    localRefs: parseRefLines(locals.stdout).filter(ref => localName(ref) !== undefined),
    remoteRefs: parseRefLines(remotes.stdout).filter(ref => remoteParts(ref) !== undefined),
  };
}

/** Build the browser payload from the current branch and Git ref names. */
export function branchPayload(
  current: string | null,
  commit: string | null,
  localRefs: readonly string[],
  remoteRefs: readonly string[],
  limit = DEFAULT_LIMIT,
): Omit<BranchListing, 'fetched' | 'warning'> {
  const discovered = unique(localRefs.map(localName).filter((name): name is string => name !== undefined));
  const local = current === null ? discovered : [current, ...discovered.filter(name => name !== current)];
  const localSet = new Set(local);
  const remote: RemoteBranch[] = [];
  const seen = new Set<string>();
  for (const ref of remoteRefs) {
    const parts = remoteParts(ref);
    if (parts === undefined || localSet.has(parts.branch)) continue;
    const name = `${parts.remote}/${parts.branch}`;
    if (seen.has(name)) continue;
    seen.add(name);
    remote.push({ ref, ...parts, name });
  }
  return {
    current,
    commit,
    local: local.slice(0, limit),
    remote: remote.slice(0, limit),
  };
}

async function readState(git: GitRunner, limit: number): Promise<Omit<BranchListing, 'fetched' | 'warning'>> {
  const head = await checkout(git);
  const refs = await readRefs(git);
  return branchPayload(head.current, head.commit, refs.localRefs, refs.remoteRefs, limit);
}

async function remotesInPreferenceOrder(git: GitRunner): Promise<string[]> {
  const result = await git('remote', ['remote']);
  return unique(lines(result.stdout)).filter(safeRemoteName).sort((left, right) => {
    const rank = (name: string) => name === 'origin' ? 0 : name === 'upstream' ? 1 : 2;
    return rank(left) - rank(right) || left.localeCompare(right);
  });
}

async function fetchMatchingRemoteBranches(git: GitRunner, query: string): Promise<{ fetched: string[]; warning: string }> {
  const warnings: string[] = [];
  for (const remote of await remotesInPreferenceOrder(git)) {
    let listed: GitOutput;
    try {
      listed = await git('ls-remote', ['ls-remote', '--heads', '--', remote], [0, 128], undefined, 20_000);
    } catch (error) {
      warnings.push(`${remote}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (listed.exitCode !== 0) {
      warnings.push(`${remote}: ${diagnostic(listed.stderr, 'git ls-remote failed')}`);
      continue;
    }
    const branches = parseRemoteHeads(listed.stdout)
      .filter(item => matches(item.branch, query))
      .slice(0, FETCH_MATCH_LIMIT);
    if (branches.length === 0) continue;
    const refspecs = branches.map(item => `+${item.ref}:${REMOTE_PREFIX}${remote}/${item.branch}`);
    try {
      await git('fetch', ['fetch', '--no-tags', remote, ...refspecs], [0], undefined, 120_000);
      return { fetched: branches.map(item => `${remote}/${item.branch}`), warning: redactGitText(warnings.join('; ')) };
    } catch (error) {
      warnings.push(`${remote}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { fetched: [], warning: redactGitText(warnings.join('; ')) };
}

/**
 * Search local branches first. When no local branch matches, ask the preferred
 * remote and fetch only matching heads into remote-tracking namespaces.
 */
export async function searchBranches(
  git: GitRunner,
  { query = '', fetchMissing = false, limit = DEFAULT_LIMIT }: {
    query?: string;
    fetchMissing?: boolean;
    limit?: number;
  } = {},
): Promise<BranchListing> {
  const normalized = query.trim();
  let state = await readState(git, limit);
  let fetched: string[] = [];
  let warning = '';
  const hasLocalMatch = state.local.some(name => matches(name, normalized));
  if (fetchMissing && normalized.length >= 2 && !hasLocalMatch) {
    const result = await fetchMatchingRemoteBranches(git, normalized);
    fetched = result.fetched;
    warning = result.warning;
    if (fetched.length > 0) state = await readState(git, limit);
  }
  return {
    ...state,
    local: state.local.filter(name => matches(name, normalized)),
    remote: state.remote.filter(item => matches(item.name, normalized)),
    fetched,
    warning,
  };
}

/** Switch to one verified local branch, or create a local tracking branch from a remote ref. */
export async function switchBranch(git: GitRunner, ref: string): Promise<BranchMutation> {
  if (!ref || /[\0\r\n]/u.test(ref)) throw new GitBranchError('INVALID_BRANCH', 'A branch ref is required.');
  if (!(await refExists(git, ref))) throw new GitBranchError('REF_MISSING', `Branch ref does not exist: ${ref}`);
  const local = localName(ref);
  if (local !== undefined) {
    if (!safeBranchName(local)) throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${local}`);
    const before = await checkout(git);
    if (before.current === local) return { ...before, message: '' };
    const switched = await git('switch', ['switch', local]);
    return { ...(await checkout(git)), message: diagnostic(switched.stderr, `Switched to ${local}.`) };
  }
  const remote = remoteParts(ref);
  if (remote === undefined) throw new GitBranchError('INVALID_BRANCH', `Unsupported branch ref: ${ref}`);
  if (!safeBranchName(remote.branch)) {
    throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${remote.branch}`);
  }
  const existing = await refExists(git, `${LOCAL_PREFIX}${remote.branch}`);
  const switched = existing
    ? await git('switch', ['switch', remote.branch])
    : await git('switch', ['switch', '--track', '-c', remote.branch, ref]);
  return { ...(await checkout(git)), message: diagnostic(switched.stderr, `Switched to ${remote.branch}.`) };
}

/** Create a new local branch from HEAD and switch to it. */
export async function createBranch(git: GitRunner, name: string): Promise<BranchMutation> {
  if (!safeBranchName(name)) throw new GitBranchError('INVALID_BRANCH', 'A valid branch name is required.');
  const checked = await git('check-ref-format', ['check-ref-format', '--branch', name], [0, 1]);
  if (checked.exitCode !== 0) throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${name}`);
  if (await refExists(git, `${LOCAL_PREFIX}${name}`)) {
    throw new GitBranchError('BRANCH_EXISTS', `Local branch already exists: ${name}`);
  }
  const created = await git('switch', ['switch', '-c', name]);
  return { ...(await checkout(git)), message: diagnostic(created.stderr, `Created and switched to ${name}.`) };
}
