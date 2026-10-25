import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {send} from '../practices/night/files/scripts/plates/morning.mjs';
import {drain} from '../practices/night/files/scripts/plates/drain.mjs';
import {namesDigest} from '../practices/night/files/scripts/plates/verification.mjs';
const git=(root,...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'acme-producer-objects-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'.plates'),{recursive:true});
 await writeFile(join(root,'.plates/plates.json'),JSON.stringify({repo:'acme/anvils',practices:['night'],morning:{assignee:'acme-owner'}}));
 git(root,'init','-q','-b','main');git(root,'add','.');git(root,'commit','-qm','Acme');return root;
}
async function stub(root,code){const file=join(root,'acme-gh');await writeFile(file,`#!${process.execPath}\n${code}`);await chmod(file,0o755);return file;}
for(const mode of ['confirmed','mismatch','unavailable']) test(`morning issue observation ${mode} uses original actual issue and no retry`,async t=>{
 const root=await fixture(t),date='2026-10-05',state=join(root,'provider.json');
 const plan={schema:1,date,shapedBy:'default',readyBy:null,willNotTouch:[],settledToday:[],leftOpen:[],items:[{id:'measure',title:'Private Acme title',kind:'measure',source:'default',lane:'night',number:null,budget:null,status:'done',result:null}]};
 await mkdir(join(root,'docs/night'),{recursive:true});await writeFile(join(root,`docs/night/${date}.json`),JSON.stringify(plan));git(root,'add','.');git(root,'commit','-qm','Acme plan');
 await writeFile(state,JSON.stringify({creates:0}));
 const bin=await stub(root,`const fs=require('node:fs'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8'));const out=x=>console.log(JSON.stringify(x));
if(a[0]==='issue'&&a[1]==='list')out([]);
else if(a[0]==='api'&&a[1]==='/repos/acme/anvils')out({id:7,full_name:'acme/anvils'});
else if(a[0]==='api'&&a[1].includes('/labels?'))out([{id:71,name:'keel:morning'}]);
else if(a[0]==='issue'&&a[1]==='create'){s.creates++;s.body=fs.readFileSync(0,'utf8');fs.writeFileSync(${JSON.stringify(state)},JSON.stringify(s));console.log('https://github.com/acme/anvils/issues/9');}
else if(a[0]==='api'&&a[1]==='repos/acme/anvils/issues/9'){if(${JSON.stringify(mode)}==='unavailable')process.exit(1);out({id:91,number:9,body:${JSON.stringify(mode)}==='mismatch'?'Acme concurrent body':s.body,labels:[{id:71}],updated_at:'2026-10-06T00:00:00Z'});}
else {console.error('unexpected synthetic request '+a.join(' '));process.exit(1);}`);
 const result=await send({root,date,env:{PLATES_GH:bin},now:new Date('2026-10-06T00:00:00Z'),namesEvidence:{repositoryId:7}});
 const actual=JSON.parse(await readFile(state,'utf8')),write=result.data.observation.writes.find(w=>w.target.kind==='issue');
 assert.equal(actual.creates,1);assert.equal(write.target.number,9);assert.equal(write.target.repositoryId,7);
 assert.equal(write.intended.sha256,namesDigest(actual.body));
 assert.ok(!JSON.stringify(result.data.observation.fragments).includes('Private Acme title'));
 if(mode==='confirmed'){assert.equal(write.outcome,'confirmed');assert.equal(write.target.id,91);assert.equal(write.after.sha256,namesDigest(actual.body));assert.deepEqual(write.after.labelIds,[71]);}
 else {assert.equal(write.outcome,'attempted-unknown');assert.equal(write.after,null);assert.ok(result.data.observation.gaps.some(g=>g.code.startsWith('issue-readback-')));}
});
for(const available of [true,false]) test(`drain observation ${available?'complete':'unavailable'} queue uses actual action/readback`,async t=>{
 const root=await fixture(t),state=join(root,'queue.json');await writeFile(state,JSON.stringify({merged:false,mutations:0}));
 const bin=await stub(root,`const fs=require('node:fs'),a=process.argv.slice(2),s=JSON.parse(fs.readFileSync(${JSON.stringify(state)},'utf8'));const out=x=>console.log(JSON.stringify(x));const pr=n=>({id:70+n,number:n,state:n===1&&s.merged?'closed':'open',merged:n===1&&s.merged,mergeable:true,head:{ref:'plates-night/acme-'+n,sha:String(n).repeat(40)}});
if(a[0]==='pr'&&a[1]==='list')out([1,2].map(n=>({number:n,headRefName:'plates-night/acme-'+n,isCrossRepository:false,mergeable:'MERGEABLE',createdAt:'2026-10-0'+n+'T00:00:00Z',files:[{path:'docs/health/2026-10-01.md'}]})));
else if(a[0]==='api'&&a[1].includes('/pulls?')){if(!${available})process.exit(1);out((s.merged?[2]:[1,2]).map(pr));}
else if(a[0]==='pr'&&a[1]==='merge'){s.merged=true;s.mutations++;fs.writeFileSync(${JSON.stringify(state)},JSON.stringify(s));}
else if(a[0]==='api'&&a[1]==='repos/acme/anvils/pulls/1')out(pr(1));
else {console.error('unexpected synthetic request '+a.join(' '));process.exit(1);}`);
 const result=await drain({root,prefix:'plates-night/',yes:true,namesEvidence:{repositoryId:7}},{env:{PLATES_GH:bin}});
 const observation=result.data.observation,projection=JSON.parse(observation.fragments.find(f=>f.path===observation.projections[0].fragment).text);
 assert.equal(JSON.parse(await readFile(state,'utf8')).mutations,1);
 assert.ok(projection.actions.some(a=>a.number===1&&a.action==='merge'&&a.done));
 if(available){assert.deepEqual(projection.before.map(p=>p.id),[71,72]);assert.deepEqual(projection.after.map(p=>p.id),[72]);assert.deepEqual(observation.gaps,[]);}
 else {assert.equal(projection.before,null);assert.equal(projection.after,null);assert.ok(observation.gaps.some(g=>g.code==='queue-read-unavailable'));}
});
