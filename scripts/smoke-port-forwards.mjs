// Opt-in real SSH acceptance. Creates only owned loopback listeners and a fresh /tmp directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { RemoteHelperManager } from '../lib/helper/manager.js';
import { buildSystemSshArgs } from '../lib/helper/installer.js';
import { PortForwardManager } from '../lib/port-forwards.js';
const alias = process.argv[2], keep = process.argv.includes('--keep-ui');
if (!alias || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(alias)) throw new Error('Usage: node scripts/smoke-port-forwards.mjs <alias> [--keep-ui]');
const ssh = command => execFileSync('ssh', buildSystemSshArgs(alias, command), { encoding: 'utf8', timeout: 30000 });
const root = ssh('mktemp -d /tmp/dsh-ports-smoke.XXXXXXXX').trim();
assert.match(root, /^\/tmp\/dsh-ports-smoke\.[A-Za-z0-9]{8}$/u);
const helpers = new RemoteHelperManager({ aliasValidator: value => value === alias, healthIntervalMs: 0 });
const forwards = new PortForwardManager(path => path === '/ports-anchor' ? `ssh://${alias}${root}` : undefined);
const scope = { sessionId: `ports-${randomUUID()}`, workspaceRoot: '/ports-anchor' };
const workspaceId = randomUUID(), processId = randomUUID();
let client, browserPort;
const waitFor = async (fn, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('acceptance deadline exceeded');
};
const freePort = async () => {
  const server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
};
const code = String.raw`
import http.server,socketserver,socket,base64,hashlib,struct,json
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.headers.get('Upgrade','').lower()=='websocket':
   key=self.headers['Sec-WebSocket-Key'];accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
   self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',accept);self.end_headers()
   data=self.rfile.read(2);length=data[1]&127
   if length==126:length=struct.unpack('!H',self.rfile.read(2))[0]
   mask=self.rfile.read(4);body=self.rfile.read(length);body=bytes(c^mask[i%4] for i,c in enumerate(body))
   out=b'DSH_M2_WS:'+body;self.wfile.write(bytes([129,len(out)])+out);self.wfile.flush();return
  body=b'<!doctype html><title>DSH M2 acceptance</title><h1>DSH_M2_REMOTE_HTTP</h1><p>SSH loopback forwarding is working.</p>'
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
class Server(socketserver.ThreadingMixIn,http.server.HTTPServer):daemon_threads=True
s=Server(('127.0.0.1',0),Handler)
dead=socket.socket();dead.bind(('127.0.0.1',0));unavailable=dead.getsockname()[1];dead.close()
print(json.dumps({'remotePort':s.server_port,'unavailablePort':unavailable}),flush=True)
s.serve_forever()
`;
try {
  client = await helpers.client(alias);
  await client.call('workspace/open', { workspaceId, operationId: workspaceId, path: root, access: 'danger-full-access' }, { mutation: true });
  await client.call('process/start', { workspaceId, processId, operationId: processId,
    argv: ['python3', '-u', '-c', code], cwd: '', stdin: 'closed' }, { mutation: true, timeoutMs: 20000 });
  let output = '', cursor = '0';
  const fixture = await waitFor(async () => {
    const page = await client.call('process/read', { processId, afterSeq: cursor, waitMs: 100, maxBytes: 4096 });
    cursor = page.nextSeq; output += page.chunks.map(row => Buffer.from(row.data, 'base64').toString()).join('');
    try { return JSON.parse(output.trim()); } catch { return undefined; }
  });
  const create = async remotePort => {
    const request = { id: randomUUID(), localPort: await freePort(), remotePort, protocol: 'http' };
    forwards.create(scope, request);
    const state = await waitFor(() => {
      const row = forwards.list(scope).items.find(row => row.id === request.id);
      if (row?.state === 'error') throw new Error(row.error);
      return row?.state === 'listening' && row.probe.state !== 'unknown' ? row : undefined;
    });
    return state;
  };
  const active = await create(fixture.remotePort);
  assert.equal(active.probe.state, 'reachable');
  assert.match(await (await fetch(`http://127.0.0.1:${active.localPort}/`)).text(), /DSH_M2_REMOTE_HTTP/u);
  const websocket = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${active.localPort}/`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('WebSocket timeout')); }, 5000);
    ws.onopen = () => ws.send('ping'); ws.onerror = reject;
    ws.onmessage = event => { clearTimeout(timeout); ws.close(); resolve(event.data); };
  });
  assert.equal(websocket, 'DSH_M2_WS:ping');
  const unavailable = await create(fixture.unavailablePort);
  assert.equal(unavailable.probe.state, 'unreachable'); assert.equal(unavailable.state, 'listening');
  await forwards.stop(scope, unavailable.id);
  const occupied = createServer(); await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const request = { id: randomUUID(), localPort: occupied.address().port, remotePort: fixture.remotePort, protocol: 'http' };
    forwards.create(scope, request);
    const rejected = await waitFor(() => forwards.list(scope).items.find(row => row.id === request.id && row.state === 'error' && row.canRetry));
    assert.match(rejected.error, /占用/u);
  } finally { await new Promise(resolve => occupied.close(resolve)); }
  await forwards.stop(scope, active.id);
  await assert.rejects(fetch(`http://127.0.0.1:${active.localPort}/`));
  browserPort = await freePort();
  console.log(JSON.stringify({ pid: process.pid, alias, root, remotePort: fixture.remotePort, browserPort,
    checks: ['HTTP remote marker', 'WebSocket echo', 'listener vs target unavailable', 'external port conflict', 'stop releases listener'], passed: true, retainedForUi: keep }, null, 2));
  if (keep) await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
} finally {
  const cleanupErrors = [];
  const cleanup = async action => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
  await cleanup(() => forwards.dispose());
  if (client) {
    await cleanup(async () => {
      const result = await client.call('process/release', { processId, operationId: `release:${processId}` }, { mutation: true });
      assert.equal(result.released, true);
    });
    await cleanup(async () => {
      const result = await client.call('workspace/close', { workspaceId, operationId: `close:${workspaceId}` }, { mutation: true });
      assert.equal(result.closed, true);
    });
  }
  await cleanup(() => helpers.dispose());
  if (!cleanupErrors.length) ssh(`rm -rf -- '${root}'`);
  else throw new AggregateError(cleanupErrors, `Smoke cleanup unconfirmed; retained owned fixture ${root}`);
}
