/** Paired synthetic ranking check against the immutable rollback release. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as candidate from '../lib/file-ranking.js';

const reference = 'v0.12.0';
const code = execFileSync('git', ['show', `${reference}:lib/file-ranking.js`], { encoding: 'utf8' });
const baseline = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const entries = Array.from({ length: 50_000 }, (_, i) => ({
  path: `src/group-${i % 100}/component-${String(i).padStart(6, '0')}.tsx`, kind: 'file',
}));
const oldRows = entries.map(baseline.prepareCandidate), newRows = entries.map(candidate.prepareCandidate);
const percentile = (rows, fraction) => [...rows].sort((a, b) => a - b)[Math.ceil(rows.length * fraction) - 1];
const results = ['component', 'cpt', 'no-such-file'].map(query => {
  assert.deepEqual(candidate.rankPrepared(newRows, query), baseline.rankPrepared(oldRows, query));
  const before = [], after = [];
  const measure = (run, samples, warm) => {
    const start = performance.now(); run();
    if (!warm) samples.push(performance.now() - start);
  };
  for (let i = 0; i < 60; i++) {
    const oldRun = () => measure(() => baseline.rankPrepared(oldRows, query), before, i < 12);
    const newRun = () => measure(() => candidate.rankPrepared(newRows, query), after, i < 12);
    if (i % 2) { newRun(); oldRun(); } else { oldRun(); newRun(); }
  }
  const oldP95 = percentile(before, .95), newP95 = percentile(after, .95);
  return { query, samples: before.length, baselineP50: percentile(before, .5), baselineP95: oldP95,
    candidateP50: percentile(after, .5), candidateP95: newP95, ratio: newP95 / oldP95,
    reviewRequired: newP95 > oldP95 * 1.10 };
});
const report = { reference, node: process.version, platform: process.platform, entries: entries.length,
  synthetic: true, results, instrumentation: [
    { file: 'scripts/profile-0130.mjs', change: 'Standalone runner; no production probes.' },
    { file: 'profile_output/0130-ranking.json', change: 'Generated paired timing report; ignored by Git.' },
  ], boundary: 'CPU ranking only. Not an SSH throughput or network-latency benchmark.' };
mkdirSync('profile_output', { recursive: true });
writeFileSync('profile_output/0130-ranking.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
