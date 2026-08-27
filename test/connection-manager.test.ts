import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import { SshConnectionManager } from '../src/connection.js';

class FakeClient extends EventEmitter {
  readonly connect = vi.fn((_config: ConnectConfig) => {
    queueMicrotask(() => this.emit('ready'));
  });
  readonly end = vi.fn();
  readonly sftp = vi.fn((callback: (error: Error | undefined, sftp: SFTPWrapper) => void) => {
    callback(undefined, { end: vi.fn() } as unknown as SFTPWrapper);
  });
}

describe('SshConnectionManager lifecycle', () => {
  it('single-flights concurrent first callers through one config resolution and client', async () => {
    const client = new FakeClient();
    const resolveConnectConfig = vi.fn(async () => ({
      config: { host: 'example.com', port: 22, username: 'atlas' } as ConnectConfig,
    }));
    const manager = new SshConnectionManager(undefined, {
      resolveConnectConfig,
      createClient: () => client as unknown as Client,
    });
    try {
      const [first, second] = await Promise.all([
        manager.transport('ssh://dev/home/atlas/a'),
        manager.transport('ssh://dev/home/atlas/b'),
      ]);
      expect(first.hostKey).toBe(second.hostKey);
      expect(resolveConnectConfig).toHaveBeenCalledTimes(1);
      expect(client.connect).toHaveBeenCalledTimes(1);
    } finally {
      await manager.dispose();
    }
  });

  it('unblocks a pending caller when the connection is explicitly closed', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const manager = new SshConnectionManager(undefined, {
      resolveConnectConfig: async () => {
        await gate;
        return { config: { host: 'example.com', port: 22, username: 'atlas' } as ConnectConfig };
      },
      createClient: () => new FakeClient() as unknown as Client,
    });
    const pending = manager.transport('ssh://dev/home/atlas/project');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    await manager.close('ssh://dev/home/atlas/project');
    await expect(pending).rejects.toThrow(/closed|failed/u);
    release();
    await manager.dispose();
  });
});
