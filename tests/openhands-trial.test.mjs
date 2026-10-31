import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeTrial,runTrial,statusTrial,recoverTrial,approveTrial } from '../experiments/openhands/trial-controller.mjs';
const native=process.platform==='darwin'&&process.env.PLATES_OPENHANDS_TRIAL==='1';
async function setup(t,extra={}){
 const base=await realpath(await mkdtemp(join(tmpdir(),'acme-sdk-trial-')));t.after(()=>rm(base,{recursive:true,force:true}));const workspace=join(base,'worker');await mkdir(join(workspace,'lib'),{recursive:true});
 const config={mode:'scripted',workspace,python:process.env.PLATES_OPENHANDS_PYTHON,sdk:process.env.PLATES_OPENHANDS_SDK,task:'synthetic',actorId:1,project:'acme-trial',account:'acme-offline',model:'openai/gpt-4o-mini',prompt:'Perform the scripted synthetic file action.',maxRequests:3,maxInputTokens:64000,maxOutputTokens:4096,maxSeconds:25,requestTimeoutSeconds:10,scriptedApprovals:true,script:[{text:'One edit',action:{operation:'write',path:'lib/acme.mjs',content:'export const value=1;\n',expectedSha256:null}},{text:'Finished.'}],...extra};
 const root=join(base,'control');initializeTrial(root,config);return{root,base,workspace,config};
}
test('native trial links one approved effect, outcome and unknown synthetic usage; original launch and workspace cannot repeat',{skip:!native},async t=>{
 const f=await setup(t);const r=await runTrial(f.root);assert.equal(r.trial.worker.outcome,'finished');assert.equal(r.operation.terminated,true);assert.equal(r.operation.learning,'pending');assert.equal(r.trial.requests.length,2);assert.ok(r.trial.requests.every(x=>x.tokens===null));const actions=Object.values(r.trial.actions);assert.equal(actions.length,1);assert.equal(actions[0].state,'completed');assert.equal(actions[0].approval.operation,r.operation.id);assert.equal(await readFile(join(f.workspace,'lib/acme.mjs'),'utf8'),'export const value=1;\n');await assert.rejects(runTrial(f.root),/original_launch_exists/);assert.throws(()=>initializeTrial(join(f.base,'other'),f.config),/EEXIST/);assert.equal((await recoverTrial(f.root)).status,'already-confirmed');
});
test('request exhaustion preserves one original execution and finishes as error, never a pass',{skip:!native},async t=>{
 const f=await setup(t,{maxRequests:1});const r=await runTrial(f.root);assert.equal(r.trial.worker.outcome,'error');assert.equal(r.trial.requests.length,1);assert.equal(Object.values(r.trial.actions).filter(a=>a.state==='completed').length,1);await assert.rejects(runTrial(f.root),/original_launch_exists/);
});
test('uncertain provider response is durably reserved and never retried or treated as free usage',{skip:!native},async t=>{
 const f=await setup(t,{script:[{error:true},{text:'must not be called'}]});const r=await runTrial(f.root);assert.equal(r.trial.worker.outcome,'error');assert.equal(r.trial.requests.length,1);assert.equal(r.trial.requests[0].state,'uncertain');assert.equal(Object.keys(r.trial.actions).length,0);assert.equal(r.operation.learning,'pending');await assert.rejects(runTrial(f.root),/original_launch_exists/);
});
test('pending exact action requires trusted approval; wrong digest and nonterminal approval are refused',{skip:!native},async t=>{
 const f=await setup(t,{scriptedApprovals:false});const running=runTrial(f.root);let action;
 for(let i=0;i<150;i++){action=Object.values(statusTrial(f.root).trial.actions)[0];if(action)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(action);assert.equal(action.state,'awaiting-approval');await assert.rejects(readFile(join(f.workspace,'lib/acme.mjs')),/ENOENT/);assert.throws(()=>approveTrial(f.root,{digest:'wrong',fixture:true}),/exact_pending_action/);assert.throws(()=>approveTrial(f.root,{digest:action.key}),/approval_requires_local_owner_terminal/);approveTrial(f.root,{digest:action.key,fixture:true});const r=await running;assert.equal(r.trial.worker.outcome,'finished');assert.equal(Object.values(r.trial.actions)[0].approval.source,'scripted-offline-fixture');
});
