// Real SSH + published DSH subprocess provider, with failure injection confined
// to one disposable Git wrapper. Does not drop user connections or change SSH.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { installRemoteSubprocessRouter } from '../lib/runtime-router.js';

const [alias, sdkRoot] = process.argv.slice(2);
assert(alias && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(alias) && sdkRoot,
  'Usage: node scripts/smoke-git-probe-recovery.mjs <alias> <isolated DSH runtime>');
const requireSdk = createRequire(join(resolve(sdkRoot), 'package.json'));
const sdk = name => import(pathToFileURL(requireSdk.resolve(name)).href);
const [{ Context }, { default: LocalSubprocess }] = await Promise.all([
  sdk('@deepseek-ai/cordis'), sdk('@deepseek-ai/dsh-subprocess-local'),
]);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const ssh = (command, input) => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000, input });
const root = ssh('mktemp -d /tmp/dsh-git-recovery.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-git-recovery\.[a-zA-Z0-9]{8}$/u);
const ctx = new Context();
const helpers = new RemoteHelperManager({ aliasValidator: value => value === alias, healthIntervalMs: 0 });
let restore;
const report = { sdk: requireSdk('@deepseek-ai/dsh/package.json').version, alias,
  injectedFailure: 'test-owned git wrapper exits127, not an induced network outage', checks: [], modelRequests: 0 };
try {
  const git = ssh('command -v git').trim(); assert(git.startsWith('/'));
  const source = '#!/bin/sh\nif [ "$PWD" = ' + quote(root + '/repo') + ' ] && [ -e ' + quote(root + '/fail')
    + ' ]; then exit 127; fi\nexec ' + quote(git) + ' "$@"\n';
  ssh('python3 - ' + quote(root), 'import pathlib,sys,json\nr=pathlib.Path(sys.argv[1]);(r/"repo").mkdir();(r/"other").mkdir();(r/"git").write_text(' + JSON.stringify(source) + ');(r/"git").chmod(0o700);(r/"fail").touch()\n');
  ssh('git -C ' + quote(root + '/repo') + ' init -q && git -C ' + quote(root + '/other') + ' init -q');
  await ctx.plugin(LocalSubprocess);
  const uri = 'ssh://' + alias + root + '/repo';
  await helpers.client(uri);
  let starts = 0;
  const spawn = ctx.subprocess.spawn;
  ctx.subprocess.spawn = function (spec) { starts++; return spawn.call(this, spec); };
  restore = installRemoteSubprocessRouter(ctx.subprocess, () => undefined, helpers);
  const spec = { cwd: uri, argv: [root + '/git', 'rev-parse', '--is-inside-work-tree'],
    stdio: { stdin: 'ignore', stdout: { maxBytes: 32768 }, stderr: { maxBytes: 32768 } }, graceMs: 1000 };
  const run = async request => {
    const handle = ctx.subprocess.spawn(request), outcome = await handle.done;
    await Promise.resolve();
    return { ...outcome, stdout: handle.collected.stdout.readFrom(0).text, stderr: handle.collected.stderr.readFrom(0).text };
  };
  assert.equal((await run(spec)).exitCode, 127);
  const before = starts;
  assert.throws(() => ctx.subprocess.spawn(spec), { code: 'REMOTE_GIT_PROBE_COOLDOWN' });
  assert.equal(starts, before);
  assert.equal((await run({ ...spec, cwd: 'ssh://' + alias + root + '/other' })).exitCode, 0);
  report.checks.push('repeated failure suppressed without spawning SSH', 'same-host other workspace unaffected');
  ssh('rm -- ' + quote(root + '/fail'));
  const reconnectStart = performance.now();
  await helpers.retry(alias);
  report.reconnectMs = Math.round(performance.now() - reconnectStart);
  const recovered = await run(spec);
  assert.equal(recovered.exitCode, 0, recovered.stderr); assert.equal(recovered.stdout.trim(), 'true');
  report.checks.push('same query succeeds after actual helper reconnect');
  ssh('touch ' + quote(root + '/fail'));
  assert.equal((await run(spec)).exitCode, 127);
  ssh('rm -- ' + quote(root + '/fail'));
  await delay(2050);
  const recovery = ctx.subprocess.spawn(spec), recoveryStarts = starts;
  assert.throws(() => ctx.subprocess.spawn(spec), /recovery check is still running/u);
  assert.equal(starts, recoveryStarts);
  assert.equal((await recovery.done).exitCode, 0);
  await Promise.resolve();
  assert.equal((await run(spec)).exitCode, 0);
  report.checks.push('independent recovery after2s', 'single active recovery probe', 'successful query clears suppression');
  report.startedProcesses = starts;
  console.log(JSON.stringify(report, null, 2));
} finally {
  restore?.();
  await ctx.fiber.dispose();
  await helpers.dispose();
  // Only this script's validated, freshly allocated fixture root.
  ssh('rm -rf -- ' + quote(root));
}
