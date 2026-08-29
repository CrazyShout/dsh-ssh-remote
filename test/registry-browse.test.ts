import { describe, expect, it } from 'vitest';
import type { SFTPWrapper } from 'ssh2';
import { SshRemoteService } from '../src/registry.js';

describe('remote workspace directory browsing', () => {
  it('streams a huge directory through a bounded handle and closes it when truncated', async () => {
    const totalEntries = 6000;
    const chunkSize = 256;
    let offset = 0;
    let readCalls = 0;
    let closeCalls = 0;
    let pathReaddirCalls = 0;
    const handle = Buffer.from('directory-handle');
    const directoryStats = {
      mtime: 1,
      size: 0,
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
    };
    const sftp = {
      realpath(path: string, callback: (error: Error | undefined, resolved?: string) => void) {
        queueMicrotask(() => callback(undefined, path === '.' ? '/home/test' : '/data'));
      },
      stat(_path: string, callback: (error: Error | undefined, value?: unknown) => void) {
        queueMicrotask(() => callback(undefined, directoryStats));
      },
      opendir(path: string, callback: (error: Error | undefined, value?: Buffer) => void) {
        queueMicrotask(() => {
          if (path !== '/data') callback(new Error('unexpected path'));
          else callback(undefined, handle);
        });
      },
      readdir(location: string | Buffer, callback: (error: Error | undefined, rows?: unknown[]) => void) {
        if (typeof location === 'string') {
          pathReaddirCalls += 1;
          queueMicrotask(() => callback(new Error('unbounded path readdir used')));
          return;
        }
        readCalls += 1;
        queueMicrotask(() => {
          if (offset >= totalEntries) {
            callback(Object.assign(new Error('EOF'), { code: 1 }));
            return;
          }
          const end = Math.min(totalEntries, offset + chunkSize);
          const rows = Array.from({ length: end - offset }, (_, index) => ({
            filename: `dir-${String(offset + index).padStart(5, '0')}`,
            attrs: directoryStats,
          }));
          offset = end;
          callback(undefined, rows);
        });
      },
      close(value: Buffer, callback: (error?: Error) => void) {
        queueMicrotask(() => {
          expect(value).toBe(handle);
          closeCalls += 1;
          callback();
        });
      },
    } as unknown as SFTPWrapper;
    const connections = {
      async transport() {
        return {
          async sftp<T>(operation: (value: SFTPWrapper) => Promise<T>): Promise<T> {
            return operation(sftp);
          },
        };
      },
    };
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService;
    Object.defineProperty(service, 'connections', { value: connections });

    const listing = await (service as any).browseWithLegacySftp('gpu', '/data');

    expect(listing.entries).toHaveLength(1000);
    expect(listing.truncated).toBe(true);
    expect(pathReaddirCalls).toBe(0);
    expect(readCalls).toBeLessThan(Math.ceil(totalEntries / chunkSize));
    expect(closeCalls).toBe(1);
  });

  it('uses helper workspace handles and returns only bounded directory choices', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const client = {
      hello: { platform: { home: '/home/test' } },
      async call(method: string, params: Record<string, unknown>) {
        calls.push({ method, params });
        if (method === 'workspace/open') {
          return { workspaceId: 'workspace-1', path: '/data', access: 'read-only' };
        }
        if (method === 'fs/list') {
          return {
            entries: [
              { name: 'src', metadata: { type: 'directory' } },
              { name: '.cache', metadata: { type: 'directory' } },
              { name: 'README.md', metadata: { type: 'file' } },
              { name: 'link', metadata: { type: 'symlink' } },
            ],
            truncated: false,
          };
        }
        if (method === 'workspace/close') return { closed: true };
        throw new Error(`unexpected method ${method}`);
      },
    };
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService;
    Object.defineProperty(service, 'helpers', {
      value: { async client() { return client; } },
    });

    const listing = await (service as any).browseWithHelper('gpu', '/data');

    expect(listing).toMatchObject({ path: '/data', home: '/home/test', truncated: false });
    expect(listing.entries).toEqual([
      { name: '.cache', path: '/data/.cache', hidden: true },
      { name: 'src', path: '/data/src', hidden: false },
    ]);
    expect(calls.map((call) => call.method)).toEqual(['workspace/open', 'fs/list', 'workspace/close']);
    expect(calls[1].params).toEqual({
      workspaceId: 'workspace-1',
      path: '',
      limit: 1000,
      allowTruncated: true,
      types: ['directory'],
    });
  });
});
