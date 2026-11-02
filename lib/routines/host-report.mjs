// Pure local redaction before transport. No reads, uploads, enrollment or execution.
import { hostDigest, validateHostReport } from '../web/host-observation-model.mjs';
export const hostSourceBinding = (hostId, sourceId, kind) => ({id:hostDigest(['host-source-v1',hostId,sourceId,kind]),kind});
export const hostIdentity = localHostId => hostDigest(['host-v1',localHostId]);
export function hostObservationReport(observation,{grantId,sequence,project,scope,expiresAt}) {
  const records=[...(observation.routines||[]),...(observation.attempts||[])];
  if(records.some(r=>r.scope?.actorId!==String(scope.actorId)||r.scope?.workspaceId!==scope.workspaceId||r.scope?.hostId!==scope.hostId||r.scope?.projectId!==project.id))throw Error('host_observation_scope');
  const sources=[...new Map(records.map(r=>{const s=hostSourceBinding(scope.hostId,r.sourceId,r.source);return [s.id,s];})).values()];
  const source=r=>hostSourceBinding(scope.hostId,r.sourceId,r.source).id;
  const value={version:1,grantId,sequence,project,observedAt:observation.observedAt,expiresAt,
    routines:(observation.routines||[]).map(r=>({id:r.id,sourceId:source(r),source:r.source,status:r.status,scheduleKind:r.schedule.kind})),
    attempts:(observation.attempts||[]).map(a=>({id:a.id,routineId:a.routineId,sourceId:source(a),source:a.source,state:a.state,startedAt:a.startedAt,completedAt:a.completedAt})),
    coverage:{state:observation.coverage?.state||'unavailable',gaps:observation.coverage?.gaps?.length?['source_partial']:[]}};
  return validateHostReport(value,{projects:[project],sources},Date.parse(observation.observedAt));
}
