import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client';
import {
  Button,
  IconFolderClose16,
  IconPlusOutline16,
  Input,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  isDirectoryPickerUnavailable,
  probeLocalBrowse,
  windowsDriveAnchors,
  type LocalAnchor,
} from './local-browse.js';
import TYPERT_REMOTE from '../lib/typert.remote-client.js';

export const name = 'dsh-ssh-remote-client';
export const inject = ['remote'];

interface DiscoveredHost {
  alias: string;
  host: string;
  port: number;
  user: string;
  identityFile: string;
  proxyJump: string;
  proxyCommand: string;
}

interface SshConfig {
  configPath: string;
  configExists: boolean;
  hosts: DiscoveredHost[];
  legacyHostCount: number;
}

interface RemoteDirectoryEntry {
  name: string;
  path: string;
  hidden: boolean;
}

interface RemoteDirectoryListing {
  path: string;
  home: string;
  crumbs: RemoteDirectoryEntry[];
  entries: RemoteDirectoryEntry[];
  truncated: boolean;
}

interface SshWorkspaceAnchor {
  anchorPath: string;
  uri: string;
  alias: string;
  remotePath: string;
  title: string;
  createdAt: number;
}

type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

const MUTATION_DEADLINE_MS = 30_000;

interface SshRemote {
  config(): Promise<RemoteResult<SshConfig>>;
  browse(alias: string, path: string): Promise<RemoteResult<RemoteDirectoryListing>>;
  createDirectory(alias: string, parent: string, name: string): Promise<RemoteResult<string>>;
  materializeWorkspace(alias: string, path: string): Promise<RemoteResult<SshWorkspaceAnchor>>;
}

export async function apply(ctx: ClientContext) {
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE);
  const ui = ctx.inject(['remote.sshRemote', 'slots', 'workspaces'], (scope) => {
    const ssh = scope.remote.sshRemote;
    const flowInject = () => ({
      ssh,
      pickLocal: () => scope.workspaces.pickDirectory(),
      // The composed picker's browse capability (in-app listing/creation).
      // Served only when the host composes the `-browse` backend; chooseLocal
      // probes for it and falls back to the native chooser only on the
      // explicit capability-unavailable signal (`directory-picker-unavailable`).
      listLocal: (path?: string) => scope.workspaces.listDirectory(path),
      createLocalDirectory: (path: string, name: string) =>
        scope.workspaces.createDirectory(path, name),
      createWorkspace: (input: { path: string }) => scope.workspaces.create(input),
      renameWorkspace: (workspaceId: WorkspaceId, title: string) =>
        scope.workspaces.rename(workspaceId, title),
    });

    return scope.slots.inject('settings.plugins.tab', () =>
      scope.slots.inject('conversation.hero.workspace.directoryFlow', () =>
        scope.slots.inject('sidebar.workspaces.directoryFlow', function* () {
          yield scope.slots.register(
            {
              name: 'settings.plugins.tab',
              id: 'ssh-remote',
              order: 20,
              label: () => 'SSH Remote',
              inject: () => ({ ssh }),
            },
            SshRemotePanel,
          );
          // The slot is `single`; a lower priority shadows the stock local-only
          // occupant while this combined local/SSH flow is mounted.
          yield scope.slots.register(
            {
              name: 'conversation.hero.workspace.directoryFlow',
              priority: -100,
              inject: flowInject,
            },
            SshDirectoryFlow,
          );
          yield scope.slots.register(
            {
              name: 'sidebar.workspaces.directoryFlow',
              priority: -100,
              inject: flowInject,
            },
            SshDirectoryFlow,
          );
        }),
      ),
    );
  });

  try {
    await ui;
  } catch (error) {
    await ui.dispose();
    await disposeMount();
    throw error;
  }

  return async () => {
    await ui.dispose();
    await disposeMount();
  };
}

/** Which filesystem the combined dialog is currently browsing. */
type BrowseTarget = { kind: 'local' } | { kind: 'ssh'; alias: string };

type SshDirectoryFlowProps = DirectoryFlowOwnerProps & {
  ssh: SshRemote;
  pickLocal: () => Promise<string | null>;
  /** One local directory level via the composed picker's browse capability. */
  listLocal: (path?: string) => Promise<RemoteDirectoryListing>;
  /** Create one child directory under an existing local parent. */
  createLocalDirectory: (path: string, name: string) => Promise<string>;
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>;
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<WorkspaceView>;
};

/** Wrap a throwing service call into the dialog's result envelope. */
async function asResult<T>(run: () => Promise<T>): Promise<RemoteResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (reason) {
    return { ok: false, error: { message: messageOf(reason) } };
  }
}

/** Bound non-cancellable host RPCs so a wedged transport cannot lock the dialog forever. */
function withMutationDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`${label} 超过 ${MUTATION_DEADLINE_MS / 1000} 秒；结果未知，请刷新后核对。`)));
    }, MUTATION_DEADLINE_MS);
    operation.then(
      value => finish(() => resolve(value)),
      reason => finish(() => reject(reason)),
    );
  });
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function SshDirectoryFlow({
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
  // Tri-state browse-capability probe result: null while unknown.
  const [localCanBrowse, setLocalCanBrowse] = useState<boolean | null>(null);
  // Windows drive anchors derived from one /mnt listing; null until probed.
  const [driveAnchors, setDriveAnchors] = useState<LocalAnchor[] | null>(null);
  /** Latest navigation request; stale remote replies may not overwrite it. */
  const navigationEpoch = useRef(0);
  /** Owns the mutation busy flag even if navigation/open state changes. */
  const mutationEpoch = useRef(0);

  useEffect(() => {
    if (!open) return;
    const epoch = ++navigationEpoch.current;
    setConfig(null);
    setTarget(null);
    setListing(null);
    setError('');
    setNewFolder('');
    setDriveAnchors(null);
    setLocalCanBrowse(null);
    setLoading(true);
    void Promise.all([
      ssh.config().catch(error => ({
        ok: false as const,
        error: { message: messageOf(error) },
      })),
      probeLocalBrowse(() => listLocal()).then(
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
      if (navigationEpoch.current === epoch) navigationEpoch.current += 1;
    };
  }, [open, ssh, listLocal]);

  useEffect(() => {
    if (!open || target?.kind !== 'local' || driveAnchors !== null) return;
    const epoch = navigationEpoch.current;
    let cancelled = false;
    void asResult(() => listLocal('/mnt')).then((result) => {
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
      return { ok: true, value: await listLocal(path) };
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
        result = await ssh.browse(targetNext.alias, path ?? '');
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
    setLoading(true);
    setError('');
    try {
      const path = await pickLocal();
      if (navigationEpoch.current === epoch && path) onPicked(path);
    } catch (reason) {
      if (navigationEpoch.current === epoch) setError(messageOf(reason));
    } finally {
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
      if (mutationEpoch.current === mutation) setMutating(false);
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
      if (mutationEpoch.current === mutation) setMutating(false);
    }
  }

  function cancel(): void {
    navigationEpoch.current += 1;
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
      <style>{'.dsh-ssh-remote-flow{width:min(880px,94vw)}'}</style>
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
              </Button>
            ))}
            {!loading && config?.hosts.length === 0 && (
              <div style={subtleText}>~/.ssh/config 中没有可用的具体 Host。</div>
            )}
          </div>
        ) : (
          <>
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
                <Pill disabled={disabled} onClick={() => navigate(listing.home)}>主目录</Pill>
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
                  icon={<IconFolderClose16 />}
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
            {listing.truncated && <div style={{ fontSize: 12, ...dimmedText }}>仅显示前 1000 个目录。</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Input
                  value={newFolder}
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
                icon={<IconPlusOutline16 />}
                disabled={disabled || !newFolder.trim()}
                onClick={() => void createFolder()}
              >
                新建
              </Button>
            </div>
          </>
        )}

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

const entryRowStyle: CSSProperties = { justifyContent: 'flex-start', flexShrink: 0 };

const subtleText: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 };
const dimmedText: CSSProperties = { color: 'var(--dsw-alias-label-dimmed)', fontSize: 11 };

function SshRemotePanel({ ssh }: { ssh: SshRemote }) {
  const [config, setConfig] = useState<SshConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await ssh.config();
      if (r.ok) setConfig(r.value);
      else setError(r.error.message);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0 }}>SSH Connections</h3>
          <div style={{ marginTop: 4, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
            Concrete Host aliases are discovered from your local OpenSSH config.
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {config && (
        <div style={{ padding: 10, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8 }}>
          <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>SSH config</div>
          <code style={{ fontSize: 12 }}>{config.configPath}</code>
          {!config.configExists && (
            <div style={{ marginTop: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
              File not found. Create it and add a concrete <code>Host</code> entry, then refresh.
            </div>
          )}
        </div>
      )}

      {config?.hosts.length === 0 && config.configExists && (
        <div style={{ color: 'var(--dsw-alias-label-secondary)' }}>No concrete SSH Host aliases found.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {config?.hosts.map((host) => (
          <div
            key={host.alias}
            style={{
              padding: 12,
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>{host.alias}</div>
            <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12, overflowWrap: 'anywhere' }}>
              {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
            </div>
            {(host.proxyJump || host.proxyCommand || host.identityFile) && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {host.proxyJump && <Pill>ProxyJump: {host.proxyJump}</Pill>}
                {host.proxyCommand && <Pill>ProxyCommand</Pill>}
                {host.identityFile && <Pill>Identity configured</Pill>}
              </div>
            )}
          </div>
        ))}
      </div>

      {config && config.legacyHostCount > 0 && (
        <div style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>
          {config.legacyHostCount} legacy DSH host {config.legacyHostCount === 1 ? 'entry remains' : 'entries remain'} as a read-only fallback.
          Move it to <code>{config.configPath}</code> when convenient.
        </div>
      )}
      {error && <div role="alert" style={{ color: 'var(--dsw-alias-label-error)' }}>{error}</div>}
    </div>
  );
}
