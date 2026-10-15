import { describe, expect, it, vi } from 'vitest';
import { TerminalStateManager } from '../src/terminal-state.js';
const snapshot = { instance: 'instance-one', sequence: '2', revision: 2, state: 'prompt', reason: '', cwd: '/work', current: null,
  recent: [{ command: 'false', cwd: '/work', startedAt: 10, elapsedMs: 5, exitCode: 1, uncertain: false }] };
function fixture() {
  const manager = new TerminalStateManager(path => path === '/a' ? 'ssh://first/work' : path === '/b' ? 'ssh://second/work' : undefined);
  const all = new Map<string, any[]>(), terminals = new Map<string, any>();
  const controller: any = {
    list: (id: string) => all.get(id) ?? [],
    async create(agent: any, request: any) {
      await Promise.resolve();
      const observation = manager.reserve(agent.session.header.cwd === '/a' ? 'ssh://first/work' : 'ssh://second/work');
      const terminal = { shellState: vi.fn(async () => structuredClone(snapshot)), observation };
      observation?.attached(terminal as any); terminals.set(agent.id, terminal);
      const info = { id: request.id, title: 'bash', state: 'running' };
      all.set(agent.id, [info]); return info;
    },
  };
  const unmount = manager.mount(controller);
  const agent = (id: string, cwd: string) => ({ id, session: { header: { cwd } } });
  return { manager, controller, terminals, all, unmount, agent };
}
describe('public terminal identity and observation boundary', () => {
  it('associates concurrent create requests with their own Session and host, and never grants input', async () => {
    const f = fixture(), signal = new AbortController().signal;
    await Promise.all([f.controller.create(f.agent('one', '/a'), { id: 'same' }, signal), f.controller.create(f.agent('two', '/b'), { id: 'same' }, signal)]);
    f.terminals.get('one').observation.output(Buffer.from('ONE_REMOTE'));
    f.terminals.get('two').observation.output(Buffer.from('TWO_REMOTE'));
    const one = await f.manager.context({ sessionId: 'one', workspaceRoot: '/a' } as any, 'same', signal);
    const two = await f.manager.context({ sessionId: 'two', workspaceRoot: '/b' } as any, 'same', signal);
    expect(one.text).toContain('ONE_REMOTE'); expect(one.text).not.toContain('TWO_REMOTE'); expect(one.terminal.alias).toBe('first');
    expect(two.text).toContain('TWO_REMOTE'); expect(two.terminal.alias).toBe('second');
    await expect(f.manager.context({ sessionId: 'one', workspaceRoot: '/b' } as any, 'same', signal)).rejects.toThrow('工作区已改变');
    expect(f.manager.reserve('ssh://first/work')).toBeUndefined(); f.unmount(); f.manager.dispose();
  });
  it('preserves raw local creation, marks old terminals unknown, and caps/sanitizes context', async () => {
    const f = fixture(), signal = new AbortController().signal;
    await f.controller.create(f.agent('local', '/local'), { id: 'local' }, signal);
    expect(f.terminals.get('local').observation).toBeUndefined();
    await expect(f.manager.list({ sessionId: 'local', workspaceRoot: '/local' } as any, signal)).rejects.toThrow('SSH');
    f.all.set('old', [{ id: 'old-id', title: 'old', state: 'running' }]);
    expect((await f.manager.list({ sessionId: 'old', workspaceRoot: '/a' } as any, signal))[0].state).toBe('unknown');
    await f.controller.create(f.agent('one', '/a'), { id: 'one' }, signal);
    f.terminals.get('one').observation.output(Buffer.from('x'.repeat(100000) + '\x1b[31mRED\x1b[0m\x00'));
    const view = await f.manager.context({ sessionId: 'one', workspaceRoot: '/a' } as any, 'one', signal);
    expect(Buffer.byteLength(view.text)).toBeLessThanOrEqual(65536); expect(view.truncated).toBe(true); expect(view.text).toContain('RED'); expect(view.text).not.toContain('\x1b'); expect(view.text).not.toContain('\0');
    f.unmount(); f.manager.dispose();
  });
  it('retains observations as stale on disconnect', async () => {
    const f = fixture(), signal = new AbortController().signal;
    await f.controller.create(f.agent('one', '/a'), { id: 'one' }, signal);
    const scope = { sessionId: 'one', workspaceRoot: '/a' } as any;
    await f.manager.list(scope, signal);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    f.terminals.get('one').shellState.mockRejectedValue(new Error('connection lost'));
    const rows = await f.manager.list(scope, signal); expect(rows[0].stale).toBe(true); expect(rows[0].recent[0].exitCode).toBe(1);
    clock.mockRestore(); f.unmount(); f.manager.dispose();
  });
  it('cannot revive a disposed association with late metadata or output', async () => {
    const f = fixture(), signal = new AbortController().signal, scope = { sessionId: 'one', workspaceRoot: '/a' } as any;
    await f.controller.create(f.agent('one', '/a'), { id: 'one' }, signal);
    const old = f.terminals.get('one'); let finish!: (value: unknown) => void;
    old.shellState.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.manager.list(scope, signal); f.unmount(); const unmount = f.manager.mount(f.controller);
    await f.controller.create(f.agent('one', '/a'), { id: 'one' }, signal);
    old.observation.output(Buffer.from('OLD_INSTANCE_OUTPUT'));
    finish({ ...snapshot, cwd: '/OLD_INSTANCE_CWD' }); await pending;
    const current = await f.manager.context(scope, 'one', signal);
    expect(current.text).not.toContain('OLD_INSTANCE'); expect(current.terminal.cwd).toBe('/work');
    unmount(); f.manager.dispose();
  });
  it('does not turn shell exit into a confirmed foreground command completion', async () => {
    const f = fixture(), signal = new AbortController().signal;
    await f.controller.create(f.agent('one', '/a'), { id: 'one' }, signal);
    const terminal = f.terminals.get('one'); terminal.shellState.mockResolvedValue({ ...snapshot, state: 'running', current: { ...snapshot.recent[0], exitCode: null, elapsedMs: null } });
    const scope = { sessionId: 'one', workspaceRoot: '/a' } as any;
    await f.manager.list(scope, signal); terminal.observation.closed();
    const result = await f.manager.list(scope, signal); expect(result[0].state).toBe('exited');
    expect(result[0].current?.exitCode).toBeNull(); expect(result[0].current?.uncertain).toBe(true);
    f.unmount(); f.manager.dispose();
  });
});
