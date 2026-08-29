import { TextDecoder } from 'node:util';
import { DSH_RPC_MAX_LINE_BYTES, DshRpcProtocolError, parseDshRpcFrame, } from './protocol.js';
/** Encode one RPC object as the protocol's bounded UTF-8 JSON line. */
export function encodeDshRpcFrame(frame, maxLineBytes = DSH_RPC_MAX_LINE_BYTES) {
    let json;
    try {
        json = JSON.stringify(frame);
    }
    catch (error) {
        throw new DshRpcProtocolError('RPC frame is not JSON serializable', { cause: error });
    }
    const line = Buffer.from(json, 'utf8');
    const wireBytes = line.length + 1;
    if (line.length === 0 || wireBytes > maxLineBytes) {
        throw new DshRpcProtocolError(`RPC frame is ${wireBytes} bytes; maximum is ${maxLineBytes}`);
    }
    return Buffer.concat([line, Buffer.from('\n')]);
}
/**
 * Incremental decoder for newline-delimited RPC frames. It retains at most one
 * bounded partial line; a peer cannot force unbounded buffering by omitting LF.
 */
export class DshRpcLineDecoder {
    maxLineBytes;
    buffered = Buffer.alloc(0);
    constructor(maxLineBytes = DSH_RPC_MAX_LINE_BYTES) {
        this.maxLineBytes = maxLineBytes;
        if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) {
            throw new Error('maxLineBytes must be a positive safe integer');
        }
    }
    push(chunk) {
        const incoming = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
        if (incoming.length === 0)
            return [];
        const combined = this.buffered.length === 0
            ? incoming
            : Buffer.concat([this.buffered, incoming], this.buffered.length + incoming.length);
        const frames = [];
        let begin = 0;
        for (;;) {
            const newline = combined.indexOf(0x0a, begin);
            if (newline === -1)
                break;
            let end = newline;
            if (end > begin && combined[end - 1] === 0x0d)
                end -= 1;
            const rawLength = end - begin;
            const wireLength = newline - begin + 1;
            if (rawLength === 0)
                throw new DshRpcProtocolError('empty RPC line');
            if (wireLength > this.maxLineBytes) {
                throw new DshRpcProtocolError(`RPC line exceeds ${this.maxLineBytes} bytes`);
            }
            frames.push(decodeLine(combined.subarray(begin, end)));
            begin = newline + 1;
        }
        this.buffered = combined.subarray(begin);
        if (this.buffered.length >= this.maxLineBytes) {
            this.buffered = Buffer.alloc(0);
            throw new DshRpcProtocolError(`unterminated RPC line exceeds ${this.maxLineBytes} bytes`);
        }
        return frames;
    }
    /** EOF is legal only on a frame boundary. */
    finish() {
        if (this.buffered.length !== 0) {
            const bytes = this.buffered.length;
            this.buffered = Buffer.alloc(0);
            throw new DshRpcProtocolError(`RPC stream ended with an unterminated ${bytes}-byte line`);
        }
    }
}
function decodeLine(line) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(line);
    }
    catch (error) {
        throw new DshRpcProtocolError('RPC line is not valid UTF-8', { cause: error });
    }
    let value;
    try {
        value = JSON.parse(text);
    }
    catch (error) {
        throw new DshRpcProtocolError('RPC line is not valid JSON', { cause: error });
    }
    return parseDshRpcFrame(value);
}
//# sourceMappingURL=framing.js.map