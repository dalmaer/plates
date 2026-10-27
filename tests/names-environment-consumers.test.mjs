import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {cacheDir as reviewCache} from '../lib/review.mjs';
import {cacheDir as quotaCache,quotaFloor} from '../practices/night/files/scripts/plates/quota.mjs';
import {claudeDir} from '../lib/looseends.mjs';
import {selfUpdate} from '../lib/update.mjs';
import {templateAt} from '../lib/taken.mjs';
import {shapeOf} from '../practices/night/files/scripts/plates/stalls.mjs';
import {providerOf,sessionOf} from '../lib/claim.mjs';
import {timedCommand} from '../practices/night/files/scripts/plates/test-ledger.mjs';
import {readReceiptPlan} from '../practices/night/files/scripts/plates/time-receipts.mjs';
const own=(alias,suffix,value)=>({[`${alias}_${suffix}`]:value});
const conflict=fn=>assert.throws(fn,e=>e.code==='conflicting_names'&&!e.message.includes('private-one')&&!e.message.includes('private-two'));
for(const alias of ['PLATES','KEEL']) {
 test(`environment CACHE ${alias} reaches review cache`,()=>assert.equal(reviewCache(own(alias,'CACHE','/acme-cache')),'/acme-cache'));
 test(`environment CACHE ${alias} reaches quota cache`,()=>assert.equal(quotaCache(own(alias,'CACHE','/acme-cache')),'/acme-cache'));
 test(`environment CLAUDE_DIR ${alias} reaches transcript root`,()=>assert.equal(claudeDir(own(alias,'CLAUDE_DIR','/acme-transcripts')),'/acme-transcripts'));
 test(`environment QUOTA_FLOOR ${alias} reaches optional-read threshold`,()=>assert.equal(quotaFloor(own(alias,'QUOTA_FLOOR','4321')),4321));
 test(`environment SELF_UPDATED ${alias} prevents repeated updater`,()=>assert.equal(selfUpdate({cliRoot:'/acme-nonexistent',env:own(alias,'SELF_UPDATED','1')}).state,'skipped'));
 test(`environment PREVIOUS_PRACTICES ${alias} reads original template`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'plates-env-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'practices/acme/files'),{recursive:true});await writeFile(join(root,'practices/acme/files/sample'),'Acme original template');
  assert.equal(templateAt('0.0.0',{practice:'acme',from:'sample'},own(alias,'PREVIOUS_PRACTICES',root)),'Acme original template');
 });
 test(`environment STALLS_SHAPE ${alias} validates runner shape`,()=>assert.throws(()=>shapeOf(own(alias,'STALLS_SHAPE','invalid-json')),/not JSON/));
 test(`identity PROVIDER ${alias} reaches claim provider`,()=>assert.equal(providerOf(own(alias,'PROVIDER','acme-provider')),'acme-provider'));
 test(`identity SESSION ${alias} reaches claim session`,()=>assert.equal(sessionOf(own(alias,'SESSION','acme-session')),'acme-session'));
}
test('ordinary current presence does not fall back to legacy and unknown aliases are inert',()=>{
 assert.notEqual(reviewCache({PLATES_CACHE:'',KEEL_CACHE:'/legacy'}),'/legacy');
 assert.equal(claudeDir({PLATES_CLAUDE_DIR:'/current',KEEL_CLAUDE_DIR:'/legacy'}),'/current');
 assert.throws(()=>shapeOf({PLATES_STALLS_SHAPE:'invalid',KEEL_STALLS_SHAPE:'{}'}),/not JSON/);
 assert.notEqual(reviewCache({KEEL_UNKNOWN_CACHE:'/unknown'}),'/unknown');
});
test('claim conflicts refuse before provider override or session attribution',()=>{
 conflict(()=>providerOf({PLATES_PROVIDER:'private-one',KEEL_PROVIDER:'private-two'},'codex'));
 conflict(()=>sessionOf({PLATES_SESSION:'private-one',KEEL_SESSION:'private-two'}));
 assert.throws(()=>providerOf({PLATES_PROVIDER:'INVALID!',KEEL_PROVIDER:'codex'}));
 assert.equal(providerOf({PLATES_PROVIDER:'codex',KEEL_PROVIDER:'codex'}),'codex');
});
for(const suffix of ['USUAL','GATE_ACTIVE','GATE_INVOCATION','SUITE_PLAN','RUN_START']) test(`ledger ${suffix} conflicts refuse before executing child`,async()=>{
 await assert.rejects(timedCommand('exit 0',{cwd:'/acme-nonexistent',env:{[`PLATES_${suffix}`]:'private-one',[`KEEL_${suffix}`]:'private-two'}}),e=>e.code==='conflicting_names');
});
test('receipt plan conflicts refuse before malformed input becomes missing',async()=>{
 await assert.rejects(readReceiptPlan({PLATES_SUITE_PLAN:'private-one',KEEL_SUITE_PLAN:'private-two'}),e=>e.code==='conflicting_names');
});

import {chmod,readFile} from 'node:fs/promises';
import {verificationGit} from '../practices/night/files/scripts/plates/verification.mjs';
import {adoptionCost} from '../lib/ci-adoption.mjs';
import {survey} from '../lib/adopt.mjs';
import {load} from '../lib/practices.mjs';
import {MEASURES} from '../practices/night/files/scripts/plates/improve.mjs';
import {looseEndsOf} from '../scripts/plates/tend.mjs';
import {measureIn} from '../scripts/plates/climb.mjs';
async function sandbox(t){const root=await mkdtemp(join(tmpdir(),'plates-bindings-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'.plates'));await writeFile(join(root,'.plates/plates.json'),JSON.stringify({repo:'acme/anvils',name:'Acme',practices:[]}));return root;}
async function executable(root,name,source){const path=join(root,name);await writeFile(path,`#!${process.execPath}\n${source}\n`);await chmod(path,0o755);return path;}
for(const alias of ['PLATES','KEEL']) {
 test(`environment GIT ${alias} reaches verification identity read`,async t=>{
  const root=await sandbox(t),sha='a'.repeat(40),bin=await executable(root,'git-fixture',`if(process.argv.includes('rev-parse'))console.log('${sha}');`);
  assert.deepEqual(await verificationGit({root,env:own(alias,'GIT',bin)}),{sha,dirty:false});
 });
 test(`environment CI_OFFLINE ${alias} suppresses provider transport`,async t=>{
  const root=await sandbox(t),called=join(root,'called'),bin=await executable(root,'gh-fixture',`require('node:fs').writeFileSync(${JSON.stringify(called)},'called');process.exit(1);`);
  await adoptionCost({root,config:{repo:'acme/anvils'},workflows:[{path:'.github/workflows/acme.yml',triggers:{}}],env:{PLATES_GH:bin,...own(alias,'CI_OFFLINE','1')}});
  await assert.rejects(readFile(called),{code:'ENOENT'});
 });
 test(`environment MILESTONES_OFFLINE ${alias} preserves offline survey`,async t=>{
  const root=await sandbox(t),bin=await executable(root,'gh-fixture','process.exit(1);');
  const result=await survey(root,{version:'1.0.0',practices:await load(),discoverMilestones:true,sourceEnv:{PLATES_GH:bin,...own(alias,'MILESTONES_OFFLINE','1')}});
  assert.equal(result.milestoneDiscovery.why,'milestone discovery is offline');
 });
 test(`environment NPM ${alias} reaches dependency measurement`,async t=>{
  const root=await sandbox(t);await writeFile(join(root,'package-lock.json'),'{}');
  const bin=await executable(root,'npm-fixture',`console.log(JSON.stringify({acme:{current:'1.0.0',wanted:'1.0.1',latest:'2.0.0'}}));`);
  let result;
  await assert.doesNotReject(async()=>{ result=await MEASURES.find(m=>m.id==='dependency_age').run({root,env:{PATH:'/acme-no-default-tools',...own(alias,'NPM',bin)}}); });
  assert.equal(result.value,1);
 });
 test(`environment CLI ${alias} reaches tend loose-ends command`,async t=>{
  const root=await sandbox(t);const bin=await executable(root,'plates-fixture',`console.log(JSON.stringify({projects:[{repo:'acme/anvils',dir:${JSON.stringify(root)},items:[]}]}));`);
  const result=await looseEndsOf(root,{repo:'acme/anvils'},{PATH:'/acme-no-default-tools',...own(alias,'CLI',bin)});
  assert.equal(result.state,'ok');
 });
 test(`environment CLIMB_CLOCK ${alias} reaches measured clock`,async t=>{
  const root=await sandbox(t),clock=join(root,'clock'),bin=await executable(root,'test-fixture',`require('node:fs').writeFileSync(${JSON.stringify(clock)},'4321');`);
  const result=measureIn(root,{config:{check:bin,climb:{testCommand:bin}},job:'test-time',runs:1,env:own(alias,'CLIMB_CLOCK',clock)});
  assert.equal(result.median,4321);
 });
}

import {ignoredInputs} from '../lib/prove.mjs';
import {canvas} from '../lib/canvas.mjs';
for(const alias of ['PLATES','KEEL']) {
 test(`environment ISOCAN ${alias} validates selected executable at canvas doorway`,async t=>{
  const root=await sandbox(t);
  const result=await canvas({root,args:['status'],env:own(alias,'ISOCAN','')});
  assert.match(JSON.stringify(result),/Invalid isocan executable/);
 });
 test(`environment PROVE_IGNORED_BYTES ${alias} bounds actual ignored input`,async t=>{
  const root=await sandbox(t);execFileSync('git',['init','-q',root]);await writeFile(join(root,'.gitignore'),'acme.txt\n');await writeFile(join(root,'acme.txt'),'123456');
  const saved={PLATES_PROVE_IGNORED_BYTES:process.env.PLATES_PROVE_IGNORED_BYTES,KEEL_PROVE_IGNORED_BYTES:process.env.KEEL_PROVE_IGNORED_BYTES};
  delete process.env.PLATES_PROVE_IGNORED_BYTES;delete process.env.KEEL_PROVE_IGNORED_BYTES;process.env[`${alias}_PROVE_IGNORED_BYTES`]='3';
  try{await assert.rejects(ignoredInputs(root),/more than 3 bytes/);}finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
 });
}

for (const alias of ['PLATES', 'KEEL']) test(`environment STITCH ${alias} reaches actual Loop pull`, async t => {
  const { main } = await import('../practices/loop/files/scripts/loop.mjs');
  const root = await sandbox(t), bin = await executable(root, 'stitch-fixture', `console.log(JSON.stringify({data:{items:[]}}));`);
  await mkdir(join(root,'docs'),{recursive:true});
  const errors = [];
  const exit = await main(['pull','--no-render','--no-prove','--json'], { root,
    env: { PATH:'/acme-no-default-tools', STITCH_WORKSPACE:'acme', ...own(alias,'STITCH',bin) },
    log:()=>{}, err:value=>errors.push(value) });
  assert.equal(exit, 0, errors.join('\n'));
});

for (const alias of ['PLATES','KEEL']) test(`environment DRAIN_WAIT_MS ${alias} drives mergeability retry delay`,async t=>{
  const {drain}=await import('../practices/night/files/scripts/plates/drain.mjs');
  const root=await sandbox(t), waits=[];
  const bin=await executable(root,'gh-fixture',`console.log(JSON.stringify([{number:1,headRefName:'plates-night/acme',mergeable:'UNKNOWN',isCrossRepository:false,createdAt:'2026-10-24T00:00:00Z',files:[]}]));`);
  t.mock.method(globalThis,'setTimeout',(fn,ms)=>{waits.push(ms);queueMicrotask(fn);return 0;});
  const result=await drain({root,prefix:'plates-night/',yes:false},{env:{PLATES_GH:bin,...own(alias,'DRAIN_WAIT_MS','23')}});
  assert.deepEqual(waits,[23]);assert.equal(result.data.newest,1);
});
for (const alias of ['PLATES','KEEL']) test(`identity SUITE_PLAN ${alias} preserves original receipt plan`,async t=>{
  const {nodePlan,readReceiptPlan}=await import('../practices/night/files/scripts/plates/time-receipts.mjs');
  const root=await sandbox(t);await mkdir(join(root,'tests'));await writeFile(join(root,'tests/acme.test.mjs'),'');
  const plan=await nodePlan({root,script:'node --test tests/acme.test.mjs',words:s=>s.split(' '),flags:words=>words.filter(s=>s.startsWith('--')).map(s=>({words:[s]}))});
  assert.equal(plan.available,true);
  assert.deepEqual(await readReceiptPlan(own(alias,'SUITE_PLAN',JSON.stringify(plan))),plan);
});
