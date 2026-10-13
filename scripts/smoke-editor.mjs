// Explicitly opt-in. Only a new mktemp directory on the supplied SSH alias is written.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { SshRemoteEditor } from '../lib/editor.js';
import { HelperRemoteFileSystem } from '../lib/helper-fs.js';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';

const alias = process.argv[2];
const keep = process.argv[3] === '--keep-ui-fixture';
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-editor.mjs <alias> [--keep-ui-fixture]');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const root = ssh('mktemp -d /tmp/dsh-editor-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-editor-smoke\.[a-zA-Z0-9]{8}$/);
const uri = `ssh://${alias}${root}`;
const manager = new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0 });
const context = new Context();
const resolve = path => path === '/editor-anchor' ? uri : undefined;
const editor = new SshRemoteEditor(context, manager, resolve);
const scope = { sessionId: `editor-smoke-${randomUUID()}`, workspaceRoot: '/editor-anchor' };
const signal = new AbortController().signal;
let passed = false;
try {
  const fs = new HelperRemoteFileSystem(manager, resolve);
  const target = await fs.resolve(`${uri}/中文 space.txt`);
  await fs.writeText(target, '\ufeffM1 editor acceptance\r\n中文内容\r\n', { kind: 'createIfAbsent' }, undefined,
    { mode: 'workspace-write', workspaceRoot: scope.workspaceRoot });
  const snapshot = await editor.read(scope, '中文 space.txt', signal);
  assert.equal(snapshot.newline, 'crlf'); assert.equal(snapshot.bom, true);
  const request = { ...snapshot, text: snapshot.text + 'saved by editor\n', operationId: randomUUID() };
  assert.equal((await editor.save(scope, request)).state, 'saved');
  assert.equal((await editor.save(scope, { ...snapshot, text: 'stale writer', operationId: randomUUID() })).state, 'conflict');
  assert.equal((await editor.read(scope, snapshot.path, signal)).text, request.text);
  assert.equal((await editor.status(scope, request.operationId, signal)).state, 'saved');
  await assert.rejects(editor.read(scope, '/etc/passwd', signal));
  const health = await (await manager.client(alias)).call('health/status');
  assert.equal(health.openingWorkspaces ?? 0, 0);
  passed = true;
  console.log(JSON.stringify({ alias, root, passed, retainedForUi: keep, checks: ['complete strong read', 'BOM/CRLF', 'guarded save', 'stale conflict', 'receipt', 'outside-root refusal'], completedAt: new Date().toISOString() }, null, 2));
} finally {
  await context.fiber.dispose(); await manager.dispose();
  if (!keep || !passed) ssh(`rm -rf -- '${root}'`);
}
