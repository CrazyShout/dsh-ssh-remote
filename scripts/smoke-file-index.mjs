// Explicit opt-in; writes only a newly allocated remote temporary directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { formatFileMention } from '@deepseek-ai/dsh-file-reference';
import { HelperRemoteFileSystem } from '../lib/helper-fs.js';
import { RemoteFileIndex } from '../lib/file-index.js';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
const alias = process.argv[2], keep = process.argv[3] === '--keep-ui-fixture';
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-file-index.mjs <alias> [--keep-ui-fixture]');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const root = ssh('mktemp -d /tmp/dsh-index-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-index-smoke\.[a-zA-Z0-9]{8}$/);
const uri = `ssh://${alias}${root}`, resolve = path => path === '/index-anchor' ? uri : undefined;
const helpers = new RemoteHelperManager({ aliasValidator: value => value === alias, healthIntervalMs: 0 });
const index = new RemoteFileIndex(helpers, resolve), fs = new HelperRemoteFileSystem(helpers, resolve);
const scope = { sessionId: `index-smoke-${randomUUID()}`, workspaceRoot: '/index-anchor' };
const signal = new AbortController().signal;
let passed = false;
try {
  for (const [path, text] of [['中文 space.txt', 'M1_REMOTE_INDEX_MARKER_20261013\n来自 hk-wsl 的真实文件\n'],
    ['.gitignore', '*.log\n'], ['ignored.log', 'IGNORED_REMOTE_MARKER\n'], ['tracked.log', 'TRACKED_IGNORED_MARKER\n'],
    ['quote"name.txt', 'UNREPRESENTABLE\n']]) {
    await fs.writeText(await fs.resolve(`${uri}/${path}`), text, { kind: 'createIfAbsent' }, undefined,
      { mode: 'workspace-write', workspaceRoot: scope.workspaceRoot });
  }
  ssh(`git -C '${root}' init -q && git -C '${root}' add -f tracked.log`);
  const result = await index.query(scope, 'space', false, signal);
  assert.equal(result.state, 'ready'); assert.equal(result.complete, true);
  const selected = result.candidates.find(row => row.path === '中文 space.txt'); assert.ok(selected);
  assert.equal(formatFileMention(selected), '@"中文 space.txt"');
  const target = await fs.resolve(selected.path, { cwd: uri });
  const content = await fs.readText(target);
  assert.ok(JSON.stringify(content).includes('M1_REMOTE_INDEX_MARKER_20261013'));
  assert.equal((await index.query(scope, 'ignored.log', false, signal)).candidates.length, 0);
  assert.equal((await index.query(scope, 'ignored.log', true, signal)).candidates[0].path, 'ignored.log');
  assert.equal((await index.query(scope, 'tracked.log', false, signal)).candidates[0].path, 'tracked.log');
  index.invalidate(scope.workspaceRoot);
  assert.equal(index.status(scope, false).stale, true);
  assert.equal((await index.query(scope, 'space', false, signal)).state, 'ready');
  passed = true;
  console.log(JSON.stringify({ alias, root, passed, retainedForUi: keep,
    checks: ['Git discovery', 'ignore modes', 'tracked ignored file', 'official mention grammar', 'standard remote read marker', 'refresh'],
    completedAt: new Date().toISOString() }, null, 2));
} finally {
  await index.dispose(); await helpers.dispose();
  if (!keep || !passed) ssh(`rm -rf -- '${root}'`);
}
