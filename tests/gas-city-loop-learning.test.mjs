// Real production private-learning service + encryption + migration 016/PGlite;
// authentication and every GitHub response are synthetic Acme fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createLoopLearning} from '../experiments/gas-city/loop-learning.mjs';
const H=value=>createHash('sha256').update(value).digest('hex');
const text={shape:'Retry only the original operation.',cost:'Duplicate side effects after a crash.',guard:'Recover the retained receipt before new work.',where:'Acme canvas synthetic worker failure.'};
const shared={...text,where:'Reviewed Acme two-project trial.'};
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'plates-acme-loop-learning-')),directory=join(root,'learning');
 const state={revoked:new Set(),now:Date.parse('2026-10-30T12:00:00.000Z'),identities:{'acme-reader':{actorId:1,role:'member',projects:['acme-canvas','acme-garden']},'acme-reviewer':{actorId:2,role:'reviewer',projects:['acme-canvas','acme-garden']}}};
 const authenticate=token=>{if(state.revoked.has(token)||!state.identities[token])throw Error('acme-auth-refused');return structuredClone(state.identities[token]);};
 let api=await createLoopLearning({directory,authenticate,now:()=>state.now});
 t.after(async()=>{await api.close();await rm(root,{recursive:true,force:true});});
 return {state,directory,get api(){return api;},async reopen(){await api.close();api=await createLoopLearning({directory,authenticate,now:()=>state.now});},capture:()=>api.capture('acme-reviewer',{requestId:H('acme-capture'),projectId:'acme-canvas',text})};
}
const promotion=source=>({requestId:H('acme-promotion'),source:{id:source.id,digest:source.sourceDigest},destination:{kind:'project',id:'acme-garden'},recipients:[1,2],text:shared});

test('actual lesson SQL requires exact reviewer approval and returns exact reviewed text only to scoped recipients',async t=>{
 const w=await fixture(t),{source,receipt}=await w.capture();
 assert.deepEqual(source.text,text);assert.equal(source.provenance.actorId,2);assert.equal(source.sourceDigest,H(JSON.stringify({text:source.text,provenance:source.provenance,project:source.project})));
 assert.deepEqual((await w.api.catalogue('acme-reader','acme-garden')).records,[]);
 await assert.rejects(w.api.capture('acme-reader',{requestId:H('reader-capture'),projectId:'acme-canvas',text}),/learning_reviewer_required/);
 await assert.rejects(w.api.previewPromotion('acme-reader',promotion(source)),/learning_reviewer_required/);
 const preview=await w.api.previewPromotion('acme-reviewer',promotion(source));
 await assert.rejects(w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:'f'.repeat(64)}),/lesson_preview_changed/);
 await assert.rejects(w.api.applyPromotion('acme-reader',{previewId:preview.id,digest:preview.digest}),/learning_reviewer_required/);
 const promoted=await w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest});
 assert.equal(promoted.state,'committed');assert.deepEqual(await w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest}),promoted);
 const copies=(await w.api.catalogue('acme-reader','acme-garden')).records;
 assert.equal(copies.length,1);assert.deepEqual(copies[0].text,shared);assert.equal(H(JSON.stringify(copies[0].text)),H(JSON.stringify(shared)));assert.equal(copies[0].provenance.reviewDigest,preview.digest);
 assert.equal(JSON.stringify(copies).includes(source.id),false);assert.deepEqual((await w.api.catalogue('acme-reader','acme-canvas')).records,[]);
 await assert.rejects(w.api.recover('acme-reader',receipt.id),/lesson_operation_not_found/);
});

test('persistent reopen recovers original committed promotion and revocation stops future reads without deleting receipts',async t=>{
 const w=await fixture(t),{source}=await w.capture(),preview=await w.api.previewPromotion('acme-reviewer',promotion(source));
 await w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest}); // deliberately discard acknowledgment
 const keyBefore=await readFile(join(w.directory,'loop-learning.json'),'utf8');await w.reopen();assert.equal(await readFile(join(w.directory,'loop-learning.json'),'utf8'),keyBefore);
 const recovered=await w.api.recover('acme-reviewer',preview.operationId);assert.equal(recovered.state,'committed');
 assert.deepEqual(await w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest}),recovered);
 const before=(await w.api.catalogue('acme-reader','acme-garden')).records;assert.equal(before.length,1);
 await assert.rejects(w.api.revoke('acme-reader',{requestId:H('acme-refused-revoke'),operationId:recovered.id}),/learning_reviewer_required/);
 const revoked=await w.api.revoke('acme-reviewer',{requestId:H('acme-revoke'),operationId:recovered.id});assert.equal(revoked.state,'revoked');
 await w.reopen();assert.deepEqual((await w.api.catalogue('acme-reader','acme-garden')).records,[]);assert.equal((await w.api.recover('acme-reviewer',recovered.id)).state,'revoked');assert.deepEqual(before[0].text,shared);
 const original=await w.capture();assert.equal(original.source.sourceDigest,source.sourceDigest);
});

test('current role, project access and authentication are checked again at approved apply and future reads',async t=>{
 const w=await fixture(t),{source}=await w.capture(),preview=await w.api.previewPromotion('acme-reviewer',promotion(source));
 w.state.identities['acme-reviewer'].role='member';await assert.rejects(w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest}),/learning_reviewer_required/);
 w.state.identities['acme-reviewer'].role='reviewer';w.state.identities['acme-reviewer'].projects=['acme-canvas'];await assert.rejects(w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest}),/access_denied/);
 w.state.identities['acme-reviewer'].projects.push('acme-garden');await w.api.applyPromotion('acme-reviewer',{previewId:preview.id,digest:preview.digest});
 w.state.identities['acme-reader'].projects=['acme-canvas'];await assert.rejects(w.api.catalogue('acme-reader','acme-garden'),/learning_project_refused/);
 w.state.revoked.add('acme-reader');await assert.rejects(w.api.catalogue('acme-reader','acme-canvas'),/acme-auth-refused/);await assert.rejects(w.api.catalogue('unknown','acme-canvas'),/acme-auth-refused/);
});
