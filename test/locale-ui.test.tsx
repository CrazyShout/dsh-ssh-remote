// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { en, ru, zh } from '../client/messages.js';
import { installLocale, localized, t, formatDateTime } from '../client/locale.js';
import { localizeEnvironmentError, localizeSourceText } from '../client/connection-ui.js';
import { localeFixture } from './locale-fixture.js';
import { RemoteEditorPane } from '../client/editor.js';
import { EditorModel } from '../client/editor-model.js';
import { RemoteToolsTitle } from '../client/native-panels.js';
import { GettingStarted } from '../client/start-guide.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { ...(await import('./native-control-stubs.js')).nativeControls,
    Button: ({ children, variant: _v, size: _s, ...props }: any) => h('button', props, children),
    Input: (props: any) => h('input', props),
    Modal: ({ open, footer }: any) => open ? h('div', { role: 'dialog' }, footer) : null,
  };
});

describe('official locale integration', () => {
  it('updates the public workbench title slot without replacing a persisted tab', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const fixture = localeFixture(), release = installLocale(fixture.locale);
    const element = document.createElement('div'), root = createRoot(element), Title = localized(RemoteToolsTitle);
    try {
      await act(async () => root.render(createElement(Title)));
      expect(element.textContent).toBe('远程工作台');
      await act(async () => fixture.change('en'));
      expect(element.textContent).toBe('Remote workbench');
    } finally { await act(async () => root.unmount()); release(); }
  });
  it('ships balanced dictionaries, matching placeholders, and only registered message keys', () => {
    expect(Object.keys(en)).toEqual(Object.keys(zh));
    expect(Object.keys(ru)).toEqual(Object.keys(en));
    const params = (value: string) => [...value.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort();
    for (const [key, value] of [...Object.entries(en), ...Object.entries(ru)]) {
      expect(value.trim(), key).not.toBe('');
      expect(params(value), key).toEqual(params(key));
    }
    for (const file of readdirSync(resolve('client')).filter(file => /\.tsx?$/u.test(file) && !['messages.ts', 'markdown-preview.tsx'].includes(file))) {
      const source = ts.createSourceFile(file, readFileSync(resolve('client', file), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && ts.isStringLiteral(node.arguments[0])) {
          expect(Object.hasOwn(en, node.arguments[0].text), `${file}: ${node.arguments[0].text}`).toBe(true);
        }
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) && /\p{Script=Han}/u.test(node.text)) {
          expect(ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === 't',
            `${file}: untranslated copy ${node.text}`).toBe(true);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });

  it('translates host-provided connection hints with the active dictionary', () => {
    const fixture = localeFixture(), release = installLocale(fixture.locale);
    try {
      fixture.change('en');
      expect(localizeSourceText('请在本机终端核对主机指纹；插件不会修改 known_hosts。'))
        .toBe('Verify the host fingerprint in a local terminal; the plugin does not modify known_hosts.');
      expect(localizeSourceText('host specific detail')).toBe('host specific detail');
      // A raw diagnostic that resembles a UI label is not a Host template.
      expect(localizeSourceText('目录：/work/中文 space.txt')).toBe('目录：/work/中文 space.txt');
      const longDiagnostic = 'x 超过 '.repeat(32768);
      expect(localizeSourceText(longDiagnostic)).toBe(longDiagnostic);
      const detail = 'EACCES\n/work/中文 {value1} <script> / file';
      expect(localizeSourceText(`转发进程启动失败：${detail}`)).toBe(`Failed to start the forward process: ${detail}`);
      expect(localizeSourceText('转发进程启动失败：')).toBe('Failed to start the forward process: ');
      expect(localizeSourceText('检查更新失败（HTTP 503），请稍后重试。')).toBe('Update check failed (HTTP 503). Try again later.');
      expect(localizeSourceText('路径大小写或 Unicode 冲突：Foo / foo')).toBe('Case or Unicode conflict: Foo / foo');
      expect(localizeSourceText(undefined)).toBeUndefined();
      expect(localizeEnvironmentError('环境检查失败：ENOENT')).toBe('Environment check failed: ENOENT');
      expect(localizeEnvironmentError('plain failure')).toBe('plain failure');
    }
    finally {
      release();
    }
  });

  it('serves Russian copy through the official locale service', () => {
    const fixture = localeFixture(), release = installLocale(fixture.locale);
    try {
      fixture.change('ru');
      expect(t('连接')).toBe('Подключить');
      expect(localizeSourceText('请在本机终端核对主机指纹；插件不会修改 known_hosts。'))
        .toBe('Проверьте отпечаток хоста в локальном терминале; плагин не изменяет known_hosts.');
      expect(localizeSourceText('转发进程启动失败：EACCES')).toBe('Не удалось запустить процесс проброса: EACCES');
      expect(localizeSourceText('forward detail')).toBe('forward detail');
    }
    finally {
      release();
    }
  });

  it('changes the mounted editor language without replacing its input, draft, identity or selection', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const fixture = localeFixture(), release = installLocale(fixture.locale);
    const rpc = {
      read: vi.fn(async (sessionId: string, path: string) => ({ ok: true as const, value: {
        sessionId, path, rootUri: 'ssh://hk/work', alias: 'hk', version: 'v1:fixture',
        text: 'original', bom: false, newline: 'lf' as const, maxBytes: 262144,
      } })),
      save: vi.fn(), status: vi.fn(),
    };
    const model = new EditorModel('original-session', rpc);
    await model.open('/work/中文 space.txt');
    model.edit('unsaved draft');
    const element = document.createElement('div'), root = createRoot(element);
    document.body.append(element);
    const Editor = localized(RemoteEditorPane);
    try {
      await act(async () => root.render(createElement(Editor, { model })));
      const input = element.querySelector('textarea')!;
      input.focus(); input.setSelectionRange(2, 5);
      expect(element.textContent).toContain('保存');
      await act(async () => fixture.change('en'));
      expect(formatDateTime(Date.UTC(2026, 9, 20, 8))).toContain('Oct');
      expect(element.querySelector('textarea')).toBe(input);
      expect(input.value).toBe('unsaved draft');
      expect(input.selectionStart).toBe(2); expect(input.selectionEnd).toBe(5);
      expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Remote text editor');
      expect([...element.querySelectorAll('button')].some(button => button.textContent === 'Save')).toBe(true);
      expect(rpc.save).not.toHaveBeenCalled(); expect(rpc.read).toHaveBeenCalledTimes(1);
      expect(model.sessionId).toBe('original-session');
      await act(async () => fixture.change('zh'));
      expect(formatDateTime(Date.UTC(2026, 9, 20, 8))).toContain('年');
      expect(input.value).toBe('unsaved draft');
      expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('远程文本编辑器');
    } finally {
      await act(async () => root.unmount()); model.dispose(); release(); element.remove();
    }
    expect(fixture.listeners.size).toBe(0);
    expect(fixture.dictionaries.size).toBe(0);
  });

  it('keeps getting started collapsed and changes its copy without an installer or SSH side effect', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const fixture = localeFixture(), release = installLocale(fixture.locale);
    const element = document.createElement('div'), root = createRoot(element), Guide = localized(GettingStarted);
    try {
      await act(async () => root.render(createElement(Guide)));
      expect(element.querySelector('details')?.open).toBe(false);
      await act(async () => fixture.change('en'));
      expect(element.querySelector('summary')?.textContent).toBe('Getting started');
      expect(element.textContent).toContain('Add workspace');
      expect(element.querySelector('code')?.textContent).toBe('ssh -o BatchMode=yes devbox true');
      expect(t('SSH 主机 {value1}', { value1: '<script>host</script>' })).toBe('SSH host <script>host</script>');
      expect(element.querySelector('script')).toBeNull();
    } finally { await act(async () => root.unmount()); release(); }
  });
});
