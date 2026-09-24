import { execFile, spawn, type ChildProcess } from 'node:child_process';
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
  /**
   * Pre-resolved local OpenSSH capabilities. When omitted, the installer probes
   * `ssh -V` once (cached) so the 9.9-only transport options are only emitted
   * when the client actually accepts them. Inject in tests for hermetic runs.
   */
  capabilities?: SshCapabilities;
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

/**
 * Local OpenSSH client capabilities relevant to the helper transport. The
 * `SessionType`, `StdinNull`, and `RemoteCommand=none` keywords were all added
 * in OpenSSH 9.9 (2024-11). Older clients reject them with
 * "Bad configuration option" and abort before the helper can install/connect.
 */
export interface SshCapabilities {
  readonly sessionTypeSupported: boolean;
}

/** Conservative default: assume a modern client (the original hard-coded behaviour). */
export const MODERN_SSH_CAPABILITIES: SshCapabilities = { sessionTypeSupported: true };

const capabilityCache = new Map<string, Promise<SshCapabilities>>();

/**
 * Probe the local OpenSSH client once and cache the result per binary. On a
 * recognized OpenSSH banner, `SessionType` support is gated on >= 9.9; on an
 * unreadable banner or probe failure the original (modern) behaviour is kept.
 */
export async function detectSshCapabilities(
  sshBinary = 'ssh',
  runVersion: (binary: string) => Promise<string> = runSshVersion,
): Promise<SshCapabilities> {
  let probe = capabilityCache.get(sshBinary);
  if (!probe) {
    probe = (async () => {
      try {
        const version = parseOpenSshVersion(await runVersion(sshBinary));
        return { sessionTypeSupported: version === null || atLeast(version, 9, 9) };
      } catch {
        return MODERN_SSH_CAPABILITIES;
      }
    })();
    capabilityCache.set(sshBinary, probe);
  }
  return probe;
}

/** Test-only: clear the cached capability probe between isolated runs. */
export function resetSshCapabilityCache(): void {
  capabilityCache.clear();
}

/** Parse an `OpenSSH_X.Y[pZ]` banner into a `[major, minor]` tuple. */
function parseOpenSshVersion(banner: string): [number, number] | null {
  const match = /OpenSSH_(\d+)(?:\.(\d+))?/iu.exec(banner);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor)) return null;
  return [major, minor];
}

function atLeast(version: [number, number], major: number, minor: number): boolean {
  return version[0] > major || (version[0] === major && version[1] >= minor);
}

/** `ssh -V` prints its banner to stderr and exits 0 on every OpenSSH build. */
function runSshVersion(sshBinary: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(sshBinary, ['-V'], { encoding: 'utf8', timeout: 5_000 }, (error, stdout, stderr) => {
      if (stderr) { resolve(stderr); return; }
      if (stdout) { resolve(stdout); return; }
      reject(error ?? new Error(`${sshBinary} -V produced no output`));
    });
  });
}

export function buildSystemSshArgs(
  alias: string,
  remoteCommand: string,
  capabilities: SshCapabilities = MODERN_SSH_CAPABILITIES,
): string[] {
  assertSshAlias(alias);
  const args = ['-T', '-o', 'BatchMode=yes'];
  if (capabilities.sessionTypeSupported) {
    // OpenSSH >= 9.9: defensively cancel a session-type / remote-command /
    // null-stdin override the user may have set for this Host. Older clients
    // reject these keywords, so they are gated on the probed client version.
    args.push('-o', 'RemoteCommand=none', '-o', 'SessionType=default', '-o', 'StdinNull=no');
  }
  args.push(
    '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '--', alias,
    remoteCommand,
  );
  return args;
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
  private readonly capabilities?: SshCapabilities;

  constructor(options: RemoteHelperInstallerOptions = {}) {
    this.asset = loadHelperAsset(options.assetPath);
    this.sshBinary = options.sshBinary ?? 'ssh';
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.capabilities = options.capabilities;
  }

  async install(alias: string, signal?: AbortSignal): Promise<RemoteHelperInstallResult> {
    assertSshAlias(alias);
    signal?.throwIfAborted();
    const capabilities = this.capabilities ?? await detectSshCapabilities(this.sshBinary);
    signal?.throwIfAborted();
    const script = installScript(this.asset.sha256);
    const args = buildSystemSshArgs(alias, `sh -c ${shellQuote(script)}`, capabilities);
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
    // SSH may exit while the helper body is still being uploaded. The resulting
    // asynchronous EPIPE is emitted by stdin, not thrown by end(). Consume it at
    // the process boundary so a failed remote connection cannot terminate DSH.
    child.stdin?.on('error', (error) => {
      terminate();
      finish(() => reject(new RemoteHelperInstallError('failed to upload remote helper', {
        stderr: boundedDiagnostic(stderr),
      }, { cause: error })));
    });
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
