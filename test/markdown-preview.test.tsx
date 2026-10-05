// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import { mountSessionMarkdownImages, SessionMarkdownPreview } from '../client/markdown-preview.js';

const seen = vi.hoisted(() => ({ props: [] as any[] }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: element } = await import('react');
  return { MarkdownText: (props: any) => {
    seen.props.push(props);
    const images = [...props.text.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/gu)];
    return element('article', {}, props.text, ...images.map((match, index) => {
      const src = props.streaming ? undefined : props.pathImages.resolve(match[2]);
      return src === undefined ? element('span', { key: index }, match[1]) : element('img', { key: index, alt: match[1], src });
    }));
  } };
});

let container: HTMLDivElement; let root: Root;
let create: ReturnType<typeof vi.fn>; let revoke: ReturnType<typeof vi.fn>;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const success = () => ({ ok: true, value: { absolutePath: '/remote/image.png', version: 'image-v1', offset: 0, eof: true, bytes: png.length, data: png } });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  let sequence = 0; create = vi.fn(() => `blob:document-${++sequence}`); revoke = vi.fn();
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = create; static revokeObjectURL = revoke; });
  seen.props.length = 0;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function props(extra = {}) {
  return { resourceAddress: sessionFileAddress('file-owner', '/remote/note.md'), sessionId: 'visible-but-not-file-owner',
    content: { kind: 'text', text: '# Heading\n![image](图%20片.png)', pages: [], eof: true },
    useResource: () => ({ value: { absolutePath: '/remote/note.md', version: 'source-v1' } }),
    readImageBytes: vi.fn(async () => success()), addResource: vi.fn(), setResources: vi.fn(), t: (key: string) => key, ...extra };
}
async function render(value: any, strict = false) {
  await act(async () => root.render(strict ? createElement(StrictMode, {}, createElement(SessionMarkdownPreview, value)) : createElement(SessionMarkdownPreview, value)));
}

describe('public Markdown image slot', () => {
  it('uses file-resource authority, retains primitive features, and works through StrictMode cleanup', async () => {
    const input = props(); await render(input, true);
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/u);
    expect(input.readImageBytes).toHaveBeenCalledWith('file-owner', '图 片.png', expect.objectContaining({ baseFile: '/remote/note.md' }), expect.any(AbortSignal));
    expect(seen.props.at(-1)).toMatchObject({ text: input.content.text, streaming: false, labels: { footnotes: 'footnotes', code: { copyLabel: 'copy', toolbarLabels: { wrapLabel: 'wrap' } } } });
    expect(container.textContent).toContain('# Heading');
    await act(async () => root.render(null)); expect(revoke).toHaveBeenCalledWith(expect.stringMatching(/^blob:/u));
  });

  it('does not leak old images when a retained slot switches file sessions', async () => {
    const a = props(); await render(a);
    const oldUrl = container.querySelector('img')!.getAttribute('src');
    let release!: (value: ReturnType<typeof success>) => void;
    const pending = new Promise<ReturnType<typeof success>>(resolve => { release = resolve; });
    const b = props({ resourceAddress: sessionFileAddress('other-session', '/remote/note.md'), readImageBytes: vi.fn(() => pending) });
    await render(b); expect(container.querySelector('img')).toBeNull(); expect(revoke).toHaveBeenCalledWith(oldUrl);
    await act(async () => { release(success()); });
    expect(container.querySelector('img')?.getAttribute('src')).not.toBe(oldUrl);
    expect(b.readImageBytes.mock.calls[0][0]).toBe('other-session');
  });

  it('preserves paging until EOF and invalidates a completed source reload with an unchanged stat token', async () => {
    const a = props({ content: { kind: 'text', text: '![image](image.png)', pages: [], eof: false } });
    await render(a); expect(a.readImageBytes).not.toHaveBeenCalled();
    const complete = { ...a, content: { ...a.content, text: `${a.content.text}\nmore text`, eof: true } };
    await render(complete); expect(a.readImageBytes).toHaveBeenCalledTimes(1);
    await render(complete); expect(a.readImageBytes).toHaveBeenCalledTimes(1);
    await render({ ...complete, content: { ...complete.content, text: '![replacement](new.png)' } });
    expect(a.readImageBytes).toHaveBeenCalledTimes(2); expect(revoke).toHaveBeenCalledOnce();
  });

  it('replaces only the renderer image dependency snapshot on reload and clears it on close', async () => {
    const read = vi.fn(async (_session, path) => ({ ...success(), value: { ...success().value, absolutePath: `/remote/${path}` } }));
    const currentDependencies = new Set<string>();
    // The native owner merges its source with this renderer's snapshot; other
    // renderer/plugin pins are not owned or directly disposed by this hook.
    const source = sessionFileAddress('file-owner', '/remote/note.md');
    const setResources = vi.fn((addresses: string[]) => { currentDependencies.clear(); [source, ...addresses].forEach(address => currentDependencies.add(address)); });
    const a = props({ readImageBytes: read, setResources, content: { kind: 'text', text: '![one](first.png)', pages: [], eof: true } });
    await render(a);
    expect(currentDependencies).toEqual(new Set([source, sessionFileAddress('file-owner', '/remote/first.png')]));
    await render({ ...a, content: { ...a.content, text: '![two](second.png)' } });
    expect(currentDependencies).toEqual(new Set([source, sessionFileAddress('file-owner', '/remote/second.png')]));
    await act(async () => root.render(null));
    expect(currentDependencies).toEqual(new Set([source]));
  });

  it('counts unique decoded image paths rather than query aliases against the render-pass bound', async () => {
    const text = [...Array.from({ length: 70 }, (_, i) => `![alias](same.png?q=${i})`), '![second](other.png)'].join('\n');
    const input = props({ content: { kind: 'text', text, pages: [], eof: true } });
    await render(input);
    expect(input.readImageBytes.mock.calls.map(args => args[1])).toEqual(['same.png', 'other.png']);
  });

  it('shadows only the public Markdown body key and disposes its own slot and locale', async () => {
    const slotDispose = vi.fn(); const localeDispose = vi.fn();
    const scope = { remote: { workspaceFiles: { readBytes: vi.fn(async () => success()) } },
      locale: { register: vi.fn(() => localeDispose) },
      slots: { inject: vi.fn((_key, callback) => callback()), register: vi.fn(() => slotDispose) } };
    const context = { inject: vi.fn((_dependencies, callback) => ({ dispose: callback(scope) })) };
    const dispose = mountSessionMarkdownImages(context as never);
    expect(scope.slots.register.mock.calls[0][0]).toMatchObject({ name: 'sidebar.right.tab.document', key: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown', priority: -100, locale: 'sshRemoteMarkdown' });
    expect(scope.locale.register).toHaveBeenCalledWith('sshRemoteMarkdown', expect.objectContaining({ en: expect.any(Object), zh: expect.any(Object) }));
    await dispose(); expect(slotDispose).toHaveBeenCalledOnce(); expect(localeDispose).toHaveBeenCalledOnce();
  });
});
