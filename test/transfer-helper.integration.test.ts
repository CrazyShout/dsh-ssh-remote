import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile, symlink, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
import { loadHelperAsset } from '../src/helper/installer.js';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-transfer-')); cleanup.push(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary), store = join(root, 'private'), target = join(root, 'target'); await mkdir(target);
  async function connect(asset = helper) {
    const child = spawn('python3', [asset, 'connect', '--stdio', '--direct'], { env: { ...process.env, DSH_REMOTE_TRANSFER_DIR: store } });
    const client = new RemoteHelperRpcClient({ readable: child.stdout, writable: child.stdin, closeTransport: () => child.stdin.end() });
    const exited = new Promise(resolve => child.once('exit', resolve));
    cleanup.push(async () => { client.close(); await exited; });
    await client.initialize({ clientId: randomUUID() });
    const workspaceId = randomUUID(); await client.call('workspace/open', { workspaceId, operationId: workspaceId, path: target, access: 'workspace-write' }, { mutation: true });
    const { installation } = await client.call<{ installation: string }>('transfer/identity');
    const owner = randomUUID();
    const call = (method: string, params: Record<string, unknown> = {}) => client.call<any>('transfer/' + method, { workspaceId, installation, owner, ...params }, { timeoutMs: 20000 });
    return { child, client, workspaceId, installation, owner, call, close: async () => { client.close(); await exited; } };
  }
  return { root, store, target, connect, ...(await connect()) };
}
async function claim(f: { call: (method: string, params?: any) => Promise<any> }, id: string, offset?: number) {
  let result = await f.call('claim', { id, ...(offset === undefined ? {} : { offset }) });
  while (result.state === 'verifying') result = await f.call('verify', { id });
  return result;
}
async function send(f: { call: (method: string, params?: any) => Promise<any> }, id: string, all: Buffer, from = 0, to = all.length) {
  for (let offset = from; offset < to; offset += 262144) {
    const data = all.subarray(offset, Math.min(to, offset + 262144));
    await f.call('write', { id, offset, data: data.toString('base64'), sha256: sha(data) });
  }
}
describe('durable human transfers', () => {
  it('recovers interrupted chunk/publication intent and safely handles disk-full, permission and expiry faults', () => {
    const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./fixtures/transfer_faults.py', import.meta.url)), fileURLToPath(new URL('../helper/dsh_transfer.py', import.meta.url))], { encoding: 'utf8', timeout: 15000 });
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain('faults passed');
  });
  it('resumes a verified upload across helper restart and publishes once', async () => {
    const f = await fixture(), id = randomUUID(), data = Buffer.alloc(768 * 1024, 17);
    await f.call('open', { id, path: '中文 space.bin', direction: 'upload', size: data.length, sha256: sha(data) });
    await claim(f, id); await send(f, id, data, 0, 262144); await f.call('pause', { id });
    expect((await stat(join(f.store, id + '.json'))).mode & 0o777).toBe(0o600);
    await f.close(); const next = await f.connect();
    expect(next.installation).toBe(f.installation);
    expect((await claim(next, id)).offset).toBe(262144);
    await send(next, id, data, 262144);
    expect((await next.call('finish', { id, sha256: sha(data) })).state).toBe('complete');
    expect((await next.call('finish', { id, sha256: sha(data) })).state).toBe('complete');
    expect((await readFile(join(f.target, '中文 space.bin'))).equals(data)).toBe(true);
    expect((await readdir(f.target)).some(name => name.endsWith('.part'))).toBe(false);
    expect(next.client.limits.maxWriteBytes).toBe(64 * 1024 * 1024);
  });
  it('checks leases, ownership, replay bytes and 1 TiB arithmetic without allocating large files', async () => {
    const f = await fixture(), id = randomUUID(), data = Buffer.from('small');
    await f.call('open', { id, path: 'a', direction: 'upload', size: data.length, sha256: sha(data) }); await claim(f, id);
    await expect(f.call('claim', { id, owner: randomUUID() })).rejects.toMatchObject({ code: 'E_BUSY' });
    await expect(f.call('status', { id, installation: 'wrong' })).rejects.toMatchObject({ code: 'E_IDENTITY' });
    await send(f, id, data); await send(f, id, data);
    await expect(send(f, id, Buffer.from('other'))).rejects.toMatchObject({ code: 'E_CHECKSUM' });
    for (const offset of [-1, 1.5, 2 ** 40 + 1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(f.call('write', { id, offset, data: 'YQ==', sha256: sha(Buffer.from('a')) })).rejects.toThrow();
    }
    const python = spawnSync('python3', ['-B', '-c', 'import sys;sys.path.insert(0,sys.argv[1]);from dsh_transfer import integer,MAX_BYTES;assert integer(2**32)==2**32;assert integer(2**40)==MAX_BYTES;print(MAX_BYTES)', fileURLToPath(new URL('../helper', import.meta.url))], { encoding: 'utf8' });
    expect(python.status).toBe(0); expect(python.stdout.trim()).toBe('1099511627776');
  });
  it('cancels only owned partials, keeps existing targets and rejects changed staging', async () => {
    const f = await fixture(), data = Buffer.from('safe'), id = randomUUID();
    await writeFile(join(f.target, 'original'), 'existing');
    await expect(f.call('open', { id, path: 'original', direction: 'upload', size: 4, sha256: sha(data) })).rejects.toMatchObject({ code: 'E_EXISTS' });
    await f.call('open', { id, path: 'new', direction: 'upload', size: 4, sha256: sha(data) }); await claim(f, id); await send(f, id, data);
    await writeFile(join(f.target, '.dsh-transfer-' + id + '.part'), 'oops');
    await expect(f.call('finish', { id, sha256: sha(data) })).rejects.toMatchObject({ code: 'E_CHANGED' });
    expect((await f.call('cancel', { id })).state).toBe('cancelled');
    expect((await f.call('cancel', { id })).state).toBe('cancelled');
    expect(await readFile(join(f.target, 'original'), 'utf8')).toBe('existing');
    await expect(f.call('claim', { id })).rejects.toMatchObject({ code: 'E_RETIRED' });
  });
  it('rewinds a download to client-confirmed bytes after restart and checks source changes', async () => {
    const f = await fixture(), id = randomUUID(), data = Buffer.alloc(512 * 1024, 83); await writeFile(join(f.target, 'read.bin'), data);
    const info = await f.call('stat', { path: 'read.bin' });
    await f.call('open', { id, path: 'read.bin', direction: 'download', size: data.length, version: info.version }); await claim(f, id, 0);
    await f.call('read', { id, offset: 0 }); await f.call('pause', { id }); await f.close();
    const next = await f.connect(); await claim(next, id, 0);
    const a = await next.call('read', { id, offset: 0 }), b = await next.call('read', { id, offset: 262144 });
    expect(Buffer.concat([Buffer.from(a.data, 'base64'), Buffer.from(b.data, 'base64')]).equals(data)).toBe(true);
    expect((await next.call('finish', { id, sha256: sha(data) })).state).toBe('complete');
    const changed = randomUUID(); await next.call('open', { id: changed, path: 'read.bin', direction: 'download', size: data.length, version: info.version });
    await writeFile(join(f.target, 'read.bin'), Buffer.alloc(data.length, 9));
    await expect(claim(next, changed, 0)).rejects.toMatchObject({ code: 'E_CHANGED' });
  });
  it('paginates directory manifests, reports exclusions and refuses traversal', async () => {
    const f = await fixture(); await mkdir(join(f.target, '.ssh')); await writeFile(join(f.target, '.ssh', 'secret'), 'not scanned');
    await symlink('/tmp', join(f.target, 'outside'));
    for (let i = 0; i < 230; i++) await writeFile(join(f.target, `文件 ${i}.txt`), 'x');
    const scanId = randomUUID(); const first = await f.call('scan', { scanId, path: '', cursor: 0 });
    expect(first.entries.length).toBe(200); expect(first.done).toBe(false);
    const second = await f.call('scan', { scanId, path: '', cursor: first.next });
    expect(second.done).toBe(true); const entries = [...first.entries, ...second.entries];
    expect(entries.filter(e => e.kind === 'file')).toHaveLength(230);
    expect(entries.filter(e => e.kind === 'excluded')).toHaveLength(2);
    await expect(f.call('stat', { path: '../outside' })).rejects.toMatchObject({ code: 'E_INVALID_PATH' });
    await expect(f.call('stat', { path: 'outside/file' })).rejects.toThrow();
  });
  it('loads the identical transfer extension from a standalone deployment bundle', async () => {
    const f = await fixture(), bundle = join(f.root, 'standalone.py'); await writeFile(bundle, loadHelperAsset().content);
    const next = await f.connect(bundle);
    expect(next.client.capabilities.transfers).toMatchObject({ version: 1, persistent: true, maxBytes: 2 ** 40 });
    expect(next.installation).toBe(f.installation);
  });
});
