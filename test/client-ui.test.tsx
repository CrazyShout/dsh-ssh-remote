// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SshDirectoryFlow, SshRemotePanel } from '../client/index.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: element } = await import('react');
  const button = ({ children, icon: _icon, variant: _variant, size: _size, ...props }: any) =>
    element('button', props, children);
  return {
    Button: button,
    Pill: button,
    Input: (props: any) => element('input', props),
    IconFolderCloseRegular: () => null,
    IconPlusOutlineRegular: () => null,
    Modal: ({ open, title, description, children, footer }: any) => open
      ? element('section', {}, element('h2', {}, title), element('p', {}, description), children, footer)
      : null,
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const ok = <T,>(value: T) => ({ ok: true as const, value });
function status(state = 'disconnected', extra = {}) {
  return { status: state, version: '', sessionId: '', capabilities: {}, error: '', ...extra };
}
function config(aliases = ['alpha', 'beta']) {
  return {
    configPath: '/home/test/.ssh/config', configExists: true, legacyHostCount: 0,
    hosts: aliases.map(alias => ({ alias, host: alias, port: 22, user: 'test', identityFile: '', proxyJump: '', proxyCommand: '', helper: status() })),
  };
}
function remote() {
  return {
    config: vi.fn(async () => ok(config())),
    statuses: vi.fn(async () => ok({})),
    connectHost: vi.fn(async () => ok(status('connected'))),
    disconnectHost: vi.fn(async () => ok(status('disconnected'))),
    retryHost: vi.fn(async () => ok(status('connected'))),
    diagnostics: vi.fn(async () => ok(status('connected'))),
    browse: vi.fn(async (_alias: string, path: string) => ok(listing(path || '/home/test'))),
    createDirectory: vi.fn(), materializeWorkspace: vi.fn(),
  };
}
function listing(path: string) {
  return {
    path, home: '/home/test', crumbs: [], truncated: true,
    entries: [{ name: 'existing-child', path: `${path}/existing-child`, hidden: false }],
  };
}
async function render(component: any, props: any) {
  await act(async () => { root.render(createElement(component, props)); });
}
function group(alias: string) {
  const found = container.querySelector(`[aria-label="SSH 主机 ${alias}"]`);
  if (!found) throw new Error(`missing host ${alias}`);
  return found;
}
function button(text: string, scope: ParentNode = container) {
  const found = [...scope.querySelectorAll('button')].find(node => node.textContent === text);
  if (!found) throw new Error(`missing button ${text}: ${container.textContent}`);
  return found;
}
async function click(text: string, scope: ParentNode = container) {
  await act(async () => { button(text, scope).click(); });
}
async function path(value: string, enter = false) {
  const input = container.querySelector<HTMLInputElement>('[aria-label="文件夹路径"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (enter) await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
}

describe('rendered SSH settings', () => {
  it('keeps a host action error visible after a successful config refresh', async () => {
    const ssh = remote();
    ssh.connectHost.mockResolvedValue({ ok: false, error: { message: 'authentication rejected' } } as any);
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    await click('刷新');
    expect(group('alpha').querySelector('[role="alert"]')?.textContent).toBe('authentication rejected');
    expect(group('beta').querySelector('[role="alert"]')).toBeNull();
  });

  it('tracks busy state independently and lets stop supersede an in-flight connect', async () => {
    const ssh = remote();
    const alpha = deferred();
    const beta = deferred();
    ssh.connectHost.mockImplementation(alias => alias === 'alpha' ? alpha.promise : beta.promise);
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    await click('连接', group('beta'));
    await act(async () => alpha.resolve(ok(status('connected'))));
    expect(button('重试', group('alpha')).disabled).toBe(false);
    expect(button('重试', group('beta')).disabled).toBe(true);
    expect(button('停止 / 断开', group('beta')).disabled).toBe(false);
    await click('停止 / 断开', group('beta'));
    expect(ssh.disconnectHost).toHaveBeenCalledWith('beta');
    await act(async () => beta.resolve(ok(status('connected'))));
    expect(button('连接', group('beta')).disabled).toBe(false);
    expect(group('beta').textContent).toContain('未连接');
  });

  it('does not overlap polls and ignores a status response from before disconnect', async () => {
    vi.useFakeTimers();
    const ssh = remote();
    const poll = deferred();
    ssh.statuses.mockReturnValue(poll.promise);
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(ssh.statuses).toHaveBeenCalledTimes(1);
    await click('停止 / 断开', group('alpha'));
    await act(async () => poll.resolve(ok({ alpha: status('connected') })));
    expect(group('alpha').textContent).toContain('未连接');
    expect(button('连接', group('alpha')).disabled).toBe(false);
  });

  it('does not let a config refresh started earlier undo a completed disconnect', async () => {
    const ssh = remote();
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    const refresh = deferred();
    ssh.config.mockReturnValueOnce(refresh.promise);
    await click('刷新');
    await click('停止 / 断开', group('alpha'));
    const stale = config();
    stale.hosts[0].helper = status('connected');
    await act(async () => refresh.resolve(ok(stale)));
    expect(group('alpha').textContent).toContain('未连接');
    expect(button('连接', group('alpha')).disabled).toBe(false);
  });

  it('ignores an action reply after the settings panel unmounts', async () => {
    const ssh = remote();
    const connect = deferred();
    ssh.connectHost.mockReturnValueOnce(connect.promise);
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    await act(async () => root.render(null));
    await act(async () => connect.resolve(ok(status('connected'))));
    expect(container.textContent).toBe('');
    await render(SshRemotePanel, { ssh });
    expect(group('alpha').textContent).toContain('未连接');
  });

  it('bounds stuck actions and ignores late results after stop', async () => {
    vi.useFakeTimers();
    const ssh = remote();
    const connect = deferred();
    ssh.connectHost.mockReturnValue(connect.promise);
    await render(SshRemotePanel, { ssh });
    await click('连接', group('alpha'));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(group('alpha').textContent).toContain('结果未知');
    await click('停止 / 断开', group('alpha'));
    await act(async () => connect.resolve(ok(status('connected'))));
    expect(group('alpha').textContent).toContain('未连接');
  });

  it('explains missing search capability without hiding other helper capabilities', async () => {
    const ssh = remote();
    const data = config(['alpha']);
    data.hosts[0].helper = status('degraded', {
      capabilities: { filesystem: {}, pty: { supported: true } },
      environment: { search: { available: false, error: 'rg missing' } },
      hint: 'Install ripgrep on the remote host.',
    });
    ssh.config.mockResolvedValue(ok(data));
    await render(SshRemotePanel, { ssh });
    expect(group('alpha').textContent).toContain('filesystem · pty');
    expect(group('alpha').textContent).toContain('远程搜索：不可用');
    expect(group('alpha').textContent).toContain('Install ripgrep');
  });
});

function directoryProps(ssh: ReturnType<typeof remote>) {
  return {
    open: true, busy: false, ssh,
    onPicked: vi.fn(), onCancel: vi.fn(), onError: vi.fn(),
    pickLocal: vi.fn(), listLocal: vi.fn(async () => listing('/local')),
    createLocalDirectory: vi.fn(), createWorkspace: vi.fn(), renameWorkspace: vi.fn(),
  };
}
async function openRemote(ssh: ReturnType<typeof remote>) {
  await render(SshDirectoryFlow, directoryProps(ssh));
  const host = [...container.querySelectorAll('button')].find(item => item.querySelector('strong')?.textContent === 'alpha')!;
  await act(async () => host.click());
}

describe('rendered SSH directory flow', () => {
  it('opens an unlisted absolute path with Enter and supports home and refresh', async () => {
    const ssh = remote();
    await openRemote(ssh);
    expect(container.textContent).toContain('输入完整路径前往');
    await path('/data/中文 project/unlisted-1001', true);
    expect(ssh.browse).toHaveBeenLastCalledWith('alpha', '/data/中文 project/unlisted-1001');
    await click('刷新目录');
    expect(ssh.browse).toHaveBeenLastCalledWith('alpha', '/data/中文 project/unlisted-1001');
    await click('主目录');
    expect(ssh.browse).toHaveBeenLastCalledWith('alpha', '/home/test');
  });

  it('preserves the previous listing when navigation fails', async () => {
    const ssh = remote();
    await openRemote(ssh);
    ssh.browse.mockResolvedValueOnce({ ok: false, error: { message: 'permission denied' } } as any);
    await path('/forbidden', true);
    expect(container.textContent).toContain('permission denied');
    expect(button('existing-child')).toBeTruthy();
    await click('刷新目录');
    expect(ssh.browse).toHaveBeenLastCalledWith('alpha', '/home/test');
  });

  it('ignores an older navigation response and a reply after the dialog closes', async () => {
    const ssh = remote();
    await openRemote(ssh);
    const older = deferred();
    ssh.browse.mockImplementation(async (_alias, target) => target === '/old' ? older.promise : ok(listing(target)));
    await path('/old', true);
    await path('/new', true);
    await act(async () => older.resolve(ok(listing('/old'))));
    expect(container.querySelector<HTMLInputElement>('[aria-label="文件夹路径"]')?.value).toBe('/new');
    const late = deferred();
    ssh.browse.mockReturnValue(late.promise);
    await path('/late', true);
    await render(SshDirectoryFlow, { ...directoryProps(ssh), open: false });
    await act(async () => late.resolve(ok(listing('/late'))));
    expect(container.textContent).toBe('');
  });

  it('times out a stuck browse while retaining a usable path and cancel control', async () => {
    vi.useFakeTimers();
    const ssh = remote();
    await openRemote(ssh);
    const pending = deferred();
    ssh.browse.mockReturnValue(pending.promise);
    await path('/stuck', true);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(container.textContent).toContain('远程目录浏览 超过 30 秒');
    expect(button('刷新目录').disabled).toBe(false);
    expect(button('取消').disabled).toBe(false);
    await act(async () => pending.resolve(ok(listing('/stuck'))));
    await click('刷新目录');
    expect(ssh.browse).toHaveBeenLastCalledWith('alpha', '/home/test');
  });
});
