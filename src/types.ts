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
  let host = hostport;
  let port = 22;
  if (hostport.startsWith('[')) {
    const bracket = hostport.indexOf(']');
    if (bracket === -1) throw new Error(`invalid ssh uri (unterminated IPv6 host): ${uri}`);
    host = hostport.slice(1, bracket);
    const suffix = hostport.slice(bracket + 1);
    if (suffix) {
      if (!suffix.startsWith(':')) throw new Error(`invalid ssh uri authority: ${uri}`);
      port = parseSshPort(suffix.slice(1), uri);
    }
  } else {
    const firstColon = hostport.indexOf(':');
    const lastColon = hostport.lastIndexOf(':');
    if (firstColon !== -1 && firstColon !== lastColon) {
      throw new Error(`invalid ssh uri (IPv6 hosts must use brackets): ${uri}`);
    }
    if (lastColon !== -1) {
      host = hostport.slice(0, lastColon);
      port = parseSshPort(hostport.slice(lastColon + 1), uri);
    }
  }
  if (!host) throw new Error(`invalid ssh uri (missing host): ${uri}`);
  if (host.startsWith('-') || /[\s\0]/u.test(host)) throw new Error(`invalid ssh uri host: ${uri}`);
  if (user.startsWith('-') || /[\s\0]/u.test(user)) {
    throw new Error(`invalid ssh uri user: ${uri}`);
  }
  return { host, port, user, path };
}

/** Serialize an {@link SshUri} back to an `ssh://` string. */
export function formatSshUri(u: SshUri): string {
  const userpart = u.user ? `${u.user}@` : '';
  const portpart = u.port === 22 ? '' : `:${u.port}`;
  const host = u.host.includes(':') ? `[${u.host}]` : u.host;
  const path = u.path.startsWith('/') ? u.path : `/${u.path}`;
  return `ssh://${userpart}${host}${portpart}${path}`;
}

function parseSshPort(value: string, uri: string): number {
  if (!/^\d+$/u.test(value)) throw new Error(`invalid ssh uri port: ${uri}`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid ssh uri port: ${uri}`);
  }
  return port;
}
