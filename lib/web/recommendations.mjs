// Read-only authenticated adapter seam. No credentials, state files or execution imports.
import { agentRecommendations } from '../agent-recommendations.mjs';
import { recommendationProjection, unavailableRecommendation } from '../recommendation-projection.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export async function readProjectRecommendation({reader,access,project,config,now}) {
  const clock=typeof now==='function'?now:()=>now;
  const bound=()=>Number.isSafeInteger(project?.repoId)&&project.repoId>0&&config.projectRepoIds?.[project.id]===project.repoId&&access.projects.some(p=>p.id===project.id&&p.repoId===project.repoId&&p.repo===project.repo);
  if(!bound())return unavailableRecommendation('recommendation_scope_unavailable');
  const unavailable=reason=>({...unavailableRecommendation(reason),scope:{projectId:project.id,repositoryId:project.repoId,project:project.repo,visibility:'personal'}});
  if(typeof reader!=='function')return unavailable();
  const scope={actorId:String(access.userId),workspaceId:access.workspace.id,projectId:project.id,repositoryId:project.repoId,project:project.repo};
  let timer;const controller=new AbortController();
  try {
    const envelope=await Promise.race([Promise.resolve().then(()=>reader({...scope,now:new Date(clock()).toISOString(),signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},5000);})]);
    if(!bound()||JSON.stringify(envelope).length>2*1024*1024||!exact(envelope,['version','input','authority'])||envelope.version!==1)throw Error('envelope');
    for(const [key,value] of Object.entries(scope))if(envelope.input?.[key]!==value||envelope.authority?.[key]!==value)throw Error('scope');
    const result=agentRecommendations(envelope.input,{authority:envelope.authority,now:new Date(clock()).toISOString()});
    if(result.authorization!=='caller-attested')throw Error('authority');
    const candidates=envelope.input.candidates.filter(c=>result.candidates.some(r=>r.id===c.id&&r.status==='available'));
    const windows=new Set(result.candidates.filter(c=>c.status==='available').flatMap(c=>c.windowIds));
    const times=[envelope.authority.expiresAt,...candidates.map(c=>c.expiresAt),...envelope.authority.connections.filter(c=>candidates.some(a=>a.connectionId===c.id)).map(c=>c.expiresAt),...result.capacity.pools.filter(p=>windows.has(p.id)).flatMap(p=>[p.expiresAt,p.window.resetAt,new Date(Date.parse(p.observedAt)+p.maxAgeSeconds*1000).toISOString()])].map(Date.parse).filter(Number.isFinite);
    return {...recommendationProjection(result),validUntil:new Date(Math.min(...times)).toISOString()};
  } catch {return unavailable('authenticated_recommendation_unavailable');}
  finally {clearTimeout(timer);}
}
// Called immediately after final request authorization, before serialization.
export function expireProjectRecommendation(model,now) {
  if(model?.validUntil&&Date.parse(model.validUntil)<=now)return {...unavailableRecommendation('recommendation_expired_during_read'),scope:model.scope,task:model.task};
  return model;
}
