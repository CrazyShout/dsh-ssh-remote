import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** OpenSSH host-key policy values normalized for the ssh2 verifier. */
export type StrictHostKeyPolicy = 'yes' | 'ask' | 'accept-new' | 'no';

/** Effective OpenSSH facts needed to verify an ssh2 server key. */
export interface OpenSshTrustConfig {
  hostName?: string;
  port?: number;
  user?: string;
  hostKeyAlias?: string;
  strictHostKeyChecking?: string;
  userKnownHostsFiles?: string[];
  globalKnownHostsFiles?: string[];
}

export interface SshKeygenResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type SshKeygenRunner = (lookup: string, file: string) => Promise<SshKeygenResult>;

/** Parsed trust material for one effective OpenSSH destination. */
export interface OpenSshHostTrust {
  lookup: string;
  policy: StrictHostKeyPolicy;
  trustedKeys: ReadonlySet<string>;
  revokedKeys: ReadonlySet<string>;
  certificateAuthorities: number;
  files: readonly string[];
}

const DEFAULT_USER_FILES = [join(homedir(), '.ssh', 'known_hosts'), join(homedir(), '.ssh', 'known_hosts2')];
const DEFAULT_GLOBAL_FILES = ['/etc/ssh/ssh_known_hosts', '/etc/ssh/ssh_known_hosts2'];

/**
 * Resolve the exact known_hosts entries OpenSSH uses for one target. `ssh-keygen
 * -F` performs pattern and hashed-host matching, so this code never attempts to
 * reimplement OpenSSH's hostname matcher.
 */
export async function loadOpenSshHostTrust(
  config: OpenSshTrustConfig | undefined,
  fallbackHost: string,
  fallbackPort: number,
  runner: SshKeygenRunner = runSshKeygen,
): Promise<OpenSshHostTrust> {
  const host = config?.hostName || fallbackHost;
  const port = config?.port ?? fallbackPort;
  const lookup = config?.hostKeyAlias || (port === 22 ? host : `[${host}]:${port}`);
  const policy = normalizeStrictHostKeyChecking(config?.strictHostKeyChecking);
  const candidates = [
    ...(config?.userKnownHostsFiles ?? DEFAULT_USER_FILES),
    ...(config?.globalKnownHostsFiles ?? DEFAULT_GLOBAL_FILES),
  ]
    .map(expandKnownHostsPath)
    .filter((file, index, files) => file.toLowerCase() !== 'none' && files.indexOf(file) === index);
  const files = candidates.filter(existsSync);
  const trustedKeys = new Set<string>();
  const revokedKeys = new Set<string>();
  let certificateAuthorities = 0;

  for (const file of files) {
    const result = await runner(lookup, file);
    if (result.code === 1) continue; // no matching host in this file
    if (result.code !== 0) {
      throw new Error(`failed to read OpenSSH known_hosts file ${file}: ${result.stderr.trim() || `ssh-keygen exited ${result.code}`}`);
    }
    const parsed = parseSshKeygenOutput(result.stdout);
    for (const key of parsed.trustedKeys) trustedKeys.add(key);
    for (const key of parsed.revokedKeys) revokedKeys.add(key);
    certificateAuthorities += parsed.certificateAuthorities;
  }

  return { lookup, policy, trustedKeys, revokedKeys, certificateAuthorities, files };
}

/** Parse `ssh-keygen -F` output into raw SSH key blobs (base64 wire keys). */
export function parseSshKeygenOutput(output: string): {
  trustedKeys: Set<string>;
  revokedKeys: Set<string>;
  certificateAuthorities: number;
} {
  const trustedKeys = new Set<string>();
  const revokedKeys = new Set<string>();
  let certificateAuthorities = 0;
  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split(/\s+/u);
    const marker = fields[0]?.startsWith('@') ? fields.shift() : undefined;
    if (fields.length < 3) continue;
    const encoded = fields[2];
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) continue;
    if (marker === '@revoked') revokedKeys.add(encoded);
    else if (marker === '@cert-authority') certificateAuthorities += 1;
    else trustedKeys.add(encoded);
  }
  return { trustedKeys, revokedKeys, certificateAuthorities };
}

/** Build the fail-closed ssh2 verifier for already trusted OpenSSH keys. */
export function createHostVerifier(trust: OpenSshHostTrust): (key: Buffer) => boolean {
  return (key: Buffer) => {
    const encoded = key.toString('base64');
    if (trust.revokedKeys.has(encoded)) return false;
    if (trust.policy === 'no') return true;
    return trust.trustedKeys.has(encoded);
  };
}

/**
 * Unknown keys require the operator to establish trust with OpenSSH first.
 * This intentionally refuses to implement an invisible TOFU prompt in a Web
 * request; `ssh <alias>` owns confirmation and writes known_hosts atomically.
 */
export function assertHostTrustReady(trust: OpenSshHostTrust, alias: string): void {
  if (trust.policy === 'no' || trust.trustedKeys.size > 0) return;
  const authorityDetail = trust.certificateAuthorities > 0
    ? ' Host certificates backed only by @cert-authority entries are not yet supported by the ssh2 file channel.'
    : '';
  throw new Error(
    `SSH host key for ${trust.lookup} is not trusted for ${alias}. Run "ssh ${alias}" once and verify the fingerprint, then retry.${authorityDetail}`,
  );
}

export function normalizeStrictHostKeyChecking(value: string | undefined): StrictHostKeyPolicy {
  switch ((value ?? 'ask').toLowerCase()) {
    case 'yes':
    case 'true':
      return 'yes';
    case 'no':
    case 'false':
    case 'off':
      return 'no';
    case 'accept-new':
      return 'accept-new';
    default:
      return 'ask';
  }
}

function expandKnownHostsPath(path: string): string {
  if (path === '~' || path === '%d') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  if (path.startsWith('%d/')) return join(homedir(), path.slice(3));
  return path;
}

function runSshKeygen(lookup: string, file: string): Promise<SshKeygenResult> {
  return new Promise((resolveResult) => {
    execFile(
      'ssh-keygen',
      ['-F', lookup, '-f', file],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const rawCode = (error as NodeJS.ErrnoException & { code?: number } | null)?.code;
        const code = typeof rawCode === 'number' ? rawCode : error ? 2 : 0;
        resolveResult({ code, stdout, stderr });
      },
    );
  });
}
