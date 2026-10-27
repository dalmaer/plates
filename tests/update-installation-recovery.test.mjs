import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { installUpdate } from '../lib/update-installation.mjs';
import { observeProof } from '../lib/update-installation-state.mjs';
import { load, fill, practiceVersion } from '../lib/practices.mjs';
import { hash } from '../lib/update-installation-contract.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const A='a'.repeat(40),B='b'.repeat(40),W='.github/workflows/check.yml';
const tree='e'.repeat(40);
const commit=`tree ${tree}\nparent ${A}\nparent ${B}\nauthor Plates <plates@users.noreply.github.com> 1792886400 +0000\ncommitter Plates <plates@users.noreply.github.com> 1792886400 +0000\n\nAcme merge\n`;
const M=createHash('sha1').update(`commit ${Buffer.byteLength(commit)}\0`).update(commit).digest('hex');
const artifact={sha:M,tree,commit:Buffer.from(commit).toString('base64')};
async function fixture(t,{barrier=false,disabled=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'acme-install-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const practices=await load(),version=practiceVersion();
  const cfg={name:'Acme',repo:'acme/example',tagline:'Acme fixture',practice:version,practices:['base','ci'],check:'npm test',review:{reviewers:['claude']}};
  const text=fill(practices.get('ci').files.find(f=>f.path===W).template,cfg,W);
  const old=barrier?text.replace('group: check-', 'group: acme-old-'):`# old Acme template\n${text}`;
  const config='.plates/plates.json',lock='.plates/lock.json';
  const base={[config]:JSON.stringify({...cfg,practice:'0.0.1'}),[W]:old,[lock]:JSON.stringify({practice:'0.0.1',files:{[W]:{practice:'ci',sha256:hash(old)}}})};
  const head={[config]:JSON.stringify(cfg),[W]:text,[lock]:JSON.stringify({practice:version,files:{[W]:{practice:'ci',sha256:hash(text)}}})};
  const state={base,head,meta:{id:1,node_id:'R_acme',full_name:'acme/example',default_branch:'main',permissions:{push:true}},
    pr:{number:7,state:'open',draft:false,merged:false,changed_files:3,mergeable:true,mergeable_state:'clean',user:{id:8},head:{sha:B,repo:{id:1}},base:{sha:A,repo:{id:1},ref:'main'}},
    inventory:[{id:10,path:W,state:disabled?'disabled_manually':'active'},{id:11,path:'.github/workflows/owner.yml',state:'active'}],
    checks:[{id:20,name:'check',head_sha:B,status:'completed',conclusion:'success',completed_at:'2026-10-25T00:00:00Z'}],
    reviews:[{id:30,user:{id:9,login:'claude'},author_association:'MEMBER',state:'COMMENTED',commit_id:B}],
    gate:[{id:40,workflow_id:10,head_sha:B,head_repository:{id:1},pull_requests:[{number:7,head:{sha:B},base:{sha:A}}],event:'pull_request',status:'completed',conclusion:'success',run_attempt:1}],runs:[],calls:[],fault:null,merged:false};
  const github=async request=>respond(state,request);
  github.reviewGate=async ({repo,number})=>({repo,number,head:state.pr.head.sha,ok:state.reviews.some(r=>r.commit_id===state.pr.head.sha)&&!state.reviews.some(r=>r.state==='CHANGES_REQUESTED'),why:'configured review gate',reviewedBy:['claude']});
  github.prepareMerge=async()=>(artifact);
  github.mergeConditional=async(plan,artifact,{beforePublish})=>{await beforePublish();return respond(state,{method:'PUSH',path:'/repos/acme/example/pulls/7/merge',body:{sha:plan.head}});};
  github.requiredChecks=async()=>[{name:'check',state:'SUCCESS',bucket:'pass'}];
  return {root,state,github,preview:()=>installUpdate({root,install:'acme/example#7'},{github}),apply:d=>installUpdate({root,install:'acme/example#7',yes:true,digest:d},{github}),recover:id=>installUpdate({root,recover:id},{github})};
}
// In-memory Acme provider: remote reads and conditional delivery are synthetic.
function respond(s,{method='GET',path,body}) {
  s.calls.push({method,path,body});
  const ok=data=>({status:200,data}),u=new URL(path,'https://acme.test'),p=u.pathname.replace('/repos/acme/example','');
  const blobHash=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  if(method==='PUT'||method==='PUSH') {
    if(p==='/pulls/7/merge'){
      if(s.fault==='merge-before')throw new Error('merge response lost');
      assert.equal(body.sha,s.pr.head.sha);s.merged=true;s.pr.merged=true;s.pr.state='closed';s.pr.merge_commit_sha=M;
      if(s.deleteWorkflow)s.inventory=s.inventory.filter(w=>w.id!==s.deleteWorkflow);
      if(s.registerWorkflow)s.inventory.push(s.registerWorkflow);
      if(s.fault==='merge-after')throw new Error('merge response lost');
      return ok({merged:true,sha:s.pr.merge_commit_sha});
    }
    const m=/^\/actions\/workflows\/(\d+)\/(disable|enable)$/.exec(p);
    if(m){const w=s.inventory.find(w=>w.id===Number(m[1]));if(!w)throw new Error('wrong workflow');
      if(s.fault===m[2]+'-before')throw new Error('state response lost');
      w.state=m[2]==='disable'?'disabled_manually':'active';
      if(s.fault===m[2]+'-after')throw new Error('state response lost');
      return {status:204,data:null};}
    throw new Error(`unexpected mutation ${p}`);
  }
  if(!p)return ok(s.meta);
  if(p==='/pulls/7')return ok(s.pr);
  if(p==='/contents/.plates/plates.json')return ok({content:Buffer.from(s.base['.plates/plates.json']).toString('base64')});
  if(p==='/commits/'+M)return ok({sha:M,parents:s.mergeParents??[{sha:'a'.repeat(40)},{sha:'b'.repeat(40)}]});
  if(p==='/commits/main')return ok({sha:s.merged?M:'a'.repeat(40)});
  if(p==='/pulls/7/files')return ok([...new Set([...Object.keys(s.base),...Object.keys(s.head)])].filter(path=>s.base[path]!==s.head[path]).map(filename=>({filename,status:!(filename in s.head)?'removed':!(filename in s.base)?'added':'modified'})));
  if(p.startsWith('/git/trees/')) {
    if(s.fault==='readback'&&p.includes(M))throw new Error('readback unavailable');
    const files=p.includes('a'.repeat(40))?s.base:s.head;
    return ok({truncated:s.truncated??false,tree:Object.entries(files).map(([path,text])=>({path,type:'blob',mode:s.symlink===path?'120000':'100644',sha:blobHash(text)}))});
  }
  if(p.startsWith('/git/blobs/')){const text=[...Object.values(s.base),...Object.values(s.head)].find(text=>blobHash(text)===p.split('/').at(-1));if(text===undefined)throw new Error('unknown blob');return ok({encoding:'base64',content:Buffer.from(text).toString('base64')});}
  if(p==='/actions/workflows')return ok({total_count:s.inventory.length,workflows:s.inventory});
  if(/^\/actions\/workflows\/\d+\/runs$/.test(p)){const rows=u.searchParams.has('head_sha')?s.gate:s.runs.filter(r=>r.workflow_id===Number(p.split('/')[3]));return ok({total_count:rows.length+(s.partial?1:0),workflow_runs:rows});}
  if(p.endsWith('/check-runs'))return ok({total_count:s.checks.length,check_runs:s.checks});
  if(p.endsWith('/status'))return ok({sha:p.split('/')[2],total_count:0,statuses:[]});
  if(p==='/pulls/7/reviews')return ok(s.reviews);
  throw new Error(`unexpected read ${path}`);
}
const mutations=f=>f.state.calls.filter(c=>['PUT','PUSH'].includes(c.method));

const receiptPath=(f,id)=>join(f.root,'.plates/update/operations',`${id}.json`);
async function pausedFixture(t) {
  const f=await fixture(t,{barrier:true});
  f.state.runs=[{id:50,workflow_id:10,status:'in_progress',head_branch:'other'}];
  const preview=await f.preview(),paused=await f.apply(preview.data.digest);
  assert.match(paused.data.problem,/drain pending/);f.state.runs=[];
  return {...f,previewResult:preview,operationId:paused.data.operationId};
}
test('recovery rereads under lock before advancing an uncertain original merge',async t=>{
  const f=await pausedFixture(t),path=receiptPath(f,f.operationId);
  const read=fs.promises.readFile;let intercepted=false,releaseRead,capturedRead;
  const captured=new Promise(resolve=>capturedRead=resolve),release=new Promise(resolve=>releaseRead=resolve);
  const mock=t.mock.method(fs.promises,'readFile',async function(file,...args){
    const bytes=await read(file,...args);
    if(!intercepted&&String(file).endsWith(f.operationId+'.json')){intercepted=true;capturedRead();await release;}
    return bytes;
  });
  syncBuiltinESMExports();
  try {
    const delayed=f.recover(f.operationId);await captured;
    f.state.fault='merge-before';const first=await f.recover(f.operationId);
    assert.match(first.data.problem,/merge response lost/);
    releaseRead();const second=await delayed;
    assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,1,'uncertain merge must not be repeated from a stale receipt');
    assert.match(second.data.problem,/original merge will not be repeated/);
  }finally{releaseRead();mock.mock.restore();syncBuiltinESMExports();}
});
test('recovery appends fresh passing proof without changing original approval',async t=>{
  const f=await pausedFixture(t),path=receiptPath(f,f.operationId),before=JSON.parse(await readFile(path,'utf8'));
  f.state.checks[0].id++;f.state.gate[0].run_attempt++;
  const oldReview=f.github.reviewGate;f.github.reviewGate=async args=>({...await oldReview(args),why:'fresh Acme review observation'});
  const result=await f.recover(f.operationId);
  assert.equal(result.exitCode,0,result.data.problem);
  const after=JSON.parse(await readFile(path,'utf8'));
  assert.deepEqual(after.plan,before.plan);assert.deepEqual(after.approval,before.approval);assert.equal(after.operationId,before.operationId);
  assert.equal(after.proofObservations.at(-1).proof.checks[0].id,f.state.checks[0].id);
  assert.equal(after.proofObservations.at(-1).proof.gate.attempt,2);
  assert.deepEqual(result.data.continuation.proofObservations,after.proofObservations);
  assert.equal(f.state.inventory[0].state,'active');
});
for(const [name,change] of [
  ['failed check',f=>f.state.checks[0].conclusion='failure'],
  ['failed review',f=>f.state.reviews.push({state:'CHANGES_REQUESTED'})],
  ['changed permission',f=>f.state.meta.permissions.admin=true],
  ['changed workflow identity',f=>f.state.inventory[0].id=99],
  ['changed head',f=>{const next='d'.repeat(40);f.state.pr.head.sha=next;f.state.checks[0].head_sha=next;f.state.gate[0].head_sha=next;f.state.reviews[0].commit_id=next;}],
])test(`proof refresh cannot authorize ${name}`,async t=>{
  const f=await pausedFixture(t);change(f);const result=await f.recover(f.operationId);
  assert.equal(result.exitCode,1);assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,0);
});
test('conditional merge artifact is durable before dispatch and has no PUT fallback',async t=>{
  const f=await fixture(t),p=await f.preview();let prepared=0,dispatched=0;
  f.github.prepareMerge=async()=>{prepared++;return artifact;};
  f.github.mergeConditional=async(plan,actual,{beforePublish})=>{
    await beforePublish();dispatched++;const j=JSON.parse(await readFile(receiptPath(f,p.data.operationId),'utf8'));
    assert.deepEqual(j.mergeArtifact,artifact);assert.deepEqual(actual,artifact);
    assert.equal(j.actions.find(a=>a.kind==='merge').state,'attempted');
    throw new Error('Acme conditional delivery uncertain');
  };
  const r=await f.apply(p.data.digest);assert.match(r.data.problem,/delivery uncertain/);
  await f.recover(r.data.operationId);assert.equal(prepared,1);assert.equal(dispatched,1);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,0);
});

for(const key of ['head','base','implementation','permissions','compatibility','barrier','mutations','budget'])test(`refreshed proof preserves immutable ${key}`,async t=>{
  const f=await fixture(t),p=await f.preview(),{digest:approved,operationId,installation,verification,retirement,...plan}=p.data;
  const j={plan,approval:{digest:approved}},fresh=structuredClone(plan);
  fresh.proof.checks[0].id++;fresh[key]=key==='budget'?1:null;
  assert.notDeepEqual(fresh[key],plan[key]);
  assert.throws(()=>observeProof(j,fresh),/source or authority changed/);
  assert.equal(j.proofObservations,undefined);assert.deepEqual(j.plan,plan);
});
test('missing conditional adapter refuses without an API merge fallback',async t=>{
  const f=await fixture(t),p=await f.preview();delete f.github.mergeConditional;
  const r=await f.apply(p.data.digest);assert.match(r.data.problem,/conditional merge adapter unavailable/);
  assert.equal(mutations(f).length,0);
});

test('invalid prepared artifact refuses before dispatch and does not poison receipt',async t=>{
  const f=await fixture(t),p=await f.preview();let dispatched=0;
  f.github.prepareMerge=async()=>({...artifact,sha:'f'.repeat(40)});
  f.github.mergeConditional=async()=>{dispatched++;};
  const r=await f.apply(p.data.digest);assert.match(r.data.problem,/merge artifact identity differs/);
  const j=JSON.parse(await readFile(receiptPath(f,p.data.operationId),'utf8'));
  assert.equal(j.mergeArtifact,undefined);assert.equal(j.actions.find(a=>a.kind==='merge').state,'prepared');
  assert.equal(dispatched,0);
});

const restore=(f,options={})=>installUpdate({root:f.root,recover:f.operationId,restoreOnly:true,...options},{github:f.github});
test('restore-only preview writes nothing and explicit apply aborts original installation',async t=>{
  const f=await pausedFixture(t);f.state.checks[0].conclusion='failure';
  const path=receiptPath(f,f.operationId),before=await readFile(path,'utf8'),count=mutations(f).length;
  const p=await restore(f);assert.equal(p.exitCode,3);assert.equal(await readFile(path,'utf8'),before);assert.equal(mutations(f).length,count);
  assert.deepEqual(p.data.targets.map(a=>({id:a.id,path:a.path})),[{id:10,path:W}]);
  const r=await restore(f,{yes:true,digest:p.data.digest});assert.equal(r.exitCode,0,r.data.problem);assert.equal(r.data.state,'aborted-restored');assert.equal(r.data.installation.state,'aborted');
  const j=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(j.plan,JSON.parse(before).plan);assert.deepEqual(j.approval,JSON.parse(before).approval);
  assert.equal(j.actions.find(a=>a.kind==='merge').state,'prepared');
  const calls=mutations(f).length;f.state.checks[0].conclusion='success';
  const ordinary=await f.recover(f.operationId);assert.equal(ordinary.data.state,'aborted-restored');assert.equal(mutations(f).length,calls);
});
for(const fault of ['enable-before','enable-after'])test(`restore-only ${fault} retains intent and never repeats enable`,async t=>{
  const f=await pausedFixture(t),p=await restore(f);assert.equal(p.exitCode,3);
  const enable=f.github;const provider=async request=>{
    if(request.method==='PUT'&&request.path.endsWith('/enable')){
      const j=JSON.parse(await readFile(receiptPath(f,f.operationId),'utf8'));
      assert.equal(j.restoration.actions[0].state,'attempted');
    }
    return enable(request);
  };Object.assign(provider,enable);f.github=provider;
  f.state.fault=fault;const r=await restore(f,{yes:true,digest:p.data.digest});assert.equal(r.exitCode,1);
  f.state.fault=null;const again=await restore(f,{yes:true,digest:p.data.digest});
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,1);
  assert.equal(again.exitCode,fault==='enable-after'?0:1);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,0);
});
for(const [name,change,reason] of [
  ['old bytes',f=>f.state.base[W]+='\n# Acme changed default',/preimage/],
  ['old mode',f=>f.state.symlink=W,/file type|preimage/],
  ['workflow identity',f=>f.state.inventory[0].id=99,/workflow/],
  ['permission',f=>f.state.meta.permissions.push=false,/permission/],
  ['external merge',f=>f.state.pr.merged=true,/merge/],
])test(`restore-only refuses changed ${name} before enabling`,async t=>{
  const f=await pausedFixture(t);change(f);const n=mutations(f).length;
  await assert.rejects(restore(f),reason);assert.equal(mutations(f).length,n);
});
test('restore-only refuses attempted merge despite open PR',async t=>{
  const f=await pausedFixture(t);f.state.fault='merge-before';await f.recover(f.operationId);assert.equal(f.state.pr.merged,false);
  await assert.rejects(restore(f),/attempted|uncertain/);
});
test('restore-only stale preview cannot authorize changed default bytes',async t=>{
  const f=await pausedFixture(t),p=await restore(f);f.state.base[W]+='\n# Acme changed default';
  await assert.rejects(restore(f,{yes:true,digest:p.data.digest}),/preimage/);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,0);
});

test('restore-only rereads under lock and refuses a newly attempted merge',async t=>{
  const f=await pausedFixture(t),p=await restore(f),read=fs.promises.readFile;
  let intercepted=false,releaseRead,capturedRead;
  const captured=new Promise(resolve=>capturedRead=resolve),release=new Promise(resolve=>releaseRead=resolve);
  const mock=t.mock.method(fs.promises,'readFile',async function(file,...args){
    const bytes=await read(file,...args);
    if(!intercepted&&String(file).endsWith(f.operationId+'.json')){intercepted=true;capturedRead();await release;}
    return bytes;
  });syncBuiltinESMExports();
  try {
    const delayed=restore(f,{yes:true,digest:p.data.digest});
    // Attach rejection handling before releasing the asynchronous read.
    const rejected=assert.rejects(delayed,/attempted or uncertain merge/);
    await captured;f.state.fault='merge-before';await f.recover(f.operationId);releaseRead();await rejected;
    assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,0);
  }finally{releaseRead();mock.mock.restore();syncBuiltinESMExports();}
});
test('restore-only uses old replacement workflow identity and never enables the new path',async t=>{
  const f=await fixture(t),s=f.state,oldPath='.github/workflows/keel-night.yml',newPath='.github/workflows/plates-night.yml';
  const config='.plates/plates.json',lock='.plates/lock.json',cfg=JSON.parse(s.head[config]);cfg.practices=['base','agents-md','ci','night'];
  const practices=await load(),target=practices.get('night').files.find(f=>f.path===newPath),text=fill(target.template,cfg,newPath);
  const old=text.replace('group: plates-night','group: keel-night');assert.notEqual(old,text);
  s.base[W]=s.head[W];s.base[config]=JSON.stringify({...cfg,practice:'0.0.1'});s.head[config]=JSON.stringify(cfg);
  s.base[oldPath]=old;s.head[newPath]=text;
  s.base[lock]=JSON.stringify({practice:'0.0.1',files:{[oldPath]:{practice:'night',sha256:hash(old)}}});
  s.head[lock]=JSON.stringify({practice:practiceVersion(),files:{[newPath]:{practice:'night',sha256:hash(text)}}});
  s.pr.changed_files=4;s.inventory.push({id:12,path:oldPath,state:'active'});
  s.runs=[{id:51,workflow_id:12,status:'in_progress',head_branch:'other'}];
  const p=await f.preview(),paused=await f.apply(p.data.digest);assert.match(paused.data.problem,/drain pending/);
  f.operationId=paused.data.operationId;const restoration=await restore(f);
  assert.deepEqual(restoration.data.targets.map(a=>({id:a.id,path:a.path})),[{id:12,path:oldPath}]);
  const r=await restore(f,{yes:true,digest:restoration.data.digest});assert.equal(r.exitCode,0,r.data.problem);
  assert.deepEqual(mutations(f).map(c=>c.path),['/repos/acme/example/actions/workflows/12/disable','/repos/acme/example/actions/workflows/12/enable']);
  assert.equal(s.inventory.find(w=>w.id===12).state,'active');
});

for(const fault of ['enable-before','enable-after'])test(`ordinary recovery observes unrelated default advance after ${fault} without repeating enable`,async t=>{
  const f=await pausedFixture(t),p=await restore(f);f.state.fault=fault;
  const r=await restore(f,{yes:true,digest:p.data.digest});assert.equal(r.exitCode,1);
  const path=receiptPath(f,f.operationId),before=JSON.parse(await readFile(path,'utf8'));
  f.state.fault=null;const original=f.github,next='d'.repeat(40);
  const provider=async request=>{
    if(request.path==='/repos/acme/example/commits/main')return {status:200,data:{sha:next}};
    if(request.path.startsWith(`/repos/acme/example/git/trees/${next}`))return original({...request,path:request.path.replace(next,A)});
    return original(request);
  };Object.assign(provider,original);f.github=provider;
  const recovered=await installUpdate({root:f.root,recover:f.operationId},{github:provider});
  assert.equal(recovered.exitCode,fault==='enable-after'?0:1,recovered.data.problem);assert.equal(recovered.data.state,fault==='enable-after'?'aborted-restored':'aborted-restoration-pending');
  const after=JSON.parse(await readFile(path,'utf8'));
  assert.deepEqual(after.restoration.plan,before.restoration.plan);assert.deepEqual(after.restoration.approval,before.restoration.approval);
  assert.equal(after.restoration.observations.at(-1).defaultRevision,next);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,1);
});
test('ordinary restoration recovery refuses changed preimage after uncertain enable',async t=>{
  const f=await pausedFixture(t),p=await restore(f);f.state.fault='enable-after';await restore(f,{yes:true,digest:p.data.digest});
  f.state.fault=null;f.state.base[W]+='\n# Acme changed old workflow';
  await assert.rejects(f.recover(f.operationId),/preimage/);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,1);
});

test('retained restoration approval cannot absorb changed permissions',async t=>{
  const f=await pausedFixture(t),p=await restore(f);f.state.fault='enable-before';await restore(f,{yes:true,digest:p.data.digest});
  f.state.fault=null;f.state.meta.permissions.admin=true;
  await assert.rejects(f.recover(f.operationId),/restoration source or authority changed/);
  assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,1);
});

for(const change of ['failed proof','active run'])test(`conditional preparation rechecks ${change} before attempted push`,async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();let pushed=0;
  f.github.prepareMerge=async()=>{
    if(change==='failed proof')f.state.checks[0].conclusion='failure';
    else f.state.runs=[{id:51,workflow_id:10,status:'in_progress',head_branch:'other'}];
    return artifact;
  };
  f.github.mergeConditional=async(plan,actual,{beforePublish})=>{await beforePublish();pushed++;throw Error('unexpected push');};
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);
  assert.match(r.data.problem,change==='failed proof'?/checks stale or unsuccessful/:/drain pending/);
  assert.equal(pushed,0);
  const j=JSON.parse(await readFile(receiptPath(f,p.data.operationId),'utf8'));
  assert.deepEqual(j.mergeArtifact,artifact);assert.equal(j.actions.find(a=>a.kind==='merge').state,'prepared');
});
test('conditional preparation may refresh passing proof within the same approved scope',async t=>{
  const f=await fixture(t),p=await f.preview();
  f.github.prepareMerge=async()=>{f.state.checks[0].id++;return artifact;};
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  assert.equal(r.data.continuation.proofObservations.at(-1).proof.checks[0].id,f.state.checks[0].id);
});

test('local conditional fetch failure leaves prepared artifact recoverable and abortable',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();let prepared=0;
  f.github.prepareMerge=async()=>{prepared++;return artifact;};
  f.github.mergeConditional=async()=>{throw Error('Acme local fetch failed before publication');};
  const r=await f.apply(p.data.digest);assert.match(r.data.problem,/local fetch failed/);
  const j=JSON.parse(await readFile(receiptPath(f,p.data.operationId),'utf8'));
  assert.equal(j.actions.find(a=>a.kind==='merge').state,'prepared');assert.deepEqual(j.mergeArtifact,artifact);
  f.operationId=p.data.operationId;const preview=await restore(f);
  const restored=await restore(f,{yes:true,digest:preview.data.digest});assert.equal(restored.exitCode,0,restored.data.problem);
  assert.equal(prepared,1);assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,0);
});
test('conditional adapter publication callback rechecks facts changed during local fetch',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();let pushed=0;
  f.github.mergeConditional=async(plan,actual,options)=>{
    f.state.runs=[{id:52,workflow_id:10,status:'in_progress',head_branch:'other'}];
    assert.equal(typeof options?.beforePublish,'function');
    await options.beforePublish();pushed++;
  };
  const r=await f.apply(p.data.digest);assert.match(r.data.problem,/drain pending/);assert.equal(pushed,0);
  const j=JSON.parse(await readFile(receiptPath(f,p.data.operationId),'utf8'));
  assert.equal(j.actions.find(a=>a.kind==='merge').state,'prepared');
});
