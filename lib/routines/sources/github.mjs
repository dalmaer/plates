// Reuse Plates' numeric repository/run/attempt validation. Callers supply an
// already-authorized bounded transport; this collector never creates credentials.
import { attemptModel } from '../../web/run-model.mjs';
import { routine, attempt, schedule, observationId, check, nativeIdentity } from '../model.mjs';
export async function readGithub(context,reader) {
  if(!reader){context.gap('authorized_reader_unavailable');return false;}
  const data=await reader(context.source.project,{since:context.since,now:context.now});
  check(data&&Array.isArray(data.definitions)&&data.definitions.length<=500&&Array.isArray(data.runs)&&data.runs.length<=500,'unsupported_format');
  const byWorkflow=new Map();
  for(const definition of data.definitions) {
    check(nativeIdentity(definition.id)&&(definition.projectId===undefined||definition.projectId===context.source.project.id),'source_identity_mismatch');
    const id=`${context.source.project.repoId}:${definition.id}`;
    const item=routine(context,id,{revision:/^[a-f0-9]{40}$/.test(definition.revision??'')?definition.revision:null,status:definition.providerState==='active'?'active':'unknown',trigger:Array.isArray(definition.schedules)&&definition.schedules.length===1?schedule('cron',definition.schedules[0],'UTC'):schedule('unknown'),placement:'cloud',runner:'github-actions'});
    context.routines.push(item);byWorkflow.set(definition.id,item);if(definition.gaps?.length)context.gap('restricted_definition');if(item.schedule.kind==='unknown')context.gap('unsupported_schedule');
  }
  for(const raw of data.runs) {
    const existing=attemptModel(context.source.project,raw);
    const workflowKey=existing.routineId??`workflow:${existing.workflowId}`,native=`${context.source.project.repoId}:${workflowKey}`;
    let definition=byWorkflow.get(workflowKey);
    if(!definition){definition=routine(context,native,{revision:existing.source.revision,placement:'cloud',runner:'github-actions'});context.routines.push(definition);byWorkflow.set(workflowKey,definition);context.gap('definition_unavailable');}
    if(existing.startedAt&&existing.startedAt<context.since&&!['running','queued','waiting','requested'].includes(existing.state))continue;
    const normalized=attempt(context,definition.id,existing.id,{state:existing.state==='requested'?'queued':existing.state,startedAt:existing.startedAt,revision:existing.source.revision,timeBasis:'provider-attempt',parentId:observationId(context.scope,context.source.kind,['run',existing.parentId]),retryOf:existing.retryOf?observationId(context.scope,context.source.kind,['attempt',existing.retryOf]):null});
    normalized.providerIdentity=existing.identity; // Numeric provenance; no actor, branch or title.
    context.attempts.push(normalized);
  }
  if(!data.complete)context.gap('provider_pages_unread');
}
