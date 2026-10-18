// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Workbench, mountWorkbenchSection, type WorkbenchProps } from '../client/workbench.js';
import { mountQuickOpen } from '../client/quick-open.js';
import { mountPortForwards } from '../client/port-forwards.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null, Input: () => null, FileTypeIcon: () => null,
}));

describe('workbench service lifetime', () => {
  it('restores a legacy tab with a receiver-bound registry subscription and waits for the workbench', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const workbench = new Workbench();
    class Registry {
      kinds = new Set<string>(); listeners = new Set<() => void>();
      get(kind: string) { return this.kinds.has(kind) ? { kind } : undefined; }
      subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
      register({ kind }: { kind: string }) {
        this.kinds.add(kind); for (const listener of this.listeners) listener();
        return () => { this.kinds.delete(kind); for (const listener of this.listeners) listener(); };
      }
    }
    const registry = new Registry(), openTabIn = vi.fn();
    let Redirect: any;
    const scope = { sidebarRightTabs: registry, sidebarRight: { openTabIn },
      slots: { inject: (_: string, fn: () => unknown) => fn(), register: (_: unknown, component: unknown) => { Redirect = component; return () => {}; } } };
    const dispose = mountWorkbenchSection(scope as unknown as Context, workbench, 'ports', 'ssh-ports', 'ports', () => null);
    const container = document.createElement('div'), root = createRoot(container);
    let visible = false;
    const props = { sessionId: 'a', useTabInfo: () => ({ tab: { id: 'legacy-port-tab', visible } }) };
    await act(async () => root.render(createElement(Redirect, props)));
    expect(registry.listeners.size).toBe(1); expect(openTabIn).not.toHaveBeenCalled();
    await act(async () => { registry.register({ kind: 'ssh-tools' }); });
    expect(openTabIn).not.toHaveBeenCalled();
    visible = true;
    await act(async () => root.render(createElement(Redirect, props)));
    expect(openTabIn).toHaveBeenCalledExactlyOnceWith('a', 'ssh-tools', { replaceTab: 'legacy-port-tab', params: { section: 'ports' } });
    expect(workbench.selected('a')).toBe('ports');
    await act(async () => root.unmount()); expect(registry.listeners.size).toBe(0);
    dispose();
  });
  it('keeps service faces stable across parent status and size renders, but replaces them on remount', async () => {
    const workbench = new Workbench();
    const scope = {
      remote: {
        get sshRemoteFiles() { return { query() {}, preview() {} }; },
        get sshRemotePorts() { return { list() {} }; },
      },
      sidebarRightTabs: { register: () => () => {} },
      slots: { inject: (_: string, fn: () => unknown) => fn(), register: () => () => {} },
      inject(dependencies: string[], fn: (ctx: unknown) => unknown) {
        const dispose = dependencies.includes('inputTriggers') || dependencies.includes('shortcuts') ? undefined : fn(scope);
        return { dispose: async () => { if (typeof dispose === 'function') await dispose(); } };
      },
    };
    const props = { sessionId: 'a', active: true } as WorkbenchProps;
    const face = (section: 'files' | 'ports') => (workbench.render(section, props) as ReactElement<{ remote: unknown }>).props.remote;
    const removeFiles = mountQuickOpen(scope as unknown as Context, {}, workbench);
    const removePorts = mountPortForwards(scope as unknown as Context, workbench);
    const files = face('files'), ports = face('ports');
    expect(face('files')).toBe(files); expect(face('ports')).toBe(ports);
    await removeFiles(); await removePorts();
    const remount = mountQuickOpen(scope as unknown as Context, {}, workbench);
    expect(face('files')).not.toBe(files);
    await remount();
  });
});
