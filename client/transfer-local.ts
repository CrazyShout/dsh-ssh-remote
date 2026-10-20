import { t } from './locale.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TransferEntry, TransferFile, TransferSummary } from './transfer-types.js';
export const BYTE_LIMIT = 2 ** 40, CHUNK_BYTES = 256 * 1024, BLOCK_BYTES = 4 * 1024 * 1024;
export interface LocalFile {
    entry: TransferEntry;
    getFile(): Promise<File>;
}
export interface WritableFile {
    write(data: Uint8Array | string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
}
export interface LocalFileHandle {
    kind: 'file';
    name: string;
    getFile(): Promise<File>;
    createWritable(options?: {
        mode: 'exclusive';
    }): Promise<WritableFile>;
}
export interface LocalDirectory {
    kind: 'directory';
    name: string;
    getDirectoryHandle(name: string, options?: {
        create?: boolean;
    }): Promise<LocalDirectory>;
    getFileHandle(name: string, options?: {
        create?: boolean;
    }): Promise<LocalFileHandle>;
    entries(): AsyncIterable<[
        string,
        LocalDirectory | LocalFileHandle
    ]>;
    removeEntry(name: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
}
const absent = (error: unknown) => (error as {
    name?: string;
})?.name === 'NotFoundError';
const excludes = new Set(['.git', '.ssh', '.aws', '.azure', '.gnupg', '.venv', 'venv', 'node_modules', '__pycache__', 'build', 'dist']);
export const excludedPath = (path: string) => path.split('/').some(name => excludes.has(name) || name.startsWith('.env')
    || ['id_rsa', 'id_ed25519'].includes(name) || /\.(pem|key)$/u.test(name) || name.startsWith('.dsh-transfer-'));
export const hexHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export async function readLocalChunk(file: Blob, offset: number, signal: AbortSignal): Promise<Uint8Array> {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > BYTE_LIMIT || !Number.isSafeInteger(offset) || offset < 0 || offset > file.size)
        throw new Error(t('分块偏移超出 1 TiB / 整数边界。'));
    signal.throwIfAborted();
    const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + CHUNK_BYTES)).arrayBuffer());
    signal.throwIfAborted();
    if (bytes.length !== Math.min(CHUNK_BYTES, file.size - offset))
        throw new Error(t('源文件分块长度发生变化。'));
    return bytes;
}
export function localPath(path: string): string[] {
    const parts = path.split('/');
    if (!path || path.length > 4096 || /[\x00-\x1f\x7f\\]/u.test(path)
        || parts.some(p => !p || p === '.' || p === '..' || new TextEncoder().encode(p).length > 255))
        throw new Error(t('不支持的文件名或相对路径。'));
    return parts;
}
export async function hashFile(file: Blob, signal: AbortSignal, progress: (bytes: number) => void = () => { }): Promise<string> {
    if (!Number.isSafeInteger(file.size) || file.size > BYTE_LIMIT)
        throw new Error(t('单文件超过 1 TiB。'));
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        signal.throwIfAborted();
        hash.update(await readLocalChunk(file, offset, signal));
        progress(Math.min(file.size, offset + CHUNK_BYTES));
    }
    signal.throwIfAborted();
    return bytesToHex(hash.digest());
}
export function validateLocalManifest(files: LocalFile[]): void {
    if (files.length > 10000)
        throw new Error(t('每批最多 10,000 个文件/目录项。'));
    let total = 0, paths = 0;
    const seen = new Set<string>(), names = new Map<string, string>();
    for (const { entry } of files) {
        localPath(entry.path);
        const key = entry.path.normalize('NFC').toUpperCase().toLowerCase();
        if (seen.has(key))
            throw new Error(t('清单含大小写或 Unicode 冲突，未静默改名。'));
        seen.add(key);
        const components = entry.path.split('/');
        for (let i = 1; i <= components.length; i++) {
            const path = components.slice(0, i).join('/'), nameKey = path.normalize('NFC').toUpperCase().toLowerCase();
            if (names.has(nameKey) && names.get(nameKey) !== path)
                throw new Error(t('清单的父目录存在大小写或 Unicode 冲突。'));
            names.set(nameKey, path);
        }
        paths += new TextEncoder().encode(entry.path).length;
        if (entry.kind === 'file') {
            if (!Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > BYTE_LIMIT)
                throw new Error(t('单文件超过 1 TiB。'));
            total += entry.size!;
        }
    }
    if (total > BYTE_LIMIT || paths > 8 * 1024 * 1024)
        throw new Error(t('单批超过 1 TiB 或路径清单超过 8 MiB。'));
}
export function selectedFiles(files: Iterable<File>): LocalFile[] {
    const result: LocalFile[] = [...files].map(file => {
        const path = file.webkitRelativePath || file.name;
        return { entry: excludedPath(path) ? { path, kind: 'excluded', reason: t('凭据或构建缓存，默认排除') } : { path, kind: 'file', size: file.size }, getFile: async () => file };
    });
    validateLocalManifest(result);
    return result;
}
export async function directoryFiles(root: LocalDirectory): Promise<LocalFile[]> {
    const result: LocalFile[] = [];
    const add = (value: LocalFile) => {
        result.push(value);
        if (result.length > 10000)
            throw new Error(t('目录超过 10,000 项。'));
    };
    async function walk(directory: LocalDirectory, prefix: string) {
        for await (const [name, handle] of directory.entries()) {
            const path = `${prefix}/${name}`;
            localPath(path);
            if (excludedPath(path)) {
                add({ entry: { path, kind: 'excluded', reason: t('凭据或构建缓存，默认排除') }, getFile: async () => { throw new Error(t('排除项')); } });
                continue;
            }
            if (handle.kind === 'directory') {
                add({ entry: { path, kind: 'directory' }, getFile: async () => { throw new Error(t('目录不是文件')); } });
                await walk(handle, path);
            }
            else {
                const file = await handle.getFile();
                add({ entry: { path, kind: 'file', size: file.size }, getFile: () => handle.getFile() });
            }
        }
    }
    add({ entry: { path: root.name, kind: 'directory' }, getFile: async () => { throw new Error(t('目录不是文件')); } });
    await walk(root, root.name);
    validateLocalManifest(result);
    return result;
}
export function canPickLocalDirectory(): boolean {
    return typeof window !== 'undefined' && typeof (window as unknown as {
        showDirectoryPicker?: unknown;
    }).showDirectoryPicker === 'function';
}
export async function pickLocalDirectory(mode: 'read' | 'readwrite'): Promise<LocalDirectory> {
    const pick = (window as unknown as {
        showDirectoryPicker?: (options: {
            mode: string;
        }) => Promise<LocalDirectory>;
    }).showDirectoryPicker;
    if (!pick)
        throw new Error(t('此浏览器缺少目录读写授权能力；请使用支持 File System Access 的 Desktop/Chromium，不会改存到 DSH 宿主。'));
    return pick.call(window, { mode });
}
async function exactName(directory: LocalDirectory, name: string) {
    let count = 0;
    for await (const [existing] of directory.entries()) {
        if (++count > 10000)
            throw new Error(t('本地目标目录超过安全枚举预算。'));
        if (existing !== name && existing.normalize('NFC').toUpperCase().toLowerCase() === name.normalize('NFC').toUpperCase().toLowerCase())
            throw new Error(t('本地名称冲突：{value1} / {value2}', { value1: existing, value2: name }));
    }
}
export async function localDirectory(root: LocalDirectory, path: string, create = true): Promise<LocalDirectory> {
    let directory = root;
    for (const name of path ? localPath(path) : []) {
        await exactName(directory, name);
        directory = await directory.getDirectoryHandle(name, { create });
    }
    return directory;
}
async function jsonFile<T>(dir: LocalDirectory, name: string): Promise<T> {
    const file = await (await dir.getFileHandle(name)).getFile();
    if (file.size > 32768)
        throw new Error(t('本地续传清单过大。'));
    return JSON.parse(await file.text()) as T;
}
async function putJson(dir: LocalDirectory, name: string, value: unknown) {
    const stream = await (await dir.getFileHandle(name, { create: true })).createWritable({ mode: 'exclusive' });
    try {
        await stream.write(JSON.stringify(value));
        await stream.close();
    }
    catch (error) {
        await stream.abort().catch(() => { });
        throw error;
    }
}
interface TargetVersion {
    exists: boolean;
    size?: number;
    modified?: number;
    sha256?: string;
}
interface DownloadState {
    schema: 1;
    id: string;
    size: number;
    version: string;
    offset: number;
    blocks: number;
    prefix: string;
    target: TargetVersion;
    phase: 'partial' | 'publishing' | 'published';
}
export async function ownedStaging(root: LocalDirectory, job: TransferSummary, create: boolean): Promise<LocalDirectory> {
    const name = '.dsh-transfer-' + job.id;
    let directory: LocalDirectory;
    try {
        directory = await root.getDirectoryHandle(name);
    }
    catch (error) {
        if (!absent(error) || !create)
            throw error;
        directory = await root.getDirectoryHandle(name, { create: true });
        await putJson(directory, 'owner.json', { schema: 1, id: job.id, nonce: job.nonce, destination: crypto.randomUUID() });
    }
    const owner = await jsonFile<{
        schema: number;
        id: string;
        nonce: string;
        destination?: string;
    }>(directory, 'owner.json');
    if (owner.schema !== 1 || owner.id !== job.id || owner.nonce !== job.nonce || job.destination && owner.destination !== job.destination)
        throw new Error(t('暂存目录不属于此任务，未读取或删除。'));
    return directory;
}
export async function bindDownloadDirectory(root: LocalDirectory, job: TransferSummary): Promise<string> {
    let directory: LocalDirectory;
    try {
        directory = await ownedStaging(root, job, !job.destination && job.state === 'ready');
    }
    catch (error) {
        if (absent(error))
            throw new Error(t('请选择最初授权的下载目录；此处没有原任务的目录绑定。'));
        throw error;
    }
    const owner = await jsonFile<{
        schema: number;
        id: string;
        nonce: string;
        destination?: string;
    }>(directory, 'owner.json');
    // Additive upgrade for a v1 checkpoint written by an earlier candidate.
    if (!owner.destination) {
        owner.destination = crypto.randomUUID();
        await putJson(directory, 'owner.json', owner);
    }
    if (!/^[a-zA-Z0-9-]{16,80}$/u.test(owner.destination))
        throw new Error(t('下载目录绑定无效。'));
    return owner.destination;
}
export function downloadPath(job: TransferSummary, file: TransferEntry): string {
    // Multiple roots retain workspace-relative paths, avoiding basename collisions.
    const parent = job.sources ? '' : job.target.includes('/') ? job.target.slice(0, job.target.lastIndexOf('/') + 1) : '';
    const result = file.path.startsWith(parent) ? file.path.slice(parent.length) : file.path;
    localPath(result);
    return result;
}
/** Closed 4 MiB files survive a browser restart; no unclosed FSA write stream is used as a checkpoint. */
export class DownloadStaging {
    private hash = sha256.create();
    private pending: Uint8Array[] = [];
    private pendingBytes = 0;
    private constructor(readonly directory: LocalDirectory, readonly state: DownloadState, private readonly destination: LocalDirectory, private readonly name: string) { }
    static async open(root: LocalDirectory, job: TransferSummary, file: TransferFile, replace: boolean, signal: AbortSignal): Promise<DownloadStaging> {
        let directory: LocalDirectory;
        try {
            const stage = await ownedStaging(root, job, !job.destination && file.offset === 0);
            directory = await stage.getDirectoryHandle('file-' + file.index, { create: file.offset === 0 });
        }
        catch (error) {
            if (absent(error))
                throw new Error(t('此目录没有原来的下载检查点，请选择原授权目录。'));
            throw error;
        }
        const parts = localPath(downloadPath(job, file)), name = parts.pop()!, destination = await localDirectory(root, parts.join('/'));
        await exactName(destination, name);
        let state: DownloadState;
        try {
            state = await jsonFile<DownloadState>(directory, 'state.json');
        }
        catch (error) {
            if (!absent(error))
                throw error;
            if (file.offset > 0)
                throw new Error(t('此目录没有原来的下载检查点；请选择原授权目录，不能拼接到新目录。'));
            const target = await targetVersion(destination, name, signal);
            if (target.exists && !replace)
                throw new Error(t('本地目标已存在，请明确勾选覆盖。'));
            state = { schema: 1, id: file.id, size: file.size!, version: file.version!, offset: 0, blocks: 0,
                prefix: hexHash(new Uint8Array()), target, phase: 'partial' };
            await putJson(directory, 'state.json', state);
        }
        if (state.schema !== 1 || state.id !== file.id || state.size !== file.size || state.version !== file.version
            || !Number.isSafeInteger(state.offset) || state.offset < 0 || state.offset > file.size!
            || !Number.isSafeInteger(state.blocks) || state.blocks < 0 || state.blocks > Math.ceil(file.size! / CHUNK_BYTES) + 1
            || !['partial', 'publishing', 'published'].includes(state.phase) || !/^[a-f0-9]{64}$/u.test(state.prefix))
            throw new Error(t('本地续传清单身份或偏移不匹配。'));
        const result = new DownloadStaging(directory, state, destination, name);
        let bytes = 0;
        for (let index = 0; index < state.blocks; index++) {
            signal.throwIfAborted();
            const blob = await (await directory.getFileHandle(`block-${index}.bin`)).getFile();
            if (blob.size > BLOCK_BYTES || blob.size === 0)
                throw new Error(t('本地暂存块大小错误。'));
            for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
                signal.throwIfAborted();
                result.hash.update(new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
            }
            bytes += blob.size;
        }
        if (bytes !== state.offset || result.digest !== state.prefix)
            throw new Error(t('本地暂存内容校验失败，拒绝拼接。'));
        return result;
    }
    get offset() { return this.state.offset + this.pendingBytes; }
    get digest() { return bytesToHex(this.hash.clone().digest()); }
    async append(bytes: Uint8Array) {
        if (this.offset + bytes.length > this.state.size || bytes.length > CHUNK_BYTES)
            throw new Error(t('下载分块越界。'));
        this.hash.update(bytes);
        this.pending.push(bytes);
        this.pendingBytes += bytes.length;
        if (this.pendingBytes >= BLOCK_BYTES)
            await this.checkpoint();
    }
    async checkpoint() {
        if (!this.pendingBytes)
            return;
        const stream = await (await this.directory.getFileHandle(`block-${this.state.blocks}.bin`, { create: true })).createWritable({ mode: 'exclusive' });
        try {
            for (const bytes of this.pending)
                await stream.write(bytes);
            await stream.close();
        }
        catch (error) {
            await stream.abort().catch(() => { });
            throw error;
        }
        const next = { ...this.state, offset: this.offset, blocks: this.state.blocks + 1, prefix: this.digest };
        await putJson(this.directory, 'state.json', next);
        Object.assign(this.state, next);
        this.pending = [];
        this.pendingBytes = 0;
    }
    async publish(signal: AbortSignal) {
        await this.checkpoint();
        signal.throwIfAborted();
        if (this.offset !== this.state.size)
            throw new Error(t('下载尚未完整，不能发布。'));
        const current = await targetVersion(this.destination, this.name, signal);
        if (this.state.phase !== 'partial' && current.exists && current.sha256 === this.digest && current.size === this.state.size) {
            this.state.phase = 'published';
            await putJson(this.directory, 'state.json', this.state);
            return;
        }
        if (JSON.stringify(current) !== JSON.stringify(this.state.target))
            throw new Error(t('本地目标已改变，保留暂存且不覆盖。'));
        this.state.phase = 'publishing';
        await putJson(this.directory, 'state.json', this.state);
        const handle = await this.destination.getFileHandle(this.name, { create: true });
        if (!current.exists && (await handle.getFile()).size !== 0)
            throw new Error(t('目标刚被其他程序创建，未覆盖。'));
        if (!current.exists) {
            // FSA creates an empty entry before opening its atomic temporary writer.
            // Record that exact observed placeholder so an aborted writer can resume.
            this.state.target = await targetVersion(this.destination, this.name, signal);
            await putJson(this.directory, 'state.json', this.state);
        }
        const stream = await handle.createWritable({ mode: 'exclusive' });
        try {
            if (JSON.stringify(await targetVersion(this.destination, this.name, signal)) !== JSON.stringify(this.state.target))
                throw new Error(t('获得写锁前目标已改变，未覆盖。'));
            const hash = sha256.create();
            for (let i = 0; i < this.state.blocks; i++) {
                const block = await (await this.directory.getFileHandle(`block-${i}.bin`)).getFile();
                for (let offset = 0; offset < block.size; offset += CHUNK_BYTES) {
                    signal.throwIfAborted();
                    const bytes = new Uint8Array(await block.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
                    hash.update(bytes);
                    await stream.write(bytes);
                }
            }
            if (bytesToHex(hash.digest()) !== this.digest)
                throw new Error(t('合成时暂存数据发生变化。'));
            signal.throwIfAborted();
            await stream.close();
            this.state.phase = 'published';
            await putJson(this.directory, 'state.json', this.state);
        }
        catch (error) {
            await stream.abort().catch(() => { });
            throw error;
        }
    }
}
async function targetVersion(directory: LocalDirectory, name: string, signal: AbortSignal): Promise<TargetVersion> {
    let file: File;
    try {
        file = await (await directory.getFileHandle(name)).getFile();
    }
    catch (error) {
        if (absent(error))
            return { exists: false };
        throw error;
    }
    return { exists: true, size: file.size, modified: file.lastModified, sha256: await hashFile(file, signal) };
}
export async function cleanupLocalStaging(root: LocalDirectory, job: TransferSummary, allowMissing = false) {
    let staging: LocalDirectory;
    try {
        staging = await ownedStaging(root, job, false);
    }
    catch (error) {
        if (absent(error) && allowMissing && !job.destination)
            return;
        if (absent(error))
            throw new Error(t('没有原任务暂存标记，不能确认已清理；请重新选择原目录。'));
        throw error;
    }
    const files: Array<[
        string,
        LocalDirectory
    ]> = [];
    for await (const [name, entry] of staging.entries()) {
        if (name === 'owner.json' && entry.kind === 'file')
            continue;
        const index = /^file-(\d+)$/u.exec(name);
        if (!index || Number(index[1]) >= job.count || entry.kind !== 'directory')
            throw new Error(t('暂存目录含未知项，未删除。'));
        files.push([name, entry]);
    }
    for (const [, directory] of files) {
        const state = await jsonFile<DownloadState>(directory, 'state.json');
        if (state.schema !== 1 || !state.id.startsWith(job.id + '-') || !Number.isSafeInteger(state.blocks) || state.blocks < 0)
            throw new Error(t('暂存清单身份错误，未删除。'));
        for await (const [name, entry] of directory.entries()) {
            const block = /^block-(\d+)\.bin$/u.exec(name);
            if (entry.kind !== 'file' || (name !== 'state.json' && (!block || Number(block[1]) > state.blocks)))
                throw new Error(t('暂存文件夹含未知项，未删除。'));
        }
    }
    for (const [name, directory] of files) {
        for await (const [entry] of directory.entries())
            await directory.removeEntry(entry);
        await staging.removeEntry(name);
    }
    // Keep the ownership receipt until the Host confirms Forget. A lost Host
    // acknowledgement can then retry cleanup without accepting a wrong folder.
}
export async function removeCleanupReceipt(root: LocalDirectory, job: TransferSummary) {
    let staging: LocalDirectory;
    try {
        staging = await ownedStaging(root, job, false);
    }
    catch (error) {
        if (absent(error) && !job.destination)
            return;
        throw error;
    }
    for await (const [name] of staging.entries())
        if (name !== 'owner.json')
            throw new Error(t('仍有暂存项，保留清理回执。'));
    await staging.removeEntry('owner.json');
    await root.removeEntry('.dsh-transfer-' + job.id);
}
