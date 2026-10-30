// Observation-only wire contract: no source names, paths, task text, account or quota fields.
import { exact, numeric, projectId, WebError } from './common.mjs';
import { fingerprint } from '../evaluation-records.mjs';
import { SOURCE_KINDS } from '../routines/model.mjs';
export const hostDigest = fingerprint;
export const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const HOST_GAPS = ['source_unavailable','source_partial','record_invalid','identity_conflict','unsupported_source','history_truncated'];
const list = (v,check,max) => Array.isArray(v) && v.length <= max && v.every(check);
const unique = values => new Set(values).size === values.length;
const need = condition => { if (!condition) throw new WebError('invalid_host_observation',400); };
export function validateHostEnrollment(value, now) {
  need(exact(value,['hostId','sources','projects','expiresAt']) && hex(value.hostId) && iso(value.expiresAt)
    && Date.parse(value.expiresAt)>now && Date.parse(value.expiresAt)<=now+86400000);
  need(list(value.sources,s=>exact(s,['id','kind'])&&hex(s.id)&&SOURCE_KINDS.includes(s.kind),30) && value.sources.length>0 && unique(value.sources.map(s=>s.id)));
  need(list(value.projects,p=>exact(p,['id','repoId'])&&projectId(p.id)&&numeric(p.repoId),10) && value.projects.length>0
    && unique(value.projects.map(p=>p.id)) && unique(value.projects.map(p=>p.repoId)));
  return structuredClone(value);
}
export function validateHostReport(value, grant, now) {
  need(exact(value,['version','grantId','sequence','project','observedAt','expiresAt','routines','attempts','coverage']) && value.version===1 && hex(value.grantId)
    && Number.isSafeInteger(value.sequence)&&value.sequence>0 && value.sequence<=2147483647
    && exact(value.project,['id','repoId'])&&projectId(value.project.id)&&numeric(value.project.repoId)
    && iso(value.observedAt)&&iso(value.expiresAt)&&Date.parse(value.observedAt)<=now&&now-Date.parse(value.observedAt)<300000
    && Date.parse(value.expiresAt)>now&&Date.parse(value.expiresAt)<=Date.parse(value.observedAt)+300000);
  need(grant.projects.some(p=>p.id===value.project.id&&p.repoId===value.project.repoId));
  const source = r => grant.sources.some(s=>s.id===r.sourceId&&s.kind===r.source);
  need(list(value.routines,r=>exact(r,['id','sourceId','source','status','scheduleKind'])&&hex(r.id)&&hex(r.sourceId)&&source(r)
    && ['active','paused','disabled','unknown'].includes(r.status)&&['cron','rrule','calendar','interval','manual','event','continuous','at-load','none','unknown'].includes(r.scheduleKind),200)
    && unique(value.routines.map(r=>`${r.sourceId}:${r.id}`)));
  need(list(value.attempts,a=>exact(a,['id','routineId','sourceId','source','state','startedAt','completedAt'])&&hex(a.id)&&hex(a.routineId)&&hex(a.sourceId)&&source(a)
    && value.routines.some(r=>r.id===a.routineId&&r.sourceId===a.sourceId&&r.source===a.source)
    && ['queued','waiting','running','succeeded','failed','cancelled','skipped','unknown'].includes(a.state)
    && [a.startedAt,a.completedAt].every(t=>t===null||iso(t)&&Date.parse(t)<=Date.parse(value.observedAt))
    && (!a.startedAt||!a.completedAt||a.startedAt<=a.completedAt),300) && unique(value.attempts.map(a=>`${a.sourceId}:${a.id}`)));
  need(exact(value.coverage,['state','gaps'])&&['complete-page','partial','unavailable'].includes(value.coverage.state)
    &&list(value.coverage.gaps,g=>HOST_GAPS.includes(g),20)&&unique(value.coverage.gaps));
  return structuredClone(value);
}

// The authenticated host is an enrolled observer, not proof of a provider's state.
export function hostReportObservation(report, grant) {
  const scope={actorId:String(grant.actorId),workspaceId:grant.workspaceId,projectId:report.project.id};
  const identity=(sourceId,source,id)=>hostDigest(['host-observation-v1',grant.hostId,sourceId,source,id]);
  return {schema:1,observedAt:report.observedAt,window:{since:null,until:report.observedAt},
    routines:report.routines.map(r=>({id:identity(r.sourceId,r.source,r.id),scope,source:r.source,name:`${r.source} routine · ${identity(r.sourceId,r.source,r.id).slice(0,8)}`,status:r.status,schedule:{kind:r.scheduleKind},placement:'unknown',runner:'unknown',observedAt:report.observedAt})),
    attempts:report.attempts.map(a=>({id:identity(a.sourceId,a.source,a.id),routineId:identity(a.sourceId,a.source,a.routineId),scope,source:a.source,state:a.state,startedAt:a.startedAt,completedAt:a.completedAt,durationMs:a.startedAt&&a.completedAt?Date.parse(a.completedAt)-Date.parse(a.startedAt):null})),
    reports:[{kind:'enrolled-host',scope,state:'partial',routineCount:report.routines.length,attemptCount:report.attempts.length,gaps:['host_provider_state_unverified']}],
    coverage:{state:'partial',gaps:['host_provider_state_unverified','host_coverage_not_verified',...report.coverage.gaps]}};
}
