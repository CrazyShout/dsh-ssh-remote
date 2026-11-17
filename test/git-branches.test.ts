import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  GitBranchError,
  branchPayload,
  createBranch,
  redactGitText,
  searchBranches,
  switchBranch,
  type GitOutput,
  type GitRunner,
} from '../src/git-branches.js';

const run = promisify(execFile);

function output(stdout = '', exitCode = 0, stderr = ''): GitOutput {
  return { stdout, stderr, exitCode };
}

function fakeGit(initial: {
  current?: string | null;
  local?: string[];
  remote?: Array<[string, string]>;
  heads?: Array<[string, string]>;
  upstream?: boolean;
  pullFails?: boolean;
} = {}) {
  const state = {
    current: initial.current === undefined ? 'main' : initial.current,
    local: new Set(initial.local ?? ['main']),
    remote: new Map(initial.remote ?? [['origin/main', 'refs/remotes/origin/main']]),
    heads: initial.heads ?? [],
    upstream: initial.upstream ?? false,
    pullFails: initial.pullFails ?? false,
    calls: [] as Array<{ name: string; args: string[] }>,
  };
  const git: GitRunner = async (name, args) => {
    const values = [...args];
    state.calls.push({ name, args: values });
    if (name === 'symbolic-ref') return state.current === null ? output('', 1) : output(`${state.current}\n`);
    if (name === 'rev-parse') {
      if (values.includes('@{upstream}')) {
        return state.upstream && state.current !== null
          ? output(`origin/${state.current}\n`)
          : output('', 128, 'no upstream configured');
      }
      return output('abc1234\n');
    }
    if (name === 'for-each-ref') {
      const source = values.at(-1) === 'refs/heads/'
        ? [...state.local].map(branch => `${branch === state.current ? '*' : ''}\t${branch}\tabc1234`)
        : [...state.remote.values()].map(ref => `${ref}\t`);
      return output(`${source.join('\n')}\n`);
    }
    if (name === 'pull') {
      if (state.pullFails) throw new GitBranchError('GIT_FAILED', 'pull rejected');
      return output('Already up to date.\n');
    }
    if (name === 'show-ref') {
      const ref = values.at(-1) ?? '';
      const exists = ref.startsWith('refs/heads/')
        ? state.local.has(ref.slice('refs/heads/'.length))
        : state.remote.has(ref.slice('refs/remotes/'.length));
      return output('', exists ? 0 : 1);
    }
    if (name === 'remote') return output('origin\n');
    if (name === 'ls-remote') {
      return output(state.heads.map(([branch, sha]) => `${sha}\trefs/heads/${branch}`).join('\n'));
    }
    if (name === 'fetch') {
      for (const item of values.slice(3)) {
        const match = /^\+refs\/heads\/(.+):refs\/remotes\/([^/]+)\/(.+)$/u.exec(item);
        if (match) state.remote.set(`${match[2]}/${match[3]}`, `refs/remotes/${match[2]}/${match[3]}`);
      }
      return output();
    }
    if (name === 'check-ref-format') {
      const branch = values.at(-1) ?? '';
      return output(branch.includes(' ') ? '' : `${branch}\n`, branch.includes(' ') ? 1 : 0);
    }
    if (name === 'switch') {
      if (values.includes('-c')) state.current = values[values.indexOf('-c') + 1] ?? null;
      else if (values.includes('--track')) state.current = values[values.indexOf('-c') + 1] ?? null;
      else state.current = values.at(-1) ?? null;
      if (state.current !== null) state.local.add(state.current);
      return output(`Switched to ${state.current}\n`, 0, `Switched to ${state.current}\n`);
    }
    throw new Error(`unexpected git ${name}`);
  };
  return { git, state };
}

async function rawGit(cwd: string, ...args: string[]): Promise<GitOutput> {
  const result = await run('git', args, { cwd, windowsHide: true });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
}

function runnerFor(cwd: string): GitRunner {
  return async (_name, args, allowedExitCodes = [0]) => {
    try {
      return await rawGit(cwd, ...args);
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      if (allowedExitCodes.includes(failure.code ?? -1)) {
        return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', exitCode: failure.code ?? -1 };
      }
      throw error;
    }
  };
}

describe('remote branch Git operations', () => {
  it('prefers local branches and omits duplicate remote names', () => {
    const payload = branchPayload('main', 'abc1234', [
      'refs/heads/dev', 'refs/heads/main',
    ], [
      'refs/remotes/origin/main', 'refs/remotes/origin/feature', 'refs/remotes/upstream/feature',
    ]);
    expect(payload.local).toEqual(['main', 'dev']);
    expect(payload.remote.map(item => item.name)).toEqual(['origin/feature', 'upstream/feature']);
  });

  it('lists only local refs when remote search is disabled', async () => {
    const { git, state } = fakeGit({
      local: ['main', 'feature/local'],
      remote: [['origin/feature/remote', 'refs/remotes/origin/feature/remote']],
    });
    const result = await searchBranches(git, { query: '', includeRemote: false, fetchMissing: true });
    expect(state.calls.filter(call => call.name === 'for-each-ref').map(call => call.args.at(-1)))
      .toEqual(['refs/heads/']);
    expect(state.calls.some(call => call.name === 'fetch')).toBe(false);
    expect(result.local).toEqual(['main', 'feature/local']);
    expect(result.remote).toEqual([]);
  });

  it('searches remotes even when a local branch matches', async () => {
    const { git, state } = fakeGit({
      local: ['main', 'feature/local'],
      heads: [['feature/remote-only', '1111111']],
    });
    const result = await searchBranches(git, { query: 'feature', fetchMissing: true });
    expect(state.calls.some(call => call.name === 'fetch')).toBe(true);
    expect(result.local).toEqual(['feature/local']);
    expect(result.remote.map(item => item.name)).toEqual(['origin/feature/remote-only']);
  });

  it('fetches only matching remote heads when no local branch matches', async () => {
    const { git, state } = fakeGit({
      local: ['main'],
      heads: [['feature/remote-only', '1111111'], ['release/other', '2222222']],
    });
    const result = await searchBranches(git, { query: 'remote-only', fetchMissing: true });
    expect(state.calls.find(call => call.name === 'fetch')?.args).toEqual([
      'fetch', '--no-tags', 'origin',
      '+refs/heads/feature/remote-only:refs/remotes/origin/feature/remote-only',
    ]);
    expect(result.fetched).toEqual(['origin/feature/remote-only']);
    expect(result.remote.map(item => item.name)).toEqual(['origin/feature/remote-only']);
  });

  it('refreshes an existing remote-tracking ref when no local branch matches', async () => {
    const { git, state } = fakeGit({
      local: ['main'],
      remote: [['origin/main', 'refs/remotes/origin/main'], ['origin/feature/remote', 'refs/remotes/origin/feature/remote']],
      heads: [['feature/remote', '3333333']],
    });
    const result = await searchBranches(git, { query: 'remote', fetchMissing: true });
    expect(state.calls.some(call => call.name === 'fetch')).toBe(true);
    expect(result.fetched).toEqual(['origin/feature/remote']);
  });

  it('switches local branches without force and skips update without upstream', async () => {
    const { git, state } = fakeGit({ local: ['main', 'dev'] });
    const result = await switchBranch(git, 'refs/heads/dev');
    expect(result.current).toBe('dev');
    expect(result.update.status).toBe('skipped');
    expect(state.calls.find(call => call.name === 'switch')?.args).toEqual(['switch', 'dev']);
    expect(state.calls.some(call => call.name === 'pull')).toBe(false);
  });

  it('fast-forwards a switched local branch that has an upstream', async () => {
    const { git, state } = fakeGit({ local: ['main', 'dev'], upstream: true });
    const result = await switchBranch(git, 'refs/heads/dev');
    expect(result.update.status).toBe('current');
    expect(state.calls.find(call => call.name === 'pull')?.args).toEqual([
      'pull', '--ff-only', '--no-rebase', '--no-tags',
    ]);
  });

  it('creates a tracking branch for a remote-only branch and updates it', async () => {
    const { git, state } = fakeGit({
      local: ['main'],
      remote: [['origin/main', 'refs/remotes/origin/main'], ['origin/feature/remote', 'refs/remotes/origin/feature/remote']],
      upstream: true,
    });
    const result = await switchBranch(git, 'refs/remotes/origin/feature/remote');
    expect(result.current).toBe('feature/remote');
    expect(result.update.status).toBe('current');
    expect(state.calls.find(call => call.name === 'switch')?.args).toEqual([
      'switch', '--track', '-c', 'feature/remote', 'refs/remotes/origin/feature/remote',
    ]);
    expect(state.calls.some(call => call.name === 'pull')).toBe(true);
  });

  it('keeps a successful switch when the automatic update fails', async () => {
    const { git } = fakeGit({ local: ['main', 'dev'], upstream: true, pullFails: true });
    const result = await switchBranch(git, 'refs/heads/dev');
    expect(result.current).toBe('dev');
    expect(result.update).toMatchObject({ status: 'failed', message: 'pull rejected' });
  });

  it('rejects option-like branch names before invoking Git', async () => {
    const { git, state } = fakeGit({ local: ['main'] });
    await expect(createBranch(git, '--detach')).rejects.toMatchObject<Partial<GitBranchError>>({
      code: 'INVALID_BRANCH',
    });
    expect(state.calls).toEqual([]);
  });

  it('creates a branch from HEAD and rejects duplicates', async () => {
    const first = fakeGit({ local: ['main'] });
    const created = await createBranch(first.git, 'feature/new');
    expect(created.current).toBe('feature/new');
    expect(created.update.status).toBe('skipped');
    expect(first.state.calls.find(call => call.name === 'switch')?.args).toEqual(['switch', '-c', 'feature/new']);
    const second = fakeGit({ local: ['main', 'feature/new'] });
    await expect(createBranch(second.git, 'feature/new')).rejects.toMatchObject<Partial<GitBranchError>>({
      code: 'BRANCH_EXISTS',
    });
  });

  it('redacts credentials from diagnostics and remote-search warnings', async () => {
    expect(redactGitText('fatal https://user:secret@example.test/repo ghp_abcdefghij'))
      .toBe('fatal https://[REDACTED]@example.test/repo [REDACTED]');
    const { git } = fakeGit({ local: ['main'] });
    const leaking: GitRunner = async (name, args, allowed, overrides, timeout) => {
      if (name === 'ls-remote') {
        return output('', 128, 'fatal https://user:secret@example.test/repo');
      }
      return git(name, args, allowed, overrides, timeout);
    };
    const result = await searchBranches(leaking, { query: 'remote', fetchMissing: true });
    expect(result.warning).toBe('origin: fatal https://[REDACTED]@example.test/repo');
  });

  it('performs the complete flow in a real Git repository', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dsh-branch-switch-'));
    try {
      const repo = path.join(root, 'repo'), remote = path.join(root, 'remote.git');
      await run('git', ['init', '-b', 'main', repo], { windowsHide: true });
      await rawGit(repo, 'config', 'user.name', 'DSH Test');
      await rawGit(repo, 'config', 'user.email', 'dsh@example.test');
      await rawGit(repo, 'commit', '--allow-empty', '-m', 'root');
      await run('git', ['init', '--bare', remote], { windowsHide: true });
      await rawGit(repo, 'remote', 'add', 'origin', remote.replaceAll('\\', '/'));
      await rawGit(repo, 'push', '-u', 'origin', 'main');
      await rawGit(repo, 'push', 'origin', 'main:refs/heads/remote-only');
      await rawGit(repo, 'update-ref', '-d', 'refs/remotes/origin/remote-only');
      const git = runnerFor(repo);
      const listing = await searchBranches(git, { query: 'remote-only', fetchMissing: true });
      expect(listing.fetched).toEqual(['origin/remote-only']);

      const publisher = path.join(root, 'publisher');
      await run('git', ['clone', remote, publisher], { windowsHide: true });
      await rawGit(publisher, 'config', 'user.name', 'DSH Publisher');
      await rawGit(publisher, 'config', 'user.email', 'publisher@example.test');
      await rawGit(publisher, 'switch', '-c', 'remote-only', 'origin/remote-only');
      await rawGit(publisher, 'commit', '--allow-empty', '-m', 'advance remote-only');
      const latest = (await rawGit(publisher, 'rev-parse', 'HEAD')).stdout.trim();
      await rawGit(publisher, 'push', 'origin', 'remote-only');

      const switched = await switchBranch(git, 'refs/remotes/origin/remote-only');
      expect(switched.current).toBe('remote-only');
      expect(switched.update.status).toBe('updated');
      expect((await rawGit(repo, 'rev-parse', 'HEAD')).stdout.trim()).toBe(latest);
      expect((await rawGit(repo, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')).stdout.trim())
        .toBe('origin/remote-only');
      expect((await createBranch(git, 'feature/from-remote')).current).toBe('feature/from-remote');
      expect((await rawGit(repo, 'status', '--porcelain')).stdout).toBe('');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
