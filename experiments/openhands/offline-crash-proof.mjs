// Ordinary coordinator interruption proof with synthetic native SDK actions.
import { spawn } from 'node:child_process';
import { mkdirSync,realpathSync,writeFileSync,readFileSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTrial,statusTrial,approveTrial,recoverTrial,runTrial,openTrial } from './trial-controller.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),[output,python,sdk]=process.argv.slice(2);
if(!output||!python||!sdk)throw Error('Usage: offline-crash-proof.mjs NEW_OUTPUT VENV_PYTHON SDK');
mkdirSync(resolve(output),{mode:0o700});const root=realpathSync(output),workspace=join(root,'worker'),control=join(root,'control');mkdirSync(join(workspace,'lib'),{recursive:true});
initializeTrial(control,{mode:'scripted',workspace,python:resolve(python),sdk:realpathSync(sdk),task:'synthetic',actorId:1,project:'acme-crash',account:'acme-offline',model:'openai/gpt-4o-mini',prompt:'Perform the synthetic write then request a read.',maxRequests:4,maxInputTokens:64000,maxOutputTokens:4096,maxSeconds:30,requestTimeoutSeconds:10,scriptedApprovals:false,script:[{text:'Write once',action:{operation:'write',path:'lib/acme.mjs',content:'export const once=1;\n',expectedSha256:null}},{text:'Request read',action:{operation:'read',path:'lib/acme.mjs'}},{text:'Done'}]});
const child=spawn(process.execPath,[join(HERE,'trial-controller.mjs'),'run',control],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','ignore']});const closed=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));
let firstApproved=false,interrupted=false;
try{
 for(let i=0;i<200;i++){const s=statusTrial(control),actions=Object.values(s.trial.actions),pending=actions.find(a=>a.state==='awaiting-approval');
  if(!firstApproved&&pending){approveTrial(control,{digest:pending.key,fixture:true});firstApproved=true;}
  else if(firstApproved&&pending&&actions.some(a=>a.state==='completed')){child.kill('SIGKILL');interrupted=true;break;}
  await new Promise(r=>setTimeout(r,100));
 }
 if(!interrupted)throw Error('expected pending second approval not observed');
 const exit=await closed;let recovery;
 for(let i=0;i<100;i++){recovery=await recoverTrial(control);if(recovery.status!=='unknown-retained')break;await new Promise(r=>setTimeout(r,100));}
 if(recovery.status==='unknown-retained')throw Error('worker absence still unknown; retained');
 const before=statusTrial(control);if(Object.values(before.trial.actions).filter(a=>a.state==='completed').length!==1||before.operation.learning!=='pending')throw Error('durable outcome mismatch');
 let repeatRefused=false;try{await runTrial(control);}catch(e){repeatRefused=/original_launch_exists/.test(e.message);}if(!repeatRefused)throw Error('duplicate launch not refused');
 const adapter=openTrial(control);try{adapter.adapter.learning(adapter.token,before.operation.id,{status:'no-useful-lesson'});}finally{adapter.adapter.close();}
 const after=statusTrial(control);if(readFileSync(join(workspace,'lib/acme.mjs'),'utf8')!=='export const once=1;\n')throw Error('file changed');
 const report={pass:true,providerCalls:0,coordinatorExit:exit,recovery,originalLaunch:after.trial.worker.launch,completedEffects:1,duplicateLaunchRefused:repeatRefused,learningBeforeCapture:before.operation.learning,learningAfterCapture:after.operation.learning,pendingSecondActionNeverExecuted:true};
 writeFileSync(join(root,'crash-receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(!interrupted)child.kill('SIGKILL');await closed;}
