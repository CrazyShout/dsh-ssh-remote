import { fork, type ChildProcess } from 'node:child_process';
import { createServer, connect, type Server } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const children: ChildProcess[] = [], servers: Server[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) if (child.connected) child.send({ type: 'stop' });
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});
async function until<T>(fn: () => T | Promise<T>, timeout = 8000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await new Promise(r => setTimeout(r, 30)); }
  throw new Error('worker test deadline exceeded');
}
async function availablePort() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port; await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function isListening(port: number) {
  return new Promise<boolean>(resolve => { const socket = connect(port, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); resolve(true); }); socket.on('error', () => resolve(false)); });
}
function worker() {
  const child = fork(fileURLToPath(new URL('./fixtures/forward-worker.mjs', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
  children.push(child); const messages: any[] = []; let stderr = '';
  child.on('message', message => messages.push(message)); child.stderr?.on('data', chunk => { stderr += String(chunk); });
  // Parent-initiated IPC disconnect need not deliver ChildProcess's composite
  // close event on every Node release; process exit + closed TCP listener are
  // the lifecycle facts this crash-path test must establish.
  const closed = new Promise<void>(resolve => child.once('exit', () => resolve()));
  return { child, messages, closed, stderr: () => stderr };
}
describe('forward guardian real process lifetime', () => {
  it('reaps its listener on IPC parent disconnect, without reconnecting', async () => {
    const target = createServer(socket => { socket.on('error', () => {}); socket.end('fixture'); }); servers.push(target);
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve));
    const port = await availablePort(), f = worker();
    f.child.send({ type: 'start', spec: { alias: 'fixture', localPort: port, remotePort: (target.address() as any).port } });
    await until(() => f.messages.some(m => m.type === 'ready'));
    expect(await isListening(port)).toBe(true);
    f.child.disconnect(); await f.closed;
    expect(f.stderr()).toBe(''); expect(await isListening(port)).toBe(false);
  }, 15000);
  it('cancels a starting allocation and acknowledges cleanup before exit', async () => {
    const port = await availablePort(), f = worker();
    f.child.send({ type: 'start', spec: { alias: 'fixture', localPort: port, remotePort: 6006 } });
    f.child.send({ type: 'stop' }); await f.closed;
    expect(f.messages.some(m => m.type === 'stopped')).toBe(true);
    expect(f.messages.some(m => m.type === 'ready')).toBe(false);
    expect(await isListening(port)).toBe(false);
  }, 15000);
});
