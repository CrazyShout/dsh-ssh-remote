import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../client/index.js';
import { TYPERT_REMOTE } from '../client/typert.remote-client.js';
import { TYPERT } from '../src/typert.host.js';
import { Workbench } from '../client/workbench.js';
import { mountNativePanels } from '../client/native-panels.js';

// The real primitives package ships browser-only CSS imports; at runtime the
// DSH loader resolves it through its module table instead of Node. This test
// never renders, so a stub keeps the module graph loadable.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
  IconFolderCloseRegular: () => null,
  IconPlusOutlineRegular: () => null,
  IconGlobeOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  IconSearchOutlineRegular: () => null,
  IconLinkOutlineRegular: () => null,
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
        if (parameter.name === 'selections') { expect(parameter.codec.create().parse([])).toEqual([]); continue; }
        if (entry.method.startsWith('migration') && ['id', 'token'].includes(parameter.name)) { expect(parameter.codec.create().parse('00000000-0000-4000-8000-000000000000')).toContain('00000000'); continue; }
        if (['includeIgnored', 'force'].includes(parameter.name)) { expect(parameter.codec.create().parse(false)).toBe(false); continue; }
        if (parameter.name === 'cursor') { expect(parameter.codec.create().parse(0)).toBe(0); continue; }
        if (['request', 'input'].includes(parameter.name)) { expect(() => parameter.codec.create().parse('gpu')).toThrow(); continue; }
        if (parameter.name === 'id') { expect(parameter.codec.create().parse('test-forward-identity')).toBe('test-forward-identity'); continue; }
        expect(parameter.codec.create().parse('gpu')).toBe('gpu');
      }
    }
    for (const entry of (TYPERT_REMOTE as any).descriptors) {
      expect(typeof entry.result.create().parse).toBe('function');
      for (const parameter of entry.parameters) {
        if (parameter.name === 'selections') { expect(parameter.codec.create().parse([])).toEqual([]); continue; }
        if (entry.method.startsWith('migration') && ['id', 'token'].includes(parameter.name)) { expect(parameter.codec.create().parse('00000000-0000-4000-8000-000000000000')).toContain('00000000'); continue; }
        if (['includeIgnored', 'force'].includes(parameter.name)) { expect(parameter.codec.create().parse(false)).toBe(false); continue; }
        if (parameter.name === 'cursor') { expect(parameter.codec.create().parse(0)).toBe(0); continue; }
        if (['request', 'input'].includes(parameter.name)) { expect(() => parameter.codec.create().parse('gpu')).toThrow(); continue; }
        if (parameter.name === 'id') { expect(parameter.codec.create().parse('test-forward-identity')).toBe('test-forward-identity'); continue; }
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
      'inject:remote.sshRemote,slots,sidebarRight,sidebarRightTabs,sessions,connection',
      'inject:slots,locale,remote.workspaceFiles',
      'inject:remote.sshRemoteEditor,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteFiles,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteFiles,remote.sshRemote,slots,sessions,inputTriggers',
      'inject:remote.sshRemotePorts,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteTransfers,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteTerminalState,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteUpdates,remote.pluginManager,slots,pluginNavigation',
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
      'inject:remote.sshRemote,slots,sidebarRight,sidebarRightTabs,sessions,connection',
      'inject:slots,locale,remote.workspaceFiles',
      'inject:remote.sshRemoteEditor,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteFiles,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteFiles,remote.sshRemote,slots,sessions,inputTriggers',
      'inject:remote.sshRemotePorts,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteTransfers,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteTerminalState,remote.sshRemote,slots,sidebarRight,sidebarRightTabs',
      'inject:remote.sshRemoteUpdates,remote.pluginManager,slots,pluginNavigation',
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
      connection: { generation: { getSnapshot: () => undefined, subscribe: () => () => {} } },
      remote: { sshRemote: { workspaceInfo: vi.fn(async () => ({ ok: true, value: null })) } },
      slots: {
        inject: vi.fn((_slot, callback) => callback()),
        register: vi.fn(() => unregister),
      },
      sidebarRight: { mounted: { getSnapshot: () => selected, subscribe: vi.fn(() => () => {}) }, openTab: vi.fn() },
      sidebarRightTabs: { get: vi.fn(() => ({})), subscribe: vi.fn(() => () => {}), register: vi.fn(() => () => {}) },
      sessions: { list: { getSnapshot: () => ({ byId: {} }), subscribe: vi.fn(() => () => {}) } },
    };
    const ctx = {
      inject: vi.fn((dependencies, callback) => {
        expect(dependencies).toEqual(['remote.sshRemote', 'slots', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'connection']);
        return { dispose: callback(scope) };
      }),
    };
    const dispose = mountNativePanels(ctx as never, new Workbench());
    expect(scope.slots.inject).toHaveBeenCalledWith('conversation.session.header.utilities', expect.any(Function));
    expect(scope.slots.inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function));
    const options = scope.slots.register.mock.calls.map((call: any) => call[0]).find((options: any) => options.name === 'conversation.session.header.utilities');
    expect(options).toMatchObject({ name: 'conversation.session.header.utilities', id: 'dsh-ssh-remote.native-panels' });
    const face = options.inject('session-a');
    face.openPanel('ssh-tools');
    face.openPanel('ssh-quick-open');
    expect(scope.sidebarRight.openTab.mock.calls).toEqual([['ssh-tools'], ['ssh-quick-open']]);
    selected = 'session-b';
    expect(() => face.openPanel('ssh-tools')).toThrow('会话已切换');
    await dispose();
    expect(unregister).toHaveBeenCalledTimes(3);
  });

  it('contributes one guide card only for the current verified SSH Session and releases subscriptions', async () => {
    let selected = 'remote';
    const listeners = new Set<() => void>();
    const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
    const tabs = new Map<string, any>();
    let resolveOld!: (value: unknown) => void;
    const old = new Promise(resolve => { resolveOld = resolve; });
    const workspaceInfo = vi.fn(async (path: string) => path === '/slow' ? old : ({ ok: true, value: path === '/local' ? null : { alias: 'gpu', remotePath: '/project' } }));
    const scope = {
      connection: { generation: { getSnapshot: () => undefined, subscribe } },
      remote: { sshRemote: { workspaceInfo } },
      sidebarRight: { mounted: { getSnapshot: () => selected, subscribe }, openTab: vi.fn() },
      sessions: { list: { getSnapshot: () => ({ byId: { remote: { cwd: '/anchor' }, local: { cwd: '/local' }, slow: { cwd: '/slow' } } }), subscribe } },
      sidebarRightTabs: { get: (kind: string) => tabs.get(kind), subscribe: () => () => {},
        register: vi.fn(definition => { tabs.set(definition.kind, definition); return () => tabs.delete(definition.kind); }) },
      slots: { inject: (_name: string, callback: () => unknown) => callback(), register: () => () => {} },
    };
    const dispose = mountNativePanels({ inject: (_dependencies: string[], callback: (scope: unknown) => unknown) => ({ dispose: callback(scope) }) } as never, new Workbench());
    await vi.waitFor(() => expect(tabs.get('ssh-tools')?.guide).toHaveLength(1));
    expect(tabs.get('ssh-tools').guide[0].title()).toBe('远程工作台');
    expect(tabs.size).toBe(1);
    selected = 'local'; listeners.forEach(listener => listener());
    expect(tabs.size).toBe(0);
    await vi.waitFor(() => expect(workspaceInfo).toHaveBeenCalledWith('/local'));
    selected = 'slow'; listeners.forEach(listener => listener());
    await vi.waitFor(() => expect(workspaceInfo).toHaveBeenCalledWith('/slow'));
    selected = 'local'; listeners.forEach(listener => listener());
    resolveOld({ ok: true, value: { alias: 'old', remotePath: '/old' } });
    await Promise.resolve(); await Promise.resolve();
    expect(tabs.size).toBe(0);
    selected = 'remote'; listeners.forEach(listener => listener());
    await vi.waitFor(() => expect(tabs.size).toBe(1));
    await dispose();
    expect(listeners.size).toBe(0);
    expect(tabs.size).toBe(0);
  });

  it('does not await missing native-panel modules or register against an older backend', async () => {
    const disposePending = vi.fn();
    const pending = new Promise<void>(() => {}) as Promise<void> & { dispose(): void };
    pending.dispose = disposePending;
    const missing = { inject: vi.fn(() => pending) };
    const dispose = mountNativePanels(missing as never, new Workbench());
    await dispose();
    expect(disposePending).toHaveBeenCalledOnce();
    const slots = { inject: vi.fn() };
    const older = { inject: vi.fn((_dependencies, callback) => ({ dispose: callback({ remote: { sshRemote: {} }, slots }) })) };
    await mountNativePanels(older as never, new Workbench())();
    expect(slots.inject).not.toHaveBeenCalled();
  });
});
