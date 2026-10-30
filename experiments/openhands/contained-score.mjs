// Evaluator owns fixtures/assertions. Candidate code executes only in a read-only OS sandbox
// over stdio RPC. Never imports a candidate module into this controller process.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, lstatSync, realpathSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawnContained, digest } from './containment.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE = '037e13b4f78c061405cef899b528badb536584ad';
const FIXTURE_EVALUATOR_SHA = '723feab106853c71b2016f65904ec9f7880379ddde4804ec4c1dfb0400037548';
const fail = message => { throw Error(message); };
async function captureCandidate(candidate) {
  const run=spawnContained({workspace:candidate,runner:join(HERE,'capture-candidate.mjs')});
  let output='',errors='',bytes=0,overflow=false;
  const kill=()=>{try{process.kill(-run.child.pid,'SIGKILL');}catch{}};
  run.child.stdout.on('data',data=>{bytes+=data.length;if(bytes>32*1024*1024){overflow=true;kill();return;}output+=data;});
  run.child.stderr.on('data',data=>{if(errors.length<65536)errors+=data;else kill();});
  run.child.stdin.end();const exit=await run.closed;
  if(overflow||exit.code!==0||exit.timedOut)fail('contained capture refused: '+errors.slice(0,300));
  const value=JSON.parse(output);
  if(value.schema!==1||!Array.isArray(value.files)||value.files.length>4096)fail('capture protocol');
  const files=new Map();let total=0;
  for(const file of value.files) {
    if(typeof file.path!=='string'||!file.path.startsWith('lib/')&&!file.path.startsWith('tests/helpers/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||files.has(file.path)||typeof file.bytes!=='string')fail('capture path');
    const data=Buffer.from(file.bytes,'base64');total+=data.length;if(data.length>4*1024*1024||total>20*1024*1024)fail('capture data bound');files.set(file.path,data);
  }
  return {files,policySHA256:run.policySHA256};
}
function immutableFixtureTree(directory) {
  const repo = resolve(HERE, '../..');
  const archive = spawnSync('/usr/bin/git', ['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','archive',BASELINE], {cwd:repo,env:{PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},maxBuffer:32*1024*1024,timeout:10000});
  if(archive.status!==0) fail('trusted baseline archive unavailable');
  mkdirSync(directory);
  const extracted=spawnSync('/usr/bin/tar',['-x','-C',directory],{input:archive.stdout,env:{PATH:'/usr/bin:/bin'},timeout:10000});
  if(extracted.status!==0) fail('trusted fixture extraction failed');
  return digest(archive.stdout);
}

export function openSubject({workspace, onFetch, timeoutMs=10000}) {
  const run=spawnContained({workspace,runner:join(HERE,'candidate-service.mjs'),timeoutMs});
  let pending=null, bytes=0, fetches=0, failed=null, requestId=0, stderr='';
  const activeFetches=new Set(),seenFetches=new Set();
  const abort=error=>{failed=error;pending?.reject(error);pending=null;try{process.kill(-run.child.pid,'SIGKILL');}catch{}};
  const send=message=>{if(run.child.stdin.destroyed)throw Error('subject stdin closed');run.child.stdin.write(JSON.stringify(message)+'\n');};
  run.child.stdin.on('error',error=>abort(error));
  run.child.stderr.on('data',data=>{stderr+=data.toString();if(stderr.length>65536)abort(Error('subject stderr limit'));});
  run.child.stdout.on('data',data=>{bytes+=data.length;if(bytes>8*1024*1024)abort(Error('subject raw output limit'));});
  const lines=createInterface({input:run.child.stdout});
  lines.on('line',line=>{
    if(bytes>8*1024*1024||line.length>1024*1024){abort(Error('subject output limit'));return;}
    let message;try{message=JSON.parse(line);}catch{abort(Error('subject malformed protocol'));return;}
    if(message.type==='fetch') {
      if(!pending||!Number.isSafeInteger(message.id)||seenFetches.has(message.id)||typeof message.url!=='string'||!message.options||++fetches>128){abort(Error('subject transport contract'));return;}
      seenFetches.add(message.id);activeFetches.add(message.id);
      Promise.resolve().then(()=>onFetch(message.url,message.options)).then(async response=>{
        const body=await response.text();if(body.length>1024*1024)throw Error('fixture response bound');
        send({type:'fetch-result',id:message.id,status:response.status,headers:[...response.headers],body});
      }).catch(error=>{try{send({type:'fetch-result',id:message.id,error:String(error.message)});}catch{abort(error);}}).finally(()=>activeFetches.delete(message.id));
    } else if(message.type==='result') {
      if(!pending||activeFetches.size||message.id!==pending.id||!Number.isInteger(message.status)||message.status<100||message.status>599||typeof message.body!=='string'){abort(Error('subject result contract'));return;}
      const current=pending;pending=null;current.resolve({status:message.status,body:message.body});
    } else {abort(Error('subject cannot report scores or unknown frames'));}
  });
  run.closed.then(status=>{if(pending)abort(Error(`subject exited before response: ${JSON.stringify(status)} ${stderr.slice(0,200)}`));});
  return {
    ...run,
    request(input){if(failed)return Promise.reject(failed);if(pending)return Promise.reject(Error('only one request in flight'));return new Promise((resolve,reject)=>{pending={id:++requestId,resolve,reject};send({type:'request',id:requestId,...input});});},
    async close(){run.child.stdin.end();const status=await run.closed;lines.close();return {...status,stderr,fetches,protocolError:failed?.message??null};},
  };
}

export async function score({candidate,task,output}) {
  if(!['task-a','task-b'].includes(task))fail('task-a or task-b required');
  const candidateRoot=realpathSync(candidate);
  mkdirSync(output);output=realpathSync(output);
  const snapshot=join(output,'subject'),fixtureRoot=join(output,'trusted-fixtures'),sourceHashes={};
  const fixtureArchiveSHA256=immutableFixtureTree(fixtureRoot);
  immutableFixtureTree(snapshot);
  // Only lib production edits enter the subject snapshot. Everything else remains the
  // pinned baseline; this selected trial requires helper modules unchanged.
  const captured=await captureCandidate(candidateRoot),helperHashes={};
  function hashesUnder(dir,relative='tests/helpers') {
    for(const name of readdirSync(dir).sort()) {
      const p=join(dir,name),r=join(relative,name),st=lstatSync(p);
      if(st.isDirectory())hashesUnder(p,r);else helperHashes[r]=digest(readFileSync(p));
    }
  }
  hashesUnder(join(fixtureRoot,'tests/helpers'));
  const actualHelpers=Object.fromEntries([...captured.files].filter(([path])=>path.startsWith('tests/helpers/')).map(([path,data])=>[path,digest(data)]));
  if(JSON.stringify(Object.entries(actualHelpers).sort())!==JSON.stringify(Object.entries(helperHashes).sort()))fail('fixture-integrity-refused before candidate execution');
  rmSync(join(snapshot,'lib'),{recursive:true});mkdirSync(join(snapshot,'lib'));
  for(const [path,data] of captured.files)if(path.startsWith('lib/')){mkdirSync(dirname(join(snapshot,path)),{recursive:true});writeFileSync(join(snapshot,path),data,{flag:'wx'});sourceHashes[path]=digest(data);}
  const originalEvaluator=readFileSync(join(HERE,'real-receipt-evaluator.mjs'));
  if(digest(originalEvaluator)!==FIXTURE_EVALUATOR_SHA)fail('shared evaluator pin changed');
  // Trusted modules come exclusively from the fixed Git archive, never the candidate path.
  const load=relative=>import(pathToFileURL(join(fixtureRoot,relative)));
  const [{createDecisions},{createOperations},fixture]=await Promise.all([load('lib/web/decisions.mjs'),load('lib/web/operations.mjs'),load(task==='task-a'?'tests/helpers/web-decisions.mjs':'tests/helpers/web-learning.mjs')]);
  const cases=[];for(const surface of ['api','html'])for(const scenario of ['authorized-control','before-read-loss','mid-read-loss'])cases.push({surface,scenario,unknown:false});
  if(task==='task-b')cases.push({surface:'html',scenario:'mid-read-loss',unknown:true});
  const authErrors=new Set(['access_denied','sign_in_required','session_expired','session_revoked']),results=[];
  for(const spec of cases) {
    const h=task==='task-a'?fixture.decisionHarness():fixture.learningHarness();
    const signed=await h.login();let preview,committed;
    if(task==='task-a') {
      const options={fetcher:h.fetcher,now:()=>h.state.now};
      preview=await createDecisions(h.config,options).preview(h.access,fixture.token,h.project,{target:fixture.healthTarget,choice:'accept',reason:'Acme evaluator private decision.'});
      committed=await createOperations(h.config,options).apply(h.access,fixture.token,h.project,preview.id,{reauthorize:async()=>h.access});
    } else {
      const source=(await h.learning.project(h.access,fixture.token,h.project)).records[0];
      preview=await h.migration.preview(h.access,fixture.token,{selection:[source.selection]});
      committed=await h.migration.apply(h.access,fixture.token,preview.id,{digest:preview.digest,reauthorize:async()=>h.refreshAccess()});h.refreshAccess();
    }
    if(committed.state!=='committed'||!committed.receipt?.commit)fail('trusted fixture did not commit');
    const writes=()=>task==='task-a'?h.source.writes.length:h.workspace.writes.length+h.source.writes.length;
    const writesBefore=writes();let injections=0;
    const revoke=()=>{if(task==='task-a')h.state.members=[];else h.state.repoAccess=false;};
    const onFetch=async(url,options)=>{
      const response=await h.fetcher(url,options);
      if(spec.scenario==='mid-read-loss'&&new URL(url).pathname.endsWith('_decision_rpc')&&JSON.parse(options.body).p_operation==='read'){revoke();injections++;}
      return response;
    };
    if(spec.scenario==='before-read-loss')revoke();
    const subject=openSubject({workspace:snapshot,onFetch});
    const id=spec.unknown?'e'.repeat(64):preview.operationId;
    const path=task==='task-a'?`/projects/studio/operations/${id}`:`/learning/operations/${id}`;
    const wireConfig={...h.config,encryptionKeyBase64:h.config.encryptionKey.toString('base64')};delete wireConfig.encryptionKey;
    const request={config:wireConfig,now:h.state.now,url:h.config.origin+(spec.surface==='api'?'/api':'')+path,cookie:signed.cookie};
    const record={name:`${task}/${spec.surface}/${spec.unknown?'unknown-operation/':''}${spec.scenario}`,surface:spec.surface,scenario:spec.scenario,unknownOperation:spec.unknown,passed:false};
    try {
      const response=await subject.request(request),body=response.body;let json=null;
      if(spec.surface==='api'){try{json=JSON.parse(body);}catch{}}
      const revealsCommit=body.includes(committed.receipt.commit),revealsPreview=body.includes(preview.id);
      const original=spec.surface==='api'?json?.id===preview.operationId&&json?.receipt?.commit===committed.receipt.commit:body.includes(preview.operationId)&&revealsCommit;
      let repeat=null;if(spec.scenario==='authorized-control'){const second=await subject.request(request);repeat={status:second.status,sameOriginal:second.body.includes(preview.operationId)&&second.body.includes(committed.receipt.commit)};}
      const checks={fixtureOnlyNoAdditionalSourceWrite:writes()===writesBefore,injectionObserved:spec.scenario!=='mid-read-loss'||injections>=1,retainedWorkspaceMembership:task!=='task-b'||h.state.members.includes(1)};
      if(spec.scenario==='authorized-control')Object.assign(checks,{authorizedRead:response.status===200&&original,authorizedRepeat:repeat?.status===200&&repeat.sameOriginal});
      else Object.assign(checks,{authorizationRefusal:[401,403,404].includes(response.status),noBufferedReceipt:!revealsCommit&&!revealsPreview,typedApiRefusal:spec.surface!=='api'||authErrors.has(json?.error),noUnknownHtmlFallback:!spec.unknown||!body.includes('Original receipt is not visible yet')});
      Object.assign(record,{status:response.status,error:json?.error??null,returnedOriginalReceipt:!!original,revealedCommit:revealsCommit,revealedPreview:revealsPreview,injections,membersAfter:h.state.members,projectAccessAfter:h.state.repoAccess,fixtureWritesBefore:writesBefore,fixtureWritesAfter:writes(),repeat,checks,passed:Object.values(checks).every(Boolean)});
    }catch(error){record.error=error.message;}
    const exit=await subject.close();if(exit.code!==0||exit.timedOut||exit.protocolError)record.passed=false;
    record.containment={exit,policySHA256:subject.policySHA256,nodeSHA256:subject.nodeSHA256,dyldSupportSHA256:subject.dyldSupportSHA256};results.push(record);
  }
  // Read-only subject snapshot must remain byte-identical after every candidate process.
  const after={};function verify(dir,relative='lib'){for(const name of readdirSync(dir)){const p=join(dir,name),r=join(relative,name);if(lstatSync(p).isDirectory())verify(p,r);else after[r]=digest(readFileSync(p));}}
  verify(join(snapshot,'lib'));if(JSON.stringify(Object.entries(after).sort())!==JSON.stringify(Object.entries(sourceHashes).sort()))fail('subject snapshot changed');
  const report={schema:1,kind:'plates-contained-receipt-score',task,baseline:BASELINE,candidate:candidateRoot,sharedEvaluatorSHA256:FIXTURE_EVALUATOR_SHA,controllerSHA256:digest(readFileSync(fileURLToPath(import.meta.url))),fixtureArchiveSHA256,capturePolicySHA256:captured.policySHA256,scoredProductionRoot:'lib',workerQuiescence:'Not an agent launch receipt; no model worker was launched. Future acceptance requires supervisor-confirmed worker exit/fencing and this captured digest.',sourceHashes,total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,acceptancePassed:results.every(r=>r.passed),qualification:'Actual candidate HTTP service in read-only OS sandbox; parent-owned synthetic transport, revocation and assertions. No model, live credentials or network.',results};
  writeFileSync(join(output,'score.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [candidate,task,output]=process.argv.slice(2);if(!candidate||!output)fail('Usage: node contained-score.mjs CANDIDATE task-a|task-b NEW_OUTPUT');
  const report=await score({candidate:resolve(candidate),task,output:resolve(output)});console.log(JSON.stringify(report,null,2));process.exitCode=report.acceptancePassed?0:1;
}
