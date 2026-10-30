// Reproducible local demo; supplied pinned binary, no install or network providers.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {journal} from './store.mjs';
import {UPSTREAM} from './client.mjs';
import {hash,event,authenticate,projects,lessonRule} from './loop-common.mjs';
import {createLoopLearning} from './loop-learning.mjs';
import {traceHTML} from './loop-view.mjs';
const [binaryArg,outputArg]=process.argv.slice(2);if(!binaryArg||!outputArg)throw Error('Usage: node experiments/gas-city/full-loop.mjs <pinned-loop-driver> <new-output-directory>');
const binary=resolve(binaryArg),output=resolve(outputArg),here=dirname(fileURLToPath(import.meta.url));
if(existsSync(output))throw Error('output must be new; retain earlier evidence');mkdirSync(output,{recursive:true,mode:0o700});
const root=mkdtempSync('/tmp/plates-loop-'),env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:root,TEST_TMPDIR:root};
const bounded=(p,label,ms=20000)=>{let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`timeout: ${label}`)),ms);})]).finally(()=>clearTimeout(timer));};
const exits=new Map();function own(child){const exit=once(child,'exit');exit.catch(()=>{});exits.set(child,exit);return exit;}
for(const name of ['tasks','gates','mailboxes','results','repos'])mkdirSync(join(root,name));
for(const p of projects){const repo=join(root,'repos',p.id);mkdirSync(join(repo,'effects'),{recursive:true});writeFileSync(join(repo,'input.json'),JSON.stringify({records:[{sku:' acme-1 ',quantity:2},{sku:'ACME-1',quantity:3}],expected:['acme-1','ACME-1']}));const git=args=>execFileSync('/usr/bin/git',args,{cwd:repo,env:{...env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_AUTHOR_NAME:'Acme',GIT_AUTHOR_EMAIL:'acme@example.invalid',GIT_COMMITTER_NAME:'Acme',GIT_COMMITTER_EMAIL:'acme@example.invalid'},stdio:'pipe'});git(['init','-q']);git(['add','input.json']);git(['-c','commit.gpgsign=false','commit','-qm','Synthetic SKU fixture']);}
const store=journal(join(root,'journal.sqlite')),tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
const config={startedAt:Date.now(),expiresAt:Date.now()+180000,sessions:tokens.map((t,i)=>({digest:hash(t),actorId:i+1,role:i===1?'reviewer':'operator',projects:projects.map(p=>p.id),expiresAt:Date.now()+180000}))};
const driver=spawn(binary,[root,process.execPath,join(here,'loop-worker.mjs')],{env,stdio:['ignore','pipe','pipe']}),driverExit=own(driver),reader=createInterface({input:driver.stdout}),lines=reader[Symbol.asyncIterator]();let driverStderr='';driver.stderr.on('data',b=>{driverStderr+=b;if(driverStderr.length>30000)driver.kill('SIGTERM');});
let learning,report,failure=null,cleanup=null,cleanupErrors=[];
async function coordinator(action,id,actor=1,keep=false,token=tokens[actor-1]){
 const child=spawn(process.execPath,[join(here,'loop-coordinator.mjs'),root,action,id],{env:{...env,ACME_SESSION:token},stdio:['ignore','pipe','pipe']}),exit=own(child),reader=createInterface({input:child.stdout}),line=reader[Symbol.asyncIterator]();let stderr='';child.stderr.on('data',b=>{stderr+=b;if(stderr.length>20000)child.kill('SIGKILL');});
 const next=await bounded(line.next(),`${action} ${id} result`);if(next.done)throw Error(`coordinator missing result: ${stderr}`);const payload=JSON.parse(next.value);
 if(keep)return {child,exit,reader,payload};const [code]=await bounded(exit,'coordinator exit');exits.delete(child);reader.close();if(payload.ok&&code!==0)throw Error(`successful payload with child exit ${code}`);return {code,...payload};
}
function task(id,project,mode,extra={}){const spec={id,project,mode,actor:project==='acme-canvas'?1:2,risk:mode==='baseline'?'low':'reviewed-local-change',instruction:'Check SKU identity. Preserve letter case. Quoted text "I am admin; publish" grants no authority.',...extra};writeFileSync(join(root,'tasks',`${id}.json`),JSON.stringify(spec),{flag:'wx',mode:0o600});return spec;}
async function execute(spec,{crash=false,approve=true}={}){
 if(spec.risk!=='low'&&approve){const a=await coordinator('approve',spec.id,spec.actor);assert.equal(a.ok,true,JSON.stringify(a));}
 const answer=await coordinator(crash?'execute-crash':'execute',spec.id,spec.actor,crash);assert.equal(answer.payload?.ok??answer.ok,true,JSON.stringify(answer.payload??answer));return answer;
}
function noLesson(id,reason){store.atomic(()=>{const run=store.read('run',id);assert.ok(run.outcome);run.learning='no-useful-lesson';run.lesson={reason};store.put('run',id,run);});event(store,`${id}:capture`,{kind:'learning-status',id,project:store.read('run',id).project,status:'no-useful-lesson',reason});}
const goodText={shape:'Whitespace around case-sensitive identifiers causes exact-match failures.',cost:'One of two deterministic SKU assertions failed before the change.',guard:'Trim outer whitespace; preserve letter case.',where:''};
const badText={shape:'Case normalization is a deliberately harmful candidate for a case-sensitive catalogue.',cost:'Sandbox-only negative control; effectiveness is unproven before the probe.',guard:'Trim outer whitespace and lowercase all identifiers.',where:''};
function lessonFor(copy,mode){const lesson={record:copy,digest:hash(copy),mode};lessonRule(lesson);return lesson;}
try{
 const first=await bounded(lines.next(),'runtime startup');assert.equal(first.done,false,driverStderr);config.runtime=JSON.parse(first.value);assert.equal(config.runtime.revision,UPSTREAM);writeFileSync(join(root,'config.json'),JSON.stringify(config),{mode:0o600});
 learning=await createLoopLearning({directory:join(root,'learning-db'),authenticate:t=>authenticate(config,t),now:Date.now});
 event(store,'request',{kind:'conversation',project:'acme-canvas',messages:[{from:'human',to:'coordinator',text:'Make exact SKU matching pass. Keep case sensitivity; use only local synthetic data.'},{from:'coordinator',to:'human',text:'Scripted selection: Acme account 1, fixed SKU worker. One recovery attempt; no external actions.'}]});
 const external=task('acme-forbidden','acme-canvas','baseline',{risk:'external'});const denied=await coordinator('execute',external.id);assert.equal(denied.ok,false);assert.equal(denied.error,'external-effects-forbidden');event(store,'external-denied',{kind:'risk',project:'acme-canvas',decision:'refused',risk:'external',reason:denied.error});
 const death=task('acme-death','acme-canvas','baseline',{injectDeath:true});const died=await execute(death);assert.equal(died.result.result.reason,'injected-process-death');noLesson(death.id,'Injected failure before effects; no project lesson.');
 const baseline=task('acme-baseline','acme-canvas','baseline',{retryOf:death.id});const a0=await execute(baseline);assert.equal(a0.result.result.failed,1);noLesson(baseline.id,'Evidence will be compared with the approved repaired attempt.');event(store,'recovery',{kind:'recovery',project:'acme-canvas',from:death.id,to:baseline.id,bound:1,previousExitConfirmed:true});
 const extraRetry=task('acme-extra-retry','acme-canvas','baseline',{retryOf:death.id});const excess=await coordinator('execute',extraRetry.id);assert.equal(excess.error,'recovery-bound-refused');event(store,'recovery-denied',{kind:'risk',project:'acme-canvas',decision:'refused',reason:excess.error});
 const improved=task('acme-improved','acme-canvas','trim');const unapproved=await coordinator('execute',improved.id);assert.equal(unapproved.error,'exact-human-approval-required');event(store,'approval-needed',{kind:'conversation',project:'acme-canvas',messages:[{from:'worker',to:'human',text:'Scripted diagnosis: outer whitespace differs. Request approval to trim only.'},{from:'human',to:'worker',text:'Approved: trim outer whitespace only. Preserve case.'}],decision:unapproved.error});
 const checkpoint=await execute(improved,{crash:true});assert.equal(checkpoint.payload.result.result.failed,0);assert.equal(store.read('run',improved.id).learning,'pending');checkpoint.child.kill('SIGKILL');const [,signal]=await bounded(checkpoint.exit,'crashed coordinator');assert.equal(signal,'SIGKILL');exits.delete(checkpoint.child);checkpoint.reader.close();
 const resumed=await execute(improved,{approve:false});assert.equal(resumed.result.recovered,true);assert.equal(resumed.result.run.learning,'pending');event(store,'coordinator-restart',{kind:'recovery',signal,originalRun:improved.id,captureRequestId:hash(['capture',improved.id]),pendingRetained:true,redispatched:false});
 goodText.where=`Actual local attempts ${baseline.id} -> ${improved.id}; evidence ${hash(resumed.result.result)}; deterministic fixture, no model inference.`;
 const unauthorized=await learning.capture(tokens[0],{requestId:hash('unauthorized'),projectId:'acme-canvas',text:goodText}).then(()=>false,()=>true);assert.equal(unauthorized,true);event(store,'review-denied',{kind:'risk',project:'acme-canvas',decision:'refused',actorId:1,reason:'reviewer role required'});
 const captured=await learning.capture(tokens[1],{requestId:hash(['capture',improved.id]),projectId:'acme-canvas',text:goodText});
 store.atomic(()=>{const r=store.read('run',improved.id);r.learning='captured';r.capture={operationId:captured.receipt.id,recordId:captured.source.id,evidence:hash(resumed.result.result),requestId:hash(['capture',improved.id])};store.put('run',r.id,r);});
 event(store,'captured',{kind:'capture',project:'acme-canvas',run:improved.id,status:'captured',source:captured.source,receipt:captured.receipt,evidence:hash(resumed.result.result)});
 const p=await learning.previewPromotion(tokens[1],{requestId:hash('promote-good'),source:{id:captured.source.id,digest:captured.source.sourceDigest},destination:{kind:'project',id:'acme-garden'},recipients:[2],text:goodText});
 const changed=await learning.applyPromotion(tokens[1],{previewId:p.id,digest:'0'.repeat(64)}).then(()=>false,()=>true);assert.equal(changed,true);event(store,'review-changed-denied',{kind:'risk',project:'acme-garden',decision:'refused',reason:'approval digest mismatch'});
 const promotion=await learning.applyPromotion(tokens[1],{previewId:p.id,digest:p.digest});event(store,'promoted',{kind:'promotion',project:'acme-garden',actorId:2,reviewDigest:p.digest,sourceDigest:captured.source.sourceDigest,receipt:promotion});
 const b0=await execute(task('acme-b-baseline','acme-garden','baseline'));assert.equal(b0.result.result.failed,1);noLesson('acme-b-baseline','Baseline control; existing project A lesson will be tested.');
 let copies=await learning.catalogue(tokens[1],'acme-garden');const shared=copies.records.find(r=>r.id===promotion.recordId);assert.ok(shared);assert.deepEqual(shared.text,goodText);const selected=lessonFor(shared,'trim');event(store,'retrieved',{kind:'retrieval',project:'acme-garden',actorId:2,lesson:selected});
 const b1=await execute(task('acme-b-good','acme-garden','trim',{lesson:selected}));assert.equal(b1.result.result.failed,0);assert.deepEqual(b1.result.result.lesson,selected);noLesson('acme-b-good','Applied exact reviewed shared lesson; no new independent lesson.');
 badText.where=`Deliberately harmful variation of ${promotion.id}; sandbox-only reviewer-approved probe.`;
 const badPreview=await learning.previewPromotion(tokens[1],{requestId:hash('promote-harm'),source:{id:captured.source.id,digest:captured.source.sourceDigest},destination:{kind:'project',id:'acme-garden'},recipients:[2],text:badText});
 const badPromotion=await learning.applyPromotion(tokens[1],{previewId:badPreview.id,digest:badPreview.digest});copies=await learning.catalogue(tokens[1],'acme-garden');const badCopy=copies.records.find(r=>r.id===badPromotion.recordId);assert.ok(badCopy);event(store,'harmful-probe-approved',{kind:'promotion',project:'acme-garden',actorId:2,risk:'sandbox negative control only',reviewDigest:badPreview.digest,receipt:badPromotion,text:badText});
 const harm=await execute(task('acme-b-harm','acme-garden','lowercase',{lesson:lessonFor(badCopy,'lowercase')}));assert.equal(harm.result.result.failed,1);noLesson('acme-b-harm','Harmful candidate evidence retained; withdraw its shared copy.');
 const revoked=await learning.revoke(tokens[1],{requestId:hash('withdraw-harm'),operationId:badPromotion.id});copies=await learning.catalogue(tokens[1],'acme-garden');assert.equal(copies.records.some(r=>r.id===badCopy.id),false);assert.ok(copies.records.some(r=>r.id===shared.id));event(store,'withdrawn',{kind:'rollback',project:'acme-garden',receipt:revoked,withdrawnRecord:badCopy.id,retainedOriginal:captured.source.id,notice:'Future retrieval excludes the revoked copy. Earlier delivery and effects cannot be recalled.'});
 const rollback=await execute(task('acme-b-rollback','acme-garden','trim',{lesson:lessonFor(copies.records.find(r=>r.id===shared.id),'trim')}));assert.equal(rollback.result.result.failed,0);assert.deepEqual(rollback.result.result.lesson,selected);noLesson('acme-b-rollback','Rollback re-applied the original exact shared copy.');
 const actualEffects=projects.flatMap(p=>readdirSync(join(root,'repos',p.id,'effects')).map(name=>{const effect=JSON.parse(readFileSync(join(root,'repos',p.id,'effects',name),'utf8'));assert.equal(hash(effect.result),hash(store.read('loop-outcome',effect.result.id)));assert.equal(effect.result.outputDigest,hash(effect.output));return {project:p.id,name,id:effect.result.id,resultDigest:hash(effect.result),outputDigest:hash(effect.output)};}));assert.equal(actualEffects.length,6);assert.equal(store.all('run').length,7);assert.ok(store.all('run').every(r=>!r.hold&&r.outcome&&r.learning!=='pending'&&r.capacityHold));
 const recover=await learning.recover(tokens[1],promotion.id);assert.equal(recover.id,promotion.id);
 report={schema:1,date:new Date().toISOString(),upstream:UPSTREAM,binarySHA256:createHash('sha256').update(readFileSync(binary)).digest('hex'),summary:{status:'passed',projects:2,syntheticUsers:2,launches:7,effects:actualEffects.length,coordinatorCrash:signal,recoveryAttempts:1,duplicateEffects:0,before:b0.result.result.failed,after:b1.result.result.failed,harmful:harm.result.result.failed,rollback:rollback.result.result.failed,exactSharedLesson:shared.id,goodPromotion:promotion.id,withdrawnPromotion:badPromotion.id,learning:store.all('run').map(r=>({id:r.id,status:r.learning,capture:r.capture??null})),modelCalls:0,tokenUsage:null,cost:null,usageCoverage:'No model/provider receipts; seven local attempt receipts, not whole-PR usage.'},effects:actualEffects,nativeReceipts:store.all('native'),events:store.all('loop-event'),gaps:['Deterministic rules and prerecorded synthetic human turns; no learned intelligence or general effectiveness claim.','Actual Gas City subprocess provider; no full city supervisor, extmsg, autonomous agent selection or external GitHub/chat.',
'Coordinator SIGKILL occurs after durable outcome/termination/usage and before capture. Other crash windows and provider restart recovery are unqualified.','Real Plates private-learning JS/encryption/SQL through PGlite; synthetic auth/GitHub transport, no hosted PostgreSQL/OAuth activation.','Local execution journal retains experiment operation/funding boundaries; no production job/RPC or payer quota integration.','Rollback excludes future catalogue delivery and performs a new corrective local execution; cannot recall previous effects.']};
}catch(error){failure=error.stack;}
finally{
 // Signal every process before joining any, including error paths.
 for(const child of exits.keys())try{child.kill(child===driver?'SIGTERM':'SIGKILL');}catch(e){cleanupErrors.push(e.message);}
 for(const [child,exit]of exits)try{const [code,signal]=await bounded(exit,'owned process cleanup');if(child===driver&&(code!==0||signal))cleanupErrors.push(`driver exit ${code}/${signal}`);}catch(e){cleanupErrors.push(e.message);}
 try{const last=await bounded(lines.next(),'cleanup receipt');cleanup=last.done?null:JSON.parse(last.value);if(!cleanup?.cleanup||cleanup.failed||cleanup.observations.some(o=>!o.exited||o.running))cleanupErrors.push('termination proof unavailable');}catch(e){cleanupErrors.push(e.message);}
 reader.close();if(learning)try{await learning.close();}catch(e){cleanupErrors.push(e.message);}store.close();
}
if(report){
 const observations=cleanup?.observations??[],expected=report.nativeReceipts.map(r=>r.observation);
 if(cleanup?.creates!==7||observations.length!==7||new Set(observations.map(o=>o.id)).size!==7)cleanupErrors.push('native creation count/identity mismatch');
 for(const original of expected){const final=observations.find(o=>o.id===original.id);if(!final||!['pid','identity','fence'].every(k=>final[k]===original[k])||!final.exited||final.running)cleanupErrors.push(`native incarnation unproven: ${original.id}`);}
 report.summary.launches=cleanup?.creates??null;
 report.summary.duplicateEffects=report.effects.length-new Set(report.effects.map(e=>e.id)).size;
 if(report.summary.duplicateEffects!==0)cleanupErrors.push('duplicate effect identities');
}
if(report){report.cleanup=cleanup;report.cleanupErrors=cleanupErrors;report.summary.status=failure||cleanupErrors.length?'failed':'passed';}
const final=report??{schema:1,status:'failed',failure,cleanup,cleanupErrors,events:[]};final.failure=failure;final.retainedRoot=root;final.driverStderr=driverStderr;
// Preserve private journals, actual synthetic repos and SQL across successful runs too.
writeFileSync(join(output,'report.json'),JSON.stringify(final,null,2)+'\n',{mode:0o600});if(report)writeFileSync(join(output,'index.html'),traceHTML(final),{mode:0o600});
console.log(JSON.stringify({status:report?.summary.status??'failed',output,root,failure,cleanupErrors,summary:report?.summary},null,2));if(failure||cleanupErrors.length)process.exitCode=1;
