// Synthetic Acme projects/users and deliberately imperfect official-contract HTTP fake.
// No provider credentials, GitHub writes, external chat or model calls.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { journal } from '../../experiments/gas-city/store.mjs';
import { bridge } from '../../experiments/gas-city/bridge.mjs';
import { gasCityClient } from '../../experiments/gas-city/client.mjs';
export function world(t) {
  const root=mkdtempSync(join(tmpdir(),'plates-acme-gascity-')),path=join(root,'journal.sqlite');
  const h='a'.repeat(64),stamp=n=>new Date(n).toISOString();
  const state={now:Date.parse('2026-10-30T12:00:00Z'),remaining:2,expires:Date.parse('2026-10-30T12:01:00Z'),denied:new Set(),dropCreate:false,dropInbound:false,failRegister:false,calls:[],creates:0,notifications:0,registrations:0};
  const projects=[{id:'acme-canvas',repoId:101},{id:'acme-garden',repoId:102}];
  const bindings=[1,2].map(actor=>({version:1,ownerActorId:actor,provider:'openai',accountIdentity:{account:`acme-account-${actor}`,workspace:null,scope:'account'},poolId:'acme-capacity',brokerScope:h,connectionGeneration:1,connectionPolicyDigest:h,grant:{id:String(actor).repeat(64),version:1,state:'active',projects:projects.map(p=>({...p,modelPolicyDigest:h})),models:['acme-model'],expiresAt:stamp(state.now+3600000)},evidence:{digest:h,observedAt:stamp(state.now),expiresAt:stamp(state.now+240000)}}));
  const authorize=(actor,project,action)=>({allowed:[1,2].includes(actor)&&projects.some(p=>p.id===project)&&!state.denied.has(`${actor}:${project}`)&&(!['attest','review-learning'].includes(action)||actor===1),binding:bindings[actor-1],context:{project:projects.find(p=>p.id===project),modelPolicyDigest:h,connectionPolicyDigest:h,connectionGeneration:1,brokerScope:h,model:'acme-model'},capacity:{remaining:state.remaining,expiresAt:state.expires}});
  let binding=null;
  async function fetcher(url,options={}) {
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;state.calls.push({path,body,headers:options.headers,method:options.method});
    if(path.endsWith('/sessions')){state.creates++;if(state.dropCreate)throw new Error('Acme lost response after create');return Response.json({status:'accepted',request_id:`acme-request-${state.creates}`,event_cursor:'0'},{status:202});}
    if(path.endsWith('/adapters')){state.registrations++;if(state.failRegister)return Response.json({},{status:503});return Response.json({},{status:201});}
    if(path.endsWith('/bind')){binding=body.session_id;return Response.json({});}
    if(path.endsWith('/inbound')){state.notifications++;if(state.dropInbound)throw new Error('Acme lost inbound acknowledgment');return Response.json({TargetSessionID:binding});}
    if(path.endsWith('/kill'))return Response.json({status:'ok'});
    if(path.includes('/session/'))return Response.json({id:path.split('/').at(-1),state:'closed'});
    if(path.endsWith('/events'))return Response.json({items:[]});
    return Response.json({},{status:404});
  }
  const client=gasCityClient({base:'http://127.0.0.1:8372',city:'acme-city',fetcher});
  let store=journal(path),api=bridge({store,client,authorize,now:()=>state.now});
  t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
  const launch=(changes={})=>api.launch({id:'acme-run',actor:1,project:projects[0].id,pr:'acme-pr-1',agent:'acme-canvas/worker',...changes});
  const start=async(changes={})=>{const r=await launch(changes);return api.observeCreate(1,r.id,{type:'request.result.session.create',payload:{request_id:r.request,session:{id:`acme-session-${state.creates}`}}});};
  return {state,bindings,projects,fetcher,client,authorize,path,launch,start,get api(){return api;},get store(){return store;},restart(){store.close();store=journal(path);api=bridge({store,client,authorize,now:()=>state.now});},message:(changes={})=>api.message({actor:1,project:projects[0].id,id:'acme-chat-1',source:'chat',thread:'acme-thread',target:'acme-session-1',text:'Review this change',expectedRevision:0,callback:'http://127.0.0.1:9180',...changes})};
}
