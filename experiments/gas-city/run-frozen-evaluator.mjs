// Trusted-controller command only. Manifest path/digest must never come from a worker.
// The evaluator imports trusted fixtures; candidate production runs in its OS sandbox.
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
const [manifestPath,expected,workerArg,task,report,...rest]=process.argv.slice(2);
if(rest.length||![manifestPath,workerArg,report].every(p=>typeof p==='string'&&isAbsolute(p))||!/^[a-f0-9]{64}$/.test(expected??'')||!['task-a','task-b'].includes(task)||existsSync(report))throw Error('Usage: run-frozen-evaluator.mjs <trusted-manifest> <expected-sha256> <candidate-root> task-a|task-b <new-report>');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=readFileSync(manifestPath);
if(sha(bytes)!==expected)throw Error('external manifest digest mismatch');
const manifest=JSON.parse(bytes),root=realpathSync(workerArg);
if(manifest.schema!==1||manifest.kind!=='plates-receipt-race-handoff'||manifest.modelExecution!=='not-authorized')throw Error('wrong frozen handoff');
for(const artifact of Object.values(manifest.artifacts)) {
 if(!isAbsolute(artifact.path)||sha(readFileSync(artifact.path))!==artifact.sha256)throw Error('frozen artifact changed');
 const full=realpathSync(artifact.path);if(full===root||full.startsWith(root+'/'))throw Error('worker root exposes private trial artifacts');
}
const reportParent=realpathSync(dirname(report)),physicalReport=resolve(reportParent,report.split('/').at(-1));
if(physicalReport===root||physicalReport.startsWith(root+'/'))throw Error('score must remain outside candidate root');
const evaluator=manifest.artifacts.evaluator.path;
// Own the complete evaluator process group, including its contained service.
// No caller environment or Node preloads reach the scorer.
const child=spawn(realpathSync(process.execPath),[evaluator,root,task],{
 cwd:dirname(evaluator),env:{PATH:'/usr/bin:/bin',TMPDIR:reportParent},detached:true,stdio:['ignore','pipe','pipe'],
});
let stdout='',stderr='',failure=null,exitCode=null,signal=null;
const exited=once(child,'exit'),closed=once(child,'close');exited.catch(()=>{});closed.catch(()=>{});
function stop(reason){failure??=reason;if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')failure+=`; group stop ${e.code}`;}}
const timer=setTimeout(()=>stop('evaluator deadline exceeded'),120000);
child.stdout.on('data',b=>{stdout+=b;if(Buffer.byteLength(stdout)>4*1024*1024)stop('stdout limit');});
child.stderr.on('data',b=>{stderr+=b;if(Buffer.byteLength(stderr)>65536)stop('stderr limit');});
try{[exitCode,signal]=await exited;}catch(e){failure=e.message;}finally{clearTimeout(timer);}
let groupAbsent=!child.pid;
if(child.pid){
 try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code==='ESRCH')groupAbsent=true;else failure??=`group cleanup ${e.code}`;}
 for(let i=0;!groupAbsent&&i<100;i++){
  try{process.kill(-child.pid,0);}catch(e){if(e.code==='ESRCH')groupAbsent=true;else failure??=`group observation ${e.code}`;}
  if(!groupAbsent)await delay(20);
 }
}
if(!groupAbsent)failure??='evaluator group termination unconfirmed';
let drainTimer;try{await Promise.race([closed,new Promise((_,reject)=>{drainTimer=setTimeout(()=>reject(Error('stdio drain unconfirmed')),3000);})]);}catch(e){failure??=e.message;}finally{clearTimeout(drainTimer);}
const result={status:exitCode,signal,error:failure?{message:failure}:null,stdout,stderr};
const receipt={schema:1,manifestSHA256:expected,task,candidate:root,exitCode:result.status,signal:result.signal,error:result.error?.message??null,groupAbsent,stderr:result.stderr??'',evaluation:null};
try{receipt.evaluation=JSON.parse(result.stdout);}catch{receipt.invalidOutput=result.stdout??'';}
writeFileSync(report,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({report,exitCode:receipt.exitCode,total:receipt.evaluation?.total,passed:receipt.evaluation?.passed,failed:receipt.evaluation?.failed}));
process.exitCode=result.error||result.signal||!receipt.evaluation?2:result.status;
