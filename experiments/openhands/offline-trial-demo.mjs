// Reproducible offline qualification, not an agent-authored fix or learning result.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTrial,runTrial,scoreTrial,checkTrial,statusTrial,openTrial } from './trial-controller.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const [output,python,sdk]=process.argv.slice(2);
if(!output||!python||!sdk)throw Error('Usage: node offline-trial-demo.mjs NEW_OUTPUT VENV_PYTHON PINNED_SDK');
mkdirSync(resolve(output),{mode:0o700});const root=realpathSync(output),workspace=join(root,'worker'),control=join(root,'control');mkdirSync(workspace);
const archive=spawnSync('/usr/bin/git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','archive','037e13b4f78c061405cef899b528badb536584ad'],{cwd:resolve(HERE,'../..'),env:{PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},maxBuffer:32*1024*1024,timeout:10000});
if(archive.status!==0)throw Error('archive failed');const unpack=spawnSync('/usr/bin/tar',['-x','-C',workspace],{input:archive.stdout,env:{PATH:'/usr/bin:/bin'},timeout:10000});if(unpack.status!==0)throw Error('unpack failed');
const regression='tests/acme-trial-probe.test.mjs';
const content="// Scripted harness probe; not a receipt-race regression or model-authored patch.\nimport {test} from 'node:test';import assert from 'node:assert/strict';import {createWebService} from '../lib/web/server.mjs';test('Acme captured server module remains available',()=>assert.equal(typeof createWebService,'function'));\n";
const config={mode:'scripted',workspace,python:resolve(python),sdk:realpathSync(sdk),task:'task-a',regression,actorId:1,project:'acme-trial',account:'acme-offline',model:'openai/gpt-4o-mini',prompt:'Read package metadata and add the exact scripted harness probe. This is not a fix for the receipt defect.',maxRequests:4,maxInputTokens:64000,maxOutputTokens:4096,maxSeconds:45,requestTimeoutSeconds:10,scriptedApprovals:true,
script:[{text:'Read local package metadata.',action:{operation:'read',path:'package.json'}},{text:'Propose the harness-only test.',action:{operation:'write',path:regression,content,expectedSha256:null}},{text:'The scripted harness probe is complete. No real defect was fixed.'}]};
const admission=initializeTrial(control,config);const run=await runTrial(control);if(run.trial.worker.outcome!=='finished')throw Error('native worker did not finish');
const artifact=await scoreTrial(control,join(control,'captured'));const checks=await checkTrial(control,join(control,'checks'));if(!checks.passed)throw Error('fixed checks failed');
const adapter=openTrial(control);try{adapter.adapter.learning(adapter.token,admission.operation,{status:'no-useful-lesson'});}finally{adapter.adapter.close();}
const status=statusTrial(control),score=JSON.parse(readFileSync(join(control,'captured/score.json'),'utf8'));
if(score.passed!==4||score.total!==6)throw Error('unfixed baseline acceptance changed');
const report={schema:1,mode:'scripted-native-SDK',providerCalls:0,realDefectsFixed:0,admission,worker:status.trial.worker,requests:status.trial.requests.length,effects:Object.values(status.trial.actions).length,artifact,checks:{passed:checks.passed,total:checks.result.passed,report:join(control,'checks/check.json')},learning:status.operation.learning,baselineAcceptance:{passed:score.passed,total:score.total,expectedFailure:true},qualification:'Actual native SDK, approvals, bounded file effects, durable outcome and captured checks. Scripted responses; no model-quality or learning-benefit claim.'};
writeFileSync(join(root,'demo-receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
