import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));

// This is deliberately opt-in outside the Linux sandbox CI job. When required,
// an unavailable sandbox is a failure, never successful fail-closed coverage.
it.skipIf(process.env.DSH_REQUIRE_BWRAP !== '1')('requires real bwrap execution for restricted non-PTY and PTY tasks', () => {
  expect(process.platform, 'DSH_REQUIRE_BWRAP requires a Linux runner').toBe('linux');
  const program = String.raw`
import base64,importlib.util,json,os,shlex,sys,tempfile,time
spec=importlib.util.spec_from_file_location('helper',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
server=m.Server()
try:
 initialized=server.dispatch('initialize',{'clientId':'required-bwrap'})
 assert initialized['capabilities']['process']['sandbox']=='bwrap',(
  'REQUIRED BWRAP UNAVAILABLE: install bubblewrap with --bind-fd support and allow its '
  'user namespaces under the runner policy; do not disable host protections globally')
 with tempfile.TemporaryDirectory(prefix='dsh-sandbox-required-',dir='/tmp') as root, \
      tempfile.NamedTemporaryFile(prefix='dsh-host-marker-',dir='/tmp') as marker:
  marker.write(b'host-only');marker.flush()
  def run(mode,tty,command,label):
   wid=label+'-workspace'
   server.dispatch('workspace/open',{'path':root,'access':mode,'workspaceId':wid,'operationId':'open-'+wid})
   params={'workspaceId':wid,'cwd':'','processId':label,'operationId':'start-'+label,
           'argv':['/bin/sh','-c',command],'stdin':'pipe' if tty else 'closed'}
   if tty:params['tty']={'rows':24,'cols':80,'term':'xterm-256color'}
   started=server.dispatch('process/start',params)
   assert started['sandbox']=={'mode':mode,'enforcement':'full','backend':'bwrap'},started
   cursor='0';output=b'';deadline=time.monotonic()+10
   while time.monotonic()<deadline:
    read=server.dispatch('process/read',{'processId':label,'afterSeq':cursor,'waitMs':100})
    cursor=read['nextSeq'];output+=b''.join(base64.b64decode(c['data']) for c in read['chunks'])
    if read['exited']:break
   assert read['exited'] and read['exitCode']==0,(label,read,output.decode(errors='replace'))
   assert label.encode() in output,(label,output)
   server.dispatch('process/release',{'processId':label,'operationId':'release-'+label})
  policy=('set -eu; test ! -e '+shlex.quote(marker.name)+'; '
          'tmp=$(mktemp); printf private > "$tmp"; rm "$tmp"; '
          'printf writable > proof; test "$(cat proof)" = writable; rm proof; '
          'pids=$(find /proc -maxdepth 1 -type d -name "[0-9]*" | wc -l); test "$pids" -lt 10; ')
  run('workspace-write',False,policy+'printf restricted-pipe','restricted-pipe')
  run('workspace-write',True,policy+'printf restricted-pty','restricted-pty')
  run('read-only',False,'if printf forbidden > proof; then exit 61; fi; printf restricted-readonly','restricted-readonly')
  assert not os.path.exists(os.path.join(root,'proof'))
  marker.seek(0);assert marker.read()==b'host-only'
 print(json.dumps({'sandbox':'bwrap','workspaceWrite':True,'readOnly':True,'pty':True}))
finally:
 server.close()
`;
  const result = spawnSync('python3', ['-c', program, helper], {
    encoding: 'utf8', timeout: 40_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ sandbox: 'bwrap', workspaceWrite: true, readOnly: true, pty: true });
}, 45_000);
