import { useEffect, useState, type ReactNode } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client';
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

type SshDirectoryFlowProps = DirectoryFlowOwnerProps & {
  ssh: SshRemote;
  pickLocal: () => Promise<string | null>;
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>;
  renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<WorkspaceView>;
};

function SshDirectoryFlow({
  open,
  busy,
  onPicked,
  onCancel,
  onError,
  ssh,
  pickLocal,
  createWorkspace,
  renameWorkspace,
}: SshDirectoryFlowProps) {
  const [config, setConfig] = useState<SshConfig | null>(null);
  const [alias, setAlias] = useState('');
  const [listing, setListing] = useState<RemoteDirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newFolder, setNewFolder] = useState('');

  useEffect(() => {
    if (!open) return;
    setAlias('');
    setListing(null);
    setError('');
    setNewFolder('');
    setLoading(true);
    void ssh.config().then((result) => {
      if (result.ok) setConfig(result.value);
      else setError(result.error.message);
    }).finally(() => setLoading(false));
  }, [open, ssh]);

  async function browse(hostAlias: string, path?: string) {
    setLoading(true);
    setError('');
    const result = await ssh.browse(hostAlias, path ?? '');
    if (result.ok) {
      setAlias(hostAlias);
      setListing(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }

  async function chooseLocal() {
    setLoading(true);
    setError('');
    try {
      const path = await pickLocal();
      if (path) onPicked(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function chooseRemote() {
    if (!listing || !alias) return;
    setLoading(true);
    setError('');
    const result = await ssh.materializeWorkspace(alias, listing.path);
    if (result.ok) {
      try {
        // The stock owner accepts only a path and initially derives the title
        // from its basename. Pre-create idempotently, apply the clean remote
        // title, then hand the same path back so the owner keeps its normal
        // close/select/error lifecycle without exposing the anchor hash.
        const workspace = await createWorkspace({ path: result.value.anchorPath });
        if (workspace.title !== result.value.title) {
          await renameWorkspace(workspace.workspaceId, result.value.title);
        }
        onPicked(result.value.anchorPath);
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : String(reason));
      }
    } else {
      onError(result.error.message);
    }
    setLoading(false);
  }

  async function createFolder() {
    if (!listing || !alias || !newFolder.trim()) return;
    setLoading(true);
    setError('');
    const result = await ssh.createDirectory(alias, listing.path, newFolder.trim());
    if (result.ok) {
      setNewFolder('');
      await browse(alias, result.value);
    } else {
      setError(result.error.message);
      setLoading(false);
    }
  }

  if (!open) return null;
  const disabled = loading || busy;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.38)',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="添加工作区"
        style={{
          width: 'min(720px, 94vw)',
          maxHeight: 'min(720px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflow: 'hidden',
          padding: 20,
          borderRadius: 16,
          background: 'var(--dsw-alias-bg-base, #fff)',
          color: 'var(--dsw-alias-label-primary, #111)',
          boxShadow: '0 24px 70px rgba(0,0,0,.24)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{listing ? `SSH · ${alias}` : '添加工作区'}</h3>
            <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
              {listing ? listing.path : '选择本机文件夹或 SSH 主机'}
            </div>
          </div>
          <button disabled={busy} onClick={onCancel} aria-label="关闭">×</button>
        </div>

        {!listing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
            <button
              disabled={disabled}
              onClick={() => void chooseLocal()}
              style={sourceButtonStyle}
            >
              <strong>这台 Mac</strong>
              <span style={{ color: '#888', fontSize: 12 }}>使用系统文件夹选择器</span>
            </button>
            {config?.hosts.map((host) => (
              <button
                key={host.alias}
                disabled={disabled}
                onClick={() => void browse(host.alias)}
                style={sourceButtonStyle}
              >
                <strong>{host.alias}</strong>
                <span style={{ color: '#888', fontSize: 12 }}>
                  {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
                </span>
              </button>
            ))}
            {!loading && config?.hosts.length === 0 && (
              <div style={{ color: '#888' }}>~/.ssh/config 中没有可用的具体 Host。</div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button disabled={disabled} onClick={() => { setAlias(''); setListing(null); }}>
                主机
              </button>
              {listing.crumbs.map((crumb) => (
                <button key={crumb.path} disabled={disabled} onClick={() => void browse(alias, crumb.path)}>
                  {crumb.name}
                </button>
              ))}
            </div>
            <div
              style={{
                minHeight: 180,
                overflow: 'auto',
                border: '1px solid rgba(128,128,128,.25)',
                borderRadius: 10,
              }}
            >
              {listing.entries.map((entry) => (
                <button
                  key={entry.path}
                  disabled={disabled}
                  onClick={() => void browse(alias, entry.path)}
                  style={directoryButtonStyle}
                >
                  <span aria-hidden="true">📁</span>
                  <span>{entry.name}</span>
                  {entry.hidden && <span style={{ marginLeft: 'auto', color: '#999', fontSize: 11 }}>隐藏</span>}
                </button>
              ))}
              {!loading && listing.entries.length === 0 && (
                <div style={{ padding: 16, color: '#888' }}>此目录没有子文件夹。</div>
              )}
            </div>
            {listing.truncated && <div style={{ color: '#d97706', fontSize: 12 }}>仅显示前 1000 个目录。</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newFolder}
                disabled={disabled}
                onChange={(event) => setNewFolder(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createFolder();
                }}
                placeholder="新建文件夹名称"
                style={{ flex: 1, minWidth: 0, padding: '8px 10px' }}
              />
              <button disabled={disabled || !newFolder.trim()} onClick={() => void createFolder()}>
                新建
              </button>
            </div>
          </>
        )}

        {error && <div role="alert" style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button disabled={busy} onClick={onCancel}>取消</button>
          {listing && (
            <button disabled={disabled} onClick={() => void chooseRemote()}>
              {busy ? '正在添加…' : '打开此文件夹'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const sourceButtonStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'flex-start',
  gap: 4,
  padding: 12,
  textAlign: 'left' as const,
  border: '1px solid rgba(128,128,128,.25)',
  borderRadius: 10,
  background: 'transparent',
};

const directoryButtonStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 12px',
  border: 0,
  borderBottom: '1px solid rgba(128,128,128,.12)',
  background: 'transparent',
  textAlign: 'left' as const,
};

function SshRemotePanel({ ssh }: { ssh: SshRemote }) {
  const [config, setConfig] = useState<SshConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    const r = await ssh.config();
    if (r.ok) setConfig(r.value);
    else setError(r.error.message);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12, maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0 }}>SSH Connections</h3>
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            Concrete Host aliases are discovered from your local OpenSSH config.
          </div>
        </div>
        <button disabled={loading} onClick={() => void load()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {config && (
        <div style={{ padding: 10, border: '1px solid rgba(128,128,128,.25)', borderRadius: 8 }}>
          <div style={{ color: '#888', fontSize: 12 }}>SSH config</div>
          <code style={{ fontSize: 12 }}>{config.configPath}</code>
          {!config.configExists && (
            <div style={{ marginTop: 6, color: '#d97706', fontSize: 12 }}>
              File not found. Create it and add a concrete <code>Host</code> entry, then refresh.
            </div>
          )}
        </div>
      )}

      {config?.hosts.length === 0 && config.configExists && (
        <div style={{ color: '#888' }}>No concrete SSH Host aliases found.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {config?.hosts.map((host) => (
          <div
            key={host.alias}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 12,
              border: '1px solid rgba(128,128,128,.25)',
              borderRadius: 8,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                marginTop: 5,
                borderRadius: '50%',
                background: '#6b7280',
                display: 'inline-block',
                flex: '0 0 auto',
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{host.alias}</div>
              <div style={{ color: '#888', fontSize: 12, overflowWrap: 'anywhere' }}>
                {host.user ? `${host.user}@` : ''}{host.host}:{host.port}
              </div>
              {(host.proxyJump || host.proxyCommand || host.identityFile) && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {host.proxyJump && <Badge>ProxyJump: {host.proxyJump}</Badge>}
                  {host.proxyCommand && <Badge>ProxyCommand</Badge>}
                  {host.identityFile && <Badge>Identity configured</Badge>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {config && config.legacyHostCount > 0 && (
        <div style={{ color: '#d97706', fontSize: 12 }}>
          {config.legacyHostCount} legacy DSH host {config.legacyHostCount === 1 ? 'entry remains' : 'entries remain'} as a read-only fallback.
          Move it to <code>{config.configPath}</code> when convenient.
        </div>
      )}
      {error && <div style={{ color: '#ef4444' }}>{error}</div>}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 999,
        background: 'rgba(128,128,128,.12)',
        color: '#888',
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}
