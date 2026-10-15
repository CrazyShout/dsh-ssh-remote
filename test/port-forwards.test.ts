import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortForwardManager } from '../src/port-forwards.js';
import { controlArguments, masterArguments, probeArguments, validateForwardSpec } from '../src/port-forward-transport.js';

class Worker extends EventEmitter {
  pid = 100; connected = true; stderr = new PassThrough(); stopped = false;
  messages: any[] = [];
  holdStop = false;
  send(message: any, done?: (error?: Error) => void) {
    this.messages.push(message); done?.();
    if (message.type === 'stop' && !this.holdStop) queueMicrotask(() => this.finish());
  }
  finish() { this.stopped = true; this.emit('message', { type: 'stopped' }); this.connected = false; this.emit('close', 0, null); }
  kill = vi.fn(() => true);
}
const scope = { sessionId: 'session-a' as any, workspaceRoot: '/a' };
const others = { ...scope, workspaceRoot: '/b' };
const managers: PortForwardManager[] = [];
afterEach(async () => { for (const manager of managers.splice(0)) await manager.dispose().catch(() => {}); vi.useRealTimers(); });
function fixture() {
  const children: Worker[] = [];
  const manager = new PortForwardManager(root => root === '/a' ? 'ssh://host/work' : root === '/b' ? 'ssh://other/work' : undefined, {
    aliasValidator: () => true, forkWorker: () => { const child = new Worker(); children.push(child); return child as any; },
  });
  managers.push(manager); return { manager, children };
}
const input = () => ({ id: randomUUID(), localPort: 18888, remotePort: 8888, protocol: 'http' as const });
describe('owned SSH port forwards', () => {
  it('clears inherited forwarding, isolates its master and uses loopback-only explicit control requests', () => {
    const spec = { alias: 'gpu', localPort: 16006, remotePort: 6006 };
    const master = masterArguments(spec, '/tmp/private/control', true);
    expect(master).toEqual(expect.arrayContaining(['-M', '-N', '-S', '/tmp/private/control', 'ClearAllForwardings=yes', 'ControlPersist=no', 'ForkAfterAuthentication=no', 'PermitLocalCommand=no', 'ForwardAgent=no']));
    expect(master).not.toContain('-L'); expect(master).not.toContain('-f');
    expect(controlArguments('/tmp/private/control', 'forward', spec)).toEqual(expect.arrayContaining(['-F', '/dev/null', '-O', 'forward', '-L', '127.0.0.1:16006:127.0.0.1:6006']));
    expect(probeArguments('/tmp/private/control', spec)).toContain('ProxyCommand=false');
    expect(masterArguments(spec, '/tmp/private/control', false)).not.toContain('SessionType=none');
    for (const port of [0, 80, 65536, 1.2, NaN]) expect(() => validateForwardSpec({ ...spec, localPort: port })).toThrow();
    expect(() => validateForwardSpec({ ...spec, alias: '-oProxyCommand=bad' })).toThrow();
  });
  it('reserves ports globally, separates workspaces, and makes create retries idempotent', async () => {
    const f = fixture(), request = input();
    expect(f.manager.create(scope, request).state).toBe('starting');
    expect(f.manager.create(scope, request).state).toBe('starting'); expect(f.children).toHaveLength(1);
    expect(() => f.manager.create(scope, { ...request, remotePort: 9000 })).toThrow('同一个');
    expect(() => f.manager.create(others, { ...request, id: randomUUID() })).toThrow('占用');
    expect(f.manager.list(others).items).toEqual([]);
    f.children[0].emit('message', { type: 'ready' });
    expect(f.manager.list(scope).items[0].state).toBe('listening');
    expect(f.children[0].messages.at(-1).type).toBe('probe');
    f.children[0].emit('message', { type: 'probe', probe: { state: 'unreachable', message: 'not running' } });
    expect(f.manager.list(scope).items[0]).toMatchObject({ state: 'listening', probe: { state: 'unreachable' } });
    await f.manager.stop(others, request.id); expect(f.children[0].stopped).toBe(false);
    await f.manager.stop(scope, request.id);
    expect(f.manager.create(scope, request).state).toBe('stopped'); expect(f.children).toHaveLength(1);
    expect(f.manager.create(others, { ...request, id: randomUUID() }).state).toBe('starting');
  });
  it('tombstones stop-before-create and rejects late ready/probe after stopping', async () => {
    const f = fixture(), request = input();
    await f.manager.stop(scope, request.id);
    expect(() => f.manager.create(scope, request)).toThrow('已被停止'); expect(f.children).toHaveLength(0);
    request.id = randomUUID(); f.manager.create(scope, request); f.children[0].holdStop = true;
    const stopped = f.manager.stop(scope, request.id);
    f.children[0].emit('message', { type: 'ready' });
    f.children[0].emit('message', { type: 'probe', probe: { state: 'reachable', message: 'late' } });
    expect(f.manager.list(scope).items[0]).toMatchObject({ state: 'stopping', probe: { state: 'unknown' } });
    f.children[0].finish(); await stopped;
    expect(f.manager.list(scope).items[0].state).toBe('stopped');
  });
  it('does not auto-reconnect, trusts only cleanup receipts, and keeps uncertain ports reserved', async () => {
    const f = fixture(), request = input(); f.manager.create(scope, request);
    f.children[0].emit('message', { type: 'error', message: 'network timeout token=secret' });
    f.children[0].emit('message', { type: 'ready' });
    expect(f.manager.list(scope).items[0].state).toBe('error');
    expect(f.manager.list(scope).items[0].error).not.toContain('secret');
    f.children[0].emit('close', 1, null);
    expect(() => f.manager.create(others, { ...request, id: randomUUID() })).toThrow('占用');
    await expect(f.manager.stop(scope, request.id)).rejects.toThrow('未确认');
    expect(f.children).toHaveLength(1);
  });
  it('refuses local authority and stops only its own children on unload', async () => {
    const f = fixture();
    expect(() => f.manager.create({ ...scope, workspaceRoot: '/local' }, input())).toThrow('SSH');
    for (let i = 0; i < 8; i++) f.manager.create(scope, { ...input(), localPort: 18000 + i });
    expect(() => f.manager.create(scope, { ...input(), localPort: 19000 })).toThrow('八条');
    await f.manager.dispose();
    expect(f.children.every(child => child.stopped)).toBe(true);
    expect(() => f.manager.create(scope, input())).toThrow('已关闭');
  });
  it('keeps cleanup available after the SSH alias is removed from configuration', async () => {
    let configured = true; const worker = new Worker();
    const manager = new PortForwardManager(() => 'ssh://host/work', {
      aliasValidator: () => configured, forkWorker: () => worker as any,
    });
    managers.push(manager); const request = input(); manager.create(scope, request);
    configured = false;
    expect(manager.list(scope).items).toHaveLength(1);
    expect(() => manager.create(scope, { ...request, id: randomUUID() })).toThrow('alias');
    await manager.stop(scope, request.id);
    expect(worker.stopped).toBe(true); expect(manager.list(scope).items[0].state).toBe('stopped');
  });
});
