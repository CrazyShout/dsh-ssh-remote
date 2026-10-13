import { Context } from '@deepseek-ai/cordis';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SshRemoteEditor, decodeEditorText, EDITOR_MAX_BYTES, type EditorDocument } from '../src/editor.js';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';

const cleanup: Array<() => unknown> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.restoreAllMocks(); });
async function fixture() {
  const raw = await mkdtemp(join(tmpdir(), 'dsh-editor-'));
  cleanup.push(() => rm(raw, { recursive: true, force: true }));
  const root = await realpath(raw);
  const process = spawn('python3', [fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url)), 'connect', '--stdio', '--direct']);
  const client = new RemoteHelperRpcClient({ readable: process.stdout, writable: process.stdin, closeTransport: () => process.kill('SIGTERM') });
  cleanup.push(async () => {
    if (process.exitCode !== null || process.signalCode !== null) return;
    const done = new Promise(resolve => process.once('exit', resolve));
    client.close(); await done;
  });
  await client.initialize({ clientId: randomUUID() });
  const context = new Context();
  cleanup.push(() => context.fiber.dispose());
  const resolve = (path: string) => path === '/anchor' ? `ssh://test${root}` : path === '/other' ? `ssh://other${root}` : undefined;
  const editor = new SshRemoteEditor(context, { client: async () => client }, resolve);
  const scope = { sessionId: 'owner-session' as any, workspaceRoot: '/anchor' };
  const signal = new AbortController().signal;
  await writeFile(join(root, '中文 space.txt'), '\ufefffirst\r\n第二行\r\n');
  return { root, editor, scope, signal, client };
}
const save = (doc: EditorDocument, text: string) => ({ ...doc, text, operationId: randomUUID() });

describe('session-owned remote editor', () => {
  it.skipIf(process.getuid?.() === 0)('reports permission refusal without changing the file', async () => {
    const f = await fixture();
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    await chmod(f.root, 0o500);
    try {
      expect((await f.editor.save(f.scope, save(doc, 'cannot write'))).state).toBe('failed');
      expect(await readFile(join(f.root, '中文 space.txt'), 'utf8')).toBe('\ufefffirst\r\n第二行\r\n');
    } finally { await chmod(f.root, 0o700); }
  });
  it('reads a complete strong snapshot and preserves UTF-8 BOM and CRLF on save', async () => {
    const f = await fixture();
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    expect(doc).toMatchObject({ text: 'first\n第二行\n', bom: true, newline: 'crlf', alias: 'test' });
    expect(doc.version).toMatch(/^v1:/);
    const request = save(doc, 'changed\n第二行\n');
    const result = await f.editor.save(f.scope, request);
    expect(result.state).toBe('saved');
    expect(await readFile(join(f.root, '中文 space.txt'), 'utf8')).toBe('\ufeffchanged\r\n第二行\r\n');
    expect(await f.editor.save(f.scope, request)).toEqual(result);
    await expect(f.editor.save(f.scope, { ...request, text: 'different' })).rejects.toThrow('不同内容');
  });

  it('detects same-daemon competing editor saves and does not overwrite the winner', async () => {
    const f = await fixture();
    const a = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    const second = { ...f.scope, sessionId: 'second-session' as any };
    const b = await f.editor.read(second, '中文 space.txt', f.signal);
    const results = await Promise.all([f.editor.save(f.scope, save(a, 'winner-a')), f.editor.save(second, save(b, 'winner-b'))]);
    expect(results.map(x => x.state).sort()).toEqual(['conflict', 'saved']);
    expect((await f.editor.read(f.scope, '中文 space.txt', f.signal)).text).toBe(results[0].state === 'saved' ? 'winner-a' : 'winner-b');
  });

  it('rejects local, cross-host, traversal, changed-root and symlink requests', async () => {
    const f = await fixture();
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    for (const path of ['../outside', '/etc/passwd', `ssh://other${doc.path}`, 'file:///etc/passwd']) {
      await expect(f.editor.read(f.scope, path, f.signal)).rejects.toThrow();
    }
    await expect(f.editor.read({ ...f.scope, workspaceRoot: '/local' }, doc.path, f.signal)).rejects.toThrow('SSH 工作区');
    await expect(f.editor.save({ ...f.scope, workspaceRoot: '/other' }, save(doc, 'bad'))).rejects.toThrow('身份已改变');
    await symlink(join(f.root, '中文 space.txt'), join(f.root, 'link.txt'));
    await expect(f.editor.read(f.scope, 'link.txt', f.signal)).rejects.toThrow();
    expect((await f.editor.status({ ...f.scope, sessionId: 'unrelated' as any }, randomUUID(), f.signal)).state).toBe('unknown');
  });

  it('verifies a lost commit acknowledgement without resending the write', async () => {
    const f = await fixture();
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    const original = f.client.call.bind(f.client);
    let commits = 0;
    vi.spyOn(f.client, 'call').mockImplementation(async (method, params, options) => {
      const result = await original(method, params, options);
      if (method === 'fs/writeCommit') { commits++; throw new Error('lost acknowledgement'); }
      return result;
    });
    const request = save(doc, 'saved remotely');
    expect((await f.editor.save(f.scope, request)).state).toBe('unknown');
    await expect(f.editor.save(f.scope, save(doc, 'do not send'))).rejects.toThrow('待确认');
    const verified = await f.editor.status(f.scope, request.operationId, f.signal);
    expect(verified.state).toBe('saved');
    expect(commits).toBe(1);
    expect((await f.editor.save(f.scope, request)).state).toBe('saved');
    expect(commits).toBe(1);
  });

  it('keeps an unchanged remote file unknown after an interrupted commit', async () => {
    const f = await fixture();
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    const original = f.client.call.bind(f.client);
    vi.spyOn(f.client, 'call').mockImplementation(async (method, params, options) => {
      if (method === 'fs/writeCommit') throw new Error('connection lost');
      return original(method, params, options);
    });
    const request = save(doc, 'not confirmed');
    expect((await f.editor.save(f.scope, request)).state).toBe('unknown');
    expect((await f.editor.status(f.scope, request.operationId, f.signal)).state).toBe('unknown');
    expect(await readFile(join(f.root, '中文 space.txt'), 'utf8')).toBe('\ufefffirst\r\n第二行\r\n');
  });

  it('does not read or save truncated, binary, mixed-newline or invalid UTF-8 content', async () => {
    const f = await fixture();
    for (const bytes of [Buffer.alloc(EDITOR_MAX_BYTES + 1, 65), Buffer.from([0xff]), Buffer.from('nul\0text'), Buffer.from('a\r\nb\n')]) {
      await writeFile(join(f.root, 'invalid'), bytes);
      await expect(f.editor.read(f.scope, 'invalid', f.signal)).rejects.toThrow();
    }
    expect(decodeEditorText(Buffer.from('no final newline'))).toEqual({ text: 'no final newline', newline: 'lf', bom: false });
    const doc = await f.editor.read(f.scope, '中文 space.txt', f.signal);
    await expect(f.editor.save(f.scope, save(doc, '\ud800'))).rejects.toThrow('编码');
    await expect(f.editor.save(f.scope, save(doc, 'x'.repeat(EDITOR_MAX_BYTES + 1)))).rejects.toThrow('256 KiB');
    const abort = AbortSignal.abort();
    await expect(f.editor.read(f.scope, doc.path, abort)).rejects.toThrow();
  });
});
