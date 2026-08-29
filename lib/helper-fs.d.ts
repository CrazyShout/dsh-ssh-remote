import { FsVersion, type FsDirEntry, type FsEditOutcome, type FsEditRequest, type FsInfo, type FsPathInfo, type FsTarget, type FsWriteIntent, type FsWriteOutcome } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox';
import { type RemoteHelperClient } from './helper/rpc-client.js';
import type { RemotePathResolver } from './runtime-router.js';
export interface RemoteHelperProvider {
    client(uri: string, signal?: AbortSignal): Promise<RemoteHelperClient>;
}
/**
 * FileSystem-shaped adapter backed by the versioned OpenSSH helper. It is a
 * plain adapter rather than a forged Cordis Service instance.
 */
export declare class HelperRemoteFileSystem {
    private readonly helpers;
    private readonly resolveRemotePath;
    private readonly workspaces;
    constructor(helpers: RemoteHelperProvider, resolveRemotePath: RemotePathResolver);
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
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
    private read;
    private readBeforeText;
    private write;
    private mutationScope;
    private scope;
    private parseTargetPath;
    private split;
    private target;
}
//# sourceMappingURL=helper-fs.d.ts.map