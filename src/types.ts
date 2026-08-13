/** Shared vocabulary for the SSH remote workspaces plugin. */

/** A remote workspace connection status. */
export type SshConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** A parsed `ssh://user@host:port/path` URI. */
export interface SshUri {
  host: string;
  port: number;
  user: string;
  path: string;
}

/** Parse an `ssh://` URI. Throws on a malformed URI. */
export function parseSshUri(uri: string): SshUri {
  if (!uri.startsWith('ssh://')) throw new Error(`invalid ssh uri: ${uri}`);
  const rest = uri.slice('ssh://'.length);
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '/' : rest.slice(slash);
  const at = authority.lastIndexOf('@');
  let user = '';
  let hostport = authority;
  if (at !== -1) {
    user = authority.slice(0, at);
    hostport = authority.slice(at + 1);
  }
  const colon = hostport.lastIndexOf(':');
  let host = hostport;
  let port = 22;
  if (colon !== -1) {
    host = hostport.slice(0, colon);
    port = Number.parseInt(hostport.slice(colon + 1), 10);
    if (Number.isNaN(port)) port = 22;
  }
  if (!host) throw new Error(`invalid ssh uri (missing host): ${uri}`);
  return { host, port, user, path };
}

/** Serialize an {@link SshUri} back to an `ssh://` string. */
export function formatSshUri(u: SshUri): string {
  const userpart = u.user ? `${u.user}@` : '';
  const portpart = u.port === 22 ? '' : `:${u.port}`;
  return `ssh://${userpart}${u.host}${portpart}${u.path}`;
}

/** A registered remote workspace, persisted and served to the client. */
export interface RemoteWorkspace {
  id: string;
  uri: string;
  title: string;
  status: SshConnectionStatus;
  lastError?: string;
  createdAt: number;
}

/** A status change payload broadcast to the client. */
export interface SshStatusChange {
  workspaceId: string;
  status: SshConnectionStatus;
  reason?: string;
}
