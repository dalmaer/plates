// Test-only inherited-FD harness. The explicit stdio positive control requires
// native spawn options that run() deliberately does not expose. All children
// still receive cleanEnv(); ordinary test subprocesses use run().
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cleanEnv } from './run.mjs';

export function credentialPipeSources(moduleUrl) {
// Python is test-only: launch a real anonymous FIFO deliberately inheritable at
// fd50. Node's stdio:'pipe' is a socketpair on this host, not this channel.
const bootstrap = `import os,subprocess,sys,time
r,w=os.pipe()
os.dup2(r,50,inheritable=True)
p=subprocess.Popen([sys.argv[1],sys.argv[2],sys.argv[3]],pass_fds=(50,),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
os.close(r);os.close(50)
try:
 mode=sys.argv[3]
 key='acme-synthetic-credential-only'
 body='{"schemaVersion":1,"ref":"acme-key","generation":1,"key":"'+key+'"}'
 if mode=='oversize': body='x'*8193
 if mode=='exact-limit': body=body+' '*(8192-len(body))
 if mode=='extra': body=body[:-1]+',"extra":true}'
 if mode=='duplicate': body=body[:-1]+',"key":"'+key+'"}'
 if mode=='surrogate': body=body.replace('acme-key',r'acme-\\ud800')
 if mode=='mismatch': body=body.replace('"generation":1','"generation":2')
 if mode not in ['timeout','abort','already-aborted']:
  os.write(w,b'\\xff' if mode=='utf8' else body.encode())
  if mode!='no-eof': os.close(w);w=None
 out,err=p.communicate(timeout=8)
 sys.stdout.write(out);sys.stderr.write(err);sys.exit(p.returncode)
finally:
 if w is not None: os.close(w)
 if p.poll() is None: p.kill()
 p.wait()
 p.stdout.close();p.stderr.close()
`;
const child = `import {readCredentialPipe} from ${JSON.stringify(moduleUrl)};
import {fstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {cleanEnv} from ${JSON.stringify(new URL('./run.mjs', import.meta.url).href)};
const mode=process.argv[2];
const before=fstatSync(50);
const checkCode=\`const fs=require('node:fs');try{const s=fs.fstatSync(50);console.log(JSON.stringify({dev:s.dev,ino:s.ino}));}catch(e){console.log(JSON.stringify({code:e.code}));}\`;
function probe(command,args,stdio=['ignore','pipe','pipe']) {
 const r=spawnSync(command,args,{stdio,encoding:'utf8',timeout:2000,env:cleanEnv()});
 if(r.status!==0)throw Error('Acme child probe failed');
 const s=JSON.parse(r.stdout);return s.dev===before.dev&&s.ino===before.ino;
}
// Deliberately pass fd50 once: proves the probe would catch inheritance.
const explicit=Array.from({length:51},()=> 'ignore');explicit[1]='pipe';explicit[2]='pipe';explicit[50]=50;
const control=probe(process.execPath,['-e',checkCode],explicit);
const inherited=probe(process.execPath,['-e',checkCode]);
// Exercise actual preparatory Git before the pipe wrapper/approved consumption.
const quote=s=>"'"+s.replaceAll("'", "'\\\"'\\\"'")+"'";
const gitInherited=probe('git',['-c','alias.acme-fd=!'+quote(process.execPath)+' -e '+quote(checkCode),'acme-fd']);
const guard=setTimeout(()=>{throw new Error('Acme credential read/close did not finish')},2000);
const abort=new AbortController();if(mode==='already-aborted')abort.abort();
let ticked=false;const tick=setTimeout(()=>{ticked=true;if(mode==='abort')abort.abort()},20);
let code='ok',matches=false;
try { const key=await readCredentialPipe({fd:50,expected:{ref:'acme-key',generation:1},deadline:Date.now()+(['timeout','no-eof'].includes(mode)?80:1000),signal:abort.signal});matches=key==='acme-synthetic-credential-only'; }
catch(e){code=e.code;if(e.message!==code||Object.hasOwn(e,'cause'))throw Error('Acme unsafe error');}
clearTimeout(tick);clearTimeout(guard);
let closed=false;try{fstatSync(50)}catch(e){closed=e.code==='EBADF'}
console.log(JSON.stringify({code,matches,closed,ticked,inherited,gitInherited,control}));
`;
  return { bootstrap, child };
}

export async function syntheticSocket() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},3000)'], {
    env: cleanEnv(), stdio: ['pipe', 'ignore', 'ignore'],
  });
  const closed = once(child, 'close');
  await once(child, 'spawn');
  return {
    fd: child.stdin._handle.fd, // Test observation only; no private runtime API.
    async close() {
      child.stdin.destroy();
      child.kill('SIGKILL');
      await closed;
    },
  };
}
