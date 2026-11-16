// Original-operation recovery cases split from lesson-screening.test.mjs; the full twenty-receipt fixtures are retained.
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
test('frozen V1 screening receipts remain readable without current comparison recovery diagnostics',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w,{recovery:true});
 const p=await w.evaluate();await apply(w,p);
 const file=join(w.dir,'reports',(await readdir(join(w.dir,'reports')))[0]),before=await readFile(file);
 const retained=JSON.parse(before),ledger=await w.load('evaluation-ledger'),screening=await w.load('evaluation-screening');
 const inspected=await ledger.evaluations({...w.options,action:'inspect',experiment:w.b.comparison.id});
 assert.equal(Object.hasOwn(retained.report,'recovery'),false);
 assert.deepEqual(screening.validateReportReceipt(retained,inspected.receipt),retained);
 assert.deepEqual(await screening.inspectReports(w.dir,inspected.receipt),[retained]);
 const current=await ledger.evaluations({...w.options,action:'compare',experiment:w.b.comparison.id});
 assert.equal(current.report.recovery.authorizesMutation,false);
 const expanded={...retained.report,recovery:current.report.recovery};
 assert.throws(()=>screening.validateReportReceipt(sealRecord({...retained,report:expanded,reportDigest:fingerprint(expanded)}),inspected.receipt));
 assert.deepEqual(await readFile(file),before);
});
test('report before inbox failure blocks replacement UUID and recovers exact original operation',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const p=await w.evaluate();
 const originalOpen=fsp.open,originalLstat=fsp.lstat;let published=false,injected=false;
 fsp.open=async function(path,...args){const h=await originalOpen.call(this,path,...args);if(String(path).includes('/reports/')&&typeof args[0]==='number'&&(args[0]&constants.O_CREAT)){const sync=h.sync.bind(h);h.sync=async()=>{await sync();published=true;};}return h;};
 fsp.lstat=async function(path,...args){if(published&&!injected&&String(path).endsWith('/.inbox-evaluation.lock')){injected=true;throw Error('Acme interruption before inbox intent');}return originalLstat.call(this,path,...args);};syncBuiltinESMExports();
 try{await assert.rejects(apply(w,p),/Acme interruption/);}finally{fsp.open=originalOpen;fsp.lstat=originalLstat;syncBuiltinESMExports();}
 assert(injected);const before=await inventory(join(w.dir,'reports'));assert.equal(before.length,1);
 const request={...p.request,operationId:randomUUID()};await assert.rejects(w.call('evaluate',request.payload,{request}),/original_operation/);
 const result=await apply(w,p);assert.equal(result.status,'evaluated');assert.deepEqual(await inventory(join(w.dir,'reports')),before);
 const path=join(w.dir,'reports',(await readdir(join(w.dir,'reports')))[0]);await rm(path);await assert.rejects(apply(w,p),/original_report_missing/);
});
test('partial report publication preserves originals and reporter-source changes retain readable old bytes',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const p=await w.evaluate(),result=await apply(w,p),before=await inventory(join(w.dir,'reports'));
 const module=join(w.app,'lib/lesson-screening-criteria.mjs');await fsp.appendFile(module,'\n// Acme changed implementation observation.\n');
 const ledger=await w.load('evaluation-ledger');assert.equal((await ledger.evaluations({...w.options,action:'inspect',experiment:w.b.comparison.id})).receipt.kind,'harness');assert.equal((await apply(w,p)).alreadyApplied,true);assert.deepEqual(await inventory(join(w.dir,'reports')),before);
 const screening=await w.load('evaluation-screening');await assert.rejects(screening.comparisonSnapshot({...w.options,experiment:w.b.comparison.id,repository:w.repo}),/source changed/);
 const partial=join(w.dir,'reports','f'.repeat(64)+'.json');await writeFile(partial,'{"schemaVersion":2',{mode:0o400});await assert.rejects(apply(w,p));assert.equal(await readFile(partial,'utf8'),'{"schemaVersion":2');assert.equal((await readFile(join(w.dir,'reports',before[0][0]),'utf8')).length>0,true);assert.equal(result.status,'evaluated');
});
test('duplicate recovery checks all attempt references and explicit evaluated rejection preserves evidence',async t=>{
 const w=await screeningWorld(t);await syntheticTerminalReceipts(w);const p=await w.evaluate(),result=await apply(w,p),section=evaluationSection(result.outputBytes),h=structuredClone(section.value);
 const index=h.records.findIndex(r=>r.kind==='learning-evaluation'),original=h.records[index];original.data.attemptRefs.pop();const {digest,...body}=original;h.records[index]=seal(body);const {digest:eventDigest,...event}=h.events.at(-1);event.recordRefs=[ref(h.records[index])];h.events[h.events.length-1]=seal(event);
 const altered=serializeEvaluation(section.prefix,h),file=join(w.repo,'docs/inbox/2026-10-24-acme.md');await writeFile(file,altered);await assert.rejects(apply(w,p),/original_attempt_refs_changed/);await writeFile(file,result.outputBytes);
 const evaluationRef=ref(evaluation(result));const rejected=(await w.call('reject',{evidenceRefs:[evaluationRef]},{previous:result,apply:true})).result;assert.equal(rejected.status,'rejected');assert.deepEqual(evaluation(rejected),evaluation(result));assert.equal((await readdir(join(w.dir,'reports'))).length,1);
});

