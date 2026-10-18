import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference';
export interface PreparedCandidate {
    row: FileReferenceCandidate;
    path: string;
    name: string;
    hidden: boolean;
    bytes: number;
}
export declare function prepareCandidate(row: FileReferenceCandidate): PreparedCandidate;
/** A max heap retains only the best K. Equal keys keep discovery order. */
export declare function rankPrepared(entries: readonly PreparedCandidate[], input: string, limit?: number, includeHidden?: boolean): FileReferenceCandidate[];
export declare function rankCandidates(entries: FileReferenceCandidate[], input: string, limit?: number, includeHidden?: boolean): FileReferenceCandidate[];
//# sourceMappingURL=file-ranking.d.ts.map