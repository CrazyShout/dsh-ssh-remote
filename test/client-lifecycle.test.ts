import { describe, expect, it, vi } from 'vitest';
import { apply } from '../client/index.js';

describe('client lifecycle', () => {
  it('mounts the Remote contribution before injecting and consuming its namespace', async () => {
    const events: string[] = [];
    const disposeMount = vi.fn(async () => {
      events.push('remote:dispose');
    });

    const childScope = {
      remote: { sshRemote: {} },
      workspaces: {
        pickDirectory: vi.fn(),
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

    const ctx = {
      remote: {
        $mount: vi.fn(async () => {
          events.push('remote:mount');
          return disposeMount;
        }),
      },
      inject: vi.fn((deps: string[], callback: (scope: typeof childScope) => unknown) => {
        events.push(`inject:${deps.join(',')}`);
        const dispose = callback(childScope) as () => void;
        const fiber = Promise.resolve() as Promise<void> & { dispose: () => Promise<void> };
        fiber.dispose = async () => {
          dispose();
        };
        return fiber;
      }),
    };

    const dispose = await apply(ctx as never);

    expect(events).toEqual([
      'remote:mount',
      'inject:remote.sshRemote,slots,workspaces',
      'register:ssh-remote',
      'register:conversation.hero.workspace.directoryFlow',
      'register:sidebar.workspaces.directoryFlow',
    ]);

    await dispose?.();

    expect(events).toEqual([
      'remote:mount',
      'inject:remote.sshRemote,slots,workspaces',
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
