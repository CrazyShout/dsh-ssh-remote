import type { TransferEntry, TransferFile, TransferSummary } from './transfer-types.js';
export declare const BYTE_LIMIT: number, CHUNK_BYTES: number, BLOCK_BYTES: number;
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
    entries(): AsyncIterable<[string, LocalDirectory | LocalFileHandle]>;
    removeEntry(name: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
}
export declare const excludedPath: (path: string) => boolean;
export declare const hexHash: (bytes: Uint8Array) => string;
export declare function readLocalChunk(file: Blob, offset: number, signal: AbortSignal): Promise<Uint8Array>;
export declare function localPath(path: string): string[];
export declare function hashFile(file: Blob, signal: AbortSignal, progress?: (bytes: number) => void): Promise<string>;
export declare function validateLocalManifest(files: LocalFile[]): void;
export declare function selectedFiles(files: Iterable<File>): LocalFile[];
export declare function directoryFiles(root: LocalDirectory): Promise<LocalFile[]>;
export declare function pickLocalDirectory(mode: 'read' | 'readwrite'): Promise<LocalDirectory>;
export declare function localDirectory(root: LocalDirectory, path: string, create?: boolean): Promise<LocalDirectory>;
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
export declare function ownedStaging(root: LocalDirectory, job: TransferSummary, create: boolean): Promise<LocalDirectory>;
export declare function bindDownloadDirectory(root: LocalDirectory, job: TransferSummary): Promise<string>;
export declare function downloadPath(job: TransferSummary, file: TransferEntry): string;
/** Closed 4 MiB files survive a browser restart; no unclosed FSA write stream is used as a checkpoint. */
export declare class DownloadStaging {
    readonly directory: LocalDirectory;
    readonly state: DownloadState;
    private readonly destination;
    private readonly name;
    private hash;
    private pending;
    private pendingBytes;
    private constructor();
    static open(root: LocalDirectory, job: TransferSummary, file: TransferFile, replace: boolean, signal: AbortSignal): Promise<DownloadStaging>;
    get offset(): number;
    get digest(): string;
    append(bytes: Uint8Array): Promise<void>;
    checkpoint(): Promise<void>;
    publish(signal: AbortSignal): Promise<void>;
}
export declare function cleanupLocalStaging(root: LocalDirectory, job: TransferSummary, allowMissing?: boolean): Promise<void>;
export declare function removeCleanupReceipt(root: LocalDirectory, job: TransferSummary): Promise<void>;
export {};
//# sourceMappingURL=transfer-local.d.ts.map