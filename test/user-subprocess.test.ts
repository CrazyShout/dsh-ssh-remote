import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope';
import { SubprocessExecutableNotFoundError, SubprocessRuntime, type SubprocessHandle, type SubprocessSpawnSpec, type SubprocessTerminalHandle, type SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { RemoteHelperRpcError } from '../src/helper/rpc-client.js';
import type { RemoteHelperProvider } from '../src/helper-fs.js';
import { installRemoteUserSubprocessRouter } from '../src/user-subprocess.js';

class LocalRuntime extends SubprocessRuntime {
  readonly spawns: SubprocessSpawnSpec[] = [];
  readonly terminalSpawns: SubprocessTerminalSpawnSpec[] = [];
  readonly resolutions: string[] = [];
  constructor(ctx: Context) { super(ctx); }
  async terminalEnvironment() { return { platform: 'posix' as const, defaultShell: '/local/zsh' }; }
  async resolveExecutable(command: string) { this.resolutions.push(command); return `/local/${command}`; }
  spawn(spec: SubprocessSpawnSpec) { this.spawns.push(spec); return { fixture: true } as unknown as SubprocessHandle; }
  async spawnTerminal(spec: SubprocessTerminalSpawnSpec) {
    this.terminalSpawns.push(spec); return { fixture: true } as unknown as SubprocessTerminalHandle;
  }
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

function setup() {
  const ctx = new Context();
  const local = new LocalRuntime(ctx);
  const agents: Agent[] = [];
  ctx.provide('agents', { list: () => [...agents], get: id => agents.find(agent => agent.id === id) } as never);
  const addAgent = (id: string, cwd: string, parent?: Agent) => {
    const agent = { id, session: { header: { cwd } } } as unknown as Agent;
    const scope = createScope(parent?.ctx ?? ctx, agent, parent === undefined ? undefined : { parent });
    Object.defineProperty(agent, 'ctx', { value: scope.ctx });
    agents.push(agent); cleanup.push(() => scope.dispose());
    return agent;
  };
  const resolver = (path: string) => path.startsWith('/anchor-a') ? `ssh://a/home/a${path.slice('/anchor-a'.length)}`
    : path.startsWith('/anchor-b') ? `ssh://b/home/b${path.slice('/anchor-b'.length)}` : undefined;
  const calls: Array<{ uri: string; method: string; params: Record<string, unknown> }> = [];
  const provider: RemoteHelperProvider = {
    client: vi.fn(async uri => ({
      sessionId: 'helper-session', capabilities: { environment: { resolveExecutable: true } },
      hello: { platform: { shell: uri.includes('://a/') ? '/bin/bash' : '/bin/fish' } },
      call: async (method: string, params: Record<string, unknown>) => {
        calls.push({ uri, method, params });
        if (params.command === 'missing') throw new RemoteHelperRpcError({ code: 'E_EXECUTABLE_NOT_FOUND', message: 'missing', retryable: false });
        return { path: `/remote/${uri.includes('://a/') ? 'a' : 'b'}/${params.command}` };
      },
    } as never)),
  };
  return { ctx, local, addAgent, resolver, calls, provider };
}

describe('Agent-scoped human subprocess routing', () => {
  it('declares scope as a runtime peer so linked plugin loaders share the host scope identity', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(manifest.peerDependencies['@deepseek-ai/dsh-scope']).toBe('>=0.2.0-rc.2 <0.3.0');
  });

  it('selects each remote environment concurrently and preserves local Agent boundaries', async () => {
    const fixture = setup();
    const a = fixture.addAgent('a-session', '/anchor-a');
    const b = fixture.addAgent('b-session', '/anchor-b');
    const localChild = fixture.addAgent('local-child', '/local-work', a);
    const router = installRemoteUserSubprocessRouter(fixture.ctx, fixture.ctx.get('subprocess')!, fixture.provider, fixture.resolver);
    cleanup.push(() => router.dispose());
    const [envA, envB, envLocal] = await Promise.all([
      a.ctx.get('subprocess')!.terminalEnvironment(), b.ctx.get('subprocess')!.terminalEnvironment(), localChild.ctx.get('subprocess')!.terminalEnvironment(),
    ]);
    expect(envA.defaultShell).toBe('/bin/bash'); expect(envB.defaultShell).toBe('/bin/fish'); expect(envLocal.defaultShell).toBe('/local/zsh');
    expect((await fixture.ctx.get('subprocess')!.terminalEnvironment()).defaultShell).toBe('/local/zsh');
    await expect(a.ctx.get('subprocess')!.resolveExecutable('missing')).rejects.toBeInstanceOf(SubprocessExecutableNotFoundError);
    await expect(a.ctx.get('subprocess')!.resolveExecutable('/local/node_modules/@vscode/ripgrep/bin/rg'))
      .resolves.toBe('/remote/a/rg');
    expect(fixture.calls.at(-1)?.params.command).toBe('rg');
    expect(fixture.calls.at(-1)?.params.login).toBe(true);
    await expect(localChild.ctx.get('subprocess')!.resolveExecutable('sh')).resolves.toBe('/local/sh');
  });

  it('normalizes scoped ordinary-spawn cwd synchronously and rejects cross-host cwd', async () => {
    const fixture = setup(); const a = fixture.addAgent('a-session', '/anchor-a');
    const router = installRemoteUserSubprocessRouter(fixture.ctx, fixture.ctx.get('subprocess')!, fixture.provider, fixture.resolver);
    cleanup.push(() => router.dispose());
    const runtime = a.ctx.get('subprocess')!;
    const handle = runtime.spawn({ argv: ['true'], cwd: '/remote/native/path' } as never);
    expect(handle).not.toBeInstanceOf(Promise);
    expect(fixture.local.spawns[0].cwd).toBe('ssh://a/remote/native/path');
    runtime.spawn({ argv: ['true'], cwd: '/anchor-a/subdir' } as never);
    expect(fixture.local.spawns[1].cwd).toBe('ssh://a/home/a/subdir');
    expect(() => runtime.spawn({ argv: ['true'], cwd: 'ssh://b/home/b' } as never)).toThrow('another SSH host');
    fixture.ctx.get('subprocess')!.spawn({ argv: ['true'], cwd: '/ordinary-local' } as never);
    expect(fixture.local.spawns.at(-1)?.cwd).toBe('/ordinary-local');
  });

  it('registers new Agents, refuses disposed scopes and restores the base provider', async () => {
    const fixture = setup();
    const router = installRemoteUserSubprocessRouter(fixture.ctx, fixture.ctx.get('subprocess')!, fixture.provider, fixture.resolver);
    cleanup.push(() => router.dispose());
    const agent = fixture.addAgent('new-session', '/anchor-a');
    await fixture.ctx.serial(scopeTarget(agent, agent), 'agent/created', { agent, source: 'startup' });
    const runtime = agent.ctx.get('subprocess')!;
    expect((await runtime.terminalEnvironment()).defaultShell).toBe('/bin/bash');
    fixture.ctx.emit(scopeTarget(agent, agent), 'agent/disposed', { agent });
    await expect(runtime.terminalEnvironment()).rejects.toThrow('disposed');
    const held = runtime.terminalEnvironment.bind(runtime);
    await router.dispose();
    await expect(held()).rejects.toThrow('disposed');
    expect((await fixture.ctx.get('subprocess')!.terminalEnvironment()).defaultShell).toBe('/local/zsh');
  });

  it('retains failed unpublished allocation cleanup and retries the same identity on disposal', async () => {
    const fixture = setup(); const signal = new AbortController();
    let releases = 0; const processIds: string[] = [];
    const provider: RemoteHelperProvider = { client: async () => ({
      sessionId: 'owned-session',
      call: async (method: string, params: Record<string, unknown>) => {
        if (method === 'process/start') {
          processIds.push(String(params.processId)); signal.abort(new Error('cancel unpublished fixture'));
          return { processId: params.processId, pid: 1234, running: true, exitCode: null, signal: null };
        }
        if (method === 'process/release') {
          releases += 1; processIds.push(String(params.processId));
          if (releases === 1) throw new RemoteHelperRpcError({ code: 'E_IO', message: 'fixture cleanup transport failed', retryable: true });
        }
        return {};
      },
    } as never) };
    const router = installRemoteUserSubprocessRouter(fixture.ctx, fixture.ctx.get('subprocess')!, provider, fixture.resolver);
    cleanup.push(() => router.dispose());
    await expect(fixture.ctx.get('subprocess')!.spawnTerminal({
      argv: ['/bin/sh'], cwd: '/anchor-a', cols: 80, rows: 24, terminalType: 'xterm', graceMs: 50, signal: signal.signal,
    })).rejects.toMatchObject({ name: 'RemoteUserTerminalAllocationError' });
    expect(releases).toBe(1);
    await router.dispose();
    expect(releases).toBe(2); expect(new Set(processIds).size).toBe(1);
  });
});
