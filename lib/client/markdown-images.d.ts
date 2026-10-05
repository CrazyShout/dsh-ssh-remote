import type { WorkspaceByteReadOptions, WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types';
type ReadResult = {
    ok: true;
    value: WorkspaceFileBytes;
} | {
    ok: false;
    error: {
        message: string;
    };
};
export type ReadImageBytes = (sessionId: string, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal) => Promise<ReadResult>;
export interface ImageCacheLimits {
    entries: number;
    imageBytes: number;
    totalBytes: number;
    concurrent: number;
    readTimeoutMs: number;
}
/** Decode authored filenames once; schemes never change the document's authority. */
export declare function imageFilePath(destination: string): string | undefined;
/** Per-document, session-owned image bytes. Never falls back to /api/file or the local Host. */
export declare class SessionImageCache {
    private readonly read;
    private readonly changed;
    private readonly dependency;
    private readonly urls;
    private readonly file;
    private readonly entries;
    private readonly lifetime;
    private running;
    private bytes;
    private limited;
    private disposed;
    private stalled;
    readonly limits: ImageCacheLimits;
    constructor(resourceAddress: string, read: ReadImageBytes, changed: () => void, dependency?: (address: string) => void, limits?: Partial<ImageCacheLimits>, urls?: {
        create: (blob: Blob) => string;
        revoke: (url: string) => void;
    });
    get(destination: string): string | undefined;
    get failed(): boolean;
    /** Called after React commits, never from the Markdown resolver's render pass. */
    request(destinations: Iterable<string>): void;
    dispose(): void;
    private pump;
    private load;
}
export {};
//# sourceMappingURL=markdown-images.d.ts.map