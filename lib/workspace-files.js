import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { RemoteHelperRpcError } from './helper/rpc-client.js';
import { formatSshUri, parseSshUri } from './types.js';
const REMOTE_DIRECTORY_LIMIT = 1000;
/**
 * The official file tree can represent a truncated listing; generic fs.listDir
 * cannot. Adapt only this directory-list seam, leaving file previews, local
 * calls, and generic filesystem completeness guarantees with their owners.
 */
export function installRemoteWorkspaceFilesRouter(workspaceFiles, helpers, resolveRemotePath) {
    const original = workspaceFiles.list;
    const routed = async function (scope, path, signal) {
        const mappedRoot = resolveRemotePath(scope.workspaceRoot);
        // Cordis carries the invocation/Agent context on the traced receiver. A
        // captured installation-time service face would discard that authority.
        if (mappedRoot === undefined)
            return original.call(this, scope, path, signal);
        signal?.throwIfAborted();
        const root = parseSshUri(mappedRoot);
        root.path = posix.normalize(root.path);
        const relative = confinedPath(root, path, resolveRemotePath);
        const client = await helpers.client(formatSshUri(root), signal);
        signal?.throwIfAborted();
        const workspaceId = randomUUID();
        try {
            // Opening is a bounded lifecycle mutation, not a file mutation. Let it
            // settle before observing cancellation so its eventual handle can always
            // be released; aborting the RPC itself could lose a successful handle.
            const workspace = await client.call('workspace/open', {
                path: root.path,
                access: 'read-only',
                workspaceId,
                operationId: workspaceId,
            }, { timeoutMs: 20_000, mutation: true });
            signal?.throwIfAborted();
            if (workspace.workspaceId !== workspaceId || workspace.access !== 'read-only') {
                throw new Error('remote file-tree workspace did not preserve its read-only identity');
            }
            // Do not make this UI-only adapter more permissive than the existing
            // no-follow filesystem router when the anchor root itself is a symlink.
            if (typeof workspace.path !== 'string')
                throw new Error('remote file-tree workspace omitted its canonical path');
            if (posix.normalize(workspace.path) !== root.path) {
                throw new RemoteError('workspace-file/outside-workspace', 'remote workspace root is not canonical; choose the real directory instead of a symlink root', { path: scope.workspaceRoot });
            }
            const result = await client.call('fs/list', {
                workspaceId,
                path: relative,
                limit: REMOTE_DIRECTORY_LIMIT,
                allowTruncated: true,
            }, { timeoutMs: 30_000, signal });
            signal?.throwIfAborted();
            if (!Array.isArray(result?.entries))
                throw new Error('invalid remote file-tree listing');
            const entries = result.entries.slice(0, REMOTE_DIRECTORY_LIMIT).map(directoryEntry);
            entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
            return {
                path: relative,
                entries,
                truncated: result.truncated === true || result.entries.length > REMOTE_DIRECTORY_LIMIT,
            };
        }
        catch (error) {
            throw listError(error, path);
        }
        finally {
            // The UUID is known before open is dispatched: even a timed-out open may
            // have created a server-side handle. Always attempt idempotent cleanup.
            // Omit caller cancellation so an aborted listing still releases it.
            await client.call('workspace/close', {
                workspaceId,
                operationId: `close:${workspaceId}`,
            }, { timeoutMs: 5_000, mutation: true }).catch(() => { });
        }
    };
    workspaceFiles.list = routed;
    let installed = true;
    return () => {
        if (!installed)
            return;
        installed = false;
        // Cordis service faces rebind methods on every property read, so comparing
        // workspaceFiles.list with routed would never restore a proxied service.
        workspaceFiles.list = original;
    };
}
function confinedPath(root, path, resolveRemotePath) {
    if (typeof path !== 'string' || path.length === 0 || path.includes('\0')) {
        throw new RemoteError('gateway/bad-request', 'a nonempty directory path without NUL is required', {});
    }
    // Do not normalize link/../path before the helper's O_NOFOLLOW traversal.
    // The helper itself rejects every parent component, even one that would
    // normalize inside the workspace; retain that stricter contract here.
    if (path.split('/').includes('..'))
        throw outside(path);
    const mapped = path.startsWith('ssh://') ? path : resolveRemotePath(path);
    let target;
    if (mapped !== undefined) {
        target = parseSshUri(mapped);
    }
    else {
        if (/^[a-z][a-z\d+.-]*:/iu.test(path))
            throw outside(path);
        target = { ...root, path: posix.isAbsolute(path) ? path : posix.join(root.path, path) };
    }
    if (target.host !== root.host || target.port !== root.port || target.user !== root.user)
        throw outside(path);
    if (target.path.split('/').includes('..'))
        throw outside(path);
    const absolute = posix.normalize(target.path);
    const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
    if (absolute !== root.path && !absolute.startsWith(prefix))
        throw outside(path);
    return posix.relative(root.path, absolute);
}
function outside(path) {
    return new RemoteError('workspace-file/outside-workspace', `"${path}" is outside the remote workspace or contains a parent traversal`, { path });
}
function directoryEntry(entry) {
    if (typeof entry?.name !== 'string' || !entry.name || entry.name === '.' || entry.name === '..'
        || entry.name.includes('/') || entry.name.includes('\0') || typeof entry.metadata?.type !== 'string') {
        throw new Error('invalid remote file-tree entry');
    }
    const type = entry.metadata.type === 'file' || entry.metadata.type === 'directory' ? entry.metadata.type : 'other';
    const size = entry.metadata.size;
    return {
        name: entry.name,
        type,
        ...(type === 'file' && typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? { size } : {}),
    };
}
function listError(error, path) {
    if (!(error instanceof RemoteHelperRpcError))
        return error;
    if (error.code === 'E_OUTSIDE_ROOT')
        return outside(path);
    if (error.code === 'E_NOT_FOUND')
        return new RemoteError('workspace-file/not-found', error.message, { path }, { cause: error });
    if (error.code === 'E_NOT_DIRECTORY' || error.code === 'E_SYMLINK') {
        return new RemoteError('workspace-file/not-directory', error.message, {
            path, kind: error.code === 'E_SYMLINK' ? 'symlink' : 'other',
        }, { cause: error });
    }
    return error;
}
//# sourceMappingURL=workspace-files.js.map