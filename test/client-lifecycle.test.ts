import { describe, expect, it, vi } from 'vitest';
import { apply } from '../client/index.js';
import { TYPERT_REMOTE } from '../client/typert.remote-client.js';
import { TYPERT } from '../src/typert.host.js';

// The real primitives package ships browser-only CSS imports; at runtime the
// DSH loader resolves it through its module table instead of Node. This test
// never renders, so a stub keeps the module graph loadable.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  IconFolderClose16: () => null,
  IconPlusOutline16: () => null,
  Input: () => null,
  Modal: () => null,
  Pill: () => null,
}));

describe('client lifecycle', () => {
  it('ships helper lifecycle methods from the source-owned Remote descriptor', () => {
    const methods = (TYPERT_REMOTE as any).descriptors.map((entry: { method: string }) => entry.method);
    expect(methods).toEqual([
      'config', 'statuses', 'browse', 'createDirectory', 'materializeWorkspace',
      'connectHost', 'disconnectHost', 'retryHost', 'diagnostics',
    ]);
    expect(TYPERT.invocations.map((entry) => entry.method)).toEqual(methods);
  });

  it.each(['legacy', 'split'] as const)('mounts and disposes Remote and directory services (%s)', async (mode) => {
    const events: string[] = [];
    const disposeMount = vi.fn(async () => {
      events.push('remote:dispose');
    });

    const directoryService = {
      pickDirectory: vi.fn(async () => '/local'),
      listDirectory: vi.fn(async () => ({ path: '/local', entries: [] })),
      createDirectory: vi.fn(async () => '/local/new'),
    };
    const childScope = {
      remote: { sshRemote: {} },
      workspaces: {
        ...(mode === 'legacy' ? directoryService : {}),
        create: vi.fn(),
        rename: vi.fn(),
      },
      slots: {
        inject: vi.fn((_name: string, callback: () => unknown) => {
          const value = callback();
          if (value && typeof value === 'object' && Symbol.iterator in value) {
            const disposers = [...value as Iterable<() => void>];
            return () => disposers.reverse().forEach((dispose) => dispose());
          }
          return value;
        }),
        register: vi.fn((options: { id?: string; name: string }) => {
          const id = options.id ?? options.name;
          events.push(`register:${id}`);
          return () => events.push(`dispose:${id}`);
        }),
      },
    };

    const inject = vi.fn((deps: string[], callback: (scope: any) => unknown) => {
      events.push(`inject:${deps.join(',')}`);
      const dispose = callback({
        ...childScope, inject,
        ...(deps.includes('uiWorkspace') ? { uiWorkspace: directoryService } : {}),
      }) as () => void;
      // Cordis effects must return a disposer, not the child Fiber itself.
      expect(typeof dispose).toBe('function');
      const fiber = Promise.resolve() as Promise<void> & { dispose: () => Promise<void> };
      fiber.dispose = async () => { await dispose(); };
      return fiber;
    });
    const ctx = {
      remote: {
        $mount: vi.fn(async () => {
          events.push('remote:mount');
          return disposeMount;
        }),
      },
      inject,
    };

    const dispose = await apply(ctx as never);

    expect(events).toEqual([
      'remote:mount',
      'inject:remote.sshRemote,slots,workspaces',
      ...(mode === 'split' ? ['inject:uiWorkspace'] : []),
      'register:ssh-remote',
      'register:conversation.hero.workspace.directoryFlow',
      'register:sidebar.workspaces.directoryFlow',
    ]);

    const flow = (childScope.slots.register.mock.calls[1][0] as any).inject();
    await expect(flow.pickLocal()).resolves.toBe('/local');
    await flow.listLocal('/local');
    await flow.createLocalDirectory('/local', 'new');
    expect(directoryService.pickDirectory).toHaveBeenCalledOnce();
    expect(directoryService.listDirectory).toHaveBeenCalledWith('/local');
    expect(directoryService.createDirectory).toHaveBeenCalledWith('/local', 'new');
    await dispose?.();

    expect(events).toEqual([
      'remote:mount',
      'inject:remote.sshRemote,slots,workspaces',
      ...(mode === 'split' ? ['inject:uiWorkspace'] : []),
      'register:ssh-remote',
      'register:conversation.hero.workspace.directoryFlow',
      'register:sidebar.workspaces.directoryFlow',
      'dispose:sidebar.workspaces.directoryFlow',
      'dispose:conversation.hero.workspace.directoryFlow',
      'dispose:ssh-remote',
      'remote:dispose',
    ]);
  });
});
