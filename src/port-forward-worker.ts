import { OpenSshForward, type ForwardSpec } from './port-forward-transport.js';

export function runForwardWorker(factory: (spec: ForwardSpec, failure: (message: string) => void) => OpenSshForward =
  (spec, failure) => new OpenSshForward(spec, failure)): void {

// A separate owner survives Host teardown long enough to close its SSH child.
// IPC disconnect (including Host crash) is a stop, never a reconnect request.
let transport: OpenSshForward | undefined;
let stopping = false;
let probing = false;
const send = (message: unknown) => { if (process.connected) process.send?.(message, () => {}); };
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await transport?.stop(); send({ type: 'stopped' }); process.exitCode = 0; }
  catch { send({ type: 'cleanup-error', message: 'SSH 转发释放未确认，请再次停止。' }); stopping = false; return; }
  if (process.connected) process.disconnect();
}
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
process.on('exit', () => { transport?.killOnExit(); });
process.on('uncaughtException', () => { send({ type: 'error', message: '端口转发进程异常，已停止连接。' }); void stop(); });
const startup = setTimeout(() => { send({ type: 'error', message: '端口转发未能及时建立。' }); void stop(); }, 25_000);
startup.unref();
process.on('message', async (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const request = message as { type?: string; spec?: ForwardSpec };
  if (request.type === 'stop') { clearTimeout(startup); await stop(); return; }
  if (stopping) return;
  if (request.type === 'start' && !transport && request.spec) {
    try {
      transport = factory(request.spec, error => { send({ type: 'error', message: error }); void stop(); });
      transport.onNotice = message => send({ type: 'notice', message });
      await transport.start();
      if (stopping) return;
      clearTimeout(startup); send({ type: 'ready' });
    } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : String(error) }); await stop(); }
  } else if (request.type === 'probe' && transport && !probing) {
    probing = true;
    try { const probe = await transport.probe(); if (!stopping) send({ type: 'probe', probe }); }
    catch { if (!stopping) send({ type: 'probe', probe: { state: 'unknown', message: '端口检查失败，请确认 SSH 连接后重试。' } }); }
    finally { probing = false; }
  }
});
}
