import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteHelperRpcClient } from '../src/helper/rpc-client.js';
const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });
const helperPath = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const bashPath = process.env.DSH_TEST_BASH ?? '/bin/bash';
const bashSupported = Number(execFileSync(bashPath, ['-c', 'printf %s "${BASH_VERSINFO[0]}"'], { encoding: 'utf8' })) >= 4;
let zshSupported = false;
try { zshSupported = /^5\.(?:[89]|[1-9]\d)/u.test(execFileSync('zsh', ['-fc', 'print $ZSH_VERSION'], { encoding: 'utf8' })); } catch {}
async function fixture(shell: string, args = ['-i'], startup = '', setup?: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-shell-state-')));
  disposers.push(() => rm(root, { recursive: true, force: true }));
  if (startup) await writeFile(join(root, shell.includes('zsh') ? '.zshrc' : '.bashrc'), startup);
  await setup?.(root);
  const child = spawn('python3', [helperPath, 'connect', '--stdio', '--direct'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', data => { stderr += String(data); });
  const client = new RemoteHelperRpcClient({ readable: child.stdout, writable: child.stdin });
  child.on('exit', () => client.transportClosed(new Error(stderr || 'helper exited')));
  disposers.push(async () => { if (child.exitCode !== null) return; const done = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await done; });
  await client.initialize({ clientId: randomUUID() });
  const ws = await client.call<{ workspaceId: string }>('workspace/open', { path: root, access: 'danger-full-access', operationId: randomUUID() });
  // Debian/Ubuntu's global zshrc otherwise initializes the runner's unrelated
  // completion tree and can wait for compaudit input before our fixture rc.
  // Do not load those completions (or suppress their security checks). This is
  // fixture-only; production user/global startup files remain unchanged.
  // https://sources.debian.org/src/zsh/5.9-8/debian/zshrc/
  const env = { HOME: root, ZDOTDIR: root, TERM: 'xterm', ...(shell.includes('zsh') ? { skip_global_compinit: '1' } : {}) };
  const process = await client.call<{ processId: string; pid: number }>('process/start', { operationId: randomUUID(), workspaceId: ws.workspaceId, argv: [shell, ...args], env, tty: { cols: 80, rows: 24 }, shellObservation: true });
  disposers.push(() => client.call('process/release', { processId: process.processId, operationId: randomUUID() }));
  const state = () => client.call<any>('process/shellState', { processId: process.processId });
  let sequence = 0;
  const write = async (text: string) => { await client.call('process/write', { processId: process.processId, data: Buffer.from(text).toString('base64'), afterSeq: String(sequence++), operationId: randomUUID() }); };
  const until = async (predicate: (state: any) => boolean) => {
    const end = Date.now() + 6000; let view: any;
    do { view = await state(); if (predicate(view)) return view; await new Promise(resolve => setTimeout(resolve, 30)); } while (Date.now() < end);
    const captured = await client.call<any>('process/read', { processId: process.processId, afterSeq: '0', maxBytes: 8192, waitMs: 0 });
    throw new Error('shell state timeout: ' + JSON.stringify(view) + ' ' + stderr + ' output=' + JSON.stringify(captured));
  };
  const output = () => client.call<any>('process/read', { processId: process.processId, afterSeq: '0', maxBytes: 65536, waitMs: 100 });
  const foregroundJob = async () => {
    const deadline = Date.now() + 3000;
    do {
      const group = await client.call<{ pgid: number; verified: boolean }>('process/inspectForeground', { processId: process.processId });
      if (group.verified && group.pgid !== process.pid) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error('fixture command did not acquire the terminal foreground');
  };
  return { root, state, write, until, output, foregroundJob };
}
describe('private shell observation channel', () => {
  for (const [shell, supported] of [[bashPath, bashSupported], ['/bin/zsh', zshSupported]] as const) {
    it.skipIf(!supported)(`${shell}: command status, cwd, pipelines, multiline, interrupt and background return`, async () => {
      const f = await fixture(shell);
      expect((await f.until(view => view.state === 'prompt')).cwd).toBe(f.root);
      await f.write('false\r');
      let view = await f.until(view => view.recent.length === 1);
      expect(view.recent[0].exitCode).toBe(1); expect(view.recent[0].command).toContain('false');
      await f.write('true | false\r'); view = await f.until(view => view.recent.length === 2);
      expect(view.recent[1].exitCode).toBe(1); expect(view.recent[1].command).toBe('true | false');
      await f.write('for x in a b; do\rprintf "%s\\n" "$x"\rdone\r');
      view = await f.until(view => view.recent.length === 3); expect(view.recent[2].exitCode).toBe(0); expect(view.recent[2].command).toContain('for x');
      await f.write('cd /tmp\r'); view = await f.until(view => view.cwd === '/tmp'); expect(view.state).toBe('prompt');
      await f.write('sleep 20\r'); await f.until(view => view.state === 'running');
      // preexec observes the shell command before it forks/foregrounds sleep.
      // Synchronize the Ctrl-C fixture with actual job control, not a delay or
      // the observational metadata (which is deliberately not an authority).
      await f.foregroundJob(); await f.write('\x03');
      view = await f.until(view => view.state === 'prompt'); expect(view.recent.at(-1).exitCode).toBe(130); expect(view.recent.at(-1).command).toBe('sleep 20');
      await f.write('sleep 2 &\r'); view = await f.until(view => view.recent.length === 6);
      expect(view.recent.at(-1).exitCode).toBe(0); expect(view.state).toBe('prompt');
      await f.write('cat\r'); await f.until(view => view.state === 'running'); await f.write('INTERACTIVE_PROGRAM_TEXT\r');
      expect((await f.state()).state).toBe('running'); await f.write('\x04');
      view = await f.until(view => view.recent.length === 7); expect(view.recent.at(-1).command).toBe('cat'); expect(view.recent.at(-1).exitCode).toBe(0);
      await f.write("printf '\\033]133;D;99\\007'\r"); view = await f.until(view => view.recent.length === 8);
      expect(view.recent.at(-1).exitCode).toBe(0); expect(view.cwd).toBe('/tmp');
      // Zsh correctly refuses the first exit while a background job still
      // exists. Join our test-only job rather than weakening that shell policy.
      await f.write('wait\r'); await f.until(view => view.recent.length === 9);
      await f.write('exit\r');
      let drained; const deadline = Date.now() + 3000;
      do { drained = await f.output(); } while (!drained.exited && Date.now() < deadline);
      expect(drained.exited).toBe(true); expect(drained.shellState.state).toBe('exited');
      expect(drained.shellState.recent[0].exitCode).toBe(1);
    }, 15_000);
    it.skipIf(!supported)(`${shell}: preserves startup and existing prompt hooks`, async () => {
      const startup = shell.includes('zsh') ? "typeset -ga precmd_functions=(old_prompt)\nold_prompt() { (( HOOK_COUNT += 1 )); }\nexport STARTUP_MARKER=preserved\n" : "PROMPT_COMMAND='(( HOOK_COUNT += 1 )) # existing hook comment'\nexport STARTUP_MARKER=preserved\n";
      const f = await fixture(shell, ['-i'], startup); await f.until(view => view.state === 'prompt');
      await f.write('test "$STARTUP_MARKER" = preserved && test "$HOOK_COUNT" -ge 1\r'); const view = await f.until(view => view.recent.length === 1);
      expect(view.recent[0].exitCode).toBe(0);
    });
  }
  it('does not rewrite custom startup arguments', async () => {
    const f = await fixture('/bin/bash', ['--noprofile', '--norc', '-i']);
    expect((await f.state()).state).toBe('unsupported'); await f.write('true\r');
  });
  it.skipIf(!zshSupported)('preserves Zsh env/changed ZDOTDIR and falls back for basic hooks without replacing them', async () => {
    const f = await fixture('/bin/zsh', ['-i'], '', async root => {
      await mkdir(join(root, 'custom'));
      await writeFile(join(root, '.zshenv'), 'export ENV_MARKER=preserved\nZDOTDIR="$HOME/custom"\n');
      await writeFile(join(root, 'custom', '.zshrc'), 'export RC_MARKER=preserved\n');
    });
    await f.until(row => row.state === 'prompt'); await f.write('test "$ENV_MARKER:$RC_MARKER:$ZDOTDIR" = "preserved:preserved:$HOME/custom"\r');
    expect((await f.until(row => row.recent.length === 1)).recent[0].exitCode).toBe(0);
    const raw = await fixture('/bin/zsh', ['-i'], 'precmd() { return 1; }\n');
    expect((await raw.until(row => row.state === 'unsupported')).reason).toContain('basic precmd');
    const rcs = await fixture('/bin/zsh', ['-i'], '', root => writeFile(join(root, '.zshenv'), 'unsetopt rcs\n'));
    expect((await rcs.until(row => row.state === 'unsupported')).reason).toContain('RCS disabled');
  });
  it('bounds metadata, diagnoses forged/gapped frames, and cleans private startup files', () => {
    const modulePath = fileURLToPath(new URL('../helper/dsh_terminal_state.py', import.meta.url));
    const result = execFileSync('python3', ['-B', '-c', `
import os, sys, stat
ns = {}; exec(compile(open(sys.argv[1]).read(), sys.argv[1], 'exec'), ns)
state = ns['ShellObservation'](['/bin/sh', '-i'], {})
def event(seq, kind, command='', nonce=None):
    state.ingest([str(v).encode() for v in (nonce or state.nonce, seq, kind, 0, '/tmp', command, '')])
event(0, 'prompt'); event(1, 'start', 'one'); event(3, 'prompt')
assert state.snapshot()['recent'][0]['uncertain'] and state.snapshot()['recent'][0]['exitCode'] is None
event(4, 'start', 'forged', 'wrong-instance'); assert state.snapshot()['state'] == 'unknown'
event(4, 'prompt')
for n in range(5, 205, 2): event(n, 'start', 'x'*1400); event(n+1, 'prompt')
assert len(str(state.snapshot()).encode()) < 24*1024
state.close()
state = ns['ShellObservation'](['/bin/bash', '-i'], {})
directory = state.directory
assert stat.S_IMODE(os.stat(directory).st_mode) == 0o700
assert all(stat.S_IMODE(os.stat(os.path.join(directory, name)).st_mode) == 0o600 for name in os.listdir(directory))
assert not os.get_blocking(state.pipe_write)
state.close(); state.close(); assert not os.path.exists(directory)
print('metadata fault checks passed')
`, modulePath], { encoding: 'utf8' });
    expect(result).toContain('metadata fault checks passed');
  });
  it.skipIf(!bashSupported)('retains custom DEBUG hooks by falling back without overwriting them', async () => {
    const f = await fixture(bashPath, ['-i'], "trap ':' DEBUG\n");
    const view = await f.until(row => row.state === 'unsupported'); expect(view.reason).toContain('DEBUG');
    await f.write('true\r');
  });
  it.skipIf(!bashSupported)('does not misidentify an ignored history command as the previous one', async () => {
    const f = await fixture(bashPath, ['-i'], 'HISTCONTROL=ignorespace\n');
    await f.until(view => view.state === 'prompt'); await f.write('echo previous\r'); await f.until(view => view.recent.length === 1);
    await f.write(' false\r'); const view = await f.until(view => view.recent.length === 2);
    expect(view.recent[1].command).toBeNull(); expect(view.recent[1].exitCode).toBe(1);
  });
});
