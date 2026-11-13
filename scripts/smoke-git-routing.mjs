// Opt-in, tiny SSH fixture. Does not change SSH configuration or user projects.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {buildSystemSshArgs} from '../lib/helper/installer.js';
import {buildRemoteSshInvocation} from '../lib/runtime-router.js';
const alias=process.argv[2];
assert(alias && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(alias),'Supply an explicit SSH alias');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const ssh=(command,input)=>execFileSync('ssh',buildSystemSshArgs(alias,command),{encoding:'utf8',timeout:30000,input});
const root=ssh('mktemp -d /tmp/dsh-git-smoke.XXXXXXXX').trim();
assert.match(root,/^\/tmp\/dsh-git-smoke\.[a-zA-Z0-9]{8}$/);
const workspace=root+'/project space',runtimeBase=workspace+'/runtime',auth=runtimeBase+'/dsh-remote-helper/fixture.sock.auth';
const anchor='C:\\DSH\\anchors\\test',uri='ssh://'+alias+workspace;
const windowsGit='C:\\Program Files\\Git\\cmd\\git.EXE';
const runner='C:\\DSH\\node_modules\\@deepseek-ai\\dsh-sandbox-windows-acl\\lib\\runner.js';
const report={alias,host:process.platform,simulatedWindowsArgv:true,checks:[],modelRequests:0};
const execute=(mode,command,env={},policyRoot=workspace)=>{
 const argv=mode==='danger-full-access'?command:['C:\\DSH\\DeepSeek Harness.exe',runner,
  '--workspace',anchor,'--temp','C:\\temp','--mode',mode,'--',...command];
 const invocation=buildRemoteSshInvocation(uri,argv,env,false,p=>p===anchor?'ssh://'+alias+policyRoot:undefined);
 const commandText='exec env '+quote('DSH_REMOTE_HELPER_RUNTIME_DIR='+runtimeBase)+' '+quote('PYTHONPATH='+workspace)
  +' sh -c '+quote(invocation.at(-1));
 return spawnSync('ssh',buildSystemSshArgs(alias,commandText),{encoding:'utf8',timeout:20000});
};
try{
 ssh('python3 - '+quote(root),`import os,pathlib,sys\nr=pathlib.Path(sys.argv[1]);w=r/'project space';p=w/'runtime'/'dsh-remote-helper';p.mkdir(parents=True);(p/'fixture.sock.auth').write_text('PRIVATE_CONTROL_FIXTURE');(w/'remote.exe').write_text('#!/bin/sh\\nprintf POSIX_EXE\\n');(w/'remote.exe').chmod(0o755);(w/'hashlib.py').write_text("open("+repr(str(r/'escaped'))+", 'w').write('outside sandbox')\\nraise RuntimeError('workspace import')\\n")\n`);
 ssh('git -C '+quote(workspace)+' init -q && git -C '+quote(workspace)+' -c user.name=RoutingTest -c user.email=routing@example.test -c commit.gpgsign=false commit --allow-empty -qm fixture');
 for(const mode of ['danger-full-access','read-only','workspace-write']){
  const git=execute(mode,[windowsGit,'--no-optional-locks','rev-parse','--show-toplevel','HEAD'],{GIT_TERMINAL_PROMPT:'0'});
  assert.equal(git.status,0,git.stderr);
  assert.equal(git.stdout.split('\n')[0],workspace);
  assert.match(git.stdout.split('\n')[1],/^[a-f0-9]{40,64}$/);
  report.checks.push('git:'+mode);
 }
 for(const [mode,policyRoot] of [['read-only',workspace],['workspace-write',workspace],['workspace-write','/tmp']]){
  const check=execute(mode,['/bin/sh','-c','test ! -e '+quote(auth)+' && printf PRIVATE_HIDDEN'],{},policyRoot);
  assert.equal(check.status,0,check.stderr);assert.equal(check.stdout,'PRIVATE_HIDDEN');
  report.checks.push('private-control:'+mode+':'+(policyRoot==='/tmp'?'tmp-root':'workspace'));
 }
 const write=execute('workspace-write',['/bin/sh','-c','printf yes > write-proof']);assert.equal(write.status,0,write.stderr);
 const deny=execute('read-only',['/bin/sh','-c','if printf no > forbidden; then exit 99; fi']);assert.equal(deny.status,0,deny.stderr);
 const posix=execute('read-only',[workspace+'/remote.exe']);assert.equal(posix.status,0,posix.stderr);assert.equal(posix.stdout,'POSIX_EXE');
 const environment=execute('read-only',['/bin/sh','-c','printf "%s" "$PATH"'],{PATH:'/payload/only'});
 assert.equal(environment.status,0,environment.stderr);assert.equal(environment.stdout,'/payload/only');
 ssh('test ! -e '+quote(root+'/escaped')+' && test ! -e '+quote(workspace+'/forbidden'));
 report.checks.push('workspace-write','read-only-denial','posix-exe-preserved','caller-env-inside-only','python-startup-isolated');
 console.log(JSON.stringify(report,null,2));
}finally{
 // Root is a validated mktemp result made only by this script.
 ssh('rm -rf -- '+quote(root));
}
