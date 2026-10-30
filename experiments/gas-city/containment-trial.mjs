// Actual pinned Gas City provider owns a fixed offline containment probe, never a model.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import dgram from 'node:dgram';
import {validateChecks,bounded,cleanupAll} from './containment-evidence.mjs';
import {UPSTREAM} from './client.mjs';
import {cleanEnvironment,sandboxProfile} from './containment.mjs';
const [binaryArg,outputArg]=process.argv.slice(2);if(!binaryArg||!outputArg)throw Error('Usage: node experiments/gas-city/containment-trial.mjs <pinned-loop-driver> <new-report.json>');
const binary=resolve(binaryArg),output=resolve(outputArg),here=dirname(fileURLToPath(import.meta.url));if(existsSync(output))throw Error('retain previous report; choose new output');
const root=mkdtempSync('/tmp/plates-contained-'),worktree=join(root,'worker'),scratch=join(root,'scratch'),privateRoot=join(root,'private');
for(const d of [worktree,scratch,privateRoot,join(root,'tasks'),join(root,'gates'),join(root,'results')])mkdirSync(d,{mode:0o700});
const id='acme-containment-probe';writeFileSync(join(root,'tasks',`${id}.json`),'{}');
const protect={scorer:join(privateRoot,'scorer.mjs'),heldout:join(privateRoot,'task-b.txt'),sibling:join(privateRoot,'sibling.txt'),credentialCanary:join(privateRoot,'synthetic-auth.txt')};for(const [key,path]of Object.entries(protect))writeFileSync(path,`acme-${key}-canary`,{mode:0o600});
const score=join(privateRoot,'score.json');writeFileSync(score,'NOT-SCORED');
let tcpHits=0,udpHits=0,unixHits=0,driver=null,exit=null,reader=null,lines=null,stderr='';
let failure=null,report=null,cleanup=null,cleanupErrors=[];
const closers=[],sockets=new Set();
const track=s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));return s;};
try{
 const tcp=net.createServer(s=>{tcpHits++;track(s).end();});
 closers.push(()=>new Promise((yes,no)=>tcp.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?no(e):yes())));
 const unix=net.createServer(s=>{unixHits++;track(s).end();});
 closers.push(()=>new Promise((yes,no)=>unix.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?no(e):yes())));
 const udp=dgram.createSocket('udp4');
 closers.push(()=>new Promise((yes,no)=>{try{udp.close(yes);}catch(e){if(e.code==='ERR_SOCKET_DGRAM_NOT_RUNNING')yes();else no(e);}}));
 udp.on('message',()=>udpHits++);
 const unixSocket=join(worktree,'canary.sock');
 const ready=Promise.all([once(tcp,'listening'),once(unix,'listening'),once(udp,'listening')]);ready.catch(()=>{});
 tcp.listen(0,'127.0.0.1');unix.listen(unixSocket);udp.bind(0,'127.0.0.1');await bounded(ready,'canary listeners');
 // Existing live destinations distinguish refusal from missing services.
 for(const address of [{host:'127.0.0.1',port:tcp.address().port},{path:unixSocket}]){
  const socket=track(net.createConnection(address)),closed=once(socket,'close');closed.catch(()=>{});
  await bounded(once(socket,'connect'),'positive control connect');socket.end();await bounded(closed,'positive control close');
 }
 const u=dgram.createSocket('udp4');
 closers.push(()=>new Promise((yes,no)=>{try{u.close(yes);}catch(e){if(e.code==='ERR_SOCKET_DGRAM_NOT_RUNNING')yes();else no(e);}}));
 const message=once(udp,'message');message.catch(()=>{});
 await bounded(new Promise((yes,no)=>{u.once('error',no);u.send('acme-control',udp.address().port,'127.0.0.1',e=>e?no(e):yes());}),'positive UDP send');
 await bounded(message,'positive UDP receipt');assert.equal(tcpHits,1);assert.equal(unixHits,1);assert.equal(udpHits,1);
 const allowed=join(worktree,'allowed.txt');writeFileSync(allowed,'acme-allowed');
 const spec={allowed,allowedWrite:join(worktree,'edit.txt'),protected:protect,score,symlink:join(worktree,'symlink'),hardlink:join(worktree,'hardlink'),parentPID:process.pid,tcpPort:tcp.address().port,udpPort:udp.address().port,unixSocket};
 const input=join(worktree,'probe-input.json');writeFileSync(input,JSON.stringify(spec));
 const probe=join(here,'containment-probe-worker.mjs'),launcher=join(here,'containment-worker-launcher.mjs');
 writeFileSync(join(root,'probe-launch.json'),JSON.stringify({kind:'offline-containment-probe',modelExecution:'not-authorized',worktree,scratch,input,probe}));
 driver=spawn(binary,[root,process.execPath,launcher],{env:cleanEnvironment({scratch:root}),stdio:['ignore','pipe','pipe']});
 exit=once(driver,'exit');exit.catch(()=>{});reader=createInterface({input:driver.stdout});lines=reader[Symbol.asyncIterator]();
 driver.stderr.on('data',b=>{stderr+=b;if(stderr.length>30000)driver.kill('SIGTERM');});
 const first=await bounded(lines.next(),'driver startup'),startup=JSON.parse(first.value);assert.equal(startup.revision,UPSTREAM);
 const request=async Action=>{const r=await fetch(`${startup.base}/component`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${startup.token}`,'Content-Type':'application/json'},body:JSON.stringify({Action,ID:id,Fence:'acme-contained-incarnation'})});if(!r.ok)throw Error(`driver ${r.status}: ${await r.text()}`);return r.json();};
 const started=await request('start');assert.equal(started.creates,1);assert.equal(started.observation.running,true);writeFileSync(join(root,'gates',id),'run');
 const resultPath=join(root,'results',`${id}.json`),deadline=Date.now()+15000;while(!existsSync(resultPath)){if(Date.now()>deadline)throw Error('probe result missing');await delay(25);}
 const child=JSON.parse(readFileSync(resultPath,'utf8'));assert.equal(child.status,0,JSON.stringify(child));const checks=JSON.parse(child.stdout);
 validateChecks(checks);
 assert.equal(readFileSync(score,'utf8'),'NOT-SCORED');for(const [key,path]of Object.entries(protect))assert.equal(readFileSync(path,'utf8'),`acme-${key}-canary`);assert.deepEqual([tcpHits,udpHits,unixHits],[1,1,1]);
 const stopped=await request('stop');assert.equal(stopped.observation.exited,true);for(const key of ['pid','identity','fence'])assert.equal(stopped.observation[key],started.observation[key]);
 report={schema:1,status:'passed',upstream:UPSTREAM,modelCalls:0,network:'denied TCP/UDP/Unix against live local controls',checks,provider:{starts:stopped.creates,started:started.observation,stopped:stopped.observation},binarySHA256:createHash('sha256').update(readFileSync(binary)).digest('hex'),profileSHA256:createHash('sha256').update(sandboxProfile({readRoots:[worktree],writeRoots:[worktree,scratch],readFiles:[probe,process.execPath]})).digest('hex'),scope:'Actual Gas City owns fixed offline launcher; no coding agent, real credential or provider request',root};
}catch(error){failure=error.stack;}
finally{
 if(driver){
  driver.kill('SIGTERM');
  try{const [code,signal]=await bounded(exit,'driver cleanup');if(code!==0||signal)cleanupErrors.push(`driver ${code}/${signal}`);
   const last=await bounded(lines.next(),'cleanup receipt');cleanup=last.done?null:JSON.parse(last.value);
   if(!cleanup?.cleanup||cleanup.failed||cleanup.observations.some(o=>!o.exited))cleanupErrors.push('native cleanup proof unavailable');
  }catch(e){cleanupErrors.push(e.message);driver.kill('SIGKILL');try{await bounded(exit,'forced driver cleanup',3000);}catch(e){cleanupErrors.push(e.message);}}
  reader?.close();
 }
 for(const socket of sockets)socket.destroy();
 cleanupErrors.push(...await cleanupAll(closers));
}
const final={...report,status:failure||cleanupErrors.length?'failed':'passed',failure,cleanupErrors,cleanup,stderr,root};writeFileSync(output,JSON.stringify(final,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(final,null,2));if(failure||cleanupErrors.length)process.exitCode=1;
