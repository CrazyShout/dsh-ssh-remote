// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateAction, UpdateBadge, UpdateNotice, UpdateSection } from '../client/updates.js';
import { UpdateStore } from '../client/update-store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return {
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
async function render({ sourceKind = 'release', subject = 'dsh-ssh-remote', error = '', installedVersion = '0.11.2' } = {}) {
  const info = { profileId: 'ui-test', runningVersion: '0.11.2', installedVersion, source: 'file:/tmp/previous.tgz', sourceKind, enabled: true };
  const remote = { info: vi.fn(async () => ({ ok: true, value: info })), check: vi.fn(async () => ({ ok: true, value: { latest: target, checkedAt: 1, error } })) };
  const installer = { installBundle: vi.fn(async () => ({ ok: false, error: { message: 'lost response' } })), waitForInstall: vi.fn(), cancelInstall: vi.fn() };
  store = new UpdateStore(remote as never, installer as never);
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
});
