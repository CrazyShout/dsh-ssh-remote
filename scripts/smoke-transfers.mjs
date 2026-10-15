// Explicit opt-in. Small fixtures only; never allocates a large/sparse boundary-test file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, open, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { TransferManager } from '../lib/transfers.js';

const [alias, directory] = process.argv.slice(2);
if (!alias || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(alias) || !directory?.startsWith('/')) throw new Error('Usage: node scripts/smoke-transfers.mjs <alias> <private-artifact-directory> [--keep-ui]');
const keep = process.argv.includes('--keep-ui');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000 });
const root = ssh('mktemp -d /tmp/dsh-transfers-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-transfers-smoke\.[a-zA-Z0-9]{8}$/u);
await mkdir(directory, { recursive: true, mode: 0o700 });
const local = await mkdtemp(join(directory, 'transfer-fixtures-'));
const source = join(local, '上传目录'), destination = join(local, '下载目录');
await mkdir(source, { mode: 0o700 }); await mkdir(destination, { mode: 0o700 }); await mkdir(join(source, '空目录'), { mode: 0o700 });
const path = join(source, '8MiB 中文 sample.bin'), file = await open(path, 'wx', 0o600), hash = createHash('sha256');
try { for (let i = 0; i < 32; i++) { const block = randomBytes(262144); hash.update(block); await file.write(block); } await file.sync(); } finally { await file.close(); }
await writeFile(join(source, 'hello world.txt'), 'DSH_M3_SMALL_REMOTE_TRANSFER\n中文 / spaces\n', { mode: 0o600 });
await writeFile(join(source, '.env'), 'FAKE_EXCLUDED_FIXTURE=1\n', { mode: 0o600 });
const helpers = new RemoteHelperManager({ aliasValidator: host => host === alias, healthIntervalMs: 0 });
const scope = { sessionId: randomUUID(), workspaceRoot: '/smoke-anchor' };
let manager = new TransferManager(helpers, p => p === scope.workspaceRoot ? `ssh://${alias}${root}` : undefined, () => {}, join(local, 'host-state'));
const data = Buffer.from('DSH_M3_PROTOCOL_PAUSE_RESTART\n'), checksum = createHash('sha256').update(data).digest('hex'), id = randomUUID();
const begin = async run => {
  let r = await manager.file(scope, { id, run, index: 0, action: 'begin', sha256: checksum });
  while (r.state === 'verifying') r = await manager.file(scope, { id, run, index: 0, action: 'verify' }); return r;
};
try {
  await manager.plan(scope, { id, direction: 'upload', target: '', count: 1, totalBytes: data.length });
  await manager.append(scope, { id, after: 0, entries: [{ path: 'protocol.txt', kind: 'file', size: data.length }] });
  const first = randomUUID(); await manager.control(scope, { id, run: first, action: 'resume' }); await begin(first);
  const half = data.subarray(0, 8); await manager.upload(scope, id, 0, first, 0, half, createHash('sha256').update(half).digest('hex'));
  await manager.control(scope, { id, run: first, action: 'pause' }); await manager.dispose();
  manager = new TransferManager(helpers, p => p === scope.workspaceRoot ? `ssh://${alias}${root}` : undefined, () => {}, join(local, 'host-state'));
  const second = randomUUID(); await manager.control(scope, { id, run: second, action: 'resume' }); assert.equal((await begin(second)).file.offset, 8);
  const rest = data.subarray(8); await manager.upload(scope, id, 0, second, 8, rest, createHash('sha256').update(rest).digest('hex'));
  await manager.file(scope, { id, run: second, index: 0, action: 'finish', sha256: checksum });
  assert.equal(ssh(`cat '${root}/protocol.txt'`), data.toString());
  const report = { alias, root, source, destination, binary: path, bytes: 8388608, sha256: hash.digest('hex'), protocolRestartPassed: true, keepForUi: keep };
  await writeFile(join(directory, 'transfer-fixtures.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await manager.dispose(); await helpers.dispose();
  if (!keep) { ssh(`rm -rf -- '${root}'`); await rm(local, { recursive: true, force: true }); }
  else await chmod(local, 0o700);
}
