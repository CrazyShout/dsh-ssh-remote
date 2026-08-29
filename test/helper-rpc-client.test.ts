import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { DshRpcLineDecoder, encodeDshRpcFrame } from '../src/helper/framing.js';
import {
  RemoteHelperCallInterruptedError,
  RemoteHelperRpcClient,
  RemoteHelperRpcError,
} from '../src/helper/rpc-client.js';
import type { DshRpcFrame } from '../src/helper/protocol.js';

function hello(): DshRpcFrame {
  return {
    dshRpc: '1',
    method: 'server/hello',
    params: {
      protocol: { min: 1, max: 1 },
      helperVersion: '0.3.0',
      serverInstanceId: 'server-1',
      serverEpoch: 1,
      platform: { system: 'Linux', release: '6.8', machine: 'x86_64', python: '3.12' },
      capabilities: { fs: true },
      limits: { maxFrameBytes: 1_048_576 },
    },
  };
}

function createPeer() {
  const serverOutput = new PassThrough();
  const clientOutput = new PassThrough();
  const decoder = new DshRpcLineDecoder();
  const requests: DshRpcFrame[] = [];
  const handlers = new Set<(frame: DshRpcFrame) => void>();
  clientOutput.on('data', (chunk) => {
    for (const frame of decoder.push(chunk)) {
      requests.push(frame);
      for (const handler of handlers) handler(frame);
    }
  });
  const client = new RemoteHelperRpcClient({ readable: serverOutput, writable: clientOutput });
  return {
    client,
    requests,
    onRequest(handler: (frame: DshRpcFrame) => void) { handlers.add(handler); },
    send(frame: DshRpcFrame) { serverOutput.write(encodeDshRpcFrame(frame)); },
    end() { serverOutput.end(); },
  };
}

async function initialize(peer: ReturnType<typeof createPeer>): Promise<void> {
  peer.onRequest((frame) => {
    if ('method' in frame && frame.method === 'initialize' && 'id' in frame) {
      peer.send({
        dshRpc: '1',
        id: frame.id,
        result: {
          protocol: 1,
          session: {
            sessionId: 'session-1', clientId: 'client-1', resumeToken: 'resume-1',
            resumed: false, retentionMs: 120_000, serverEpoch: 1,
          },
          capabilities: { fs: true },
          limits: { maxFrameBytes: 1_048_576 },
        },
      });
    }
  });
  peer.send(hello());
  await peer.client.initialize({ clientId: 'client-1' });
}

describe('RemoteHelperClient', () => {
  it('handshakes, correlates calls, and publishes notifications', async () => {
    const peer = createPeer();
    await initialize(peer);
    const notifications = vi.fn();
    peer.client.onNotification(notifications);
    peer.onRequest((frame) => {
      if ('method' in frame && frame.method === 'health/ping' && 'id' in frame) {
        peer.send({ dshRpc: '1', id: frame.id, result: { pong: true } });
      }
    });

    await expect(peer.client.call('health/ping', { nonce: 'n' })).resolves.toEqual({ pong: true });
    peer.send({ dshRpc: '1', method: 'process/output', params: { processId: 'p1', seq: '1' } });
    expect(notifications).toHaveBeenCalledWith(expect.objectContaining({ method: 'process/output' }));
    expect(peer.client.sessionId).toBe('session-1');
    peer.client.close();
  });

  it('surfaces typed remote errors', async () => {
    const peer = createPeer();
    await initialize(peer);
    peer.onRequest((frame) => {
      if ('method' in frame && frame.method === 'fs/stat' && 'id' in frame) {
        peer.send({
          dshRpc: '1', id: frame.id,
          error: { code: 'NOT_FOUND', message: 'gone', retryable: false },
        });
      }
    });
    await expect(peer.client.call('fs/stat', {})).rejects.toBeInstanceOf(RemoteHelperRpcError);
    peer.client.close();
  });

  it('marks an in-flight mutation ambiguous on disconnect', async () => {
    const peer = createPeer();
    await initialize(peer);
    const pending = peer.client.call('fs/write', { operationId: 'op-1' }, { mutation: true });
    await vi.waitFor(() => {
      expect(peer.requests.some((frame) => 'method' in frame && frame.method === 'fs/write')).toBe(true);
    });
    peer.end();
    const error = await pending.catch((reason) => reason) as RemoteHelperCallInterruptedError;
    expect(error).toBeInstanceOf(RemoteHelperCallInterruptedError);
    expect(error.mutationMayHaveStarted).toBe(true);
  });
});
