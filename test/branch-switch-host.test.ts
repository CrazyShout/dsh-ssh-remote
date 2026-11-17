import { describe, expect, it, vi } from 'vitest';
import { mountBranchSwitchHttp } from '../src/branch-switch.js';

interface CapturedRoute {
  path: string;
  methods: string[];
  requestBody: 'buffered' | 'streaming';
  fetch(request: Request): Promise<Response>;
}

function mount(options: {
  events?: Array<{ type: string }>;
  mode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  agent?: unknown;
  subprocess?: unknown;
  lookupError?: Error;
} = {}) {
  const routes: CapturedRoute[] = [];
  const session = {
    id: 'session-1',
    snapshotEvents: () => options.events ?? [],
  };
  const scope = {
    connection: {
      fetch: {
        register(route: CapturedRoute) {
          routes.push(route);
          return () => {};
        },
      },
    },
    typert: {
      lookups: {
        get: () => ({
          resolve: async () => {
            if (options.lookupError) throw options.lookupError;
            return session;
          },
        }),
      },
    },
    workingDirectory: { get: () => '/repo' },
    sandboxPolicy: { resolve: () => ({ mode: options.mode ?? 'danger-full-access' }) },
    sandbox: {},
    subprocess: options.subprocess ?? {},
    agents: { get: () => options.agent },
    effect: (effect: () => unknown) => effect(),
  };
  const ctx = {
    inject(_names: string[], callback: (value: typeof scope) => unknown) {
      return callback(scope);
    },
  };
  mountBranchSwitchHttp(ctx as never);
  return routes[0]!;
}

function request(body: Record<string, unknown>): Request {
  return new Request('http://127.0.0.1/api/ssh-branches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('SSH branch Host route', () => {
  it('registers one authenticated buffered POST route', () => {
    const route = mount();
    expect(route.path).toBe('/api/ssh-branches');
    expect(route.methods).toEqual(['POST']);
    expect(route.requestBody).toBe('buffered');
  });

  it('maps a missing Session lookup to a stable not-found response', async () => {
    const route = mount({ lookupError: new Error('session not found') });
    const response = await route.fetch(request({ sessionId: 'missing', action: 'search' }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'The Session is no longer available.' },
    });
  });

  it('rejects a mutation after the first turn starts', async () => {
    const route = mount({ events: [{ type: 'turn/start' }], agent: {} });
    const response = await route.fetch(request({
      sessionId: 'session-1', action: 'switch', ref: 'refs/heads/dev',
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'SESSION_STARTED' } });
  });

  it('rejects a mutation whenever no live Agent can claim maintenance', async () => {
    const route = mount();
    const response = await route.fetch(request({
      sessionId: 'session-1', action: 'create', name: 'feature/new',
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'SESSION_BUSY' } });
  });

  it('claims Agent maintenance before resolving the Git executable', async () => {
    let claimed = false;
    const runMaintenance = vi.fn(async (task: (signal: AbortSignal) => Promise<unknown>) => {
      claimed = true;
      return await task(new AbortController().signal);
    });
    const resolveExecutable = vi.fn(async () => {
      expect(claimed).toBe(true);
      throw new Error('git unavailable');
    });
    const route = mount({ agent: { runMaintenance }, subprocess: { resolveExecutable } });
    const response = await route.fetch(request({
      sessionId: 'session-1', action: 'switch', ref: 'refs/heads/dev',
    }));
    expect(response.status).toBe(409);
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    expect(resolveExecutable).toHaveBeenCalledTimes(1);
  });

  it('rejects writes in a read-only Session before starting Git', async () => {
    const route = mount({ mode: 'read-only', agent: { runMaintenance: vi.fn() } });
    const response = await route.fetch(request({
      sessionId: 'session-1', action: 'switch', ref: 'refs/heads/dev',
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'READ_ONLY' } });
  });

  it('rejects malformed requests without touching Git', async () => {
    const route = mount();
    const response = await route.fetch(new Request('http://127.0.0.1/api/ssh-branches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });
});
