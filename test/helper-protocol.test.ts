import { describe, expect, it } from 'vitest';
import {
  DSH_RPC_VERSION,
  assertProtocolCompatible,
  parseDshRpcFrame,
  parseInitializeResult,
  parseServerHello,
} from '../src/helper/protocol.js';

const helloFrame = {
  dshRpc: DSH_RPC_VERSION,
  method: 'server/hello',
  params: {
    protocol: { min: 1, max: 1 },
    helperVersion: '0.3.0',
    serverInstanceId: 'server-1',
    serverEpoch: 2,
    platform: { system: 'Linux', release: '6.8', machine: 'x86_64', python: '3.12' },
    capabilities: { fs: true, process: true },
    limits: { maxFrameBytes: 1_048_576 },
  },
} as const;

describe('helper protocol', () => {
  it('validates server hello and protocol compatibility', () => {
    const frame = parseDshRpcFrame(helloFrame);
    expect('method' in frame && frame.method).toBe('server/hello');
    const hello = parseServerHello(frame as never);
    expect(hello.helperVersion).toBe('0.3.0');
    expect(() => assertProtocolCompatible(hello)).not.toThrow();
  });

  it('rejects incompatible or malformed wire objects', () => {
    const hello = parseServerHello(parseDshRpcFrame(helloFrame) as never);
    expect(() => assertProtocolCompatible({ ...hello, protocol: { min: 2, max: 3 } }))
      .toThrow(/does not include 1/u);
    expect(() => parseDshRpcFrame({ dshRpc: '2', id: 1, result: null }))
      .toThrow(/unsupported dshRpc/u);
    expect(() => parseDshRpcFrame({ dshRpc: '1', id: 1, result: null, error: {} }))
      .toThrow(/exactly one/u);
  });

  it('validates initialize session identity and capabilities', () => {
    const result = parseInitializeResult({
      protocol: 1,
      session: {
        sessionId: 'session-1',
        clientId: 'client-1',
        resumeToken: 'resume-1',
        resumed: false,
        retentionMs: 120_000,
        serverEpoch: 2,
      },
      capabilities: { fs: true },
      limits: { maxFrameBytes: 1_048_576 },
    });
    expect(result.session.sessionId).toBe('session-1');
    expect(result.capabilities.fs).toBe(true);
  });
});

