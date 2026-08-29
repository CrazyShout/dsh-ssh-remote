import { type DshRpcFrame } from './protocol.js';
/** Encode one RPC object as the protocol's bounded UTF-8 JSON line. */
export declare function encodeDshRpcFrame(frame: DshRpcFrame, maxLineBytes?: number): Buffer;
/**
 * Incremental decoder for newline-delimited RPC frames. It retains at most one
 * bounded partial line; a peer cannot force unbounded buffering by omitting LF.
 */
export declare class DshRpcLineDecoder {
    private readonly maxLineBytes;
    private buffered;
    constructor(maxLineBytes?: number);
    push(chunk: Buffer | Uint8Array | string): DshRpcFrame[];
    /** EOF is legal only on a frame boundary. */
    finish(): void;
}
//# sourceMappingURL=framing.d.ts.map