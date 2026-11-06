import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchorRegistry } from '../src/anchors.js';
import { installRemoteWorkingDirectoryRouter } from '../src/working-directory.js';
import { installRemoteSubprocessRouter } from '../src/runtime-router.js';
import { formatSshUri, parseSshUri } from '../src/types.js';

const cleanup: (() => unknown)[] = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });
const realSdk = process.env.DSH_TEST_SDK_VERSION === '0.2.2-rc.1';

async function fixture(official = false, install = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-directory-test-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const registry = new AnchorRegistry(join(root, 'anchors.json'), join(root, 'anchors'));
  cleanup.push(() => registry.dispose());
  const a = await registry.materialize('ssh://alpha:2222/code/libvirt');
  const b = await registry.materialize('ssh://beta:2200/code/libvirt');
  const states = new WeakMap<object, string>();
  const events: unknown[] = [];
  const agent = (cwd: string) => ({ ctx: { fiber: { assertActive() {} } }, inject: vi.fn(), session: {
    header: { cwd }, append(type: string, data: { cwd: string }) { events.push({ type, data }); states.set(this, data.cwd); },
  } });
  const local = vi.fn();
  let statGate: (() => Promise<void>) | undefined;
  // A deterministic fs provider: same remote paths exist on two distinct hosts.
  const fs = {
    async resolve(path: string, options?: { cwd?: string }) {
      let uri = path.startsWith('ssh://') ? path : registry.resolve(path);
      const cwd = options?.cwd;
      const base = cwd && (cwd.startsWith('ssh://') ? cwd : registry.resolve(cwd));
      if (!uri && base) uri = formatSshUri({ ...parseSshUri(base), path: posix.resolve(parseSshUri(base).path, path) });
      if (!uri) { local(path); return { targetKey: resolve(cwd ?? root, path) }; }
      // Simulate a remote symlink to a directory outside the original workspace.
      if (parseSshUri(uri).path === '/code/libvirt/link') uri = formatSshUri({ ...parseSshUri(uri), path: '/srv/shared' });
      return { targetKey: uri };
    },
    async stat(target: { targetKey: string }, signal?: AbortSignal) {
      await statGate?.(); signal?.throwIfAborted();
      return target.targetKey.endsWith('/missing') ? undefined : { type: 'directory' };
    },
    processPath(target: { targetKey: string }) {
      return target.targetKey.startsWith('ssh://') ? parseSshUri(target.targetKey).path : target.targetKey;
    },
  };
  const current = (owner: any) => states.get(owner.session) ?? owner.session.header.cwd;
  let directories: any = {
    async ensure(owner: any, signal?: AbortSignal) {
      const path = current(owner); await fs.stat(await fs.resolve(path), signal); return path;
    },
    async set(owner: any, path: string, signal?: AbortSignal) {
      const target = await fs.resolve(path, { cwd: current(owner) });
      if ((await fs.stat(target, signal))?.type !== 'directory') throw new Error('directory does not exist');
      signal?.throwIfAborted(); const value = fs.processPath(target);
      if (value !== current(owner)) owner.session.append('working-directory/change', { cwd: value });
      return value;
    },
  };
  if (official) {
    // Published SDK service, not a copied implementation. Stub only the
    // projection storage/prompt registry; no LLM request or real user session.
    const name = '@deepseek-ai/dsh-working-directory';
    const { default: WorkingDirectoryService } = await import(/* @vite-ignore */ name);
    const ctx = new Context();
    ctx.provide('fs', fs as never);
    ctx.provide('systemPrompt', { context() {}, getContextOrder: () => 0 } as never);
    ctx.provide('sessionProjections', { register: async () => ({
      stateOf: (session: any) => states.get(session) ?? session.header.cwd ?? null,
    }) } as never);
    cleanup.push(() => ctx.fiber.dispose());
    await ctx.plugin(WorkingDirectoryService, { defaultDirectory: root });
    await vi.waitFor(() => expect(ctx.get('workingDirectory')?.get(agent(a.anchorPath).session)).toBe(a.anchorPath));
    directories = ctx.get('workingDirectory');
  }
  const restore = install ? installRemoteWorkingDirectoryRouter(directories, fs as never,
    path => registry.resolve(path), uri => registry.executionPath(uri)) : undefined;
  if (restore) cleanup.push(() => restore.dispose());
  const spawn = vi.fn((spec: any) => {
    return { done: spec.argv[0] === 'ssh' ? Promise.resolve({ exitCode: 0, signal: null })
      : Promise.reject(new Error('ENOENT: remote cwd cannot host the local ripgrep process')), collected: {
      stdout: { readFrom: () => ({ text: 'AGENTS.md\n', nextOffset: 10, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
    } };
  });
  const subprocess = { spawn, spawnTerminal: vi.fn() };
  cleanup.push(installRemoteSubprocessRouter(subprocess as never, path => registry.resolve(path)));
  return { root, a, b, registry, directories, agent, fs, local, states, events, restore, subprocess, spawn,
    setStatGate: (gate?: () => Promise<void>) => { statGate = gate; } };
}

describe.each([false, ...(realSdk ? [true] : [])])('SSH working directory (published SDK: %s)', official => {
  it('keeps fresh child and grandchild cwd routable, including a non-default SSH port', async () => {
    const f = await fixture(official), parent = f.agent(f.a.anchorPath), child = f.agent(f.a.anchorPath);
    // The actual in-process subagent sequence: ensure parent, resolve on the
    // Host, set child; child keeps the original project in its immutable header.
    const inherited = resolve(await f.directories.ensure(parent), '.');
    expect(await f.directories.set(child, inherited)).toBe(f.a.anchorPath);
    const cwd = await f.directories.ensure(child);
    f.subprocess.spawn({ cwd, argv: ['/app/node_modules/@vscode/ripgrep/bin/rg', '--files', '--', '/code/libvirt'] } as never);
    expect(f.spawn).toHaveBeenLastCalledWith(expect.objectContaining({ argv: expect.arrayContaining(['-p', '2222', '--', 'alpha']) }));
    await f.directories.set(child, '中文 space');
    const grandchild = f.agent(f.a.anchorPath);
    await f.directories.set(grandchild, resolve(await f.directories.ensure(child), '.'));
    expect(f.registry.resolve(await f.directories.ensure(grandchild))).toBe('ssh://alpha:2222/code/libvirt/中文 space');
    expect(f.local).not.toHaveBeenCalled();
    // Display/process paths outside the directory operation remain POSIX.
    expect(f.fs.processPath(await f.fs.resolve(f.a.anchorPath))).toBe('/code/libvirt');
  });

  it('repairs POSIX-only state using the owning Session, not a global path guess', async () => {
    const f = await fixture(official), alpha = f.agent(f.a.anchorPath), beta = f.agent(f.b.anchorPath);
    f.states.set(alpha.session, '/code/libvirt'); f.states.set(beta.session, '/code/libvirt');
    const [a, b] = await Promise.all([f.directories.ensure(alpha), f.directories.ensure(beta)]);
    expect(a).toBe(f.a.anchorPath); expect(b).toBe(f.b.anchorPath);
    expect(f.states.get(alpha.session)).toBe(a); expect(f.states.get(beta.session)).toBe(b);
    const local = f.agent('/code/libvirt');
    expect(await f.directories.ensure(local)).toBe('/code/libvirt');
    expect(f.local).toHaveBeenCalledExactlyOnceWith('/code/libvirt');
  });

  it('retains canonical identity outside the project and after registry reload', async () => {
    const f = await fixture(official), owner = f.agent(f.a.anchorPath);
    const cwd = await f.directories.set(owner, 'link');
    expect(f.registry.resolve(cwd)).toBe('ssh://alpha:2222/srv/shared');
    const reloaded = new AnchorRegistry(join(f.root, 'anchors.json'), join(f.root, 'anchors'));
    cleanup.push(() => reloaded.dispose());
    expect(reloaded.resolve(cwd)).toBe('ssh://alpha:2222/srv/shared');
    expect(f.states.get(owner.session)).toBe(cwd);
    const before = await readFile(join(f.root, 'anchors.json'), 'utf8');
    await f.directories.ensure(owner);
    expect(await readFile(join(f.root, 'anchors.json'), 'utf8')).toBe(before);
  });

  it('rejects another SSH authority and leaves local directories and failures intact', async () => {
    const f = await fixture(official), owner = f.agent(f.a.anchorPath), local = f.agent(f.root);
    await expect(f.directories.set(owner, f.b.anchorPath)).rejects.toThrow('different host');
    await expect(f.directories.set(owner, 'ssh://alpha:22/code/libvirt')).rejects.toThrow('different host');
    await expect(f.directories.set(local, f.a.anchorPath)).rejects.toThrow('local Session');
    await expect(f.directories.set(owner, '/code/libvirt/missing')).rejects.toThrow('does not exist');
    expect(f.states.has(owner.session)).toBe(false);
    expect(await f.directories.set(local, f.root)).toBe(f.root);
  });

  it('cancels delayed work and restores the original public methods after disposal', async () => {
    const f = await fixture(official), owner = f.agent(f.a.anchorPath);
    let unblock!: () => void;
    f.setStatGate(() => new Promise<void>(r => { unblock = r; }));
    const call = f.directories.set(owner, 'late');
    const rejected = expect(call).rejects.toThrow('disposed');
    await vi.waitFor(() => expect(unblock).toBeTypeOf('function'));
    const disposing = f.restore!.dispose(); unblock();
    await rejected; await disposing;
    expect(f.events).toEqual([]);
    f.setStatGate(undefined);
    expect(await f.directories.set(owner, f.a.anchorPath)).toBe('/code/libvirt');
  });
});

it.skipIf(!realSdk)('reproduces the reported failure with unadapted official working-directory + ripgrep services', async () => {
  const f = await fixture(true, false), owner = f.agent(f.a.anchorPath);
  await f.directories.set(owner, f.a.anchorPath);
  expect(f.states.get(owner.session)).toBe('/code/libvirt');
  const name = '@deepseek-ai/dsh-tool-fs-search';
  const { runRipgrep } = await import(/* @vite-ignore */ name);
  await expect(runRipgrep({ workingDirectory: f.directories, subprocess: f.subprocess },
    { agent: owner, signal: new AbortController().signal }, 'glob', ['--files'], 4096, 1000, 4096))
    .rejects.toThrow('glob subprocess failed before reporting an outcome (ripgrep provider failure)');
});

it.skipIf(!realSdk)('executes all three reported searches through the official search seam after child initialization', async () => {
  const f = await fixture(true), child = f.agent(f.a.anchorPath);
  await f.directories.set(child, f.a.anchorPath);
  const name = '@deepseek-ai/dsh-tool-fs-search';
  const { runRipgrep, buildGlobCommand } = await import(/* @vite-ignore */ name);
  for (const pattern of ['AGENTS.md', '.agents/skills/**/SKILL.md', 'docs/skills/**/SKILL.md']) {
    const result = await runRipgrep({ workingDirectory: f.directories, subprocess: f.subprocess },
      { agent: child, signal: new AbortController().signal }, 'glob', buildGlobCommand({ pattern, path: '/code/libvirt' }), 4096, 1000, 4096);
    expect(result.stdout).toBe('AGENTS.md\n');
    expect(f.spawn.mock.calls.at(-1)![0].argv).toEqual(expect.arrayContaining(['ssh', '-T', '-p', '2222', 'alpha']));
  }
});
