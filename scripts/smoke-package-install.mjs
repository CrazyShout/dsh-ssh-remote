import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { parseArgs, promisify } from 'node:util';

const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { values } = parseArgs({ options: {
  package: { type: 'string' }, version: { type: 'string', default: packageManifest.version },
  previous: { type: 'string' }, 'previous-version': { type: 'string', default: '0.10.2' },
  dsh: { type: 'string', default: 'dsh' }, out: { type: 'string' }, keep: { type: 'boolean', default: false },
  'dsh-version': { type: 'string', default: '0.2.0-rc.2' },
} });
assert(values.package, 'Usage: node scripts/smoke-package-install.mjs --package <absolute .tgz or HTTPS URL> [--previous <0.10.2.tgz>] [--keep]');
assert(isAbsolute(values.package) || values.package.startsWith('https://'), 'Use an absolute package path or HTTPS release URL');
const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-package-install-')));
const home = join(root, 'home');
const workspace = join(root, 'workspace');
const artifacts = values.out ? resolve(values.out) : join(root, 'evidence');
await mkdir(home, { mode: 0o700 }); await mkdir(artifacts, { recursive: true, mode: 0o700 });
await mkdir(workspace, { mode: 0o700 });
const env = { ...process.env, DSH_HOME: home, CI: 'true' };
const profile = join(home, 'profiles', 'web');
const manifestPath = join(profile, 'package.json');
const run = promisify(execFile);
let sequence = 0;
const report = { home, artifacts, nodeVersion: process.version, platform: process.platform, package: values.package, checks: [] };
const redact = value => value.replace(/([?&]token=)[^\s"'<>]+/gu, '$1[redacted]');
async function cli(args, allowFailure = false) {
  let result;
  try { result = { ...await run(values.dsh, args, { env, cwd: workspace, timeout: 240_000, maxBuffer: 12 * 1024 * 1024 }), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout ?? '', stderr: error.stderr ?? '', exitCode: error.code }; }
  const log = `${result.stdout}\n${result.stderr}`;
  await writeFile(join(artifacts, `${String(++sequence).padStart(2, '0')}-${args[0].replaceAll(/\W/gu, '')}.log`), redact(log), { mode: 0o600 });
  if (!allowFailure) assert.equal(result.exitCode, 0, `dsh ${args.join(' ')} failed; see ${artifacts}\n${redact(log.slice(-2500))}`);
  return { ...result, log };
}
async function install(spec, version) {
  const result = await cli(['plugin', '--profile', 'web', 'add', spec], true);
  if (result.exitCode !== 0) {
    assert(version === '0.10.2', '0.11.0 must install without the removed ssh2 native build prompts');
    assert.match(result.log, /ERR_PNPM_IGNORED_BUILDS/u, 'Unexpected installation failure');
    const workspacePath = join(profile, 'pnpm-workspace.yaml');
    let workspace = await readFile(workspacePath, 'utf8').catch(() => '');
    assert.match(result.log, /cpu-features@0\.0\.10/u);
    assert.match(result.log, /ssh2@1\.17\.0/u);
    workspace = workspace.replace(/^  (?:cpu-features|ssh2): set this to true or false\n/gmu, '');
    const decisions = "allowBuilds:\n  'cpu-features@0.0.10': false\n  'ssh2@1.17.0': false\n";
    workspace = /^allowBuilds:\n/mu.test(workspace) ? workspace.replace(/^allowBuilds:\n/mu, decisions) : `${workspace.trimEnd()}\n${decisions}`;
    await writeFile(workspacePath, workspace, { mode: 0o600 });
    report.checks.push('official installer reported blocked builds; exact optional builds disabled in isolated profile');
    await cli(['plugin', '--profile', 'web', 'add', spec]);
  }
  const installedPath = await realpath(join(profile, 'node_modules', 'dsh-ssh-remote'));
  assert(installedPath.startsWith(await realpath(profile) + '/'), 'Plugin must be installed from the archive, not a source link');
  const installed = JSON.parse(await readFile(join(installedPath, 'package.json'), 'utf8'));
  assert.equal(installed.version, version);
  const profileManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // rc.2's CLI retains a dependency after a blocked build, so its retry does
  // not auto-enable that now-existing bundle. Simulate the documented plugin
  // page toggle in this private fixture; never alter the user's profile.
  if (result.exitCode !== 0 && !profileManifest.dsh.profile.bundles.includes('dsh-ssh-remote')) {
    profileManifest.dsh.profile.bundles.push('dsh-ssh-remote');
    await writeFile(manifestPath, JSON.stringify(profileManifest, null, 2) + '\n');
    report.checks.push('explicit bundle activation after blocked-build retry (plugin-page toggle equivalent)');
  }
  assert(profileManifest.dsh.profile.bundles.includes('dsh-ssh-remote'));
  assert(!profileManifest.dependencies['dsh-ssh-remote'].startsWith('link:'));
  assert(!installed.scripts.prepare && !installed.scripts.install && !installed.scripts.postinstall);
  for (const file of ['lib/index.js', 'lib/client.js', 'helper/dsh_remote_helper.py', 'helper/dsh_transfer.py', 'helper/dsh_terminal_state.py']) {
    assert((await readFile(join(installedPath, file))).length > 0);
  }
  const source = spec.startsWith('github:') ? 'pinned Git source' : spec.startsWith('https:') ? 'release URL' : 'archive';
  report.checks.push(`installed ${version} from ${source}`);
}
async function boot(enabled) {
  const child = spawn(values.dsh, ['web', '--host', '127.0.0.1', '--port', '0', '--no-open'], { env, cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error;
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', failure => { error = failure; });
  const exited = new Promise(resolveExit => child.once('close', resolveExit));
  try {
    let address;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (error) throw error;
      if (child.exitCode !== null) throw new Error(redact(output.slice(-4000)));
      address = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(output)?.[1];
      if (address) break;
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    assert(address, 'Web startup timed out');
    const initial = await fetch(address, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const cookie = initial.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const page = await fetch(new URL('/', address), { headers: { cookie }, signal: AbortSignal.timeout(10_000) });
    assert.equal(page.status, 200);
    const document = await page.text();
    const bootJson = /globalThis\["__DSH_BOOT__"\] = (.*?)<\/script>/su.exec(document)?.[1];
    assert(bootJson, 'Missing DSH client boot manifest');
    const graph = JSON.parse(bootJson);
    const entry = graph.entries.find(item => item.id === 'dsh-ssh-remote');
    assert.equal(Boolean(entry), enabled, 'Unexpected plugin client activation');
    if (enabled) {
      const bundle = await fetch(new URL(entry.url, address), { headers: { cookie }, signal: AbortSignal.timeout(10_000) });
      assert.equal(bundle.status, 200);
      assert((await bundle.text()).includes('__ModuleLoader__.load'));
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
    assert.equal(child.exitCode, null, redact(output.slice(-3000)));
    report.checks.push(`Web boots with plugin ${enabled ? 'enabled' : 'disabled/removed'}`);
  } finally {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited; clearTimeout(timer);
    await writeFile(join(artifacts, `${String(++sequence).padStart(2, '0')}-boot.log`), redact(output), { mode: 0o600 });
  }
}
try {
  report.dshVersion = (await cli(['--version'])).stdout.trim();
  assert.equal(report.dshVersion, values['dsh-version'], 'Unexpected DSH test runtime');
  await writeFile(join(workspace, 'workspace-sentinel.txt'), 'KEEP_PROJECT_DATA', { mode: 0o600 });
  if (values.previous) await install(values.previous, values['previous-version']);
  await install(values.package, values.version); await boot(true);
  if (values.previous) {
    await install(values.previous, values['previous-version']); await boot(true);
    await install(values.package, values.version); await boot(true);
    report.checks.push('upgrade and rollback');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== 'dsh-ssh-remote');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await boot(false);
  manifest.dsh.profile.bundles.push('dsh-ssh-remote');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await cli(['plugin', '--profile', 'web', 'remove', 'dsh-ssh-remote']);
  const removed = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert(!removed.dependencies?.['dsh-ssh-remote']);
  assert(!removed.dsh.profile.bundles.includes('dsh-ssh-remote'));
  await boot(false);
  assert.equal(await readFile(join(workspace, 'workspace-sentinel.txt'), 'utf8'), 'KEEP_PROJECT_DATA');
  report.checks.push('disable, remove and preserve workspace data');
  if (values.keep) { await install(values.package, values.version); report.checks.push('retained installed profile for UI acceptance'); }
  if (!values.package.startsWith('https:')) report.packageSha256 = createHash('sha256').update(await readFile(values.package)).digest('hex');
  report.passed = true;
} catch (error) { report.passed = false; report.error = String(error); process.exitCode = 1; }
await writeFile(join(artifacts, 'install-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
