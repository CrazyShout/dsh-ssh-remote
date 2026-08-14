import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import TYPERT_REMOTE from '../lib/typert.remote-client.js';

export const name = 'dsh-ssh-remote-client';
export const inject = ['remote', 'slots'];

/**
 * v0.2 client half: self-register the `sshRemote` Remote face so
 * `ctx.remote.sshRemote.config()` / `.saveConfig()` become callable in the
 * browser, then inject the workspace-picker UI (next milestone).
 */
export async function apply(ctx: ClientContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remote = ctx.remote as any;
  const disposeMount = await remote.$mount(TYPERT_REMOTE);

  return () => {
    void disposeMount?.();
  };
}
