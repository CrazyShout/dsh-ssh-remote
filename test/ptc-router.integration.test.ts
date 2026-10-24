import { Context } from '@deepseek-ai/cordis';
import { NodePtcRuntime } from '@deepseek-ai/dsh-ptc-runtime-node';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
import { installRemotePtcRouter } from '../src/ptc-router.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

async function setup(options: Record<string, unknown> = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-ptc-test-')));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const child = spawn('python3', [fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url)), 'connect', '--stdio', '--direct'], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '--definitely-invalid-option', PYTHONDONTWRITEBYTECODE: '1' },
  });
  const exited = once(child, 'exit');
  const client = new RemoteHelperRpcClient({ readable: child.stdout, writable: child.stdin });
  await client.initialize({ clientId: 'official-ptc-test' });
  cleanup.push(async () => { client.close(); child.stdin.end(); await exited; });
  const ctx = new Context();
  const localSpawn = vi.fn(() => { throw new Error('unexpected local process launch'); });
  const localResolve = vi.fn(async () => '/local/node');
  ctx.provide('fs', { processPathFromHostPath: (path: string) => path } as never);
  ctx.provide('subprocess', { spawn: localSpawn, resolveExecutable: localResolve } as never);
  ctx.provide('sandbox', { confine: () => { throw new Error('local sandbox must not wrap a remote worker'); } } as never);
  const policy = { mode: 'danger-full-access' as const, workspaceRoot: '/virtual-anchor' };
  ctx.provide('sandboxPolicy', { defaultMode: policy.mode, resolve: () => policy } as never);
  const runtime = new NodePtcRuntime(ctx, {
    timeoutMs: 8000, maxTimeoutMs: 20000, maxOutputBytes: 200000,
    maxMessageBytes: 300000, maxPendingCalls: 16, maxOldGenerationSizeMb: 128, graceMs: 1500,
    ...options,
  });
  const helpers = { client: async () => client };
  const router = installRemotePtcRouter(ctx.ptcRuntime, ctx.fs, ctx.subprocess, ctx.sandbox, helpers,
    path => path === '/virtual-anchor' ? `ssh://fixture${root}` : undefined);
  cleanup.push(() => router.dispose());
  const run = (program: string, options: Record<string, unknown> = {}) => ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({
    program, cwd: '/virtual-anchor', bindings: [], sandboxPolicy: policy, ...options,
  }));
  return { root, runtime, run, client, ctx, localSpawn, localResolve, router, helpers };
}

it('runs the unmodified official Node worker, remote file APIs and host binding callbacks', async () => {
  const { root, run, localSpawn, localResolve } = await setup();
  await writeFile(join(root, '中文 file.txt'), 'REMOTE_MARKER');
  const result = await run(`
    const fs = await import('node:fs/promises');
    const marker = await fs.readFile('中文 file.txt', 'utf8');
    const payload = await tools.echo('x'.repeat(180000));
    console.log(marker);
    await fs.writeFile('written.txt', marker);
    return { marker, size: payload.length, cwd: process.cwd(), env: Object.keys(process.env) };
  `, { bindings: [{ global: 'tools', functions: { echo: async (value: unknown) => value } }] });
  expect(result.error).toBeUndefined();
  expect(result.value).toEqual({ marker: 'REMOTE_MARKER', size: 180000, cwd: root, env: [] });
  expect(result.logs).toContain('REMOTE_MARKER');
  expect(await readFile(join(root, 'written.txt'), 'utf8')).toBe('REMOTE_MARKER');
  expect(localSpawn).not.toHaveBeenCalled(); expect(localResolve).not.toHaveBeenCalled();
}, 20_000);

it.skipIf(!('release' in NodePtcRuntime.prototype))('preserves official owner-scoped persistent state without crossing workspaces', async () => {
  const { run, runtime, ctx, root } = await setup({ executionMode: 'persistent-in-memory' });
  const owner = {};
  const first = await run('var answer = 40; answer', { stateOwner: owner });
  expect(first.error).toBeUndefined(); expect(first.value).toBe(40);
  const second = await run('answer += 2; answer', { stateOwner: owner });
  expect(second.error).toBeUndefined(); expect(second.value).toBe(42);
  await mkdir(join(root, 'subdir'));
  const moved = await run('[answer, process.cwd()]', { stateOwner: owner, cwd: join(root, 'subdir') });
  expect(moved.error).toBeUndefined(); expect(moved.value).toEqual([42, join(root, 'subdir')]);
  const callback = await run('await tools.lookup(1)', { stateOwner: owner,
    bindings: [{ global: 'tools', functions: { lookup: async () => ctx.subprocess.resolveExecutable('sh') } }],
  });
  expect(callback.value).toBe('/local/node');
  const isolated = await run('typeof answer', { stateOwner: {} });
  expect(isolated.error).toBeUndefined(); expect(isolated.value).toBe('undefined');
  expect(() => run('answer', { stateOwner: owner, cwd: '/local-project',
    sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/local-project' } })).toThrow('workspace changed');
  await (runtime as NodePtcRuntime & { release(owner: object): Promise<void> }).release(owner);
  const reset = await run('typeof answer', { stateOwner: owner });
  expect(reset.value).toBe('undefined');
}, 20_000);

it('routes execution-world cwd after the official working-directory service changes directory', async () => {
  const { run, root, localSpawn } = await setup();
  await mkdir(join(root, 'subdir'));
  const result = await run('return process.cwd()', { cwd: join(root, 'subdir') });
  expect(result.error).toBeUndefined(); expect(result.value).toBe(join(root, 'subdir'));
  expect(localSpawn).not.toHaveBeenCalled();
  expect(() => run('return 1', { cwd: '/tmp',
    sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/virtual-anchor' } })).toThrow('workspace policy');
}, 15_000);

it('fails closed without remote confinement and bounds cancellation of an infinite program', async () => {
  const { run, client, localSpawn } = await setup();
  const capabilities = client.capabilities as { process: { sandbox: string } };
  const original = capabilities.process.sandbox; capabilities.process.sandbox = 'none';
  const denied = await run(`return 1`, { sandboxPolicy: { mode: 'read-only', workspaceRoot: '/virtual-anchor' } });
  expect(denied.error?.message).toContain('bubblewrap');
  expect(denied.error?.kind).toBe('sandbox-unavailable');
  expect(localSpawn).not.toHaveBeenCalled(); capabilities.process.sandbox = original;
  const start = Date.now();
  const cancelled = await run(`while (true) {}`, { timeoutMs: 300 });
  expect(cancelled.error?.kind).toBe('timeout');
  expect(Date.now() - start).toBeLessThan(6500);
}, 15_000);

it('leaves local calls and interleaved binding subprocess work outside the PTC launch adapter', async () => {
  const { run, ctx, localResolve } = await setup();
  const [first, second] = await Promise.all([run('return await tools.lookup(1)', {
    bindings: [{ global: 'tools', functions: { lookup: async () => ctx.subprocess.resolveExecutable('sh') } }],
  }), run('return 2')]);
  expect(first.value).toBe('/local/node'); expect(second.value).toBe(2);
  expect(localResolve).toHaveBeenCalledWith('sh', undefined, undefined);
  expect(await ctx.subprocess.resolveExecutable('local-command')).toBe('/local/node');
}, 20_000);

it('quiesces a delayed remote launch before restoring local service methods on disposal', async () => {
  const { run, client, router, helpers, localSpawn } = await setup();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  helpers.client = async () => { await gate; return client; };
  const running = run('return 1');
  const disposing = router.dispose();
  release();
  const result = await running;
  await disposing;
  expect(result.error?.kind).toBe('abort');
  expect(localSpawn).not.toHaveBeenCalled();
}, 15_000);

it('reports cancellation, not cleanup failure, when a reserved start is retired before publishing', async () => {
  const { run, client, helpers } = await setup();
  const abort = new AbortController();
  helpers.client = async () => ({ ...client, call: async (method: string, params: Record<string, unknown>, options: unknown) => {
    if (method === 'process/start') {
      abort.abort(new Error('cancel during allocation'));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return client.call(method, params, options as never);
  } } as typeof client);
  const result = await run('return 1', { signal: abort.signal });
  expect(result.error?.kind).toBe('abort');
  expect(await client.call('health/status')).toMatchObject({ processes: 0, workspaces: 0, openingWorkspaces: 0 });
}, 15_000);

it.skipIf(process.env.DSH_REQUIRE_BWRAP !== '1')('executes the official worker under real read-only and workspace-write policies', async () => {
  const { run, root } = await setup();
  await writeFile(join(root, 'marker'), 'confined-marker');
  for (const mode of ['read-only', 'workspace-write']) {
    const result = await run(`
      const fs = await import('node:fs/promises');
      const marker = await fs.readFile('marker', 'utf8');
      let written = false; try { await fs.writeFile('proof', marker); written = true; } catch {}
      return { marker, written };
    `, { sandboxPolicy: { mode, workspaceRoot: '/virtual-anchor' } });
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ marker: 'confined-marker', written: mode === 'workspace-write' });
    expect(result.sandbox?.enforcement).toBe('full');
  }
}, 20_000);
