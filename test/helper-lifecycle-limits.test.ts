import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const load = String.raw`
import base64,importlib.util,json,os,socket,sys,tempfile,threading,time,types
spec=importlib.util.spec_from_file_location('dsh_helper',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def expect_error(code,call):
 try:call()
 except m.RpcError as exc:assert exc.code==code,(exc.code,code)
 else:raise AssertionError('expected '+code)
`;

function run(program: string): any {
  const result = spawnSync('python3', ['-c', load + program, helper], {
    encoding: 'utf8', timeout: 20_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  expect(result.status, result.stderr || result.error?.message).toBe(0);
  return JSON.parse(result.stdout);
}

describe('helper bounded input and lifecycle admission', () => {
  it('keeps 10,000 input mutations bounded while a saturated ordinary journal remains replay-safe', () => {
    expect(run(String.raw`
server=m.Server();server.dispatch('initialize',{'clientId':'bounded-input'})
calls={'write':0,'resize':0}
def action(kind):
 def apply(p):
  calls[kind]+=1
  return {'written':len(base64.b64decode(p['data'])),'eof':False} if kind=='write' else {'resized':True}
 return apply
record=types.SimpleNamespace(write_lane=m.InputLane(),resize_lane=m.InputLane(),write=action('write'),resize=action('resize'))
server.processes['p']=record
stamp=time.monotonic()
server.operations={str(i):('digest',{'n':i},stamp) for i in range(m.MAX_OPERATIONS)}
server.operation_locks={key:threading.Lock() for key in server.operations}
before=dict(server.operations)
for i in range(5000):
 for kind in ('write','resize'):
  params={'processId':'p','operationId':kind+'-'+str(i),'afterSeq':str(i),'data':'eA==','rows':24,'cols':80}
  result=server.dispatch('process/'+kind,params)
  assert result['nextSeq']==str(i+1)
  assert server.dispatch('process/'+kind,params)==result
assert calls=={'write':5000,'resize':5000},calls
assert server.operations==before and len(server.operation_locks)==m.MAX_OPERATIONS
assert record.write_lane.next_seq==record.resize_lane.next_seq==5000
expect_error('E_OPERATION_CONFLICT',lambda:server.dispatch('process/resize',dict(params,cols=81)))
expect_error('E_CURSOR',lambda:server.dispatch('process/resize',dict(params,afterSeq='0')))
expect_error('E_CURSOR',lambda:server.dispatch('process/resize',dict(params,afterSeq='5001')))
expect_error('E_RESOURCE_LIMIT',lambda:server.dispatch('process/write',{'processId':'p','operationId':'legacy','data':'eA=='}))
lane=m.InputLane();entered=threading.Event();proceed=threading.Event();outcomes=[];invocations=[]
p={'operationId':'partial','afterSeq':'0','data':'YQ=='}
def partial(p):
 invocations.append(1);entered.set();assert proceed.wait(2)
 raise m.RpcError('E_STDIN_CLOSED','partial write failed')
def retry():
 try:lane.apply(p,partial)
 except m.RpcError as exc:outcomes.append(exc.code)
first=threading.Thread(target=retry);first.start();assert entered.wait(2)
second=threading.Thread(target=retry);second.start();proceed.set();first.join(2);second.join(2)
for _ in range(100):retry()
assert invocations==[1] and outcomes==['E_STDIN_CLOSED']*102
assert isinstance(lane.error,tuple) and not isinstance(lane.error,BaseException)
print(json.dumps({'writes':calls['write'],'resizes':calls['resize'],'journal':len(server.operations),'partialApplications':len(invocations)}))
`)).toEqual({ writes: 5000, resizes: 5000, journal: 4096, partialApplications: 1 });
  });

  it('reserves retirement capacity before opening resources and never blocks their cleanup on journal saturation', () => {
    expect(run(String.raw`
clock=[1000.0];m.time.monotonic=lambda:clock[0]
m.MAX_CLEANUP_IDENTITIES=4
server=m.Server();server.dispatch('initialize',{'clientId':'cleanup-budget'})
with tempfile.TemporaryDirectory() as root:
 with open(os.path.join(root,'file'),'w') as f:f.write('data')
 server.dispatch('workspace/open',{'workspaceId':'w','operationId':'w','path':root,'access':'danger-full-access'})
 for identity in ('a','b'):
  server.dispatch('fs/readOpen',{'workspaceId':'w','path':'file','handleId':identity,'operationId':identity})
 server.dispatch('fs/writeOpen',{'workspaceId':'w','path':'upload','handleId':'u','operationId':'u'})
 server.dispatch('fs/close',{'handleId':'a','operationId':'close-a'})
 expect_error('E_RESOURCE_LIMIT',lambda:server.dispatch('fs/readOpen',{'workspaceId':'w','path':'file','handleId':'extra','operationId':'extra'}))
 expect_error('E_RESOURCE_RETIRED',lambda:server.dispatch('fs/readOpen',{'workspaceId':'w','path':'file','handleId':'a','operationId':'reopen-a'}))
 # Journal pressure cannot consume any live resource's reserved retirement slot.
 server.operations={str(i):('digest',{},clock[0]) for i in range(m.MAX_OPERATIONS)}
 server.operation_locks={key:threading.Lock() for key in server.operations}
 assert server.dispatch('fs/close',{'handleId':'b','operationId':'close-b'})=={'closed':True}
 assert server.dispatch('fs/close',{'handleId':'b','operationId':'different-close-b'})=={'closed':True}
 assert server.dispatch('workspace/close',{'workspaceId':'w','operationId':'close-w'})=={'closed':True}
 assert server.dispatch('fs/writeAbort',{'handleId':'u','operationId':'abort-u'})=={'aborted':True}
 assert len(server.closed_resources)==4 and not server.read_handles and not server.write_handles and not server.workspaces
 # Expiry restores admission, without a permanent per-session allocation cap.
 clock[0]+=601
 server.dispatch('workspace/open',{'workspaceId':'new-w','operationId':'new-w','path':root,'access':'danger-full-access'})
 server.close()
class Process:
 def __init__(self,fail=False):self.process_id='p';self.fail=fail;self.releases=0
 def release(self):
  self.releases+=1
  if self.fail:raise m.RpcError('E_CLEANUP_FAILED','not confirmed')
  return {'released':True}
 def terminate(self,*args):return {'running':False}
record=Process();server.processes['p']=record
server.operations={str(i):('digest',{},clock[0]) for i in range(m.MAX_OPERATIONS)}
server.operation_locks={key:threading.Lock() for key in server.operations}
with server.resources_lock:
 for i in range(3):server.cancel_allocation('cancelled-'+str(i))
expect_error('E_RESOURCE_LIMIT',lambda:server.cancel_allocation('overflow'))
assert server.dispatch('process/terminate',{'processId':'p','operationId':'term'})=={'running':False}
released=server.dispatch('process/release',{'processId':'p','operationId':'release'})
assert released=={'released':True}
for i in range(20):assert server.dispatch('process/release',{'processId':'p','operationId':'repeat-'+str(i)})==released
assert record.releases==1 and len(server.cancelled_processes)==4
assert server.dispatch('process/terminate',{'processId':'p','operationId':'late-term'})=={'running':False}
bad=Process(True);server.processes['bad']=bad
for _ in range(2):expect_error('E_CLEANUP_FAILED',lambda:server.dispatch('process/release',{'processId':'bad','operationId':'bad-release'}))
assert 'bad' in server.processes and 'bad' not in server.released_processes
r=m.ProcessRecord.__new__(m.ProcessRecord);r.released=False;r.terminate_lock=threading.Lock()
r.write_cancelled=threading.Event();r.terminate_results={};terminations=[]
def control(method,p):
 terminations.append(dict(p));return {'running':True,'graceMs':p['graceMs']}
r.control=types.SimpleNamespace(call=control)
soft=r.terminate(False,200)
for _ in range(50):assert r.terminate(False,1000)==soft
assert r.terminate(True,0)==r.terminate(True,0)
assert r.terminate(False,200)=={'running':False}
assert len(terminations)==2 and r.write_cancelled.is_set()
print(json.dumps({'genericRetirements':4,'processRetirements':len(server.cancelled_processes),'releaseCalls':record.releases,'failuresPreserved':bad.releases}))
`)).toEqual({ genericRetirements: 4, processRetirements: 4, releaseCalls: 1, failuresPreserved: 2 });
  });

  it('retains a sequenced write across an actual socket reconnect and still releases the process at saturation', () => {
    expect(run(String.raw`
state=m.DaemonState(600)
def connect():
 client,remote=socket.socketpair();reader=client.makefile('rb');writer=client.makefile('wb')
 def serve():
  with remote,remote.makefile('rb') as inp,remote.makefile('wb') as out:m.serve_protocol(inp,out,state)
 worker=threading.Thread(target=serve);worker.start();assert json.loads(reader.readline())['method']=='server/hello'
 return client,reader,writer,worker
def request(link,method,params):
 client,reader,writer,worker=link
 writer.write(m.frame({'dshRpc':'1','id':'request','method':method,'params':params}));writer.flush()
 response=json.loads(reader.readline())
 assert 'error' not in response,response
 return response['result']
def disconnect(link):
 client,reader,writer,worker=link
 client.shutdown(socket.SHUT_WR);writer.close();reader.close();client.close();worker.join(3);assert not worker.is_alive()
link=connect();initialized=request(link,'initialize',{'clientId':'socket-input'})
assert initialized['capabilities']['process']['sequencedWrite'] and initialized['capabilities']['pty']['sequencedResize']
request(link,'workspace/open',{'workspaceId':'w','operationId':'w','path':tempfile.gettempdir(),'access':'danger-full-access'})
request(link,'process/start',{'workspaceId':'w','processId':'p','operationId':'p','argv':[sys.executable,'-u','-c','import sys; sys.stdout.write(sys.stdin.read())']})
server=state.sessions['socket-input'];record=server.processes['p']
with server.resources_lock:
 server.operations={str(i):('digest',{},time.monotonic()) for i in range(m.MAX_OPERATIONS)}
 server.operation_locks={key:threading.Lock() for key in server.operations}
params={'processId':'p','operationId':'first','afterSeq':'0','data':base64.b64encode(b'EXACTLY_ONCE\n').decode()}
first=request(link,'process/write',params);assert first['nextSeq']=='1'
disconnect(link);link=connect()
resumed=request(link,'initialize',{'clientId':'socket-input','resumeToken':initialized['session']['resumeToken']})
assert resumed['session']['resumed']
assert request(link,'process/write',params)==first
request(link,'process/write',{'processId':'p','operationId':'eof','afterSeq':'1','data':'','eof':True})
output=b'';cursor='0'
for _ in range(50):
 result=request(link,'process/read',{'processId':'p','afterSeq':cursor,'waitMs':100});cursor=result['nextSeq']
 output+=b''.join(base64.b64decode(chunk['data']) for chunk in result['chunks'])
 if result['exited']:break
assert output==b'EXACTLY_ONCE\n',output
assert request(link,'process/release',{'processId':'p','operationId':'release'})=={'released':True}
assert request(link,'process/release',{'processId':'p','operationId':'release'})=={'released':True}
assert request(link,'workspace/close',{'workspaceId':'w','operationId':'close-w'})=={'closed':True}
disconnect(link);state.remove(server)
print(json.dumps({'resumed':True,'output':output.decode(),'released':record.released}))
`)).toEqual({ resumed: true, output: 'EXACTLY_ONCE\n', released: true });
  });

  it('preserves commit outcomes across a waiting abort and never hides upload cleanup failure', () => {
    expect(run(String.raw`
server=m.Server();server.dispatch('initialize',{'clientId':'abort-race'})
with tempfile.TemporaryDirectory() as root:
 server.dispatch('workspace/open',{'workspaceId':'w','operationId':'w','path':root,'access':'danger-full-access'})
 server.dispatch('fs/writeOpen',{'workspaceId':'w','handleId':'u','operationId':'u','path':'target'})
 handle=server.write_handles['u'];entered=threading.Event();outcomes=[];original=server.write_handle
 def observed(p):
  result=original(p)
  if threading.current_thread().name=='abort':entered.set()
  return result
 server.write_handle=observed
 def abort():outcomes.append(server.dispatch('fs/writeAbort',{'handleId':'u','operationId':'abort'}))
 with handle['lock']:
  worker=threading.Thread(target=abort,name='abort');worker.start();assert entered.wait(2)
  server.commit_write_locked(handle,handle['parent'],handle['name'],handle['intent'])
 worker.join(2);assert not worker.is_alive()
 assert outcomes==[{'aborted':False,'committed':True}],outcomes
 assert server.closed_resources[('write','u')][0]==outcomes[0]
 assert os.path.exists(os.path.join(root,'target'))
 server.dispatch('fs/writeOpen',{'workspaceId':'w','handleId':'failed-commit','operationId':'failed-commit','path':'fail-target'})
 replace=m.os.replace
 def fail_replace(*args,**kwargs):raise PermissionError(13,'injected publish failure')
 m.os.replace=fail_replace
 try:expect_error('E_PERMISSION_DENIED',lambda:server.dispatch('fs/writeCommit',{'handleId':'failed-commit','operationId':'commit-error'}))
 finally:m.os.replace=replace
 expect_error('E_RESOURCE_RETIRED',lambda:server.dispatch('fs/writeOpen',{'workspaceId':'w','handleId':'failed-commit','operationId':'replacement','path':'replacement'}))
 assert server.dispatch('fs/writeAbort',{'handleId':'failed-commit','operationId':'stale-abort'})=={'aborted':False,'commitOutcome':'unconfirmed'}
 server.dispatch('fs/writeOpen',{'workspaceId':'w','handleId':'bad','operationId':'bad','path':'other'})
 bad=server.write_handles['bad'];unlink=m.os.unlink
 def fail_unlink(path,*args,**kwargs):
  if path==bad['temporary']:raise PermissionError('injected upload cleanup failure')
  return unlink(path,*args,**kwargs)
 m.os.unlink=fail_unlink
 try:
  for _ in range(2):expect_error('E_CLEANUP_FAILED',lambda:server.dispatch('fs/writeAbort',{'handleId':'bad','operationId':'bad-abort'}))
  assert ('write','bad') not in server.closed_resources and 'bad' in server.write_handles
 finally:m.os.unlink=unlink
 # Only the fixture may explicitly remove its injected failed cleanup record.
 server.write_handles.pop('bad');server.close()
print(json.dumps({'commitPreserved':True,'cleanupFailurePreserved':True}))
`)).toEqual({ commitPreserved: true, cleanupFailurePreserved: true });
  });

  it('discards an upload allocation if its workspace closes before publication', () => {
    expect(run(String.raw`
server=m.Server();server.dispatch('initialize',{'clientId':'open-close-race'})
with tempfile.TemporaryDirectory() as root:
 server.dispatch('workspace/open',{'workspaceId':'w','operationId':'w','path':root,'access':'danger-full-access'})
 ws=server.workspaces['w'];original=ws.parent;entered=threading.Event();proceed=threading.Event();outcomes=[]
 def paused_parent(path):
  result=original(path);entered.set();assert proceed.wait(2);return result
 ws.parent=paused_parent
 def open_upload():
  try:server.dispatch('fs/writeOpen',{'workspaceId':'w','handleId':'u','operationId':'u','path':'target'})
  except m.RpcError as exc:outcomes.append(exc.code)
 worker=threading.Thread(target=open_upload);worker.start();assert entered.wait(2)
 assert server.dispatch('workspace/close',{'workspaceId':'w','operationId':'close'})=={'closed':True}
 proceed.set();worker.join(2);assert not worker.is_alive()
 assert outcomes==['E_UNKNOWN_WORKSPACE'] and not server.write_handles,outcomes
 assert os.listdir(root)==[]
print(json.dumps({'lateUploadRejected':True,'temporaryRemoved':True}))
`)).toEqual({ lateUploadRejected: true, temporaryRemoved: true });
  });

  it('sweeps expired sessions on a continuously successful accept loop using monotonic deadlines', () => {
    expect(run(String.raw`
clock=[0.0];m.time.monotonic=lambda:clock[0]
states=[];closed=[];accepted=[]
base=m.DaemonState
class State(base):
 def __init__(self,*args):
  super().__init__(*args);states.append(self)
  server=self.acquire({'clientId':'expired'});server.retention_ms=500
  server.close=lambda:closed.append(clock[0]);self.detach(server)
class Listener:
 def bind(self,path):
  with open(path,'wb'):pass
 def listen(self,*args):pass
 def settimeout(self,*args):pass
 def close(self):pass
 def accept(self):
  clock[0]+=.25;accepted.append(clock[0])
  # Real local sockets, but deterministic busy accept scheduling: never timeout.
  left,right=socket.socketpair();right.close()
  if len(accepted)==8:states[0].shutdown.set()
  return left,None
class Thread:
 def __init__(self,target,args,**kwargs):self.target=target;self.args=args
 def start(self):self.target(*self.args)
original_socket=m.socket.socket
class Factory:
 def __call__(self,*args,**kwargs):
  # socketpair internally constructs sockets with fileno; keep those real.
  return original_socket(*args,**kwargs) if 'fileno' in kwargs or len(args)>=4 else Listener()
m.socket.socket=Factory();m.DaemonState=State;m.threading.Thread=Thread
m.serve_protocol=lambda *args:None
with tempfile.TemporaryDirectory() as root:m.run_daemon(os.path.join(root,'daemon.sock'),600)
assert closed==[.5],closed
assert len(accepted)==8 and not states[0].sessions
# Cleanup occurs outside the daemon lock, and new activity cannot race idle shutdown.
state=base(1);server=state.acquire({'clientId':'second'});server.retention_ms=1;state.detach(server)
def close_reentrant():
 assert state.open_connection();state.close_connection()
server.close=close_reentrant
clock[0]+=10;state.sweep();assert not state.shutdown.is_set()
print(json.dumps({'expiredAt':closed[0],'accepts':len(accepted),'idleRaceSafe':True}))
`)).toEqual({ expiredAt: 0.5, accepts: 8, idleRaceSafe: true });
  });

  it('pins the PTY descriptor during resize without queuing behind blocked stdin', () => {
    expect(run(String.raw`
record=m.ProcessRecord.__new__(m.ProcessRecord)
record.lock=threading.Lock();record.pty_lock=threading.Lock();record.released=False
entered=threading.Event();proceed=threading.Event();closed=threading.Event();outcomes=[]
def ioctl(rows,cols):entered.set();assert proceed.wait(2)
record._resize=ioctl
record.lock.acquire()
worker=threading.Thread(target=lambda:outcomes.append(record.resize({'rows':24,'cols':80})))
worker.start();assert entered.wait(2)
def close_descriptor():
 with record.pty_lock:record.released=True;closed.set()
closer=threading.Thread(target=close_descriptor);closer.start();assert not closed.wait(.05)
proceed.set();worker.join(2);closer.join(2);record.lock.release()
assert not worker.is_alive() and not closer.is_alive() and outcomes==[{'resized':True}]
expect_error('E_PROCESS_EXITED',lambda:record.resize({'rows':24,'cols':80}))
print(json.dumps({'descriptorPinned':True,'independentOfStdin':True}))
`)).toEqual({ descriptorPinned: true, independentOfStdin: true });
  });
});
