import { afterEach, describe, expect, it, vi } from 'vitest';
import { SshRemoteService } from '../src/registry.js';
import { discoverSshHosts } from '../src/ssh-config.js';
import type { RemoteHelperStatus } from '../src/helper/manager.js';

vi.mock('../src/ssh-config.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/ssh-config.js')>();
  return {
    ...actual,
    discoverSshHosts: vi.fn(),
    userSshConfigPath: () => '/fixture/ssh/config',
  };
});

afterEach(() => vi.clearAllMocks());

describe('SshRemoteService configuration during remote health failures', () => {
  it('retains all discovered hosts and successful refreshes when one connected host loses transport', async () => {
    vi.mocked(discoverSshHosts).mockResolvedValue([
      { host: 'down', hostName: 'down.example', port: 2222, user: 'alice' },
      { host: 'healthy', hostName: 'healthy.example', port: 22, user: 'bob' },
    ]);
    const statuses: Record<string, RemoteHelperStatus> = Object.fromEntries(
      ['down', 'healthy'].map(alias => [alias, {
        alias, state: 'connected', attempt: 0,
        helperSha256: 'a'.repeat(64), helperVersion: '0.3.3', sessionId: `session-${alias}`,
        capabilities: { environment: { check: true }, filesystem: { supported: true } },
      }]),
    );
    const helpers = {
      refreshEnvironment: vi.fn(async (alias: string) => {
        if (alias === 'down') {
          statuses[alias] = {
            ...statuses[alias], state: 'reconnecting', attempt: 1,
            lastError: 'system SSH helper transport exited with code 255',
            errorCode: 'SSH_NETWORK', retryable: true,
          };
          throw new Error('system SSH helper transport exited with code 255');
        }
        statuses[alias] = {
          ...statuses[alias],
          environment: { search: { available: true, path: '/usr/bin/rg', version: 'ripgrep fixture' } },
        };
      }),
      status: vi.fn((alias: string) => statuses[alias]),
      client: vi.fn(),
    };
    const service = Object.create(SshRemoteService.prototype) as SshRemoteService;
    Object.defineProperties(service, {
      helpers: { value: helpers },
      legacyConfig: { value: { hosts: [] } },
    });

    const result = await service.config();
    expect(discoverSshHosts).toHaveBeenCalledWith('/fixture/ssh/config');
    expect(result.configPath).toBe('/fixture/ssh/config');
    expect(result.legacyHostCount).toBe(0);
    expect(result.hosts.map(host => host.alias)).toEqual(['down', 'healthy']);
    expect(result.hosts[0]).toMatchObject({
      alias: 'down', host: 'down.example', port: 2222, user: 'alice',
      helper: { status: 'reconnecting', errorCode: 'SSH_NETWORK', retryable: true },
    });
    expect(result.hosts[1]).toMatchObject({
      alias: 'healthy', host: 'healthy.example', port: 22, user: 'bob',
      helper: { status: 'connected', environment: { search: { available: true } } },
    });
    expect(helpers.refreshEnvironment).toHaveBeenCalledTimes(2);
    expect(helpers.refreshEnvironment).toHaveBeenCalledWith('down');
    expect(helpers.refreshEnvironment).toHaveBeenCalledWith('healthy');
    expect(helpers.client).not.toHaveBeenCalled();
  });
});
