import { evaluatedLearningWorld } from './helpers/evaluated-learning.mjs';
import { constants } from 'node:fs';
// Acme synthetic receipt tests exercise real readers; Docker proof is separately opt-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp, { readFile, writeFile, readdir, chmod, mkdir, rm, lstat, symlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { screeningWorld, syntheticTerminalReceipts } from './helpers/lesson-screening.mjs';
import { evaluationSection, ref, validateHistory, seal, serializeEvaluation } from '../lib/evaluated-lessons.mjs';
import { fingerprint, sealRecord } from '../lib/evaluation-records.mjs';
import { run } from './helpers/run.mjs';
const apply=(w,p)=>w.learning.evaluatedLearning({...p.opts,yes:true,digest:p.preview.digest});
async function inventory(path){const rows=[];for(const name of (await readdir(path)).sort()){const p=join(path,name),s=await lstat(p);rows.push([name,s.mode,s.isDirectory()?await inventory(p):fingerprint((await readFile(p)).toString('base64'))]);}return rows;}
async function overwrite(path,value){await chmod(path,0o600);await writeFile(path,JSON.stringify(value)+'\n');await chmod(path,0o400);}
const evaluation=r=>evaluationSection(r.outputBytes).value.records.find(r=>r.kind==='learning-evaluation');
test('twenty terminal receipts yield evaluated inconclusive, read-only approval and genuine revision',async t=>{
 const w=await screeningWorld(t);assert.ok(w.env.PLATES_GH);await syntheticTerminalReceipts(w,{regression:true,recovery:true});
 const before=await inventory(w.dir),p=await w.evaluate();assert.deepEqual(await inventory(w.dir),before);
 assert.equal((await w.learning.evaluatedLearning(p.opts)).digest,p.preview.digest);await assert.rejects(w.learning.evaluatedLearning({...p.opts,yes:true,digest:'0'.repeat(64)}),/stale_learning_preview/);
 const result=await apply(w,p),r=evaluation(result);assert.equal(result.status,'evaluated');assert.equal(r.data.disposition,'inconclusive');assert.equal(r.data.attemptRefs.length,20);assert(r.data.attemptRefs.some(a=>a.evidence.some(e=>e.record.startsWith('reconciliation-'))));
 assert.equal(r.data.caseResults.find(c=>c.role==='control').criteria.controlRegressions.status,'failed');
 const reports=await inventory(join(w.dir,'reports'));assert.equal(reports.length,1);assert.equal((await apply(w,p)).alreadyApplied,true);
 const inspect=run(process.execPath,[join(w.app,'bin/plates.mjs'),'learn','evaluate','inspect','2026-10-24-acme','--json'],{cwd:w.repo,env:w.env});assert.equal(inspect.status,0,inspect.stderr);assert.equal(JSON.parse(inspect.stdout).state,'evaluated');
 const revision={supersedesRef:w.proposalRef,proposal:w.proposal(w.lessonRef),scopeChangeReason:'Acme follow-up scope.'};await assert.rejects(w.call('revise',revision,{previous:result}),/unchanged_evaluated_revision/);
 revision.proposal.hypothesis='Acme revised hypothesis after measured limits.';const revised=(await w.call('revise',revision,{previous:result,apply:true})).result;assert.equal(revised.status,'proposed');assert.deepEqual(await inventory(join(w.dir,'reports')),reports);assert.deepEqual(evaluation(revised),r);
 const legacy=run(process.execPath,[join(w.app,'bin/plates.mjs'),'learn','decide','2026-10-24-acme','accepted','--yes','--json'],{cwd:w.repo,env:w.env});assert.equal(legacy.status,2);
});
test('criteria registration is once per proposal and before execution, null import remains retrospective',async t=>{
 const w=await screeningWorld(t);await assert.rejects(w.call('register-screening',{proposalRef:w.proposalRef,planLinkRef:w.planLinkRef},{previous:w.registered}),/already_registered/);
 const late=await screeningWorld(t,{register:false});await syntheticTerminalReceipts(late);await assert.rejects(late.call('register-screening',{proposalRef:late.proposalRef,planLinkRef:late.planLinkRef},{previous:late.bound}),/after_execution/);
 const old=await screeningWorld(t,{register:false,screeningCriteria:null});await syntheticTerminalReceipts(old);const registered=(await old.call('register-screening',{proposalRef:old.proposalRef,planLinkRef:old.planLinkRef},{previous:old.bound,apply:true})).result;
 const registration=ref(evaluationSection(registered.outputBytes).value.records.find(r=>r.kind==='learning-evaluation-plan'));
 const result=(await old.call('evaluate',{proposalRef:old.proposalRef,evaluationPlanRef:registration},{previous:registered,apply:true})).result;assert.equal(evaluation(result).data.disposition,'inconclusive');
});
test('shared Acme probe yields canonical equal case environments and unique delivery',async t=>{
 const w=await evaluatedLearningWorld(t,{realDocker:true}),corpus=await w.load('evaluation-corpus');
 for(const task of w.b.cases){assert.deepEqual(task,(await corpus.corpusDefinition(task.id)).task);for(const c of w.b.configurations)assert.deepEqual(task.environment,c.environment);}
 assert.equal(new Set(w.b.materials.map(m=>m.id)).size,w.b.materials.length);
 for(const c of w.b.configurations)assert.equal(new Set(c.overlays.map(o=>o.path)).size,c.overlays.length);
 if(process.env.PLATES_EVALUATION_DOCKER==='1'){
   const ledger=await w.load('evaluation-ledger');
   for(const task of w.b.cases){const pair=w.b.comparison.pairs.find(p=>p.case.id===task.id);await writeFile(w.execution,JSON.stringify({...w.executionRequest,pairId:pair.id}));const p=await ledger.evaluations({...w.options,action:'run',experiment:w.b.comparison.id,execution:w.execution});assert.equal(p.preview,true);assert.equal(p.input.taskDigest,task.digest);}
   assert.equal(await fsp.stat(join(w.options.state,'session-trials',w.b.comparison.id,'execution')).catch(()=>null),null);
 }
});
