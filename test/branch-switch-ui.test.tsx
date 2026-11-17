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
    search: vi.fn(async () => ({
      current: 'main',
      commit: 'abc1234',
      local: ['main', 'dev'],
      remote: [{ ref: 'refs/remotes/origin/feature', remote: 'origin', branch: 'feature', name: 'origin/feature' }],
      fetched: [],
      warning: '',
    })),
    switchBranch: vi.fn(async (ref: string) => ({
      current: ref.endsWith('/dev') ? 'dev' : 'feature',
      commit: 'def5678',
      message: '',
    })),
    createBranch: vi.fn(async (name: string) => ({ current: name, commit: 'fedcba9', message: '' })),
    ...overrides,
  };
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(node => node.textContent?.includes(text));
  if (!found) throw new Error(`missing button ${text}: ${container.textContent}`);
  return found;
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
    expect(container.textContent).toContain('origin/feature');
    await act(async () => button('dev').click());
    expect(props.switchBranch).toHaveBeenCalledWith('refs/heads/dev');
    expect(props.refresh).toHaveBeenCalled();
  });

  it('ignores a stale search response after the query changes', async () => {
    let resolveStale!: (value: Awaited<ReturnType<WorktreeBranchInjected['search']>>) => void;
    const stale = new Promise<Awaited<ReturnType<WorktreeBranchInjected['search']>>>((resolve) => {
      resolveStale = resolve;
    });
    let call = 0;
    const props = properties({
      search: vi.fn(async () => {
        call += 1;
        if (call === 1) return stale;
        return {
          current: 'main',
          commit: 'abc1234',
          local: ['dev'],
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
    const input = container.querySelector<HTMLInputElement>('input[aria-label="搜索分支"]')!;
    const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      value.call(input, 'dev');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      resolveStale({
        current: 'main',
        commit: 'abc1234',
        local: ['stale-only'],
        remote: [],
        fetched: [],
        warning: '',
      });
      await new Promise(resolve => window.setTimeout(resolve, 25));
    });
    expect(container.textContent).not.toContain('stale-only');
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 300)); });
    expect(container.textContent).toContain('dev');
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
