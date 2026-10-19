import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteHelperInstaller, buildHelperConnectCommand } from '../src/helper/installer.js';
import { buildRemoteSshInvocation } from '../src/runtime-router.js';
import { formatSshUri } from '../src/types.js';

const fish = process.env.DSH_TEST_FISH ?? 'fish';
const hasFish = spawnSync(fish, ['--version'], { encoding: 'utf8' }).status === 0;
if (process.env.DSH_REQUIRE_FISH && !hasFish) throw new Error('The fish login-shell regression must run in this job');
const shells = [
  { name: 'sh', binary: '/bin/sh', flags: [] as string[], available: existsSync('/bin/sh') },
  { name: 'zsh', binary: '/bin/zsh', flags: ['-f'], available: existsSync('/bin/zsh') },
  { name: 'fish', binary: fish, flags: ['--no-config'], available: hasFish },
  { name: 'tcsh', binary: '/bin/tcsh', flags: ['-f'], available: existsSync('/bin/tcsh') },
];
let temporary: string | undefined;
afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); temporary = undefined; });

describe.each(shells)('$name remote login shell', shell => {
  it.skipIf(!shell.available)('installs exact stdin bytes in a private home and connects without reinterpreting nested quotes', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'dsh-login-shell-'));
    const remoteHome = join(temporary, `home 空格 'quote' \\ path`);
    await mkdir(remoteHome);
    const assetPath = join(temporary, 'helper.py');
    const content = 'import sys\nprint("REMOTE_HELPER_OK")\n';
    await writeFile(assetPath, content);
    // HOME belongs only to this child fixture; no real account shell/config is changed.
    const env = { ...process.env, HOME: remoteHome };
    const installer = new RemoteHelperInstaller({ assetPath, capabilities: { sessionTypeSupported: true },
      spawnProcess: ((_binary, args, options) => spawn(shell.binary, [...shell.flags, '-c', args.at(-1)!], { ...options, env })) as typeof spawn });
    const installed = await installer.install('fixture');
    const release = join(remoteHome, '.local/share/dsh-remote-helper/releases', installed.sha256);
    expect(await readFile(join(release, 'helper.py'), 'utf8')).toBe(content);
    expect((await stat(release)).mode & 0o777).toBe(0o700);
    expect((await stat(join(release, 'helper.py'))).mode & 0o777).toBe(0o600);
    const connected = spawnSync(shell.binary, [...shell.flags, '-c', buildHelperConnectCommand(installed.sha256)], { env, encoding: 'utf8' });
    expect(connected.status, connected.stderr).toBe(0);
    expect(connected.stdout.trim()).toBe('REMOTE_HELPER_OK');
  });

  it.skipIf(!shell.available)('preserves cwd, argv, environment, stdin and exit status in direct subprocess routing', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'dsh-login-argv-'));
    const cwd = join(temporary, `中文 space 'quote' \\ directory`);
    await mkdir(cwd);
    const uri = formatSshUri({ host: 'fixture', user: '', port: 22, path: cwd });
    const value = 'literal $HOME `printf WRONG` "double" \'single\' \\ slash\nnext';
    const script = 'import json,os,sys; print(json.dumps([os.getcwd(),sys.argv[1],os.environ["DEMO"],sys.stdin.read()])); sys.exit(7)';
    const command = buildRemoteSshInvocation(uri, ['python3', '-c', script, value], { DEMO: value }, false).at(-1)!;
    const result = spawnSync(shell.binary, [...shell.flags, '-c', command], { input: 'stdin 中文\n', encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(7);
    expect(JSON.parse(result.stdout)).toEqual([await realpath(cwd), value, value, 'stdin 中文\n']);
  });
});
