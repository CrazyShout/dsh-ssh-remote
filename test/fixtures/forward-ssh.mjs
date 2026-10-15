// Local transport double. Actual OpenSSH data flow is tested by smoke-port-forwards.mjs.
import { createServer, connect } from 'node:net';
const args = process.argv.slice(2), socketPath = args[args.indexOf('-S') + 1];
if (args.includes('-M')) {
  const server = createServer(socket => {
    let text = ''; socket.on('data', chunk => { text += chunk; if (!text.includes('\n')) return;
      const request = JSON.parse(text); text = '';
      if (request.command === 'check') { socket.end('ok'); return; }
      const listener = createServer(stream => {
        const target = connect(request.remote, '127.0.0.1');
        stream.pipe(target).pipe(stream); target.on('error', () => stream.destroy()); stream.on('error', () => target.destroy());
      });
      listener.once('error', () => socket.end('error'));
      listener.listen(request.local, '127.0.0.1', () => socket.end('ok'));
    });
  });
  server.listen(socketPath);
} else if (args.includes('-O')) {
  const command = args[args.indexOf('-O') + 1];
  const forward = args.includes('-L') ? args[args.indexOf('-L') + 1].split(':') : [];
  const socket = connect(socketPath); let text = '';
  socket.on('connect', () => socket.write(JSON.stringify({ command, local: Number(forward[1]), remote: Number(forward[3]) })+'\n'));
  socket.on('data', chunk => { text += chunk; });
  socket.on('end', () => { process.exitCode = text === 'ok' ? 0 : 255; });
  socket.on('error', () => { process.exitCode = 255; });
} else { process.stdout.write('DSH_PORT_TCP:reachable\n'); }
