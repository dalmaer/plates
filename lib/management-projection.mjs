// Allowlisted transport/display projections; never imports local files or ledger storage.
import { createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const code=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(value)?value:'source_gap';
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const word=(value,fallback='unknown')=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value)?value:fallback;
const repository=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)&&!value.split('/').some(part=>['.','..'].includes(part));
const positive=value=>Number.isSafeInteger(value)&&value>0;
function metric(value) { const total=number(value?.total),subtotal=number(value?.knownSubtotal);return {knownSubtotal:subtotal,total:value?.complete===true?total:null,complete:value?.complete===true&&total!==null,observed:number(value?.observed),expected:number(value?.expected??value?.denominator)}; }
export function usageProjection(value) {
  if(!value)return null;
  const names=['input','output','cacheRead','cacheWrite','reasoning','tokens'];
  const scope={projects:[...new Set((value.scope?.projects||[]).filter(repository))].slice(0,100),pr:positive(value.scope?.pr?.repositoryId)&&positive(value.scope?.pr?.number)?{repositoryId:value.scope.pr.repositoryId,number:value.scope.pr.number}:null,visibility:['project','personal'].includes(value.scope?.visibility)?value.scope.visibility:'unknown'};
  return {kind:'lifecycle-usage',scope,repositoryVerification:['verified','unverified','not-requested'].includes(value.repositoryVerification)?value.repositoryVerification:'not-established',coverage:{state:['complete','partial','unavailable','empty'].includes(value.coverage?.state)?value.coverage.state:'partial',expectedAttempts:number(value.coverage?.expectedAttempts),observedAttempts:number(value.coverage?.observedAttempts),gaps:(value.coverage?.gaps||[]).slice(0,100).map(g=>code(g.code||g))},
    totals:Object.fromEntries(names.map(name=>[name,metric(value.totals?.[name])])),costs:(value.totals?.costs||[]).slice(0,20).map(c=>({currency:word(c.currency),kind:word(c.kind),...metric(c)})),
    attempts:(value.attempts||[]).slice(0,500).map(a=>({id:hash(a.id),stage:word(a.stage),status:word(a.status),provider:word(a.provider),model:word(a.model),modelVersion:word(a.modelVersion),usageState:word(a.usageState)})),
    provenance:'Supplied observation metadata; not independently authenticated.',billingVerified:false,note:'Recorded full task/PR lifecycle; independent of the visible history window. Associated shared work is nonadditive. Unknown usage is not zero.'};
}
export function managementProjection({observation=null,usage=null,gaps=[]}={}) {
  const states=[observation?.coverage?.state,usage?.coverage?.state].filter(Boolean);
  const state=!states.length?'unavailable':gaps.length||states.some(s=>['partial','unavailable'].includes(s))?'partial':observation?.coverage?.state||usage?.coverage?.state;
  return {schema:1,observedAt:iso(observation?.observedAt),sourceWindow:observation?.window?{since:iso(observation.window.since),until:iso(observation.window.until)}:null,
    routines:(observation?.routines||[]).slice(0,500).map(r=>({id:hash(r.id),name:typeof r.name==='string'&&r.name.length<=100?r.name:'Routine',source:word(r.source),status:word(r.status),placement:word(r.placement),runner:word(r.runner),scheduleKind:word(r.schedule?.kind),observedAt:iso(r.observedAt)})),
    attempts:(observation?.attempts||[]).slice(0,500).map(a=>({id:hash(a.id),routineId:hash(a.routineId),source:word(a.source),state:word(a.state),startedAt:iso(a.startedAt),completedAt:iso(a.completedAt),durationMs:number(a.durationMs)})),
    reports:(observation?.reports||[]).slice(0,30).map(r=>({source:word(r.kind||r.source),state:word(r.state),routineCount:number(r.routineCount),attemptCount:number(r.attemptCount),gaps:(r.gaps||[]).slice(0,50).map(g=>code(g.code||g))})),
    usage:usageProjection(usage),coverage:{state,gaps:[...gaps,...(observation?.coverage?.gaps||[]).map(g=>code(g.code||g))].slice(0,100)},actions:[]};
}
