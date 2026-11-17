// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreeBranchControl, type WorktreeBranchInjected } from '../client/branch-switch.js';

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
    requestWorktree: vi.fn(async () => ({ ok: true })),
    cancelWorktree: vi.fn(async () => ({ ok: true })),
    refresh: vi.fn(async () => ({ ok: true })),
    search: vi.fn(async (query, options) => ({
      current: 'main',
      commit: 'abc1234',
      local: ['main', 'dev'].filter(name => query === '' || name.includes(query)),
      remote: options.includeRemote && query !== ''
        ? [{ ref: 'refs/remotes/origin/feature', remote: 'origin', branch: 'feature', name: 'origin/feature' }]
        : [],
      fetched: [],
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
  it('keeps hook order when the panel moves from loading to ready', async () => {
    await act(async () => root.render(createElement(WorktreeBranchControl, properties() as never)));
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('main');
    expect(container.textContent).toContain('新建工作树');
  });

  it('opens a searchable local and remote branch list and switches locally', async () => {
    const props = properties();
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => button('main').click());
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
            fetched: [],
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
          fetched: [],
          warning: '',
        };
      }),
    });
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => button('main').click());
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
        fetched: [],
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
    await act(async () => button('main').click());
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
    await act(async () => button('dev').click());
    expect(container.textContent).toContain('自动更新失败：network down');
    expect(container.querySelector('input[aria-label="搜索分支"]')).not.toBeNull();
  });

  it('keeps the worktree request flow and sends the selected base', async () => {
    const props = properties();
    await act(async () => root.render(createElement(WorktreeBranchControl, props as never)));
    await act(async () => { await Promise.resolve(); });
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => checkbox.click());
    expect(props.requestWorktree).toHaveBeenCalledWith('main');
  });
});
