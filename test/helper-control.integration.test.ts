import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const helper = fileURLToPath(new URL('../helper/dsh_remote_helper.py', import.meta.url));

it('bridges fd 7 separately from stdout with bounded lossless reads and idempotent writes', async () => {
  const program = String.raw`
import base64,importlib.util,json,os,sys,tempfile,time
spec=importlib.util.spec_from_file_location('helper',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
server=m.Server()
try:
 server.dispatch('initialize',{'clientId':'control-test'})
 with tempfile.TemporaryDirectory() as root:
  server.dispatch('workspace/open',{'path':root,'access':'danger-full-access','workspaceId':'ws','operationId':'open-ws'})
  code="import os,socket; s=socket.socket(fileno=7); assert os.environ['DSH_SUBPROCESS_CONTROL']=='pipe'; data=s.recv(16); s.sendall(data+b'x'*1048576); s.shutdown(socket.SHUT_WR); print('ordinary stdout'); assert s.recv(1)==b''"
  server.dispatch('process/start',{'workspaceId':'ws','processId':'child','operationId':'start-child','argv':[sys.executable,'-c',code],'control':'pipe','stdin':'closed'})
  params={'processId':'child','afterSeq':'0','operationId':'input-0','data':base64.b64encode(b'hello').decode()}
  first=server.dispatch('process/controlWrite',params);assert server.dispatch('process/controlWrite',params)==first
  time.sleep(.2)
  assert len(server.process({'processId':'child'}).control_buffer)<=524288
  cursor='0';data=b'';deadline=time.monotonic()+8
  while time.monotonic()<deadline:
   params={'processId':'child','afterSeq':cursor,'maxBytes':65536,'waitMs':100}
   result=server.dispatch('process/controlRead',params)
   if result['data']:assert server.dispatch('process/controlRead',params)['data']==result['data']
   data+=base64.b64decode(result['data']);cursor=result['nextSeq']
   if result['eof']:break
  assert data==b'hello'+b'x'*1048576,len(data)
  server.dispatch('process/controlWrite',{'processId':'child','afterSeq':'1','operationId':'input-1','eof':True})
  cursor='0';out=b''
  while time.monotonic()<deadline:
   result=server.dispatch('process/read',{'processId':'child','afterSeq':cursor,'waitMs':100});cursor=result['nextSeq']
   out+=b''.join(base64.b64decode(item['data']) for item in result['chunks'])
   if result['exited']:break
  assert result['exited'] and result['exitCode']==0,(result,out)
  assert out==b'ordinary stdout\n',out
  server.dispatch('process/release',{'processId':'child','operationId':'release-child'})
  print(json.dumps({'lossless':True,'bounded':True,'replay':True,'isolated':True}))
finally:server.close()
`;
  const result = await promisify(execFile)('python3', ['-c', program, helper], { timeout: 15_000 });
  expect(JSON.parse(result.stdout)).toEqual({ lossless: true, bounded: true, replay: true, isolated: true });
}, 20_000);
