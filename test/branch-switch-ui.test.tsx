// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteBranchEntry, WorktreeBranchControl, type WorktreeBranchInjected } from '../client/branch-switch.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutlineRegular: () => null,
  IconCheckOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconPlusOutlineRegular: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function panel() {
  return {
    checkout: {
      state: 'ready' as const,
      checkout: { root: '/repo', branch: 'main', linked: false, commit: 'abc1234' },
    },
    worktree: {
      request: null,
      creation: null,
      editable: true,
      blocker: null,
    },
  };
}

function properties(overrides: Partial<WorktreeBranchInjected> = {}): WorktreeBranchInjected {
  return {
    sessionId: 'session-1' as WorktreeBranchInjected['sessionId'],
    follow: async function* (signal: AbortSignal) {
      await Promise.resolve();
      yield panel();
      await new Promise<void>((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
    refresh: vi.fn(async () => ({ ok: true })),
    search: vi.fn(async (query, options) => ({
      current: 'main',
      commit: 'abc1234',
      local: ['main', 'dev'].filter(name => query === '' || name.includes(query)),
      remote: options.includeRemote && query !== ''
        ? [{ ref: 'refs/remotes/origin/feature', remote: 'origin', branch: 'feature', name: 'origin/feature' }]
        : [],
      warning: '',
    })),
    switchBranch: vi.fn(async (ref: string) => ({
      current: ref.endsWith('/dev') ? 'dev' : 'feature',
      commit: 'def5678',
      message: '',
      update: { status: 'current', message: '' },
    })),
    createBranch: vi.fn(async (name: string) => ({
      current: name,
      commit: 'fedcba9',
      message: '',
      update: { status: 'skipped', message: '' },
    })),
    ...overrides,
  };
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`missing button ${text}: ${container.textContent}`);
  return found;
}

async function setSearch(value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="搜索分支"]');
  if (!input) throw new Error('missing branch search input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('remote branch control', () => {
  it.each([true, false])('checks the SSH checkout when the Forge host probe fails (remote Git: %s)', async (isRepo) => {
    const props = properties({ follow: async function* (signal) {
      yield { ...panel(), checkout: { state: 'failed', message: 'host sandbox not executable on SSH target' } };
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    } });
    if (!isRepo) vi.mocked(props.search).mockRejectedValue(new Error('not a Git repository'));
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    expect(props.search).toHaveBeenCalledWith('', { includeRemote: false, discoverRemote: false }, expect.any(AbortSignal));
    expect(container.textContent?.includes('切换分支')).toBe(isRepo);
    if (isRepo) {
      await act(async () => button('切换分支').click());
      await act(async () => button('dev').click());
      expect(props.switchBranch).toHaveBeenCalledWith('refs/heads/dev');
    } else expect(props.switchBranch).not.toHaveBeenCalled();
  });

  it('does not mount the picker or run Git for a local session, including after a late SSH lookup', async () => {
    const props = properties();
    const snapshot = { generation: 1 };
    const status = { getSnapshot: () => snapshot, subscribe: () => () => {} };
    let answer!: (value: unknown) => void;
    const lookup = vi.fn((cwd: string) => cwd === '/anchor'
      ? new Promise(resolve => { answer = resolve; })
      : Promise.resolve({ ok: true, value: null }));
    const render = async (id: string, cwd: string) => act(async () => root.render(createElement(RemoteBranchEntry, {
      ...props, sessionId: id, workspaceInfo: lookup, connectionStatus: status,
      useSessions: (select: (s: unknown) => unknown) => select({ byId: { [id]: { cwd } } }),
    } as never)));
    await render('a', '/anchor');
    await render('b', '/local');
    await act(async () => answer({ ok: true, value: { host: 'test' } }));
    expect(props.search).not.toHaveBeenCalled();
    expect(container.querySelector('button')).toBeNull();
    await render('c', '/anchor');
    await act(async () => answer({ ok: true, value: { host: 'test' } }));
    expect(button('切换分支')).toBeTruthy();
    expect(props.search).toHaveBeenCalledOnce();
  });

  it('keeps hook order when the panel moves from loading to ready', async () => {
    await act(async () => root.render(createElement(WorktreeBranchControl, properties() as never)));
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('切换分支');
    expect(container.textContent).not.toContain('新建工作树');
  });

  it('opens a searchable local and remote branch list and switches locally', async () => {
    const props = properties();
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => button('切换分支').click());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('dev');
    expect(container.textContent).not.toContain('origin/feature');
    await setSearch('feature');
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(container.textContent).toContain('origin/feature');
    await setSearch('dev');
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    await act(async () => button('dev').click());
    expect(props.switchBranch).toHaveBeenCalledWith('refs/heads/dev');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('shows local matches immediately and ignores a stale remote response', async () => {
    let resolveStale!: (value: Awaited<ReturnType<WorktreeBranchInjected['search']>>) => void;
    const stale = new Promise<Awaited<ReturnType<WorktreeBranchInjected['search']>>>((resolve) => {
      resolveStale = resolve;
    });
    let remoteCalls = 0;
    const props = properties({
      search: vi.fn(async (_query, options) => {
        if (!options.includeRemote) {
          return {
            current: 'main',
            commit: 'abc1234',
            local: ['main', 'dev'],
            remote: [],
            warning: '',
          };
        }
        remoteCalls += 1;
        if (remoteCalls === 1) return stale;
        return {
          current: 'main',
          commit: 'abc1234',
          local: ['main'],
          remote: [],
          warning: '',
        };
      }),
    });
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => button('切换分支').click());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
    await setSearch('dev');
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(container.textContent).toContain('dev');
    expect(container.textContent).toContain('正在查询远端分支');
    await setSearch('main');
    await act(async () => {
      resolveStale({
        current: 'main',
        commit: 'abc1234',
        local: ['dev'],
        remote: [{ ref: 'refs/remotes/origin/stale-only', remote: 'origin', branch: 'stale-only', name: 'origin/stale-only' }],
        warning: '',
      });
      await new Promise(resolve => window.setTimeout(resolve, 25));
    });
    expect(container.textContent).not.toContain('origin/stale-only');
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(container.textContent).toContain('main');
  });

  it('keeps the menu open with the switch result when automatic update fails', async () => {
    const props = properties({
      switchBranch: vi.fn(async () => ({
        current: 'dev',
        commit: 'def5678',
        message: '',
        update: { status: 'failed', message: 'network down' },
      })),
    });
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => button('切换分支').click());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
    await act(async () => button('dev').click());
    expect(container.textContent).toContain('自动更新失败：network down');
    expect(container.querySelector('input[aria-label="搜索分支"]')).not.toBeNull();
  });

  it('leaves worktree creation to Forge and disables switching while a request is pending', async () => {
    const props = properties({ follow: async function* (signal) {
      const state = panel();
      yield { ...state, worktree: { ...state.worktree, request: { from: 'main' } } };
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    } });
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button('切换分支').disabled).toBe(true);
  });
});
