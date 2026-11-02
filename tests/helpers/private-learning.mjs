// Synthetic Acme auth/GitHub transport plus actual encrypted PostgreSQL RPC.
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {learningHarness,token} from './web-learning.mjs';
import {createPrivateLearning} from '../../lib/web/private-learning.mjs';
import {createWebService} from '../../lib/web/server.mjs';
export {token};
export async function privateLearningHarness(t) {
 const h=learningHarness(),db=new PGlite();t.after(()=>db.close());
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 await db.exec(await readFile(new URL('../../lib/web/migrations/017-private-lessons.sql',import.meta.url),'utf8'));
 h.config.ownerIds.push(2,3);h.state.members=[1,2,3];
 const config={...h.config,lessons:{enabled:true,verifiedAt:'2026-10-20T00:00:00.000Z',restoreReconciledAt:'2026-10-20T00:00:00.000Z'},projectSets:[{id:'first',name:'First set',projects:['studio']},{id:'second',name:'Second set',projects:['studio']}]};
 const state={loseCommit:false,calls:[]};
 const fetcher=async(url,options)=>{
  if(new URL(url).pathname.endsWith('/plates_private_lesson_rpc')) {
   const p=JSON.parse(options.body);state.calls.push(p);
   const result=await db.query('SELECT public.plates_private_lesson_rpc($1,$2,$3,$4,$5::jsonb) value',[p.p_operation,p.p_instance,p.p_actor,p.p_id,JSON.stringify(p.p_data)]);
   if(p.p_operation==='commit'&&state.loseCommit){state.loseCommit=false;return Response.json({},{status:503});}
   return Response.json(result.rows[0].value);
  }
  return h.fetcher(url,options);
 };
 const opts={fetcher,now:()=>h.state.now},service=createWebService(config,opts),lessons=createPrivateLearning(config,opts);
 const access=(userId=1)=>({...h.refreshAccess(),userId});
 const reauthorize=(id=1)=>async()=>access(id);
 return {...h,config,db,fetcher,service,lessons,lessonState:state,access,reauthorize};
}
export const lessonText={shape:'Acme private original secret',cost:'Original private cost',guard:'Private guard',where:'Private incident location'};
export const redactedText={shape:'Bound reads before awaiting them.',cost:'Delayed completion',guard:'Use a shared deadline.',where:'Reviewed general lesson'};
export async function captured(h,requestId='1'.repeat(64)) {
 const p=await h.lessons.preview(h.access(),token,'capture',{requestId,projectId:'studio',text:lessonText});
 const r=await h.lessons.apply(h.access(),token,{previewId:p.id,digest:p.digest},{reauthorize:h.reauthorize()});
 const catalogue=await h.lessons.catalogue(h.access(),token,{}, {reauthorize:h.reauthorize()});
 return {p,r,source:catalogue.records.find(v=>v.id===r.recordId)};
}
export const promoteInput=(source,overrides={})=>({requestId:'2'.repeat(64),source:{id:source.id,digest:source.sourceDigest},destination:{kind:'set',id:'first'},recipients:[2],text:redactedText,...overrides});
