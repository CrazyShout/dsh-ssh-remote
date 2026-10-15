import { File as NodeFile } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { DownloadStaging, CHUNK_BYTES, BLOCK_BYTES, cleanupLocalStaging, directoryFiles, hashFile, hexHash, selectedFiles,
  validateLocalManifest, readLocalChunk, bindDownloadDirectory, removeCleanupReceipt, type LocalDirectory, type LocalFileHandle } from '../client/transfer-local.js';
import type { TransferFile, TransferSummary } from '../shared/transfers.js';
const missing = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
let stamp = 0;
export class MemoryFile implements LocalFileHandle {
  kind = 'file' as const; bytes = new Uint8Array(); stamp = ++stamp; writes = 0; fail = false; failClose = false;
  constructor(readonly name: string) {}
  async getFile() { return new NodeFile([this.bytes], this.name, { lastModified: this.stamp }) as unknown as File; }
  async createWritable() {
    let pending: Uint8Array[] = [], closed = false;
    return { write: async (data: Uint8Array | string) => {
      if (this.fail) throw new Error('disk full'); if (closed) throw new Error('closed');
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      if (bytes.length > BLOCK_BYTES) throw new Error('unbounded write'); pending.push(bytes.slice()); this.writes++;
    }, close: async () => {
      if (this.failClose) throw new Error('permission denied');
      const bytes = new Uint8Array(pending.reduce((n, part) => n + part.length, 0)); let offset = 0;
      for (const part of pending) { bytes.set(part, offset); offset += part.length; }
      this.bytes = bytes; this.stamp = ++stamp; closed = true;
    }, abort: async () => { pending = []; closed = true; } };
  }
}
export class MemoryDirectory implements LocalDirectory {
  kind = 'directory' as const; children = new Map<string, MemoryDirectory | MemoryFile>();
  constructor(readonly name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    let value = this.children.get(name); if (!value && options?.create) this.children.set(name, value = new MemoryDirectory(name));
    if (!value) throw missing(); if (value.kind !== 'directory') throw new Error('type mismatch'); return value;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    let value = this.children.get(name); if (!value && options?.create) this.children.set(name, value = new MemoryFile(name));
    if (!value) throw missing(); if (value.kind !== 'file') throw new Error('type mismatch'); return value;
  }
  async *entries() { yield* this.children; }
  async removeEntry(name: string) { if (!this.children.delete(name)) throw missing(); }
}
const signal = () => new AbortController().signal;
export const job = (): TransferSummary => ({ id: 'test-transfer-identity', direction: 'download', alias: 'test', rootUri: 'ssh://test/work', target: 'tree', state: 'paused', count: 1, appended: 1, totalBytes: 0, created: Date.now(), updated: Date.now(), live: false, nonce: 'test-nonce' });
export const entry = (size: number): TransferFile => ({ id: 'test-transfer-identity-0', index: 0, path: 'tree/中文 file.bin', kind: 'file', version: 'source-v1', size, offset: 0, state: 'queued' });
describe('browser durable download staging', () => {
  it('preserves 4 GiB and 1 TiB slice offsets with mocked metadata, without large file allocation', async () => {
    const ranges: number[][] = [];
    const fake = { size: 2 ** 40, slice(start: number, end: number) { ranges.push([start, end]); return { arrayBuffer: async () => new ArrayBuffer(end - start) }; } } as unknown as Blob;
    expect((await readLocalChunk(fake, 2 ** 32, signal())).length).toBe(CHUNK_BYTES);
    expect((await readLocalChunk(fake, 2 ** 40 - 7, signal())).length).toBe(7);
    expect(ranges).toEqual([[2 ** 32, 2 ** 32 + CHUNK_BYTES], [2 ** 40 - 7, 2 ** 40]]);
    await expect(readLocalChunk(fake, 2 ** 40 + 1, signal())).rejects.toThrow('边界');
  });
  it('closes checkpoints, reconstructs a fresh instance and publishes checked bytes', async () => {
    const root = new MemoryDirectory('local'), data = new Uint8Array(CHUNK_BYTES * 2 + 3).fill(71), file = entry(data.length);
    let stage = await DownloadStaging.open(root, job(), file, false, signal());
    await stage.append(data.subarray(0, CHUNK_BYTES)); await stage.checkpoint();
    stage = await DownloadStaging.open(root, job(), { ...file, offset: CHUNK_BYTES }, false, signal());
    expect(stage.offset).toBe(CHUNK_BYTES);
    await stage.append(data.subarray(CHUNK_BYTES, CHUNK_BYTES * 2)); await stage.append(data.subarray(CHUNK_BYTES * 2));
    await stage.publish(signal());
    const output = await (await root.getDirectoryHandle('tree')).getFileHandle('中文 file.bin');
    expect(hexHash(output.bytes)).toBe(hexHash(data)); expect(stage.digest).toBe(hexHash(data));
    const fresh = await DownloadStaging.open(root, job(), { ...file, offset: data.length }, false, signal());
    const writes = output.writes; await fresh.publish(signal()); expect(output.writes).toBe(writes);
    await cleanupLocalStaging(root, job()); expect(hexHash(output.bytes)).toBe(hexHash(data));
    await cleanupLocalStaging(root, job()); await removeCleanupReceipt(root, job());
    expect([...root.children.keys()]).toEqual(['tree']);
  });
  it('binds the original destination even at offset zero and keeps a cleanup receipt until Host confirmation', async () => {
    const original = new MemoryDirectory('original'), wrong = new MemoryDirectory('wrong'), task = { ...job(), state: 'ready' as const };
    const destination = await bindDownloadDirectory(original, task), bound = { ...task, destination, state: 'paused' as const };
    expect(await bindDownloadDirectory(original, bound)).toBe(destination);
    await expect(bindDownloadDirectory(wrong, bound)).rejects.toThrow('最初授权');
    await expect(cleanupLocalStaging(wrong, bound)).rejects.toThrow('不能确认');
    await cleanupLocalStaging(original, bound); await cleanupLocalStaging(original, bound);
    expect(await bindDownloadDirectory(original, bound)).toBe(destination);
    await removeCleanupReceipt(original, bound); expect(original.children.size).toBe(0);
  });
  it('refuses changed sources, corrupted blocks, wrong folders and ownership markers', async () => {
    const root = new MemoryDirectory('local'), file = entry(4), stage = await DownloadStaging.open(root, job(), file, false, signal());
    await stage.append(new Uint8Array([1, 2])); await stage.checkpoint();
    await expect(DownloadStaging.open(root, job(), { ...file, version: 'changed' }, false, signal())).rejects.toThrow('身份');
    await expect(DownloadStaging.open(new MemoryDirectory('wrong'), job(), { ...file, offset: 2 }, false, signal())).rejects.toThrow('检查点');
    const own = await root.getDirectoryHandle('.dsh-transfer-' + job().id), folder = await own.getDirectoryHandle('file-0');
    (await folder.getFileHandle('block-0.bin')).bytes[0] = 42;
    await expect(DownloadStaging.open(root, job(), file, false, signal())).rejects.toThrow('校验');
    await expect(cleanupLocalStaging(root, { ...job(), nonce: 'wrong' })).rejects.toThrow('不属于');
    await folder.getFileHandle('user-important.txt', { create: true });
    await expect(cleanupLocalStaging(root, job())).rejects.toThrow('未知');
  });
  it('retains a closed block if checkpoint metadata fails, and does not publish partial data', async () => {
    const root = new MemoryDirectory('local'), file = entry(8), stage = await DownloadStaging.open(root, job(), file, false, signal());
    const folder = await (await root.getDirectoryHandle('.dsh-transfer-' + job().id)).getDirectoryHandle('file-0');
    const state = await folder.getFileHandle('state.json'); state.fail = true;
    await stage.append(new Uint8Array([1, 2])); await expect(stage.checkpoint()).rejects.toThrow('disk full');
    expect(stage.state.offset).toBe(0); state.fail = false;
    const fresh = await DownloadStaging.open(root, job(), file, false, signal()); expect(fresh.offset).toBe(0);
    await expect(fresh.publish(signal())).rejects.toThrow('尚未完整');
  });
  it('resumes an aborted local publication and rejects a concurrent target change', async () => {
    const root = new MemoryDirectory('local'), file = entry(2), stage = await DownloadStaging.open(root, job(), file, false, signal());
    await stage.append(new Uint8Array([6, 8]));
    const parent = await root.getDirectoryHandle('tree');
    const original = parent.getFileHandle.bind(parent);
    parent.getFileHandle = async (name, options) => { const f = await original(name, options); f.failClose = true; return f; };
    await expect(stage.publish(signal())).rejects.toThrow('permission');
    parent.getFileHandle = original; (await original('中文 file.bin')).failClose = false;
    const resumed = await DownloadStaging.open(root, job(), file, false, signal()); await resumed.publish(signal());
    expect((await original('中文 file.bin')).bytes).toEqual(new Uint8Array([6, 8]));
    const other = entry(1); other.id = 'test-transfer-identity-1'; other.index = 1; other.path = 'tree/conflict';
    const conflict = await DownloadStaging.open(root, job(), other, false, signal()); await conflict.append(new Uint8Array([1]));
    (await original('conflict', { create: true })).bytes = new Uint8Array([9]);
    await expect(conflict.publish(signal())).rejects.toThrow('已改变');
  });
  it('enumerates exclusions and empty folders and rejects Unicode/parent collisions', async () => {
    const root = new MemoryDirectory('tree'); await root.getDirectoryHandle('empty', { create: true });
    await root.getFileHandle('.env', { create: true }); (await root.getFileHandle('数据.txt', { create: true })).bytes = new Uint8Array([3]);
    const files = await directoryFiles(root);
    expect(files.map(file => [file.entry.path, file.entry.kind])).toContainEqual(['tree/.env', 'excluded']);
    expect(files.map(file => [file.entry.path, file.entry.kind])).toContainEqual(['tree/empty', 'directory']);
    expect(() => validateLocalManifest([{ entry: { path: 'A/x', kind: 'file', size: 0 } }, { entry: { path: 'a/y', kind: 'file', size: 0 } }] as any)).toThrow('父目录');
    const small = new NodeFile(['ok'], 'hello') as unknown as File;
    expect(selectedFiles([small])[0].entry.size).toBe(2); expect(await hashFile(small, signal())).toBe(hexHash(new TextEncoder().encode('ok')));
    let reads = 0;
    await expect(hashFile({ size: 2 ** 40 + 1, slice() { reads++; } } as any, signal())).rejects.toThrow('1 TiB'); expect(reads).toBe(0);
  });
});
