// Opt-in M0 acceptance: two authenticated clients, one versioned helper daemon.
// Creates and removes only a new remote /tmp fixture on the supplied SSH alias.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';

const alias = process.argv[2];
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-concurrency.mjs <explicit-ssh-alias>');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const root = ssh('mktemp -d /tmp/dsh-m0-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-m0-smoke\.[a-zA-Z0-9]{8}$/);
const managers = [0, 1].map(() => new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0 }));
const mutate = (client, method, params) => client.call(method, { ...params, operationId: randomUUID() }, { mutation: true, timeoutMs: 10_000 });
const report = { alias, startedAt: new Date().toISOString(), checks: {} };
try {
  const clients = await Promise.all(managers.map(manager => manager.client(alias)));
  assert.notEqual(clients[0].sessionId, clients[1].sessionId);
  assert.equal(clients[0].session.serverEpoch, clients[1].session.serverEpoch);
  for (const client of clients) {
    assert.equal(client.capabilities.filesystem.guardedWrite.coordinationScope, 'daemon');
    assert.equal(client.capabilities.filesystem.guardedWrite.externalWriterRaceFree, false);
  }
  await Promise.all(clients.map(client => mutate(client, 'workspace/open', { workspaceId: 'w', path: root, access: 'workspace-write' })));
  await mutate(clients[0], 'fs/write', { workspaceId: 'w', path: 'shared.txt', data: Buffer.from('seed').toString('base64') });
  const pairs = [['inline', 'inline'], ['inline', 'chunk'], ['chunk', 'inline'], ['chunk', 'chunk']];
  let conflicts = 0;
  for (const pair of pairs) {
    for (let round = 0; round < 4; round += 1) {
      const { version } = await clients[0].call('fs/read', { workspaceId: 'w', path: 'shared.txt' });
      const handles = [];
      const prepared = await Promise.all(clients.map(async (client, index) => {
        const params = { workspaceId: 'w', path: 'shared.txt', intent: { kind: 'replace-if-version', version } };
        const data = Buffer.from(`${pair.join('-')}:${round}:${index}`).toString('base64');
        if (pair[index] === 'inline') return () => mutate(client, 'fs/write', { ...params, data });
        const handleId = randomUUID();
        await mutate(client, 'fs/writeOpen', { ...params, handleId });
        handles.push({ client, handleId });
        await mutate(client, 'fs/writeChunk', { handleId, data });
        return () => mutate(client, 'fs/writeCommit', { handleId });
      }));
      const results = await Promise.allSettled(prepared.map(commit => commit()));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const rejected = results.filter(result => result.status === 'rejected');
      assert.equal(rejected[0]?.reason.code, 'E_STALE_VERSION');
      conflicts += 1;
      await Promise.all(handles.map(({ client, handleId }) => mutate(client, 'fs/writeAbort', { handleId })));
    }
  }
  report.checks.competingWrites = { combinations: pairs, rounds: conflicts, successesPerRound: 1, staleConflictsPerRound: 1 };
  const client = clients[0];
  const handleId = randomUUID();
  await mutate(client, 'fs/readOpen', { workspaceId: 'w', path: 'shared.txt', handleId });
  await client.call('fs/readNext', { handleId, afterSeq: '0' });
  assert.equal((await mutate(client, 'fs/close', { handleId })).closed, true);
  await assert.rejects(client.call('fs/readNext', { handleId, afterSeq: '0' }), error => error.code === 'E_UNKNOWN_HANDLE');
  assert.equal((await mutate(client, 'fs/close', { handleId })).closed, true);
  report.checks.closedReadAndReplay = true;
  const cancelledId = randomUUID();
  assert.deepEqual(await mutate(client, 'workspace/close', { workspaceId: cancelledId }), { closed: false, cancelled: true });
  await assert.rejects(mutate(client, 'workspace/open', { workspaceId: cancelledId, path: root }), error => error.code === 'E_RESOURCE_RETIRED');
  report.checks.cancelBeforeOpen = true;
  await Promise.all(clients.map(client => mutate(client, 'workspace/close', { workspaceId: 'w' })));
  for (const client of clients) {
    const status = await client.call('health/status', {});
    for (const field of ['workspaces', 'openingWorkspaces', 'readHandles', 'writeHandles', 'pathLocks']) assert.equal(status[field], 0, field);
  }
  report.checks.resourcesReleased = true;
  report.helperVersion = managers[0].status(alias).helperVersion;
  report.helperSha256 = managers[0].status(alias).helperSha256;
} finally {
  const cleanup = await Promise.allSettled(managers.map(manager => manager.dispose()));
  ssh(`rm -rf -- ${quote(root)}`);
  const failures = cleanup.filter(result => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'M0 smoke session cleanup failed');
}
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
