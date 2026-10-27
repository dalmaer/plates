// Preparation artifacts are evidence, never compatibility or merge authority.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUpdateOutput, patchDigest, safeUpdateLink } from '../lib/update-artifact.mjs';
const output = () => ({schema:1,base:{repoId:1,repositoryNodeId:'R_acme',commit:'a'.repeat(40)},
  target:{repoId:2,repositoryNodeId:'R_acme_source',repo:'acme/plates',commit:'b'.repeat(40),cliVersion:'1.0.0',practiceVersion:'1.0.0',bundleDigest:'c'.repeat(64)},
  files:[{path:'scripts/acme.mjs',before:{mode:'100644',blob:'d'.repeat(40)},after:{mode:'100644',content:Buffer.from('// Acme\n').toString('base64')}}],migrations:[],
  checks:{setup:null,updated:{command:'npm test',exit:0,signal:null,startedAt:'2026-10-25T00:00:00.000Z',completedAt:'2026-10-25T00:00:01.000Z',tail:'Acme check'},base:null,baseSetup:null},
  coverage:{complete:true,gaps:[]},cleanup:{state:'verified',containerIds:['e'.repeat(64)]}});
test('artifact digest binds source, patch, migrations and check result; forged compatibility is rejected',()=>{
  const original=output(),d=patchDigest(original);assert.equal(validateUpdateOutput(original).schema,1);
  for(const change of [o=>o.base.commit='f'.repeat(40),o=>o.files[0].after.content=Buffer.from('different').toString('base64'),o=>o.checks.updated.exit=1,o=>o.migrations.push({id:'0001-acme',summary:'Acme',paths:['scripts/acme.mjs'],notes:[]})]){
    const copy=structuredClone(original);change(copy);assert.notEqual(patchDigest(copy),d);
  }
  assert.throws(()=>validateUpdateOutput({...original,compatible:true}),/invalid_update_output/);
});
test('artifact refuses incomplete coverage, duplicate paths and unsafe links',()=>{
  for(const change of [o=>o.coverage.complete=false,o=>o.files.push(structuredClone(o.files[0])),o=>{o.files[0].after={mode:'120000',content:Buffer.from('../../outside').toString('base64')};}]){
    const copy=output();change(copy);assert.throws(()=>validateUpdateOutput(copy),/invalid_update_output/);
  }
  assert.equal(safeUpdateLink('scripts/acme','../.git/config'),false);
});
