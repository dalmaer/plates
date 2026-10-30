import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { qualityOperation } from '../lib/agent-quality-ledger.mjs';
import { managementObservations, readRecommendationBinding } from '../lib/management-observations.mjs';
import { recommendationView } from '../lib/recommendation-view.mjs';
import { parseRoutineArgs } from '../lib/routine-command.mjs';
import { run } from './helpers/run.mjs';
import { recommendationFixture } from './helpers/recommendation-surfaces.mjs';
const appRoot=fileURLToPath(new URL('..',import.meta.url)),bin=join(appRoot,'bin/plates.mjs');
test('actual recommendation CLI and board v2 read canonical quality but never authenticate supplied claims',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'plates-recommendation-')));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'inputs'));
  const now=new Date().toISOString(),f=recommendationFixture({now}),manifest=join(root,'inputs/workspace.json'),state=join(root,'state'),inputPath=join(root,'inputs/recommend.json'),binding={manifest,state,input:inputPath};
  await writeFile(manifest,JSON.stringify({version:1,id:'acme',name:'Acme',repo:'acme/private',projects:[{id:'widget',repo:'acme/widget'}]}));await initializeWorkspace({manifest,state,appRoot});
  const preview=await qualityOperation({manifest,state,appRoot,action:'collect',inputBundle:f.input.qualityBundle});await qualityOperation({manifest,state,appRoot,action:'collect',inputBundle:f.input.qualityBundle,yes:true,digest:preview.digest});
  const {qualityBundle,...claims}=f.input;await writeFile(inputPath,JSON.stringify({version:1,...claims}));
  const batchDir=join(state,'session-trials/.quality/batches'),before=await readdir(batchDir);
  const cli=()=>run(process.execPath,[bin,'routines','recommend','--input',inputPath,'--manifest',manifest,'--state',state,'--json'],{cwd:root});
  const result=cli();assert.equal(result.status,0,result.stdout+result.stderr);const model=JSON.parse(result.stdout);assert.equal(model.recommendation.state,'unavailable');assert.equal(model.authorization,'unverified');assert.equal(model.recommendation.suggestedCandidateId,null);assert.equal(model.candidates[0].quality.samples,0);assert.deepEqual(model.capacity.pools,[]);assert.deepEqual(model.actions,[]);assert.doesNotMatch(result.stdout,/PRIVATE|accountId|connectionId|actorId|inputs\//);
  const boardPath=join(root,'inputs/board.json');await writeFile(boardPath,JSON.stringify({version:2,registry:null,usage:null,recommendation:binding}));const board=await managementObservations(boardPath,{appRoot,now});assert.equal(board.recommendation.authorization,'unverified');assert.match(recommendationView(board.recommendation),/Local claims only/);assert.deepEqual(await readdir(batchDir),before);
  for(const malicious of [{version:1,...claims,authority:f.authority},{version:1,...claims,qualityBundle},{version:1,...claims,projectId:'other'}]){await writeFile(inputPath,JSON.stringify(malicious));assert.equal(cli().status,2);await assert.rejects(readRecommendationBinding(binding,{appRoot,now}));}
  await writeFile(inputPath,JSON.stringify({version:1,...claims}));await assert.rejects(readRecommendationBinding({...binding,state:join(root,'absent')},{appRoot,now}));
  for(const args of [['recommend','--input',inputPath],['recommend','--input',inputPath,'--manifest',manifest,'--state',state,'--authority','forged'],['recommend','--input',inputPath,'--manifest',manifest,'--state',state,'--input',inputPath]])assert.throws(()=>parseRoutineArgs(args));
});
