import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from './helpers/run.mjs';
import {improve} from '../practices/night/files/scripts/plates/improve.mjs';
import {finalize,brief} from '../practices/night/files/scripts/plates/morning.mjs';
import {publishDefault} from '../practices/night/files/scripts/plates/night-plan.mjs';
import {namesPreimage,namesDigest,formatVerification} from '../practices/night/files/scripts/plates/verification.mjs';
import {mergeHealthPage} from '../practices/night/files/scripts/plates/time-proposals.mjs';
import {board} from '../lib/board.mjs';
const date='2026-10-05',context={repositoryId:7},env={CI:'true',PLATES_GH:'/usr/bin/false'};
const git=(root,...args)=>{const r=run('git',args,{cwd:root});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const plan=()=>({schema:1,date,shapedBy:'default',readyBy:null,willNotTouch:[],settledToday:[],leftOpen:[],items:[]});
async function fixture(t,{night=true}={}) {
 const dir=await mkdtemp(join(tmpdir(),'acme-names-regions-'));t.after(()=>rm(dir,{recursive:true,force:true}));const root=join(dir,'project'),remote=join(dir,'origin.git');
 await mkdir(join(root,'.plates'),{recursive:true});await writeFile(join(root,'.plates/plates.json'),JSON.stringify({name:'Acme',repo:'acme/anvils',practices:night?['night']:[],health:'docs/health'}));
 await writeFile(join(root,'.gitignore'),'.plates/night/plan.json\n');git(dir,'init','--bare','-q','-b','main',remote);git(root,'init','-q','-b','main');git(root,'remote','add','origin',remote);git(root,'add','.');git(root,'commit','-qm','Acme config');git(root,'push','-q','origin','main');return root;
}
const options={env,measures:[],verificationRead:async()=>{throw Error('Acme unavailable provider');}};
for(const night of [false,true]) test(`improve plan applicability ${night?'managed night':'standalone'} does not invent missing output`,async t=>{
 const root=await fixture(t,{night});const result=await improve({root,report:true,date,namesEvidence:context},options),o=result.data.observation;
 assert.deepEqual(o.writes.map(w=>w.role).sort(),['bounds','health-report']);
 assert.equal(o.gaps.some(g=>g.code==='night-plan-output-unavailable'),night);
 for(const w of o.writes){assert.equal(w.before.state,'absent');assert.equal(w.before.commitSha,git(root,'rev-parse','HEAD'));assert.equal(w.before.blobSha,null);assert.equal(w.after.commitSha,null);}
});
test('immutable preimage capture separates exact bytes, absence, dirty bytes and missing Git',async t=>{
 const root=await fixture(t),path='.plates/plates.json',text=await readFile(join(root,path),'utf8');
 const exact=namesPreimage(root,path,text);assert.equal(exact.commitSha,git(root,'rev-parse','HEAD'));assert.equal(exact.blobSha,git(root,'rev-parse',`HEAD:${path}`));assert.equal(exact.sha256,namesDigest(text));
 assert.equal(namesPreimage(root,path,text+' '),null);assert.equal(namesPreimage(root,path,null),null);
 assert.equal(namesPreimage(root,'missing.json',null).state,'absent');
 assert.equal(namesPreimage(join(root,'..'),'missing.json',null),null);
 assert.equal(namesPreimage(root,path,text,{commitSha:'f'.repeat(40)}),null);
});
test('actual night to morning to board preserves verified history and pairs complete plan bytes',async t=>{
 const root=await fixture(t);await mkdir(join(root,'.plates/night'),{recursive:true});await writeFile(join(root,'.plates/night/plan.json'),JSON.stringify(plan()));
 const first=await improve({root,report:true,date},options);const page=`docs/health/${date}.md`,record=`docs/night/${date}.json`;
 const oldRecord=formatVerification(first.data.verification),proposal='## Proposal\n\nAcme retained keel:historical-label\n';
 const historical=mergeHealthPage({generated:'# Acme historical report\n'+oldRecord+'\n'+proposal});assert.deepEqual(historical.problems,[]);
 await writeFile(join(root,page),historical.text);git(root,'add','.plates/bounds.json','docs');git(root,'commit','-qm','Acme immutable history');const preimage=git(root,'rev-parse','HEAD');
 const result=await improve({root,report:true,date,namesEvidence:context},{...options,env:{...env,PLATES_NIGHT_RECOVERY:'1'}}),writes=result.data.observation.writes;
 assert.deepEqual(writes.map(w=>w.role).sort(),['bounds','health-report','night-record','working-plan']);
 assert.equal(git(root,'branch','--show-current'),'main');assert.ok(writes.every(w=>w.target.ref===`refs/heads/${result.data.nightRecovery.branch}`));
 const health=writes.find(w=>w.role==='health-report'),working=writes.find(w=>w.role==='working-plan'),published=writes.find(w=>w.role==='night-record');
 assert.equal(health.before.commitSha,preimage);assert.equal(health.before.sha256,namesDigest(historical.text));assert.equal(health.before.blobSha,git(root,'rev-parse',`${preimage}:${page}`));
 assert.equal(working.before,null);assert.equal(working.after.commitSha,null);assert.equal(working.intended.sha256,published.intended.sha256);assert.equal(working.after.sha256,published.after.sha256);
 const after=await readFile(join(root,page),'utf8');assert.ok(after.includes(oldRecord));assert.ok(after.includes(proposal));assert.equal(health.after.sha256,namesDigest(after));assert.ok(!JSON.stringify(result.data.observation.fragments).includes('Acme retained'));
 const publication=await publishDefault({root,date,namesEvidence:context});assert.equal(publication.observation.writes[0].role,'plan-publication');
 git(root,'checkout','-q','-b',result.data.nightRecovery.branch);git(root,'add','.plates/bounds.json','docs');git(root,'commit','-qm','Acme night publication');git(root,'push','-q','origin',`plates-night/${date}`);const nightHead=git(root,'rev-parse','HEAD');
 await rm(join(root,'.plates/night/plan.json'));git(root,'checkout','-q','-b',`plates-night/${date}-final`);
 const morning=await finalize({root,date,namesEvidence:context});assert.deepEqual(morning.data.observation.writes.map(w=>w.role),['night-record','health-plan-section']);
 for(const w of morning.data.observation.writes)assert.equal(w.before.commitSha,nightHead);
 const retained=await readFile(join(root,page),'utf8');assert.ok(retained.includes(oldRecord));assert.ok(retained.includes(proposal));
 const b=await brief({root,date,namesEvidence:context});assert.equal(b.data.observation.producerId,'brief');
 const view=await board({root,namesEvidence:context},{env,today:date,now:`${date}T12:00:00Z`,roadmap:async()=>({phases:[]}),looseEnds:async()=>({projects:[]}),reviews:async()=>({items:[],failed:[],skipped:[]})});
 assert.equal(view.nightPlan.date,date);assert.ok(view.observation.reads.some(r=>r.sourceKind==='plan'&&r.state==='read'&&r.commitSha===nightHead));
});
test('dirty final health preimage remains an explicit gap, never attributed to checkout HEAD',async t=>{
 const root=await fixture(t),record=`docs/night/${date}.json`,page=`docs/health/${date}.md`;await mkdir(join(root,'docs/night'),{recursive:true});await mkdir(join(root,'docs/health'),{recursive:true});await writeFile(join(root,record),JSON.stringify(plan()));await writeFile(join(root,page),'Acme committed\n');git(root,'add','docs');git(root,'commit','-qm','Acme original');await writeFile(join(root,page),'Acme uncommitted owner edit\n');
 const result=await finalize({root,date,namesEvidence:context}),o=result.data.observation,w=o.writes.find(w=>w.role==='health-plan-section');assert.equal(w.before,null);assert.ok(o.gaps.some(g=>g.code==='preimage-unavailable-health-plan-section'));assert.ok((await readFile(join(root,page),'utf8')).includes('Acme uncommitted owner edit'));
});

for(const alias of ['plates','keel']) test(`recovered ${alias} health preimage binds original publication rather than execution HEAD`,async t=>{
 const root=await fixture(t),page=`docs/health/${date}.md`,execution=git(root,'rev-parse','HEAD');
 git(root,'checkout','-q','-b',`${alias}-night/${date}`);
 const first=await improve({root,report:true,date},options);const original=await readFile(join(root,page),'utf8');
 git(root,'add','.plates/bounds.json','docs');git(root,'commit','-qm','Acme prior night');const previous=git(root,'rev-parse','HEAD'),blob=git(root,'rev-parse',`HEAD:${page}`);git(root,'push','-q','origin',`${alias}-night/${date}`);git(root,'checkout','-q','main');
 assert.equal(git(root,'rev-parse','HEAD'),execution);
 let result;await assert.doesNotReject(async()=>{result=await improve({root,report:true,date,namesEvidence:context},{...options,env:{...env,PLATES_NIGHT_RECOVERY:'1'}});},'recover original branch evidence');
 const health=result.data.observation.writes.find(w=>w.role==='health-report');assert.equal(health.before.commitSha,previous);assert.notEqual(health.before.commitSha,execution);assert.equal(health.before.blobSha,blob);assert.equal(health.before.sha256,namesDigest(original));
 assert.ok((await readFile(join(root,page),'utf8')).includes(formatVerification(first.data.verification)));
});
