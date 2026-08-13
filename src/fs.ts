import { Context } from '@deepseek-ai/cordis';
import FileSystem, {
  FsError,
  FsTargetKey,
  FsVersion,
  type FsDirEntry,
  type FsEditOutcome,
  type FsEditRequest,
  type FsInfo,
  type FsPathInfo,
  type FsTarget,
  type FsWriteIntent,
  type FsWriteOutcome,
} from '@deepseek-ai/dsh-fs';
import type { SFTPWrapper, Stats } from 'ssh2';
import { SshConnectionManager } from './connection.js';
import { formatSshUri, parseSshUri, type SshUri } from './types.js';

/** Remote `ssh://` filesystem provider: implements the FileSystem seam over SFTP. */
export class RemoteFileSystem extends FileSystem {
  /** Default base for relative-path resolution: the workspace's ssh:// root. */
  private readonly baseUri: SshUri;

  constructor(
    ctx: Context,
    private readonly connections: SshConnectionManager,
    baseUri: string,
  ) {
    super(ctx);
    this.baseUri = parseSshUri(baseUri);
  }

  get sandboxMode(): undefined {
    return undefined;
  }

  async resolve(
    path: string,
    opts?: { cwd?: string; signal?: AbortSignal },
  ): Promise<FsTarget> {
    const uri = this.parseTargetPath(path, opts?.cwd);
    const key = formatSshUri(uri);
    return { targetKey: FsTargetKey(key), displayPath: `${uri.user ? uri.user + '@' : ''}${uri.host}:${uri.path}` };
  }

  processPath(target: FsTarget): string {
    // Remote absolute path in the backend's execution world.
    return parseSshUri(String(target.targetKey)).path;
  }

  fileUrl(target: FsTarget): string {
    return String(target.targetKey);
  }

  contains(parent: FsTarget, child: FsTarget): boolean {
    const p = parseSshUri(String(parent.targetKey));
    const c = parseSshUri(String(child.targetKey));
    if (p.host !== c.host || p.port !== c.port || p.user !== c.user) return false;
    const pp = ensureTrailingSlash(p.path);
    return c.path === p.path || c.path.startsWith(pp);
  }

  async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    const { uri, path } = this.split(target);
    try {
      const st = await this.sftp(uri, (s) => promisify<Stats>((cb) => s.stat(path, cb), signal));
      return statToFsInfo(st);
    } catch (e) {
      if (isCode(e, 'ENOENT')) return undefined;
      throw this.mapError(e);
    }
  }

  async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const uri = this.parseTargetPath(path, opts?.cwd);
    try {
      const st = await this.sftp(uri, (s) => promisify<Stats>((cb) => s.lstat(uri.path, cb), signal));
      return statToPathInfo(st);
    } catch (e) {
      if (isCode(e, 'ENOENT')) return undefined;
      throw this.mapError(e);
    }
  }

  async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    const { uri, path } = this.split(target);
    const buf = await this.readFile(uri, path, signal);
    return decodeText(buf);
  }

  async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    // v0.1: whole-file read yielded as a single chunk. Cross-chunk streaming is a
    // documented future refinement; semantics (decode + binary rejection) are equal.
    const text = await this.readText(target, signal);
    return {
      async *[Symbol.asyncIterator]() {
        if (text.length) yield text;
      },
    };
  }

  async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    const { uri, path } = this.split(target);
    const buf = await this.readFile(uri, path, signal);
    if (buf.length > maxBytes) throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
    return new Uint8Array(buf);
  }

  async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const { uri, path } = this.split(target);
    const entries = await this.sftp(uri, (s) => promisify<Array<{ filename: string; attrs: Stats }>>((cb) => s.readdir(path, cb), signal));
    const result: FsDirEntry[] = [];
    for (const e of entries) {
      const childPath = joinRemote(path, e.filename);
      const childUri = { ...uri, path: childPath };
      const key = formatSshUri(childUri);
      result.push({
        name: e.filename,
        type: statsType(e.attrs),
        target: { targetKey: FsTargetKey(key), displayPath: `${childUri.user ? childUri.user + '@' : ''}${childUri.host}:${childPath}` },
        version: FsVersion(`${Math.floor(e.attrs.mtime)}-${e.attrs.size}`),
        size: e.attrs.size,
      });
    }
    return result;
  }

  async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    _sandboxPolicy?: unknown,
  ): Promise<FsWriteOutcome> {
    const { uri, path } = this.split(target);
    const beforeStat = await this.statOrAbsent(target, signal);
    if (expected?.kind === 'createIfAbsent' && beforeStat) {
      throw new FsError('file already exists', 'FS_NOT_OBSERVED');
    }
    if (expected?.kind === 'replaceIfVersion') {
      if (!beforeStat) throw new FsError('file does not exist', 'FS_STALE_VERSION');
      if (String(beforeStat.version) !== String(expected.version)) throw new FsError('stale version', 'FS_STALE_VERSION');
    }
    const before = beforeStat ? await this.readText(target, signal) : null;
    // Atomic-ish: write to a sibling temp file then rename over the target.
    const tmp = `${path}.dsh-tmp-${Date.now()}`;
    await this.writeFile(uri, tmp, Buffer.from(content, 'utf8'), signal);
    try {
      await this.sftp(uri, (s) => promisify<void>((cb) => s.rename(tmp, path, cb), signal));
    } catch (e) {
      await this.tryUnlink(uri, tmp);
      throw this.mapError(e);
    }
    const afterStat = await this.stat(target, signal);
    return {
      operation: beforeStat ? 'update' : 'create',
      version: afterStat?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(content)}`),
      before,
      after: content.replace(/\r\n/g, '\n'),
    };
  }

  async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    _sandboxPolicy?: unknown,
  ): Promise<FsEditOutcome> {
    const before = await this.readText(target, signal);
    const norm = before.replace(/\r\n/g, '\n');
    const old = edit.oldString.replace(/\r\n/g, '\n');
    const newStr = edit.newString.replace(/\r\n/g, '\n');
    if (!old) throw new FsError('empty oldString', 'FS_AMBIGUOUS_EDIT');
    const stat = await this.stat(target, signal);
    if (expected && stat && String(stat.version) !== String(expected.version)) {
      throw new FsError('stale version', 'FS_STALE_VERSION');
    }
    const indices = allMatches(norm, old);
    let after: string;
    if (edit.replaceAll) {
      after = norm.split(old).join(newStr);
    } else if (indices.length === 0) {
      throw new FsError('oldString not found', 'FS_EDIT_NOT_FOUND');
    } else if (indices.length > 1) {
      throw new FsError('oldString matches more than once', 'FS_AMBIGUOUS_EDIT');
    } else {
      after = norm.slice(0, indices[0]) + newStr + norm.slice(indices[0] + old.length);
    }
    await this.writeText(target, after, undefined, signal);
    return {
      version: (await this.stat(target, signal))?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(after)}`),
      before: norm,
      after,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private parseTargetPath(path: string, cwd?: string): SshUri {
    if (path.startsWith('ssh://')) return parseSshUri(path);
    const base = cwd && cwd.startsWith('ssh://') ? parseSshUri(cwd) : this.baseUri;
    const abs = path.startsWith('/') ? path : joinRemote(base.path, path);
    return { ...base, path: abs };
  }

  private split(target: FsTarget): { uri: SshUri; path: string } {
    const uri = parseSshUri(String(target.targetKey));
    return { uri, path: uri.path };
  }

  private async sftp<T>(uri: SshUri, op: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
    const transport = await this.connections.transport(formatSshUri(uri));
    return transport.sftp(op);
  }

  private async readFile(uri: SshUri, path: string, signal?: AbortSignal): Promise<Buffer> {
    return this.sftp(uri, (s) => promisify<Buffer>((cb) => s.readFile(path, cb), signal));
  }

  private async writeFile(uri: SshUri, path: string, data: Buffer, signal?: AbortSignal): Promise<void> {
    await this.sftp(uri, (s) => promisify<void>((cb) => s.writeFile(path, data, cb), signal));
  }

  private async tryUnlink(uri: SshUri, path: string): Promise<void> {
    try {
      await this.sftp(uri, (s) => promisify<void>((cb) => s.unlink(path, cb)));
    } catch {
      /* best effort */
    }
  }

  private async statOrAbsent(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return this.stat(target, signal);
  }

  private mapError(e: unknown): FsError {
    const code = codeOf(e);
    const mapped =
      code === 'ENOENT' ? 'FS_NOT_FOUND' :
      code === 'EACCES' || code === 'EPERM' ? 'FS_PERMISSION_DENIED' :
      code === 'EISDIR' ? 'FS_NOT_REGULAR_FILE' :
      code === 'ENOTDIR' ? 'FS_NOT_DIRECTORY' :
      'FS_IO_ERROR';
    return new FsError(`remote fs: ${messageOf(e)}`, mapped, { cause: e as Error });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function promisify<T>(fn: (cb: (err: Error | null | undefined, result: T) => void) => void, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (!settled) {
        settled = true;
        reject(new FsError('aborted', 'FS_ABORTED'));
      }
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    fn((err, result) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function statToFsInfo(st: { mtime: number; size: number; isFile(): boolean; isDirectory(): boolean }): FsInfo {
  return {
    version: FsVersion(`${Math.floor(st.mtime)}-${st.size}`),
    type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
    size: st.size,
  };
}

function statToPathInfo(st: { mtime: number; size: number; isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): FsPathInfo {
  return {
    version: FsVersion(`${Math.floor(st.mtime)}-${st.size}`),
    type: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
    size: st.size,
  };
}

function statsType(st: { isFile(): boolean; isDirectory(): boolean }): 'file' | 'directory' | 'other' {
  return st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other';
}

function decodeText(buf: Buffer): string {
  if (buf.includes(0)) throw new FsError('binary file', 'FS_NOT_TEXT');
  // Reject invalid UTF-8 (replacement chars are tolerated only for valid multi-byte).
  const text = buf.toString('utf8');
  if (text.includes('\uFFFD')) {
    // A literal U+FFFD in content is rare; treat replacement as invalid encoding.
    throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
  }
  return text;
}

function joinRemote(base: string, ...parts: string[]): string {
  let p = base;
  for (const part of parts) p = p.replace(/\/+$/, '') + '/' + part.replace(/^\/+/, '');
  return normalizeRemote(p);
}

function normalizeRemote(p: string): string {
  const segs: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') segs.pop();
    else segs.push(seg);
  }
  return '/' + segs.join('/');
}

function ensureTrailingSlash(p: string): string {
  return p.endsWith('/') ? p : p + '/';
}

function allMatches(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return out;
}

function isCode(e: unknown, code: string): boolean {
  return codeOf(e) === code;
}

function codeOf(e: unknown): string | undefined {
  return (e as { code?: string })?.code;
}

function messageOf(e: unknown): string {
  return (e as Error)?.message ?? String(e);
}
