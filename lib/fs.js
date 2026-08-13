import FileSystem, { FsError, FsTargetKey, FsVersion, } from '@deepseek-ai/dsh-fs';
import { formatSshUri, parseSshUri } from './types.js';
/** Remote `ssh://` filesystem provider: implements the FileSystem seam over SFTP. */
export class RemoteFileSystem extends FileSystem {
    connections;
    /** Default base for relative-path resolution: the workspace's ssh:// root. */
    baseUri;
    constructor(ctx, connections, baseUri) {
        super(ctx);
        this.connections = connections;
        this.baseUri = parseSshUri(baseUri);
    }
    get sandboxMode() {
        return undefined;
    }
    async resolve(path, opts) {
        const uri = this.parseTargetPath(path, opts?.cwd);
        const key = formatSshUri(uri);
        return { targetKey: FsTargetKey(key), displayPath: `${uri.user ? uri.user + '@' : ''}${uri.host}:${uri.path}` };
    }
    processPath(target) {
        // Remote absolute path in the backend's execution world.
        return parseSshUri(String(target.targetKey)).path;
    }
    fileUrl(target) {
        return String(target.targetKey);
    }
    contains(parent, child) {
        const p = parseSshUri(String(parent.targetKey));
        const c = parseSshUri(String(child.targetKey));
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
        // v0.1: whole-file read yielded as a single chunk. Cross-chunk streaming is a
        // documented future refinement; semantics (decode + binary rejection) are equal.
        const text = await this.readText(target, signal);
        return {
            async *[Symbol.asyncIterator]() {
                if (text.length)
                    yield text;
            },
        };
    }
    async readBytes(target, signal, maxBytes) {
        const { uri, path } = this.split(target);
        const buf = await this.readFile(uri, path, signal);
        if (buf.length > maxBytes)
            throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
        return new Uint8Array(buf);
    }
    async listDir(target, signal) {
        const { uri, path } = this.split(target);
        const entries = await this.sftp(uri, (s) => promisify((cb) => s.readdir(path, cb), signal));
        const result = [];
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
    async writeText(target, content, expected, signal, _sandboxPolicy) {
        const { uri, path } = this.split(target);
        const beforeStat = await this.statOrAbsent(target, signal);
        if (expected?.kind === 'createIfAbsent' && beforeStat) {
            throw new FsError('file already exists', 'FS_NOT_OBSERVED');
        }
        if (expected?.kind === 'replaceIfVersion') {
            if (!beforeStat)
                throw new FsError('file does not exist', 'FS_STALE_VERSION');
            if (String(beforeStat.version) !== String(expected.version))
                throw new FsError('stale version', 'FS_STALE_VERSION');
        }
        const before = beforeStat ? await this.readText(target, signal) : null;
        // Direct write (truncate-and-replace). ssh2's writeFile opens with 'w';
        // some SFTP servers (macOS internal-sftp) reject rename-over-existing, so we
        // avoid the tmp+rename dance and accept writeFile's single-operation atomicity.
        await this.writeFile(uri, path, Buffer.from(content, 'utf8'), signal);
        const afterStat = await this.stat(target, signal);
        return {
            operation: beforeStat ? 'update' : 'create',
            version: afterStat?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(content)}`),
            before,
            after: content.replace(/\r\n/g, '\n'),
        };
    }
    async editText(target, edit, expected, signal, _sandboxPolicy) {
        const before = await this.readText(target, signal);
        const norm = before.replace(/\r\n/g, '\n');
        const old = edit.oldString.replace(/\r\n/g, '\n');
        const newStr = edit.newString.replace(/\r\n/g, '\n');
        if (!old)
            throw new FsError('empty oldString', 'FS_AMBIGUOUS_EDIT');
        const stat = await this.stat(target, signal);
        if (expected && stat && String(stat.version) !== String(expected.version)) {
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
        await this.writeText(target, after, undefined, signal);
        return {
            version: (await this.stat(target, signal))?.version ?? FsVersion(`${Date.now()}-${Buffer.byteLength(after)}`),
            before: norm,
            after,
        };
    }
    // ── internals ──────────────────────────────────────────────────────────
    parseTargetPath(path, cwd) {
        if (path.startsWith('ssh://'))
            return parseSshUri(path);
        const base = cwd && cwd.startsWith('ssh://') ? parseSshUri(cwd) : this.baseUri;
        const abs = path.startsWith('/') ? path : joinRemote(base.path, path);
        return { ...base, path: abs };
    }
    split(target) {
        const uri = parseSshUri(String(target.targetKey));
        return { uri, path: uri.path };
    }
    async sftp(uri, op) {
        const transport = await this.connections.transport(formatSshUri(uri));
        return transport.sftp(op);
    }
    async readFile(uri, path, signal) {
        return this.sftp(uri, (s) => promisify((cb) => s.readFile(path, cb), signal));
    }
    async writeFile(uri, path, data, signal) {
        await this.sftp(uri, (s) => promisify((cb) => s.writeFile(path, data, cb), signal));
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
        version: FsVersion(`${Math.floor(st.mtime)}-${st.size}`),
        type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
        size: st.size,
    };
}
function statToPathInfo(st) {
    return {
        version: FsVersion(`${Math.floor(st.mtime)}-${st.size}`),
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
    // Reject invalid UTF-8 (replacement chars are tolerated only for valid multi-byte).
    const text = buf.toString('utf8');
    if (text.includes('\uFFFD')) {
        // A literal U+FFFD in content is rare; treat replacement as invalid encoding.
        throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
    }
    return text;
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
        case 4: // SSH_FX_FAILURE
            return 'EIO';
        default:
            return undefined;
    }
}
function messageOf(e) {
    return e?.message ?? String(e);
}
//# sourceMappingURL=fs.js.map