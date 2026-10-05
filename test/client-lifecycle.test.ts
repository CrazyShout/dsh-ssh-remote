import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../client/index.js';
import { TYPERT_REMOTE } from '../client/typert.remote-client.js';
import { TYPERT } from '../src/typert.host.js';
import { mountNativePanels } from '../client/native-panels.js';

// The real primitives package ships browser-only CSS imports; at runtime the
// DSH loader resolves it through its module table instead of Node. This test
// never renders, so a stub keeps the module graph loadable.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  IconFolderCloseRegular: () => null,
  IconPlusOutlineRegular: () => null,
  Input: () => null,
  Modal: () => null,
  Pill: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

describe('client lifecycle', () => {
  it('ships helper lifecycle methods from the source-owned Remote descriptor', () => {
    const methods = (TYPERT_REMOTE as any).descriptors.map((entry: { method: string }) => entry.method);
    expect(methods).toEqual(expect.arrayContaining([
      'config', 'statuses', 'browse', 'createDirectory', 'materializeWorkspace',
      'connectHost', 'disconnectHost', 'retryHost', 'diagnostics',
      'workspaceInfo',
    ]));
    expect(TYPERT.invocations.map((entry) => entry.method)).toEqual(methods);
    for (const entry of TYPERT.invocations) {
      expect(entry.result.create().safeParse(undefined).success).toBe(false);
      for (const parameter of entry.parameters) {
        expect(parameter.codec.create().parse('gpu')).toBe('gpu');
      }
    }
    for (const entry of (TYPERT_REMOTE as any).descriptors) {
      expect(typeof entry.result.create().parse).toBe('function');
      for (const parameter of entry.parameters) {
        expect(parameter.codec.create().parse('gpu')).toBe('gpu');
      }
    }
  });

  it.each([true, false, 'desktop'] as const)('mounts and disposes directory services with optional cancellable picker: %s', async (mode) => {
    const nativeAvailable = mode !== false;
    const desktopPicker = mode === 'desktop' ? { pick: vi.fn(async () => '/desktop-local') } : undefined;
    if (desktopPicker) vi.stubGlobal('__DSH_DIRECTORY_PICKER__', desktopPicker);
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
      remote: {
        sshRemote: {},
        directoryPicker: { pick: vi.fn(async () => ({ ok: true, value: '/native-local' })) },
      },
      workspaces: {
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
      const dispose = (deps.includes('remote.directoryPicker') && !nativeAvailable ? () => {} : callback({
        ...childScope, inject,
        ...(deps.includes('uiWorkspace') ? { uiWorkspace: directoryService } : {}),
      })) as () => void;
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
      'inject:remote.directoryPicker',
      'inject:uiWorkspace',
      'register:ssh-remote',
      'register:conversation.hero.workspace.directoryFlow',
      'register:sidebar.workspaces.directoryFlow',
      'inject:remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:slots,locale,remote.workspaceFiles',
    ]);

    const flow = (childScope.slots.register.mock.calls[1][0] as any).inject();
    const controller = new AbortController();
    await expect(flow.pickLocal(controller.signal)).resolves.toBe(desktopPicker ? '/desktop-local' : nativeAvailable ? '/native-local' : '/local');
    await flow.listLocal('/local');
    await flow.createLocalDirectory('/local', 'new');
    expect(directoryService.pickDirectory).toHaveBeenCalledTimes(nativeAvailable ? 0 : 1);
    if (desktopPicker) {
      expect(desktopPicker.pick).toHaveBeenCalledOnce();
      expect(childScope.remote.directoryPicker.pick).not.toHaveBeenCalled();
    } else if (nativeAvailable) expect(childScope.remote.directoryPicker.pick).toHaveBeenCalledWith(controller.signal);
    expect(directoryService.listDirectory).toHaveBeenCalledWith('/local');
    expect(directoryService.createDirectory).toHaveBeenCalledWith('/local', 'new');
    await dispose?.();

    expect(events).toEqual([
      'remote:mount',
      'inject:remote.sshRemote,slots,workspaces',
      'inject:remote.directoryPicker',
      'inject:uiWorkspace',
      'register:ssh-remote',
      'register:conversation.hero.workspace.directoryFlow',
      'register:sidebar.workspaces.directoryFlow',
      'inject:remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:slots,locale,remote.workspaceFiles',
      'dispose:sidebar.workspaces.directoryFlow',
      'dispose:conversation.hero.workspace.directoryFlow',
      'dispose:ssh-remote',
      'remote:dispose',
    ]);
  });

  it('registers native panel actions only through optional service and slot injections', async () => {
    const unregister = vi.fn();
    let selected = 'session-a';
    const scope = {
      remote: { sshRemote: { workspaceInfo: vi.fn(async () => ({ ok: true, value: null })) } },
      slots: {
        inject: vi.fn((_slot, callback) => callback()),
        register: vi.fn(() => unregister),
      },
      sidebarRight: { mounted: { getSnapshot: () => selected }, openTab: vi.fn() },
      sidebarRightTabs: { get: vi.fn(() => ({})), subscribe: vi.fn(() => () => {}) },
    };
    const ctx = {
      inject: vi.fn((dependencies, callback) => {
        expect(dependencies).toEqual(['remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs']);
        return { dispose: callback(scope) };
      }),
    };
    const dispose = mountNativePanels(ctx as never);
    expect(scope.slots.inject).toHaveBeenCalledWith('conversation.session.header.utilities', expect.any(Function));
    expect(scope.slots.inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function));
    const options = (scope.slots.register.mock.calls[0] as any)[0];
    expect(options).toMatchObject({ name: 'conversation.session.header.utilities', id: 'dsh-ssh-remote.native-panels' });
    const face = options.inject('session-a');
    face.openPanel('files');
    face.openPanel('terminal');
    expect(scope.sidebarRight.openTab.mock.calls).toEqual([['files'], ['terminal']]);
    selected = 'session-b';
    expect(() => face.openPanel('terminal')).toThrow('会话已切换');
    await dispose();
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('does not await missing native-panel modules or register against an older backend', async () => {
    const disposePending = vi.fn();
    const pending = new Promise<void>(() => {}) as Promise<void> & { dispose(): void };
    pending.dispose = disposePending;
    const missing = { inject: vi.fn(() => pending) };
    const dispose = mountNativePanels(missing as never);
    await dispose();
    expect(disposePending).toHaveBeenCalledOnce();
    const slots = { inject: vi.fn() };
    const older = { inject: vi.fn((_dependencies, callback) => ({ dispose: callback({ remote: { sshRemote: {} }, slots }) })) };
    await mountNativePanels(older as never)();
    expect(slots.inject).not.toHaveBeenCalled();
  });
});
