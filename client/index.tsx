import { Workbench } from './workbench.js';
import type { WorkspaceId } from '@deepseek-ai/dsh-api-remotes/client';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import TYPERT_REMOTE from './typert.remote-client.js';
import { mountNativePanels } from './native-panels.js';
import { mountSessionMarkdownImages } from './markdown-preview.js';
import { mountRemoteEditor } from './editor.js';
import { mountQuickOpen } from './quick-open.js';
import { mountPortForwards } from './port-forwards.js';
import { mountTransfers } from './transfers.js';
import { mountTerminalState } from './terminal-state.js';
import type { EditorBridge } from './file-search-types.js';

import type { DirectoryService } from 'dsh-ssh-remote/ssh';
import { SshDirectoryFlow } from './directory-flow.js';
import { SshRemotePanel } from './connection-settings.js';
export { SshDirectoryFlow, SshRemotePanel };
export const name = 'dsh-ssh-remote-client';
export const inject = ['remote'];

export async function apply(ctx: ClientContext) {
  const workbench = new Workbench();
  const disposeMount = await ctx.remote.$mount(TYPERT_REMOTE);
  const ui = ctx.inject(['remote.sshRemote', 'slots', 'workspaces'], (scope) => {
    // The official Remote supports cancellation; UiWorkspace's convenience
    // method currently drops that signal. Keep its fallback for compositions
    // without this optional namespace, without blocking the rest of the UI.
    let pickNative: ((signal?: AbortSignal) => Promise<string | null>) | undefined;
    const nativePicker = scope.inject(['remote.directoryPicker'], next => {
      const picker = next.remote.directoryPicker;
      const adapter = async (signal?: AbortSignal) => {
        const result = await picker.pick(signal);
        if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`);
        return result.value;
      };
      pickNative = adapter;
      return () => { if (pickNative === adapter) pickNative = undefined; };
    });
    const mountUi = (scope: ClientContext, directories: DirectoryService) => {
      const ssh = scope.remote.sshRemote;
      const flowInject = () => ({
        ssh,
        pickLocal: (signal?: AbortSignal) => {
          // Match the stock native slot: Desktop owns a window-parented
          // dialog bridge; bypassing it incorrectly sends Desktop to the
          // Web host's external OS chooser instead.
          const desktop = (globalThis as typeof globalThis & {
            __DSH_DIRECTORY_PICKER__?: { pick(): Promise<string | null> };
          }).__DSH_DIRECTORY_PICKER__;
          return desktop === undefined
            ? pickNative?.(signal) ?? directories.pickDirectory()
            : desktop.pick();
        },
        // The composed picker's browse capability (in-app listing/creation).
        // Served only when the host composes the `-browse` backend; chooseLocal
        // probes for it and falls back to the native chooser only on the
        // explicit capability-unavailable signal (`directory-picker-unavailable`).
        listLocal: (path?: string) => directories.listDirectory(path),
        createLocalDirectory: (path: string, name: string) =>
          directories.createDirectory(path, name),
        createWorkspace: (input: { path: string }) => scope.workspaces.create(input),
        renameWorkspace: (workspaceId: WorkspaceId, title: string) =>
          scope.workspaces.rename(workspaceId, title),
      });

      return scope.slots.inject('settings.plugins.tab', () =>
        scope.slots.inject('conversation.hero.workspace.directoryFlow', () =>
          scope.slots.inject('sidebar.workspaces.directoryFlow', function* () {
            yield scope.slots.register(
              {
                name: 'settings.plugins.tab',
                id: 'ssh-remote',
                order: 20,
                label: () => 'SSH Remote',
                inject: () => ({ ssh }),
              },
              SshRemotePanel,
            );
            // The slot is `single`; a lower priority shadows the stock local-only
            // occupant while this combined local/SSH flow is mounted.
            yield scope.slots.register(
              {
                name: 'conversation.hero.workspace.directoryFlow',
                priority: -100,
                inject: flowInject,
              },
              SshDirectoryFlow,
            );
            yield scope.slots.register(
              {
                name: 'sidebar.workspaces.directoryFlow',
                priority: -100,
                inject: flowInject,
              },
              SshDirectoryFlow,
            );
          }),
        ),
      );
    };
    // DSH 0.2.0 split directory UI operations into `ctx.uiWorkspace`
    // (UiWorkspace), separate from `ctx.workspaces` (IWorkspaces).
    const directories = scope.inject(['uiWorkspace'], next => mountUi(
      next,
      (next as ClientContext & { uiWorkspace: DirectoryService }).uiWorkspace,
    ));
    return async () => {
      await directories.dispose();
      await nativePicker.dispose();
    };
  });

  const disposePanels = mountNativePanels(ctx, workbench);
  const disposeMarkdown = mountSessionMarkdownImages(ctx);
  const editorBridge: EditorBridge = {};
  const disposeEditor = mountRemoteEditor(ctx, editorBridge);
  const disposeQuickOpen = mountQuickOpen(ctx, editorBridge, workbench);
  const disposePorts = mountPortForwards(ctx, workbench);
  const disposeTransfers = mountTransfers(ctx, workbench);
  const disposeTerminalState = mountTerminalState(ctx, workbench);
  try {
    await ui;
  } catch (error) {
    await disposeTerminalState();
    await disposeTransfers();
    await disposePorts();
    await disposeQuickOpen();
    await disposeEditor();
    await disposeMarkdown();
    await disposePanels();
    await ui.dispose();
    await disposeMount();
    throw error;
  }

  return async () => {
    await disposeTerminalState();
    await disposeTransfers();
    await disposePorts();
    await disposeQuickOpen();
    await disposeEditor();
    await disposeMarkdown();
    await disposePanels();
    await ui.dispose();
    await disposeMount();
  };
}
