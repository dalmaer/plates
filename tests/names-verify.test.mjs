import {crc32,deflateRawSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyNames} from '../lib/names-verify.mjs';
import {NAMES} from '../practices/night/files/scripts/plates/names.mjs';
const repo='acme/anvils',revision='a'.repeat(40),repository={id:31,full_name:repo};
function fixture(overrides={}){
 const night={id:12,run_attempt:1,head_sha:revision,repository,event:'workflow_dispatch',path:'.github/workflows/plates-night.yml',status:'completed',conclusion:'success',created_at:'2026-10-24T10:00:00Z',pull_requests:[{number:3,head:{sha:revision}}],...overrides.night};
 const pr={number:3,state:'closed',base:{repo:repository},head:{sha:revision,ref:'plates-night/2026-10-24'},created_at:'2026-10-24T10:01:00Z',...overrides.pr};
 const labels=NAMES.filter(r=>r.surface==='label').map((r,i)=>({id:i+1,name:r.plates}));
 const receipt={version:2,repo,repositoryId:31,renames:[],creations:NAMES.filter(r=>r.surface==='label').map((r,i)=>({kind:'created',row:r.id,labelId:i+1,newName:r.plates,operationId:`approved:${i}`,verifiedAt:'2026-10-23T10:00:00Z',readback:{repositoryId:31,labelId:i+1,name:r.plates}}))};
 const calls=[];
 const github=async request=>{
  assert.equal(request.method,'GET');calls.push(request);
  const p=request.path;if(overrides.denied)return {status:403};
  if(p===`/repos/${repo}`)return {status:200,data:{...repository,default_branch:'main'}};
  if(p.includes('/actions/workflows/plates-night.yml/runs?'))return {status:200,data:{total_count:1,workflow_runs:[night]}};
  if(p.includes('/attempts/'))return {status:200,data:{...night,...overrides.attempt}};
  if(p.endsWith('/actions/runs/12'))return {status:200,data:night};
  if(p.includes('/artifacts?'))return {status:200,data:{total_count:overrides.artifacts?.length??0,artifacts:overrides.artifacts??[]}};
  if(p.includes('/contents/')){if(overrides.missingReceipt)return {status:404};const path='.plates/name-transition/label-renames.json',bytes=Buffer.from(JSON.stringify(receipt));return {status:200,data:{path,type:'file',encoding:'base64',content:bytes.toString('base64'),sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}};}
  if(p.includes('/labels?'))return {status:200,data:labels};
  if(p.includes('/pulls?'))return {status:200,data:overrides.queue??[]};
  if(p.endsWith('/pulls/3'))return {status:200,data:pr};
  if(p.endsWith('/pulls/4'))return {status:200,data:overrides.detail};
  if(p.includes('/branches?')){const rows=overrides.branches??[{name:'keel-night-plan',commit:{sha:revision}},{name:'plates-verify',commit:{sha:revision}}];const page=Number(new URL(p,'https://api.github.test').searchParams.get('page'));return {status:200,data:rows.slice((page-1)*100,page*100)};}
  throw new Error('unexpected fixture '+p);
 };
 return {github,calls};
}
const check=(out,id)=>out.data.checks.find(c=>c.id===id);
test('verify binds selected run attempt and revision; green alone preserves unknown checklist facts',async()=>{
 const {github,calls}=fixture();const out=await verifyNames({repo},github);
 assert.equal(out.exitCode,1);assert.equal(out.data.state,'unknown');assert.equal(check(out,'night').state,'pass');assert.equal(check(out,'night-branch').state,'pass');assert.equal(check(out,'label-receipt').state,'unknown');assert.equal(check(out,'artifacts').state,'pass');
 for(const id of ['morning-final','fresh-markers-fences-labels','board-history'])assert.equal(check(out,id).state,'unknown');
 assert.equal(out.data.source.attempt,1);assert.equal(out.data.source.revision,revision);assert.ok(calls.some(c=>c.path.includes(`?ref=${revision}`)));assert.ok(calls.some(c=>c.path.endsWith('/attempts/1')));
});
test('verify names each failed check without converting historical continuation into fresh-write failure',async()=>{
 const artifacts=[{id:41,name:'keel-test-runs',workflow_run:{id:12,head_sha:revision}}];
 let {github}=fixture({night:{conclusion:'failure'},pr:{head:{ref:'keel-night/2026-10-24',sha:revision}},artifacts});
 let out=await verifyNames({repo,run:12},github);assert.equal(check(out,'night').state,'fail');assert.equal(check(out,'night-branch').state,'fail');assert.equal(check(out,'artifacts').state,'fail');
 ({github}=fixture({pr:{head:{ref:'keel-night/2026-10-24',sha:revision},created_at:'2026-10-23T10:00:00Z'}}));out=await verifyNames({repo},github);assert.equal(check(out,'night-branch').state,'pass');assert.match(check(out,'night-branch').reason,/continuation/);
});
test('wrong source, repository, event or attempt is unknown, never verified',async()=>{
 for(const overrides of [{attempt:{head_sha:'b'.repeat(40)}},{attempt:{run_attempt:2}},{night:{repository:{id:32,full_name:repo}}},{night:{event:'push'}},{night:{path:'.github/workflows/unrelated.yml'}}]){
  const {github}=fixture(overrides),out=await verifyNames({repo,run:12},github);assert.equal(check(out,'night').state,'unknown');assert.equal(out.data.source,null);assert.equal(out.exitCode,1);
 }
});
test('rerun artifact provenance, missing receipts and missing PR association remain unknown',async()=>{
 const {github}=fixture({night:{run_attempt:2,pull_requests:[]},artifacts:[{id:41,name:'keel-test-runs',workflow_run:{id:12,head_sha:revision}}],missingReceipt:true});
 const out=await verifyNames({repo},github);for(const id of ['artifacts','label-receipt','night-branch'])assert.equal(check(out,id).state,'unknown');
});
test('complete queue distinguishes mergeable, unresolved and definitely nonmergeable legacy PRs',async()=>{
 for(const [mergeable,state] of [[true,'fail'],[null,'unknown'],[false,'pass']]){
  const p={number:4,state:'open',base:{repo:repository},head:{ref:'keel-climb/job',sha:revision},mergeable};const {github}=fixture({queue:[p],detail:p});const out=await verifyNames({repo},github);assert.equal(check(out,'drain').state,state);
 }
});
test('denied provider reads are explicit gaps and all requests stay read-only',async()=>{
 const {github}=fixture({denied:true});const out=await verifyNames({repo},github);assert.equal(out.exitCode,1);assert.ok(out.data.gaps.length);assert.equal(check(out,'drain').state,'unknown');
});


test('exact legacy verify suffix is outside the queue rather than a merge blocker',async()=>{
 const p={number:4,state:'open',base:{repo:repository},head:{ref:'keel-verify-suffix',sha:revision},mergeable:true};
 const {github}=fixture({queue:[p],detail:p});assert.equal(check(await verifyNames({repo},github),'drain').state,'pass');
});


test('verify history inventory reaches the second branch page without inferring consumption',async()=>{
 const branches=Array.from({length:100},(_,i)=>({name:`feature-${i}`,commit:{sha:revision}}));branches.push({name:'keel-night-plan',commit:{sha:revision}},{name:'plates-verify',commit:{sha:revision}});
 const {github,calls}=fixture({branches});const out=await verifyNames({repo},github);const history=check(out,'board-history');assert.equal(history.state,'unknown');assert.deepEqual(history.evidence[0].plan,['keel-night-plan']);assert.deepEqual(history.evidence[0].verify,['plates-verify']);assert.ok(calls.some(c=>c.path.endsWith('/branches?per_page=100&page=2')));
 const bad=fixture({branches:[{name:'keel-night-plan',commit:{sha:'invalid'}}]});assert.match(check(await verifyNames({repo},bad.github),'board-history').reason,/unavailable/);
});


test('observation workflow identity reproduces legitimate adopted project rendering',async()=>{
 const {observationWorkflowBytes}=await import('../lib/names-verify.mjs');
 const {fill}=await import('../lib/practices.mjs');
 const {readFile}=await import('node:fs/promises');
 const path='.github/workflows/plates-morning.yml';
 const template=await readFile(new URL('../practices/night/files/'+path,import.meta.url),'utf8');
 const adopted={name:'Acme',repo:'acme/anvils',practices:['night']};
 const actual=await observationWorkflowBytes(path,adopted);
 assert.equal(actual.toString(),fill(template,adopted,path));
 assert.match(actual.toString(),/workflows: \[plates-night\]/);
 const withClimb=await observationWorkflowBytes(path,{...adopted,practices:['night','climb']});
 assert.notEqual(actual.toString(),withClimb.toString());
 await assert.rejects(observationWorkflowBytes('.github/workflows/unrelated.yml',adopted));
});


test('real publication capture encodes through the collector with a separately executed installed CLI closure',async t=>{
 const {mkdtemp,mkdir,writeFile,readFile,cp,rm}=await import('node:fs/promises');
 const {join,resolve}=await import('node:path');const {tmpdir}=await import('node:os');
 const {run}=await import('./helpers/run.mjs');
 const {captureNamesPublication,collectNamesRun,NAMES_OBSERVATION_LOADER,OBSERVATION_PRODUCERS,supportedObservationSource}=await import('../lib/names-verify.mjs');
 const base=await mkdtemp(join(tmpdir(),'acme-names-collector-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const root=join(base,'project'),runtime=join(base,'installed'),repoRoot=resolve(import.meta.dirname,'..');
 await mkdir(root);await mkdir(runtime);
 for(const dir of ['bin','lib','practices','scripts','migrations'])await cp(join(repoRoot,dir),join(runtime,dir),{recursive:true});
 await cp(join(repoRoot,'package.json'),join(runtime,'package.json'));
 const git=(cwd,...args)=>{const out=run('git',args,{cwd});assert.equal(out.status,0,out.stderr);return out.stdout.trim();};
 git(runtime,'init','-q');git(runtime,'add','.');git(runtime,'commit','-qm','Acme installed source');const runtimeSha=git(runtime,'rev-parse','HEAD');
 await mkdir(join(root,'.plates'));await mkdir(join(root,'.github/workflows'),{recursive:true});await mkdir(join(root,'scripts/plates'),{recursive:true});await mkdir(join(root,'docs/night'),{recursive:true});
 await writeFile(join(root,'.plates/plates.json'),JSON.stringify({name:'Acme',repo,practices:['night']}));
 for(const name of ['names-observation.mjs','improve.mjs','night-plan.mjs','drain.mjs'])await cp(join(repoRoot,'scripts/plates',name),join(root,'scripts/plates',name));
 await cp(join(repoRoot,'practices/night/files/.github/workflows/plates-night.yml'),join(root,'.github/workflows/plates-night.yml'));
 await writeFile(join(root,'docs/night/2026-10-24.json'),JSON.stringify({date:'2026-10-24',items:[]}));
 git(root,'init','-q');git(root,'add','.');git(root,'commit','-qm','Acme project');const head=git(root,'rev-parse','HEAD');
 const loader=join(base,'loader.mjs'),imports=join(base,'imports.json');await writeFile(loader,NAMES_OBSERVATION_LOADER);
 const executed=run(process.execPath,['--import',loader,join(runtime,'bin/plates.mjs'),'--help'],{cwd:root,env:{GITHUB_WORKSPACE:root,PLATES_NAMES_RUNTIME_ROOT:runtime,PLATES_NAMES_IMPORTS_FILE:imports}});
 assert.equal(executed.status,0,executed.stderr);
 const manifest=JSON.parse(await readFile(imports,'utf8'));assert.deepEqual(manifest.gaps,[]);
 assert.ok(manifest.files.some(f=>f.kind==='runtime'&&f.path==='bin/plates.mjs'));
 assert.ok(manifest.files.some(f=>f.kind==='runtime'&&f.path==='lib/cli.mjs'));
 const offline=join(base,'offline-gh');await writeFile(offline,'#!/bin/sh\nexit 1\n',{mode:0o700});
 const boardImports=join(base,'board-imports.json');
 const actualBoard=run(process.execPath,['--import',loader,join(runtime,'bin/plates.mjs'),'board','--names-evidence','--fresh','--json'],{cwd:root,env:{GITHUB_WORKSPACE:root,PLATES_NAMES_RUNTIME_ROOT:runtime,PLATES_NAMES_IMPORTS_FILE:boardImports,PLATES_NAMES_EVIDENCE_REPOSITORY_ID:'31',PLATES_GH:offline,PLATES_CACHE:join(base,'cache')}});
 assert.equal(actualBoard.status,0,actualBoard.stderr);const boardOutput=JSON.parse(actualBoard.stdout);assert.equal(boardOutput.observation.producerId,'board');assert.ok(boardOutput.observation.gaps.length,'no remote history is unavailable, not fabricated');
 const boardManifest=JSON.parse(await readFile(boardImports,'utf8'));assert.deepEqual(boardManifest.gaps,[]);assert.ok(boardManifest.files.some(f=>f.kind==='runtime'&&f.path==='lib/board.mjs'));
 const body='<!-- plates:health-report:begin -->\nAcme generated content\n',bodyFile=join(base,'body.md'),priorFile=join(base,'prior.json'),outputFile=join(base,'publication.json');await writeFile(bodyFile,body);
 let pr={id:61,number:3,base:{repo:repository},head:{ref:'plates-night/2026-10-24',sha:head},body,labels:[],updated_at:'2026-10-24T12:00:00Z'};
 const requests=[];
 const github=async request=>{
  assert.equal(request.method,'GET');requests.push(request);
  const p=request.path;
  if(p===`/repos/${repo}/pulls/3`)return {status:200,data:pr};
  if(p==='/repos/acme/runtime')return {status:200,data:{id:32,full_name:'acme/runtime'}};
  if(p.startsWith('/repos/acme/runtime/contents/')){
   const u=new URL(p,'https://api.github.test'),path=u.pathname.split('/contents/')[1];assert.equal(u.searchParams.get('ref'),runtimeSha);
   const bytes=await readFile(join(runtime,path));return {status:200,data:{type:'file',path,encoding:'base64',content:bytes.toString('base64'),sha:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}};
  }
  if(p===`/repos/${repo}/actions/runs/12/attempts/1`)return {status:200,data:{id:12,run_attempt:1,head_sha:head,repository,run_started_at:'2026-10-24T10:00:00Z'}};
  if(p.startsWith(`/repos/${repo}/actions/runs/12/artifacts?`))return {status:200,data:{total_count:0,artifacts:[]}};
  throw new Error('Unexpected Acme request '+p);
 };
 const args={root,repo,repositoryId:31,kind:'night',branch:pr.head.ref,date:'2026-10-24',bodyFile,priorFile,outputFile,prNumber:3,preimageHeadSha:head};
 await captureNamesPublication({...args,phase:'before'},github);await captureNamesPublication({...args,phase:'after'},github);
 const publication=JSON.parse(await readFile(outputFile,'utf8'));assert.equal(publication.writes[0].sequence,1);assert.equal(publication.writes[0].outcome,'no-change');
 const inputs=OBSERVATION_PRODUCERS.night.map(p=>({producerId:p.id,value:p.id==='night-pr'?publication:{producerId:p.id,writes:[],reads:[],fragments:[],gaps:[]}}));inputs[0].imports=imports;
 const directory=join(base,'artifact');
 const result=await collectNamesRun({root,kind:'night',directory,inputs,installedRuntime:{root:runtime,repo:'acme/runtime',entrypoint:'bin/plates.mjs'},env:{GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'31',GITHUB_RUN_ID:'12',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:head,GITHUB_EVENT_NAME:'workflow_dispatch'}},github);
 const artifact=JSON.parse(await readFile(join(directory,'observation.json'),'utf8'));
 assert.equal(artifact.execution.codeIdentity.commitSha,runtimeSha);assert.equal(artifact.execution.codeIdentity.repository.id,32);
 assert.ok(artifact.execution.codeIdentity.files.some(f=>f.path==='lib/cli.mjs'));
 const entry=artifact.execution.codeIdentity.files.find(f=>f.path==='bin/plates.mjs');
 assert.equal(entry.sha256,createHash('sha256').update(await supportedObservationSource(entry.path)).digest('hex'));
 for(const path of ['bin/unrelated.mjs','bin/../lib/cli.mjs','package.json'])await assert.rejects(supportedObservationSource(path));
 assert.ok(!result.gaps.some(g=>g.code==='installed-runtime-source-unavailable'));
 assert.ok(requests.some(r=>r.path.includes('/repos/acme/runtime/contents/lib/cli.mjs')));
 // This is a real collector/schema pipeline, not a complete rollout: producers
 // without actual write outcomes remain insufficient for verifier acceptance.
 assert.ok(result.gaps.some(g=>g.code==='runtime-load-manifest-missing'));
});

function zip(files, { method = 0, descriptor = false, overrides = [] } = {}) {
  const locals = [], centrals = []; let offset = 0;
  [...files].forEach(([name, bytes], i) => {
    const o = overrides[i] ?? {}; const n = Buffer.from(o.name ?? name), b = Buffer.from(bytes), packed = method === 8 ? deflateRawSync(b) : b;
    const extra = o.extra ?? Buffer.alloc(0), local = Buffer.alloc(30), central = Buffer.alloc(46), flags = o.flags ?? (descriptor ? 0x808 : 0x800);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(o.method ?? method, 8);
    if (!descriptor) { local.writeUInt32LE(crc32(b), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(b.length, 22); }
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(extra.length, 28);
    let tail = Buffer.alloc(0);
    if (descriptor) { tail = Buffer.alloc(16); tail.writeUInt32LE(0x08074b50); tail.writeUInt32LE(crc32(b), 4); tail.writeUInt32LE(packed.length, 8); tail.writeUInt32LE(b.length, 12); }
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(o.method ?? method, 10);
    central.writeUInt32LE(crc32(b), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(o.bytes ?? b.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(((o.mode ?? 0o100644) << 16) >>> 0, 38); central.writeUInt32LE(o.offset ?? offset, 42);
    locals.push(local, n, extra, packed, tail); centrals.push(central, n, extra); offset += local.length + n.length + extra.length + packed.length + tail.length;
  });
  const centralBytes = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size ?? files.length, 8); end.writeUInt16LE(files.size ?? files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

async function positiveObservationFixture({legacy=false,artifactGap=false,setup=false,observerMismatch=false,attemptMismatch=false,missingObserver=false,missingClosure=false,changedManaged=false,withoutDelivery=false,skippedHistory=null,history=false,omitTokens=false,alter=null,retainedPR=false,legacyPlan=false,newProposal=false}={}){
 const {readFile}=await import('node:fs/promises');const {posix}=await import('node:path');
 const {observationFiles}=await import('../lib/names-observation.mjs');
 const {OBSERVATION_PRODUCERS,observationWorkflowBytes}=await import('../lib/names-verify.mjs');
 const hash=b=>createHash('sha256').update(b).digest('hex'),blob=b=>createHash('sha1').update(`blob ${Buffer.byteLength(b)}\0`).update(b).digest('hex');
 const config={name:'Acme',repo,practices:withoutDelivery?['night']:['night','delivery'],...(setup?{setup:'echo Acme project setup'}:{})},contents=new Map(),date='2026-10-24',at='2026-10-24T10:00:00Z';
 const set=(path,bytes)=>contents.set(path,Buffer.from(bytes));
 set('.plates/plates.json',JSON.stringify(config));
 const paths=['lib/names-verify.mjs','bin/plates.mjs','lib/board.mjs','scripts/plates/morning.mjs','scripts/plates/improve.mjs','scripts/plates/drain.mjs','scripts/plates/night-plan.mjs'];
 const runtime=new Set();
 while(paths.length){const path=paths.shift();if(runtime.has(path))continue;runtime.add(path);const bytes=await readFile(new URL('../'+path,import.meta.url));set(path,bytes);for(const m of bytes.toString().matchAll(/(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))paths.push(posix.normalize(posix.join(posix.dirname(path),m[1])));}
 for(const kind of ['night','morning'])set(`.github/workflows/plates-${kind}.yml`,await observationWorkflowBytes(`.github/workflows/plates-${kind}.yml`,config));
 const source=path=>({repositoryId:31,commitSha:revision,path,blobSha:blob(contents.get(path)),sha256:hash(contents.get(path))});
 const run=(id,kind)=>({id,run_attempt:1,head_sha:revision,repository,event:'workflow_dispatch',path:`.github/workflows/plates-${kind}.yml`,status:'completed',conclusion:'success',created_at:at,run_started_at:at,pull_requests:[]});
 const night=run(12,'night'),morning=run(22,'morning'),unrelated={...run(23,'morning'),created_at:'2026-10-24T12:00:00Z'};
 const object=(number,id,branch)=>({id,number,base:{repo:repository},head:{ref:branch,sha:revision},body:'Acme generated body',labels:[],created_at:at});
 const nightPr=object(3,61,`plates-night/${date}`),finalPr=object(4,62,`plates-night/${date}-final`),brief={id:63,number:5,body:'Acme brief',labels:[]};
 const present=bytes=>({state:'present',commitSha:revision,blobSha:blob(bytes),sha256:hash(bytes),labelIds:[],providerUpdatedAt:null});
 const {mergeHealthPage,rewriteHealthBody}=await import('../practices/night/files/scripts/plates/time-proposals.mjs');
 const {planSection}=await import('../practices/night/files/scripts/plates/night-plan.mjs');
 const {withPlanSection}=await import('../practices/night/files/scripts/plates/morning.mjs');
 const {formatVerification}=await import('../practices/night/files/scripts/plates/verification.mjs');
 const {NAMES}=await import('../practices/night/files/scripts/plates/names.mjs');
 const preSha='e'.repeat(40),finalSha='f'.repeat(40),healthPath=`docs/health/${date}.md`,recordPath=`docs/night/${date}.json`;
 finalPr.head.sha=finalSha;
 if(retainedPR)nightPr.body='Historical keel:health-report:begin';
 const plan={schema:1,date,shapedBy:'default',readyBy:null,items:[],willNotTouch:[],settledToday:[],leftOpen:[]},planText=JSON.stringify(plan,null,2)+'\n';
 const old=history?mergeHealthPage({previous:'Historical keel:health-report:begin\n',generated:'Acme older report\n'+formatVerification({attempt:'old',note:'keel:health-report:begin'})+'\n## Proposal\n\nKeep keel-impact as history.\n'}).text:'';
 const generated='Acme measured report\n```'+(legacy?'keel':'plates')+'-impact\n{}\n```\n'+(newProposal?'## Proposal\n\nNew keel-impact proposal.\n':'');
 const nightHealth=mergeHealthPage({previous:old,generated}).text;
 const finalHealth=rewriteHealthBody(nightHealth,body=>withPlanSection(body,planSection(plan,{record:recordPath})));
 set(healthPath,nightHealth);set(healthPath+'@'+preSha,old);set(healthPath+'@'+revision,nightHealth);set(healthPath+'@'+finalSha,finalHealth);
 set(recordPath,planText);set('.plates/bounds.json','{}\n');set(legacyPlan?'.keel/night/plan.json':'.plates/night/plan.json',planText);
 const observations={};
 for(const kind of ['night','morning']){
  const producers=OBSERVATION_PRODUCERS[kind],fragments=new Map(),writes=[];
  const fragment=(path,text)=>{fragments.set(path,Buffer.from(text));return {fragment:path,sha256:hash(text)};};
  const add=(producerId,role,target,bytes,before=null)=>{
   const names=omitTokens?[]:NAMES.filter(r=>['marker','fence','label'].includes(r.surface)).flatMap(r=>[r.keel,r.plates].filter(v=>bytes.includes(v)).map(value=>({rowId:r.id,value})));
   const intended=fragment(`fragments/${producerId}-${role}.txt`,names.map(n=>n.value).join('\n'));
   const after={...present(bytes),commitSha:kind==='night'?revision:finalSha};
   writes.push({producerId,role,sequence:writes.filter(w=>w.producerId===producerId).length+1,operationId:null,target,outcome:'confirmed',before,intended:{...intended,sha256:hash(bytes),names},after,observedAt:at});
  };
  const local=(path)=>({kind:'git',repositoryId:31,ref:'refs/heads/'+(kind==='night'?nightPr:finalPr).head.ref,path});
  if(kind==='night'){
   add('improve','health-report',local(healthPath),nightHealth,old?{...present(old),commitSha:preSha}:{state:'absent',commitSha:preSha,blobSha:null,sha256:null,labelIds:[],providerUpdatedAt:null});
   add('improve','bounds',local('.plates/bounds.json'),'{}\n');
   add('improve','night-record',local(recordPath),planText);
   add('improve','working-plan',local('.plates/night/plan.json'),planText);
   add('plan-publication','plan-publication',{kind:'git',repositoryId:31,ref:legacyPlan?'refs/heads/keel-night-plan':'refs/heads/plates-night-plan',path:legacyPlan?'.keel/night/plan.json':'.plates/night/plan.json'},planText);
   if(legacyPlan){const w=writes.at(-1);w.outcome='no-change';w.before={...w.after};}
  }else{
   add('finalization','night-record',local(recordPath),planText);
   add('finalization','health-plan-section',local(healthPath),finalHealth,present(nightHealth));
  }
  for(const producerId of kind==='night'?['night-pr']:['final-pr','brief']){
   const obj=producerId==='night-pr'?nightPr:producerId==='final-pr'?finalPr:brief,role=producerId==='brief'?'brief-issue':producerId;
   add(producerId,role,{kind:producerId==='brief'?'issue':'pr',repositoryId:31,id:obj.id,number:obj.number,headSha:obj.head?.sha??null},obj.body);
   if(retainedPR&&producerId==='night-pr'){const w=writes.at(-1);w.outcome='no-change';w.before={...w.after};}
  }
  if(alter){alter({kind,writes,fragments,contents,hash,blob,nightPr,finalPr,brief});for(const path of fragments.keys())if(!writes.some(w=>w.intended.fragment===path))fragments.delete(path);}
  const projections=[];
  if(kind==='night')projections.push({producerId:'drain',kind:'drain-queue',...fragment('fragments/drain-queue.txt',JSON.stringify({before:[],after:[],actions:[]}))});
  const reads=[];
  if(kind==='morning')for(const consumer of ['morning-brief','board'])for(const sourceKind of ['plan','verify']){
   if(withoutDelivery&&sourceKind==='verify')continue;
   const projection=sourceKind==='plan'?JSON.stringify({date,items:[]}):'[]';
   const outputProjection=fragment(`fragments/${consumer}-${sourceKind}.txt`,projection);
   for(const family of ['plates','keel']){
    const ref=sourceKind==='plan'?`${family}-night-plan`:`${family}-verify`,path=sourceKind==='plan'?'plan.json':'verify.json',read=sourceKind==='plan'&&family===(legacyPlan?'keel':'plates');
    if(read)set(path,projection);
    reads.push({consumer,sourceKind,repositoryId:31,ref,path,commitSha:read?revision:null,blobSha:read?blob(projection):null,sha256:read?hash(projection):null,state:sourceKind==='verify'&&family===skippedHistory?'skipped':read?'read':'absent',absence:read||sourceKind==='verify'&&family===skippedHistory?null:'ref',selected:read,contributed:read,outputSection:sourceKind,outputProjection,recordIds:[]});
   }
  }
  const observation={schema:1,kind,repository:{id:31,fullName:repo},execution:{workflowPath:`.github/workflows/plates-${kind}.yml`,runId:kind==='night'?12:22,runAttempt:1,event:'workflow_dispatch',headSha:revision,codeSha:revision,startedAt:at,finishedAt:at,codeIdentity:null},scope:{workflow:source(`.github/workflows/plates-${kind}.yml`),configuration:source('.plates/plates.json'),runtime:{codeSha:revision,sourceFiles:[...runtime].map(source)},producers:producers.map(p=>({id:p.id,job:p.step.split('/')[0],step:p.step,source:source(p.path),mode:'enabled',reason:null}))},originatingNight:null,association:kind==='night'?{kind,date,branch:nightPr.head.ref,leaseId:null,preexisting:false,preimageHeadSha:null,prId:61,prNumber:3,headSha:revision,planPath:null,planBlobSha:null}:{kind,date,nightBranch:nightPr.head.ref,finalPrId:62,finalPrNumber:4,finalHeadSha:finalSha,briefIssueId:63,briefIssueNumber:5},producers:producers.map(p=>({id:p.id,job:p.step.split('/')[0],step:p.step,outcome:'completed',observedAt:at,reason:null})),writes,reads,projections,artifacts:[],fragments:[...fragments].map(([path,b])=>({path,bytes:b.length,sha256:hash(b),kind:reads.some(r=>r.outputProjection.fragment===path)||projections.some(p=>p.fragment===path)?'projection':'managed-fragment'})),gaps:[]};
  const observerSha=observerMismatch&&kind==='morning'?'d'.repeat(40):'c'.repeat(40);
  observation.execution.codeIdentity={repository:{id:32,fullName:'acme/observer'},commitSha:observerSha,entrypoint:kind==='night'?'lib/names-verify.mjs':'bin/plates.mjs',files:[...runtime].map(path=>({...source(path),repositoryId:32,commitSha:observerSha}))};
  if(missingObserver)observation.execution.codeIdentity=null;
  if(missingClosure)observation.execution.codeIdentity.files=observation.execution.codeIdentity.files.filter(f=>f.path!=='lib/names-actions.mjs');
  observations[kind]={observation,fragments};
 }
 const archives=new Map(),artifacts=new Map();
 for(const kind of ['night','morning']){
  const runId=kind==='night'?12:22,id=kind==='night'?101:102;
  if(kind==='morning')observations[kind].observation.originatingNight={repositoryId:31,runId:12,runAttempt:attemptMismatch?2:1,headSha:revision,artifactId:101,artifactDigest:artifacts.get(12).digest};
  const {observation,fragments}=observations[kind],bytes=zip(observationFiles(observation,fragments));archives.set(id,bytes);
  artifacts.set(runId,{id,name:`plates-names-observation-${runId}-1`,digest:'sha256:'+hash(bytes),expired:false,size_in_bytes:bytes.length,workflow_run:{id:runId,head_sha:revision}});
 }
 const base=fixture({night:{pull_requests:[]}}),counts=new Map();
 const github=async request=>{
  const p=request.path;assert.equal(request.method,'GET');
  if(p==='/repos/acme/observer')return {status:200,data:{id:32,full_name:'acme/observer'}};
  if(p===`/repos/${repo}/actions/runs/12`||p===`/repos/${repo}/actions/runs/12/attempts/1`)return {status:200,data:night};
  if(p.includes('/actions/workflows/plates-night.yml/runs?'))return {status:200,data:{total_count:1,workflow_runs:[night]}};
  if(p.includes('/actions/workflows/plates-morning.yml/runs?'))return {status:200,data:{total_count:2,workflow_runs:[unrelated,morning]}};
  for(const candidate of [morning,unrelated])if(p===`/repos/${repo}/actions/runs/${candidate.id}`||p===`/repos/${repo}/actions/runs/${candidate.id}/attempts/1`)return {status:200,data:candidate};
  const listing=/\/actions\/runs\/(\d+)\/artifacts\?/.exec(p);
  if(listing){const id=Number(listing[1]);counts.set(id,(counts.get(id)??0)+1);if(artifactGap&&id===22&&counts.get(id)===3)return {status:403};const artifact=artifacts.get(id);return {status:200,data:{total_count:artifact?1:0,artifacts:artifact?[artifact]:[]}};}
  const archive=/\/actions\/artifacts\/(\d+)\/zip$/.exec(p);if(archive)return {status:200,data:archives.get(Number(archive[1]))};
  const jobs=/\/actions\/runs\/(\d+)\/attempts\/1\/jobs\?/.exec(p);
  if(jobs){const id=Number(jobs[1]),kind=id===12?'night':'morning';const grouped=new Map();for(const producer of OBSERVATION_PRODUCERS[kind]){const name=producer.step.split('/')[0];if(!grouped.has(name))grouped.set(name,{name,run_id:id,head_sha:revision,status:'completed',steps:[]});grouped.get(name).steps.push({name:producer.name,status:'completed',conclusion:'success'});}return {status:200,data:{total_count:grouped.size,jobs:[...grouped.values()]}};}
  if(p.endsWith('/pulls/3'))return {status:200,data:nightPr};if(p.endsWith('/pulls/4'))return {status:200,data:finalPr};if(p.endsWith('/issues/5'))return {status:200,data:brief};
  if(p===`/repos/${repo}/git/ref/heads/${legacyPlan?'keel':'plates'}-night-plan`)return {status:200,data:{ref:`refs/heads/${legacyPlan?'keel':'plates'}-night-plan`,object:{sha:revision}}};
  if(p.includes('/git/ref/heads/'))return {status:404};
  if(p.includes('/contents/')){const u=new URL(p,'https://api.github.test'),path=u.pathname.split('/contents/')[1],ref=u.searchParams.get('ref');if(path===healthPath&&ref===preSha&&!old)return {status:404};const original=contents.get(path+'@'+ref)??contents.get(path),bytes=changedManaged&&path==='scripts/plates/improve.mjs'?Buffer.from('changed managed bytes'):original;if(bytes)return {status:200,data:{path,type:'file',encoding:'base64',content:bytes.toString('base64'),sha:blob(bytes)}};}
  return base.github(request);
 };
 return {github,night};
}

test('complete source-bound observations verify empty manual PR arrays and skip unrelated manual morning runs',async()=>{
 const {github,night}=await positiveObservationFixture();
 const {readObservationArtifact,verifyObservationScope}=await import('../lib/names-verify.mjs');
 await verifyObservationScope(await readObservationArtifact(github,repo,31,night,'night'),github,repo);
 const out=await verifyNames({repo,run:12},github);
 assert.equal(out.data.state,'verified',JSON.stringify(out.data,null,2));assert.equal(out.exitCode,0);assert.equal(new Set(out.data.checks.map(c=>c.id)).size,out.data.checks.length);
});
test('artifact gaps name only artifacts and never erase a verified or failed write check',async()=>{
 for(const legacy of [false,true]){
  const {github}=await positiveObservationFixture({artifactGap:true,legacy});const out=await verifyNames({repo,run:12},github);
  assert.equal(check(out,'artifacts').state,'unknown',JSON.stringify(out.data));assert.equal(check(out,'fresh-markers-fences-labels').state,legacy?'fail':'pass',JSON.stringify(out.data));
  assert.equal(out.data.checks.filter(c=>c.id==='fresh-markers-fences-labels').length,1);
 }
});

test('cross-job transfer retains only bounded typed producer evidence and loader gaps',async()=>{
 const {namesProducerTransfer,decodeNamesProducerTransfer}=await import('../lib/names-verify.mjs');
 const observation={producerId:'improve',writes:[],reads:[],fragments:[{path:'fragments/health.txt',kind:'managed-fragment',text:'Private Acme prose <!-- plates:health-report:begin -->'}],gaps:[]};
 const manifest={files:[{kind:'runtime',path:'bin/plates.mjs',sha256:'a'.repeat(64)}],gaps:['untracked-runtime-source']};
 const encoded=await namesProducerTransfer({producerId:'improve',value:{privateReport:'Private top-level content',observation},manifest});
 const decoded=decodeNamesProducerTransfer(encoded);
 assert.equal(decoded.value.fragments[0].text,'plates:health-report:begin');
 assert.deepEqual(decoded.loadGaps,['untracked-runtime-source']);assert.equal(decoded.loads[0].path,'bin/plates.mjs');
 assert.ok(!Buffer.from(encoded,'base64').toString().includes('Private'));
 const missing=decodeNamesProducerTransfer(await namesProducerTransfer({producerId:'improve',path:'/tmp/acme-absent-names-output',imports:'/tmp/acme-absent-names-imports'}));
 assert.equal(missing.value.gaps[0].code,'producer-output-unavailable');assert.deepEqual(missing.loadGaps,['runtime-load-manifest-missing']);
 const unexpected=decodeNamesProducerTransfer(await namesProducerTransfer({producerId:'improve',value:{...observation,privateKey:'not exportable'},manifest}));
 assert.equal(unexpected.value.gaps[0].code,'producer-output-unavailable');assert.ok(!JSON.stringify(unexpected).includes('not exportable'));
 await assert.rejects(namesProducerTransfer({producerId:'improve',value:observation,manifest,maxBytes:10}),/bound/);
 for(const malformed of ['',encoded+'=',Buffer.from('{"producerId":"improve","producerId":"brief"}').toString('base64')])assert.throws(()=>decodeNamesProducerTransfer(malformed));
 const badProjection={...observation,fragments:[{path:'fragments/private.txt',kind:'projection',text:JSON.stringify({privateBody:'private'})}]};
 assert.equal(decodeNamesProducerTransfer(await namesProducerTransfer({producerId:'improve',value:badProjection,manifest})).value.gaps[0].code,'producer-output-unavailable');
});

 test('adopted setup is disclosed while observer revision and exact night attempt remain mandatory',async()=>{
  const good=await positiveObservationFixture({setup:true});const out=await verifyNames({repo,run:12},good.github);
  assert.equal(out.data.state,'verified',JSON.stringify(out.data));assert.equal(out.data.observationScope.setupPresent,true);assert.ok(out.data.observationScope.excluded.includes('project-owned setup/gate effects'));
  for(const option of ['observerMismatch','attemptMismatch']){const f=await positiveObservationFixture({[option]:true});const bad=await verifyNames({repo,run:12},f.github);assert.equal(check(bad,'morning-final').state,'unknown',option);assert.notEqual(bad.data.state,'verified');}
 });
 test('retained publication is read-only and refuses unstable or ambiguous identities',async t=>{
  const {mkdtemp,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {captureRetainedNamesPublication,namesProducerTransfer,decodeNamesProducerTransfer}=await import('../lib/names-verify.mjs');
  const root=await mkdtemp(join(tmpdir(),'acme-retained-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const mode of ['stable','changed','ambiguous']){let reads=0;const outputFile=join(root,mode+'.json');
   const pr={id:61,number:3,base:{repo:repository},head:{ref:'keel-night/2026-10-24',sha:revision},body:'Private old keel body',labels:[{id:4}],updated_at:'2026-10-24T10:00:00Z'};
   const github=async request=>{assert.equal(request.method,'GET');if(request.path.includes('/pulls?'))return {status:200,data:mode==='ambiguous'?[pr,pr]:[pr]};reads++;return {status:200,data:{...pr,...(mode==='changed'&&reads===2?{body:'Changed body'}:{})}};};
   await captureRetainedNamesPublication({repo,repositoryId:31,kind:'night',branch:pr.head.ref,date:'2026-10-24',outputFile},github);
   const raw=await readFile(outputFile,'utf8'),value=JSON.parse(raw);assert.ok(!raw.includes('Private old'));
   if(mode==='stable'){assert.equal(value.writes[0].sequence,1);assert.equal(value.writes[0].outcome,'no-change');assert.deepEqual(value.writes[0].before,value.writes[0].after);const decoded=decodeNamesProducerTransfer(await namesProducerTransfer({producerId:'night-pr',value,manifest:{files:[],gaps:[]}}));assert.equal(decoded.value.writes[0].outcome,'no-change');}
   else{assert.equal(value.writes.length,0);assert.equal(value.gaps[0].code,'retained-publication-unavailable');}
  }
 });

test('provisioning cannot substitute checkout helpers for missing observer closure or changed managed bytes',async()=>{
 for(const option of ['missingObserver','missingClosure','changedManaged']){const f=await positiveObservationFixture({[option]:true});const out=await verifyNames({repo,run:12},f.github);assert.notEqual(out.data.state,'verified',option);assert.ok(out.data.gaps.includes('Night observation source/producer coverage unavailable'),option);}
});

test('a project without actual delivery history reads cannot claim the strict history checklist',async()=>{
 const f=await positiveObservationFixture({withoutDelivery:true});const out=await verifyNames({repo,run:12},f.github);assert.equal(check(out,'board-history').state,'unknown');assert.notEqual(out.data.state,'verified');
});

test('cross-job transfer rejects private scalars and objects under allowed evidence keys before export',async()=>{
 const {namesProducerTransfer,decodeNamesProducerTransfer}=await import('../lib/names-verify.mjs');
 const hash='b'.repeat(64),at='2026-10-24T10:00:00Z';
 const snapshot={state:'present',commitSha:null,blobSha:null,sha256:hash,labelIds:[],providerUpdatedAt:at};
 const source={repositoryId:31,path:'scripts/plates/drain.mjs',commitSha:revision,blobSha:revision,sha256:hash};
 const base={producerId:'night-pr',writes:[{producerId:'night-pr',role:'night-pr',sequence:1,operationId:null,target:{kind:'pr',repositoryId:31,id:61,number:3,headSha:revision},outcome:'confirmed',before:null,after:snapshot,intended:{fragment:'fragments/write.txt',sha256:hash,names:[]},observedAt:at}],reads:[{consumer:'board',sourceKind:'plan',repositoryId:31,ref:'plates-night-plan',path:'plan.json',commitSha:revision,blobSha:revision,sha256:hash,state:'read',absence:null,selected:true,contributed:true,outputSection:'plan',outputProjection:{fragment:'fragments/plan.txt',sha256:hash},recordIds:['acme']}],fragments:[{path:'fragments/write.txt',kind:'managed-fragment',text:''},{path:'fragments/plan.txt',kind:'projection',text:JSON.stringify({date:'2026-10-24',items:[]})},{path:'fragments/drain.txt',kind:'projection',text:JSON.stringify({before:[{number:3,id:61,head:'plates-night/2026-10-24',headSha:revision,state:'open',mergeable:true}],after:[],actions:[{number:3,head:'plates-night/2026-10-24',action:'leave',done:false}]})}],projections:[{producerId:'night-pr',kind:'drain-queue',fragment:'fragments/drain.txt',sha256:hash}],gaps:[{code:'read-unavailable',producerId:'night-pr',source}],association:{date:'2026-10-24',branch:'plates-night/2026-10-24',preexisting:true,preimageHeadSha:revision,prId:61,prNumber:3,headSha:revision}};
 const transfer=value=>namesProducerTransfer({producerId:'night-pr',value,manifest:{files:[],gaps:[]}});
 assert.equal(decodeNamesProducerTransfer(await transfer(base)).value.writes.length,1);
 const paths=['writes.0.role','writes.0.sequence','writes.0.operationId','writes.0.target.number','writes.0.target.id','writes.0.target.repositoryId','writes.0.target.headSha','writes.0.after.sha256','writes.0.after.commitSha','writes.0.after.blobSha','writes.0.after.labelIds','writes.0.after.providerUpdatedAt','writes.0.observedAt','writes.0.intended.sha256','reads.0.repositoryId','reads.0.ref','reads.0.path','reads.0.sha256','reads.0.selected','reads.0.outputSection','reads.0.recordIds','reads.0.outputProjection.sha256','gaps.0.source.path','gaps.0.source.repositoryId','gaps.0.source.sha256','gaps.0.source.commitSha','association.prNumber','association.headSha','association.branch','association.date','association.preexisting','projections.0.sha256'];
 for(const path of paths)for(const payload of ['Private Acme credential payload',{private:'Private Acme credential payload'}]){
  const value=structuredClone(base),keys=path.split('.');let target=value;for(const key of keys.slice(0,-1))target=target[key];target[keys.at(-1)]=payload;
  const encoded=await transfer(value),text=Buffer.from(encoded,'base64').toString('utf8');assert.ok(!text.includes('Private Acme'),path);
  const decoded=decodeNamesProducerTransfer(encoded);assert.equal(decoded.value.writes.length,0,path);assert.equal(decoded.value.gaps[0].code,'producer-output-unavailable',path);
 }
 for(const [collection,key] of [['before','number'],['before','head'],['before','headSha'],['before','mergeable'],['actions','head'],['actions','done'],['actions','action']]){
  const value=structuredClone(base),projection=JSON.parse(value.fragments[2].text);projection[collection][0][key]={private:'Private Acme credential payload'};value.fragments[2].text=JSON.stringify(projection);
  const encoded=await transfer(value);assert.ok(!Buffer.from(encoded,'base64').toString().includes('Private Acme'));assert.equal(decodeNamesProducerTransfer(encoded).value.gaps[0].code,'producer-output-unavailable');
 }
});


for(const family of ['plates','keel'])test(`required ${family} verify-history alias cannot be satisfied by skipped reads`,async()=>{
 const f=await positiveObservationFixture({skippedHistory:family});
 const github=async request=>request.path.includes('/git/ref/heads/'+family+'-verify')?{status:200,data:{ref:'refs/heads/'+family+'-verify',object:{sha:revision}}}:f.github(request);
 const out=await verifyNames({repo,run:12},github);
 assert.equal(check(out,'board-history').state,'unknown');
 assert.notEqual(out.data.state,'verified');
});


test('provider regions reject omitted legacy tokens independently of supplied fragments',async()=>{
 const f=await positiveObservationFixture({legacy:true,omitTokens:true});
 const out=await verifyNames({repo,run:12},f.github);
 assert.equal(check(out,'fresh-markers-fences-labels').state,'fail',JSON.stringify(out.data));
});

test('producer coverage rejects substituted targets paths heads and roles',async()=>{
 for(const mode of ['object','path','head','branch','role','missing','duplicate','working-plan']){
  const f=await positiveObservationFixture({alter:({kind,writes})=>{
   if(kind!=='night')return;
   const w=writes.find(w=>w.role==='health-report');
   if(mode==='object'){const other=writes.find(w=>w.role==='night-pr');Object.assign(w,{target:other.target,intended:other.intended,after:other.after});}
   if(mode==='path'){const other=writes.find(w=>w.role==='bounds');Object.assign(w,{target:other.target,intended:other.intended,after:other.after});}
   if(mode==='head')w.after.commitSha='b'.repeat(40);
   if(mode==='branch')w.target.ref='refs/heads/plates-night/unrelated';
   if(mode==='role')w.role='bounds';
   if(mode==='missing')writes.splice(writes.indexOf(w),1);
   if(mode==='duplicate')writes.push({...w,sequence:99});
   if(mode==='working-plan'){const local=writes.find(w=>w.role==='working-plan');local.after.sha256=local.intended.sha256='c'.repeat(64);}
  }});
  const out=await verifyNames({repo,run:12},f.github);
  assert.equal(check(out,'fresh-markers-fences-labels').state,'unknown',mode);
 }
});

test('real generated regions preserve bounded historical content and retained publication bodies',async()=>{
 const f=await positiveObservationFixture({history:true,retainedPR:true});
 const out=await verifyNames({repo,run:12},f.github);
 assert.equal(out.data.state,'verified',JSON.stringify(out.data,null,2));
});

for(const legacyPlan of [false,true])test(`plan publication binds exact ${legacyPlan?'legacy':'current'} table ref and path`,async()=>{
 const good=await positiveObservationFixture({legacyPlan});
 assert.equal((await verifyNames({repo,run:12},good.github)).data.state,'verified');
 const bad=await positiveObservationFixture({legacyPlan,alter:({kind,writes})=>{if(kind==='night')writes.find(w=>w.role==='plan-publication').target.path=legacyPlan?'.plates/night/plan.json':'.keel/night/plan.json';}});
 assert.equal(check(await verifyNames({repo,run:12},bad.github),'fresh-markers-fences-labels').state,'unknown');
});


test('new proposal names and inaccessible partial-edit preimages cannot be hidden',async()=>{
 const fresh=await positiveObservationFixture({newProposal:true,omitTokens:true});
 assert.equal(check(await verifyNames({repo,run:12},fresh.github),'fresh-markers-fences-labels').state,'fail');
 for(const mode of ['missing-before','wrong-before','final-outside-change']){
  const f=await positiveObservationFixture({alter:({kind,writes,contents,hash,blob})=>{
   if(mode==='missing-before'&&kind==='night')writes.find(w=>w.role==='health-report').before=null;
   if(mode==='wrong-before'&&kind==='morning')writes.find(w=>w.role==='health-plan-section').before.commitSha='b'.repeat(40);
   if(mode==='final-outside-change'&&kind==='morning'){
    const w=writes.find(w=>w.role==='health-plan-section'),key=w.target.path+'@'+w.after.commitSha;
    const bytes=Buffer.from(contents.get(key).toString()+'Unrelated outside edit');contents.set(key,bytes);w.after.sha256=w.intended.sha256=hash(bytes);w.after.blobSha=blob(bytes);
   }
  }});
  const github=async req=>mode==='wrong-before'&&req.path.endsWith('?ref='+'b'.repeat(40))?{status:404}:f.github(req);
  assert.equal(check(await verifyNames({repo,run:12},github),'fresh-markers-fences-labels').state,'unknown',mode);
 }
});


for(const ownerProse of [true,false])test(`night record derives provider plan projection: ${ownerProse?'owner title retained':'managed ID rejected'}`,async()=>{
 const {validatePlan}=await import('../practices/night/files/scripts/plates/night-plan.mjs');
 const f=await positiveObservationFixture({omitTokens:true,alter:({kind,writes,contents,hash,blob})=>{
  const record=writes.find(w=>w.role==='night-record'),local=writes.find(w=>w.role==='working-plan');
  const plan=JSON.parse(contents.get(record.target.path));
  plan.items=[{id:ownerProse?'acme':'keel-impact',kind:'review',status:'planned',source:'owner',title:'Review keel:morning backward compatibility',lane:'night',number:null,budget:null,result:null}];
  assert.equal(validatePlan(plan).ok,true,JSON.stringify(validatePlan(plan).problems));
  const bytes=Buffer.from(JSON.stringify(plan,null,2)+'\n');contents.set(record.target.path,bytes);
  for(const w of [record,local].filter(Boolean)){w.after.sha256=w.intended.sha256=hash(bytes);w.after.blobSha=blob(bytes);}
  // This fixture isolates the record writer. The optional health edit is covered
  // separately with the real plan generator and immutable preimage.
  if(kind==='morning'){const w=writes.find(w=>w.role==='health-plan-section');writes.splice(writes.indexOf(w),1);}
 }});
 const out=await verifyNames({repo,run:12},f.github);
 assert.equal(check(out,'fresh-markers-fences-labels').state,ownerProse?'pass':'fail');
});


for(const mode of ['verified','missing-commit','missing-blob','unavailable-commit'])test(`retained Git health requires provider preimage: ${mode}`,async()=>{
 const f=await positiveObservationFixture({legacy:true,omitTokens:true,retainedPR:true,alter:({kind,writes,contents})=>{
  if(kind!=='night')return;
  const w=writes.find(w=>w.role==='health-report');
  const commit='d'.repeat(40);
  contents.set(w.target.path+'@'+commit,contents.get(w.target.path+'@'+revision));
  const snapshot={...w.after,commitSha:commit};
  if(mode==='missing-commit')snapshot.commitSha=null;
  if(mode==='missing-blob')snapshot.blobSha=null;
  w.outcome='no-change';w.before={...snapshot};w.after={...snapshot};
 }});
 const github=async request=>mode==='unavailable-commit'&&request.path.endsWith('?ref='+'d'.repeat(40))?{status:404}:f.github(request);
 const out=await verifyNames({repo,run:12},github);
 assert.equal(check(out,'fresh-markers-fences-labels').state,mode==='verified'?'pass':'unknown');
 if(mode==='verified')assert.equal(out.data.state,'verified',JSON.stringify(out.data));
 else assert.notEqual(out.data.state,'verified');
});
