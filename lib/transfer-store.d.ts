import type { TransferEntry, TransferFile, TransferSummary } from 'dsh-ssh-remote/transfers';
export declare const TRANSFER_LIMIT: number;
export declare const TRANSFER_CHUNK: number;
export declare const TRANSFER_RETENTION: number;
export declare const TRANSFER_PAGE = 200;
export declare const TRANSFER_MAX_ENTRIES = 10000;
export declare const transferId: (id: string) => string;
export declare function transferBytes(value: number, limit?: number): number;
export declare function transferPath(path: string, empty?: boolean): string;
export declare function validateTransferEntries(entries: TransferEntry[]): void;
export interface StoredTransfer extends Omit<TransferSummary, 'live'> {
    schema: 1;
    installation: string;
    sessionId: string;
}
/** Immutable manifest pages and independent small file receipts avoid rewriting a 10k-entry manifest per chunk. */
export declare class TransferStore {
    readonly directory: string;
    constructor(directory: string);
    private privateDirectory;
    private path;
    create(job: StoredTransfer): Promise<void>;
    write(id: string, name: string, data: unknown, once?: boolean): Promise<void>;
    read<T>(id: string, name: string): Promise<T>;
    job(id: string): Promise<StoredTransfer>;
    list(): Promise<StoredTransfer[]>;
    manifest(job: StoredTransfer, index: number): Promise<TransferEntry>;
    /** Request-scoped immutable pages. Receipts remain fresh, never cached. */
    scan(job: StoredTransfer, start?: number, end?: number): AsyncGenerator<TransferFile>;
    file(job: StoredTransfer, index: number, entry?: TransferEntry | undefined): Promise<TransferFile>;
    saveFile(job: StoredTransfer, entry: TransferFile): Promise<void>;
    forget(id: string): Promise<void>;
}
//# sourceMappingURL=transfer-store.d.ts.map