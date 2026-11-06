// Explicit, small-data SSH acceptance of the published DSH cwd/search seams.
// No model calls; the Agent fixture supplies only Session projection storage.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AnchorRegistry } from '../lib/anchors.js';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { installRemoteFileSystemRouter, installRemoteSubprocessRouter } from '../lib/runtime-router.js';
import { installRemoteWorkingDirectoryRouter } from '../lib/working-directory.js';

const [alias, sdkRoot] = process.argv.slice(2);
assert(alias && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(alias) && sdkRoot,
  'Usage: node scripts/smoke-working-directory.mjs <SSH alias> <installed DSH runtime root>');
const requireSdk = createRequire(join(resolve(sdkRoot), 'package.json'));
const sdk = name => import(pathToFileURL(requireSdk.resolve(name)).href);
const [{ Context }, { default: LocalFileSystem }, { default: LocalSubprocess },
  { default: WorkingDirectoryService }, { runRipgrep, buildGlobCommand, buildGrepCommand }] = await Promise.all([
  sdk('@deepseek-ai/cordis'), sdk('@deepseek-ai/dsh-fs-local'), sdk('@deepseek-ai/dsh-subprocess-local'),
  sdk('@deepseek-ai/dsh-working-directory'), sdk('@deepseek-ai/dsh-tool-fs-search'),
]);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const remote = ssh('mktemp -d /tmp/dsh-issue42.XXXXXXXX').trim();
assert.match(remote, /^\/tmp\/dsh-issue42\.[a-zA-Z0-9]{8}$/u);
const local = await mkdtemp(join(tmpdir(), 'dsh-issue42-'));
const registry = new AnchorRegistry(join(local, 'anchors.json'), join(local, 'anchors'));
const helpers = new RemoteHelperManager({ aliasValidator: value => value === alias, healthIntervalMs: 0 });
const ctx = new Context(); const disposers = [];
const report = { sdk: requireSdk('@deepseek-ai/dsh/package.json').version, alias, checks: [] };
try {
  const files = ['AGENTS.md', '.agents/skills/fixture/SKILL.md', 'docs/skills/fixture/SKILL.md', '中文 space.txt'];
  ssh(`python3 -c ${quote('import os,sys; root=sys.argv[1];\nfor name in sys.argv[2:]:\n p=os.path.join(root,name); os.makedirs(os.path.dirname(p),exist_ok=True); open(p,"w").write("DSH_ISSUE42_REMOTE\\n")')} ${[remote, ...files].map(quote).join(' ')}`);
  await writeFile(join(local, 'LOCAL_ONLY.txt'), 'LOCAL_MARKER');
  await ctx.plugin(LocalFileSystem, { cwd: local });
  await ctx.plugin(LocalSubprocess);
  const resolveAnchor = path => registry.resolve(path);
  const anchor = await registry.materialize(`ssh://${alias}${remote}`);
  disposers.push(installRemoteFileSystemRouter(ctx.fs, resolveAnchor, helpers));
  disposers.push(installRemoteSubprocessRouter(ctx.subprocess, resolveAnchor));
  const state = new WeakMap();
  const agent = cwd => ({ ctx, inject() {}, session: { header: { cwd }, append(type, data) {
    assert.equal(type, 'working-directory/change'); state.set(this, data.cwd);
  } } });
  ctx.provide('sessionProjections', { register: async () => ({ stateOf: session => state.get(session) ?? session.header.cwd }) });
  ctx.provide('systemPrompt', { context() {}, getContextOrder: () => 0 });
  await ctx.plugin(WorkingDirectoryService, { defaultDirectory: local });
  const router = installRemoteWorkingDirectoryRouter(ctx.workingDirectory, ctx.fs, resolveAnchor, uri => registry.executionPath(uri));
  disposers.push(() => router.dispose());
  const parent = agent(anchor.anchorPath), child = agent(anchor.anchorPath);
  await ctx.workingDirectory.set(child, resolve(await ctx.workingDirectory.ensure(parent), '.'));
  const exec = { agent: child, signal: AbortSignal.timeout(60_000) };
  const search = (name, argv, owner = exec) => runRipgrep(ctx, owner, name, argv, 65536, 2000, 8192);
  for (const pattern of files.slice(0, 3)) {
    const result = await search('glob', buildGlobCommand({ pattern, path: remote }));
    assert(result.stdout.includes(pattern), `${pattern}: ${JSON.stringify(result)}`);
    report.checks.push(`remote glob: ${pattern}`);
  }
  const grep = await search('grep', buildGrepCommand({ pattern: 'DSH_ISSUE42_REMOTE', path: remote }));
  assert(grep.stdout.includes('DSH_ISSUE42_REMOTE')); report.checks.push('remote grep marker');
  const target = await ctx.fs.resolve('中文 space.txt', { cwd: await ctx.workingDirectory.ensure(child) });
  assert.equal(await ctx.fs.readText(target), 'DSH_ISSUE42_REMOTE\n'); report.checks.push('remote read marker');
  await ctx.workingDirectory.set(child, 'docs');
  const nested = agent(anchor.anchorPath);
  await ctx.workingDirectory.set(nested, resolve(await ctx.workingDirectory.ensure(child), '.'));
  assert.equal(registry.resolve(await ctx.workingDirectory.ensure(nested)), `ssh://${alias}${remote}/docs`);
  const nestedResult = await search('glob', buildGlobCommand({ pattern: '**/SKILL.md' }), { ...exec, agent: nested });
  assert(nestedResult.stdout.includes('skills/fixture/SKILL.md')); report.checks.push('cd then inherited grandchild directory');
  state.set(child.session, `${remote}/docs`);
  assert.equal(registry.resolve(await ctx.workingDirectory.ensure(child)), `ssh://${alias}${remote}/docs`);
  report.checks.push('repair persisted POSIX-only directory');
  const localResult = await search('glob', buildGlobCommand({ pattern: 'LOCAL_ONLY.txt' }), { ...exec, agent: agent(local) });
  assert(localResult.stdout.includes('LOCAL_ONLY.txt')); assert(!localResult.stdout.includes('SKILL.md'));
  report.checks.push('local search unchanged');
  report.modelRequests = 0;
} finally {
  for (const dispose of disposers.reverse()) await dispose();
  await ctx.fiber.dispose(); await helpers.dispose(); await registry.dispose();
  ssh(`rm -rf -- ${quote(remote)}`);
  await rm(local, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
