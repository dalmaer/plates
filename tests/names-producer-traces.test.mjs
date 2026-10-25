import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {finalPlan,readVerify,finalize,decide,parseArgs} from '../practices/night/files/scripts/plates/morning.mjs';
import {publishDefault,planSection} from '../practices/night/files/scripts/plates/night-plan.mjs';
import {namesDigest} from '../practices/night/files/scripts/plates/verification.mjs';
const day='2026-10-05', context={repositoryId:7};
const plan=status=>({schema:1,date:day,shapedBy:'default',readyBy:null,willNotTouch:[],settledToday:[],leftOpen:[],items:[{id:'measures',title:'Private Acme measure title',kind:'measure',source:'default',lane:'night',number:null,budget:null,status,result:null}]});
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'plates-producer-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'acme'),remote=join(dir,'origin.git');await mkdir(join(root,'.plates'),{recursive:true});
 git(dir,'init','--bare','-q','-b','main',remote);git(root,'init','-q','-b','main');git(root,'remote','add','origin',remote);
 await writeFile(join(root,'.plates/plates.json'),JSON.stringify({repo:'acme/anvils',practices:['night']}));
 git(root,'add','.');git(root,'commit','-qm','Acme initial');git(root,'push','-q','origin','main');
 return root;
}
async function branch(root,name,path,text){
 git(root,'checkout','-q','-B',name,'main');await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);
 git(root,'add','-f',path);git(root,'commit','-qm','Acme source');const commit=git(root,'rev-parse','HEAD'),blob=git(root,'rev-parse',`HEAD:${path}`);
 git(root,'push','-q','origin',name);git(root,'checkout','-q','main');return {commit,blob};
}
for(const alias of ['plates','keel']) {
 test(`plan evidence consumes ${alias} alias and pins actual output`,async t=>{
  const root=await fixture(t),path=alias==='plates'?'.plates/night/plan.json':'.keel/night/plan.json';
  const text=JSON.stringify(plan('done'));const pinned=await branch(root,`${alias}-night-plan`,path,text);
  const result=await finalPlan({root,date:day,namesEvidence:context});
  assert.ok(result.plan,'selected alias must supply the plan');
  assert.equal(result.plan.items[0].status,'done');
  const read=result.observation.reads.find(r=>r.ref===`refs/heads/${alias}-night-plan`);
  assert.equal(read.state,'read');assert.equal(read.selected,true);assert.equal(read.contributed,true);
  assert.equal(read.commitSha,pinned.commit);assert.equal(read.blobSha,pinned.blob);assert.equal(read.sha256,namesDigest(text));
  const projection=JSON.parse(result.observation.fragments.find(f=>f.path===read.outputProjection.fragment).text);
  assert.deepEqual(projection,{date:day,items:[{id:'measures',kind:'measure',status:'done'}]});
  assert.equal(result.observation.reads.find(r=>r.ref===`refs/heads/${alias==='plates'?'keel':'plates'}-night-plan`).absence,'ref');
  assert.ok(!JSON.stringify(result.observation.fragments).includes('Private'));
 });
 test(`verify evidence consumes ${alias} alias and pins actual output`,async t=>{
  const root=await fixture(t);const item={sha:'a'.repeat(40),ok:false,at:'2026-10-04T12:00:00Z',failures:['Private Acme failure'],site:'https://acme.test'};
  const text=JSON.stringify({results:[item]});const pinned=await branch(root,`${alias}-verify`,'verify.json',text);
  const result=readVerify(root,{namesEvidence:context});assert.equal(result.results.length,1);
  const read=result.observation.reads.find(r=>r.ref===`refs/heads/${alias}-verify`);
  assert.equal(read.state,'read');assert.equal(read.contributed,true);assert.equal(read.commitSha,pinned.commit);assert.equal(read.blobSha,pinned.blob);
  assert.ok(!JSON.stringify(result.observation.fragments).includes('Private'));
 });
}
test('dirty working plan remains actual input but cannot claim immutable provenance',async t=>{
 const root=await fixture(t);await mkdir(join(root,'.plates/night'),{recursive:true});await writeFile(join(root,'.plates/night/plan.json'),JSON.stringify(plan('done')));
 const result=await finalPlan({root,date:day,namesEvidence:context});assert.equal(result.plan.items[0].status,'done');
 const read=result.observation.reads.find(r=>r.ref==='HEAD'&&r.path==='.plates/night/plan.json');
 assert.equal(read.state,'unavailable');assert.equal(read.selected,false);assert.ok(result.observation.gaps.length);
});
test('publication retains confirmed pinned blob and subsequent same-night no-change identity',async t=>{
 const root=await fixture(t);await mkdir(join(root,'.plates/night'),{recursive:true});await writeFile(join(root,'.plates/night/plan.json'),JSON.stringify(plan('planned')));
 const first=await publishDefault({root,date:day,namesEvidence:context});assert.equal(first.written,true);
 const write=first.observation.writes[0];assert.equal(write.outcome,'confirmed');assert.equal(write.after.commitSha,first.commit);assert.equal(write.intended.sha256,write.after.sha256);
 const second=await publishDefault({root,date:day,namesEvidence:context});assert.equal(second.written,false);assert.equal(second.observation.writes[0].outcome,'no-change');assert.equal(second.observation.writes[0].after.blobSha,write.after.blobSha);
});
test('decide explicit date preserves originating night instead of current clock',async t=>{
 const root=await fixture(t);const result=await decide({root,date:day,now:new Date('2026-10-25T10:00:00Z')});assert.equal(result.data.day,day);
 assert.equal(parseArgs(['decide','--date',day]).date,day);
});
for(const wrapper of ['none','KEEL','PLATES']) test(`finalization observation preserves ${wrapper} outside bytes and hashes actual write`,async t=>{
 const root=await fixture(t);const path=`docs/health/${day}.md`;
 const beforeSection=planSection(plan('planned'),{record:`docs/night/${day}.json`}).join('\n');
 const body=`${beforeSection}\n## Proposal\nPrivate Acme retained proposal\n`;
 const wrap=text=>wrapper==='none'?`Private Acme prefix\n${text}Private Acme suffix\n`:`Private Acme prefix\n<!-- ${wrapper.toLowerCase()}:health-report:begin ${namesDigest(text)} -->\n${text}\n<!-- ${wrapper.toLowerCase()}:health-report:end -->\nPrivate Acme suffix\n`;
 const before=wrap(body);
 await mkdir(join(root,'docs/health'),{recursive:true});await writeFile(join(root,path),before);git(root,'add','.');git(root,'commit','-qm','Acme health');
 await branch(root,'plates-night-plan','.plates/night/plan.json',JSON.stringify(plan('done')));
 const result=await finalize({root,date:day,namesEvidence:context});
 const after=await readFile(join(root,path),'utf8');
 const expectedBody=body.replace(beforeSection,planSection(plan('done'),{record:`docs/night/${day}.json`}).join('\n'));
 assert.equal(after,wrap(expectedBody));
 const write=result.data.observation.writes.find(w=>w.target.path===path);
 assert.equal(write.before.sha256,namesDigest(before));assert.equal(write.intended.sha256,namesDigest(after));assert.equal(write.after.sha256,namesDigest(after));assert.equal(write.outcome,'confirmed');
 assert.ok(!JSON.stringify(result.data.observation.fragments).includes('Private'));
});

test('verify observation without origin retains both unavailable reads and referenced projection',async t=>{
 const root=await fixture(t);git(root,'remote','remove','origin');
 const result=readVerify(root,{namesEvidence:context});assert.match(result.unread,/no origin/);
 assert.deepEqual(result.observation.reads.map(r=>[r.ref,r.state,r.selected,r.contributed]),[
  ['refs/heads/plates-verify','unavailable',false,false],['refs/heads/keel-verify','unavailable',false,false],
 ]);
 assert.equal(result.observation.fragments.length,1);
 assert.ok(result.observation.reads.every(r=>r.outputProjection.fragment===result.observation.fragments[0].path));
});
