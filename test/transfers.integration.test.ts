import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { TransferManager } from '../src/transfers.js';
import { TRANSFER_LIMIT, transferBytes, validateTransferEntries } from '../src/transfer-store.js';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-transfer-host-')); cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary), target = join(root, 'remote'); await mkdir(target);
  const child = spawn('python3', [fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url)), 'connect', '--stdio', '--direct'], { env: { ...process.env, DSH_REMOTE_TRANSFER_DIR: join(root, 'remote-store') } });
  const client = new RemoteHelperRpcClient({ readable: child.stdout, writable: child.stdin, closeTransport: () => child.stdin.end() });
  const exit = new Promise(resolve => child.once('exit', resolve)); cleanups.push(async () => { client.close(); await exit; });
  await client.initialize({ clientId: randomUUID() });
  const scope = { sessionId: 'transfer-session' as any, workspaceRoot: '/anchor' };
  function manager() {
    const m = new TransferManager({ client: async () => client }, p => p === '/anchor' ? `ssh://test${target}` : p === '/other' ? `ssh://other${target}` : undefined, () => {}, join(root, 'host-store'));
    cleanups.push(() => m.dispose()); return m;
  }
  return { root, target, scope, manager, m: manager() };
}
async function begin(m: TransferManager, scope: any, id: string, run: string, index: number, options: { sha256?: string; offset?: number; replace?: boolean } = {}) {
  let r = await m.file(scope, { id, run, index, action: 'begin', ...options });
  while (r.state === 'verifying') r = await m.file(scope, { id, run, index, action: 'verify' });
  return r;
}
describe('Session-authorized transfer control', () => {
  it('persists the download destination before bytes and refuses a different folder after restart', async () => {
    const f = await fixture(), id = randomUUID(), run = randomUUID(), destination = randomUUID(); await writeFile(join(f.target, 'a'), 'small');
    await f.m.plan(f.scope, { id, direction: 'download', target: 'a' });
    await f.m.control(f.scope, { id, run, destination, action: 'resume' }); await f.m.control(f.scope, { id, run, action: 'pause' }); await f.m.dispose();
    const fresh = f.manager(); expect((await fresh.page(f.scope, id)).job.destination).toBe(destination);
    await expect(fresh.control(f.scope, { id, run: randomUUID(), destination: randomUUID(), action: 'resume' })).rejects.toThrow('最初授权');
  });
  it('publishes upload only after checksums, and resumes through a new Host manager', async () => {
    const f = await fixture(), id = randomUUID(), data = Buffer.alloc(512 * 1024, 32), run = randomUUID();
    await f.m.plan(f.scope, { id, direction: 'upload', target: '', count: 1, totalBytes: data.length });
    await f.m.append(f.scope, { id, after: 0, entries: [{ path: '中文 file.bin', kind: 'file', size: data.length }] });
    await f.m.control(f.scope, { id, run, action: 'resume' });
    await begin(f.m, f.scope, id, run, 0, { sha256: hash(data) });
    const a = data.subarray(0, 262144);
    await f.m.upload(f.scope, id, 0, run, 0, a, hash(a));
    await f.m.control(f.scope, { id, run, action: 'pause' }); await f.m.dispose();
    const fresh = f.manager(), nextRun = randomUUID();
    expect((await fresh.list(f.scope))[0].state).toBe('paused');
    await fresh.control(f.scope, { id, run: nextRun, action: 'resume' });
    expect((await begin(fresh, f.scope, id, nextRun, 0, { sha256: hash(data) })).file.offset).toBe(262144);
    const b = data.subarray(262144); await fresh.upload(f.scope, id, 0, nextRun, 262144, b, hash(b));
    await fresh.file(f.scope, { id, run: nextRun, index: 0, action: 'finish', sha256: hash(data) });
    expect((await fresh.page(f.scope, id)).job.state).toBe('complete');
    expect((await readFile(join(f.target, '中文 file.bin'))).equals(data)).toBe(true);
  });
  it('fences another Host executor and another workspace without changing local behavior', async () => {
    const f = await fixture(), id = randomUUID(), run = randomUUID();
    await f.m.plan(f.scope, { id, direction: 'upload', target: '', count: 1, totalBytes: 1 });
    await f.m.append(f.scope, { id, after: 0, entries: [{ path: 'a', kind: 'file', size: 1 }] });
    await f.m.control(f.scope, { id, run, action: 'resume' });
    await expect(f.manager().control(f.scope, { id, run: randomUUID(), action: 'resume' })).rejects.toThrow('owns');
    await expect(f.m.page({ ...f.scope, workspaceRoot: '/other' }, id)).rejects.toThrow('其他');
    await expect(f.m.list({ ...f.scope, workspaceRoot: '/local' })).rejects.toThrow('SSH');
  });
  it('downloads bounded chunks and records completion only after the client confirms publication', async () => {
    const f = await fixture(), id = randomUUID(), run = randomUUID(), data = Buffer.from('remote bytes\n');
    await writeFile(join(f.target, 'read.txt'), data);
    const page = await f.m.plan(f.scope, { id, direction: 'download', target: 'read.txt' });
    expect(page.entries[0].path).toBe('read.txt');
    await f.m.control(f.scope, { id, run, action: 'resume', destination: randomUUID() }); await begin(f.m, f.scope, id, run, 0, { offset: 0 });
    expect((await f.m.download(f.scope, id, 0, run, 0)).bytes).toEqual(data);
    expect((await f.m.page(f.scope, id)).job.state).toBe('running');
    await f.m.file(f.scope, { id, run, index: 0, action: 'finish', sha256: hash(data) });
    expect((await f.m.page(f.scope, id)).job.state).toBe('complete');
  });
  it('cancels an uncertain allocation and never overwrites an existing target by default', async () => {
    const f = await fixture(), id = randomUUID(), run = randomUUID(), data = Buffer.from('x');
    await writeFile(join(f.target, 'existing'), 'keep');
    await f.m.plan(f.scope, { id, direction: 'upload', target: '', count: 1, totalBytes: 1 });
    await f.m.append(f.scope, { id, after: 0, entries: [{ path: 'existing', kind: 'file', size: 1 }] });
    await f.m.control(f.scope, { id, run, action: 'resume' });
    await expect(begin(f.m, f.scope, id, run, 0, { sha256: hash(data) })).rejects.toThrow('已存在');
    expect((await f.m.control(f.scope, { id, run, action: 'cancel' })).job.state).toBe('cancelled');
    expect(await readFile(join(f.target, 'existing'), 'utf8')).toBe('keep');
  });
  it('validates 4 GiB / 1 TiB limits and filename collisions without large files', () => {
    expect(transferBytes(2 ** 32)).toBe(2 ** 32); expect(transferBytes(2 ** 40)).toBe(TRANSFER_LIMIT);
    for (const n of [2 ** 40 + 1, -1, 0.5, NaN, Infinity, 2 ** 53]) expect(() => transferBytes(n)).toThrow();
    expect(() => validateTransferEntries([{ kind: 'file', path: 'a', size: 2 ** 40 }, { kind: 'file', path: 'b', size: 1 }])).toThrow();
    for (const names of [['a', 'A'], ['é', 'e\u0301'], ['../escape', 'b']]) expect(() => validateTransferEntries(names.map(path => ({ kind: 'file', path, size: 0 })))).toThrow();
  });
});
