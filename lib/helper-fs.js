import { FsError, FsTargetKey, FsVersion, } from '@deepseek-ai/dsh-fs';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { RemoteHelperRpcError, } from './helper/rpc-client.js';
import { formatSshUri, parseSshUri } from './types.js';
const WHOLE_TEXT_MAX_BYTES = 64 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 192 * 1024;
/**
 * FileSystem-shaped adapter backed by the versioned OpenSSH helper. It is a
 * plain adapter rather than a forged Cordis Service instance.
 */
export class HelperRemoteFileSystem {
    helpers;
    resolveRemotePath;
    workspaces = new Map();
    constructor(helpers, resolveRemotePath) {
        this.helpers = helpers;
        this.resolveRemotePath = resolveRemotePath;
    }
    get sandboxMode() {
        return undefined;
    }
    async resolve(path, opts) {
        const uri = this.parseTargetPath(path, opts?.cwd);
        const scope = await this.scope(uri, '/', 'read-only', opts?.signal);
        try {
            const result = await scope.client.call('fs/canonicalize', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                allowMissing: true,
            }, { signal: opts?.signal });
            return this.target({ ...uri, path: normalizeRemote(posix.join(scope.root, result.path)) });
        }
        catch (error) {
            throw mapHelperFsError(error);
        }
    }
    processPath(target) {
        return normalizeRemote(parseSshUri(String(target.targetKey)).path);
    }
    fileUrl(target) {
        const url = new URL('file:///');
        url.pathname = this.processPath(target);
        return url.href;
    }
    contains(parent, child) {
        const left = normalizeUri(parseSshUri(String(parent.targetKey)));
        const right = normalizeUri(parseSshUri(String(child.targetKey)));
        if (left.host !== right.host || left.port !== right.port || left.user !== right.user)
            return false;
        return right.path === left.path || right.path.startsWith(`${left.path.replace(/\/+$/u, '')}/`);
    }
    async stat(target, signal) {
        const { uri } = this.split(target);
        const scope = await this.scope(uri, '/', 'read-only', signal);
        try {
            const result = await scope.client.call('fs/stat', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                follow: true,
            }, { signal });
            return result.exists && result.metadata !== null ? toFsInfo(result.metadata) : undefined;
        }
        catch (error) {
            if (isMissing(error))
                return undefined;
            throw mapHelperFsError(error);
        }
    }
    async lstat(path, opts, signal) {
        const uri = this.parseTargetPath(path, opts?.cwd);
        const scope = await this.scope(uri, '/', 'read-only', signal);
        try {
            const result = await scope.client.call('fs/stat', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                follow: false,
            }, { signal });
            return result.exists && result.metadata !== null ? toFsPathInfo(result.metadata) : undefined;
        }
        catch (error) {
            if (isMissing(error))
                return undefined;
            throw mapHelperFsError(error);
        }
    }
    async readText(target, signal) {
        const result = await this.read(target, WHOLE_TEXT_MAX_BYTES, signal);
        return decodeText(result.bytes);
    }
    async streamText(target, signal) {
        const { uri } = this.split(target);
        const scope = await this.scope(uri, '/', 'read-only', signal);
        const handleId = randomUUID();
        signal?.throwIfAborted();
        const opened = await scope.client.call('fs/readOpen', {
            workspaceId: scope.workspaceId,
            path: scope.path,
            handleId,
            operationId: handleId,
        }, { timeoutMs: 20_000, mutation: true });
        const client = scope.client;
        return {
            async *[Symbol.asyncIterator]() {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                let cursor = '0';
                try {
                    for (;;) {
                        signal?.throwIfAborted();
                        const next = await client.call('fs/readNext', {
                            handleId: opened.handleId,
                            afterSeq: cursor,
                            maxBytes: STREAM_CHUNK_BYTES,
                        }, { signal, timeoutMs: 30_000 });
                        cursor = next.seq;
                        const bytes = Buffer.from(next.data, 'base64');
                        if (bytes.includes(0))
                            throw new FsError('binary file', 'FS_NOT_TEXT');
                        let text;
                        try {
                            text = decoder.decode(bytes, { stream: !next.eof });
                        }
                        catch {
                            throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
                        }
                        if (text.length > 0)
                            yield text;
                        if (next.eof)
                            break;
                    }
                }
                catch (error) {
                    if (error instanceof FsError)
                        throw error;
                    throw mapHelperFsError(error);
                }
                finally {
                    await client.call('fs/close', {
                        handleId: opened.handleId,
                        operationId: `close:${opened.handleId}`,
                    }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
                }
            },
        };
    }
    async readBytes(target, signal, maxBytes) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
            throw new FsError('maxBytes must be a non-negative safe integer', 'FS_IO_ERROR');
        }
        const result = await this.read(target, maxBytes, signal);
        const bytes = result.bytes;
        if (bytes.length > maxBytes)
            throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
        return new Uint8Array(bytes);
    }
    async listDir(target, signal) {
        const { uri } = this.split(target);
        const scope = await this.scope(uri, '/', 'read-only', signal);
        try {
            const result = await scope.client.call('fs/list', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                limit: 1_000,
                allowTruncated: false,
            }, { signal });
            return result.entries.map((entry) => {
                const childUri = { ...uri, path: normalizeRemote(posix.join(uri.path, entry.name)) };
                const metadata = entry.metadata;
                return {
                    name: entry.name,
                    type: metadata.type === 'symlink' ? 'other' : metadata.type,
                    target: this.target(childUri),
                    ...(metadata.version === undefined ? {} : { version: FsVersion(metadata.version) }),
                    size: metadata.size,
                };
            }).sort((left, right) => left.name.localeCompare(right.name));
        }
        catch (error) {
            throw mapHelperFsError(error);
        }
    }
    async writeText(target, content, expected, signal, sandboxPolicy) {
        const { uri } = this.split(target);
        const beforeInfo = await this.stat(target, signal);
        if (expected?.kind === 'createIfAbsent' && beforeInfo !== undefined) {
            throw beforeInfo.type === 'file'
                ? new FsError('file already exists', 'FS_NOT_OBSERVED')
                : new FsError('existing target is not a regular file', 'FS_NOT_REGULAR_FILE');
        }
        const before = beforeInfo === undefined ? null : await this.readBeforeText(target, signal);
        const scope = await this.mutationScope(uri, sandboxPolicy, signal);
        try {
            const result = await this.write(scope, Buffer.from(content, 'utf8'), toHelperWriteIntent(expected), signal);
            return {
                operation: result.operation ?? (beforeInfo === undefined ? 'create' : 'update'),
                version: FsVersion(result.version),
                before,
                after: content.replace(/\r\n/gu, '\n'),
            };
        }
        catch (error) {
            throw mapHelperFsError(error);
        }
        finally {
            await scope.release();
        }
    }
    async editText(target, edit, expected, signal, sandboxPolicy) {
        const { uri } = this.split(target);
        let read;
        try {
            read = await this.read(target, WHOLE_TEXT_MAX_BYTES, signal);
        }
        catch (error) {
            throw mapHelperFsError(error);
        }
        if (expected !== undefined
            && read.version !== String(expected.version)
            && read.statVersion !== String(expected.version)) {
            throw new FsError('stale version', 'FS_STALE_VERSION');
        }
        const before = decodeText(read.bytes).replace(/\r\n/gu, '\n');
        const oldString = edit.oldString.replace(/\r\n/gu, '\n');
        const newString = edit.newString.replace(/\r\n/gu, '\n');
        if (oldString.length === 0)
            throw new FsError('empty oldString', 'FS_AMBIGUOUS_EDIT');
        const matches = allMatches(before, oldString);
        let after;
        if (edit.replaceAll)
            after = before.split(oldString).join(newString);
        else if (matches.length === 0)
            throw new FsError('oldString not found', 'FS_EDIT_NOT_FOUND');
        else if (matches.length > 1)
            throw new FsError('oldString matches more than once', 'FS_AMBIGUOUS_EDIT');
        else
            after = before.slice(0, matches[0]) + newString + before.slice(matches[0] + oldString.length);
        const mutation = await this.mutationScope(uri, sandboxPolicy, signal);
        try {
            const result = await this.write(mutation, Buffer.from(after, 'utf8'), { kind: 'replace-if-version', version: read.version }, signal);
            return { version: FsVersion(result.version), before, after };
        }
        catch (error) {
            throw mapHelperFsError(error);
        }
        finally {
            await mutation.release();
        }
    }
    async read(target, maxBytes, signal) {
        const { uri } = this.split(target);
        const scope = await this.scope(uri, '/', 'read-only', signal);
        const handleId = randomUUID();
        let opened;
        try {
            signal?.throwIfAborted();
            opened = await scope.client.call('fs/readOpen', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                handleId,
                operationId: handleId,
            }, { timeoutMs: 20_000, mutation: true });
            if (opened.metadata.size > maxBytes) {
                throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
            }
            const chunks = [];
            let total = 0;
            let cursor = '0';
            for (;;) {
                signal?.throwIfAborted();
                const next = await scope.client.call('fs/readNext', {
                    handleId: opened.handleId,
                    afterSeq: cursor,
                    maxBytes: STREAM_CHUNK_BYTES,
                }, { signal, timeoutMs: 30_000 });
                cursor = next.seq;
                const chunk = Buffer.from(next.data, 'base64');
                total += chunk.length;
                if (total > maxBytes)
                    throw new FsError(`file exceeds ${maxBytes} bytes`, 'FS_TOO_LARGE');
                if (chunk.length > 0)
                    chunks.push(chunk);
                if (!next.eof)
                    continue;
                if (typeof next.version !== 'string' || next.version.length === 0) {
                    throw new FsError('helper read stream omitted final version', 'FS_IO_ERROR');
                }
                return {
                    bytes: Buffer.concat(chunks, total),
                    version: next.version,
                    ...(next.statVersion === undefined ? {} : { statVersion: next.statVersion }),
                };
            }
        }
        catch (error) {
            if (error instanceof FsError)
                throw error;
            throw mapHelperFsError(error);
        }
        finally {
            if (opened !== undefined) {
                await scope.client.call('fs/close', {
                    handleId: opened.handleId,
                    operationId: `close:${opened.handleId}`,
                }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
            }
        }
    }
    async readBeforeText(target, signal) {
        try {
            return await this.readText(target, signal);
        }
        catch (error) {
            if (error instanceof FsError && (error.code === 'FS_NOT_TEXT' || error.code === 'FS_TOO_LARGE')) {
                return null;
            }
            throw error;
        }
    }
    async write(scope, data, intent, signal) {
        const handleId = randomUUID();
        let opened;
        let committed = false;
        try {
            signal?.throwIfAborted();
            opened = await scope.client.call('fs/writeOpen', {
                workspaceId: scope.workspaceId,
                path: scope.path,
                intent,
                handleId,
                operationId: `open:${handleId}`,
            }, { mutation: true, timeoutMs: 20_000 });
            if (data.length > opened.maxBytes) {
                throw new FsError(`file exceeds helper write limit ${opened.maxBytes}`, 'FS_TOO_LARGE');
            }
            const chunkBytes = Math.min(STREAM_CHUNK_BYTES, opened.maxChunkBytes);
            if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
                throw new FsError('helper returned an invalid write chunk limit', 'FS_IO_ERROR');
            }
            let cursor = opened.seq;
            for (let offset = 0; offset < data.length; offset += chunkBytes) {
                signal?.throwIfAborted();
                const chunk = data.subarray(offset, Math.min(data.length, offset + chunkBytes));
                const response = await scope.client.call('fs/writeChunk', {
                    handleId: opened.handleId,
                    afterSeq: cursor,
                    data: chunk.toString('base64'),
                    encoding: 'base64',
                    operationId: `chunk:${opened.handleId}:${cursor}`,
                }, { signal, mutation: true, timeoutMs: 30_000 });
                cursor = response.seq;
            }
            signal?.throwIfAborted();
            const result = await scope.client.call('fs/writeCommit', {
                handleId: opened.handleId,
                operationId: `commit:${opened.handleId}`,
            }, { mutation: true, timeoutMs: 60_000 });
            committed = true;
            return result;
        }
        finally {
            if (opened !== undefined && !committed) {
                await scope.client.call('fs/writeAbort', {
                    handleId: opened.handleId,
                    operationId: `abort:${opened.handleId}`,
                }, { timeoutMs: 10_000, mutation: true }).catch(() => { });
            }
        }
    }
    async mutationScope(uri, policy, signal) {
        const mode = policy?.mode;
        if (mode === 'read-only')
            throw new FsError('remote file access denied under read-only mode', 'FS_SANDBOX_DENIED');
        if (mode === 'workspace-write') {
            if (policy === undefined) {
                throw new FsError('workspace-write requires an explicit workspace root', 'FS_SANDBOX_DENIED');
            }
            const rootUriString = this.resolveRemotePath(policy.workspaceRoot);
            if (rootUriString === undefined) {
                throw new FsError('workspace root is not mapped to this SSH host', 'FS_SANDBOX_DENIED');
            }
            const rootUri = normalizeUri(parseSshUri(rootUriString));
            if (!sameHost(rootUri, uri) || !containsPath(rootUri.path, uri.path)) {
                throw new FsError('remote target is outside the workspace root', 'FS_SANDBOX_DENIED');
            }
            return this.scope(uri, rootUri.path, 'workspace-write', signal);
        }
        if (mode !== undefined && mode !== 'danger-full-access') {
            throw new FsError(`unsupported remote sandbox mode ${mode}`, 'FS_SANDBOX_DENIED');
        }
        return this.scope(uri, '/', 'danger-full-access', signal);
    }
    async scope(uri, root, access, signal) {
        const normalized = normalizeUri(uri);
        const canonicalRoot = normalizeRemote(root);
        if (!containsPath(canonicalRoot, normalized.path)) {
            throw new FsError('remote path is outside helper workspace root', 'FS_SANDBOX_DENIED');
        }
        const client = await this.helpers.client(formatSshUri(normalized), signal);
        const cacheable = access === 'read-only' && canonicalRoot === '/';
        const key = [client.sessionId, normalized.host, normalized.port, normalized.user, access, canonicalRoot].join('\0');
        if (cacheable) {
            const authoritySuffix = [normalized.host, normalized.port, normalized.user, access, canonicalRoot].join('\0');
            for (const existingKey of this.workspaces.keys()) {
                if (existingKey !== key && existingKey.endsWith(authoritySuffix))
                    this.workspaces.delete(existingKey);
            }
        }
        let opened = cacheable ? this.workspaces.get(key) : undefined;
        if (opened === undefined) {
            const workspaceId = randomUUID();
            signal?.throwIfAborted();
            opened = client.call('workspace/open', {
                path: canonicalRoot,
                access,
                workspaceId,
                operationId: workspaceId,
            }, { timeoutMs: 20_000, mutation: true });
            if (cacheable)
                this.workspaces.set(key, opened);
            void opened.catch(() => {
                if (this.workspaces.get(key) === opened)
                    this.workspaces.delete(key);
            });
        }
        const workspace = await opened;
        let released = false;
        return {
            client,
            workspaceId: workspace.workspaceId,
            root: workspace.path,
            path: posix.relative(workspace.path, normalized.path),
            release: async () => {
                if (released || cacheable)
                    return;
                released = true;
                await client.call('workspace/close', {
                    workspaceId: workspace.workspaceId,
                    operationId: `close:${workspace.workspaceId}`,
                }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
            },
        };
    }
    parseTargetPath(path, cwd) {
        if (path.startsWith('ssh://'))
            return normalizeUri(parseSshUri(path));
        if (cwd === undefined || !cwd.startsWith('ssh://')) {
            throw new FsError('remote path requires an SSH cwd', 'FS_NOT_FOUND');
        }
        const base = normalizeUri(parseSshUri(cwd));
        return { ...base, path: normalizeRemote(path.startsWith('/') ? path : posix.join(base.path, path)) };
    }
    split(target) {
        const uri = normalizeUri(parseSshUri(String(target.targetKey)));
        return { uri, path: uri.path };
    }
    target(uri) {
        const normalized = normalizeUri(uri);
        return {
            targetKey: FsTargetKey(formatSshUri(normalized)),
            displayPath: `${normalized.user ? `${normalized.user}@` : ''}${normalized.host}:${normalized.path}`,
        };
    }
}
function normalizeUri(uri) {
    return { ...uri, path: normalizeRemote(uri.path) };
}
function normalizeRemote(path) {
    const normalized = posix.normalize(path.startsWith('/') ? path : `/${path}`);
    return normalized === '.' ? '/' : normalized;
}
function sameHost(left, right) {
    return left.host === right.host && left.port === right.port && left.user === right.user;
}
function containsPath(root, path) {
    const parent = normalizeRemote(root);
    const child = normalizeRemote(path);
    return child === parent || child.startsWith(`${parent.replace(/\/+$/u, '')}/`);
}
function toHelperWriteIntent(intent) {
    if (intent === undefined)
        return { kind: 'overwrite' };
    if (intent.kind === 'createIfAbsent')
        return { kind: 'create-if-absent' };
    return { kind: 'replace-if-version', version: String(intent.version) };
}
function toFsInfo(stat) {
    if (stat.version === undefined)
        throw new FsError('helper stat omitted version', 'FS_IO_ERROR');
    return {
        type: stat.type === 'symlink' ? 'other' : stat.type,
        size: stat.size,
        version: FsVersion(stat.version),
    };
}
function toFsPathInfo(stat) {
    if (stat.version === undefined)
        throw new FsError('helper lstat omitted version', 'FS_IO_ERROR');
    return {
        type: stat.type,
        size: stat.size,
        version: FsVersion(stat.version),
    };
}
function isMissing(error) {
    return error instanceof RemoteHelperRpcError && (error.code === 'E_NOT_FOUND' || error.code === 'ENOENT');
}
function mapHelperFsError(error) {
    if (error instanceof FsError)
        return error;
    const code = error instanceof RemoteHelperRpcError ? error.code : '';
    const mapped = code === 'E_NOT_FOUND' || code === 'ENOENT' ? 'FS_NOT_FOUND' :
        code === 'E_NOT_DIRECTORY' || code === 'ENOTDIR' ? 'FS_NOT_DIRECTORY' :
            code === 'E_NOT_REGULAR' || code === 'E_NOT_FILE' || code === 'EISDIR' ? 'FS_NOT_REGULAR_FILE' :
                code === 'E_TOO_LARGE' ? 'FS_TOO_LARGE' :
                    code === 'E_PERMISSION' || code === 'E_PERMISSION_DENIED' || code === 'EACCES' || code === 'EPERM' ? 'FS_PERMISSION_DENIED' :
                        code === 'E_SANDBOX' || code === 'E_PATH_ESCAPE' || code === 'E_OUTSIDE_ROOT' ? 'FS_SANDBOX_DENIED' :
                            code === 'E_STALE_VERSION' || code === 'E_CHANGED_DURING_READ' ? 'FS_STALE_VERSION' :
                                code === 'E_EXISTS' ? 'FS_NOT_OBSERVED' :
                                    code === 'E_NOT_TEXT' ? 'FS_NOT_TEXT' :
                                        code === 'E_ABORTED' ? 'FS_ABORTED' :
                                            'FS_IO_ERROR';
    const message = error instanceof Error ? error.message : String(error);
    return new FsError(`remote helper fs: ${message}`, mapped, { cause: error });
}
function decodeText(buffer) {
    if (buffer.includes(0))
        throw new FsError('binary file', 'FS_NOT_TEXT');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    }
    catch {
        throw new FsError('not valid UTF-8', 'FS_NOT_TEXT');
    }
}
function allMatches(haystack, needle) {
    const matches = [];
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
        matches.push(index);
    }
    return matches;
}
//# sourceMappingURL=helper-fs.js.map