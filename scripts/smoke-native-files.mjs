// Explicit opt-in; test data stays in fresh remote/local temporary directories.
// The normal user-local versioned helper may also be installed and started.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import WorkspaceFiles from '@deepseek-ai/dsh-api-workspace-files';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { HelperRemoteFileSystem } from '../lib/helper-fs.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { installRemoteFileSystemRouter } from '../lib/runtime-router.js';
import { installRemoteWorkspaceFilesRouter } from '../lib/workspace-files.js';

const alias = process.argv[2];
if (!alias || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias)) throw new Error('Usage: node scripts/smoke-native-files.mjs <explicit-ssh-alias>');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30_000 });
const restores = [];
const report = { alias, startedAt: new Date().toISOString(), checks: {} };
let root, localRoot, manager, ctx, failure;
try {
  const created = ssh('mktemp -d /tmp/dsh-native-files.XXXXXXXX').trim();
  assert.match(created, /^\/tmp\/dsh-native-files\.[a-zA-Z0-9]{8}$/);
  root = created;
  localRoot = await mkdtemp(join(tmpdir(), 'dsh-native-files-local-'));
  localRoot = await realpath(localRoot);
  const anchor = join(localRoot, 'anchor');
  const uri = `ssh://${alias}${root}`;
  const resolver = path => path === anchor ? uri : path.startsWith(`${anchor}/`) ? uri + path.slice(anchor.length) : undefined;
  manager = new RemoteHelperManager({ aliasValidator: candidate => candidate === alias, healthIntervalMs: 0 });
  ctx = new Context();
  const remote = new HelperRemoteFileSystem(manager, resolver);
  const filename = '中文 space.md';
  const content = '# Remote preview\n第二行 native-files marker\nlast line\n';
  await remote.writeText(await remote.resolve(`${uri}/${filename}`), content,
    { kind: 'createIfAbsent' }, undefined, { mode: 'workspace-write', workspaceRoot: anchor });
  await writeFile(join(localRoot, 'local-sentinel.txt'), 'LOCAL_ONLY');
  new LocalFileSystem(ctx, { cwd: localRoot, diffBasisMaxBytes: 1024 * 1024 });
  new WorkspaceFiles(ctx, { maxBytes: 1024 * 1024, maxFileBytes: 1024 * 1024, maxLines: 100, maxEntries: 2000 });
  restores.push(installRemoteFileSystemRouter(ctx.fs, {}, resolver, manager));
  restores.push(installRemoteWorkspaceFilesRouter(ctx.workspaceFiles, manager, resolver));
  const scope = { sessionId: 'smoke-files', workspaceRoot: anchor };
  const signal = new AbortController().signal;
  const client = await manager.client(alias);
  const beforeList = (await client.call('health/status')).workspaces;
  const list = await ctx.workspaceFiles.list(scope, anchor, signal);
  assert.equal((await client.call('health/status')).workspaces, beforeList, 'file-tree list must release its private handle');
  assert.deepEqual(list.entries.map(entry => entry.name), [filename]);
  assert.equal(list.truncated, false);
  const page = await ctx.workspaceFiles.read(scope, filename, { offset: 2, limit: 1 }, signal);
  assert.equal(page.text, '第二行 native-files marker');
  assert.equal(page.absolutePath, `${root}/${filename}`);
  const range = await ctx.workspaceFiles.readBytes(scope, filename, { range: { offset: 0, length: 16 } }, signal);
  assert.deepEqual(Buffer.from(range.data), Buffer.from(content).subarray(0, 16));
  assert.equal((await ctx.workspaceFiles.stat(scope, filename, signal)).bytes, Buffer.byteLength(content));
  // Execution-world absolute reads retain the official outside-workspace read contract.
  assert.equal((await ctx.workspaceFiles.read(scope, `${root}/${filename}`, {}, signal)).text, content.slice(0, -1));
  const target = await ctx.fs.resolve(filename, { cwd: anchor });
  await assert.rejects(ctx.fs.watch(target, () => {}, signal), /Remote file watching is unavailable/);
  const local = await ctx.workspaceFiles.read({ sessionId: 'local', workspaceRoot: localRoot }, 'local-sentinel.txt', {}, signal);
  assert.equal(local.text, 'LOCAL_ONLY');
  report.checks = { directory: true, unicodeAndSpaces: true, textPagination: true,
    byteRange: true, stat: true, absoluteRemoteRead: true, remoteWatchRejected: true, localIsolation: true };
  // Generic FS adapters intentionally cache read-only root handles until
  // manager disposal. Test the list lifecycle, not a false global-zero premise.
  const cached = (await client.call('health/status')).workspaces;
  await ctx.workspaceFiles.list(scope, anchor, signal);
  assert.equal((await client.call('health/status')).workspaces, cached);
  report.checks.listHandleCleanup = true;
  report.helperVersion = manager.status(alias).helperVersion;
  report.helperSha256 = manager.status(alias).helperSha256;
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const cleanup of [...restores.reverse(), () => ctx?.fiber.dispose(), () => manager?.dispose(),
    () => localRoot === undefined ? undefined : rm(localRoot, { recursive: true, force: true }),
    () => root === undefined ? undefined : ssh(`rm -rf -- ${quote(root)}`)]) {
    try { await cleanup(); } catch (error) { cleanupErrors.push(error); }
  }
  if (cleanupErrors.length) throw new AggregateError([...(failure === undefined ? [] : [failure]), ...cleanupErrors], 'native files smoke cleanup failed');
}
if (failure !== undefined) throw failure;
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
