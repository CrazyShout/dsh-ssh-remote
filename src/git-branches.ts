import type { BranchListing, BranchMutation, BranchUpdate, RemoteBranch } from '../shared/branch-switch.js';

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

async function headCommit(git: GitRunner): Promise<string | null> {
  const commit = await git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128]);
  return commit.exitCode === 0 ? (lines(commit.stdout)[0] ?? null) : null;
}

function parseLocalBranches(output: string): Array<{ name: string; commit: string; current: boolean }> {
  return output.split(/\r?\n/gu).filter(Boolean).flatMap((line) => {
    const [head, name, commit] = line.split('\t');
    if (head === undefined || name === undefined || commit === undefined) return [];
    return [{ name, commit, current: head.trim() === '*' }];
  });
}

async function readLocalState(git: GitRunner): Promise<Omit<BranchListing, 'warning' | 'remote'>> {
  // One remote command supplies every local branch and the checked-out commit.
  const refs = await git('for-each-ref', [
    'for-each-ref', '--sort=-committerdate', '--count=500',
    '--format=%(HEAD)%09%(refname:short)%09%(objectname:short)', 'refs/heads/',
  ]);
  const rows = parseLocalBranches(refs.stdout);
  let current = rows.find(row => row.current)?.name ?? null;
  let commit = rows.find(row => row.current)?.commit ?? null;
  if (current === null) {
    const head = await git('symbolic-ref', ['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1]);
    current = head.exitCode === 0 ? (lines(head.stdout)[0] ?? null) : null;
  }
  if (commit === null) {
    const head = await git('rev-parse', ['rev-parse', '--short', 'HEAD'], [0, 128]);
    commit = head.exitCode === 0 ? (lines(head.stdout)[0] ?? null) : null;
  }
  const local = unique(rows.map(row => row.name));
  return {
    current,
    commit,
    local: current === null ? local : [current, ...local.filter(name => name !== current)],
  };
}

async function readRemoteRefs(git: GitRunner): Promise<string[]> {
  const remotes = await git('for-each-ref', [
    'for-each-ref', '--sort=-committerdate', '--count=500',
    '--format=%(refname)%09%(symref)', 'refs/remotes/',
  ]);
  return parseRefLines(remotes.stdout).filter(ref => remoteParts(ref) !== undefined);
}

function remoteBranches(
  local: readonly string[],
  remoteRefs: readonly string[],
  limit: number,
  query = '',
): RemoteBranch[] {
  const localSet = new Set(local);
  const remote: RemoteBranch[] = [];
  const seen = new Set<string>();
  for (const ref of remoteRefs) {
    const parts = remoteParts(ref);
    if (parts === undefined || localSet.has(parts.branch)) continue;
    const name = `${parts.remote}/${parts.branch}`;
    if (seen.has(name) || !matches(name, query)) continue;
    seen.add(name);
    remote.push({ ref, ...parts, name });
    if (remote.length === limit) break;
  }
  return remote;
}

/** Build the browser payload from the current branch and Git ref names. */
export function branchPayload(
  current: string | null,
  commit: string | null,
  localRefs: readonly string[],
  remoteRefs: readonly string[],
  limit = DEFAULT_LIMIT,
): Omit<BranchListing, 'warning'> {
  const discovered = unique(localRefs.map(localName).filter((name): name is string => name !== undefined));
  const local = current === null ? discovered : [current, ...discovered.filter(name => name !== current)];
  return {
    current,
    commit,
    local: local.slice(0, limit),
    remote: remoteBranches(local, remoteRefs, limit),
  };
}

async function remotesInPreferenceOrder(git: GitRunner): Promise<string[]> {
  const result = await git('remote', ['remote']);
  return unique(lines(result.stdout)).filter(safeRemoteName).sort((left, right) => {
    const rank = (name: string) => name === 'origin' ? 0 : name === 'upstream' ? 1 : 2;
    return rank(left) - rank(right) || left.localeCompare(right);
  });
}

async function discoverRemoteBranches(git: GitRunner, query: string): Promise<{ refs: string[]; warning: string }> {
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
    return { refs: branches.map(item => `${REMOTE_PREFIX}${remote}/${item.branch}`), warning: redactGitText(warnings.join('; ')) };
  }
  return { refs: [], warning: redactGitText(warnings.join('; ')) };
}

/**
 * Enumerate names only. Fetch an advertised head only after explicit selection.
 */
export async function searchBranches(
  git: GitRunner,
  { query = '', discoverRemote = false, includeRemote = true, limit = DEFAULT_LIMIT }: {
    query?: string;
    discoverRemote?: boolean;
    includeRemote?: boolean;
    limit?: number;
  } = {},
): Promise<BranchListing> {
  const normalized = query.trim();
  const state = await readLocalState(git);
  let remoteRefs: string[] = [];
  let warning = '';
  if (includeRemote) {
    remoteRefs = await readRemoteRefs(git);
    if (discoverRemote && normalized.length >= 2) {
      const result = await discoverRemoteBranches(git, normalized);
      remoteRefs = unique([...result.refs, ...remoteRefs]);
      warning = result.warning;
    }
  }
  return {
    ...state,
    local: state.local.filter(name => matches(name, normalized)).slice(0, limit),
    remote: remoteBranches(state.local, remoteRefs, limit, normalized),
    warning,
  };
}

async function updateCurrentBranch(git: GitRunner, branch: string): Promise<BranchUpdate> {
  const upstream = await git(
    'rev-parse',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    [0, 128],
  );
  const tracking = upstream.exitCode === 0 ? (lines(upstream.stdout)[0] ?? '') : '';
  if (tracking === '') {
    return { status: 'skipped', message: `Branch ${branch} has no upstream.` };
  }
  try {
    const pulled = await git(
      'pull',
      ['pull', '--ff-only', '--no-rebase', '--no-autostash', '--no-tags', '--no-recurse-submodules'],
      [0],
      undefined,
      120_000,
    );
    const output = `${pulled.stderr}\n${pulled.stdout}`;
    const current = /already up[- ]to[- ]date/iu.test(output);
    return {
      status: current ? 'current' : 'updated',
      message: diagnostic(output, current ? `Branch ${branch} is already current.` : `Updated ${branch} from ${tracking}.`),
    };
  } catch (error) {
    return {
      status: 'failed',
      message: redactGitText(error instanceof Error ? error.message : String(error)),
    };
  }
}

/** Switch to one verified local branch, or create a local tracking branch from a remote ref. */
export async function switchBranch(git: GitRunner, ref: string): Promise<BranchMutation> {
  if (!ref || /[\0\r\n]/u.test(ref)) throw new GitBranchError('INVALID_BRANCH', 'A branch ref is required.');
  const local = localName(ref);
  if (local !== undefined) {
    if (!safeBranchName(local)) throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${local}`);
    if (!(await refExists(git, ref))) throw new GitBranchError('REF_MISSING', `Branch ref does not exist: ${ref}`);
    const switched = await git('switch', ['switch', local]);
    const update = await updateCurrentBranch(git, local);
    return {
      current: local,
      commit: await headCommit(git),
      message: diagnostic(switched.stderr, `Switched to ${local}.`),
      update,
    };
  }
  const remote = remoteParts(ref);
  if (remote === undefined) throw new GitBranchError('INVALID_BRANCH', `Unsupported branch ref: ${ref}`);
  if (!safeRemoteName(remote.remote) || !safeBranchName(remote.branch)) {
    throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${remote.branch}`);
  }
  if (await refExists(git, `${LOCAL_PREFIX}${remote.branch}`)) {
    throw new GitBranchError('BRANCH_EXISTS', `Local branch already exists: ${remote.branch}. Select it explicitly.`);
  }
  if (!(await remotesInPreferenceOrder(git)).includes(remote.remote)) throw new GitBranchError('REF_MISSING', 'Unknown Git remote.');
  const valid = await git('check-ref-format', ['check-ref-format', ref], [0, 1]);
  if (valid.exitCode !== 0) throw new GitBranchError('INVALID_BRANCH', 'Invalid remote branch ref.');
  await git('fetch', ['fetch', '--no-tags', '--no-recurse-submodules', '--', remote.remote, `+${LOCAL_PREFIX}${remote.branch}:${ref}`], [0], undefined, 120_000);
  const switched = await git('switch', ['switch', '--track', '-c', remote.branch, ref]);
  const update = await updateCurrentBranch(git, remote.branch);
  return {
    current: remote.branch,
    commit: await headCommit(git),
    message: diagnostic(switched.stderr, `Switched to ${remote.branch}.`),
    update,
  };
}

/** Create a new local branch from HEAD and switch to it. */
export async function createBranch(git: GitRunner, name: string): Promise<BranchMutation> {
  if (!safeBranchName(name)) throw new GitBranchError('INVALID_BRANCH', 'A valid branch name is required.');
  const checked = await git('check-ref-format', ['check-ref-format', '--branch', name], [0, 1, 128]);
  if (checked.exitCode !== 0 || checked.stdout.trimEnd() !== name) throw new GitBranchError('INVALID_BRANCH', `Invalid Git branch name: ${name}`);
  if (await refExists(git, `${LOCAL_PREFIX}${name}`)) {
    throw new GitBranchError('BRANCH_EXISTS', `Local branch already exists: ${name}`);
  }
  const created = await git('switch', ['switch', '-c', name]);
  return {
    current: name,
    commit: await headCommit(git),
    message: diagnostic(created.stderr, `Created and switched to ${name}.`),
    update: { status: 'skipped', message: `New branch ${name} has no upstream.` },
  };
}
