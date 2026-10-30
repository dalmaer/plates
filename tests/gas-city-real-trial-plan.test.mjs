import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSpec,preparationPlan} from '../experiments/gas-city/prepare-real-trial.mjs';
const spec=()=>({schema:1,baseline:'0'.repeat(40),selection:'pending-parent-reconciliation',modelExecution:'not-authorized',tasks:[{id:'task-a',prompt:'Real task A',tests:['tests/web-decisions.test.mjs']},{id:'task-b',prompt:'Held-out B',tests:['tests/web-learning.test.mjs']}]});
test('real-repo preparation freezes equivalent baseline with separate control and treatment, without model authority',()=>{
 const p=preparationPlan(spec(),'/tmp/acme-real-trial');assert.equal(p.arms.length,3);assert.ok(p.arms.every(a=>a.initialHead===p.baseline));assert.deepEqual(p.arms.map(a=>a.lesson),[false,false,true]);assert.equal(p.modelExecution,'not-authorized');assert.equal(p.agent,null);assert.equal(p.account,null);assert.equal(p.budget,null);
});
test('preparation rejects arbitrary commands, missing prompts and claimed execution permission',()=>{
 for(const path of ['../../secret','tests/a.test.mjs;curl','tests/*.test.mjs']){const s=spec();s.tasks[0].tests=[path];assert.throws(()=>validateSpec(s));}
 const s=spec();s.modelExecution='approved';assert.throws(()=>validateSpec(s),/cannot authorize/);assert.throws(()=>preparationPlan(spec(),'relative'),/absolute/);
});

test('source-contained destinations are refused and post-test tracked mutation or changed HEAD cannot pass',async t=>{
 const {mkdtempSync,mkdirSync,rmSync,symlinkSync,realpathSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {assertDestination,verifyArm}=await import('../experiments/gas-city/prepare-real-trial.mjs');
 const root=mkdtempSync(join(tmpdir(),'acme-preparation-')),source=join(root,'source');mkdirSync(source);t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>assertDestination(source,'relative'),/absolute/);assert.throws(()=>assertDestination(source,join(source,'nested','trial')),/outside source/);
 symlinkSync(source,join(root,'alias'));assert.throws(()=>assertDestination(source,join(root,'alias','trial')),/outside source/);
 assert.equal(assertDestination(source,join(root,'trial')),join(realpathSync(root),'trial'));
 const base='a'.repeat(40),arm={path:source};verifyArm(args=>args[0]==='rev-parse'?base:'',arm,base);
 assert.throws(()=>verifyArm(args=>args[0]==='rev-parse'?base:' M lib/web/server.mjs',arm,base),/not clean/);
 assert.throws(()=>verifyArm(args=>args[0]==='rev-parse'?'b'.repeat(40):'',arm,base),/baseline mismatch/);
});
