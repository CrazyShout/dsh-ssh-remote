import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HELPER_REMOTE_ROOT = '.local/share/dsh-remote-helper';
export const HELPER_STDERR_MAX_BYTES = 16 * 1024;

export interface HelperAsset {
  path: string;
  content: Buffer;
  sha256: string;
  remotePath: string;
}

export interface RemoteHelperInstallerOptions {
  assetPath?: string;
  sshBinary?: string;
  spawnProcess?: typeof spawn;
  timeoutMs?: number;
}

export interface RemoteHelperInstallResult {
  alias: string;
  sha256: string;
  remotePath: string;
}

export class RemoteHelperInstallError extends Error {
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;

  constructor(
    message: string,
    details: { stderr?: string; exitCode?: number | null; signal?: NodeJS.Signals | null } = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RemoteHelperInstallError';
    this.stderr = details.stderr ?? '';
    this.exitCode = details.exitCode ?? null;
    this.signal = details.signal ?? null;
  }
}

/** Locate the source asset both before and after TypeScript compilation. */
export function resolveHelperAssetPath(assetPath?: string): string {
  const candidates = assetPath === undefined
    ? [fileURLToPath(new URL('../../helper/dsh_remote_helper.py', import.meta.url))]
    : [assetPath];
  const found = candidates.find(existsSync);
  if (found === undefined) {
    throw new RemoteHelperInstallError(
      `dsh_remote_helper.py is missing (checked ${candidates.join(', ')})`,
    );
  }
  return found;
}

export function loadHelperAsset(assetPath?: string): HelperAsset {
  const path = resolveHelperAssetPath(assetPath);
  const content = readFileSync(path);
  const sha256 = createHash('sha256').update(content).digest('hex');
  return {
    path,
    content,
    sha256,
    remotePath: helperRemotePath(sha256),
  };
}

export function helperRemotePath(sha256: string): string {
  assertSha256(sha256);
  return `$HOME/${HELPER_REMOTE_ROOT}/releases/${sha256}/helper.py`;
}

export function buildHelperConnectCommand(sha256: string): string {
  return `exec python3 \"${helperRemotePath(sha256)}\" connect --stdio`;
}

export function buildSystemSshArgs(alias: string, remoteCommand: string): string[] {
  assertSshAlias(alias);
  return [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'RemoteCommand=none',
    '-o', 'SessionType=default',
    '-o', 'StdinNull=no',
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '--', alias,
    remoteCommand,
  ];
}

/**
 * Redact credential-shaped diagnostics before retaining or publishing them.
 * This is deliberately conservative: diagnostics are for classification, not
 * a byte-perfect copy of a user's SSH environment.
 */
export function redactHelperDiagnostic(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*(?:PRIVATE|SECRET)[^-]*-----[\s\S]*?-----END [^-]*-----/giu, '[REDACTED PRIVATE MATERIAL]')
    .replace(/\b(password|passphrase|token|secret|authorization)\s*[:=]\s*([^\s,;]+)/giu, '$1=[REDACTED]')
    .replace(/\bSSH_AUTH_SOCK\s*=\s*[^\s]+/gu, 'SSH_AUTH_SOCK=[REDACTED]')
    .replace(/\/(?:Users|home)\/[^/\s]+/gu, '~');
}

export class RemoteHelperInstaller {
  readonly asset: HelperAsset;
  private readonly sshBinary: string;
  private readonly spawnProcess: typeof spawn;
  private readonly timeoutMs: number;

  constructor(options: RemoteHelperInstallerOptions = {}) {
    this.asset = loadHelperAsset(options.assetPath);
    this.sshBinary = options.sshBinary ?? 'ssh';
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async install(alias: string, signal?: AbortSignal): Promise<RemoteHelperInstallResult> {
    assertSshAlias(alias);
    signal?.throwIfAborted();
    const script = installScript(this.asset.sha256);
    const args = buildSystemSshArgs(alias, `sh -c ${shellQuote(script)}`);
    const child = this.spawnProcess(this.sshBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill();
      throw new RemoteHelperInstallError('SSH installer did not expose piped stdio');
    }

    const result = await runUploadProcess(
      child,
      this.asset.content,
      signal,
      this.timeoutMs,
    );
    if (result.code !== 0) {
      throw new RemoteHelperInstallError(
        `remote helper installation failed for ${alias}${result.stderr ? `: ${result.stderr}` : ''}`,
        { stderr: result.stderr, exitCode: result.code, signal: result.signal },
      );
    }
    return { alias, sha256: this.asset.sha256, remotePath: this.asset.remotePath };
  }
}

function installScript(sha256: string): string {
  assertSha256(sha256);
  const relativeRoot = HELPER_REMOTE_ROOT;
  return [
    'set -eu',
    'umask 077',
    `base="$HOME/${relativeRoot}"`,
    `release="$base/releases/${sha256}"`,
    'target="$release/helper.py"',
    'mkdir -p "$base/releases" "$release"',
    'chmod 700 "$base" "$base/releases" "$release"',
    'tmp="$release/.helper.py.tmp.$$"',
    'trap \'rm -f "$tmp"\' EXIT HUP INT TERM',
    'cat > "$tmp"',
    `python3 -c ${shellQuote("import hashlib,sys; p,e=sys.argv[1:]; a=hashlib.sha256(open(p,'rb').read()).hexdigest(); raise SystemExit(0 if a == e else 'helper sha256 mismatch')")} "$tmp" ${sha256}`,
    'chmod 600 "$tmp"',
    'mv -f "$tmp" "$target"',
    'trap - EXIT HUP INT TERM',
  ].join('\n');
}

function runUploadProcess(
  child: ChildProcess,
  content: Buffer,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      run();
    };
    const terminate = (): void => {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    };
    const onAbort = (): void => {
      terminate();
      finish(() => reject(signal?.reason ?? new Error('remote helper installation aborted')));
    };
    const timer = setTimeout(() => {
      terminate();
      finish(() => reject(new RemoteHelperInstallError(`remote helper installation timed out after ${timeoutMs}ms`, {
        stderr: boundedDiagnostic(stderr),
      })));
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = boundedDiagnostic(`${stderr}${String(chunk)}`);
    });
    // The install script intentionally emits nothing, but a remote sshrc may.
    // Drain it so an untrusted banner cannot backpressure the upload process.
    child.stdout?.on('data', () => {});
    child.once('error', (error) => finish(() => reject(new RemoteHelperInstallError(
      `failed to start system SSH: ${error.message}`,
      { stderr: boundedDiagnostic(stderr) },
      { cause: error },
    ))));
    child.once('close', (code, childSignal) => finish(() => resolve({
      code,
      signal: childSignal,
      stderr: boundedDiagnostic(stderr),
    })));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      child.stdin?.end(content);
    } catch (error) {
      terminate();
      finish(() => reject(new RemoteHelperInstallError('failed to upload remote helper', {
        stderr: boundedDiagnostic(stderr),
      }, { cause: error as Error })));
    }
  });
}

function boundedDiagnostic(value: string): string {
  const sanitized = redactHelperDiagnostic(value);
  const bytes = Buffer.from(sanitized, 'utf8');
  if (bytes.length <= HELPER_STDERR_MAX_BYTES) return sanitized.trim();
  let start = bytes.length - HELPER_STDERR_MAX_BYTES;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString('utf8').trim();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function assertSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error('invalid helper sha256');
}

export function assertSshAlias(alias: string): void {
  if (!alias || alias.startsWith('-') || /[\s\0\r\n]/u.test(alias)) {
    throw new Error(`invalid SSH alias: ${JSON.stringify(alias)}`);
  }
}
