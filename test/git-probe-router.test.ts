import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import type { RemoteHelperStatus, RemoteHelperStatusListener } from '../src/helper/manager.js';
import { expect, it, vi } from 'vitest';
import { installRemoteSubprocessRouter } from '../src/runtime-router.js';

const spec: SubprocessSpawnSpec = { cwd: '/anchor', argv: ['git', 'rev-parse', 'HEAD'], stdio: {}, graceMs: 1000 };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const pending: ((outcome: SubprocessOutcome) => void)[] = [];
  const spawn = vi.fn((_spec: SubprocessSpawnSpec) => ({
    done: new Promise<SubprocessOutcome>(resolve => pending.push(resolve)),
  }) as SubprocessHandle);
  const original = spawn;
  const terminal = vi.fn();
  const runtime = { spawn, spawnTerminal: terminal };
  let status: RemoteHelperStatus = { alias: 'host', state: 'connected', attempt: 0, lastConnectedAt: 1 };
  let listener: RemoteHelperStatusListener | undefined;
  const detach = vi.fn(() => { listener = undefined; });
  const connections = { status: () => status, onStatus: (fn: RemoteHelperStatusListener) => { listener = fn; return detach; } };
  const restore = installRemoteSubprocessRouter(runtime as never, path => path === '/anchor' ? 'ssh://host/repo' : undefined, connections);
  return { runtime, original, terminal, pending, restore, detach, emit: (next: RemoteHelperStatus) => { status = next; listener?.(status); } };
}

it('wires actual recovery notifications and ignores pending failures from before reconnect', async () => {
  const f = fixture();
  try {
    f.runtime.spawn(spec); f.runtime.spawn(spec);
    f.pending[0]!({ exitCode: 255, signal: null }); await settle();
    expect(() => f.runtime.spawn(spec)).toThrow(/suppressed/u);
    f.emit({ alias: 'host', state: 'connected', attempt: 0, lastConnectedAt: 1, lastHealthAt: 2 });
    expect(() => f.runtime.spawn(spec)).toThrow();
    f.emit({ alias: 'host', state: 'reconnecting', attempt: 1, lastConnectedAt: 1 });
    f.emit({ alias: 'host', state: 'connected', attempt: 0, lastConnectedAt: 3 });
    f.runtime.spawn(spec);
    f.pending[2]!({ exitCode: 0, signal: null }); await settle();
    f.pending[1]!({ exitCode: 255, signal: null }); await settle();
    expect(() => f.runtime.spawn(spec)).not.toThrow();
    expect(f.original).toHaveBeenCalledTimes(4);
  } finally { f.restore(); }
  expect(f.detach).toHaveBeenCalledOnce();
  expect(f.runtime.spawn).toBe(f.original);
});

it('does not suppress different inputs, writes, local commands or PTYs', async () => {
  const f = fixture();
  try {
    f.runtime.spawn(spec); f.pending[0]!({ exitCode: 127, signal: null }); await settle();
    expect(() => f.runtime.spawn(spec)).toThrow();
    for (const changed of [
      { ...spec, cwd: '/local' }, { ...spec, cwd: 'ssh://host/other' },
      { ...spec, env: { PATH: '/fixed' } }, { ...spec, argv: ['git', 'symbolic-ref', 'HEAD', 'refs/heads/new'] },
      { ...spec, stdio: { stdin: 'pipe' as const } },
    ]) expect(() => f.runtime.spawn(changed)).not.toThrow();
    f.runtime.spawnTerminal({ ...spec } as never);
    expect(f.terminal).toHaveBeenCalledTimes(1);
    expect(f.original).toHaveBeenCalledTimes(6);
  } finally { f.restore(); }
});

it('does not retain a disposed router failure across plugin reload', async () => {
  const f = fixture();
  f.runtime.spawn(spec); f.restore();
  const restore = installRemoteSubprocessRouter(f.runtime as never, () => 'ssh://host/repo');
  try {
    f.pending[0]!({ exitCode: 255, signal: null }); await settle();
    expect(() => f.runtime.spawn(spec)).not.toThrow();
  } finally { restore(); }
});
