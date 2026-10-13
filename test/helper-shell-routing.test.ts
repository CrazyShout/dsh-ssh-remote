import { describe, expect, it, vi } from 'vitest';
import { installRemoteShellRouter } from '../src/helper-shell.js';

function fixture() {
  const local = { local: true };
  const shell = { execute: vi.fn(async (_spec: unknown) => local) };
  const localExecute = shell.execute;
  const calls: Array<{ method: string; params: any }> = [];
  const client = { call: vi.fn(async (method: string, params: any) => {
    calls.push({ method, params });
    if (method === 'workspace/open') return { workspaceId: params.workspaceId, path: params.path };
    if (method === 'process/start') return { processId: params.processId, running: true };
    if (method === 'process/read') return { chunks: [], nextSeq: '0', exited: true, exitCode: 0, signal: null };
    return { closed: true };
  }) };
  const helpers = { client: vi.fn(async () => client) };
  const resolve = (path: string) => path === '/anchor-a' ? 'ssh://host-a/project'
    : path === '/anchor-b' ? 'ssh://host-b/project' : undefined;
  installRemoteShellRouter(shell as never, helpers as never, resolve);
  return { shell, helpers, local, localExecute, calls };
}

describe('model shell host selection', () => {
  it.each(['host-a', 'host-b'])('routes a raw absolute workdir to its owning workspace (%s)', async host => {
    const f = fixture();
    const execution: any = await f.shell.execute({
      command: 'pwd', workdir: '/project/中文 space', timeoutMs: 5_000,
      sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: host === 'host-a' ? '/anchor-a' : '/anchor-b' },
    });
    expect(f.localExecute).not.toHaveBeenCalled();
    await execution.done;
    expect(f.helpers.client).toHaveBeenCalledWith(`ssh://${host}/project/中文 space`, expect.anything());
    expect(f.calls.find(call => call.method === 'process/start')?.params.cwd).toBe('project/中文 space');
  });

  it.each(['read-only', 'workspace-write'])('retains the %s sandbox boundary for raw remote paths', async mode => {
    const f = fixture();
    const execution: any = await f.shell.execute({
      command: 'pwd', workdir: '/project/subdir', timeoutMs: 5_000,
      sandboxPolicy: { mode, workspaceRoot: '/anchor-a' },
    });
    expect(f.localExecute).not.toHaveBeenCalled();
    await execution.done;
    expect(f.calls.find(call => call.method === 'workspace/open')?.params).toMatchObject({ path: '/project', access: mode });
    expect(f.calls.find(call => call.method === 'process/start')?.params.cwd).toBe('subdir');
    await expect(f.shell.execute({
      command: 'pwd', workdir: '/project-other', timeoutMs: 5_000,
      sandboxPolicy: { mode, workspaceRoot: '/anchor-a' },
    })).rejects.toThrow('outside sandbox workspace');
    expect(f.localExecute).not.toHaveBeenCalled();
  });

  it('leaves ordinary local workdirs unchanged, including identical path text', async () => {
    const f = fixture();
    const spec = { command: 'pwd', workdir: '/project', timeoutMs: 5_000,
      sandboxPolicy: { mode: 'workspace-write', workspaceRoot: '/project' } };
    expect(await f.shell.execute(spec)).toBe(f.local);
    expect(await f.shell.execute({ command: 'pwd', workdir: '/project', timeoutMs: 5_000 })).toBe(f.local);
    expect(f.helpers.client).not.toHaveBeenCalled();
    expect(f.localExecute).toHaveBeenCalledWith(spec);
  });

  it('keeps explicit SSH URIs and anchor workdirs working without guessing a host', async () => {
    const f = fixture();
    for (const workdir of ['ssh://host-b/project', '/anchor-a']) {
      const execution: any = await f.shell.execute({ command: 'pwd', workdir, timeoutMs: 5_000 });
      await execution.done;
    }
    expect(f.localExecute).not.toHaveBeenCalled();
    expect(f.helpers.client.mock.calls).toHaveLength(2);
  });
});
