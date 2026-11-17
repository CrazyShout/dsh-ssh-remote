import {
  Fragment,
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import {
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { BranchListing, BranchMutation } from 'dsh-ssh-remote/branch-switch';
import { localized, t } from './locale.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.hero.options': { kind: 'list'; scope: 'session' };
  }
}

interface RemoteBranchListing extends BranchListing {}
interface RemoteBranchMutation extends BranchMutation {}
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

interface ForgeCheckout {
  root: string;
  branch: string | null;
  linked: boolean;
  commit: string | null;
}

type ForgeCheckoutState =
  | { state: 'pending' }
  | { state: 'none' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; checkout: ForgeCheckout };

interface ForgeWorktreeState {
  request: { from: string | null } | null;
  creation: unknown | null;
  editable: boolean;
  blocker: string | null;
}

interface ForgePanelState {
  checkout: ForgeCheckoutState;
  worktree: ForgeWorktreeState;
}

interface ForgePanelStream extends AsyncIterable<ForgePanelState> {
  dispose?(): void;
}

interface ForgePanelRemote {
  follow(sessionId: SessionId, signal: AbortSignal): ForgePanelStream;
  requestWorktree(sessionId: SessionId, from: string | null): Promise<RemoteResult<void>>;
  cancelWorktree(sessionId: SessionId): Promise<RemoteResult<void>>;
  refresh(sessionId: SessionId): Promise<RemoteResult<void>>;
}

export interface WorktreeBranchInjected {
  sessionId: SessionId;
  follow(signal: AbortSignal): ForgePanelStream;
  requestWorktree(from: string | null): Promise<{ ok: boolean; message?: string }>;
  cancelWorktree(): Promise<{ ok: boolean; message?: string }>;
  refresh(): Promise<{ ok: boolean; message?: string }>;
  search(query: string, fetchMissing: boolean, signal?: AbortSignal): Promise<RemoteBranchListing>;
  switchBranch(ref: string): Promise<RemoteBranchMutation>;
  createBranch(name: string): Promise<RemoteBranchMutation>;
}

const CSS = `
.ssh-branch-root { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
.ssh-branch-trigger { display: inline-flex; align-items: center; gap: 6px; height: 26px; min-width: 0; max-width: min(260px, 45vw);
  padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer; }
.ssh-branch-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ssh-branch-trigger:focus-visible, .ssh-branch-option:focus-visible, .ssh-branch-action:focus-visible, .ssh-branch-search:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px; }
.ssh-branch-trigger:disabled, .ssh-branch-option:disabled { cursor: default; opacity: .55; }
.ssh-branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssh-branch-chevron { flex: none; color: var(--dsw-alias-label-tertiary); transition: transform .12s ease; }
.ssh-branch-chevron-open { transform: rotate(180deg); }
.ssh-branch-popover { position: fixed; z-index: 10000; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); box-shadow: 0 12px 32px var(--dsw-alias-bg-mask-1); }
.ssh-branch-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px 6px; }
.ssh-branch-heading { font-size: 12px; font-weight: 600; }
.ssh-branch-body { min-height: 0; overflow: auto; padding: 0 6px 6px; }
.ssh-branch-search { box-sizing: border-box; width: 100%; height: 30px; padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l4); border-radius: 6px; background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.ssh-branch-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.ssh-branch-group { padding: 7px 7px 4px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.ssh-branch-option { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 5px 8px;
  border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.ssh-branch-option:hover:not(:disabled), .ssh-branch-option[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
.ssh-branch-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssh-branch-check { flex: none; color: var(--dsw-alias-state-success-primary); }
.ssh-branch-note { color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; }
.ssh-branch-state { display: flex; align-items: center; gap: 8px; padding: 12px 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ssh-branch-error { margin: 4px 7px 6px; color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.ssh-branch-info { margin: 4px 7px 6px; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.ssh-branch-footer { padding: 6px; border-top: 1px solid var(--dsw-alias-border-l2); }
.ssh-branch-action { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 5px 8px;
  border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.ssh-branch-action:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ssh-branch-action:disabled { opacity: .55; cursor: default; }
.ssh-branch-form { display: grid; gap: 8px; padding: 8px 6px; }
.ssh-branch-form-title { padding: 0 2px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.ssh-branch-form-buttons { display: flex; justify-content: flex-end; gap: 6px; }
.ssh-branch-button { min-height: 28px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 5px;
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.ssh-branch-button[data-primary] { border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.ssh-branch-button:disabled { opacity: .55; cursor: default; }
.ssh-branch-spin { width: 12px; height: 12px; flex: none; box-sizing: border-box; border: 1.5px solid var(--dsw-alias-border-l3);
  border-top-color: var(--dsw-alias-label-secondary); border-radius: 50%; animation: ssh-branch-spin .8s linear infinite; }
.ssh-branch-checkbox { display: inline-flex; align-items: center; gap: 6px; min-width: 0;
  color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.ssh-branch-checkbox input { width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.ssh-branch-checkbox[data-disabled] { opacity: .55; }
.ssh-branch-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@keyframes ssh-branch-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ssh-branch-spin { animation-duration: 1.8s; } }
`;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameBranch(item: BranchOption, value: string | null): boolean {
  return value !== null && item.name === value;
}

interface BranchOption {
  kind: 'local' | 'remote';
  ref: string;
  name: string;
}

interface PanelSnapshot {
  state: ForgePanelState | null;
  error: string;
}

function usePanel(follow: (signal: AbortSignal) => ForgePanelStream, sessionId: SessionId): PanelSnapshot {
  const [snapshot, setSnapshot] = useState<PanelSnapshot>({ state: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let stream: ForgePanelStream | null = null;
    let retryTimer: number | undefined;
    const wait = () => new Promise<void>((resolve) => {
      retryTimer = window.setTimeout(resolve, 1500);
    });
    void (async () => {
      while (active && !controller.signal.aborted) {
        try {
          stream = follow(controller.signal);
          for await (const state of stream) {
            if (active) setSnapshot({ state, error: '' });
          }
          if (active) setSnapshot(current => ({ ...current, error: 'branch state stream ended' }));
        } catch (error) {
          if (active && !controller.signal.aborted) setSnapshot(current => ({ ...current, error: messageOf(error) }));
        } finally {
          stream = null;
        }
        if (active && !controller.signal.aborted) await wait();
      }
    })();
    return () => {
      active = false;
      controller.abort();
      stream?.dispose?.();
      window.clearTimeout(retryTimer);
    };
  }, [follow, sessionId]);
  return snapshot;
}

function optionOf(state: ForgePanelState | null): { blocker: string | null; current: string | null; commit: string | null } | undefined {
  if (state === null || !state.worktree.editable) return undefined;
  if (state.worktree.blocker === 'not-git' || state.checkout.state !== 'ready') return undefined;
  return {
    blocker: state.worktree.blocker,
    current: state.checkout.checkout.branch,
    commit: state.checkout.checkout.commit,
  };
}

async function branchRequest<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/ssh-branches', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  let value: { ok?: boolean; value?: T; error?: { message?: string } };
  try {
    value = await response.json() as typeof value;
  } catch {
    throw new Error(`branch request failed with HTTP ${response.status}`);
  }
  if (!response.ok || value.ok !== true) {
    throw new Error(value.error?.message || `branch request failed with HTTP ${response.status}`);
  }
  return value.value as T;
}

/** Branch picker that preserves Forge's worktree option and adds direct switching. */
export function WorktreeBranchControl(props: PropsRuntime<'conversation.hero.options'> & WorktreeBranchInjected): ReactNode {
  const panel = usePanel(props.follow, props.sessionId);
  const state = panel.state;
  const option = optionOf(state);
  const [currentOverride, setCurrentOverride] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    left: number; width: number; maxHeight: number; top?: number; bottom?: number;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [branches, setBranches] = useState<RemoteBranchListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [busy, setBusy] = useState('');
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [worktreePending, setWorktreePending] = useState<boolean | null>(null);
  const [compositionRevision, setCompositionRevision] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLInputElement>(null);
  const requestEpoch = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const fetchAttempts = useRef(new Set<string>());
  const composing = useRef(false);
  const mounted = useRef(true);

  const panelCurrent = option?.current ?? null;
  const previousPanelCurrent = useRef(panelCurrent);
  const current = currentOverride ?? panelCurrent;
  const held = state !== null && state.worktree.creation !== null;
  const requested = worktreePending ?? ((state?.worktree.request ?? null) !== null);
  const usable = option?.blocker === null;
  const canMutate = panel.error === '' && usable && !held && busy === '' && worktreePending === null;
  const branchLabel = current ?? (option?.commit ? `${t('分离 HEAD')} @${option.commit}` : t('分离 HEAD'));

  useEffect(() => {
    setCurrentOverride(null);
    previousPanelCurrent.current = panelCurrent;
  }, [props.sessionId]);

  useEffect(() => {
    if (previousPanelCurrent.current !== panelCurrent) setCurrentOverride(null);
    previousPanelCurrent.current = panelCurrent;
  }, [panelCurrent]);

  const locate = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const above = Math.max(0, rect.top - 16);
    const below = Math.max(0, window.innerHeight - rect.bottom - 16);
    const openAbove = above >= 260 || above >= below;
    const available = openAbove ? above : below;
    setPlacement({
      left,
      width,
      maxHeight: Math.min(420, Math.max(120, available)),
      ...(openAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setCreateMode(false);
    setNewName('');
    setBranchError('');
    setLoading(false);
    setFetching(false);
    searchAbort.current?.abort();
    searchAbort.current = null;
    fetchAttempts.current.clear();
  }, []);

  const openMenu = () => {
    if (open) {
      close();
      return;
    }
    locate();
    setQuery('');
    setBranches(null);
    setLoading(true);
    setBranchError('');
    setNotice('');
    setActiveIndex(0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const resize = () => locate();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', resize);
    };
  }, [open, close, locate]);

  useEffect(() => {
    if (!open || createMode) return;
    const focus = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(focus);
  }, [open, createMode]);

  useEffect(() => {
    if (!createMode) return;
    const focus = window.requestAnimationFrame(() => createRef.current?.focus());
    return () => window.cancelAnimationFrame(focus);
  }, [createMode]);

  const load = useCallback(async (text: string, fetchMissing: boolean) => {
    const epoch = ++requestEpoch.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setLoading(true);
    setFetching(fetchMissing);
    setBranchError('');
    try {
      const value = await props.search(text, fetchMissing, controller.signal);
      if (epoch !== requestEpoch.current || controller.signal.aborted) return;
      setBranches(value);
      setActiveIndex(0);
    } catch (error) {
      if (epoch !== requestEpoch.current || controller.signal.aborted) return;
      setBranchError(messageOf(error));
    } finally {
      if (epoch === requestEpoch.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [props.search]);

  useEffect(() => {
    if (!open || createMode || composing.current) return;
    const normalized = query.trim();
    const timer = window.setTimeout(() => {
      const fetchMissing = normalized.length >= 2 && !fetchAttempts.current.has(normalized);
      if (fetchMissing) fetchAttempts.current.add(normalized);
      void load(normalized, fetchMissing);
    }, query === '' ? 0 : 250);
    return () => window.clearTimeout(timer);
  }, [open, createMode, query, load, compositionRevision]);

  useEffect(() => () => {
    mounted.current = false;
    requestEpoch.current += 1;
    searchAbort.current?.abort();
  }, []);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    popoverRef.current?.querySelector(`[data-branch-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (state === null || option === undefined) return null;

  const base = state.worktree.request === null ? current : state.worktree.request.from;
  const selected = requested ? base : current;
  const options: BranchOption[] = branches === null ? [] : [
    ...branches.local.map(name => ({ kind: 'local' as const, ref: `refs/heads/${name}`, name })),
    ...branches.remote.map(item => ({ kind: 'remote' as const, ref: item.ref, name: item.name })),
  ];
  const branchTip = panel.error !== ''
    ? t('分支状态连接已断开，暂时不能修改分支；正在重试')
    : requested
      ? `${t('分支')}: ${base ?? 'HEAD'}`
      : `${branchLabel}\n${t('选择或切换分支')}`;

  const setFreshState = (value: RemoteBranchMutation) => {
    if (value.current !== undefined) setCurrentOverride(value.current);
  };

  const refresh = () => {
    void props.refresh().then((result) => {
      if (mounted.current && !result.ok) {
        setNotice(result.message ?? t('分支操作失败：{message}', { message: 'refresh failed' }));
      }
    }).catch((error) => {
      if (mounted.current) {
        setNotice(t('分支操作失败：{message}', { message: messageOf(error) }));
      }
    });
  };

  const choose = async (item: BranchOption | undefined) => {
    if (item === undefined || busy !== '' || !canMutate) return;
    if (requested) {
      const result = await props.requestWorktree(item.name);
      if (!result.ok) {
        setBranchError(t('分支操作失败：{message}', { message: result.message ?? 'request failed' }));
        return;
      }
      close();
      return;
    }
    if (sameBranch(item, current)) {
      close();
      return;
    }
    searchAbort.current?.abort();
    searchAbort.current = null;
    setBusy('switch');
    try {
      const value = await props.switchBranch(item.ref);
      if (!mounted.current) return;
      setFreshState(value);
      setNotice(t('已切换到 {branch}', { branch: value.current ?? item.name }));
      close();
      refresh();
    } catch (error) {
      if (mounted.current) setBranchError(t('分支操作失败：{message}', { message: messageOf(error) }));
    } finally {
      if (mounted.current) setBusy('');
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (name === '' || busy !== '' || !canMutate) return;
    searchAbort.current?.abort();
    searchAbort.current = null;
    setBusy('create');
    setBranchError('');
    try {
      const value = await props.createBranch(name);
      if (!mounted.current) return;
      setFreshState(value);
      setNotice(t('已创建并切换到 {branch}', { branch: value.current ?? name }));
      close();
      refresh();
    } catch (error) {
      if (mounted.current) setBranchError(t('分支操作失败：{message}', { message: messageOf(error) }));
    } finally {
      if (mounted.current) setBusy('');
    }
  };

  const toggleWorktree = (checked: boolean) => {
    if (!canMutate) return;
    setWorktreePending(checked);
    setBranchError('');
    void (async () => {
      try {
        const result = checked ? await props.requestWorktree(current) : await props.cancelWorktree();
        if (!mounted.current) return;
        if (!result.ok) {
          const message = t('新建工作树失败：{message}', { message: result.message ?? 'request failed' });
          setNotice(message);
          locate();
          setOpen(true);
        } else {
          refresh();
        }
      } catch (error) {
        if (!mounted.current) return;
        setNotice(t('新建工作树失败：{message}', { message: messageOf(error) }));
        locate();
        setOpen(true);
      } finally {
        if (mounted.current) setWorktreePending(null);
      }
    })();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (busy !== '' || loading || options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void choose(options[activeIndex]);
    }
  };

  const optionButton = (item: BranchOption, index: number) => {
    const active = selected === item.name;
    return createElement('button', {
      type: 'button',
      key: `${item.kind}:${item.ref}`,
      className: 'ssh-branch-option',
      role: 'menuitemradio',
      'aria-checked': active,
      'data-active': activeIndex === index ? '' : undefined,
      'data-branch-index': index,
      disabled: busy !== '' || !canMutate,
      title: item.name,
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => void choose(item),
    },
    createElement(IconBranchOutlineRegular, { size: 14 }),
    createElement('span', { className: 'ssh-branch-option-name' }, item.name),
    active
      ? createElement(IconCheckOutlineRegular, { size: 14, className: 'ssh-branch-check' })
      : item.kind === 'remote' ? createElement('span', { className: 'ssh-branch-note' }, t('远端')) : null);
  };

  let index = -1;
  const localButtons = (branches?.local ?? []).map((name) => {
    index += 1;
    return optionButton({ kind: 'local', ref: `refs/heads/${name}`, name }, index);
  });
  const remoteButtons = (branches?.remote ?? []).map((item) => {
    index += 1;
    return optionButton({ kind: 'remote', ref: item.ref, name: item.name }, index);
  });

  let groupedResults: ReactNode;
  if (loading) {
    groupedResults = createElement('div', { className: 'ssh-branch-state', role: 'status' },
      createElement('span', { className: 'ssh-branch-spin' }),
      createElement('span', null, fetching ? t('本地没有匹配项，正在查询远端') : t('正在读取分支')));
  } else if (options.length === 0) {
    groupedResults = createElement('div', { className: 'ssh-branch-state' },
      createElement('span', null, query.trim() === '' ? t('没有匹配的分支') : t('本地和远端都没有匹配分支')));
  } else {
    groupedResults = createElement(Fragment, null,
      localButtons.length > 0 && createElement('div', null,
        createElement('div', { className: 'ssh-branch-group' }, t('本地')),
        ...localButtons),
      remoteButtons.length > 0 && createElement('div', null,
        createElement('div', { className: 'ssh-branch-group' }, t('远端')),
        ...remoteButtons));
  }

  const trigger = createElement('span', { className: 'ssh-branch-root', ref: rootRef },
    createElement('button', {
      ref: triggerRef,
      type: 'button',
      className: 'ssh-branch-trigger',
      title: branchTip,
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      disabled: held || busy !== '',
      onClick: openMenu,
    },
    createElement(IconBranchOutlineRegular, { size: 14 }),
    createElement('span', { className: 'ssh-branch-name' }, requested ? (base ?? 'HEAD') : branchLabel),
    createElement(IconChevronDownOutlineRegular, {
      size: 12,
      className: open ? 'ssh-branch-chevron ssh-branch-chevron-open' : 'ssh-branch-chevron',
    })),
    createElement('label', {
      className: 'ssh-branch-checkbox',
      'data-disabled': !usable || held || worktreePending !== null ? '' : undefined,
      title: usable ? t('新建工作树') : t('当前工作区不能新建工作树'),
    },
    createElement('input', {
      type: 'checkbox',
      checked: requested,
      disabled: !usable || held || worktreePending !== null || busy !== '',
      onChange: event => toggleWorktree(event.currentTarget.checked),
    }),
    createElement('span', null, t('新建工作树'))));

  const createForm = createElement('form', {
    className: 'ssh-branch-form',
    onSubmit: (event: FormEvent<HTMLFormElement>) => void create(event),
  },
    createElement('label', { className: 'ssh-branch-form-title', htmlFor: `ssh-branch-new-${props.sessionId}` }, t('新分支名称')),
    createElement('input', {
      id: `ssh-branch-new-${props.sessionId}`,
      ref: createRef,
      className: 'ssh-branch-search',
      value: newName,
      disabled: busy !== '',
      autoComplete: 'off',
      spellCheck: false,
      onChange: event => setNewName(event.currentTarget.value),
      onKeyDown: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setCreateMode(false);
        }
      },
    }),
    branchError !== '' && createElement('div', { className: 'ssh-branch-error', role: 'alert' }, branchError),
    createElement('div', { className: 'ssh-branch-form-buttons' },
      createElement('button', {
        className: 'ssh-branch-button',
        type: 'button',
        disabled: busy !== '',
        onClick: () => {
          setCreateMode(false);
          setBranchError('');
        },
      }, t('取消')),
      createElement('button', {
        className: 'ssh-branch-button',
        type: 'submit',
        'data-primary': '',
        disabled: busy !== '' || newName.trim() === '' || !canMutate,
      }, busy === 'create' ? createElement('span', { className: 'ssh-branch-spin' }) : null, t('创建并切换'))));

  const searchView = createElement(Fragment, null,
    createElement('div', { className: 'ssh-branch-body' },
      createElement('input', {
        ref: searchRef,
        className: 'ssh-branch-search',
        value: query,
        placeholder: t('搜索分支'),
        'aria-label': t('搜索分支'),
        autoComplete: 'off',
        spellCheck: false,
        disabled: busy !== '',
        onCompositionStart: () => { composing.current = true; },
        onCompositionEnd: () => {
          composing.current = false;
          setCompositionRevision(value => value + 1);
        },
        onChange: (event) => {
          searchAbort.current?.abort();
          searchAbort.current = null;
          requestEpoch.current += 1;
          setQuery(event.currentTarget.value);
          setBranches(null);
          setBranchError('');
          setFetching(false);
          setLoading(true);
        },
        onKeyDown: onSearchKeyDown,
      }),
      notice !== '' && createElement('div', { className: 'ssh-branch-info', role: 'status' }, notice),
      panel.error !== '' && createElement('div', { className: 'ssh-branch-error', role: 'alert' },
        t('分支状态连接已断开，暂时不能修改分支；正在重试')),
      groupedResults,
      branchError !== '' && createElement('div', { className: 'ssh-branch-error', role: 'alert' }, branchError),
      branches?.fetched.length ? createElement('div', { className: 'ssh-branch-info' },
        t('已从远端拉取 {count} 个分支', { count: branches.fetched.length })) : null,
      branches?.warning ? createElement('div', { className: 'ssh-branch-info' },
        t('远端查询未完成：{message}', { message: branches.warning })) : null),
    createElement('div', { className: 'ssh-branch-footer' },
      createElement('button', {
        type: 'button',
        className: 'ssh-branch-action',
        disabled: busy !== '' || !canMutate || requested,
        title: !canMutate ? t('当前工作区不可写，不能切换分支') : undefined,
        onClick: () => {
          setBranchError('');
          setNewName('');
          setCreateMode(true);
        },
      }, createElement(IconPlusOutlineRegular, { size: 14 }), createElement('span', null, t('创建并检出新分支…')))));

  const popover = placement === null ? null : createElement('div', {
    ref: popoverRef,
    className: 'ssh-branch-popover',
    role: 'dialog',
    'aria-label': t('分支'),
    style: {
      left: placement.left,
      width: placement.width,
      maxHeight: placement.maxHeight,
      ...(placement.top === undefined ? { bottom: placement.bottom } : { top: placement.top }),
    },
  },
  createElement('div', { className: 'ssh-branch-head' },
    createElement('span', { className: 'ssh-branch-heading' }, createMode ? t('基于当前分支创建') : t('分支'))),
  createMode ? createForm : searchView);

  return createElement(Fragment, null,
    createElement('style', null, CSS),
    trigger,
    open && popover,
    createElement('span', { className: 'ssh-branch-sr', role: 'status', 'aria-live': 'polite' }, notice, panel.error));
}

/** Register the Forge-compatible branch control when the official panel is mounted. */
export function mountBranchSwitch(ctx: Context): () => Promise<void> {
  const fiber = ctx.inject(['remote.forgePanel', 'slots', 'locale'], (scope) => {
    const remote = (scope.remote as typeof scope.remote & { forgePanel: ForgePanelRemote }).forgePanel;
    const face = (sessionId: SessionId): WorktreeBranchInjected => ({
      sessionId,
      follow: signal => remote.follow(sessionId, signal),
      requestWorktree: async from => {
        const result = await remote.requestWorktree(sessionId, from);
        return result.ok ? { ok: true } : { ok: false, message: result.error.message };
      },
      cancelWorktree: async () => {
        const result = await remote.cancelWorktree(sessionId);
        return result.ok ? { ok: true } : { ok: false, message: result.error.message };
      },
      refresh: async () => {
        const result = await remote.refresh(sessionId);
        return result.ok ? { ok: true } : { ok: false, message: result.error.message };
      },
      search: (query, fetchMissing, signal) => branchRequest({
        sessionId, action: 'search', query, fetchMissing,
      }, signal),
      switchBranch: ref => branchRequest({ sessionId, action: 'switch', ref }),
      createBranch: name => branchRequest({ sessionId, action: 'create', name }),
    });
    return scope.slots.inject('conversation.hero.options', () => scope.slots.register({
      name: 'conversation.hero.options',
      id: 'forge-panel.worktree',
      priority: -200,
      locale: 'sshRemote',
      inject: face,
    }, localized(WorktreeBranchControl)));
  });
  return async () => { await fiber.dispose(); };
}
