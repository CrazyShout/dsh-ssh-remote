import { describe, expect, it } from 'vitest';
import { DshRpcLineDecoder, encodeDshRpcFrame } from '../src/helper/framing.js';

describe('helper JSON-line framing', () => {
  it('decodes arbitrarily split UTF-8 frames in order', () => {
    const first = encodeDshRpcFrame({ dshRpc: '1', id: '1', method: 'health/ping', params: { nonce: '🙂' } });
    const second = encodeDshRpcFrame({ dshRpc: '1', id: '1', result: { pong: true } });
    const wire = Buffer.concat([first, second]);
    const decoder = new DshRpcLineDecoder();
    const frames = [
      ...decoder.push(wire.subarray(0, 7)),
      ...decoder.push(wire.subarray(7, 19)),
      ...decoder.push(wire.subarray(19)),
    ];
    decoder.finish();
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ method: 'health/ping' });
    expect(frames[1]).toMatchObject({ result: { pong: true } });
  });

  it('fails before retaining an oversized unterminated line', () => {
    const decoder = new DshRpcLineDecoder(32);
    expect(() => decoder.push(Buffer.alloc(33, 0x61))).toThrow(/exceeds 32/u);
  });

  it('rejects invalid UTF-8, invalid JSON and truncated EOF', () => {
    expect(() => new DshRpcLineDecoder().push(Buffer.from([0xff, 0x0a]))).toThrow(/UTF-8/u);
    expect(() => new DshRpcLineDecoder().push('{oops}\n')).toThrow(/valid JSON/u);
    const decoder = new DshRpcLineDecoder();
    decoder.push('{"dshRpc":"1"');
    expect(() => decoder.finish()).toThrow(/unterminated/u);
  });
});

