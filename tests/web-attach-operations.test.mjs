// Real local SQL plus synthetic GitHub; neither provider nor hosted DB is used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAttachOperations} from '../lib/web/attach-operations.mjs';
import {createOperationStore} from '../lib/web/operation-store.mjs';
import {prepareClaimIntent} from '../lib/web/attach-github.mjs';
import {hash} from '../lib/web/common.mjs';
const at=Date.parse('2026-11-14T12:00:00Z'),parentToken='fake-acme-parent',childToken='fake-acme-child';
async function harness(t,options={}) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 const directory=new URL('../lib/web/migrations/',import.meta.url);
 for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
 const config={storageUrl:'https://acme.example',storageKey:'fake-key',encryptionKey:Buffer.alloc(32,7)};
 const publication={appId:11,clientId:'acme-client',clientSecret:'fake-acme-secret',installationId:21,actorId:1,ownerId:2,repoId:102,repositoryNodeId:'R_acme',repo:'acme/studio'};
 const identity=Object.fromEntries(['id','scope','project','previewId','fence'].map(k=>[k,hash('Acme-'+k)]));
 const intent=prepareClaimIntent({operationId:identity.id,repoId:102,repositoryNodeId:'R_acme',repo:'acme/studio',phase:1,provider:'codex',machine:'acme-hosted',
  at:'2026-11-14T12:00:00Z',parent:'b'.repeat(40),tree:'c'.repeat(40),identity:{name:'Acme',email:'builder@acme.example'}});
 const brief={text:'Acme original session brief',bytes:27,sha256:hash('Acme original session brief')};brief.bytes=Buffer.byteLength(brief.text);
 const input={identity,intent,brief,parent:{token:parentToken,tokenExpiry:at+3600000}};
 const state={calls:[],commit:false,ref:null,lose:null,intercept:null,after:null,foreignAfter:false};
 const repo={id:'R_acme',databaseId:102,nameWithOwner:'acme/studio'};
 const object=sha=>({oid:sha,message:sha===intent.commit?intent.payload.message:'Acme other holder',tree:{oid:intent.tree},parents:{totalCount:1,nodes:[{oid:intent.parent}]},author:intent.payload.author,committer:intent.payload.committer,repository:repo});
 const ref=()=>state.ref===null?null:{prefix:'refs/heads/',name:'claims/phase-1',repository:repo,target:object(state.ref)};
 const grant=token=>({token,user:{id:1},app:{client_id:'acme-client'},scopes:[],expires_at:new Date(at+1800000).toISOString(),installation:{account:{id:2},repository_selection:'selected',permissions:{contents:'write',metadata:'read'}}});
 const fetcher=async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):{},isDB=url.startsWith(config.storageUrl),query=body.query??'';
  const kind=isDB?body.p_operation:query.startsWith('mutation ')?'ref-post':query.includes('HostedClaimInspect')?'inspect':query?'access':url.endsWith('/token/scoped')?'mint-post':url.endsWith('/git/commits')?'commit-post':new URL(url).pathname;
  state.calls.push(kind);
  if(state.intercept){const hit=await state.intercept(kind,body);if(hit)return hit;}
  if(isDB){
   await db.exec('SET ROLE service_role');
   let value;
   try {value=(await db.query('SELECT public.plates_decision_rpc($1,$2,$3,$4,$5,$6,$7) value',[body.p_operation,body.p_id,body.p_scope,body.p_project,body.p_preview,body.p_fence,body.p_value])).rows[0].value;}
   finally{await db.exec('RESET ROLE');}
   if(state.after){const held=await state.after(kind,value);if(held)return held;}
   if(state.lose===kind){state.lose=null;throw Error('Acme lost database reply');}
   return Response.json(value);
  }
  if(kind==='mint-post')return Response.json(grant(childToken));
  if(kind==='/applications/acme-client/token') {
   const v=grant(body.access_token);if(body.access_token===parentToken)v.expires_at=new Date(at+3600000).toISOString();return Response.json(v);
  }
  if(kind==='/user')return Response.json({id:1});
  if(kind==='/user/installations')return Response.json({total_count:1,installations:[{id:21,app_id:11,account:{id:2},suspended_at:null,repository_selection:'selected',permissions:{contents:'write',issues:'write'}}]});
  const repository={id:102,node_id:'R_acme',full_name:'acme/studio',owner:{id:2},permissions:{push:true}};
  if(kind.endsWith('/repositories'))return Response.json({total_count:1,repositories:[repository]});
  if(kind==='/repositories/102')return Response.json(repository);
  if(kind==='access')return Response.json({data:{node:{...repo,owner:{databaseId:2},viewerPermission:'WRITE',source:{oid:intent.parent,tree:{oid:intent.tree}}}}});
  if(kind==='commit-post'){assert.equal(opts.headers.Authorization,'Bearer '+childToken);state.commit=true;return Response.json({sha:intent.commit,...intent.payload,tree:{sha:intent.tree},parents:[{sha:intent.parent}]},{status:201});}
  if(kind==='ref-post'){
   assert.equal(body.variables.input.repositoryId,intent.repositoryNodeId);
   state.ref=state.foreignAfter?'e'.repeat(40):intent.commit;
   return Response.json(state.foreignAfter?{errors:[{message:'Acme conflict'}],data:{createRef:null}}:{data:{createRef:{ref:ref()}}});
  }
  if(kind==='inspect')return Response.json({data:{node:{...repo,source:{oid:intent.parent,tree:{oid:intent.tree},repository:repo},candidate:state.commit?object(intent.commit):null,ref:ref()}}});
  throw Error('unexpected synthetic request');
 };
 const store=createOperationStore(config,fetcher);
 await store.createPreview(identity.previewId,identity.scope,{kind:'attach',brief});state.calls=[];
 const flow=createAttachOperations(config,publication,{fetcher,now:()=>at,...options});
 return {db,config,publication,input,state,store,flow,fetcher};
}
const effects=state=>state.calls.filter(k=>['mint-post','commit-post','ref-post'].includes(k));

test('actual journal acknowledgments precede effects and own claim only yields original brief',async t=>{
 const h=await harness(t),result=await h.flow.execute(h.input);
 assert.equal(result.state,'claim-verified');assert.equal(result.claimVerified,true);assert.deepEqual(result.brief,h.input.brief);
 assert.equal(result.running,false);assert.equal(result.dispatch,false);assert.equal(result.retryAuthorized,false);
 for(const [begin,effect]of[['mint','mint-post'],['commit','commit-post'],['ref','ref-post']])assert.ok(h.state.calls.indexOf('attach-'+begin+'-begin')<h.state.calls.indexOf(effect));
 assert.deepEqual(effects(h.state),['mint-post','commit-post','ref-post']);
 assert.equal(Object.keys(result.observations).length,3);
 const before=h.state.calls.length;const repeated=await h.flow.execute(h.input);
 assert.equal(repeated.recoveryAction,'recover-original');assert.ok(h.state.calls.slice(before).every(k=>k.startsWith('attach-')));
 const recovered=await h.flow.recover({identity:h.input.identity,token:parentToken});
 assert.equal(recovered.claimVerified,true);assert.deepEqual(recovered.brief,h.input.brief);assert.deepEqual(effects(h.state),['mint-post','commit-post','ref-post']);
});

test('pre-write foreign owner settles but post-write foreign owner remains uncertain',async t=>{
 for(const after of [false,true]) {
  const h=await harness(t);h.state.foreignAfter=after;if(!after)h.state.ref='e'.repeat(40);
  const result=await h.flow.execute(h.input);
  assert.equal(result.stage,after?'ref-uncertain':'ref-declined');assert.equal(result.claimVerified,false);
  assert.equal(result.journalState,after?'uncertain':'refused');
  assert.equal(effects(h.state).includes('ref-post'),after);
  const recovered=await h.flow.recover({identity:h.input.identity,token:parentToken});
  assert.equal(recovered.stage,result.stage);assert.equal(recovered.claimVerified,false);
  assert.equal(recovered.recoveryAction,after?'inspect-original-ref':'inspect-project-activity');
 }
});

test('ambiguous database acknowledgments stop next effect and recovery never begins one',async t=>{
 for(const op of ['attach-mint-begin','attach-mint-record','attach-commit-begin','attach-commit-record','attach-ref-begin','attach-ref-record']) {
  const h=await harness(t);h.state.lose=op;await h.flow.execute(h.input);
  const expected=op==='attach-mint-begin'?[]:['attach-mint-record','attach-commit-begin'].includes(op)?['mint-post']:op==='attach-ref-record'?['mint-post','commit-post','ref-post']:['mint-post','commit-post'];
  assert.deepEqual(effects(h.state),expected,op);
  const before=h.state.calls.length;
  const recovered=await h.flow.recover({identity:h.input.identity,token:parentToken});
  assert.ok(!h.state.calls.slice(before).some(k=>k.endsWith('-begin')||k.endsWith('-post')),op);
  assert.equal(recovered.running,false);
  if(op==='attach-mint-record')assert.equal(recovered.reason,'request-local-credential-unavailable');
 }
});

test('cancellation at reached DB hooks prevents late provider effects',async t=>{
 for(const kind of ['attach-mint-begin','attach-mint-record','attach-commit-begin','attach-ref-begin']) {
  const controller=new AbortController(),h=await harness(t,{signal:controller.signal});let release;
  // Abort after the real SQL transition wins, then release its valid reply late.
  h.state.after=(k,value)=>k===kind?new Promise(resolve=>{release=()=>resolve(Response.json(value));controller.abort();}):null;
  await h.flow.execute(h.input);const before=h.state.calls.length;
  assert.ok(release);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.state.calls.length,before);
 }
 const controller=new AbortController(),h=await harness(t,{signal:controller.signal});
 h.state.intercept=k=>{if(k==='attach-commit-begin'){controller.abort();return new Promise(()=>{});}};
 const result=await h.flow.execute(h.input);assert.equal(result.running,false);assert.deepEqual(effects(h.state),['mint-post']);
});

// The bounds below time the flow, not the harness: each harness replays every migration into PGlite, which takes
// about 7 s on a loaded CI runner (2026-11-15, check run 43657691069), so a test-wide timeout measured setup instead.
// The test timeouts are only backstops against a real hang.
test('stalled database body and cleanup cannot hold or continue the flow',{timeout:120000},async t=>{
 for(const mode of ['body','cancel']) {
  const controller=new AbortController(),h=await harness(t,{signal:controller.signal,timeoutMs:25000});let cancelled=0;
  h.state.intercept=kind=>{
   if(kind!=='attach-mint-begin')return null;
   if(mode==='body')return {ok:true,status:200,body:{getReader:()=>({read(){controller.abort();return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}})}};
   let done=false;
   return {ok:true,status:200,body:{getReader:()=>({read:async()=>done?{done:true}:(done=true,{done:false,value:Buffer.from('null')}),cancel(){cancelled++;return new Promise(()=>{});}})}};
  };
  const started=performance.now(),result=await h.flow.execute(h.input),took=performance.now()-started;
  // A stalled body or cleanup that held the flow would end it only at its 25 s deadline, or never.
  assert.ok(took<12500,`${mode}: the flow ended in ${Math.round(took)} ms, not held by the stalled ${mode}`);
  assert.equal(result.running,false);assert.deepEqual(effects(h.state),[]);assert.ok(cancelled>0);
 }
});

test('project conflict has an explicit action without provider calls',async t=>{
 const h=await harness(t);await h.store.attachReserve(h.input.identity,h.input.intent,h.input.brief);
 const identity={...h.input.identity,id:hash('Acme other operation'),previewId:hash('Acme other preview')};
 const {ref,commit,payload,...seed}=h.input.intent;
 const intent=prepareClaimIntent({...seed,operationId:identity.id});
 await h.store.createPreview(identity.previewId,identity.scope,{kind:'attach'});
 const result=await h.flow.execute({...h.input,identity,intent});
 assert.equal(result.reason,'project-conflict');assert.equal(result.recoveryAction,'inspect-project-activity');assert.deepEqual(effects(h.state),[]);
});

test('whole flow deadline bounds a stalled first journal request',{timeout:120000},async t=>{
 const h=await harness(t,{timeoutMs:1500});
 h.state.intercept=kind=>kind==='attach-reserve'?new Promise(()=>{}):null;
 const started=performance.now(),result=await h.flow.execute(h.input),took=performance.now()-started;
 assert.ok(took>=1400&&took<10000,`the 1.5 s deadline ended the stalled request after ${Math.round(took)} ms`);
 assert.deepEqual(h.state.calls,['attach-reserve']);
 assert.equal(result.claimVerified,false);assert.equal(result.reason,'attach_observation_unavailable');
 assert.deepEqual(effects(h.state),[]);
});
