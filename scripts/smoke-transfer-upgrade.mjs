// Tiny v1 manifest compatibility check across two explicitly supplied runtimes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { TransferManager } from '../lib/transfers.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
const [alias, previousRoot] = process.argv.slice(2);
if (!alias || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(alias) || !previousRoot?.startsWith('/')) throw new Error('Usage: node scripts/smoke-transfer-upgrade.mjs <alias> <previous-plugin-root>');
const { RemoteHelperManager: OldHelpers } = await import(pathToFileURL(join(previousRoot, 'lib/helper/manager.js')));
const { TransferManager: OldTransfers } = await import(pathToFileURL(join(previousRoot, 'lib/transfers.js')));
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000 });
const root = ssh('mktemp -d /tmp/dsh-transfer-upgrade.XXXXXXXX').trim(); assert.match(root, /^\/tmp\/dsh-transfer-upgrade\.[A-Za-z0-9]{8}$/u);
const local = await mkdtemp(join(tmpdir(), 'dsh-transfer-upgrade-'));
const scope = { sessionId: randomUUID(), workspaceRoot: '/upgrade-anchor' }, resolve = p => p === scope.workspaceRoot ? `ssh://${alias}${root}` : undefined;
let helpers = new OldHelpers({ aliasValidator: h => h === alias, healthIntervalMs: 0 });
let manager = new OldTransfers(helpers, resolve, () => {}, local);
const data = Buffer.from('M3_to_M4_resume_small_bytes\n'), hash = bytes => createHash('sha256').update(bytes).digest('hex'), id = randomUUID();
const begin = async run => { let result = await manager.file(scope, { id, run, index: 0, action: 'begin', sha256: hash(data) }); while (result.state === 'verifying') result = await manager.file(scope, { id, run, index: 0, action: 'verify' }); return result; };
try {
  const oldVersion = (await helpers.client(alias)).hello.helperVersion;
  await manager.plan(scope, { id, direction: 'upload', target: '', count: 1, totalBytes: data.length });
  await manager.append(scope, { id, after: 0, entries: [{ path: 'resume.txt', kind: 'file', size: data.length }] });
  const first = randomUUID(); await manager.control(scope, { id, run: first, action: 'resume' }); await begin(first);
  await manager.upload(scope, id, 0, first, 0, data.subarray(0, 8), hash(data.subarray(0, 8)));
  await manager.control(scope, { id, run: first, action: 'pause' }); await manager.dispose(); await helpers.dispose();
  helpers = new RemoteHelperManager({ aliasValidator: h => h === alias, healthIntervalMs: 0 }); manager = new TransferManager(helpers, resolve, () => {}, local);
  assert.equal((await manager.list(scope))[0].state, 'paused'); // no automatic execution
  const next = randomUUID(); await manager.control(scope, { id, run: next, action: 'resume' }); assert.equal((await begin(next)).file.offset, 8);
  await manager.upload(scope, id, 0, next, 8, data.subarray(8), hash(data.subarray(8)));
  await manager.file(scope, { id, run: next, index: 0, action: 'finish', sha256: hash(data) });
  assert.equal(ssh(`cat '${root}/resume.txt'`), data.toString());
  console.log(JSON.stringify({ previous: oldVersion, current: (await helpers.client(alias)).hello.helperVersion, bytes: data.length, preservedOffset: 8, sha256: hash(data), resumedOnlyAfterExplicitControl: true }, null, 2));
  await manager.control(scope, { id, run: next, action: 'forget' });
} finally { await manager.dispose(); await helpers.dispose(); ssh(`rm -rf -- '${root}'`); await rm(local, { recursive: true, force: true }); }
