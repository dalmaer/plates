import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { instrumentsFor } from '../scripts/plates/improve.mjs';
import { SHA, NOW, observation, results } from './helpers/verification.mjs';
import { assessVerification, verificationReceipt, formatVerification } from '../scripts/plates/verification.mjs';
import { fleet } from '../lib/fleet.mjs';
import { instruments } from '../lib/improve.mjs';

const expected = {repo:'acme/plate',branch:'trunk',sha:SHA,now:NOW};
const receipt=()=>verificationReceipt(observation(),results());
const assess=r=>assessVerification(formatVerification(r),expected);

test('fleet validates bounded schema, identity, timestamps, revision and coverage independently of report date',()=>{
  assert.equal(assess(receipt()).healthy,true);
  assert.equal(assessVerification(null,expected).state,'missing');
  assert.equal(assessVerification('# Acme',expected).state,'missing');
  assert.equal(assessVerification('<!-- plates:verification:v2 {} -->',expected).state,'malformed');
  for(const [change,state] of [
    [r=>r.schema=2,'malformed'],[r=>r.repo='acme/foreign','malformed'],[r=>r.observedAt='2027-01-01T00:00:00Z','malformed'],
    [r=>r.observedAt='2026-01-01T00:00:00Z','stale'],[r=>r.source.sha='b'.repeat(40),'behind'],
    [r=>r.remote.sha='b'.repeat(40),'behind'],[r=>r.remote.branch='main','behind'],[r=>r.gate.sha='b'.repeat(40),'behind'],
    [r=>r.gaps={},'malformed'],[r=>r.claims=[{}],'malformed'],[r=>r.reconciliation=null,'malformed'],
    [r=>r.source=null,'malformed'],[r=>r.remote=null,'unavailable'],
  ]) {const r=receipt();change(r);assert.equal(assess(r).state,state,JSON.stringify(r));}
  for(const change of [r=>r.gate.status=1,r=>r.gate.state='outside',r=>r.source.dirty=true,r=>r.gaps=['incomplete PR read'],r=>r.reconciliation.unknown=['source unavailable'],r=>r.gate.source='unavailable']) {
    const r=receipt();change(r);assert.equal(assess(r).healthy,false);
  }
  const old=receipt();old.gate={...old.gate,source:'reused-ci',workflow:'check',completedAt:'2026-10-01T00:00:00Z'};
  assert.equal(assessVerification(formatVerification(old),{...expected,sha:'b'.repeat(40)}).state,'behind','old green CI cannot verify newer main');
  old.gate.completedAt='2027-01-01T00:00:00Z';assert.equal(assess(old).state,'malformed');
});

test('newest failure stays visible beside historical success',()=>{
  const a=receipt(),b=receipt();a.observedAt='2026-10-23T11:00:00Z';b.gate.state='outside';b.gate.status=1;
  const out=assessVerification(formatVerification(b)+'\n'+formatVerification(a),expected);
  assert.equal(out.receipt.attempt,b.attempt);assert.equal(out.healthy,false);
});

async function fixture(t, { dataOverrides = {}, recordChange = () => {} } = {}) {
  const root=await mkdtemp(join(tmpdir(),'acme-fleet-verification-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'.plates'));await mkdir(join(root,'practices'));
  await writeFile(join(root,'.plates/plates.json'),JSON.stringify({plates:'self'}));
  await writeFile(join(root,'plates.json'),JSON.stringify([{repo:'acme/plate',role:'managed',kind:'node'},{repo:'acme/unavailable',role:'managed',kind:'node'}]));
  const log=join(root,'reads.jsonl'),gh=join(root,'gh');
  const record=receipt();record.observedAt=new Date().toISOString();recordChange(record);
  const data={
    'repos/acme/plate':{full_name:'acme/plate',default_branch:'trunk'},
    'repos/acme/plate/commits/trunk':{sha:SHA},
    [`repos/acme/plate/contents/.plates/plates.json?ref=${SHA}`]:{type:'file',encoding:'base64',content:Buffer.from(JSON.stringify({repo:'acme/plate',practice:'0.0.0',health:'reports',check:'touch MUST_NOT_RUN'})).toString('base64')},
    [`repos/acme/plate/contents/reports?ref=${SHA}`]:[{type:'file',name:'2026-10-23.md'}],
    [`repos/acme/plate/contents/reports/2026-10-23.md?ref=${SHA}`]:{type:'file',encoding:'base64',content:Buffer.from(formatVerification(record)).toString('base64')},
  };
  data[`repos/acme/plate/contents/.plates/lock.json?ref=${SHA}`] = {type:'file',encoding:'base64',content:Buffer.from(JSON.stringify({practice:'0.0.0',files:{'scripts/acme.mjs':{practice:'night',sha256:'b'.repeat(64)}}})).toString('base64')};
  Object.assign(data, dataOverrides);
  await writeFile(gh,`#!${process.execPath}\nconst fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');const data=${JSON.stringify(data)};if(a[0]==='api'&&a[1] in data)console.log(JSON.stringify(data[a[1]]));else if(a[0]==='run'||a[0]==='pr')console.log('[]');else{console.error('HTTP 404 Not Found');process.exit(1);}`);
  await chmod(gh,0o755);return {root,log,env:{...process.env,PLATES_GH:gh}};
}

test('existing fleet pins config and receipt reads, continues after unavailable repo and never executes consumer commands',async t=>{
  const {root,log,env}=await fixture(t);
  const out=await fleet({dir:root},{env,cli:'0.0.0',migrations:[],now:new Date().toISOString()});
  const row=out.data.rows.find(r=>r.repo==='acme/plate');
  assert.equal(row.verification.state,'current',JSON.stringify(row));
  assert.equal(row.verification.healthy,true);
  assert.equal(out.data.rows.length,2);
  const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  for(const a of calls.filter(a=>a[0]==='api' && /contents\/(?:\.plates\/plates.json|reports)/.test(a[1]))) assert.ok(a[1].endsWith(`ref=${SHA}`),a[1]);
  assert.ok(calls.every(a=>['api','run','pr'].includes(a[0]) && (a[0]==='api'||a[1]==='list')));
  await assert.rejects(readFile(join(root,'MUST_NOT_RUN')));
  const installed=await instrumentsFor(fileURLToPath(new URL('../',import.meta.url)));
  assert.equal(installed.fleetVerification,instruments.fleetVerification,'shipped home path dynamically loads the actual instruments');
  const summary=await instruments.fleetVerification({root,env});
  assert.equal(summary.rows.length,2,'actual managed role returned by fleet is retained');
  assert.equal(summary.rows[0].verification.state,'current');
  assert.equal(summary.rows[1].verification.state,'unavailable');
});


test('fleet separates lock declaration from installed-byte proof, verification and retirement', async t => {
  for (const failed of [false, true]) {
    const {root,log,env}=await fixture(t,{recordChange:r=>{if(failed){r.gate.state='outside';r.gate.status=1;}}});
    const out=await fleet({dir:root},{env,cli:'0.0.0',migrations:[],now:new Date().toISOString()});
    const row=out.data.rows[0];
    assert.ok(row.installation, 'fleet exposes installation observation');
    assert.equal(row.installation.state,'unknown','a lock does not verify installed managed bytes');
    assert.equal(row.installation.declaredVersion,'0.0.0');
    assert.equal(row.installation.lock,'observed');
    assert.equal(row.installation.managedBytes,'unverified');
    assert.deepEqual(row.installation.source,{repo:'acme/plate',branch:'trunk',sha:SHA,path:'.plates/lock.json'});
    assert.equal(row.verification.healthy,!failed,'verification remains independent of lock declaration');
    assert.equal(row.retirement.state,'unavailable');
    assert.equal(out.data.rows[1].installation.state,'unknown');
    assert.equal(out.data.rows[1].retirement.state,'unavailable');
    assert.match(out.text,/installation unknown.*lock declares 0.0.0.*managed bytes unverified/);
    assert.match(out.text,/retirement unavailable/);
    const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
    const locks=calls.filter(a=>a[0]==='api'&&a[1].includes('/lock.json'));
    assert.deepEqual(locks,[['api',`repos/acme/plate/contents/.plates/lock.json?ref=${SHA}`]]);
    assert.ok(calls.every(a=>a[0]==='api' ? (a.length===2 || JSON.stringify(a)===JSON.stringify(['api','graphql','-f','query=query { rateLimit { remaining resetAt } }'])) : ['run','pr'].includes(a[0])&&a[1]==='list'));
    await assert.rejects(readFile(join(root,'MUST_NOT_RUN')));
  }
});

test('fleet missing and malformed locks cannot claim installation or retirement success', async t => {
  const key=`repos/acme/plate/contents/.plates/lock.json?ref=${SHA}`;
  for (const response of [undefined, {type:'symlink'}, {type:'file',encoding:'none'}, ...['{', JSON.stringify({practice:'0.0.0',files:[]}), JSON.stringify({practice:'bad',files:{}})].map(text=>({type:'file',encoding:'base64',content:Buffer.from(text).toString('base64')}))]) {
    const {root,env}=await fixture(t,{dataOverrides:{[key]:response}});
    const out=await fleet({dir:root},{env,cli:'0.0.0',migrations:[],now:new Date().toISOString()});
    const row=out.data.rows[0];
    assert.ok(row.installation, 'missing proof remains an explicit installation gap');
    assert.equal(row.installation.state,'unknown');
    assert.equal(row.installation.declaredVersion,null);
    assert.equal(row.installation.lock,response===undefined?'missing':'unavailable');
    assert.equal(row.retirement.state,'unavailable');
    assert.equal(row.verification.healthy,true,'an unavailable lock does not erase valid verification');
  }
});

test('fleet observes the selected legacy lock, never substitutes another layout or trusts mismatched repository identity', async t => {
  const encoded=value=>({type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')});
  const {root,log,env}=await fixture(t,{dataOverrides:{
    [`repos/acme/plate/contents/.plates/plates.json?ref=${SHA}`]:undefined,
    [`repos/acme/plate/contents/.keel/keel.json?ref=${SHA}`]:encoded({practice:'0.0.0',health:'reports'}),
    [`repos/acme/plate/contents/.keel/lock.json?ref=${SHA}`]:encoded({practice:'0.0.1',files:{}}),
  }});
  const out=await fleet({dir:root},{env,cli:'0.0.0',migrations:[],now:new Date().toISOString()});
  assert.equal(out.data.rows[0].installation?.declaredVersion,'0.0.1');
  assert.equal(out.data.rows[0].installation.source.path,'.keel/lock.json');
  assert.equal(out.data.rows[0].retirement.state,'unavailable','legacy selection is not retirement evidence');
  const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.some(a=>a[1]?.includes('/.plates/lock.json')),false);
  const other=await fixture(t,{dataOverrides:{'repos/acme/plate':{full_name:'acme/other',default_branch:'trunk'}}});
  const denied=await fleet({dir:other.root},{env:other.env,cli:'0.0.0',migrations:[],now:new Date().toISOString()});
  assert.equal(denied.data.rows[0].installation.declaredVersion,null);
  assert.equal(denied.data.rows[0].installation.state,'unknown');
});
