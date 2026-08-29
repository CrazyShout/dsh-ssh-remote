import { describe, expect, it, vi } from 'vitest';
import { SshRemoteService } from '../src/registry.js';

function status(state: 'connected' | 'disconnected') {
  return {
    alias: 'gpu',
    state,
    attempt: 0,
    helperSha256: 'a'.repeat(64),
    helperVersion: state === 'connected' ? '0.3.0' : undefined,
    sessionId: state === 'connected' ? 'session-1' : undefined,
    capabilities: state === 'connected' ? { filesystem: { supported: true } } : undefined,
  };
}

describe('SshRemoteService helper lifecycle facade', () => {
  it('exposes connect, disconnect, retry and redacted diagnostics views', async () => {
    let current = status('disconnected');
    const helpers = {
      client: vi.fn(async () => { current = status('connected'); return {}; }),
      close: vi.fn(async () => { current = status('disconnected'); }),
      retry: vi.fn(async () => { current = status('connected'); return {}; }),
      status: vi.fn(() => current),
      diagnostics: vi.fn(() => ({
        ...current,
        assetPath: '/plugin/helper.py',
        stderr: 'permission denied',
        lastConnectedAt: 10,
        lastHealthAt: 11,
        nextRetryAt: 0,
      })),
    };
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService;
    Object.defineProperties(service, {
      helpers: { value: helpers },
      assertHelperAlias: { value: () => {} },
    });

    await expect(service.connectHost('gpu')).resolves.toMatchObject({
      status: 'connected', version: '0.3.0', sessionId: 'session-1', error: '',
    });
    await expect(service.disconnectHost('gpu')).resolves.toMatchObject({ status: 'disconnected' });
    await expect(service.retryHost('gpu')).resolves.toMatchObject({ status: 'connected' });
    await expect(service.diagnostics('gpu')).resolves.toMatchObject({
      alias: 'gpu', helperSha256: 'a'.repeat(64), stderr: 'permission denied', lastHealthAt: 11,
    });
    expect(helpers.client).toHaveBeenCalledWith('gpu');
    expect(helpers.close).toHaveBeenCalledWith('gpu');
    expect(helpers.retry).toHaveBeenCalledWith('gpu');
  });
});

