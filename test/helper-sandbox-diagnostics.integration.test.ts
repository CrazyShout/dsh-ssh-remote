import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));

it('explains remote sandbox probe failures without weakening the restricted policy', () => {
  const program = String.raw`
import importlib.util,json,os,subprocess,sys,tempfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('helper',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
cases=[('Darwin',None,None,'remote helper is running on Darwin'),
       ('Linux',None,None,'not found in the remote helper PATH'),
       ('Linux','/usr/bin/bwrap',1,'remote bwrap probe failed (exit 1)'),
       ('Linux','/usr/bin/bwrap',subprocess.TimeoutExpired('bwrap',2),'probe timed out'),
       ('Linux','/usr/bin/bwrap',PermissionError('private detail'),'could not run (PermissionError)')]
with tempfile.TemporaryDirectory(prefix='dsh-probe-diagnostic-') as root:
 for system,candidate,outcome,expected in cases:
  m._BWRAP_RESULT=False
  def probe(argv,**kwargs):
   assert '--bind-fd' in argv and '--unshare-pid' in argv and '--tmpfs' in argv
   fd=int(argv[argv.index('--bind-fd')+1]);assert fd in kwargs['pass_fds'];os.fstat(fd)
   assert kwargs['stderr']==subprocess.DEVNULL
   if isinstance(outcome,Exception):raise outcome
   return subprocess.CompletedProcess(argv,outcome)
  with patch.object(m.platform,'system',return_value=system), \
       patch.object(m.shutil,'which',return_value=candidate), \
       patch.object(m.subprocess,'run',side_effect=probe) as run:
   assert m.bwrap_available() is None
   count=run.call_count
   assert m.bwrap_available() is None and run.call_count==count
   if system!='Linux' or candidate is None:assert count==0
   else:
    assert count==1
    fd=run.call_args.kwargs['pass_fds'][0]
    try:os.fstat(fd);raise AssertionError('probe FD leaked')
    except OSError:pass
   server=m.Server()
   try:
    server.dispatch('initialize',{'clientId':'sandbox-diagnostic'})
    for access in ('read-only','workspace-write'):
     server.dispatch('workspace/open',{'path':root,'access':access,'workspaceId':access,'operationId':'open-'+access})
     try:
      server.dispatch('process/start',{'workspaceId':access,'argv':['/bin/sh','-c','echo must-not-run'],'operationId':'start-'+access})
      raise AssertionError('restricted command ran without a sandbox')
     except m.RpcError as error:
      assert error.code=='E_SANDBOX_UNAVAILABLE'
      assert expected in error.message,(expected,error.message)
      assert '--bind-fd' in error.message and '0.9.0' in error.message
      assert '.local/share/dsh-remote-helper' in error.message
      assert 'private detail' not in error.message and len(error.message)<1024
     assert not server.processes
   finally:server.close()
 m._BWRAP_RESULT=False
 with patch.object(m.platform,'system',return_value='Linux'), \
      patch.object(m.shutil,'which',return_value='/usr/bin/bwrap'), \
      patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],0)):
  assert m.bwrap_available()=='/usr/bin/bwrap' and m._BWRAP_FAILURE==''
print(json.dumps({'failureCases':len(cases),'failClosed':True,'fdCleanup':True}))
`;
  const result = spawnSync('python3', ['-c', program, helper], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ failureCases: 5, failClosed: true, fdCleanup: true });
});
