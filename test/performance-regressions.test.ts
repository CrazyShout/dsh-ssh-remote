import { describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { prepareCandidate, rankPrepared } from '../src/file-ranking.js';
import { TransferManager } from '../src/transfers.js';
import { TransferStore } from '../src/transfer-store.js';
import { baselineRank } from './fixtures/ranking-baseline.mjs';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('bounded performance contracts', () => {
  it('matches the original order for 50k candidates, hidden paths, unicode and fuzzy matching', () => {
    const entries = Array.from({ length: 50_000 }, (_, i) => ({ path: `${i % 7 ? 'src' : '.cache'}/group-${i % 100}/component-${String(i).padStart(6, '0')}.tsx`, kind: 'file' as const }));
    entries.push(...['中文 空格.ts', 'src/.secret', 'İFILE', 'z.ts', 'README.md'].map(path => ({ path, kind: 'file' as const })));
    const prepared = entries.map(prepareCandidate);
    for (const query of ['', 'component', 'cpt', 'not-present', '中文', 'if', '.cache', '/.', 'README']) {
      for (const hidden of [false, true]) expect(rankPrepared(prepared, query, 50, hidden)).toEqual(baselineRank(entries, query, 50, hidden));
    }
  });
  it('reads one manifest page for 200 items but always reads fresh receipts', async () => {
    const store = new TransferStore('/not-used');
    const manifest = Array.from({ length: 200 }, (_, i) => ({ kind: 'file', path: `file-${i}`, size: 1 }));
    const read = vi.spyOn(store, 'read').mockImplementation(async (_id, name) => {
      if (name === 'manifest-0') return manifest;
      throw Object.assign(new Error('not present'), { code: 'ENOENT' });
    });
    const rows = []; for await (const row of store.scan({ id: randomUUID(), appended: 200, count: 200 } as any)) rows.push(row);
    expect(rows).toHaveLength(200); expect(read.mock.calls.filter(([, name]) => name === 'manifest-0')).toHaveLength(1);
    expect(read.mock.calls.filter(([, name]) => name.startsWith('file-'))).toHaveLength(200);
  });
  it('really overlaps two files, serializes the same file, then drains before pause and rejects late chunks', async () => {
    const id = randomUUID(), runId = randomUUID(), session = 'test';
    const data = Buffer.from('a'), hash = createHash('sha256').update(data).digest('hex');
    let active = 0, maximum = 0; const perFile = new Map<string, number>(), events: string[] = [];
    const client = { sessionId: session, call: async (method: string, p: any) => {
      if (method === 'transfer/write') {
        active++; maximum = Math.max(maximum, active); perFile.set(p.id, (perFile.get(p.id) ?? 0) + 1);
        expect(perFile.get(p.id)).toBe(1); events.push(`start:${p.id}`);
        await sleep(25); active--; perFile.set(p.id, 0); events.push(`done:${p.id}`);
        return { offset: p.offset + 1 };
      }
      expect(active).toBe(0); events.push(method); return { closed: true };
    } };
    const m = new TransferManager({ client: async () => client as any }, () => 'ssh://host/root');
    const job = { id, direction: 'upload', rootUri: 'ssh://host/root', installation: 'x', state: 'running', count: 2, appended: 2 } as any;
    vi.spyOn(m.store, 'job').mockImplementation(async () => ({ ...job }));
    vi.spyOn(m.store, 'file').mockImplementation(async (_job, index) => ({ id: `${id}-${index}`, path: `${index}`, index, size: 10, kind: 'file', offset: 0, state: 'transferring' }));
    vi.spyOn(m.store, 'saveFile').mockResolvedValue(); vi.spyOn(m.store, 'write').mockResolvedValue();
    vi.spyOn(m, 'page').mockImplementation(async () => ({ job: { ...job, live: false }, entries: [], next: 0, done: true }));
    (m as any).runs.set(id, { client, session, rootUri: job.rootUri, workspaceId: 'w', installation: 'x', run: runId, job: id, active: new Set([0, 1]), remaining: 2, lastActivity: Date.now() });
    const scope = { sessionId: 's', workspaceRoot: '/anchor' } as any;
    try {
      await Promise.all([m.upload(scope, id, 0, runId, 0, data, hash), m.upload(scope, id, 1, runId, 0, data, hash), m.upload(scope, id, 0, runId, 1, data, hash)]);
      expect(maximum).toBe(2);
      const writing = m.upload(scope, id, 0, runId, 2, data, hash);
      await sleep(1);
      const queued = expect(m.upload(scope, id, 0, runId, 3, data, hash)).rejects.toThrow('排队请求已取消');
      const pausing = m.control(scope, { id, run: runId, action: 'pause' });
      const late = expect(m.upload(scope, id, 1, runId, 1, data, hash)).rejects.toThrow('失效');
      await Promise.all([writing, queued, pausing, late]);
      expect(events.indexOf('transfer/pause')).toBeGreaterThan(events.lastIndexOf(`done:${id}-0`));
    } finally { await m.dispose(); }
  });
});
