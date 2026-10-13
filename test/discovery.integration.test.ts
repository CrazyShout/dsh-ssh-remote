import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const load = String.raw`
import importlib.util,json,os,sys,tempfile,threading,time,subprocess
spec=importlib.util.spec_from_file_location('dsh_helper',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def error(code,fn):
 try:fn()
 except m.RpcError as e:assert e.code==code,(e.code,code)
 else:raise AssertionError('expected '+code)
def scan(s,w,identity='scan',ignored=False):
 s.dispatch('fs/discoverOpen',dict(workspaceId=w,discoveryId=identity,operationId=identity,includeIgnored=ignored))
 rows=[];cursor=0;deadline=time.monotonic()+20
 while True:
  p=s.dispatch('fs/discoverRead',dict(discoveryId=identity,cursor=cursor,limit=2))
  assert len(m.frame(p))<m.MAX_FRAME
  rows+=p['entries'];cursor=p['cursor']
  if p['eof']:break
  assert time.monotonic()<deadline,p
  time.sleep(.01)
 s.dispatch('fs/discoverClose',dict(discoveryId=identity,operationId='close-'+identity))
 return rows,p
def workspace(root):
 s=m.Server();s.dispatch('initialize',dict(clientId='test'))
 s.dispatch('workspace/open',dict(workspaceId='w',operationId='w',path=root,access='read-only'))
 return s
`;
function run(program: string) {
  const result = spawnSync('python3', ['-c', load + program, helper], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  expect(result.status, result.stderr || result.error?.message || result.stdout).toBe(0);
  return JSON.parse(result.stdout);
}
describe('bounded remote file discovery', () => {
  it.skipIf(process.getuid?.() === 0)('does not mark a permission-truncated directory scan complete', () => {
    expect(run(String.raw`
for git in (False,True):
 with tempfile.TemporaryDirectory() as root:
  if git:subprocess.run(['git','init','-q',root],check=True)
  os.mkdir(root+'/private');open(root+'/private/hidden','w').close();os.chmod(root+'/private',0)
  try:
   s=workspace(root);rows,p=scan(s,'w');assert not p['complete'] and p['error'],p;s.close()
  finally:os.chmod(root+'/private',0o700)
print(json.dumps(True))
`)).toBe(true);
  }, 60_000);
  it('bounds JSON-escaped page bytes as well as item count and preserves replay cursors', () => {
    expect(run(String.raw`
s=m.Server();error('E_NOT_INITIALIZED',lambda:s.dispatch('fs/discoverClose',dict(discoveryId='q',operationId='q')))
d=m.FileDiscovery.__new__(m.FileDiscovery);d.lock=threading.Lock();d.done=threading.Event();d.done.set()
d.entries=[dict(path=str(i)+'\x01'*200,kind='file') for i in range(500)]
d.path_bytes=sum(len(r['path'].encode()) for r in d.entries);d.reason=None;d.error=None;d.source='git';d.skipped=0
p=d.page(dict(cursor=0,limit=500));assert 0<len(p['entries'])<500 and len(m.frame(p))<132000,p
assert d.page(dict(cursor=0,limit=500))==p
error('E_CURSOR',lambda:d.page(dict(cursor=999,limit=500)))
error('E_CURSOR',lambda:d.page(dict(cursor=True,limit=500)))
print(json.dumps(True))
`)).toBe(true);
  });
  it('enumerates tracked ignored files, untracked and nested ignores without following symlinks', () => {
    expect(run(String.raw`
with tempfile.TemporaryDirectory() as root:
 subprocess.run(['git','init','-q',root],check=True)
 os.mkdir(root+'/nested')
 for name,body in {'.gitignore':'*.log\n','tracked.log':'tracked','ignored.log':'ignored','new.txt':'new','nested/.gitignore':'secret*\n','nested/secret.txt':'secret','nested/中文 space.txt':'remote','quote"file':'quote','back\\slash':'slash'}.items():
  with open(root+'/'+name,'w') as f:f.write(body)
 subprocess.run(['git','-C',root,'add','-f','tracked.log'],check=True)
 os.symlink('/etc',root+'/outside');os.symlink(root+'/new.txt',root+'/link')
 s=workspace(root);rows,p=scan(s,'w');names={r['path'] for r in rows}
 assert p['complete'],p
 assert {'tracked.log','new.txt','nested','nested/中文 space.txt','quote"file','back\\slash'}<=names,names
 assert not {'ignored.log','nested/secret.txt','outside','link'}&names,names
 rows,p=scan(s,'w','all',True);assert p['complete'],p
 assert {'ignored.log','nested/secret.txt'}<={r['path'] for r in rows}
 assert not any('.git' in r['path'].split('/') for r in rows)
 s.close()
print(json.dumps(True))
`)).toBe(true);
  }, 60_000);
  it('uses rg outside Git, honors nested ignores, and treats an empty directory as complete', () => {
    expect(run(String.raw`
with tempfile.TemporaryDirectory() as root:
 s=workspace(root);rows,p=scan(s,'w');assert p['complete'] and not rows,p
 os.mkdir(root+'/dir')
 for name,body in {'.ignore':'*.log\n','dir/.ignore':'secret\n','yes.txt':'yes','no.log':'no','dir/secret':'no','dir/ok':'yes'}.items():
  with open(root+'/'+name,'w') as f:f.write(body)
 rows,p=scan(s,'w','next');assert p['complete'] and p['source']=='rg',p
 names={r['path'] for r in rows};assert 'yes.txt' in names and 'dir/ok' in names and 'no.log' not in names and 'dir/secret' not in names,names
 s.close()
print(json.dumps(True))
`)).toBe(true);
  }, 60_000);
  it('reports bounded truncation, preserves cursor replay, and retires cancelled allocation IDs', () => {
    expect(run(String.raw`
m.FileDiscovery.MAX_ENTRIES=3
with tempfile.TemporaryDirectory() as root:
 for i in range(10):open(root+'/'+str(i),'w').close()
 s=workspace(root);rows,p=scan(s,'w');assert len(rows)==3 and not p['complete'] and p['reason']=='limit',p
 result=s.dispatch('fs/discoverClose',dict(discoveryId='late',operationId='cancel'))
 assert result['cancelled']
 error('E_RESOURCE_RETIRED',lambda:s.dispatch('fs/discoverOpen',dict(workspaceId='w',discoveryId='late',operationId='late')))
 assert s.dispatch('fs/discoverClose',dict(discoveryId='late',operationId='retry'))==result
 s.close()
print(json.dumps(True))
`)).toBe(true);
  }, 60_000);
  it('retains explicit missing-tool and permission errors and bounds cancellation during queued scans', () => {
    expect(run(String.raw`
original=m.FileDiscovery.command
for code,message,expected in [(127,'missing','E_EXECUTABLE_NOT_FOUND'),(128,'Permission denied','E_DISCOVERY_GIT')]:
 m.FileDiscovery.command=lambda self,argv,consume:(code,message)
 with tempfile.TemporaryDirectory() as root:
  s=workspace(root);rows,p=scan(s,'w');assert not p['complete'] and p['error']['code']==expected,p;s.close()
m.FileDiscovery.command=original
with tempfile.TemporaryDirectory() as root:
 m.DISCOVERY_SLOTS.acquire();m.DISCOVERY_SLOTS.acquire()
 try:
  s=workspace(root);s.dispatch('fs/discoverOpen',dict(workspaceId='w',discoveryId='q',operationId='q'))
  start=time.monotonic();assert s.dispatch('fs/discoverClose',dict(discoveryId='q',operationId='cancel'))['closed']
  assert time.monotonic()-start<2 and not s.discoveries
  s.close()
 finally:m.DISCOVERY_SLOTS.release();m.DISCOVERY_SLOTS.release()
print(json.dumps(True))
`)).toBe(true);
  });
});
