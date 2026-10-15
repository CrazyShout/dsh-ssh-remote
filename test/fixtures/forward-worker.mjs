import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runForwardWorker } from '../../lib/port-forward-worker.js';
import { OpenSshForward } from '../../lib/port-forward-transport.js';
runForwardWorker((spec, fail) => new OpenSshForward(spec, fail, 'ssh', (_binary, args, options) => spawn(process.execPath,
  [fileURLToPath(new URL('./forward-ssh.mjs', import.meta.url)), ...args], options)));
