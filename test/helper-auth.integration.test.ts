import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));
const run = promisify(execFile);

it('requires authenticated Unix transport before accepting a fresh helper session', async () => {
  const program = String.raw`
import json,os,socket,subprocess,sys,tempfile,time
with tempfile.TemporaryDirectory(prefix='dsh-auth-') as root:
 path=os.path.join(root,'helper.sock')
 child=subprocess.Popen([sys.executable,sys.argv[1],'daemon','--socket',path,'--idle-timeout','30'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 try:
  deadline=time.monotonic()+5
  while not os.path.exists(path) and time.monotonic()<deadline:time.sleep(.02)
  client=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);client.settimeout(2);client.connect(path)
  reader=client.makefile('rb')
  greeting=reader.readline(1024)
  assert greeting.startswith(b'DSH-AUTH-1 '), 'raw socket disclosed protocol hello without authentication'
  client.sendall(json.dumps({'dshRpc':'1','id':1,'method':'initialize','params':{'clientId':'unauthenticated'}}).encode()+b'\n')
  reply=reader.readline(1024)
  assert not reply, 'unauthenticated initialize was not rejected'
  reader.close();client.close()
  print(json.dumps({'unauthenticatedRejected':True}))
 finally:
  child.terminate()
  try:child.wait(timeout=3)
  except subprocess.TimeoutExpired:child.kill();child.wait(timeout=3)
`;
  const result = await run('python3', ['-c', program, helper], { timeout: 12_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  expect(JSON.parse(result.stdout)).toEqual({ unauthenticatedRejected: true });
}, 15_000);

it('authenticates both peers and rejects tampered, replayed or oversized records', async () => {
  const program = String.raw`
import importlib.util,io,json,secrets,socket,sys,threading,struct
spec=importlib.util.spec_from_file_location('helper',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
key=secrets.token_bytes(32);left,right=socket.socketpair();server_keys=[]
thread=threading.Thread(target=lambda:server_keys.append(m.authenticate_socket(left,key,True)));thread.start()
client_keys=m.authenticate_socket(right,key,False);thread.join(2)
assert not thread.is_alive() and client_keys[0]==server_keys[0][1] and client_keys[1]==server_keys[0][0]
left.close();right.close()
data=b'{"dshRpc":"1","id":1,"method":"health/status"}\n'
stream=io.BytesIO();m.AuthenticatedWriter(stream,client_keys[0]).write(data);wire=stream.getvalue()
assert key not in wire
reader=m.AuthenticatedReader(io.BytesIO(wire+wire),client_keys[0]);assert reader.readline(m.MAX_FRAME)==data
try:reader.readline(m.MAX_FRAME);raise AssertionError('replay accepted')
except m.RpcError as error:assert error.code=='E_AUTH'
for packet in (wire[:-2]+bytes([wire[-2]^1])+wire[-1:],struct.pack('!QI',0,m.MAX_FRAME+1)):
 try:m.AuthenticatedReader(io.BytesIO(packet),client_keys[0]).readline(m.MAX_FRAME);raise AssertionError('invalid record accepted')
 except m.RpcError as error:assert error.code=='E_AUTH'
left,right=socket.socketpair();seen=[]
def fake_server():
 left.sendall(b'DSH-AUTH-1 '+b'0'*64+b'\n');seen.append(left.recv(256));left.sendall(b'OK '+b'0'*64+b'\n')
thread=threading.Thread(target=fake_server);thread.start()
try:m.authenticate_socket(right,key,False);raise AssertionError('forged server accepted')
except m.RpcError as error:assert error.code=='E_AUTH'
thread.join(2);left.close();right.close();assert key not in b''.join(seen)
print(json.dumps({'mutual':True,'tamperingRejected':True,'replayRejected':True,'bounded':True,'forgedServerRejected':True}))
`;
  const result = await run('python3', ['-c', program, helper], { timeout: 12_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  expect(JSON.parse(result.stdout)).toEqual({ mutual: true, tamperingRejected: true, replayRejected: true, bounded: true, forgedServerRejected: true });
}, 15_000);

it('keeps credentials private and denies filesystem access to the control namespace', async () => {
  const program = String.raw`
import importlib.util,json,os,stat,sys,tempfile
spec=importlib.util.spec_from_file_location('helper',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='dsh-auth-paths-') as root:
 runtime=os.path.join(root,'runtime');os.mkdir(runtime,0o700)
 path=m.runtime_socket(os.path.join(runtime,'daemon.sock'));key=m.transport_key(path,create=True)
 assert m.transport_key(path)==key and len(key)==32
 assert stat.S_IMODE(os.stat(path+'.auth').st_mode)==0o600
 assert not any('.new-' in name for name in os.listdir(runtime))
 ws=m.Workspace(root,'danger-full-access')
 try:
  for name in ('runtime','runtime/daemon.sock.auth'):
   try:ws.parent(name);raise AssertionError('control namespace exposed')
   except m.RpcError as error:assert error.code=='E_PERMISSION_DENIED'
  try:m.Workspace(runtime,'danger-full-access');raise AssertionError('private workspace accepted')
  except m.RpcError as error:assert error.code=='E_PERMISSION_DENIED'
 finally:ws.close()
 os.chmod(path+'.auth',0o644)
 try:m.transport_key(path);raise AssertionError('public credential file accepted')
 except m.RpcError as error:assert error.code=='E_AUTH'
 os.unlink(path+'.auth');os.symlink('/dev/null',path+'.auth')
 try:m.transport_key(path,create=True);raise AssertionError('credential symlink followed')
 except OSError:pass
print(json.dumps({'permissions':True,'privateNamespace':True,'symlinkRejected':True}))
`;
  const result = await run('python3', ['-c', program, helper], { timeout: 12_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  expect(JSON.parse(result.stdout)).toEqual({ permissions: true, privateNamespace: true, symlinkRejected: true });
}, 15_000);
