import { Context } from '@deepseek-ai/cordis';
import WorkspaceFiles, { type WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteHelperProvider } from '../src/helper-fs.js';
import { RemoteHelperCallInterruptedError, RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
import { installRemoteFileSystemRouter } from '../src/runtime-router.js';
import { formatSshUri } from '../src/types.js';
import { installRemoteWorkspaceFilesRouter } from '../src/workspace-files.js';

const helperPath = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); }
  finally { vi.restoreAllMocks(); }
});

class DirectHelper implements RemoteHelperProvider {
  readonly clientValue: RemoteHelperRpcClient;
  private stderr = '';

  constructor(readonly child: ChildProcessWithoutNullStreams) {
    child.stderr.on('data', chunk => { this.stderr += String(chunk); });
    this.clientValue = new RemoteHelperRpcClient({
      readable: child.stdout, writable: child.stdin, closeTransport: () => child.kill('SIGTERM'),
    });
  }

  async client(): Promise<RemoteHelperRpcClient> { return this.clientValue; }

  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const exited = new Promise<void>(resolve => this.child.once('exit', () => resolve()));
    this.clientValue.close('workspace-files test complete');
    try {
      await Promise.race([
        exited,
        new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new Error(`helper did not exit: ${this.stderr}`)), 2_000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}

async function fixture() {
  const raw = await mkdtemp(join(tmpdir(), 'dsh-workspace-files-'));
  cleanups.push(() => rm(raw, { recursive: true, force: true }));
  const base = await realpath(raw);
  const root = join(base, 'remote'), localRoot = join(base, 'local'), anchor = join(base, 'anchor');
  const otherAnchor = join(base, 'other-anchor');
  await Promise.all([root, localRoot, anchor, otherAnchor].map(path => mkdir(path)));
  const helper = new DirectHelper(spawn('python3', [helperPath, 'connect', '--stdio', '--direct'], { stdio: ['pipe', 'pipe', 'pipe'] }));
  cleanups.push(() => helper.close());
  await helper.clientValue.initialize({ clientId: `workspace-files-${randomUUID()}` });
  const uri = formatSshUri({ host: 'fixture', port: 22, user: '', path: root });
  const resolveAnchor = (path: string) => {
    const absolute = resolve(path);
    for (const [local, host] of [[anchor, 'fixture'], [otherAnchor, 'other-host']] as const) {
      if (absolute !== local && !absolute.startsWith(`${local}${sep}`)) continue;
      const suffix = relative(local, absolute).split(sep).filter(Boolean).join('/');
      return formatSshUri({ host, port: 22, user: '', path: `${root}${suffix ? `/${suffix}` : ''}` });
    }
    return undefined;
  };
  const context = new Context();
  cleanups.push(() => context.fiber.dispose());
  new LocalFileSystem(context, { cwd: localRoot, diffBasisMaxBytes: 10 * 1024 * 1024 });
  const fs = context.fs;
  const rawFiles = new WorkspaceFiles(context, { maxBytes: 128, maxFileBytes: 1024, maxLines: 4, maxEntries: 2000 });
  const originalList = vi.spyOn(rawFiles, 'list');
  // Exercise the actual Cordis service face used by injected production
  // adapters. Its bound methods are not reference-equal across property reads.
  const files = context.workspaceFiles;
  cleanups.push(installRemoteFileSystemRouter(fs, {} as never, resolveAnchor, helper));
  const restore = installRemoteWorkspaceFilesRouter(files, helper, resolveAnchor);
  cleanups.push(restore);
  const scope: WorkspaceFileScope = { sessionId: 'fixture-session' as WorkspaceFileScope['sessionId'], workspaceRoot: anchor };
  return { root, localRoot, anchor, otherAnchor, uri, helper, context, fs, files, scope, originalList, restore, resolveAnchor };
}

describe('official DSH WorkspaceFiles through remote helper routing', () => {
  it('lists files, directories and opaque symlinks while keeping official text/byte previews', async () => {
    const f = await fixture();
    await mkdir(join(f.root, 'src'));
    await writeFile(join(f.root, 'note.txt'), 'first\n第二行\nlast\n');
    await writeFile(join(f.root, '.hidden'), 'hidden');
    await writeFile(join(f.root, 'binary.dat'), Buffer.from([0, 255, 128, 42, 1]));
    await symlink('src', join(f.root, 'link'));
    const rpc = vi.spyOn(f.helper.clientValue, 'call');
    const signal = new AbortController().signal;
    const listed = await f.files.list(f.scope, '.', signal);
    expect(listed).toEqual({
      path: '', truncated: false,
      entries: [
        { name: '.hidden', type: 'file', size: 6 },
        { name: 'binary.dat', type: 'file', size: 5 },
        { name: 'link', type: 'other' },
        { name: 'note.txt', type: 'file', size: Buffer.byteLength('first\n第二行\nlast\n') },
        { name: 'src', type: 'directory' },
      ],
    });
    expect(f.originalList).not.toHaveBeenCalled();
    expect(rpc.mock.calls.find(([method]) => method === 'workspace/open')?.[1]).toMatchObject({ path: f.root, access: 'read-only' });
    expect(rpc.mock.calls.find(([method]) => method === 'fs/list')?.[1]).toMatchObject({ path: '', limit: 1000, allowTruncated: true });
    expect(rpc.mock.calls.filter(([method]) => method.startsWith('fs/') && method !== 'fs/list')).toEqual([]);
    expect(await f.helper.clientValue.call('health/status')).toMatchObject({ workspaces: 0 });

    // The official FilesBody seeds its DirectoryNode with Session.cwd (the
    // absolute anchor), not the empty relative path returned in the listing.
    await expect(f.files.list(f.scope, f.scope.workspaceRoot, signal)).resolves.toEqual(listed);

    await expect(f.files.read(f.scope, 'note.txt', { offset: 2, limit: 1 }, signal)).resolves.toMatchObject({
      absolutePath: join(f.root, 'note.txt'), offset: 2, text: '第二行', lines: 1, eof: false,
    });
    const bytes = await f.files.readBytes(f.scope, 'binary.dat', { range: { offset: 1, length: 3 } }, signal);
    expect([...bytes.data]).toEqual([255, 128, 42]);
    expect(bytes).toMatchObject({ absolutePath: join(f.root, 'binary.dat'), bytes: 5, offset: 1, eof: false });
    await expect(f.files.read(f.scope, 'binary.dat', {}, signal)).rejects.toMatchObject({ code: 'workspace-file/not-text' });
    await expect(f.files.read(f.scope, 'note.txt', { limit: 5 }, signal)).rejects.toMatchObject({ code: 'gateway/bad-request' });
  });

  it('returns a bounded truncated file tree without weakening generic listDir', async () => {
    const f = await fixture();
    const many = join(f.root, 'many');
    await mkdir(many);
    for (let offset = 0; offset < 1005; offset += 100) {
      await Promise.all(Array.from({ length: Math.min(100, 1005 - offset) }, (_, index) => writeFile(join(many, `file-${String(offset + index).padStart(4, '0')}`), '')));
    }
    const signal = new AbortController().signal;
    const result = await f.files.list(f.scope, 'many', signal);
    expect(result.path).toBe('many');
    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(1000);
    expect(result.entries.every(entry => entry.type === 'file' && entry.size === 0)).toBe(true);
    expect(result.entries.map(entry => entry.name)).toEqual(result.entries.map(entry => entry.name).sort());
    const target = await f.fs.resolve('many', { cwd: f.anchor });
    await expect(f.fs.listDir(target, signal)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' });
  });

  it('confines relative, remote absolute, anchor absolute and same-host URI requests', async () => {
    const f = await fixture();
    await mkdir(join(f.root, 'src'));
    await writeFile(join(f.root, 'src', 'safe.txt'), 'safe');
    const signal = new AbortController().signal;
    for (const path of ['src', join(f.root, 'src'), join(f.anchor, 'src'), `${f.uri}/src`]) {
      await expect(f.files.list(f.scope, path, signal)).resolves.toMatchObject({ path: 'src', entries: [{ name: 'safe.txt', type: 'file' }] });
    }
    for (const path of [
      '..', '../local', 'src/../src', join(f.root, '..'), f.localRoot,
      `${f.root}-lookalike`, `${f.uri}/../outside`, `${f.uri.replace('fixture', 'other-host')}/src`,
      join(f.otherAnchor, 'src'), `ssh://fixture:2222${f.root}`, `ssh://someone@fixture${f.root}`, 'file:///etc',
    ]) {
      await expect(f.files.list(f.scope, path, signal)).rejects.toMatchObject({ code: 'workspace-file/outside-workspace' });
    }
    await expect(f.files.list(f.scope, '', signal)).rejects.toMatchObject({ code: 'gateway/bad-request' });
    await expect(f.files.list(f.scope, 'bad\0path', signal)).rejects.toMatchObject({ code: 'gateway/bad-request' });
    expect(f.originalList).not.toHaveBeenCalled();
    expect(await f.helper.clientValue.call('health/status')).toMatchObject({ workspaces: 0 });
  });

  it('rejects final/intermediate symlinks and a symlink workspace root without following them', async () => {
    const f = await fixture();
    await mkdir(join(f.root, 'inside'));
    await writeFile(join(f.root, 'inside', 'safe.txt'), 'safe');
    await symlink('inside', join(f.root, 'internal-link'));
    await symlink(f.localRoot, join(f.root, 'outside-link'));
    const signal = new AbortController().signal;
    for (const path of ['internal-link', 'internal-link/child', 'outside-link']) {
      await expect(f.files.list(f.scope, path, signal)).rejects.toMatchObject({ code: 'workspace-file/not-directory' });
    }
    await expect(f.files.read(f.scope, 'internal-link/safe.txt', {}, signal)).rejects.toBeInstanceOf(Error);
    const symlinkScope = { ...f.scope, workspaceRoot: join(f.anchor, 'internal-link') };
    await expect(f.files.list(symlinkScope, '.', signal)).rejects.toMatchObject({
      code: 'workspace-file/outside-workspace', message: expect.stringContaining('not canonical'),
    });
    // Preview reads may retain the generic read-only '/' handle; tree scopes
    // are nevertheless closed after every successful or failed directory list.
    expect(await f.helper.clientValue.call('health/status')).toMatchObject({ workspaces: 1 });
  });

  it('opens only read-only workspace handles and closes them even when listing is aborted', async () => {
    const f = await fixture();
    await writeFile(join(f.root, 'protected.txt'), 'original');
    const originalCall = f.helper.clientValue.call.bind(f.helper.clientValue);
    let writeError: unknown;
    const controller = new AbortController();
    const rpc = vi.spyOn(f.helper.clientValue, 'call').mockImplementation((async (method, params, options) => {
      if (method === 'fs/list') {
        writeError = await originalCall('fs/write', {
          workspaceId: params!.workspaceId, path: 'protected.txt', data: Buffer.from('changed').toString('base64'),
          intent: { kind: 'overwrite' }, operationId: randomUUID(),
        }, { mutation: true }).catch(error => error);
        controller.abort();
      }
      return originalCall(method, params, options);
    }) as typeof f.helper.clientValue.call);
    await expect(f.files.list(f.scope, '.', controller.signal)).rejects.toBeInstanceOf(Error);
    expect(writeError).toMatchObject({ code: 'E_PERMISSION_DENIED' });
    expect(await readFile(join(f.root, 'protected.txt'), 'utf8')).toBe('original');
    expect(rpc.mock.calls.some(([method]) => method === 'workspace/close')).toBe(true);
    expect(await originalCall('health/status')).toMatchObject({ workspaces: 0 });
  });

  it.each(['abort-after-open', 'ambiguous-timeout'] as const)(
    'closes the known workspace UUID when open is interrupted by %s',
    async kind => {
      const f = await fixture();
      const controller = new AbortController();
      const originalCall = f.helper.clientValue.call.bind(f.helper.clientValue);
      const rpc = vi.spyOn(f.helper.clientValue, 'call').mockImplementation((async (method, params, options) => {
        const result = await originalCall(method, params, options);
        if (method === 'workspace/open') {
          if (kind === 'abort-after-open') controller.abort();
          else throw new RemoteHelperCallInterruptedError('workspace/open reply timed out', true, 'timeout');
        }
        return result;
      }) as typeof f.helper.clientValue.call);
      const result = f.files.list(f.scope, '.', controller.signal);
      if (kind === 'ambiguous-timeout') {
        await expect(result).rejects.toMatchObject({ kind: 'timeout', mutationMayHaveStarted: true });
      } else await expect(result).rejects.toBeInstanceOf(Error);
      const openedId = rpc.mock.calls.find(([method]) => method === 'workspace/open')?.[1]?.workspaceId;
      expect(openedId).toBeTypeOf('string');
      expect(rpc.mock.calls.find(([method]) => method === 'workspace/close')?.[1]).toMatchObject({ workspaceId: openedId });
      expect(rpc.mock.calls.some(([method]) => method === 'fs/list')).toBe(false);
      expect(await originalCall('health/status')).toMatchObject({ workspaces: 0 });
    },
  );

  it('does not acquire a helper for a list cancelled before it starts', async () => {
    const f = await fixture();
    const acquire = vi.spyOn(f.helper, 'client');
    const controller = new AbortController();
    controller.abort();
    await expect(f.files.list(f.scope, '.', controller.signal)).rejects.toBeInstanceOf(Error);
    expect(acquire).not.toHaveBeenCalled();
  });

  it('delegates local listings unchanged and restores the exact official method', async () => {
    const f = await fixture();
    await writeFile(join(f.localRoot, 'local.txt'), 'local');
    const local = { ...f.scope, workspaceRoot: f.localRoot };
    const signal = new AbortController().signal;
    const rpc = vi.spyOn(f.helper.clientValue, 'call');
    await expect(f.files.list(local, '.', signal)).resolves.toEqual({ path: '', entries: [{ name: 'local.txt', type: 'file', size: 5 }], truncated: false });
    expect(f.originalList).toHaveBeenCalledExactlyOnceWith(local, '.', signal);
    expect(rpc).not.toHaveBeenCalled();
    f.restore();
    await expect(f.files.list(f.scope, '.', signal)).resolves.toEqual({ path: '', entries: [], truncated: false });
    expect(f.originalList).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.find(([method]) => method === 'fs/list')?.[1]).toMatchObject({ allowTruncated: false });
  });

  it('preserves the traced child Context receiver when delegating a local list', async () => {
    const f = await fixture();
    await writeFile(join(f.localRoot, 'local.txt'), 'local');
    const caller = f.context.extend({ workspaceFilesAuditMarker: 'traced-child' });
    const local = { ...f.scope, workspaceRoot: f.localRoot };
    const signal = new AbortController().signal;
    await expect(caller.workspaceFiles.list(local, '.', signal)).resolves.toMatchObject({
      entries: [{ name: 'local.txt', type: 'file', size: 5 }],
    });
    expect(f.originalList).toHaveBeenCalledExactlyOnceWith(local, '.', signal);
    const receiver = f.originalList.mock.contexts[0] as unknown as {
      ctx: Context & { workspaceFilesAuditMarker?: string };
    };
    expect(receiver.ctx.workspaceFilesAuditMarker).toBe('traced-child');
    expect((f.context as Context & { workspaceFilesAuditMarker?: string }).workspaceFilesAuditMarker).toBeUndefined();
  });
});
