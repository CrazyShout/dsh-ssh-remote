import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A minimal parsed SSH config host entry. */
export interface SshConfigHost {
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
}

/**
 * Parse a `~/.ssh/config`-style file. Only concrete `Host <alias>` blocks are
 * returned; `Host *` wildcards and `Match` blocks are ignored (mirrors Codex's
 * behavior of resolving concrete aliases only).
 */
export function parseSshConfig(text: string): SshConfigHost[] {
  const hosts: SshConfigHost[] = [];
  let current: SshConfigHost | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [keyword, ...rest] = line.split(/\s+/);
    const value = rest.join(' ');
    const key = keyword.toLowerCase();
    if (key === 'host') {
      // A wildcard host starts a block we ignore; a concrete alias starts one we keep.
      if (value.includes('*') || value.includes('?')) {
        current = null;
      } else {
        current = { host: value };
        hosts.push(current);
      }
    } else if (key === 'match') {
      current = null;
    } else if (current) {
      if (key === 'hostname') current.hostName = value;
      else if (key === 'user') current.user = value;
      else if (key === 'port') current.port = Number.parseInt(value, 10);
      else if (key === 'identityfile') current.identityFile = expandHome(value);
    }
  }
  return hosts;
}

/** Expand a leading `~` against the OS home directory. */
export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/** Read and parse `~/.ssh/config`, returning an empty list when absent. */
export function loadUserSshConfig(): SshConfigHost[] {
  try {
    const path = join(homedir(), '.ssh', 'config');
    return parseSshConfig(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Resolve an alias (or bare hostname) against parsed SSH config entries.
 * Returns `undefined` when no entry matches; the caller then uses the input
 * directly as a hostname.
 */
export function resolveSshAlias(
  alias: string,
  config: SshConfigHost[],
): SshConfigHost | undefined {
  return config.find((h) => h.host === alias);
}
