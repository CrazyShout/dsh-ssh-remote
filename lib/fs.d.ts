import { Context } from '@deepseek-ai/cordis';
import FileSystem, { FsVersion, type FsDirEntry, type FsEditOutcome, type FsEditRequest, type FsInfo, type FsPathInfo, type FsTarget, type FsWriteIntent, type FsWriteOutcome } from '@deepseek-ai/dsh-fs';
import { SshConnectionManager } from './connection.js';
/** Remote `ssh://` filesystem provider: implements the FileSystem seam over SFTP. */
export declare class RemoteFileSystem extends FileSystem {
    private readonly connections;
    /** Default base for relative-path resolution: the workspace's ssh:// root. */
    private readonly baseUri;
    constructor(ctx: Context, connections: SshConnectionManager, baseUri: string);
    get sandboxMode(): undefined;
    resolve(path: string, opts?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<FsTarget>;
    processPath(target: FsTarget): string;
    fileUrl(target: FsTarget): string;
    contains(parent: FsTarget, child: FsTarget): boolean;
    stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>;
    lstat(path: string, opts?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<FsPathInfo | undefined>;
    readText(target: FsTarget, signal?: AbortSignal): Promise<string>;
    streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>;
    readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, _sandboxPolicy?: unknown): Promise<FsWriteOutcome>;
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, _sandboxPolicy?: unknown): Promise<FsEditOutcome>;
    private parseTargetPath;
    private split;
    private sftp;
    private readFile;
    private writeFile;
    private tryUnlink;
    private statOrAbsent;
    private mapError;
}
//# sourceMappingURL=fs.d.ts.map