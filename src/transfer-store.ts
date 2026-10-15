import { constants } from 'node:fs';
import { mkdir, open, rename, unlink, readdir, lstat, chmod, link, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TransferEntry, TransferFile, TransferSummary } from 'dsh-ssh-remote/transfers';

export const TRANSFER_LIMIT = 2 ** 40;
export const TRANSFER_CHUNK = 256 * 1024;
export const TRANSFER_RETENTION = 7 * 86400_000;
export const TRANSFER_PAGE = 200;
export const TRANSFER_MAX_ENTRIES = 10_000;
export const transferId = (id: string) => { if (!/^[a-zA-Z0-9-]{16,80}$/u.test(id)) throw new Error('无效传输标识。'); return id; };
export function transferBytes(value: number, limit = TRANSFER_LIMIT): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) throw new Error('传输大小或偏移超出 1 TiB / 整数边界。'); return value;
}
export function transferPath(path: string, empty = false): string {
  if (typeof path !== 'string' || (!path && !empty) || path.length > 4096 || path.startsWith('/') || path.includes('\\')
    || /[\x00-\x1f\x7f]/u.test(path) || (path && path.split('/').some(p => !p || p === '.' || p === '..' || Buffer.byteLength(p) > 255))) {
    throw new Error('传输路径必须是工作区内的安全相对路径。');
  }
  return path;
}
export function validateTransferEntries(entries: TransferEntry[]): void {
  if (!Array.isArray(entries) || entries.length > TRANSFER_MAX_ENTRIES) throw new Error('每批最多 10,000 项。');
  const names = new Map<string, string>(), exact = new Set<string>();
  const kinds = new Map(entries.map(e => [e.path, e.kind])); let total = 0, pathBytes = 0;
  for (const e of entries) {
    transferPath(e.path); pathBytes += Buffer.byteLength(e.path);
    if (!['file', 'directory', 'excluded'].includes(e.kind)) throw new Error('无效目录项。');
    const components = e.path.split('/');
    for (let i = 1; i <= components.length; i++) {
      const path = components.slice(0, i).join('/'), key = path.normalize('NFC').toUpperCase().toLowerCase();
      const old = names.get(key);
      if (old !== undefined && old !== path) throw new Error(`路径大小写或 Unicode 冲突：${old} / ${path}`);
      if (i < components.length && kinds.has(path) && kinds.get(path) !== 'directory') throw new Error('文件或排除项不能同时作为父目录。');
      names.set(key, path);
    }
    if (exact.has(e.path)) throw new Error('重复的清单路径。'); exact.add(e.path);
    if (e.kind === 'file') total = transferBytes(total + transferBytes(e.size!));
  }
  if (pathBytes > 8 * 1024 * 1024) throw new Error('目录路径清单超过 8 MiB。');
}
export interface StoredTransfer extends Omit<TransferSummary, 'live'> { schema: 1; installation: string; sessionId: string; }

/** Immutable manifest pages and independent small file receipts avoid rewriting a 10k-entry manifest per chunk. */
export class TransferStore {
  constructor(readonly directory: string) {}
  private async privateDirectory(path: string) {
    await mkdir(path, { recursive: true, mode: 0o700 }); const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) throw new Error('传输状态目录身份不安全。');
    await chmod(path, 0o700);
  }
  private path(id: string, name: string) { return join(this.directory, transferId(id), name + '.json'); }
  async create(job: StoredTransfer) {
    await this.privateDirectory(this.directory);
    const names = await readdir(this.directory); if (names.length >= 64 && !names.includes(job.id)) throw new Error('最多保留 64 个传输任务，请清理旧任务。');
    await this.privateDirectory(join(this.directory, transferId(job.id)));
    await this.write(job.id, 'job', job, true);
  }
  async write(id: string, name: string, data: unknown, once = false) {
    const path = this.path(id, name), temporary = path + '.' + randomUUID();
    const bytes = JSON.stringify(data); if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw new Error('传输元数据页过大。');
    try {
      const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
      if (once) await link(temporary, path); else await rename(temporary, path);
      const folder = await open(join(this.directory, id), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await folder.sync(); } finally { await folder.close(); }
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async read<T>(id: string, name: string): Promise<T> {
    const folder = await lstat(join(this.directory, transferId(id))); if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error('传输目录身份改变。');
    const file = await open(this.path(id, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat(); if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('传输状态页无效。');
      return JSON.parse(await file.readFile('utf8')) as T;
    } finally { await file.close(); }
  }
  async job(id: string): Promise<StoredTransfer> {
    const job = await this.read<StoredTransfer>(id, 'job');
    if (job.schema !== 1 || job.id !== id) throw new Error('不支持的传输记录格式。');
    transferBytes(job.count, TRANSFER_MAX_ENTRIES); transferBytes(job.totalBytes); transferPath(job.target, true);
    return job;
  }
  async list(): Promise<StoredTransfer[]> {
    const names = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    if (names.length > 64) throw new Error('传输目录任务数量超过上限。');
    const result: StoredTransfer[] = [];
    for (const name of names) { if (/^[\w-]{16,80}$/u.test(name)) result.push(await this.job(name)); }
    return result;
  }
  async manifest(job: StoredTransfer, index: number): Promise<TransferEntry> {
    transferBytes(index, job.count - 1);
    const entries = await this.read<TransferEntry[]>(job.id, `manifest-${Math.floor(index / TRANSFER_PAGE)}`);
    const entry = entries[index % TRANSFER_PAGE]; validateTransferEntries([entry]); return entry;
  }
  async file(job: StoredTransfer, index: number): Promise<TransferFile> {
    const entry = await this.manifest(job, index);
    const base: TransferFile = { ...entry, index, id: `${job.id}-${index}`, state: entry.kind === 'excluded' ? 'skipped' : 'queued', offset: 0 };
    try {
      const saved = await this.read<Partial<TransferFile>>(job.id, `file-${index}`);
      if (saved.id !== base.id || saved.path !== base.path) throw new Error('文件回执身份改变。');
      transferBytes(saved.offset!, entry.size ?? 0); return { ...base, ...saved };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return base; throw error; }
  }
  async saveFile(job: StoredTransfer, entry: TransferFile) { await this.write(job.id, `file-${entry.index}`, entry); }
  async forget(id: string) {
    const directory = join(this.directory, transferId(id)), names = await readdir(directory);
    for (const name of names) {
      if (!/^(job|manifest-\d+|file-\d+)\.json(?:\.[a-f0-9-]{36})?$/u.test(name)) throw new Error('任务目录含未知文件，未清理。');
      const info = await lstat(join(directory, name)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('任务目录身份改变，未清理。');
    }
    for (const name of names) await unlink(join(directory, name)); await rmdir(directory);
  }
}
