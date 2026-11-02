import test from 'node:test';
import assert from 'node:assert/strict';
import {privateLearningHarness,captured,promoteInput,lessonText,redactedText,token} from './helpers/private-learning.mjs';
import {createPrivateLearning} from '../lib/web/private-learning.mjs';
import {webConfig} from '../lib/web/config.mjs';
const approve=(h,p,id=1)=>h.lessons.apply(h.access(id),token,{previewId:p.id,digest:p.digest},{reauthorize:h.reauthorize(id)});
const list=(h,id=1,options={})=>h.lessons.catalogue(h.access(id),token,options,{reauthorize:h.reauthorize(id)});

test('private capture and reviewed copies use durable encrypted atomic storage with actor/set isolation',async t=>{
 const h=await privateLearningHarness(t),{source}=await captured(h);
 assert.deepEqual(source.text,lessonText);assert.equal(source.provenance.actorId,1);assert.equal(source.revision,1);
 assert.equal((await list(h,2)).records.length,0);
 const p=await h.lessons.preview(h.access(),token,'promote',promoteInput(source));
 assert.deepEqual(p.payload.text,redactedText);assert.deepEqual(p.payload.recipients,[2]);
 assert.equal((await list(h,2,{mode:'copies'})).records.length,0);
 const r=await approve(h,p);assert.equal(r.state,'committed');
 assert.deepEqual(await approve(h,p),r);
 const copies=await list(h,2,{mode:'copies',setId:'first'});
 assert.equal(copies.records.length,1);assert.deepEqual(copies.records[0].text,redactedText);
 assert.equal(JSON.stringify(copies).includes('Original private'),false);assert.equal(JSON.stringify(copies).includes(source.id),false);
 assert.equal((await list(h,2,{mode:'copies',setId:'second'})).records.length,0);
 assert.equal((await list(h,3,{mode:'copies'})).records.length,0);
 assert.equal((await list(h,1)).records[0].text.shape,lessonText.shape);
 const rows=(await h.db.query('select * from keel_private.private_lessons')).rows;
 assert.equal(rows.some(row=>JSON.stringify(row).includes('Acme private')),false);
 assert.equal(rows.some(row=>JSON.stringify(row).includes('Bound reads')),false);
 assert.equal(rows.filter(row=>row.kind==='copy').length,1);
 await h.db.exec('SET ROLE authenticated');
 await assert.rejects(h.db.query('select * from keel_private.private_lessons'),/permission denied/);
 await assert.rejects(h.db.query("select public.plates_private_lesson_rpc('list',$1,$2,$3)",['a'.repeat(64),'b'.repeat(64),'0'.repeat(64)]),/permission denied/);
 await h.db.exec('RESET ROLE');
});

test('exact source, text, recipient and destination approval rejects forged or changed inputs',async t=>{
 const h=await privateLearningHarness(t),{source}=await captured(h);
 for(const input of [promoteInput(source,{ownerId:2}),promoteInput(source,{provenance:{actorId:2}}),promoteInput(source,{source:{id:source.id,digest:'f'.repeat(64)}}),promoteInput(source,{recipients:[4]}),promoteInput(source,{recipients:[2,2]})])await assert.rejects(h.lessons.preview(h.access(),token,'promote',input));
 await assert.rejects(h.lessons.preview(h.access(2),token,'promote',promoteInput(source)),{code:'lesson_not_found'});
 const p=await h.lessons.preview(h.access(),token,'promote',promoteInput(source));
 await assert.rejects(h.lessons.apply(h.access(),token,{previewId:p.id,digest:p.digest,text:lessonText},{reauthorize:h.reauthorize()}),{code:'invalid_private_lesson'});
 await assert.rejects(h.lessons.apply(h.access(),token,{previewId:p.id,digest:'f'.repeat(64)},{reauthorize:h.reauthorize()}),{code:'lesson_preview_changed'});
 h.config.projectSets[0].projects.push('new-project');await assert.rejects(approve(h,p));h.config.projectSets[0].projects.pop();
 h.state.members=[1,3];await assert.rejects(approve(h,p),{code:'lesson_audience_changed'});h.state.members=[1,2,3];
 h.workspace.head='c'.repeat(40);await assert.rejects(approve(h,p),{code:'lesson_preview_expired'});h.workspace.head='a'.repeat(40);
 const q=await h.lessons.preview(h.access(),token,'promote',promoteInput(source,{text:{...redactedText,guard:'A different reviewed guard'}}));
 assert.notEqual(p.digest,q.digest);await approve(h,q);await assert.rejects(approve(h,p),{code:'lesson_identity_conflict'});
});

test('lost commit response recovers only original operation; revocation stops future delivery without rewriting originals',async t=>{
 const h=await privateLearningHarness(t),{source}=await captured(h),p=await h.lessons.preview(h.access(),token,'promote',promoteInput(source));
 h.lessonState.loseCommit=true;await assert.rejects(approve(h,p));
 const r=await h.lessons.recover(h.access(),token,p.operationId,{reauthorize:h.reauthorize()});assert.equal(r.state,'committed');
 await approve(h,p);assert.equal((await list(h,2,{mode:'copies'})).records.length,1);
 const delivered=(await list(h,2,{mode:'copies'})).records[0];
 const revoke=await h.lessons.preview(h.access(),token,'revoke',{requestId:'3'.repeat(64),operationId:r.id});
 assert.equal((await approve(h,revoke)).state,'revoked');assert.equal((await approve(h,revoke)).state,'revoked');
 assert.equal((await list(h,2,{mode:'copies'})).records.length,0);assert.equal(delivered.text.shape,redactedText.shape);
 assert.equal((await list(h)).records[0].sourceDigest,source.sourceDigest);
 assert.equal((await h.lessons.recover(h.access(),token,r.id,{reauthorize:h.reauthorize()})).state,'revoked');
});

test('reads and writes reauthorize current project/owner membership and respect restore quarantine',async t=>{
 const h=await privateLearningHarness(t),{source}=await captured(h),p=await h.lessons.preview(h.access(),token,'promote',promoteInput(source));
 await assert.rejects(h.lessons.apply(h.access(),token,{previewId:p.id,digest:p.digest},{reauthorize:async()=>({...h.access(),projects:[]})}),{code:'access_denied'});
 await approve(h,p);
 assert.equal((await h.lessons.catalogue(h.access(2),token,{mode:'copies'},{reauthorize:async()=>({...h.access(2),projects:[]})})).records.length,0);
 h.config.projectSets[0].projects.push('missing');assert.equal((await list(h,2,{mode:'copies'})).records.length,0);h.config.projectSets[0].projects.pop();
 h.state.members=[1,3];await assert.rejects(list(h,2),{code:'access_denied'});h.state.members=[1,2,3];
 for(const config of [{...h.config,lessons:undefined},{...h.config,encryptionKey:Buffer.alloc(1)},{...h.config,recovery:{startedAt:'2026-10-21T00:00:00.000Z',reconciledAt:null}}])await assert.rejects(createPrivateLearning(config,{fetcher:h.fetcher,now:()=>h.state.now}).catalogue(h.access(),token,{}, {reauthorize:h.reauthorize()}));
 const bad={...h.input,lessons:{enabled:true,verifiedAt:null,restoreReconciledAt:null}};assert.throws(()=>webConfig(bad,h.secrets));
});

test('actual Learning HTTP routes capture, preview, copy and recover with CSRF and unchanged legacy auth',async t=>{
 const h=await privateLearningHarness(t),logged=await h.login(),cookie=logged.cookie,csrf=logged.session.csrf;
 const req=(path,body)=>h.request(path,{cookie,...(body?{body:undefined,method:'POST',headers:{'content-type':'application/json',origin:h.config.origin}}:{})});
 const post=(path,body)=>h.service(new Request(h.config.origin+path,{method:'POST',headers:{cookie,origin:h.config.origin,'content-type':'application/json'},body:JSON.stringify({csrf,...body})}));
 let response=await h.service(req('/learning'));assert.equal(response.status,200);assert.match(await response.text(),/Personal lessons/);
 response=await h.service(req('/learning?catalogue=personal'));assert.equal(response.status,200);assert.match(await response.text(),/data-private-review="capture"/);
 for(const path of ['/assets/private-learning-client.mjs','/assets/private-learning-views.mjs'])assert.equal((await h.service(req(path))).status,200);
 const input={requestId:'8'.repeat(64),projectId:'studio',text:lessonText};
 response=await post('/api/learning/catalogue/capture/preview',{...input,csrf:'bad'});assert.equal(response.status,403);
 response=await post('/api/learning/catalogue/capture/preview',input);assert.equal(response.status,200,await response.clone().text());const p=await response.json();
 response=await post('/api/learning/catalogue/promote/apply',{previewId:p.id,digest:p.digest});assert.equal(response.status,409);
 response=await post('/api/learning/catalogue/capture/apply',{previewId:p.id,digest:p.digest});assert.equal(response.status,200,await response.clone().text());const r=await response.json();
 response=await h.service(req(`/api/learning/catalogue/operations/${r.id}`));assert.equal(response.status,200);assert.equal((await response.json()).recordId,r.recordId);
 response=await h.service(req('/api/learning?catalogue=personal'));assert.equal(response.status,200);const original=(await response.json()).records[0];
 response=await post('/api/learning/catalogue/promote/preview',promoteInput(original));assert.equal(response.status,200);const promotion=await response.json();
 response=await post('/api/learning/catalogue/promote/apply',{previewId:promotion.id,digest:promotion.digest});assert.equal(response.status,200);
 h.state.userId=2;const other=await h.login();
 response=await h.service(h.request('/api/learning?catalogue=copies&set=first',{cookie:other.cookie}));assert.equal(response.status,200);assert.equal((await response.json()).records.length,1);
 response=await h.service(h.request('/api/learning?catalogue=personal',{cookie:other.cookie}));assert.equal((await response.json()).records.length,0);
 response=await h.service(h.request(`/api/learning/catalogue/operations/${promotion.operationId}`,{cookie:other.cookie}));assert.equal(response.status,404);
 h.state.members=[1,3];response=await h.service(h.request('/api/learning?catalogue=copies',{cookie:other.cookie}));assert.equal(response.status,404);
 h.state.userId=1;response=await h.service(req('/api/projects/studio/learning'));assert.equal(response.status,200);assert.equal((await response.json()).records.length,3);
 h.config.lessons.enabled=false;response=await h.service(req('/api/learning?catalogue=personal'));assert.equal(response.status,404);
 response=await h.service(req('/api/projects/studio/learning'));assert.equal(response.status,200);
});

test('final authorization loss blocks capture and revoke before persistence; removed recipient does not block narrowing revocation',async t=>{
 const h=await privateLearningHarness(t);
 const p=await h.lessons.preview(h.access(),token,'capture',{requestId:'9'.repeat(64),projectId:'studio',text:lessonText});let checks=0;
 await assert.rejects(h.lessons.apply(h.access(),token,{previewId:p.id,digest:p.digest},{reauthorize:async()=>++checks===2?{...h.access(),projects:[]}:h.access()}),{code:'access_denied'});
 assert.equal((await h.db.query("select count(*)::int n from keel_private.private_lessons where kind='original'")).rows[0].n,0);
 const {source}=await captured(h),copy=await h.lessons.preview(h.access(),token,'promote',promoteInput(source));await approve(h,copy);
 const rev=await h.lessons.preview(h.access(),token,'revoke',{requestId:'a'.repeat(64),operationId:copy.operationId});checks=0;
 await assert.rejects(h.lessons.apply(h.access(),token,{previewId:rev.id,digest:rev.digest},{reauthorize:async()=>++checks===2?{...h.access(),projects:[]}:h.access()}),{code:'access_denied'});
 assert.equal((await list(h,2,{mode:'copies'})).records.length,1);
 h.state.members=[1,3];const r=await approve(h,rev);assert.equal(r.state,'revoked');assert.equal(r.revocation.digest,rev.digest);
});
