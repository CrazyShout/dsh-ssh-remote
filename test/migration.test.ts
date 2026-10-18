import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, stat, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SshMigration } from '../src/migration.js';
import { AnchorRegistry, canonicalPath } from '../src/anchors.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const host = { name: 'old', host: 'example.invalid', user: 'alice', port: 2202, identityFile: '/private/key with spaces', proxyJump: '' };
async function fixture(config = 'Host existing\n  HostName existing.invalid\nHost *\n  User fallback\nMatch host never\n  Port 2222\n') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-migration-')); roots.push(root);
  const path = join(root, 'config'); await writeFile(path, config);
  const verify = vi.fn(async () => {}), restore = vi.fn(async () => {});
  return { root, path, verify, restore, migration: new SshMigration(path, join(root, 'backups'), [host], verify, restore) };
}
describe('explicit legacy migration', () => {
  it('previews without writes, preserves Host/Match blocks, uses ssh -G, and rolls back idempotently', async () => {
    const f = await fixture(), original = await readFile(f.path, 'utf8');
    const plan = await f.migration.preview();
    expect(plan.ready).toBe(true); expect(plan.after.config.endsWith(original)).toBe(true);
    expect(plan.after.fragment).toContain('IdentityFile "/private/key with spaces"');
    expect(await readFile(f.path, 'utf8')).toBe(original);
    expect(f.verify).not.toHaveBeenCalled();
    const result = await f.migration.apply(plan.token);
    expect(result.verified).toEqual(['old']); expect(f.verify).toHaveBeenCalledWith('old');
    expect(f.restore).toHaveBeenCalledWith({ old: 'old', 'example.invalid': 'old' });
    expect((await stat(join(f.root, 'backups'))).mode & 0o777).toBe(0o700);
    expect((await stat(join(f.root, 'backups', `${result.id}.json`))).mode & 0o777).toBe(0o600);
    expect(await f.migration.apply(plan.token)).toEqual(result); expect(f.verify).toHaveBeenCalledTimes(1);
    await f.migration.rollback(result.id); await f.migration.rollback(result.id);
    expect(await readFile(f.path, 'utf8')).toBe(original);
  });
  it('rejects collisions, invalid aliases and concurrent edits before writing anything', async () => {
    const f = await fixture();
    expect((await f.migration.preview([{ name: 'old', alias: 'existing' }])).ready).toBe(false);
    expect((await f.migration.preview([{ name: 'old', alias: '-F bad' }])).ready).toBe(false);
    const plan = await f.migration.preview([{ name: 'old', alias: 'new-alias' }]);
    await writeFile(f.path, 'Host user-edit\n');
    await expect(f.migration.apply(plan.token)).rejects.toThrow(/changed/);
    await expect(stat(plan.fragmentPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retains unrelated includes, refuses rollback over later edits, and does not remap failed connections', async () => {
    const f = await fixture('Include "missing.conf"\nHost existing\n HostName elsewhere\n');
    f.verify.mockRejectedValueOnce(new Error('Authentication failed'));
    const plan = await f.migration.preview(), result = await f.migration.apply(plan.token);
    expect(result.errors.old).toContain('Authentication'); expect(f.restore).toHaveBeenCalledWith({});
    expect(await readFile(f.path, 'utf8')).toContain('Include "missing.conf"');
    await writeFile(f.path, plan.after.config + '# user edit\n');
    await expect(f.migration.rollback(result.id)).rejects.toThrow(/edited/);
    expect(await readFile(plan.fragmentPath, 'utf8')).toBe(plan.after.fragment);
  });
  it('rolls back both files if ssh -G fails and rejects unmanaged fragments', async () => {
    const f = await fixture(), before = await readFile(f.path, 'utf8');
    const migration = new SshMigration(f.path, join(f.root, 'backups'), [host], f.verify, f.restore,
      async () => ({ code: 1, stdout: '', stderr: 'invalid configuration' }));
    const plan = await migration.preview(); await expect(migration.apply(plan.token)).rejects.toThrow(/ssh -G/);
    expect(await readFile(f.path, 'utf8')).toBe(before);
    await expect(stat(plan.fragmentPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(plan.fragmentPath, '# manually owned\n');
    await expect(migration.preview()).rejects.toThrow(/unmanaged/);
  });
  it('recovers a prepared transaction after a partial write, without a live preview', async () => {
    const f = await fixture(), preview = await f.migration.preview();
    const plan = (f.migration as any).previews.get(preview.token);
    await (f.migration as any).save(plan.journal);
    await writeFile(preview.fragmentPath, preview.after.fragment, { mode: 0o600 });
    const restarted = new SshMigration(f.path, join(f.root, 'backups'), [host], f.verify, f.restore);
    await restarted.rollback(preview.token);
    expect(await readFile(f.path, 'utf8')).toBe(preview.before.config);
    await expect(stat(preview.fragmentPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
describe('canonical anchor registry', () => {
  it('restores through DSH_HOME aliases, resolves new descendants and preserves anchor identity during migration', async () => {
    const f = await fixture(), home = join(f.root, 'home'), alias = join(f.root, 'alias');
    await mkdir(home); await symlink(home, alias);
    const file = join(alias, 'anchors.json'), root = join(alias, 'anchors');
    const first = new AnchorRegistry(file, root), anchor = await first.materialize('ssh://old/remote/project');
    await first.dispose();
    const restored = new AnchorRegistry(file, root);
    expect(restored.resolve(join(root, anchor.anchorPath.split('/').at(-1)!, 'new.txt'))).toBe('ssh://old/remote/project/new.txt');
    await restored.migrateAliases({ old: 'new' });
    expect(restored.resolve(anchor.anchorPath)).toBe('ssh://new/remote/project');
    expect(anchor.anchorPath).toBe(canonicalPath(anchor.anchorPath));
    expect(restored.resolve(`${anchor.anchorPath}-other`)).toBeUndefined();
    await symlink(f.root, join(anchor.anchorPath, 'local-link'));
    expect(restored.resolve(join(anchor.anchorPath, 'local-link', 'file'))).toBe('ssh://new/remote/project/local-link/file');
    await restored.dispose();
  });
  it('reports corrupt/outside mappings instead of falling back to local files', async () => {
    const f = await fixture(); await writeFile(f.path, '[{"anchorPath":"/elsewhere","uri":"ssh://host/path"}]');
    expect(() => new AnchorRegistry(f.path, join(f.root, 'anchors'))).toThrow(/Cannot restore/);
  });
});
