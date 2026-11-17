// Receipt integrity cases split from lesson-screening.test.mjs; the full twenty-receipt fixtures are retained.
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
test('missing slots, active locks, stale evidence and malformed chain cannot be screened',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w,{omitLast:true});await assert.rejects(w.evaluate(),/terminal_slots/);
 const lock=join(w.options.state,'session-trials','.lock');await writeFile(lock,'',{mode:0o600});await assert.rejects(w.evaluate(),/writer not inactive/);assert.equal(await readFile(lock,'utf8'),'');await rm(lock);
 const complete=await screeningWorld(t);await syntheticTerminalReceipts(complete);const p=await complete.evaluate();
 const file=join(complete.dir,'execution',complete.b.comparison.pairs[0].id+'-baseline','result.json'),r=JSON.parse(await readFile(file));r.resources.wallMs=21;await overwrite(file,sealRecord(r));await assert.rejects(apply(complete,p),/stale_learning_preview/);
 r.verdictDigest='0'.repeat(64);await overwrite(file,sealRecord(r));await assert.rejects(complete.evaluate(),/unverified execution/);assert(!await fsp.stat(join(complete.dir,'reports')).catch(()=>null));
});
test('resealed nested report forgery and foreign report storage refuse retained reads',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const p=await w.evaluate();await apply(w,p);const home=join(w.dir,'reports'),file=join(home,(await readdir(home))[0]);
 const r=JSON.parse(await readFile(file));r.report.cases[0].arms.baseline.accepted='Acme forged count';r.reportDigest=fingerprint(r.report);const forged=sealRecord(r);await rm(file);await writeFile(join(home,forged.digest+'.json'),JSON.stringify(forged)+'\n',{mode:0o400});await assert.rejects(apply(w,p),/projection mismatch/);
 await rm(home,{recursive:true});await symlink(w.root,home);await assert.rejects(apply(w,p),/unsafe storage/);
});
test('strict learning evaluation references and nested arithmetic cannot be resealed into authority',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const p=await w.evaluate(),result=await apply(w,p),base=evaluationSection(result.outputBytes).value;
 for(const mutate of [r=>r.data.attemptRefs[0].evidence[0].extra=true,r=>r.data.reporterIdentity.extra=true,r=>r.data.caseResults[0].arms.baseline.currencyUsd.total=0,r=>r.data.evaluationPlanRef.digest='0'.repeat(64)]){
  const h=structuredClone(base),index=h.records.findIndex(r=>r.kind==='learning-evaluation');mutate(h.records[index]);const {digest,...body}=h.records[index];h.records[index]=seal(body);const e=h.events.at(-1),{digest:ignored,...eb}=e;eb.recordRefs=[ref(h.records[index])];h.events[h.events.length-1]=seal(eb);assert.throws(()=>validateHistory(h));
 }
});
test('consistent resealed delivery substitution is refused against frozen composition',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const path=join(w.dir,'execution',w.b.comparison.pairs[0].id+'-baseline'),records={};for(const name of await readdir(path))records[name.slice(0,-5)]=JSON.parse(await readFile(join(path,name)));
 records.intent.input.delivered[0].base64=Buffer.from('Acme unexpected delivery').toString('base64');records.intent.input.deliveredDigest=fingerprint(records.intent.input.delivered);records.intent.previewDigest=fingerprint(records.intent.input);records.intent=sealRecord(records.intent);
 for(const [key,r]of Object.entries(records))if(key!=='intent'){r.intentDigest=records.intent.digest;if(key==='lease')r.lease.commandDigest=records.intent.previewDigest;}
 for(const [key,r]of Object.entries(records))if(!['intent','verdict','result'].includes(key))records[key]=sealRecord(r);
 records.verdict.artifactDigest=records.artifact.digest;for(const [i,c]of records.verdict.checks.entries())c.observationDigest=records['check-'+i].digest;records.verdict=sealRecord(records.verdict);
 records.result.verdictDigest=records.verdict.digest;records.result.settlement.commandDigest=records.intent.previewDigest;records.result=sealRecord(records.result);
 for(const [key,r]of Object.entries(records))await overwrite(join(path,key+'.json'),r);
 const ledger=await w.load('evaluation-ledger');assert.equal((await ledger.evaluations({...w.options,action:'inspect',experiment:w.b.comparison.id})).execution.issues.length,0);
 await assert.rejects(w.evaluate(),/actual delivery mismatch/);
});
test('original frozen retention ceiling refuses report allocation without changing evidence',async t=>{
 const w=await screeningWorld(t,{retention:{days:30,maxBytes:64*1024*1024,maxEvents:187}});await syntheticTerminalReceipts(w);
 const execution=await w.load('evaluation-execution');assert.equal((await execution.usage(w.dir)).count,w.b.comparison.retention.maxEvents);
 const before=await inventory(w.dir);await assert.rejects(w.evaluate(),/retention_exhausted/);assert.deepEqual(await inventory(w.dir),before);
});

