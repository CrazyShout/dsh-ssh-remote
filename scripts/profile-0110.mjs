import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { prepareCandidate, rankPrepared } from '../lib/file-ranking.js';
import { baselineRank } from '../test/fixtures/ranking-baseline.mjs';
const entries = Array.from({ length: 50_000 }, (_, i) => ({ path: `src/group-${i % 100}/component-${String(i).padStart(6, '0')}.tsx`, kind: 'file' }));
const prepared = entries.map(prepareCandidate);
function measure(run) { const samples = []; for (let i = 0; i < 32; i++) { const start = performance.now(); run(); if (i >= 8) samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b); return { p50: samples[12], p95: samples[22] }; }
const results = ['component', 'cpt', 'no-such-file'].map(query => {
  assert.deepEqual(rankPrepared(prepared, query), baselineRank(entries, query));
  const before = measure(() => baselineRank(entries, query)), after = measure(() => rankPrepared(prepared, query));
  return { query, before, after, p95Reduction: 1 - after.p95 / before.p95 };
});
const report = { node: process.version, platform: process.platform, entries: entries.length, synthetic: true,
  preparedBytes: prepared.reduce((n, row) => n + row.bytes, 0), results, instrumentation: 'Standalone runner; no production timing probes.' };
mkdirSync('profile_output', { recursive: true }); writeFileSync('profile_output/0110-ranking.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert(results.every(row => row.p95Reduction >= .3), 'P95 improvement target is at least 30%');
