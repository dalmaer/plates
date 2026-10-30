// Hosted transport seam. Local registry declarations never establish sharing authority.
// A future authenticated host bridge supplies this envelope; no bridge is installed here.
import { managementProjection } from '../management-projection.mjs';
import { matchesWindow } from './run-model.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const number=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0;
const metric=v=>object(v)&&number(v.knownSubtotal)&&number(v.total)&&typeof v.complete==='boolean'&&(!v.complete||v.total!==null);
const unavailable=code=>managementProjection({gaps:[code]});
export function filterManagementObservation(value,filters,now) {
  const attempts=value.attempts.filter(item=>matchesWindow(item,filters,now));
  const unknown=attempts.some(a=>![a.startedAt,a.completedAt].some(date=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=now));
  return {...value,attempts,routines:value.routines.filter(r=>!filters.routine||r.id===filters.routine),displayWindow:{days:filters.days,from:new Date(now-filters.days*86400000).toISOString(),to:new Date(now).toISOString()},
    coverage:{...value.coverage,...(unknown?{state:'partial',gaps:[...value.coverage.gaps,'attempt_time_unavailable']}:{} )}};
}
export async function readManagementObservation({reader,access,project,config,now}) {
  if(!Number.isSafeInteger(project?.repoId)||project.repoId<=0||config.projectRepoIds?.[project.id]!==project.repoId
    ||!access.projects.some(p=>p.id===project.id&&p.repoId===project.repoId&&p.repo===project.repo))return unavailable('observation_scope_unavailable');
  if(typeof reader!=='function')return unavailable('authenticated_observation_transport_unavailable');
  const scope={actorId:String(access.userId),workspaceId:access.workspace.id,projectId:project.id,repoId:project.repoId};
  let timer;const controller=new AbortController();
  try {
    const value=await Promise.race([Promise.resolve().then(()=>reader({...scope,project:{id:project.id,repoId:project.repoId,repo:project.repo},now:new Date(now).toISOString(),signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},5000);})]);
    if(JSON.stringify(value).length>2*1024*1024||!exact(value,['schema','scope','observedAt','expiresAt','observation','usage'])||value.schema!==1
      ||!exact(value.scope,Object.keys(scope))||Object.entries(scope).some(([k,v])=>value.scope[k]!==v))throw Error('scope');
    const observed=Date.parse(value.observedAt),expires=Date.parse(value.expiresAt);
    if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now||expires<=now||expires-observed>86400000)throw Error('freshness');
    const observation=value.observation;
    if(observation!==null) {
      if(observation.schema!==1||observation.observedAt!==value.observedAt||!['complete-page','partial','unavailable'].includes(observation.coverage?.state))throw Error('schema');
      for(const key of ['routines','attempts','reports']) {
        if(!Array.isArray(observation[key])||observation[key].length>500)throw Error('bounds');
        for(const item of observation[key])if(!item||item.scope?.actorId!==scope.actorId||item.scope?.workspaceId!==scope.workspaceId||item.scope?.projectId!==scope.projectId)throw Error('private_scope');
      }
      for(const r of observation.routines)if(typeof r.id!=='string'||!r.id||typeof r.name!=='string'||r.name.length>100||/[\x00-\x1f\x7f]/.test(r.name)||typeof r.source!=='string'||!object(r.schedule))throw Error('routine_schema');
      for(const a of observation.attempts)if(typeof a.id!=='string'||typeof a.routineId!=='string'||typeof a.source!=='string'||typeof a.state!=='string')throw Error('attempt_schema');
      for(const r of observation.reports)if(typeof r.kind!=='string'||typeof r.state!=='string'||!Array.isArray(r.gaps))throw Error('report_schema');
      if(!Array.isArray(observation.coverage.gaps)||observation.coverage.gaps.length>100)throw Error('gaps');
    }
    const usage=value.usage;
    if(usage!==null) {
      if(usage.kind!=='quality-usage-report'||usage.schemaVersion!==1||usage.scope?.visibility!=='project'
        ||!Array.isArray(usage.scope.projects)||usage.scope.projects.length!==1||usage.scope.projects[0].toLowerCase()!==project.repo.toLowerCase()
        ||usage.scope.pr&&(!exact(usage.scope.pr,['repositoryId','number'])||usage.scope.pr.repositoryId!==project.repoId||!Number.isSafeInteger(usage.scope.pr.number)||usage.scope.pr.number<=0)
        ||!object(usage.totals)||!['input','output','cacheRead','cacheWrite','reasoning','tokens'].every(k=>metric(usage.totals[k]))||!Array.isArray(usage.totals.costs)||usage.totals.costs.length>20||!usage.totals.costs.every(metric)
        ||!['complete','partial','empty','unavailable'].includes(usage.coverage?.state)
        ||!Array.isArray(usage.attempts)||usage.attempts.length>500||!Array.isArray(usage.coverage?.gaps)||usage.coverage.gaps.length>100)throw Error('usage_scope');
    }
    if(observation===null&&usage===null)throw Error('empty');
    return managementProjection({observation,usage});
  } catch {return unavailable('authenticated_observation_unavailable');}finally{clearTimeout(timer);}
}
