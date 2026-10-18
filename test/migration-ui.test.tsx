// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MigrationWizard } from '../client/migration.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  return { Button: ({ children, variant: _v, size: _s, ...props }: any) => h('button', props, children), Input: (props: any) => h('input', props) };
});
it('previews an escaped diff without applying, then applies and rolls back only after explicit clicks', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const id = '00000000-0000-4000-8000-000000000000';
  const preview = { token: id, configPath: '/fixture/config', fragmentPath: '/fixture/fragment', before: { config: '# original', fragment: '' },
    after: { config: 'Include fixture', fragment: '# <script>not markup</script>' }, hosts: [{ name: 'old', alias: 'old', user: 'alice', host: 'host', port: 22 }], ready: true };
  const ssh = { migrationPreview: vi.fn(async () => ({ ok: true, value: preview })),
    migrationApply: vi.fn(async () => ({ ok: true, value: { id, verified: ['old'], aliases: { old: 'old' }, errors: {} } })),
    migrationRollback: vi.fn(async () => ({ ok: true, value: true })) };
  const element = document.createElement('div'), root = createRoot(element), complete = vi.fn();
  const click = async (label: string) => act(async () => [...element.querySelectorAll('button')].find(button => button.textContent === label)!.click());
  await act(async () => root.render(createElement(MigrationWizard, { ssh: ssh as any, onComplete: complete })));
  expect(ssh.migrationPreview).not.toHaveBeenCalled(); expect(ssh.migrationApply).not.toHaveBeenCalled();
  await click('检查旧配置');
  expect(element.textContent).toContain('<script>not markup</script>'); expect(element.querySelector('script')).toBeNull();
  expect(ssh.migrationApply).not.toHaveBeenCalled();
  await click('确认、备份并迁移'); expect(ssh.migrationApply).toHaveBeenCalledWith(id); expect(complete).toHaveBeenCalledTimes(1);
  await click('回滚本次迁移'); expect(ssh.migrationRollback).toHaveBeenCalledWith(id); expect(complete).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
});
