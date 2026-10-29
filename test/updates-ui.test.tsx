// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateAction, UpdateBadge, UpdateNotice, UpdateSection, mountPluginUpdates, updateFailureText } from '../client/updates.js';
import { UpdateStore } from '../client/update-store.js';
import { installLocale } from '../client/locale.js';
import { localeFixture } from './locale-fixture.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return {
    ...(await import('./native-control-stubs.js')).nativeControls,
    Button: ({ variant: _variant, size: _size, children, ...props }: any) => h('button', props, children),
    Modal: ({ open, title, description, children, footer }: any) => open ? h('section', { role: 'dialog', 'aria-label': title }, h('p', {}, description), children, footer) : null,
    Toast: ({ text, actions, onDone }: any) => h('aside', { role: 'status' }, text, actions.map((action: any) => h('button', { key: action.label, onClick: action.onClick }, action.label)), h('button', { onClick: onDone }, 'dismiss')),
  };
});
let element: HTMLDivElement, root: Root, store: UpdateStore;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => { root.unmount(); store?.dispose(); }); element.remove(); });
const target = { version: '0.12.0', url: 'https://github.com/CrazyShout/dsh-ssh-remote/releases/tag/v0.12.0',
  packageUrl: 'https://github.com/CrazyShout/dsh-ssh-remote/releases/download/v0.12.0/dsh-ssh-remote-0.12.0.tgz',
  sha256: 'a'.repeat(64), testedDshVersions: ['0.2.0-rc.2'], publishedAt: '2026-10-19T00:00:00Z' };
async function render({ sourceKind = 'release', subject = 'dsh-ssh-remote', error = '', installedVersion = '0.11.2', runningVersion = '0.11.2', savedReceipt = '' } = {}) {
  const info = { profileId: 'ui-test', runningVersion, installedVersion, source: 'file:/tmp/previous.tgz', sourceKind, enabled: true };
  const remote = { info: vi.fn(async () => ({ ok: true, value: info })), check: vi.fn(async () => ({ ok: true, value: { latest: target, checkedAt: 1, error } })) };
  const installer = { installBundle: vi.fn(async () => ({ ok: false, error: { message: 'lost response' } })), waitForInstall: vi.fn(async () => ({ ok: true, value: null })), cancelInstall: vi.fn(async () => ({ ok: true, value: { status: 'not-running' } })) };
  const records = new Map(savedReceipt ? [['dsh-ssh-remote:updates:ui-test:pending', savedReceipt]] : []);
  const receipts = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
  store = new UpdateStore(remote as never, installer as never, undefined, receipts);
  const openUpdates = vi.fn(), props = { subject: { kind: 'bundle', pkg: { name: subject } }, updates: store, openUpdates };
  await act(async () => {
    await store.start(); await store.check(false);
    root.render(createElement('main', {}, createElement(UpdateAction, props as never), createElement(UpdateBadge, props as never), createElement(UpdateSection, props as never), createElement(UpdateNotice, { updates: store, openUpdates })));
  });
  return { remote, installer, openUpdates };
}
function button(label: string) { const b = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!b) throw new Error(`No button ${label}: ${element.textContent}`); return b; }
async function click(label: string) { await act(async () => { button(label).click(); }); }

describe('update entry and confirmation', () => {
  it('localizes typed network diagnostics without guessing from raw error strings', () => {
    const fixture = localeFixture(), dispose = installLocale(fixture.locale);
    try {
      fixture.change('en');
      expect(updateFailureText({ latest: null, checkedAt: 1, error: '中文原始错误', failure: { kind: 'network', stage: 'manifest', code: 'ECONNRESET' } })).toBe('Cannot reach GitHub. The latest version has not been confirmed.');
      expect(updateFailureText({ latest: null, checkedAt: 1, error: 'legacy Host error' })).toBe('legacy Host error');
    } finally { dispose(); }
  });
  it('replaces an old failure with neutral progress while manually rechecking', async () => {
    const s = await render({ error: 'offline' });
    let finish!: (result: any) => void;
    s.remote.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click('检查更新');
    expect(element.querySelector('[role=alert]')).toBeNull();
    expect(element.textContent).toContain('正在检查');
    await act(async () => finish({ ok: true, value: { latest: target, checkedAt: 2, error: '' } }));
    expect(element.textContent).not.toContain('offline');
  });
  it('does not say up to date when installed files are newer than the running code', async () => {
    await render({ installedVersion: '0.12.0' });
    expect(element.textContent).toContain('重新加载或重启后生效');
    expect(element.textContent).not.toContain('已是最新稳定版');
  });
  it('shows a lightweight notice and routes it to the existing plugin details without installing', async () => {
    const s = await render(); expect(element.textContent).toContain('有可用更新');
    await click('查看更新'); expect(s.openUpdates).toHaveBeenCalledOnce(); expect(s.installer.installBundle).not.toHaveBeenCalled();
    expect(element.querySelector('aside')).toBeNull(); expect(element.textContent).toContain('有可用更新');
  });
  it('requires confirmation, describes terminal/draft impact, and leaves cancel side-effect-free', async () => {
    const s = await render(); await click('更新到 0.12.0');
    expect(element.querySelector('[role=dialog]')?.textContent).toContain('不会自动重启');
    expect(s.installer.installBundle).not.toHaveBeenCalled();
    await click('暂不更新'); expect(element.querySelector('[role=dialog]')).toBeNull();
    await click('更新到 0.12.0'); await click('确认更新');
    expect(s.installer.installBundle).toHaveBeenCalledOnce(); expect(element.textContent).toContain('响应未确认');
    expect(button('更新到 0.12.0').disabled).toBe(true);
  });
  it('preserves development-source instructions and offers no archive overwrite action', async () => {
    const s = await render({ sourceKind: 'development' }); expect(element.textContent).toContain('源码链接');
    expect([...element.querySelectorAll('button')].some(node => node.textContent === '更新到 0.12.0')).toBe(false);
    await click('检查更新'); expect(s.installer.installBundle).not.toHaveBeenCalled();
  });
  it('does not contribute version controls to other packages', async () => {
    await render({ subject: 'another-plugin' }); expect(element.querySelector('[aria-label="SSH 插件版本更新"]')).toBeNull();
    expect([...element.querySelectorAll('button')].some(node => node.textContent === '检查更新')).toBe(false);
  });
  it('reports errors in place without a false up-to-date label or notification, safely as text', async () => {
    await render({ error: '<img src=x onerror=alert(1)> GitHub unavailable' });
    expect(element.querySelector('[role=alert]')?.textContent).toContain('<img');
    expect(element.querySelector('img')).toBeNull(); expect(element.querySelector('aside')).toBeNull();
    expect(element.textContent).not.toContain('已是最新稳定版');
  });
  it('turns automatic notifications off without removing manual checks', async () => {
    const s = await render();
    await act(async () => { element.querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); });
    expect(store.getSnapshot().automatic).toBe(false); expect(element.querySelector('aside')).toBeNull();
    await click('检查更新'); expect(s.remote.check).toHaveBeenLastCalledWith(true);
  });
  it('keeps checks available for unknown results and requires confirmation to dismiss the old notice', async () => {
    const s = await render();
    await click('更新到 0.12.0'); await click('确认更新');
    expect(store.getSnapshot().operation?.phase).toBe('unknown');
    expect(button('检查更新').disabled).toBe(false);
    const infoCalls = s.remote.info.mock.calls.length;
    await click('检查更新');
    expect(s.remote.info.mock.calls.length).toBeGreaterThan(infoCalls);
    expect(s.installer.installBundle).toHaveBeenCalledOnce();
    await click('重新确认结果');
    expect(button('结束这次提示')).toBeDefined();
    const finish = vi.spyOn(store, 'finishUnknown');
    await click('结束这次提示');
    expect(element.querySelector('[role=dialog]')?.textContent).toContain('不会取消安装、回退版本或删除文件');
    expect(element.querySelector('[role=dialog]')?.textContent).toContain('不代表上次安装已取消');
    await click('保留提示');
    expect(finish).not.toHaveBeenCalled();
    await click('结束这次提示'); await click('确认结束提示');
    expect(finish).toHaveBeenCalledOnce();
    expect(store.getSnapshot().operation).toBeUndefined();
    expect(button('更新到 0.12.0').disabled).toBe(false);
    expect(s.installer.installBundle).toHaveBeenCalledOnce();
    expect(s.installer.cancelInstall).not.toHaveBeenCalled();
  });
  it('does not offer dismissal while recovery is pending or failed, but allows read-only checks', async () => {
    const s = await render(); await click('更新到 0.12.0'); await click('确认更新');
    let finish!: (result: any) => void;
    s.installer.waitForInstall.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click('重新确认结果');
    expect(button('重新确认结果').disabled).toBe(true);
    expect(button('检查更新').disabled).toBe(false);
    expect([...element.querySelectorAll('button')].some(b => b.textContent === '结束这次提示')).toBe(false);
    await click('检查更新');
    expect(s.installer.installBundle).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: false, error: { message: 'connection unavailable' } }));
    expect(button('重新确认结果').disabled).toBe(false);
    expect([...element.querySelectorAll('button')].some(b => b.textContent === '结束这次提示')).toBe(false);
  });
  it('closes the dismissal dialog when the profile changes', async () => {
    const s = await render(); await click('更新到 0.12.0'); await click('确认更新'); await click('重新确认结果');
    await click('结束这次提示');
    const finish = vi.spyOn(store, 'finishUnknown');
    const previous = (await s.remote.info()).value;
    s.remote.info.mockResolvedValue({ ok: true, value: { ...previous, profileId: 'other-profile' } });
    await act(async () => { await store.start(); });
    expect(element.querySelector('[role=dialog]')).toBeNull();
    expect(finish).not.toHaveBeenCalled();
    expect(s.installer.installBundle).toHaveBeenCalledOnce();
  });
  it('shows activation failure details and copies the full official log path', async () => {
    const s = await render();
    const info = (await s.remote.info()).value;
    const path = '/profile/中文 空格/' + 'long-directory/'.repeat(45) + 'pnpm.log';
    const diagnostic = '<img src=x onerror=alert(1)> activation failure';
    s.installer.installBundle.mockImplementation(async () => {
      s.remote.info.mockResolvedValue({ ok: true, value: { ...info, installedVersion: target.version, source: target.packageUrl } });
      return { ok: true, value: { changed: true, application: 'failed', stage: 'enable', target: target.packageUrl,
        error: { code: 'operation-error', diagnostic }, packageResult: { exitCode: 0, output: 'not displayed', truncated: false, logPath: path } } } as any;
    });
    await click('更新到 0.12.0'); await click('确认更新');
    expect(element.textContent).toContain('当前运行 0.11.2');
    expect(element.textContent).toContain('已安装 0.12.0');
    expect([...element.querySelectorAll('button')].some(b => b.textContent === '更新到 0.12.0')).toBe(false);
    const details = [...element.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent === '更新详情')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(diagnostic);
    expect(details.textContent).toContain('处理阶段：启用');
    expect(details.querySelector('img')).toBeNull();
    expect(details.querySelector('code')?.textContent).toBe(path);
    expect(details.querySelector('code')?.style.overflowWrap).toBe('anywhere');
    const copy = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    await click('复制日志路径');
    expect(copy).toHaveBeenCalledWith(path);
    expect(element.textContent).toContain('已复制日志路径。');
  });
  it('does not suggest a restart while an installation is still applying', async () => {
    const s = await render();
    let finish!: (result: any) => void;
    s.installer.installBundle.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click('更新到 0.12.0'); await click('确认更新');
    const info = (await s.remote.info()).value;
    s.remote.info.mockResolvedValue({ ok: true, value: { ...info, installedVersion: target.version } });
    await act(async () => { store.progress(store.getSnapshot().operation!.requestId, 'applying'); await store.refreshInstallation(); });
    expect(element.textContent).toContain('已安装 0.12.0，正在确认是否生效');
    expect(element.textContent).not.toContain('重新加载或重启后生效');
    expect(button('检查更新').disabled).toBe(false);
    await act(async () => finish({ ok: true, value: { changed: true, application: 'restart-required', stage: 'install', target: target.packageUrl } }));
    expect(element.textContent).toContain('重新加载或重启后生效');
  });
  it('does not claim up-to-date when the current installation cannot be read', async () => {
    const s = await render({ installedVersion: target.version, runningVersion: target.version });
    expect(element.textContent).toContain('已是最新稳定版');
    s.remote.info.mockResolvedValue({ ok: false, error: { message: 'profile unavailable' } } as any);
    await click('检查更新');
    expect(element.textContent).toContain('当前安装信息未确认');
    expect(element.textContent).not.toContain('已是最新稳定版');
    expect(s.installer.installBundle).not.toHaveBeenCalled();
  });
  it('uses the DSH locale for the recovery confirmation', async () => {
    const fixture = localeFixture(), dispose = installLocale(fixture.locale);
    try {
      const s = await render(); await click('更新到 0.12.0'); await click('确认更新'); await click('重新确认结果');
      await act(async () => { fixture.change('en'); root.render(createElement(UpdateSection, {
        subject: { kind: 'bundle', pkg: { name: 'dsh-ssh-remote' } }, updates: store, openUpdates: s.openUpdates,
      } as never)); });
      await click('Dismiss this notice');
      expect(element.querySelector('[role=dialog]')?.textContent).toContain('does not cancel installation');
      expect(element.querySelector('[role=dialog]')?.textContent).toContain('Nothing will be reinstalled automatically');
      expect(s.installer.installBundle).toHaveBeenCalledOnce();
    } finally { dispose(); }
  });
  it('keeps a corrupt previous record visible without locking read-only version checks', async () => {
    const s = await render({ savedReceipt: '{broken json' });
    expect(element.textContent).toContain('上次更新记录无法读取');
    expect(button('检查更新').disabled).toBe(false);
    await click('检查更新');
    expect(element.textContent).toContain('上次更新记录无法读取');
    expect(s.installer.installBundle).not.toHaveBeenCalled();
    expect([...element.querySelectorAll('button')].some(b => b.textContent === '更新到 0.12.0')).toBe(false);
  });
  it('refreshes installation state on the public plugin-change event and removes the listener on disposal', async () => {
    const events = new Map<string, (...args: any[]) => void>();
    const info = vi.fn(async () => ({ ok: true, value: { profileId: 'mount-test', runningVersion: '0.11.2', installedVersion: '0.11.2', source: 'file:/tmp/plugin.tgz', sourceKind: 'release', enabled: true } }));
    const check = vi.fn(async () => ({ ok: true, value: { checkedAt: Date.now(), latest: target, error: '' } }));
    const install = vi.fn();
    const register = (name: string, callback: (...args: any[]) => void) => {
      events.set(name, callback);
      return () => { events.delete(name); };
    };
    const scope = {
      remote: { sshRemoteUpdates: { info, check }, pluginManager: { installBundle: install }, $on: register },
      slots: { inject: (_name: string, callback: () => () => void) => callback(), register: () => () => {} },
      pluginNavigation: { openBundle: vi.fn() }, on: register,
    };
    const dispose = mountPluginUpdates({ inject: (_dependencies: unknown, callback: (value: typeof scope) => () => void) => {
      const teardown = callback(scope);
      return { dispose: async () => { teardown(); } };
    } } as never);
    try {
      await vi.waitFor(() => expect(info).toHaveBeenCalledOnce());
      events.get('plugin-manager/changed')!({ kind: 'install' });
      await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(2));
      expect(install).not.toHaveBeenCalled();
    } finally { await dispose(); }
    expect(events.size).toBe(0);
  });
});
