import { File } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { TransferModel } from '../client/transfer-model.js';
import { CHUNK_BYTES, hexHash, selectedFiles } from '../client/transfer-local.js';
import type { TransferFile, TransferSummary, TransferRemote } from '../shared/transfers.js';

function fixture() {
  let job: TransferSummary, files: TransferFile[] = [], current = '', failOnce = false;
  const data = new Map<number, Uint8Array[]>(), sessions: string[] = [], offsets: number[] = [];
  const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value: structuredClone(value) });
  const page = () => ({ job, entries: files, next: files.length, done: true });
  const remote: TransferRemote = {
    list: async session => { sessions.push(session); return ok(job ? [job] : []); },
    plan: async (session, request) => { sessions.push(session); job = { ...request, rootUri: 'ssh://host/test', alias: 'host', count: request.count!, appended: 0, totalBytes: request.totalBytes!, created: 1, updated: 1, nonce: 'test-fixture-nonce', state: 'preparing', live: false }; return ok(page()); },
    append: async (_session, request) => { files = request.entries.map((entry, index) => ({ ...entry, index, id: `${job.id}-${index}`, offset: 0, state: entry.kind === 'excluded' ? 'skipped' : 'queued' })); job.appended = files.length; job.state = 'ready'; return ok(page()); },
    page: async session => { sessions.push(session); return ok(page()); },
    control: async (session, request) => {
      sessions.push(session);
      if (request.action === 'resume') { current = request.run; job.live = true; job.state = 'running'; }
      if (request.action === 'pause') { if (current !== request.run) throw new Error('owner'); job.live = false; job.state = 'paused'; }
      return ok(page());
    },
    file: async (session, request) => {
      sessions.push(session); if (current !== request.run) throw new Error('owner'); const file = files[request.index];
      if (request.action === 'begin') {
        if (file.sha256 && file.sha256 !== request.sha256) throw new Error('changed');
        file.sha256 = request.sha256; file.state = 'verifying';
      } else if (request.action === 'verify') file.state = 'transferring';
      else if (request.action === 'finish') {
        const content = Buffer.concat(data.get(file.index) ?? []); if (hexHash(content) !== request.sha256) throw new Error('checksum');
        file.state = 'complete'; if (files.every(row => row.state === 'complete')) { job.live = false; job.state = 'complete'; }
      }
      return ok({ file, state: file.state === 'verifying' ? 'verifying' : file.state === 'complete' ? 'complete' : 'active', prefix: hexHash(Buffer.concat(data.get(file.index) ?? [])) });
    },
  };
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input), 'http://test'), index = Number(url.searchParams.get('index')), offset = Number(url.searchParams.get('offset'));
    sessions.push(url.searchParams.get('sessionId')!); offsets.push(offset);
    const chunk = options!.body as Uint8Array; expect(chunk.length).toBeLessThanOrEqual(CHUNK_BYTES);
    if (offset === files[index].offset) { data.set(index, [...(data.get(index) ?? []), chunk.slice()]); files[index].offset += chunk.length; }
    if (failOnce) { failOnce = false; throw new TypeError('lost acknowledgement'); }
    return Response.json(files[index]);
  };
  return { remote, fetcher, files: () => files, job: () => job, sessions, offsets, failAck: () => { failOnce = true; }, data };
}
describe('human transfer client execution', () => {
  it('hashes and streams small chunks, replays only an identical lost chunk, and retains its original Session', async () => {
    const f = fixture(), model = new TransferModel('original-session', f.remote, f.fetcher), bytes = new Uint8Array(CHUNK_BYTES * 2 + 3).fill(29);
    model.select(selectedFiles([new File([bytes], '中文 spaces.bin') as any])); await model.plan('upload', '');
    expect(f.job().state).toBe('ready'); expect(f.offsets).toEqual([]);
    f.failAck(); await model.start(f.job(), false);
    expect(f.offsets).toEqual([0, 0, CHUNK_BYTES, CHUNK_BYTES * 2]);
    expect(f.job().state).toBe('complete'); expect(new Set(f.sessions)).toEqual(new Set(['original-session']));
    expect(Buffer.concat(f.data.get(0)!).equals(Buffer.from(bytes))).toBe(true); await model.dispose();
  });
  it('does not resume a persisted upload without manual re-selection, or with changed bytes', async () => {
    const f = fixture(), first = new TransferModel('s', f.remote, f.fetcher);
    first.select(selectedFiles([new File(['first'], 'a') as any])); await first.plan('upload', ''); await first.dispose();
    const second = new TransferModel('s', f.remote, f.fetcher); await second.refresh();
    expect(f.offsets).toEqual([]); await second.start(f.job(), false); expect(second.snapshot().error).toContain('重新选择');
    f.files()[0].sha256 = hexHash(new TextEncoder().encode('first'));
    second.select(selectedFiles([new File(['other'], 'a') as any])); await second.start(f.job(), false);
    expect(second.snapshot().error).toContain('已改变'); expect(f.offsets).toEqual([]); expect(f.job().state).toBe('paused'); await second.dispose();
  });
  it('waits for in-flight cleanup when paused and never sends later chunks', async () => {
    const f = fixture(); let entered!: () => void; const barrier = new Promise<void>(resolve => { entered = resolve; });
    const fetcher: typeof fetch = async (_url, options) => { entered(); return new Promise((_resolve, reject) => { options!.signal!.addEventListener('abort', () => reject(new DOMException('paused', 'AbortError')), { once: true }); }); };
    const model = new TransferModel('s', f.remote, fetcher);
    model.select(selectedFiles([new File([new Uint8Array(CHUNK_BYTES + 1)], 'a') as any])); await model.plan('upload', '');
    const transfer = model.start(f.job(), false); await barrier; await model.pause(); await transfer;
    expect(f.job().state).toBe('paused'); expect(f.files()[0].offset).toBe(0); expect(model.snapshot().active).toBeUndefined(); await model.dispose();
  });
});
