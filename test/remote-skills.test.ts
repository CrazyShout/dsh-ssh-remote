import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { SkillRegistry } from '@deepseek-ai/dsh-skill';
import { FsError } from '@deepseek-ai/dsh-fs';
import { posix } from 'node:path';
import { RemoteSkillsProvider, parseRemoteSkill } from '../src/remote-skills.js';
import { parseSshUri } from '../src/types.js';

const controllers: AbortController[] = [];
afterEach(() => { controllers.splice(0).forEach(controller => controller.abort()); vi.useRealTimers(); });
const source = (name: string, body = 'REMOTE_BODY', extra = '') => `---\nname: ${name}\ndescription: A remote skill\n${extra}---\n${body}\n`;

function fixture() {
  const nodes = new Map<string, { type: string; text?: string; error?: Error }>();
  const add = (uri: string, text?: string, type = 'file') => {
    nodes.set(uri, { type, text });
    const parsed = parseSshUri(uri);
    for (let path = posix.dirname(parsed.path); ; path = posix.dirname(path)) {
      const parent = `ssh://${parsed.host}${path}`;
      if (!nodes.has(parent)) nodes.set(parent, { type: 'directory' });
      if (path === '/') break;
    }
  };
  const target = (uri: string) => ({ targetKey: uri, displayPath: `${parseSshUri(uri).host}:${parseSshUri(uri).path}` });
  const files = {
    resolve: vi.fn(async (uri: string) => target(uri)),
    lstat: vi.fn(async (uri: string) => { const node = nodes.get(uri); if (node?.error) throw node.error; return node ? { type: node.type } : undefined; }),
    listDir: vi.fn(async (entry: any) => {
      const prefix = String(entry.targetKey).replace(/\/$/u, '') + '/';
      return [...nodes].filter(([uri]) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .sort(([a], [b]) => a.localeCompare(b)).map(([uri, node]) => ({ name: uri.slice(prefix.length), type: node.type, target: target(uri) }));
    }),
    readSnapshot: vi.fn(async (entry: any, max: number) => {
      const node = nodes.get(entry.targetKey); if (!node) throw new FsError('missing', 'FS_NOT_FOUND');
      if (node.error) throw node.error;
      const bytes = Buffer.from(node.text ?? ''); if (bytes.length > max) throw new FsError('too large', 'FS_TOO_LARGE');
      return { bytes, version: 'v1' };
    }),
  };
  const resolver = (cwd: string) => cwd === '/anchor-a' || cwd === 'C:\\Users\\test\\anchors\\project' ? 'ssh://alpha/home/user/project/sub'
    : cwd === '/anchor-b' ? 'ssh://beta/home/user/project/sub' : undefined;
  const controller = new AbortController(); controllers.push(controller);
  const control = { signal: controller.signal, invalidate: vi.fn() }, home = vi.fn(async () => '/home/user'), warn = vi.fn();
  const make = (nextControl = control) => new RemoteSkillsProvider(files as never, resolver, home, nextControl, warn);
  for (const host of ['alpha', 'beta']) add(`ssh://${host}/home/user/project/.git`, undefined, 'directory');
  return { nodes, add, files, resolver, controller, control, home, warn, make, provider: make() };
}

describe('remote filesystem skill provider', () => {
  it('discovers all four roots through SSH identities, including Windows anchors and flat Markdown skills', async () => {
    const f = fixture();
    for (const [root, name] of [
      ['/home/user/project/.dsh/skills', 'project-dsh'], ['/home/user/project/.agents/skills', 'project-agents'],
      ['/home/user/.dsh/skills', 'user-dsh'], ['/home/user/.agents/skills', 'user-agents'],
    ]) f.add(`ssh://alpha${root}/${name}/SKILL.md`, source(name));
    f.add('ssh://alpha/home/user/.agents/skills/flat.md', source('flat', 'FLAT'));
    f.add('ssh://alpha/home/user/.dsh/skills/.system/SKILL.md', source('excluded'));
    f.add('ssh://alpha/home/user/.agents/skills/link', undefined, 'other');
    const result = await f.provider.list({ cwd: 'C:\\Users\\test\\anchors\\project' });
    expect(result.complete).toBe(true);
    expect(result.candidates.map(s => s.name)).toEqual(['project-dsh', 'project-agents', 'user-dsh', 'flat', 'user-agents']);
    expect(result.candidates.map(s => s.rank)).toEqual([99, 199, 399, 499, 499]);
    expect(f.files.resolve.mock.calls.every(([uri]) => uri.startsWith('ssh://alpha/'))).toBe(true);
    const loaded = await f.provider.get(result.candidates[0], { cwd: '/anchor-a' });
    expect(loaded).toMatchObject({ content: 'REMOTE_BODY', path: '/home/user/project/.dsh/skills/project-dsh/SKILL.md',
      resourceBase: { kind: 'directory', path: '/home/user/project/.dsh/skills/project-dsh' } });
  });

  it('leaves local sessions alone and never loads another host\'s same-path candidate', async () => {
    const f = fixture(); f.add('ssh://alpha/home/user/.agents/skills/a.md', source('a'));
    expect(await f.provider.list({ cwd: '/local' })).toEqual({ candidates: [], complete: true });
    expect(f.home).not.toHaveBeenCalled(); expect(f.files.resolve).not.toHaveBeenCalled();
    const [candidate] = (await f.provider.list({ cwd: '/anchor-a' })).candidates;
    f.files.readSnapshot.mockClear();
    expect(await f.provider.get(candidate, { cwd: '/anchor-b' })).toBeUndefined();
    expect(await f.provider.get(candidate, { cwd: '/local' })).toBeUndefined();
    expect(f.files.readSnapshot).not.toHaveBeenCalled();
  });

  it('uses the public registry, preserves local-only skills and gives remote sources category precedence', async () => {
    const f = fixture(); f.add('ssh://alpha/home/user/.dsh/skills/a.md', source('shared', 'REMOTE'));
    const ctx = new Context(), registry = new SkillRegistry(ctx);
    const local = { name: 'shared', description: 'Local skill', content: 'LOCAL', source: 'user-dsh', provider: 'local',
      invocation: { modelInvocable: true, userInvocable: true }, rank: 400, locator: 'local' };
    const unregisterLocal = registry.registerProvider(() => ({ name: 'local', list: async () => [local, { ...local, name: 'host-only' }],
      get: async candidate => ({ ...local, name: candidate.name }) }));
    const unregisterRemote = registry.registerProvider(control => f.make(control as any));
    expect((await registry.get('shared', { cwd: '/anchor-a' }))?.content).toBe('REMOTE');
    expect((await registry.get('host-only', { cwd: '/anchor-a' }))?.content).toBe('LOCAL');
    expect((await registry.get('shared', { cwd: '/local' }))?.content).toBe('LOCAL');
    unregisterRemote(); unregisterLocal();
  });

  it('skips malformed skills without hiding later valid files and reports inaccessible discovery as incomplete', async () => {
    const f = fixture();
    f.add('ssh://alpha/home/user/.agents/skills/0-bad.md', '---\nname: [broken\n---\nbody');
    f.add('ssh://alpha/home/user/.agents/skills/1-denied.md', source('denied'));
    f.nodes.get('ssh://alpha/home/user/.agents/skills/1-denied.md')!.error = new FsError('denied', 'FS_PERMISSION_DENIED');
    f.add('ssh://alpha/home/user/.agents/skills/2-good.md', source('good'));
    const result = await f.provider.list({ cwd: '/anchor-a' });
    expect(result.complete).toBe(false); expect(result.candidates.map(s => s.name)).toEqual(['good']);
    expect(f.warn).toHaveBeenCalled();
  });

  it('re-reads bodies, invalidates renamed skills, and expires cached catalogs without SSH polling', async () => {
    vi.useFakeTimers(); const f = fixture(), uri = 'ssh://alpha/home/user/.agents/skills/a.md';
    f.add(uri, source('a')); const [candidate] = (await f.provider.list({ cwd: '/anchor-a' })).candidates;
    f.add(uri, source('a', 'UPDATED'));
    expect((await f.provider.get(candidate, { cwd: '/anchor-a' }))?.content).toBe('UPDATED');
    const calls = f.files.readSnapshot.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.control.invalidate).toHaveBeenCalledTimes(1); expect(f.files.readSnapshot).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(60_000); expect(f.control.invalidate).toHaveBeenCalledTimes(1);
    f.add(uri, source('renamed'));
    expect(await f.provider.get(candidate, { cwd: '/anchor-a' })).toBeUndefined();
    expect(f.control.invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not publish a cancelled scan or cache a scan invalidated in flight', async () => {
    const f = fixture(); f.add('ssh://alpha/home/user/.agents/skills/a.md', source('a'));
    const original = f.files.readSnapshot.getMockImplementation()!;
    f.files.readSnapshot.mockImplementationOnce(async (...args) => { f.provider.invalidate(); return original(...args); });
    expect((await f.provider.list({ cwd: '/anchor-a' })).complete).toBe(false);
    const request = new AbortController();
    f.files.readSnapshot.mockImplementationOnce(async (...args) => { request.abort(new Error('stop')); return original(...args); });
    await expect(f.provider.list({ cwd: '/anchor-a', signal: request.signal })).rejects.toThrow('stop');
    f.controller.abort();
    await expect(f.provider.list({ cwd: '/anchor-a' })).rejects.toThrow();
  });

  it('counts malformed file bytes toward the bounded discovery budget', async () => {
    const f = fixture();
    for (let i = 0; i < 40; i++) f.add(`ssh://alpha/home/user/.agents/skills/${String(i).padStart(2, '0')}.md`, 'x'.repeat(256 * 1024));
    const result = await f.provider.list({ cwd: '/anchor-a' });
    expect(result.complete).toBe(false); expect(result.candidates).toEqual([]);
    expect(f.files.readSnapshot).toHaveBeenCalledTimes(32);
    expect(f.warn.mock.calls.some(([message]) => message.includes('discovery budget'))).toBe(true);
  });

  it('uses at most four concurrent reads while keeping deterministic candidate order', async () => {
    const f = fixture();
    for (let i = 0; i < 6; i++) f.add(`ssh://alpha/home/user/.agents/skills/${i}.md`, source(`skill-${i}`));
    const original = f.files.readSnapshot.getMockImplementation()!;
    let active = 0, peak = 0;
    f.files.readSnapshot.mockImplementation(async (...args) => {
      active += 1; peak = Math.max(peak, active);
      try { await new Promise(resolve => setTimeout(resolve, String(args[0].targetKey).endsWith('0.md') ? 15 : 2)); return await original(...args); }
      finally { active -= 1; }
    });
    const result = await f.provider.list({ cwd: '/anchor-a' });
    expect(peak).toBe(4); expect(active).toBe(0);
    expect(result.candidates.map(s => s.name)).toEqual(['skill-0', 'skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5']);
  });

  it('preserves official invocation controls and rejects obsolete or invalid frontmatter fields', () => {
    expect(parseRemoteSkill(source('a', 'BODY', 'disable-model-invocation: yes\nuser-invocable: false\nwhenToUse: on request\n')))
      .toMatchObject({ content: 'BODY', whenToUse: 'on request', invocation: { modelInvocable: false, userInvocable: false } });
    expect(() => parseRemoteSkill(source('a', '', 'modelInvocable: true\n'))).toThrow('legacy');
    expect(() => parseRemoteSkill(source('a', '', 'user-invocable: maybe\n'))).toThrow('boolean');
    expect(parseRemoteSkill(source('../bad'))).toBeUndefined();
  });
});
