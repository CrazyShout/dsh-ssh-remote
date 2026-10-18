import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client';
import { Button, IconFolderCloseRegular, IconPlusOutlineRegular, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import { isDirectoryPickerUnavailable, probeLocalBrowse, windowsDriveAnchors, type LocalAnchor } from './local-browse.js';
import type { SshRemote, RemoteDirectoryListing, RemoteResult, SshConfig } from 'dsh-ssh-remote/ssh';
import { asResult, withMutationDeadline, withReadDeadline, withDeadline, READ_DEADLINE_MS, messageOf, subtleText, dimmedText, helperStateLabel, searchSummary } from './connection-ui.js';
/** Which filesystem the combined dialog is currently browsing. */
type BrowseTarget = { kind: 'local' } | { kind: 'ssh'; alias: string };

type SshDirectoryFlowProps = DirectoryFlowOwnerProps & {
  ssh: SshRemote;
  pickLocal: (signal?: AbortSignal) => Promise<string | null>;
  /** One local directory level via the composed picker's browse capability. */
  listLocal: (path?: string) => Promise<RemoteDirectoryListing>;
  /** Create one child directory under an existing local parent. */
  createLocalDirectory: (path: string, name: string) => Promise<string>;
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>;
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<WorkspaceView>;
};

export function SshDirectoryFlow({
  open,
  busy,
  onPicked,
  onCancel,
  onError,
  ssh,
  pickLocal,
  listLocal,
  createLocalDirectory,
  createWorkspace,
  renameWorkspace,
}: SshDirectoryFlowProps) {
  const [config, setConfig] = useState<SshConfig | null>(null);
  const [target, setTarget] = useState<BrowseTarget | null>(null);
  const [listing, setListing] = useState<RemoteDirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  /** Irreversible host-side operation in flight; user cancellation is gated. */
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [pathInput, setPathInput] = useState('');
  // Tri-state browse-capability probe result: null while unknown.
  const [localCanBrowse, setLocalCanBrowse] = useState<boolean | null>(null);
  // Windows drive anchors derived from one /mnt listing; null until probed.
  const [driveAnchors, setDriveAnchors] = useState<LocalAnchor[] | null>(null);
  /** Latest navigation request; stale remote replies may not overwrite it. */
  const navigationEpoch = useRef(0);
  /** Owns the mutation busy flag even if navigation/open state changes. */
  const mutationEpoch = useRef(0);
  const mounted = useRef(false);
  const nativePicker = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      navigationEpoch.current += 1;
      mutationEpoch.current += 1;
      nativePicker.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const epoch = ++navigationEpoch.current;
    setConfig(null);
    setTarget(null);
    setListing(null);
    setError('');
    setNewFolder('');
    setPathInput('');
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(true);
    void Promise.all([
      withReadDeadline(ssh.config(), 'SSH 配置读取').catch(error => ({
        ok: false as const,
        error: { message: messageOf(error) },
      })),
      probeLocalBrowse(() => withReadDeadline(listLocal(), '本机浏览')).then(
        value => ({ ok: true as const, value }),
        error => ({ ok: false as const, error }),
      ),
    ]).then(([configResult, browseProbe]) => {
      if (navigationEpoch.current !== epoch) return;
      if (browseProbe.ok) setLocalCanBrowse(browseProbe.value);
      else {
        // Non-capability probe failures (permission, timeout, transport,
        // internal…) surface only after the request epoch is still current.
        setError(`本机浏览探测失败：${messageOf(browseProbe.error)}`);
      }
      if (configResult.ok) setConfig(configResult.value);
      else if (browseProbe.ok) setError(configResult.error.message);
    }).finally(() => {
      if (navigationEpoch.current === epoch) setLoading(false);
    });
    return () => {
      navigationEpoch.current += 1;
      nativePicker.current?.abort();
    };
  }, [open, ssh, listLocal]);

  useEffect(() => {
    if (!open || target?.kind !== 'local' || driveAnchors !== null) return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => withReadDeadline(listLocal('/mnt'), '本机磁盘探测')).then((result) => {
      if (!cancelled && navigationEpoch.current === epoch) {
        setDriveAnchors(result.ok ? windowsDriveAnchors(result.value.entries) : []);
      }
    });
    return () => { cancelled = true; };
  }, [open, target, driveAnchors, listLocal]);

  /**
   * One raw local browse call that preserves any thrown error so callers can
   * still distinguish the explicit capability-unavailable signal from real
   * browse failures.
   */
  async function browseLocalRaw(path?: string): Promise<
    { ok: true; value: RemoteDirectoryListing } | { ok: false; error: unknown }
  > {
    try {
      return { ok: true, value: await withReadDeadline(listLocal(path), '本机浏览') };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function enter(targetNext: BrowseTarget, path?: string): Promise<boolean> {
    const epoch = ++navigationEpoch.current;
    setLoading(true);
    setError('');
    if (targetNext.kind === 'ssh') {
      let result: RemoteResult<RemoteDirectoryListing>;
      try {
        result = await withReadDeadline(ssh.browse(targetNext.alias, path ?? ''), '远程目录浏览');
      } catch (reason) {
        if (navigationEpoch.current === epoch) {
          setError(messageOf(reason));
          setLoading(false);
        }
        return false;
      }
      if (navigationEpoch.current !== epoch) return false;
      if (result.ok) {
        setTarget(targetNext);
        setListing(result.value);
        setPathInput(result.value.path);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
      return result.ok;
    }
    const outcome = await browseLocalRaw(path);
    if (navigationEpoch.current !== epoch) return false;
    if (outcome.ok) {
      setTarget(targetNext);
      setListing(outcome.value);
      setPathInput(outcome.value.path);
    } else {
      setError(messageOf(outcome.error));
    }
    setLoading(false);
    return outcome.ok;
  }

  function navigate(path?: string): void {
    if (target) void enter(target, path);
  }

  async function chooseLocal() {
    // Prefer the composed browse capability — it works headless and covers
    // the WSL host filesystem together with its /mnt Windows drives. Only
    // the explicit capability-unavailable signal may switch to the OS
    // chooser: the probe reported `false`, or a raced browse call now
    // reports `directory-picker-unavailable`. Permission, timeout, transport,
    // internal, and every other failure stays in the dialog for retry, with
    // no native fallback.
    if (localCanBrowse !== false) {
      const epoch = ++navigationEpoch.current;
      setLoading(true);
      setError('');
      const outcome = await browseLocalRaw();
      if (navigationEpoch.current !== epoch) return;
      if (outcome.ok) {
        setLoading(false);
        setTarget({ kind: 'local' });
        setListing(outcome.value);
        setPathInput(outcome.value.path);
        return;
      }
      if (!isDirectoryPickerUnavailable(outcome.error)) {
        setError(messageOf(outcome.error));
        setLoading(false);
        return;
      }
      // Capability raced: the composition now serves native (or no picker) —
      // the one condition that may reach the OS chooser.
      setLocalCanBrowse(false);
      setLoading(false);
    }
    await pickLocalFallback();
  }

  /** The only native-chooser path, entered solely on the explicit unavailable signal. */
  async function pickLocalFallback() {
    const epoch = ++navigationEpoch.current;
    nativePicker.current?.abort();
    const controller = new AbortController();
    nativePicker.current = controller;
    setLoading(true);
    setError('');
    try {
      const path = await withDeadline(
        pickLocal(controller.signal),
        '系统文件夹选择器超过 30 秒未返回，已停止等待。若系统对话框仍在或置于后台，请先关闭后重试；若仍无对话框，请重启 DSH 后再试。',
        READ_DEADLINE_MS,
        () => controller.abort(),
      );
      if (navigationEpoch.current === epoch && path) onPicked(path);
    } catch (reason) {
      if (navigationEpoch.current === epoch) setError(messageOf(reason));
    } finally {
      if (nativePicker.current === controller) nativePicker.current = null;
      if (navigationEpoch.current === epoch) setLoading(false);
    }
  }

  async function commit() {
    if (!target || !listing) return;
    const epoch = ++navigationEpoch.current;
    const mutation = ++mutationEpoch.current;
    setMutating(true);
    if (target.kind === 'local') {
      setMutating(false);
      onPicked(listing.path);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await withMutationDeadline(
        ssh.materializeWorkspace(target.alias, listing.path),
        '远程工作区验证',
      );
      if (navigationEpoch.current !== epoch) return;
      if (result.ok) {
        // The stock owner accepts only a path and initially derives the title
        // from its basename. Pre-create idempotently, apply the clean remote
        // title, then hand the same path back so the owner keeps its normal
        // close/select/error lifecycle without exposing the anchor hash.
        const workspace = await withMutationDeadline(
          createWorkspace({ path: result.value.anchorPath }),
          '工作区创建',
        );
        if (navigationEpoch.current !== epoch) return;
        if (workspace.title !== result.value.title) {
          await withMutationDeadline(
            renameWorkspace(workspace.workspaceId, result.value.title),
            '工作区命名',
          );
          if (navigationEpoch.current !== epoch) return;
        }
        onPicked(result.value.anchorPath);
      } else {
        onError(result.error.message);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch) onError(messageOf(reason));
    } finally {
      if (navigationEpoch.current === epoch) setLoading(false);
      if (mounted.current && mutationEpoch.current === mutation) setMutating(false);
    }
  }

  async function createFolder() {
    if (!target || !listing || !newFolder.trim()) return;
    const epoch = ++navigationEpoch.current;
    const mutation = ++mutationEpoch.current;
    const targetSnapshot = target;
    const listingPath = listing.path;
    const folderName = newFolder.trim();
    setLoading(true);
    setMutating(true);
    setError('');
    try {
      const created = targetSnapshot.kind === 'ssh'
        ? await withMutationDeadline(
          ssh.createDirectory(targetSnapshot.alias, listingPath, folderName),
          '远程文件夹创建',
        )
        : await asResult(() => withMutationDeadline(
          createLocalDirectory(listingPath, folderName),
          '本机文件夹创建',
        ));
      if (navigationEpoch.current !== epoch) return;
      if (created.ok) {
        setNewFolder('');
        await enter(targetSnapshot, created.value);
      } else {
        setError(created.error.message);
        setLoading(false);
      }
    } catch (reason) {
      if (navigationEpoch.current === epoch) {
        setError(messageOf(reason));
        setLoading(false);
      }
    } finally {
      if (mounted.current && mutationEpoch.current === mutation) setMutating(false);
    }
  }

  function cancel(): void {
    navigationEpoch.current += 1;
    nativePicker.current?.abort();
    onCancel();
  }

  // Modal renders null while closed; `disabled` only gates the open dialog.
  const disabled = loading || busy || mutating;

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy && !mutating) cancel(); }}
      // The Modal card defaults to min(380px, 100%) (confirm-dialog size);
      // plugins ship no stylesheet, so one scoped rule widens the card for
      // the browse layout.
      className="dsh-ssh-remote-flow"
      title={!target ? '添加工作区' : target.kind === 'local' ? '本机文件' : `SSH · ${target.alias}`}
      closeLabel="关闭"
      description={listing ? listing.path : '选择本机文件夹或 SSH 主机'}
      footer={
        <>
          <Button variant="ghost" disabled={busy || mutating} onClick={cancel}>取消</Button>
          {target && listing && (
            <Button variant="primary" disabled={disabled} onClick={() => void commit()}>
              {busy ? '正在添加…' : '打开此文件夹'}
            </Button>
          )}
        </>
      }
    >
      <style>{'.dsh-ssh-remote-flow{width:min(880px,94vw)}.dsh-ssh-remote-flow .dsh-ssh-remote-field{width:100%;box-sizing:border-box}'}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!target || !listing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void chooseLocal()}
              style={sourceRowStyle}
            >
              <strong>本机</strong>
              <span style={subtleText}>
                {localCanBrowse === false
                  ? '使用系统文件夹选择器'
                  : '在应用内浏览 Host 文件系统（含 /mnt 下的 Windows 盘）'}
              </span>
            </Button>
            <div style={hostListStyle}>
              {config?.hosts.map((host) => (
                <Button
                  key={host.alias}
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void enter({ kind: 'ssh', alias: host.alias })}
                  style={sourceRowStyle}
                >
                  <strong>{host.alias}</strong>
                  <span style={subtleText}>
                    {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
                  </span>
                  <span style={dimmedText}>
                    Helper · {helperStateLabel(host.helper.status)}
                    {host.helper.version ? ` · ${host.helper.version}` : ''}
                  </span>
                  {host.helper.error && <span style={{ ...dimmedText, color: 'var(--dsw-alias-label-error)' }}>{host.helper.error}</span>}
                  <span style={dimmedText}>{searchSummary(host.helper)}</span>
                </Button>
              ))}
              {!loading && config?.hosts.length === 0 && (
                <div style={subtleText}>~/.ssh/config 中没有可用的具体 Host。</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input
                  aria-label="文件夹路径"
                  className="dsh-ssh-remote-field"
                  value={pathInput}
                  disabled={busy || mutating}
                  onChange={event => setPathInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && pathInput.trim()) navigate(pathInput.trim());
                  }}
                  placeholder="输入完整文件夹路径"
                />
              </div>
              <Button disabled={busy || mutating || !pathInput.trim()} onClick={() => navigate(pathInput.trim())}>前往</Button>
              <Button disabled={busy || mutating} onClick={() => navigate(listing.path)}>刷新目录</Button>
              <Button disabled={busy || mutating} onClick={() => navigate(listing.home)}>主目录</Button>
            </div>
            <div style={chipRowStyle}>
              <Pill disabled={disabled} onClick={() => { setTarget(null); setListing(null); }}>
                {target.kind === 'local' ? '本机' : '主机'}
              </Pill>
              {listing.crumbs.map((crumb) => (
                <Pill key={crumb.path} disabled={disabled} onClick={() => navigate(crumb.path)}>
                  {crumb.name}
                </Pill>
              ))}
            </div>
            {target.kind === 'local' && (
              <div style={chipRowStyle}>
                {(driveAnchors ?? []).map((anchor) => (
                  <Pill key={anchor.path} disabled={disabled} onClick={() => navigate(anchor.path)}>
                    {anchor.label}
                  </Pill>
                ))}
                {driveAnchors === null && <span style={subtleText}>检测 Windows 盘…</span>}
              </div>
            )}
            <div style={entryListStyle}>
              {listing.entries.map((entry) => (
                <Button
                  key={entry.path}
                  variant="ghost"
                  size="sm"
                  icon={<IconFolderCloseRegular />}
                  disabled={disabled}
                  onClick={() => navigate(entry.path)}
                  style={entryRowStyle}
                >
                  <span>{entry.name}</span>
                  {entry.hidden && <span style={{ marginLeft: 'auto', ...dimmedText }}>隐藏</span>}
                </Button>
              ))}
              {!loading && listing.entries.length === 0 && (
                <div style={{ padding: 16, ...dimmedText }}>此目录没有子文件夹。</div>
              )}
            </div>
            {listing.truncated && <div style={{ fontSize: 12, ...dimmedText }}>目录列表已截断（最多 1000 项）；未显示的文件夹可输入完整路径前往。</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input
                  value={newFolder}
                  className="dsh-ssh-remote-field"
                  disabled={disabled}
                  onChange={(event) => setNewFolder(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createFolder();
                  }}
                  placeholder="新建文件夹名称"
                />
              </div>
              <Button
                variant="ghost"
                icon={<IconPlusOutlineRegular />}
                disabled={disabled || !newFolder.trim()}
                onClick={() => void createFolder()}
              >
                新建
              </Button>
            </div>
          </>
        )}

        {loading && <div role="status" style={subtleText}>正在读取…</div>}
        {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)', fontSize: 12 }}>{error}</div>}
      </div>
    </Modal>
  );
}

const sourceRowStyle: CSSProperties = {
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  width: '100%',
  height: 'auto',
  padding: '10px 14px',
};

const chipRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };

const entryListStyle: CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-1)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 2,
  padding: 6,
};

// The host/source picker list mirrors the directory list: bounded height so a
// large ~/.ssh/config cannot push the footer actions off-screen. "本机" stays
// pinned above it; only the SSH hosts scroll.
const hostListStyle: CSSProperties = {
  maxHeight: 'min(50vh, 420px)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  // Keep clickable buttons clear of the scrollbar gutter.
  paddingRight: 4,
};

const entryRowStyle: CSSProperties = { justifyContent: 'flex-start', flexShrink: 0 };
