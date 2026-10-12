import type { SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import { describe, expect, it } from 'vitest';
import { RemoteHelperRpcError } from '../src/helper/rpc-client.js';
import type { RemoteHelperClient } from '../src/helper/rpc-client.js';
import type { RemoteHelperProvider } from '../src/helper-fs.js';
import { openRemoteUserTerminal, RemoteUserTerminalAllocationError } from '../src/user-pty.js';

const spec: SubprocessTerminalSpawnSpec = {
  argv: ['/bin/sh'], cwd: '/tmp', cols: 80, rows: 24, terminalType: 'xterm', graceMs: 50,
};

function fixture(initialResponse: unknown) {
  let response = initialResponse;
  const failure = new Error('workspace/open response lost');
  const closes: Array<{ session: string; params: Record<string, unknown> }> = [];
  const client = {
    sessionId: 'original-session',
    capabilities: { process: { sequencedWrite: true }, pty: { sequencedResize: true } },
    async callInSession(session: string, method: string, params: Record<string, unknown>) {
      expect(session).toBe('original-session');
      if (method === 'workspace/open') throw failure;
      if (method === 'workspace/close') {
        closes.push({ session, params });
        if (response instanceof Error) throw response;
        return response;
      }
      throw new RemoteHelperRpcError({ code: 'E_UNKNOWN_PROCESS', message: 'absent', retryable: false });
    },
  } as unknown as RemoteHelperClient;
  const helpers: RemoteHelperProvider = { client: async () => client };
  return { helpers, failure, closes, reply: (value: unknown) => { response = value; } };
}

describe('unpublished terminal workspace cleanup confirmation', () => {
  it.each([{ closed: false }, {}, undefined, null, new Error('close response lost')])(
    'retains retryable ownership when cleanup is not confirmed: %j', async response => {
      const f = fixture(response);
      const error = await openRemoteUserTerminal('ssh://fixture/tmp', spec, f.helpers).catch(error => error);
      expect(error).toBeInstanceOf(RemoteUserTerminalAllocationError);
      f.reply({ closed: false, cancelled: true });
      await error.retryCleanup();
      expect(f.closes).toHaveLength(2);
      expect(f.closes[1]).toEqual(f.closes[0]);
    },
  );

  it.each([{ closed: true }, { closed: false, cancelled: true }])(
    'accepts an explicit retirement receipt: %j', async receipt => {
      const f = fixture(receipt);
      await expect(openRemoteUserTerminal('ssh://fixture/tmp', spec, f.helpers)).rejects.toBe(f.failure);
      expect(f.closes).toHaveLength(1);
    },
  );
});
