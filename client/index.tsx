import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';

export const name = 'dsh-ssh-remote-client';
export const inject: string[] = ['slots'];

/**
 * v0.1 sidebar scaffold. The host-side `ssh_remote` tool is the primary
 * interface today; this registers a sidebar entry that renders remote
 * workspaces with a connection status dot. The exact sidebar owner contract
 * (`store`/`inject`/`locale` sharing) is intentionally left for runtime
 * iteration against the composed shell — see README "Client UI status".
 */
export function apply(ctx: ClientContext): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slots = ctx.slots as any;
  slots.inject('sidebar.workspaces', () =>
    slots.register(
      {
        name: 'ssh-remote-sidebar',
        children: {},
      },
      SshRemoteSidebar,
    ),
  );
}

interface WorkspaceRow {
  id: string;
  title: string;
  uri: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastError?: string;
}

const STATUS_COLOR: Record<WorkspaceRow['status'], string> = {
  connected: '#22c55e',
  connecting: '#eab308',
  reconnecting: '#eab308',
  disconnected: '#ef4444',
  error: '#ef4444',
};

function SshRemoteSidebar(props: { workspaces?: WorkspaceRow[] }) {
  const list = props.workspaces ?? [];
  if (list.length === 0) {
    return (
      <div style={{ padding: '8px 12px', color: 'var(--text-muted, #888)' }}>
        No SSH workspaces. Ask the agent to run ssh_remote add.
      </div>
    );
  }
  return (
    <div style={{ padding: '4px 0' }}>
      {list.map((ws) => (
        <div
          key={ws.id}
          title={ws.lastError ?? ws.uri}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            fontSize: '13px',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STATUS_COLOR[ws.status] ?? '#888',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ws.title}
          </span>
        </div>
      ))}
    </div>
  );
}
