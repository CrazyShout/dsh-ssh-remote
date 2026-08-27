import FileSystem, { FsError, FsTargetKey, FsVersion, } from '@deepseek-ai/dsh-fs';
import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { finished } from 'node:stream/promises';
import { formatSshUri, parseSshUri } from './types.js';
/** Remote `ssh://` filesystem provider: implements the FileSystem seam over SFTP. */
export class RemoteFileSystem extends FileSystem {
    connections;
    /** Default base for relative-path resolution: the workspace's ssh:// root. */
    baseUri;
    /** Serialize mutation critical sections per canonical remote target. */
    mutations = new Map();
    constructor(ctx, connections, baseUri) {
        super(ctx);
        this.connections = connections;
        this.baseUri = normalizeSshUri(parseSshUri(baseUri));
    }
    get sandboxMode() {
        return undefined;
    }
    async resolve(path, opts) {
        const parsed = this.parseTargetPath(path, opts?.cwd);
        let uri;
        try {
            uri = { ...parsed, path: await this.canonicalizePath(parsed, opts?.signal) };
        }
        catch (error) {
            if (error instanceof FsError)
                throw error;
            throw this.mapError(error);
        }
        const key = formatSshUri(uri);
        return { targetKey: FsTargetKey(key), displayPath: `${uri.user ? uri.user + '@' : ''}${uri.host}:${uri.path}` };
    }
    processPath(target) {
        // Remote absolute path in the backend's execution world.
        return normalizeRemote(parseSshUri(String(target.targetKey)).path);
    }
    fileUrl(target) {
        const remotePath = normalizeRemote(parseSshUri(String(target.targetKey)).path);
        const url = new URL('file:///');
        url.pathname = remotePath;
        return url.href;
    }
    contains(parent, child) {
        const p = normalizeSshUri(parseSshUri(String(parent.targetKey)));
        const c = normalizeSshUri(parseSshUri(String(child.targetKey)));
        if (p.host !== c.host || p.port !== c.port || p.user !== c.user)
            return false;
        const pp = ensureTrailingSlash(p.path);
        return c.path === p.path || c.path.startsWith(pp);
    }
    async stat(target, signal) {
        const { uri, path } = this.split(target);
        try {
            const st = await this.sftp(uri, (s) => promisify((cb) => s.stat(path, cb), signal));
            return statToFsInfo(st);
        }
        catch (e) {
            if (isCode(e, 'ENOENT'))
                return undefined;
            throw this.mapError(e);
        }
    }
    async lstat(path, opts, signal) {
        const uri = this.parseTargetPath(path, opts?.cwd);
        try {
            const st = await this.sftp(uri, (s) => promisify((cb) => s.lstat(uri.path, cb), signal));
            return statToPathInfo(st);
        }
        catch (e) {
            if (isCode(e, 'ENOENT'))
                return undefined;
            throw this.mapError(e);
        }
    }
    async readText(target, signal) {
        const { uri, path } = this.split(target);
        const buf = await this.readFile(uri, path, signal);
        return decodeText(buf);
    }
    async streamText(target, signal) {
        const { uri, path } = this.split(target);
        signal?.throwIfAborted();
        const stream = await this.sftp(uri, async (sftp) => sftp.createReadStream(path));
        const mapError = (error) => this.mapError(error);
        return {
            async *[Symbol.asyncIterator]() {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                const aborted = new FsError('aborted', 'FS_ABORTED');
                const completion = finished(stream);
                // Attach a rejection observer immediately; the generator may be paused
                // at a yielded chunk when the underlying SFTP handle reports an error.
                void completion.catch(() => { });
                const onAbort = () => {
                    stream.destroy(aborted);
                };
                if (signal?.aborted) {
                    stream.destroy();
                    throw aborted;
                }
                signal?.addEventListener('abort', onAbort, { once: true });
                try {
                    for await (const chunk of stream) {
                        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        if (bytes.includes(0))
                            throw new FsError('binary file', 'FS_NOT_TEXT');
                        let text;
                        try {
                            text = decoder.decode(bytes, { stream: true });
                        }
                        catch {
                            throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
                        }
                        if (text.length > 0)
                            yield text;
                    }
                    let tail;
                    try {
                        tail = decoder.decode();
                    }
                    catch {
                        throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
                    }
                    if (tail.length > 0)
                        yield tail;
                    // Async iteration reaches readable `end` before ssh2 necessarily
                    // receives the remote CLOSE response. Do not publish completion until
                    // that file handle has fully quiesced.
                    await completion;
                }
                catch (error) {
                    if (error instanceof FsError)
                        throw error;
                    if (signal?.aborted)
                        throw aborted;
                    throw mapError(error);
                }
                finally {
                    signal?.removeEventListener('abort', onAbort);
                    if (!stream.destroyed)
                        stream.destroy();
                    try {
                        await completion;
                    }
                    catch {
                        // The primary mapped stream/abort error is raised above.
                    }
                }
            },
        };
    }
    async readBytes(target, signal, maxBytes) {
        const { uri, path } = this.split(target);
        const info = await this.stat(target, signal);
        if (info?.size !== undefined && info.size > maxBytes) {
            throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
        }
        const buf = await this.readFile(uri, path, signal);
        if (buf.length > maxBytes)
            throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
        return new Uint8Array(buf);
    }
    async listDir(target, signal) {
        const { uri, path } = this.split(target);
        return this.sftp(uri, async (sftp) => {
            const entries = await promisify((cb) => sftp.readdir(path, cb), signal);
            const result = [];
            for (const entry of entries) {
                const lexicalPath = joinRemote(path, entry.filename);
                // A normal child under an already-canonical parent cannot escape. A
                // symlink can, so give it the same canonical identity as resolve()
                // before exposing the target to consumers or containment checks.
                const childPath = entry.attrs.isSymbolicLink()
                    ? await canonicalizeRemotePath(sftp, lexicalPath, signal)
                    : lexicalPath;
                const childUri = { ...uri, path: childPath };
                const key = formatSshUri(childUri);
                result.push({
                    name: entry.filename,
                    type: statsType(entry.attrs),
                    target: { targetKey: FsTargetKey(key), displayPath: `${childUri.user ? childUri.user + '@' : ''}${childUri.host}:${childPath}` },
                    version: statsVersion(entry.attrs),
                    size: entry.attrs.size,
                });
            }
            return result.sort((left, right) => left.name.localeCompare(right.name));
        });
    }
    async writeText(target, content, expected, signal, _sandboxPolicy) {
        return this.withMutation(String(target.targetKey), () => this.writeTextUnlocked(target, content, expected, signal));
    }
    async writeTextUnlocked(target, content, expected, signal, expectedBasis) {
        const { uri, path } = this.split(target);
        const beforeStat = await this.statOrAbsent(target, signal);
        if (expected?.kind === 'createIfAbsent' && beforeStat) {
            throw beforeStat.type === 'file'
                ? new FsError('file already exists', 'FS_NOT_OBSERVED')
                : new FsError('existing target is not a regular file', 'FS_NOT_REGULAR_FILE');
        }
        if (expected?.kind === 'replaceIfVersion') {
            if (!beforeStat)
                throw new FsError('file does not exist', 'FS_STALE_VERSION');
            if (String(beforeStat.version) !== String(expected.version))
                throw new FsError('stale version', 'FS_STALE_VERSION');
        }
        const before = beforeStat ? await this.readText(target, signal) : null;
        if (expectedBasis !== undefined && before !== expectedBasis) {
            throw new FsError('stale content', 'FS_STALE_VERSION');
        }
        await this.writeFile(uri, path, Buffer.from(content, 'utf8'), signal, expected?.kind === 'createIfAbsent', expected?.kind === 'replaceIfVersion' ? expected.version : undefined, expected?.kind === 'replaceIfVersion' && before !== null
            ? Buffer.from(expectedBasis ?? before, 'utf8')
            : undefined);
        const afterStat = await this.stat(target, signal);
        return {
            operation: beforeStat ? 'update' : 'create',
            version: afterStat?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(content)}`),
            before,
            after: content.replace(/\r\n/g, '\n'),
        };
    }
    async editText(target, edit, expected, signal, _sandboxPolicy) {
        return this.withMutation(String(target.targetKey), () => this.editTextUnlocked(target, edit, expected, signal));
    }
    async editTextUnlocked(target, edit, expected, signal) {
        const before = await this.readText(target, signal);
        const norm = before.replace(/\r\n/g, '\n');
        const old = edit.oldString.replace(/\r\n/g, '\n');
        const newStr = edit.newString.replace(/\r\n/g, '\n');
        if (!old)
            throw new FsError('empty oldString', 'FS_AMBIGUOUS_EDIT');
        const stat = await this.stat(target, signal);
        if (stat?.version === undefined) {
            throw new FsError('file changed or disappeared while editing', 'FS_STALE_VERSION');
        }
        if (expected && String(stat.version) !== String(expected.version)) {
            throw new FsError('stale version', 'FS_STALE_VERSION');
        }
        const indices = allMatches(norm, old);
        let after;
        if (edit.replaceAll) {
            after = norm.split(old).join(newStr);
        }
        else if (indices.length === 0) {
            throw new FsError('oldString not found', 'FS_EDIT_NOT_FOUND');
        }
        else if (indices.length > 1) {
            throw new FsError('oldString matches more than once', 'FS_AMBIGUOUS_EDIT');
        }
        else {
            after = norm.slice(0, indices[0]) + newStr + norm.slice(indices[0] + old.length);
        }
        const guarded = { kind: 'replaceIfVersion', version: stat.version };
        await this.writeTextUnlocked(target, after, guarded, signal, before);
        return {
            version: (await this.stat(target, signal))?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(after)}`),
            before: norm,
            after,
        };
    }
    // ── internals ──────────────────────────────────────────────────────────
    parseTargetPath(path, cwd) {
        if (path.startsWith('ssh://'))
            return normalizeSshUri(parseSshUri(path));
        const base = cwd && cwd.startsWith('ssh://')
            ? normalizeSshUri(parseSshUri(cwd))
            : this.baseUri;
        const abs = path.startsWith('/') ? path : joinRemote(base.path, path);
        return { ...base, path: normalizeRemote(abs) };
    }
    split(target) {
        const uri = normalizeSshUri(parseSshUri(String(target.targetKey)));
        return { uri, path: uri.path };
    }
    /**
     * Resolve symlinks for an existing target. For a path that does not exist yet,
     * resolve the nearest existing ancestor and append only normalized path
     * segments. This gives callers a stable target identity and ensures
     * `contains()` never approves a lexical `..` or an existing symlink escape.
     */
    async canonicalizePath(uri, signal) {
        return this.sftp(uri, (sftp) => canonicalizeRemotePath(sftp, uri.path, signal));
    }
    async sftp(uri, op) {
        const transport = await this.connections.transport(formatSshUri(uri));
        return transport.sftp(op);
    }
    async readFile(uri, path, signal) {
        return this.sftp(uri, (s) => promisify((cb) => s.readFile(path, cb), signal));
    }
    async writeFile(uri, path, data, signal, createIfAbsent = false, expectedVersion, expectedContent) {
        await this.sftp(uri, async (sftp) => {
            signal?.throwIfAborted();
            const temporary = posix.join(posix.dirname(path), `.${posix.basename(path)}.dsh-${randomBytes(8).toString('hex')}.tmp`);
            try {
                let existing;
                if (!createIfAbsent) {
                    try {
                        existing = await promisify((cb) => sftp.stat(path, cb));
                    }
                    catch (error) {
                        if (!isCode(error, 'ENOENT'))
                            throw error;
                    }
                }
                await promisify((cb) => sftp.writeFile(temporary, data, {
                    flag: 'wx',
                    mode: 0o600,
                }, cb));
                signal?.throwIfAborted();
                if (createIfAbsent) {
                    try {
                        // hardlink@openssh.com publishes an already-complete inode and
                        // refuses to replace an existing destination.
                        await promisify((cb) => sftp.ext_openssh_hardlink(temporary, path, cb));
                    }
                    catch (error) {
                        if (isUnsupportedRename(error)) {
                            throw new FsError('remote SFTP server does not support atomic hardlink create', 'FS_IO_ERROR', { cause: error });
                        }
                        let destination;
                        try {
                            destination = await promisify((cb) => sftp.lstat(path, cb));
                        }
                        catch (statError) {
                            if (!isCode(statError, 'ENOENT'))
                                throw this.mapError(statError);
                        }
                        if (destination !== undefined) {
                            throw destination.isFile()
                                ? new FsError('file already exists', 'FS_NOT_OBSERVED', {
                                    cause: error,
                                })
                                : new FsError('existing target is not a regular file', 'FS_NOT_REGULAR_FILE', {
                                    cause: error,
                                });
                        }
                        // SFTP v3 collapses EEXIST, policy failures, quota errors and
                        // several other errno values into SSH_FX_FAILURE. With no target
                        // left to classify, preserve the ambiguity as a typed IO failure.
                        throw this.mapError(error);
                    }
                    return;
                }
                if (existing?.mode !== undefined) {
                    await promisify((cb) => sftp.chmod(temporary, existing.mode & 0o7777, cb));
                }
                signal?.throwIfAborted();
                if (expectedVersion !== undefined) {
                    let current;
                    try {
                        current = await promisify((cb) => sftp.stat(path, cb));
                    }
                    catch (error) {
                        if (isCode(error, 'ENOENT')) {
                            throw new FsError('file disappeared before publish', 'FS_STALE_VERSION', {
                                cause: error,
                            });
                        }
                        throw error;
                    }
                    if (String(statsVersion(current)) !== String(expectedVersion)) {
                        throw new FsError('stale version', 'FS_STALE_VERSION');
                    }
                }
                if (expectedContent !== undefined) {
                    let current;
                    try {
                        current = await promisify((cb) => sftp.readFile(path, cb));
                    }
                    catch (error) {
                        if (isCode(error, 'ENOENT')) {
                            throw new FsError('file disappeared before publish', 'FS_STALE_VERSION', {
                                cause: error,
                            });
                        }
                        throw error;
                    }
                    if (!current.equals(expectedContent)) {
                        throw new FsError('stale content', 'FS_STALE_VERSION');
                    }
                }
                signal?.throwIfAborted();
                try {
                    await promisify((cb) => sftp.ext_openssh_rename(temporary, path, cb));
                }
                catch (error) {
                    if (!isUnsupportedRename(error))
                        throw error;
                    throw new FsError('remote SFTP server does not support atomic posix-rename', 'FS_IO_ERROR', { cause: error });
                }
            }
            finally {
                try {
                    await promisify((cb) => sftp.unlink(temporary, cb));
                }
                catch {
                    /* renamed or best-effort cleanup */
                }
            }
        });
    }
    async tryUnlink(uri, path) {
        try {
            await this.sftp(uri, (s) => promisify((cb) => s.unlink(path, cb)));
        }
        catch {
            /* best effort */
        }
    }
    async statOrAbsent(target, signal) {
        return this.stat(target, signal);
    }
    async withMutation(key, run) {
        const previous = this.mutations.get(key) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(run);
        this.mutations.set(key, current);
        try {
            return await current;
        }
        finally {
            if (this.mutations.get(key) === current)
                this.mutations.delete(key);
        }
    }
    mapError(e) {
        const code = codeOf(e);
        const mapped = code === 'ENOENT' ? 'FS_NOT_FOUND' :
            code === 'EACCES' || code === 'EPERM' ? 'FS_PERMISSION_DENIED' :
                code === 'EISDIR' ? 'FS_NOT_REGULAR_FILE' :
                    code === 'ENOTDIR' ? 'FS_NOT_DIRECTORY' :
                        'FS_IO_ERROR';
        return new FsError(`remote fs: ${messageOf(e)}`, mapped, { cause: e });
    }
}
/**
 * Build the remote half of the URI router without registering a second
 * `ctx.fs` service. DSH exposes one filesystem service per host; the router
 * delegates only mapped SSH targets to this adapter.
 */
export function createRemoteFileSystemAdapter(connections) {
    const adapter = Object.create(RemoteFileSystem.prototype);
    Object.defineProperties(adapter, {
        connections: { value: connections },
        baseUri: { value: parseSshUri('ssh://unresolved/') },
        mutations: { value: new Map() },
    });
    return adapter;
}
// ── helpers ──────────────────────────────────────────────────────────────
function promisify(fn, signal) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (!settled) {
                settled = true;
                reject(new FsError('aborted', 'FS_ABORTED'));
            }
        };
        if (signal) {
            if (signal.aborted)
                return onAbort();
            signal.addEventListener('abort', onAbort, { once: true });
        }
        fn((err, result) => {
            if (settled)
                return;
            settled = true;
            if (signal)
                signal.removeEventListener('abort', onAbort);
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
}
function statToFsInfo(st) {
    return {
        version: statsVersion(st),
        type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
        size: st.size,
    };
}
function statsVersion(st) {
    return FsVersion([
        Math.floor(st.mtime),
        st.size,
        st.mode ?? '',
        st.uid ?? '',
        st.gid ?? '',
    ].join('-'));
}
function statToPathInfo(st) {
    return {
        version: statsVersion(st),
        type: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
        size: st.size,
    };
}
function statsType(st) {
    return st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other';
}
function decodeText(buf) {
    if (buf.includes(0))
        throw new FsError('binary file', 'FS_NOT_TEXT');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    }
    catch {
        throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
    }
}
function normalizeSshUri(uri) {
    return { ...uri, path: normalizeRemote(uri.path) };
}
/**
 * Canonicalize one absolute remote path using the SFTP server's realpath
 * implementation. A missing leaf is still safe to address: walk upward until
 * an existing ancestor is found, resolve that ancestor (including symlinks),
 * then append the missing normalized segments.
 */
async function canonicalizeRemotePath(sftp, path, signal) {
    let candidate = normalizeRemote(path);
    const missing = [];
    while (true) {
        try {
            const resolved = await promisify((cb) => sftp.realpath(candidate, cb), signal);
            return normalizeRemote(posix.join(resolved, ...missing));
        }
        catch (error) {
            if (!isCode(error, 'ENOENT') || candidate === '/')
                throw error;
            let existing;
            try {
                existing = await promisify((cb) => sftp.lstat(candidate, cb), signal);
            }
            catch (lstatError) {
                if (!isCode(lstatError, 'ENOENT'))
                    throw lstatError;
            }
            if (existing?.isSymbolicLink()) {
                throw new FsError(`refusing unresolved remote symlink: ${candidate}`, 'FS_SANDBOX_DENIED');
            }
            // If lstat found a non-symlink object, realpath failed for a reason other
            // than absence despite the server's coarse status code. Preserve that
            // failure instead of manufacturing a new child identity.
            if (existing !== undefined)
                throw error;
            missing.unshift(posix.basename(candidate));
            candidate = posix.dirname(candidate);
        }
    }
}
function joinRemote(base, ...parts) {
    let p = base;
    for (const part of parts)
        p = p.replace(/\/+$/, '') + '/' + part.replace(/^\/+/, '');
    return normalizeRemote(p);
}
function normalizeRemote(p) {
    const segs = [];
    for (const seg of p.split('/')) {
        if (!seg || seg === '.')
            continue;
        if (seg === '..')
            segs.pop();
        else
            segs.push(seg);
    }
    return '/' + segs.join('/');
}
function ensureTrailingSlash(p) {
    return p.endsWith('/') ? p : p + '/';
}
function allMatches(haystack, needle) {
    const out = [];
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
        out.push(idx);
        idx = haystack.indexOf(needle, idx + needle.length);
    }
    return out;
}
function isCode(e, code) {
    return codeOf(e) === code;
}
function codeOf(e) {
    const code = e?.code;
    if (typeof code === 'number')
        return sftpStatusToNode(code);
    return typeof code === 'string' ? code : undefined;
}
/** Map a numeric SFTP status code to a Node-style error code string. */
function sftpStatusToNode(code) {
    switch (code) {
        case 2: // SSH_FX_NO_SUCH_FILE
        case 10: // SSH_FX_NO_SUCH_PATH
            return 'ENOENT';
        case 3: // SSH_FX_PERMISSION_DENIED
            return 'EACCES';
        case 19: // SSH_FX_NOT_A_DIRECTORY
            return 'ENOTDIR';
        case 11: // SSH_FX_FILE_ALREADY_EXISTS (SFTP v6 / some servers)
            return 'EEXIST';
        case 4: // SSH_FX_FAILURE
            return 'EIO';
        default:
            return undefined;
    }
}
function messageOf(e) {
    return e?.message ?? String(e);
}
function isUnsupportedRename(error) {
    const raw = error?.code;
    return raw === 8
        || raw === 'ENOSYS'
        || raw === 'EOPNOTSUPP'
        || /unsupported|not supported/u.test(messageOf(error).toLowerCase());
}
//# sourceMappingURL=fs.js.map