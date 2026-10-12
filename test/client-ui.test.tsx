// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SshDirectoryFlow, SshRemotePanel } from '../client/index.js';
import { BlankNativePanelActions, NativePanelActions } from '../client/native-panels.js';

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
  function nativeProps() {
    const props = directoryProps(remote());
    props.listLocal.mockRejectedValue(Object.assign(new Error('native picker has no browse capability'), {
      rpcError: { code: 'directory-picker/unavailable' },
    }));
    return props;
  }

  async function chooseLocal() {
    const local = [...container.querySelectorAll('button')].find(item => item.querySelector('strong')?.textContent === '本机')!;
    await act(async () => local.click());
  }

  it('times out a stuck native chooser, aborts its signal and releases the dialog', async () => {
    vi.useFakeTimers();
    const props = nativeProps();
    let signal: AbortSignal | undefined;
    props.pickLocal.mockImplementation((next: AbortSignal) => {
      signal = next;
      return new Promise((_resolve, reject) => next.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    await render(SshDirectoryFlow, props);
    expect(container.textContent).toContain('使用系统文件夹选择器');
    await chooseLocal();
    expect(signal?.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).toContain('系统文件夹选择器超过 30 秒未返回');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(props.onPicked).not.toHaveBeenCalled();
    expect(button('取消').disabled).toBe(false);
  });

  it('ignores a timed-out fallback chooser that cannot honor cancellation', async () => {
    vi.useFakeTimers();
    const props = nativeProps();
    const pending = deferred();
    props.pickLocal.mockReturnValue(pending.promise);
    await render(SshDirectoryFlow, props);
    await chooseLocal();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => pending.resolve('/late-selection'));
    expect(props.onPicked).not.toHaveBeenCalled();
    expect(container.textContent).toContain('已停止等待');
  });

  it.each(['cancel', 'close'])('aborts the native chooser on %s without accepting a late selection', async kind => {
    const props = nativeProps();
    const pending = deferred();
    let signal: AbortSignal | undefined;
    props.pickLocal.mockImplementation((next: AbortSignal) => { signal = next; return pending.promise; });
    await render(SshDirectoryFlow, props);
    await chooseLocal();
    if (kind === 'cancel') await click('取消');
    else await render(SshDirectoryFlow, { ...props, open: false });
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve('/late-selection'));
    expect(props.onPicked).not.toHaveBeenCalled();
  });

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

describe('native remote workspace panel entry points', () => {
  function panelProps(cwd: string | undefined = '/real-saved-anchor') {
    return {
      sessionId: 'session-a',
      useSessions: (selector: any) => selector({ byId: { 'session-a': { cwd } } }),
      workspaceInfo: vi.fn(async () => ok({ alias: 'gpu', remotePath: '/home/test/project', uri: 'ssh://gpu/home/test/project' })),
      openPanel: vi.fn(),
      availablePanels: () => 3,
      subscribePanels: () => () => {},
    };
  }

  it('offers native panels above the composer for a blank real Session without submitting a prompt', async () => {
    const props = {
      ...panelProps(),
      session: { blank: true, running: false, promptAttempted: false },
      useConversation: (selector: any) => selector({ activeTargets: new Set() }),
    };
    await render(BlankNativePanelActions, props);
    await click('远程文件');
    await click('远程终端');
    expect(props.openPanel.mock.calls).toEqual([['files'], ['terminal']]);
    expect(container.querySelector<HTMLElement>('[aria-label^="远程工作区"]')?.style.justifyContent).toBe('flex-end');
  });

  it.each([
    { blank: false, running: false, promptAttempted: false, active: false },
    { blank: true, running: true, promptAttempted: false, active: false },
    { blank: true, running: false, promptAttempted: true, active: false },
    { blank: true, running: false, promptAttempted: false, active: true },
  ])('does not duplicate the header controls after blank chrome ends: %j', async state => {
    const props = {
      ...panelProps(),
      session: state,
      useConversation: (selector: any) => selector({ activeTargets: new Set(state.active ? ['active'] : []) }),
    };
    await render(BlankNativePanelActions, props);
    expect(container.textContent).toBe('');
    expect(props.workspaceInfo).not.toHaveBeenCalled();
  });

  it('opens the official tab kinds using verified workspace identity and explains terminal permissions', async () => {
    const props = panelProps();
    await render(NativePanelActions, props);
    expect(props.workspaceInfo).toHaveBeenCalledWith('/real-saved-anchor');
    expect(container.textContent).toContain('SSH · gpu');
    expect(button('远程文件').title).toContain('gpu:/home/test/project');
    expect(button('远程终端').title).toContain('使用 SSH 账号权限，不受模型沙箱限制');
    await click('远程文件');
    await click('远程终端');
    expect(props.openPanel.mock.calls).toEqual([['files'], ['terminal']]);
  });

  it('never infers remote identity from an anchor-looking local path or title', async () => {
    const props = panelProps('/home/test/.dsh/ssh-workspace-anchors/fake-gpu');
    props.workspaceInfo.mockResolvedValue(ok(null) as any);
    await render(NativePanelActions, props);
    expect(container.textContent).toBe('');
    expect(props.openPanel).not.toHaveBeenCalled();
  });

  it('ignores an old identity response after switching to a local Session', async () => {
    const previous = deferred();
    const props = panelProps();
    props.workspaceInfo.mockReturnValue(previous.promise);
    await render(NativePanelActions, props);
    const local = panelProps('/local/project');
    local.workspaceInfo.mockResolvedValue(ok(null) as any);
    await render(NativePanelActions, local);
    await act(async () => previous.resolve(ok({ alias: 'old', remotePath: '/old', uri: 'ssh://old/old' })));
    expect(container.textContent).toBe('');
  });

  it('reacts to optional tab availability and surfaces a navigation failure without breaking the header', async () => {
    const props = panelProps();
    let available = 0;
    let changed = () => {};
    props.availablePanels = () => available;
    props.subscribePanels = (listener: () => void) => { changed = listener; return () => {}; };
    await render(NativePanelActions, props);
    expect(button('远程文件').disabled).toBe(true);
    expect(button('远程终端').disabled).toBe(true);
    expect(button('远程终端').title).toContain('尚未加载');
    await act(async () => { available = 3; changed(); });
    expect(button('远程终端').disabled).toBe(false);
    props.openPanel.mockImplementation(() => { throw new Error('会话已切换'); });
    await click('远程终端');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('会话已切换');
  });

  it('does not open a remote panel after a timed-out identity lookup or without a cwd', async () => {
    vi.useFakeTimers();
    const props = panelProps();
    const pending = deferred();
    props.workspaceInfo.mockReturnValue(pending.promise);
    await render(NativePanelActions, props);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await act(async () => pending.resolve(ok({ alias: 'late', remotePath: '/late', uri: 'ssh://late/late' })));
    expect(container.textContent).toBe('');
    const noCwd = panelProps('');
    await render(NativePanelActions, noCwd);
    expect(noCwd.workspaceInfo).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });
});
