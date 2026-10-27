import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { installUpdate } from '../lib/update-installation.mjs';
import { installationGithub } from '../lib/update-installation-github.mjs';
import { load, fill, practiceVersion } from '../lib/practices.mjs';
import { hash } from '../lib/update-installation-contract.mjs';
import { run } from './helpers/run.mjs';
const ROOT=resolve(import.meta.dirname,'..'),BIN=join(ROOT,'bin/plates.mjs');
const A='a'.repeat(40),B='b'.repeat(40),T='d'.repeat(40),W='.github/workflows/check.yml';
const blob=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
function artifactFor(plan) {
  const text=`tree ${T}\nparent ${plan.base}\nparent ${plan.head}\nauthor Plates <plates@users.noreply.github.com> 123 +0000\ncommitter Plates <plates@users.noreply.github.com> 123 +0000\n\nplates: install ${plan.candidate}\n`;
  return {sha:createHash('sha1').update(`commit ${Buffer.byteLength(text)}\0`).update(text).digest('hex'),tree:T,commit:Buffer.from(text).toString('base64')};
}
const M=artifactFor({base:A,head:B,candidate:'acme/example#7'}).sha;
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
    gate:[{id:40,workflow_id:10,head_sha:B,event:'pull_request',status:'completed',conclusion:'success',run_attempt:1,head_repository:{id:1},pull_requests:[{number:7,head:{sha:B},base:{sha:A}}]}],runs:[],calls:[],fault:null,merged:false};
  const github=async request=>respond(state,request);
  github.reviewGate=async ({repo,number})=>({repo,number,head:state.pr.head.sha,ok:state.reviews.some(r=>r.commit_id===state.pr.head.sha)&&!state.reviews.some(r=>r.state==='CHANGES_REQUESTED'),why:'configured review gate',reviewedBy:['claude']});
  github.prepareMerge=async plan=>artifactFor(plan);
  github.mergeConditional=async (plan,artifact,{beforePublish})=>{await beforePublish();if(state.mergeParents)throw Error('conditional base lease refused');return github({method:'PUT',path:'/repos/acme/example/pulls/7/merge',body:{sha:plan.head}});};
  github.requiredChecks=async()=>[{name:'check',state:'SUCCESS',bucket:'pass'}];
  return {root,state,github,preview:()=>installUpdate({root,install:'acme/example#7'},{github}),apply:d=>installUpdate({root,install:'acme/example#7',yes:true,digest:d},{github}),recover:id=>installUpdate({root,recover:id},{github})};
}
// Serializable provider emulator also runs behind the real gh process adapter.
function respond(s,{method='GET',path,body}) {
  s.calls.push({method,path,body});
  const ok=data=>({status:200,data}),u=new URL(path,'https://acme.test'),p=u.pathname.replace('/repos/acme/example','');
  const blobHash=text=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  if(method==='PUT') {
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
  if(p==='/commits/'+(s.pr.merge_commit_sha??M))return ok({sha:s.pr.merge_commit_sha??M,parents:s.mergeParents??[{sha:'a'.repeat(40)},{sha:'b'.repeat(40)}]});
  if(p==='/commits/main')return ok({sha:s.merged?s.pr.merge_commit_sha:'a'.repeat(40)});
  if(p==='/pulls/7/files')return ok([...new Set([...Object.keys(s.base),...Object.keys(s.head)])].filter(path=>s.base[path]!==s.head[path]).map(filename=>({filename,status:!(filename in s.head)?'removed':!(filename in s.base)?'added':'modified'})));
  if(p.startsWith('/git/trees/')) {
    if(s.fault==='readback'&&p.includes(s.pr.merge_commit_sha??M))throw new Error('readback unavailable');
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
const mutations=f=>f.state.calls.filter(c=>c.method==='PUT');
test('ordinary managed update installs with exact readback, no barrier, independent verification',async t=>{
  const f=await fixture(t),p=await f.preview();assert.equal(p.exitCode,3);assert.deepEqual(mutations(f),[]);
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);assert.equal(r.data.installation.state,'installed');assert.equal(r.data.verification.state,'unavailable');assert.equal(r.data.retirement.state,'unavailable');assert.equal(r.data.installation.mergeRevision,M);
  assert.deepEqual(mutations(f).map(c=>c.path),['/repos/acme/example/pulls/7/merge']);
  await writeFile(join(f.root,'unrelated.md'),'Unrelated Acme record');
  assert.equal((await f.recover(r.data.operationId)).exitCode,0);assert.equal(mutations(f).length,1);
});
test('changed identity pauses exact workflow, drains all refs and restores prior state',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();assert.equal(p.data.barrier[0].oldId,10);
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  assert.deepEqual(mutations(f).map(c=>c.path),['/repos/acme/example/actions/workflows/10/disable','/repos/acme/example/pulls/7/merge','/repos/acme/example/actions/workflows/10/enable']);
  assert.equal(f.state.inventory[1].state,'active');
});
test('previously disabled workflow stays disabled',async t=>{
  const f=await fixture(t,{barrier:true,disabled:true}),p=await f.preview(),r=await f.apply(p.data.digest);
  assert.equal(r.exitCode,0,r.data.problem);assert.equal(f.state.inventory[0].state,'disabled_manually');assert.equal(mutations(f).length,1);
});
for(const status of ['queued','in_progress','waiting','pending','requested','unknown','action_required'])test(`barrier blocks ${status} across any ref/event and resumes original after natural drain`,async t=>{
  const f=await fixture(t,{barrier:true});f.state.runs=[{id:50,workflow_id:10,status,head_branch:'other',event:'schedule'}];
  const p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);assert.match(r.data.problem,/drain pending/);assert.equal(mutations(f).length,1);
  f.state.runs[0]={...f.state.runs[0],status:'completed',conclusion:'success'};
  const resumed=await f.recover(r.data.operationId);assert.equal(resumed.exitCode,0,resumed.data.problem);assert.equal(mutations(f).filter(c=>c.path.endsWith('/disable')).length,1);
});
for(const fault of ['merge-before','merge-after','readback','enable-before','enable-after','disable-after'])test(`uncertainty ${fault} retains original mutation and obligations`,async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();f.state.fault=fault;
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);const before=mutations(f).length;
  f.state.fault=null;const recovered=await f.recover(r.data.operationId);
  if(['merge-before','enable-before'].includes(fault)){assert.equal(recovered.exitCode,1);assert.equal(mutations(f).length,before);}
  else assert.equal(recovered.exitCode,0,recovered.data.problem);
  assert.ok(mutations(f).filter(c=>c.path.endsWith('/merge')).length<=1);
  assert.ok(mutations(f).filter(c=>c.path.endsWith('/enable')).length<=1);
  if(fault.startsWith('enable'))assert.equal(r.data.installation.state,'installed');
});
for(const [name,change,reason] of [
  ['stale head',s=>s.pr.head.sha=A,/gate|checks|diff/],
  ['stale review',s=>s.reviews[0].commit_id=A,/review gate/],
  ['request changes',s=>s.reviews.push({...s.reviews[0],id:31,state:'CHANGES_REQUESTED'}),/review gate/],
  ['failed configured gate',s=>s.gate[0].conclusion='failure',/gate/],
  ['stale checks',s=>s.checks[0].head_sha=A,/checks/],
  ['pending checks',s=>s.checks[0].status='in_progress',/checks/],
  ['partial API coverage',s=>s.partial=true,/coverage/],
  ['partial tree',s=>s.truncated=true,/tree/],
  ['symlink',s=>s.symlink=W,/file type/],
  ['human edit',s=>s.base[W]+='\n# Owner content',/compatibility/],
  ['unshipped code',s=>s.head[W]+='\n# forged update',/compatibility/],
  ['policy change',s=>{const c=JSON.parse(s.head['.plates/plates.json']);c.check='echo green';s.head['.plates/plates.json']=JSON.stringify(c);},/policy/],
])test(`refuses ${name} before mutation`,async t=>{const f=await fixture(t);change(f.state);await assert.rejects(f.preview(),reason);assert.equal(mutations(f).length,0);});
test('changed permissions/head/check evidence invalidates exact preview',async t=>{
  const f=await fixture(t),p=await f.preview();f.state.checks[0].id++;
  await assert.rejects(f.apply(p.data.digest),/preview changed/);assert.equal(mutations(f).length,0);
});
for(const [name,change] of [
  ['another PR',s=>s.gate[0].pull_requests[0].number=99],
  ['stale base',s=>s.gate[0].pull_requests[0].base.sha='e'.repeat(40)],
  ['missing source',s=>delete s.gate[0].pull_requests],
])test(`gate cannot borrow ${name} evidence`,async t=>{
  const f=await fixture(t);change(f.state);await assert.rejects(f.preview(),/gate candidate\/base binding/);assert.equal(mutations(f).length,0);
});
test('new workflow ID cannot inherit approved restore authority',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();f.state.fault='merge-after';const r=await f.apply(p.data.digest);
  f.state.fault=null;f.state.inventory[0].id=99;const recovered=await f.recover(r.data.operationId);
  assert.equal(recovered.data.state,'installed-restoration-pending');assert.match(recovered.data.problem,/mapping unavailable/);assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,0);
});
test('symlink state directory and foreign receipt refuse',async t=>{
  const f=await fixture(t),p=await f.preview();await mkdir(join(f.root,'.plates'));await symlink(f.root,join(f.root,'.plates/update'));
  await assert.rejects(f.apply(p.data.digest),/unsafe/);assert.equal(mutations(f).length,0);
  await rm(join(f.root,'.plates/update'));const r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  const path=join(f.root,'.plates/update/operations',`${r.data.operationId}.json`),j=JSON.parse(await readFile(path,'utf8'));j.ownerRoot='/foreign';await writeFile(path,JSON.stringify(j),{mode:0o600});
  await assert.rejects(f.recover(r.data.operationId),/foreign/);
});
for(const replacement of [false,true])test(`real CLI preview/apply uses gh adapter (${replacement?'replacement':'ordinary'})`,async t=>{
  const f=replacement?await replacementFixture(t):await fixture(t),statePath=join(f.root,'provider.json'),gh=join(f.root,'gh');
  await writeFile(statePath,JSON.stringify(f.state));
  const script=`#!${process.execPath}\nconst {readFileSync,writeFileSync}=require('node:fs');const {createHash}=require('node:crypto');const assert=require('node:assert/strict');
const M=${JSON.stringify(M)};const respond=${respond.toString()};const file=${JSON.stringify(statePath)};const s=JSON.parse(readFileSync(file));const args=process.argv.slice(2);
if(args[0]==='pr'){process.stdout.write(JSON.stringify([{name:'check',state:'SUCCESS',bucket:'pass'}]));process.exit(0);}
if(args[1]==='graphql'){const page={nodes:[],pageInfo:{hasNextPage:false}};process.stdout.write(JSON.stringify({data:{repository:{pullRequest:{headRefOid:s.pr.head.sha,author:{login:'acme-author'},reviewThreads:page,reviews:page,comments:page,labels:{nodes:[]},body:''}}}}));process.exit(0);}
const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';const raw=args.find(x=>/^\\/?repos\\//.test(x));const path=raw.startsWith('/')?raw:'/'+raw;const input=args.includes('--input')?JSON.parse(readFileSync(0,'utf8')):undefined;const r=respond(s,{method,path,body:input});writeFileSync(file,JSON.stringify(s));process.stdout.write((args.includes('--include')?'HTTP/2 '+r.status+' OK\\r\\ncontent-type: application/json\\r\\n\\r\\n':'')+JSON.stringify(r.data));\n`;
  await writeFile(gh,script,{mode:0o755});await mkdir(join(f.root,'.plates'));await writeFile(join(f.root,'.plates/plates.json'),JSON.stringify({plates:'self'}));
  const gitScript=`#!${process.execPath}
const {readFileSync,writeFileSync}=require('node:fs');const {createHash}=require('node:crypto');const assert=require('node:assert/strict');
const M=${JSON.stringify(M)},T=${JSON.stringify(T)},respond=${respond.toString()};
const file=${JSON.stringify(statePath)},s=JSON.parse(readFileSync(file)),args=process.argv.slice(2);
const command=args.find(a=>['init','check-ref-format','remote','fetch','rev-parse','hash-object','push'].includes(a));
try {
  if(command==='rev-parse')process.stdout.write(args.at(-1).endsWith('^{tree}')?T:args.at(-1).split('^')[0]);
  else if(command==='hash-object'){const b=readFileSync(0);process.stdout.write(createHash('sha1').update('commit '+b.length+'\\0').update(b).digest('hex'));}
  else if(command==='push'){
    assert.ok(args.includes('--force-with-lease=refs/heads/main:'+s.pr.base.sha));
    const sha=args.at(-1).split(':')[0];respond(s,{method:'PUT',path:'/repos/acme/example/pulls/7/merge',body:{sha:s.pr.head.sha}});s.pr.merge_commit_sha=sha;
    s.calls.push({method:'GIT',path:'lease-push',sha,base:s.pr.base.sha});
  }else if(!command)throw Error('unexpected Git command');
}finally{writeFileSync(file,JSON.stringify(s));}
`;
  await writeFile(join(f.root,'git'),gitScript,{mode:0o755});
  const env={...process.env,PLATES_GH:gh,PATH:f.root+':'+process.env.PATH};
  const p=run(process.execPath,[BIN,'fleet','update','--install','acme/example#7','--json'],{cwd:f.root,env});assert.equal(p.status,3,p.stdout+p.stderr);
  const preview=JSON.parse(p.stdout),r=run(process.execPath,[BIN,'fleet','update','--install','acme/example#7','--yes','--digest',preview.digest,'--json'],{cwd:f.root,env});
  assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).installation.state,'installed');
  assert.equal((await installationGithub(env)({method:'GET',path:'/repos/acme/example'})).data.id,1);
});
test('CLI rejects install/recover ambiguity and observation publication',()=>{
  for(const args of [ ['fleet','update','--install','acme/example#7','--yes'],['fleet','update','--recover','install-x','--yes'],['fleet','update','--install','acme/example#7','--rehearse'],...['--send','--card','--yes'].map(flag=>['morning','--observation',flag])]){
    const r=run(process.execPath,[BIN,...args,'--json'],{cwd:ROOT,env:{...process.env,PLATES_GH:'/no-gh'}});assert.equal(r.status,2,r.stdout+r.stderr);
  }
});

async function replacementFixture(t) {
  const f=await fixture(t),s=f.state,oldPath='.github/workflows/keel-night.yml',newPath='.github/workflows/plates-night.yml';
  const config='.plates/plates.json',lock='.plates/lock.json',cfg=JSON.parse(s.head[config]);cfg.practices=['base','agents-md','ci','night'];
  const practices=await load(),target=practices.get('night').files.find(f=>f.path===newPath),text=fill(target.template,cfg,newPath);
  const old=text.replace('group: plates-night','group: keel-night');assert.notEqual(old,text);
  s.base[W]=s.head[W];s.base[config]=JSON.stringify({...cfg,practice:'0.0.1'});s.head[config]=JSON.stringify(cfg);
  s.base[oldPath]=old;s.head[newPath]=text;
  s.base[lock]=JSON.stringify({practice:'0.0.1',files:{[oldPath]:{practice:'night',sha256:hash(old)}}});
  s.head[lock]=JSON.stringify({practice:practiceVersion(),files:{[newPath]:{practice:'night',sha256:hash(text)}}});
  s.pr.changed_files=4;s.inventory.push({id:12,path:oldPath,state:'active'});s.deleteWorkflow=12;s.registerWorkflow={id:13,path:newPath,state:'active'};
  return {...f,oldPath,newPath};
}
test('production preview reaches explicit replacement mapping and restores new ID after old ID deletion',async t=>{
  const f=await replacementFixture(t),p=await f.preview();assert.equal(p.data.barrier.length,1);assert.equal(p.data.barrier[0].oldId,12);assert.equal(p.data.barrier[0].newId,null);
  const r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  assert.ok(!f.state.inventory.some(w=>w.id===12));assert.equal(f.state.inventory.find(w=>w.id===13).state,'active');
  assert.deepEqual(mutations(f).map(c=>c.path),['/repos/acme/example/actions/workflows/12/disable','/repos/acme/example/pulls/7/merge']);
  assert.ok(r.data.installation.identities.some(f=>f.absent&&f.path==='.github/workflows/keel-night.yml'));
});
test('missing post-merge new registration retains original installation and restoration obligation',async t=>{
  const f=await replacementFixture(t);f.state.registerWorkflow=null;const p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.data.state,'installed-restoration-pending');assert.match(r.data.problem,/registration unavailable/);
});
test('replacement active new identity refuses before pause',async t=>{
  const f=await replacementFixture(t);f.state.inventory.push({id:13,path:f.newPath,state:'active'});await assert.rejects(f.preview(),/already be disabled/);assert.equal(mutations(f).length,0);
});
test('replacement drains new-ID runs too',async t=>{
  const f=await replacementFixture(t);f.state.inventory.push({id:13,path:f.newPath,state:'disabled_manually'});f.state.registerWorkflow=null;f.state.runs=[{id:71,workflow_id:13,status:'waiting',head_branch:'other'}];const p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);assert.match(r.data.problem,/drain pending/);assert.equal(mutations(f).length,1);
});

test('replacement recovery verifies original merge and exact new ID without repeating merge',async t=>{
  const f=await replacementFixture(t),p=await f.preview();f.state.fault='merge-after';const r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);
  f.state.fault=null;const recovered=await f.recover(r.data.operationId);assert.equal(recovered.exitCode,0,recovered.data.problem);assert.equal(mutations(f).filter(c=>c.path.endsWith('/merge')).length,1);assert.equal(f.state.inventory.find(w=>w.id===13).state,'active');
});
test('base racing merge refuses installation and retains restore obligation',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();f.state.mergeParents=[{sha:'d'.repeat(40)},{sha:B}];const r=await f.apply(p.data.digest);
  assert.equal(r.exitCode,1);assert.match(r.data.problem,/conditional base lease/);assert.equal(f.state.merged,false);assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,0);
});
test('permission changes during uncertain merge require fresh authority before restore',async t=>{
  const f=await fixture(t,{barrier:true}),p=await f.preview();f.state.fault='merge-after';const r=await f.apply(p.data.digest);
  f.state.fault=null;f.state.meta.permissions.push=false;const recovered=await f.recover(r.data.operationId);assert.match(recovered.data.problem,/permission/);assert.equal(mutations(f).filter(c=>c.path.endsWith('/enable')).length,0);
});
test('foreign summary cannot grant an operation and symlink receipt refuses',async t=>{
  const f=await fixture(t),p=await f.preview();const r=await f.apply(p.data.digest);const path=join(f.root,'.plates/update/operations',`${r.data.operationId}.json`);
  const copy=join(f.root,'copy.json');await writeFile(copy,await readFile(path));await rm(path);await symlink(copy,path);
  await assert.rejects(f.recover(r.data.operationId),/unsafe installation receipt/);
});
test('changed facts cannot create a replacement operation after an uncertain merge',async t=>{
  const f=await fixture(t),p=await f.preview();f.state.fault='merge-before';const r=await f.apply(p.data.digest);assert.equal(r.exitCode,1);
  f.state.fault=null;f.state.checks[0].id++;const next=await f.preview();assert.notEqual(next.data.digest,p.data.digest);
  await assert.rejects(f.apply(next.data.digest),/original operation exists/);assert.equal(mutations(f).length,1);
});

test('successful configured gate allows unrelated skipped and neutral checks',async t=>{
  const f=await fixture(t);for(const [i,conclusion] of ['skipped','neutral'].entries())f.state.checks.push({id:21+i,name:`optional-${i}`,head_sha:B,status:'completed',conclusion});
  const p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
});
test('newly registered disabled workflow is bound to reviewed bytes before enable',async t=>{
  const f=await replacementFixture(t);f.state.registerWorkflow.state='disabled_manually';const p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  assert.equal(r.data.continuation.registeredMappings[f.newPath].id,13);assert.equal(mutations(f).at(-1).path,'/repos/acme/example/actions/workflows/13/enable');
});
test('replacement of previously disabled workflow with unregistered new ID refuses',async t=>{
  const f=await replacementFixture(t);f.state.inventory.find(w=>w.id===12).state='disabled_manually';await assert.rejects(f.preview(),/cannot preserve a disabled prior state/);await assert.rejects(f.apply('a'.repeat(64)),/cannot preserve a disabled prior state/);assert.equal(mutations(f).length,0);
});

test('recovery of completed operation cannot hide subsequently changed workflow state',async t=>{
  const f=await fixture(t,{barrier:true,disabled:true}),p=await f.preview(),r=await f.apply(p.data.digest);assert.equal(r.exitCode,0,r.data.problem);
  f.state.inventory[0].state='active';const recovered=await f.recover(r.data.operationId);assert.equal(recovered.exitCode,1);assert.equal(recovered.data.state,'installed-restoration-pending');assert.match(recovered.data.problem,/restored workflow state/);assert.equal(mutations(f).length,1);
});

test('changed head with fresh checks and review cannot reuse earlier approval',async t=>{
  const f=await fixture(t),p=await f.preview(),next='d'.repeat(40);f.state.pr.head.sha=next;f.state.checks[0].head_sha=next;f.state.gate[0].head_sha=next;f.state.gate[0].pull_requests[0].head.sha=next;f.state.reviews[0].commit_id=next;
  await assert.rejects(f.apply(p.data.digest),/preview changed/);assert.equal(mutations(f).length,0);
});
