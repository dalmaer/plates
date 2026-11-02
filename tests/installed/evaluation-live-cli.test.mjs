// Installed synthetic machinery proof, not real-container isolation or efficacy.
import '../helpers/hermetic.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installLiveCli, liveCliWorld, PRIVATE, KEY, COUNT_TIMEOUT_MS } from '../helpers/evaluation-live-cli.mjs';
let installed;
const cleanup=[];
before(async()=>{installed=await installLiveCli({after:fn=>cleanup.push(fn)});});
after(async()=>{for(const fn of cleanup.reverse())await fn();});
const supported={skip:process.platform!=='darwin'?'credential FIFO channel explicitly supports Darwin only':false};
async function count(w) {
  const before=await w.events(),preview=w.json(w.call('run',w.count,['--credential-fd','50']),3);
  assert.deepEqual(await w.events(),before,'preview does not consume missing FD or transfer');
  const result=w.approve('run',w.count,preview);
  const again=w.approve('run',w.count,preview,false);
  assert.equal(again.recovered,true,'original count inspected without new credentials');
  assert.equal((await w.events()).filter(e=>e.event==='provider').length,1);
  return {preview,result};
}
async function generation(w) {
  await count(w);const path=await w.generation(),preview=w.json(w.call('run',path),3);
  const result=w.approve('run',path,preview);
  return {path,preview,result};
}
async function verifyPrivacy(w) {
  const events=await w.events(),provider=events.filter(e=>e.event==='provider');
  assert.ok(provider.length>0);assert.ok(provider.every(e=>e.credentialMatches));
  for(const e of provider){const wire=JSON.stringify(e.body);assert.equal(wire.includes(PRIVATE),false);assert.equal(wire.includes('probes/'),false);assert.equal(wire.includes('Acme private provenance'),false);}
  for(const e of events.filter(e=>e.event==='populate'&&e.name.endsWith('-builder'))) {
    assert.deepEqual(e.files.map(f=>f.path).sort(),['acme.txt','requirements.json']);
    assert.equal(e.files.some(f=>Buffer.from(f.base64,'base64').toString().includes(PRIVATE)),false);
  }
  assert.equal((await readFile(w.log,'utf8')).includes(KEY),false);
  return events;
}
test('packed installed CLI previews, counts, generates and independently accepts once with private inputs excluded',supported,async t=>{
  const w=await liveCliWorld(t,installed),{path,preview,result}=await generation(w);
  assert.equal(result.verdict.acceptance,'accepted');assert.equal(result.efficacy,'unavailable');
  assert.equal(result.verdict.checks[0].status,'passed');
  const events=await verifyPrivacy(w),names=events.map(e=>e.event);
  const generationIndex=events.findIndex(e=>e.event==='provider'&&e.url.endsWith('/responses'));
  assert.ok(names.indexOf('ready')<generationIndex&&generationIndex<names.indexOf('apply'));
  assert.ok(names.indexOf('kill')<names.indexOf('oracle'),'builder stopped before independent oracle');
  const verdict=await readFile(join(w.dir,'execution',w.slot,'verdict.json'),'utf8');
  const again=w.approve('run',path,preview,false);assert.equal(again.recovered,true);
  assert.deepEqual(await w.events(),events,'original generation never repeats provider or Docker');
  assert.equal(await readFile(join(w.dir,'execution',w.slot,'verdict.json'),'utf8'),verdict);
});
test('installed independent oracle rejects valid but incorrect generated data',supported,async t=>{
  const w=await liveCliWorld(t,installed,'wrong'),{result}=await generation(w);
  assert.equal(result.verdict.acceptance,'rejected');assert.equal(result.verdict.failureCategory,'acceptance');
  assert.equal(result.verdict.checks[0].status,'failed');assert.ok((await verifyPrivacy(w)).some(e=>e.event==='oracle'));
});
test('installed explicit original-ID GET settles original evidence without restarting builder or inventing acceptance',supported,async t=>{
  const w=await liveCliWorld(t,installed,'pending'),{result}=await generation(w);
  assert.equal(result.verdict.acceptance,'unknown');
  const intent=await w.receipt(`execution/${w.slot}/provider-intent.json`),response=await w.receipt(`execution/${w.slot}/provider-result.json`);
  const path=await w.write('recovery',{schemaVersion:2,stage:'recovery',mode:'provider-get',planDigest:w.plan.digest,
    targets:[{pairId:w.pairId,arm:w.arm,generationIntentDigest:intent.digest,generationSpendOperationId:intent.operationId,sourceResultDigest:response.digest,responseId:response.observation.response.id}],live:w.live,billing:{schemaVersion:1,basis:'fixed-request-v1'}});
  const before=await w.events(),verdict=await readFile(join(w.dir,'execution',w.slot,'verdict.json'),'utf8');
  const preview=w.json(w.call('reconcile',path),3);assert.deepEqual(await w.events(),before);
  w.approve('reconcile',path,preview);const events=await verifyPrivacy(w);
  const calls=events.filter(e=>e.event==='provider');assert.deepEqual(calls.map(e=>e.method),['POST','POST','GET']);
  assert.equal(calls.at(-1).url,'https://api.openai.com/v1/responses/resp_acme');
  assert.deepEqual(events.filter(e=>e.event!=='provider'),before.filter(e=>e.event!=='provider'));
  assert.equal(await readFile(join(w.dir,'execution',w.slot,'verdict.json'),'utf8'),verdict);
  assert.equal(w.approve('reconcile',path,preview,false).recovered,true);assert.deepEqual(await w.events(),events);
});
for(const scenario of ['count-uncertain','count-closed','no-id'])test(`installed local-only ${scenario} preserves original unknown spend with no duplicate effects`,supported,async t=>{
  const w=await liveCliWorld(t,installed,scenario);
  if(scenario.startsWith('count-'))await count(w);else await generation(w);
  const kind=scenario.startsWith('count-')?'count':'generation',base=kind==='count'?`execution/preparations/${w.slot}`:`execution/${w.slot}`;
  const intent=await w.receipt(base+(kind==='count'?'/count-intent.json':'/provider-intent.json'));
  const admission=await w.receipt(base+(kind==='count'?'/count-admission.json':'/lease.json'));
  const path=await w.write('local',{schemaVersion:2,stage:'recovery',mode:'local-only',planDigest:w.plan.digest,targets:[{pairId:w.pairId,arm:w.arm,operationKind:kind,operationId:intent.operationId,originalIntentDigest:intent.digest,admissionReceiptDigest:admission.digest}]});
  const originalSpend=w.inspect().spend.operations.find(op=>op.reservation.operationId===intent.operationId);
  assert.equal(originalSpend.complete,false);assert.ok(originalSpend.heldMicroUsd>0);
  assert.ok(originalSpend.observations.every(o=>o.usage===null),'remote uncertainty retains unknown usage');
  const spend=await tree(join(w.dir,'spend')),before=await w.events();
  assert.equal(w.call('reconcile',path,['--credential-fd','50']).status,2,'local-only rejects credential flag even at preview');
  const preview=w.json(w.call('reconcile',path),3);w.approve('reconcile',path,preview,false);
  assert.deepEqual(await tree(join(w.dir,'spend')),spend,'local release never refunds or invents usage');
  assert.deepEqual((await w.events()).filter(e=>e.event==='provider'),before.filter(e=>e.event==='provider'));
  const local=await w.receipt(`execution/control/local-reconcile-${preview.digest}.json`);
  assert.equal(local.localState,'released');
  if(kind==='count'){assert.equal(local.requestSettlement.observation.state,scenario==='count-closed'?'transport-closed':'owner-exited');
    if(scenario==='count-closed')assert.deepEqual(local.requestSettlement,(await w.receipt(base+'/count-local.json')).coordinatorReceipt);assert.equal(w.call('run',await w.generation()).status,2,'uncertain count still blocks generation');}
  assert.equal(local.providerEffect,'none');assert.equal(local.spendEffect,'none');assert.equal(local.acceptanceEffect,'none');
  assert.equal(w.approve('reconcile',path,preview,false).recovered,true);
  await verifyPrivacy(w);
});
async function tree(root) { const result={};async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else result[p.slice(root.length)]=await readFile(p,'utf8');}}await walk(root);return result; }


test('authored count slack survives controlled filesystem stall while original small budget fails closed',supported,async t=>{
  for(const countTimeoutMs of [1000,COUNT_TIMEOUT_MS]) {
    const w=await liveCliWorld(t,installed,'success',{writeStallMs:5500,...(countTimeoutMs===1000?{countTimeoutMs}:{})});
    const descriptor=JSON.parse(await readFile(w.count,'utf8'));
    assert.equal(descriptor.limits.timeoutMs,countTimeoutMs);
    assert.ok(countTimeoutMs+3000<w.plan.bundle.cases[0].limits.minutes*60000);
    const preview=w.json(w.call('run',w.count),3);
    assert.deepEqual(await w.events(),[],'preview does not reach delayed write');
    const outcome=w.call('run',w.count,['--yes','--digest',preview.digest,'--credential-fd','50'],true);
    const events=await w.events();
    t.diagnostic(JSON.stringify({authoredCountTimeoutMs:countTimeoutMs,reservedMs:countTimeoutMs+3000,writeStallMs:5500,exitCode:outcome.status,providerCalls:events.filter(e=>e.event==='provider').length,writeResumed:events.some(e=>e.event==='count-write-resumed'),failure:outcome.status===0?null:(outcome.stdout+outcome.stderr).trim()}));
    assert.equal(events.filter(e=>e.event==='count-write-stall').length,1,'actual immutable intent write stalled once');
    if(countTimeoutMs===1000) {
      assert.equal(outcome.status,2,outcome.stdout+outcome.stderr);
      assert.match(outcome.stdout+outcome.stderr,/evaluation_live_writer_(closed|stuck)/);
      assert.equal(events.some(e=>e.event==='provider'),false,'expired original budget never transfers');
      assert.equal(events.some(e=>e.event==='count-write-resumed'),false,'stuck writer terminates before late mutation');
    } else {
      const result=w.json(outcome);assert.equal(result.status,'observed');
      assert.equal(result.intent.time.reservedMs,countTimeoutMs+3000,'bounded authored reservation, not a production override');
      assert.equal(result.local.coordinatorReceipt.released,true);
      assert.equal(events.filter(e=>e.event==='count-write-resumed').length,1);
      assert.equal(events.filter(e=>e.event==='provider').length,1);
      assert.equal(w.inspect().spend.operations[0].complete,true);
    }
  }
});


test('installed generation capacity refusal consumes only the original slot without dispatch or spend refund',supported,async t=>{
  const w=await liveCliWorld(t,installed);await count(w);
  const counted=w.inspect().spend,path=await w.generation();
  const busy=await w.occupyHost();
  try {
  assert.equal((await busy.inspect()).used,1);
  const preview=w.json(w.call('run',path),3),before=await w.events();
  const refused=w.approve('run',path,preview);
  assert.equal(refused.status,'not-admitted');
  const inspection=w.inspect(),trial=inspection.execution.trials.find(x=>x.slot===w.slot);
  assert.equal(trial.status,'terminal');assert.equal(trial.reason,'generation-not-admitted');
  const attempt=w.compare().report.attempts.find(x=>x.slot===w.slot);
  assert.equal(attempt.terminal,true);assert.equal(attempt.outcome,'unknown');assert.equal(attempt.failureCategory,'infrastructure');
  const entries=await readdir(join(w.dir,'execution',w.slot));
  assert.deepEqual(entries.sort(),['admission-refusal.json','intent.json']);
  assert.deepEqual(await w.events(),before,'refused generation never reaches provider or builder dispatch');
  assert.equal(before.filter(e=>e.event==='provider').length,1,'only successful count transferred');
  const generationSpend=inspection.spend.operations.filter(x=>x.reservation.operationKind==='generation');
  assert.equal(generationSpend.length,1);
  const held=generationSpend[0];assert.equal(held.dispatch,null);assert.deepEqual(held.observations,[]);
  assert.equal(held.complete,false);assert.equal(held.knownMicroUsd,0);assert.equal(held.heldMicroUsd,held.reservation.maximumMicroUsd);assert.ok(held.heldMicroUsd>0);
  assert.equal(inspection.spend.knownMicroUsd,counted.knownMicroUsd);
  assert.equal(inspection.spend.heldMicroUsd,counted.heldMicroUsd+held.heldMicroUsd);
  assert.deepEqual((await busy.inspect()).leases,[busy.lease],'refusal does not alter existing host owner');
  const spend=await tree(join(w.dir,'spend')),slot=await tree(join(w.dir,'execution',w.slot));
  await busy.release();assert.equal((await busy.inspect()).used,0);
  assert.equal(w.call('run',path,['--yes','--digest',preview.digest]).status,2,'original refused slot cannot dispatch after capacity returns');
  const replacement=await w.write('generation-replacement',{...JSON.parse(await readFile(path,'utf8')),limits:{timeoutMs:2000,maxOutputTokens:1000}});
  assert.equal(w.call('run',replacement).status,2,'changed descriptor cannot replace consumed original slot');
  const other=await w.write('other-count',{...JSON.parse(await readFile(w.count,'utf8')),arm:'candidate'});
  const next=w.json(w.call('run',other),3);assert.equal(next.preview,true,'another missing slot retains normal separate preview');
  assert.deepEqual(await tree(join(w.dir,'spend')),spend,'release, replay and preview never refund or reprice original hold');
  assert.deepEqual(await tree(join(w.dir,'execution',w.slot)),slot,'original slot never reruns or gets replaced');
  assert.deepEqual(await w.events(),before);
  await verifyPrivacy(w);
  } finally { await busy.release(); }
});
