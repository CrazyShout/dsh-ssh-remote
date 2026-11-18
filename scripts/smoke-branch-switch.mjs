// Uses the production route and helper, with a controlled Session/Agent fixture.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mountBranchSwitchHttp } from '../lib/branch-switch.js';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { executeRemoteShell } from '../lib/helper-shell.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { quotePosix } from '../lib/ssh-command.js';

const [alias] = process.argv.slice(2);
assert.match(alias ?? '', /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Pass a configured test SSH alias.');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000 });
const root = ssh('mktemp -d /tmp/dsh-branch-acceptance.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-branch-acceptance\.[a-zA-Z0-9]{8}$/);
const nonce = randomUUID();
const anchor = '/test/ssh-anchor', uri = 'ssh://' + alias + root;
const helpers = new RemoteHelperManager({ aliasValidator: value => value === alias });
const resolve = path => path === anchor ? uri : path === anchor + '/repo' ? uri + '/repo' : undefined;
let route, mode = 'read-only';
const session = { id: 'test', header: { cwd: anchor }, snapshotEvents: () => [] };
const services = {
  connection: { fetch: { register(r) { route = r; return () => {}; } } },
  typert: { lookups: new Map([['session', { resolve: async () => session }]]) },
  workingDirectory: { get: () => anchor + '/repo' },
  sandboxPolicy: { resolve: () => ({ mode, workspaceRoot: anchor }) },
  agents: { get: () => ({ runMaintenance: work => work(new AbortController().signal) }) },
  effect: effect => effect(),
};
const dispose = mountBranchSwitchHttp({ inject: (_keys, cb) => ({ dispose: cb(services) }) }, {
  resolve, execute: (target, spec) => executeRemoteShell(target, spec, helpers, resolve),
});
const call = async payload => (await route.fetch(new Request('http://localhost/api/ssh-branches', {
  method: 'POST', body: JSON.stringify({ sessionId: 'test', ...payload }),
}))).json();
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
try {
  ssh(`cd ${quotePosix(root)} && printf '%s' ${quotePosix(nonce)} > owner && git init -q -b main repo && git init --bare -q origin.git && cd repo && git -c user.email=smoke@example.invalid -c user.name=smoke commit --allow-empty -qm fixture && git remote add origin ../origin.git && git push -q origin main:topic && git update-ref -d refs/remotes/origin/topic`);
  const listing = ok(await call({ action: 'search', query: 'topic', includeRemote: true, discoverRemote: true }));
  assert.deepEqual(listing.remote.map(row => row.name), ['origin/topic']);
  const git = args => ssh(`git -C ${quotePosix(root + '/repo')} ${args}`).trim();
  assert.equal(git('for-each-ref --format="%(refname)" refs/remotes'), '');
  const select = { action: 'switch', ref: 'refs/remotes/origin/topic' };
  assert.equal((await call(select)).error.code, 'READ_ONLY');
  mode = 'workspace-write';
  assert.equal(ok(await call(select)).current, 'topic');
  assert.equal(git('rev-parse --abbrev-ref --symbolic-full-name @{upstream}'), 'origin/topic');
  assert.equal(ok(await call({ action: 'create', name: 'new-from-head' })).current, 'new-from-head');
  assert.equal(git('branch --show-current'), 'new-from-head');
  console.log('PASS: read-only discovery (no tracking refs), read-only refusal, confined switch, tracking and create on ' + alias);
} finally {
  try { await dispose(); await helpers.dispose(); }
  finally {
    // Only this newly allocated test checkout, with its ownership marker.
    ssh(`test ! -L ${quotePosix(root)} && test "$(cat ${quotePosix(root + '/owner')})" = ${quotePosix(nonce)} && rm -r -- ${quotePosix(root)}`);
  }
}
