// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortForwardModel, browserIsOnHost, forwardUrl } from '../client/port-forward-model.js';
import { PortForwardPane } from '../client/port-forwards.js';
import type { PortForwardInput, PortForwardView } from '../client/port-forward-types.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { Button: ({ size: _size, children, ...props }: any) => h('button', props, children), Input: (props: any) => h('input', props) };
});
const ok = <T,>(value: T) => ({ ok: true as const, value });
function row(input: Partial<PortForwardView> = {}): PortForwardView {
  return { id: 'test-forward-identity', localPort: 16006, remotePort: 6006, protocol: 'http', alias: 'gpu', state: 'listening',
    probe: { state: 'unreachable', message: '请先启动远端服务' }, error: '', createdAt: 1, canRetry: false, ...input };
}
const models: PortForwardModel[] = [];
afterEach(() => { models.splice(0).forEach(m => m.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  const list = { host: 'host-machine', alias: 'gpu', supported: true, items: [] as PortForwardView[] };
  const remote = { list: vi.fn(async () => ok(list)), create: vi.fn(async (_session: string, input: PortForwardInput) => ok(row(input))),
    stop: vi.fn(async (_session: string, id: string) => ok(row({ id, state: 'stopped', canRetry: true }))),
    probe: vi.fn(async () => ok(row())) };
  const model = new PortForwardModel('original-session', remote); models.push(model);
  return { remote, model, list };
}
describe('port forwarding UI ownership', () => {
  it('rejects browser-local assumptions when the DSH Host is remote', () => {
    expect(browserIsOnHost({ protocol: 'http:', hostname: '192.0.2.1' })).toBe(false);
    expect(browserIsOnHost({ protocol: 'https:', hostname: 'server.example' })).toBe(false);
    expect(browserIsOnHost({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(false);
    expect(browserIsOnHost({ protocol: 'dsh-app:', hostname: 'app' })).toBe(true);
    expect(forwardUrl(row())).toBe('http://127.0.0.1:16006/');
    expect(() => forwardUrl({ localPort: 16006, protocol: 'javascript' as any })).toThrow();
  });
  it('preserves operation failures across refresh and blocks duplicate creates while outcome is uncertain', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.model.refresh();
    f.remote.create.mockImplementationOnce(() => new Promise(() => {}));
    const pending = f.model.create({ localPort: 16006, remotePort: 6006, protocol: 'http' });
    await vi.advanceTimersByTimeAsync(8001); await pending;
    expect(f.model.snapshot().pending).toBeDefined(); expect(f.model.snapshot().error).toContain('待确认');
    await f.model.refresh(); expect(f.model.snapshot().error).toContain('待确认');
    await f.model.create({ localPort: 16006, remotePort: 6006, protocol: 'http' });
    expect(f.remote.create).toHaveBeenCalledTimes(1);
    const id = f.model.snapshot().pending!.id; await f.model.stop(id);
    expect(f.remote.stop).toHaveBeenCalledWith('original-session', id);
    expect(f.model.snapshot().pending).toBeUndefined();
  });
  it('does not resurrect a stopped request with a late create response', async () => {
    const f = fixture(); await f.model.refresh();
    let resolve!: (value: any) => void;
    f.remote.create.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = f.model.create({ localPort: 16006, remotePort: 6006, protocol: 'http' });
    const id = f.model.snapshot().pending!.id;
    await f.model.stop(id); resolve(ok(row({ id, state: 'starting' }))); await pending;
    expect(f.model.snapshot().list?.items.some(r => r.state === 'starting')).toBe(false);
    expect(f.model.snapshot().pending).toBeUndefined();
  });
  it('marks refresh timeouts stale without discarding the last snapshot', async () => {
    vi.useFakeTimers(); const f = fixture(); f.list.items = [row()]; await f.model.refresh();
    f.remote.list.mockImplementationOnce(() => new Promise(() => {}));
    const refresh = f.model.refresh(); await vi.advanceTimersByTimeAsync(8001); await refresh;
    expect(f.model.snapshot().list?.items).toHaveLength(1);
    expect(f.model.snapshot().listError).toContain('上次状态');
    await f.model.refresh(); expect(f.model.snapshot().listError).toBe('');
  });
  it('ignores a pre-operation list reply and clears pending only for a known refusal', async () => {
    const f = fixture(); await f.model.refresh();
    let resolve!: (value: any) => void;
    f.remote.list.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const old = f.model.refresh();
    f.remote.create.mockResolvedValueOnce({ ok: false, error: { code: 'ssh-ports/refused', message: 'port occupied' } } as any);
    await f.model.create({ localPort: 16006, remotePort: 6006, protocol: 'http' });
    resolve(ok({ ...f.list, items: [row()] })); await old;
    expect(f.model.snapshot().pending).toBeUndefined();
    expect(f.model.snapshot().error).toBe('port occupied');
    expect(f.model.snapshot().list?.items).toHaveLength(0);
  });
  it('renders separate listening and target-port status, and calls Stop with its Session', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const f = fixture(); f.list.items = [row()];
    const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => root.render(createElement(PortForwardPane, { sessionId: 'original-session', remote: f.remote })));
    expect(container.textContent).toContain('本机监听已建立'); expect(container.textContent).toContain('请先启动远端服务');
    expect(container.querySelector('a')).toBeNull();
    await act(async () => (container.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    expect(container.querySelector('a')?.getAttribute('href')).toBe('http://127.0.0.1:16006/');
    const stop = [...container.querySelectorAll('button')].find(b => b.textContent === '停止')!;
    await act(async () => stop.click());
    expect(f.remote.stop).toHaveBeenCalledWith('original-session', 'test-forward-identity');
    await act(async () => root.unmount()); container.remove();
  });
});
