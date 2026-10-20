// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { en, zh } from '../client/messages.js';
import { installLocale, localized, t } from '../client/locale.js';
import { localeFixture } from './locale-fixture.js';
import { RemoteEditorPane } from '../client/editor.js';
import { EditorModel } from '../client/editor-model.js';
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
  it('ships balanced dictionaries, matching placeholders, and only registered message keys', () => {
    expect(Object.keys(en)).toEqual(Object.keys(zh));
    const params = (value: string) => [...value.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort();
    for (const [key, value] of Object.entries(en)) {
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
      expect(element.querySelector('textarea')).toBe(input);
      expect(input.value).toBe('unsaved draft');
      expect(input.selectionStart).toBe(2); expect(input.selectionEnd).toBe(5);
      expect(element.querySelector('section')?.getAttribute('aria-label')).toBe('Remote text editor');
      expect([...element.querySelectorAll('button')].some(button => button.textContent === 'Save')).toBe(true);
      expect(rpc.save).not.toHaveBeenCalled(); expect(rpc.read).toHaveBeenCalledTimes(1);
      expect(model.sessionId).toBe('original-session');
      await act(async () => fixture.change('zh'));
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
