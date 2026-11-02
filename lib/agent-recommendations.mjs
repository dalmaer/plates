// Read-only personal advice. Authority is an already-authenticated caller's
// attestation, never a property accepted from a local input file or provider label.
import { capacityModel } from './web/capacity.mjs';
import { qualityReport } from './agent-quality-report.mjs';
import { validateQualityBundle } from './agent-quality-records.mjs';
import { fingerprint } from './evaluation-records.mjs';

const FRESH_MS = 5 * 60_000; // Advisory observations and caller authorization expire within five minutes.
const STAGES = ['planning', 'coding', 'review', 'iteration'];
const SCOPE = ['actorId', 'workspaceId', 'projectId', 'repositoryId', 'project', 'policyDigest'];
const AGENT = ['provider', 'model', 'agentBuild', 'harnessDigest', 'contextDigest', 'settingsDigest', 'promptDigest', 'skillsDigest', 'toolsDigest', 'permissionsDigest', 'runtimeDigest', 'dependencyDigest'];
const CONFIG = AGENT.filter(k => !['contextDigest', 'promptDigest'].includes(k));
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,199}$/.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const positive = v => Number.isSafeInteger(v) && v > 0;
const iso = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const exact = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const list = (v, predicate, max = 100) => Array.isArray(v) && v.length <= max && v.every(predicate);
const unique = v => new Set(v).size === v.length;
const require = (condition, message) => { if (!condition) throw new Error(`recommendations: ${message}`); };
const scopeValid = s => id(s.actorId) && id(s.workspaceId) && id(s.projectId) && positive(s.repositoryId) && typeof s.project === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.project) && hash(s.policyDigest);
const sameScope = (a, b) => SCOPE.every(k => a[k] === b[k]);
const numericSummary = values => {
  const known = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  return { observed: known.length, denominator: values.length, min: known.length ? Math.min(...known) : null, max: known.length ? Math.max(...known) : null, mean: known.length ? known.reduce((a,b) => a+b,0)/known.length : null };
};
function candidateValid(c) {
  return exact(c, ['id','actorId','workspaceId','projectId','repositoryId','policyDigest','provider','model','accountId','poolId','fundingKind','connectionId','connectionGeneration','expiresAt','stages','capabilities','requiredWindows','agent'])
    && [c.id,c.actorId,c.workspaceId,c.projectId,c.provider,c.model,c.connectionId].every(id) && [c.repositoryId,c.connectionGeneration].every(positive) && hash(c.policyDigest)
    && [c.accountId,c.poolId].every(v => v === null || id(v)) && ['person','organization'].includes(c.fundingKind) && iso(c.expiresAt)
    && list(c.stages, v => STAGES.includes(v)) && unique(c.stages) && list(c.capabilities,id) && unique(c.capabilities)
    && list(c.requiredWindows,w => exact(w,['kind','unit','durationMinutes']) && ['subscription','api-rate','spend','runner'].includes(w.kind) && id(w.unit) && (w.durationMinutes === null || positive(w.durationMinutes))) && c.requiredWindows.length > 0
    && exact(c.agent,AGENT) && [c.agent.provider,c.agent.model,c.agent.agentBuild].every(id) && AGENT.filter(k => k.endsWith('Digest')).every(k => c.agent[k] === null || hash(c.agent[k])) && c.agent.provider === c.provider && c.agent.model === c.model;
}
function authorityValid(a, input, now) {
  return exact(a,[...SCOPE,'checkedAt','expiresAt','candidateDigests','capacityDigests','qualityEpisodeDigests','accountBindings','connections']) && scopeValid(a) && sameScope(a,input) && iso(a.checkedAt) && iso(a.expiresAt) && Date.parse(a.checkedAt)<=now && now-Date.parse(a.checkedAt)<FRESH_MS && Date.parse(a.expiresAt)>now && Date.parse(a.expiresAt)-Date.parse(a.checkedAt)<=FRESH_MS
    && list(a.candidateDigests,hash) && list(a.capacityDigests,hash,500) && list(a.qualityEpisodeDigests,hash,1000)
    && list(a.accountBindings,b => exact(b,['provider','accountId','actorId']) && [b.provider,b.accountId,b.actorId].every(id))
    && list(a.connections,c => exact(c,['id','generation','expiresAt']) && id(c.id) && positive(c.generation) && iso(c.expiresAt));
}
function qualityEvidence(report, candidate, task, now, project) {
  const stratum = s => s.project === project.toLowerCase() && ['family','specialty','difficultyBand','risk'].every(k => s[k] === task[k]);
  const configuration = agent => agent && CONFIG.every(k => candidate.agent[k] !== null && agent[k] === candidate.agent[k]);
  const cohort = report.scopedConfigurationCohorts.find(c => c.stage === task.stage && stratum(c.stratum) && configuration(c.agent));
  const matching = report.episodes.filter(e => e.passportTiming === 'prospective' && stratum(e.stratum));
  const attempts = matching.flatMap(e => e.attempts.filter(a => a.stage === task.stage && configuration(a.agent)));
  const recent = attempts.filter(a => a.endedAt && Date.parse(a.endedAt)<=now && now-Date.parse(a.endedAt)<=30*86400000);
  const scores = cohort?.scorecard.quality ?? {observed:0,denominator:0,mean:null,median:null,min:null,max:null};
  const uncertain = [];
  if (!cohort) uncertain.push('no-matching-configuration-task-stage');
  if (scores.observed < 3) uncertain.push('sparse-quality-evidence');
  if (recent.length !== attempts.length || !recent.length) uncertain.push('quality-stale-or-undated');
  if (cohort?.scorecard.disputedAttempts.length) uncertain.push('disputed-quality');
  if (scores.observed < scores.denominator) uncertain.push('quality-missing');
  return {quality:{state:uncertain.length?'unknown':'descriptive',evidenceDigest:report.digest,tasks:cohort?.scorecard.tasks??0,samples:scores.observed,distribution:{...scores},recentAttempts:recent.length,newestAt:recent.map(a=>a.endedAt).sort().at(-1)??null,matching:'exact stable configuration, role and task stratum; task prompts/context may vary',minimumSamples:3,freshnessDays:30,uncertainty:uncertain,superiority:null},
    latency:{...numericSummary(attempts.map(a=>a.resources.wallMs)),unit:'ms',basis:'historical matched attempts; not a next-task forecast'},
    cost:{observedUsd:numericSummary(attempts.map(a=>a.resources.currencySource==='actual'?a.resources.currencyUsd:null)),estimatedUsd:numericSummary(attempts.map(a=>a.resources.currencySource==='estimate'?a.resources.currencyUsd:null)),basis:'attributed historical charges and estimates; not a quote or verified billing'}};
}

/** Trusted callers must reauthorize scope/policy/connection generation before
 * returning advice. This function performs no authentication, I/O or execution. */
export function agentRecommendations(input, {authority=null,now=new Date().toISOString()}={}) {
  require(exact(input,[...SCOPE,'task','candidates','observations','qualityBundle','preferenceOrder']) && scopeValid(input) && iso(now),'invalid input scope');
  const at=Date.parse(now), task=input.task;
  require(exact(task,['stage','family','specialty','difficultyBand','risk','requiredCapabilities','independentFromProvider']) && STAGES.includes(task.stage)
    && ['bugfix','feature','refactor','tests','investigation'].includes(task.family) && ['frontend','backend','fullstack','infrastructure'].includes(task.specialty)
    && ['low','medium','high'].includes(task.difficultyBand) && ['low','medium','high','critical'].includes(task.risk) && list(task.requiredCapabilities,id)
    && (task.independentFromProvider===null || id(task.independentFromProvider)),'invalid task requirements');
  require(list(input.candidates,candidateValid) && unique(input.candidates.map(c=>c.id)) && list(input.observations,v=>v&&typeof v==='object',500)
    && list(input.preferenceOrder,id) && unique(input.preferenceOrder),'invalid bounded candidates or observations');
  validateQualityBundle(input.qualityBundle);
  require(input.qualityBundle.episodes.length<=1000,'quality evidence limit exceeded');
  const verified=authorityValid(authority,input,at), rows=[], pools=new Map();
  const allowedQuality = verified ? new Set(authority.qualityEpisodeDigests) : new Set();
  const qualityBundle={...input.qualityBundle,episodes:input.qualityBundle.episodes.filter(e=>e.project.toLowerCase()===input.project.toLowerCase() && allowedQuality.has(e.digest) && Date.parse(e.createdAt)<=at && e.passport.timing==='prospective')};
  const emptyQualityReport=qualityReport({...qualityBundle,episodes:[]},{now});
  const authorizedQualityReport=qualityBundle.episodes.length?qualityReport(qualityBundle,{now}):emptyQualityReport;
  const capacityDigests=new Set(verified?authority.capacityDigests:[]);
  for(const c of input.candidates){
    if(c.actorId!==input.actorId || c.workspaceId!==input.workspaceId || c.projectId!==input.projectId || c.repositoryId!==input.repositoryId)continue;
    const reasons=[];
    if(!verified || !authority.candidateDigests.includes(fingerprint(c)))reasons.push('authorization-unverified');
    if(c.policyDigest!==input.policyDigest)reasons.push('policy-changed');
    if(Date.parse(c.expiresAt)<=at)reasons.push('candidate-expired');
    const connection=verified?authority.connections.filter(x=>x.id===c.connectionId):[];
    if(connection.length!==1 || connection[0].generation!==c.connectionGeneration || Date.parse(connection[0].expiresAt)<=at)reasons.push('connection-unverified-or-changed');
    const account=verified?authority.accountBindings.filter(x=>x.provider===c.provider && x.accountId===c.accountId):[];
    if(!c.accountId || !c.poolId || account.length!==1 || account[0].actorId!==input.actorId)reasons.push('account-identity-unverified');
    if(c.fundingKind!=='person')reasons.push('organization-grant-unsupported');
    if(!c.stages.includes(task.stage) || task.requiredCapabilities.some(x=>!c.capabilities.includes(x)))reasons.push('task-capability-unsupported');
    if(task.independentFromProvider===c.provider)reasons.push('review-independence-unsupported');
    const authorized=!reasons.some(r=>!['task-capability-unsupported','review-independence-unsupported'].includes(r));
    const observations=authorized?input.observations.filter(o=>o.provider===c.provider && (o.identity?.account===c.accountId || o.identity?.account==null) && (o.pool?.id===c.poolId || o.pool?.id==null)):[];
    const authenticated=observations.length>0 && observations.every(o=>capacityDigests.has(fingerprint(o)));
    const normalized=capacityModel(authenticated?observations:[],{now:at});
    if(!authenticated)reasons.push('capacity-provenance-unverified');
    // Verified model-specific windows for other models do not constrain this one.
    // Unknown model coverage remains applicable and therefore unavailable.
    const modelPools=normalized.pools.filter(p=>!(p.models.provenance!=='unknown' && p.models.ids.length>0 && !p.models.ids.includes(c.model)));
    const family=p=>fingerprint([p.provider,p.identity.scope,p.identity.account,p.identity.workspace,p.pool.id,p.kind,p.unit,p.window.durationMinutes]);
    // A fresh reading after a completed reset can supersede that previous cycle.
    // Active/ambiguous cycles and distinct durations or units remain independent.
    const applicable=modelPools.filter(p=>!modelPools.some(next=>next!==p && family(next)===family(p) && next.eligible && next.observedAt && at-Date.parse(next.observedAt)<FRESH_MS
      && p.window.resetAt && next.window.resetAt && Date.parse(next.observedAt)>=Date.parse(p.window.resetAt) && Date.parse(next.window.resetAt)>Date.parse(p.window.resetAt) && Date.parse(next.observedAt)>Date.parse(p.observedAt)));

    if(!applicable.length)reasons.push('capacity-unavailable');
    for(const required of c.requiredWindows)if(!applicable.some(p=>p.kind===required.kind && p.unit===required.unit && p.window.durationMinutes===required.durationMinutes))reasons.push('capacity-window-missing');
    for(const p of applicable){
      if(!p.observedAt || at-Date.parse(p.observedAt)>=FRESH_MS)reasons.push('capacity-stale');
      if(!p.eligible || p.identity.scope!=='account' || p.identity.workspace!==null || p.models.provenance==='unknown' || !p.models.ids.includes(c.model))reasons.push(`capacity-${p.state==='observed'?'unsupported':p.state}`);
      else if(p.measurement.remaining<=0)reasons.push('capacity-exhausted');
    }
    const windowIds=[];
    for(const p of applicable){if(p.identity.account!==c.accountId || p.pool.id!==c.poolId)continue;const key=fingerprint(p.id);windowIds.push(key);pools.set(key,{id:key,provider:p.provider,accountId:c.accountId,poolId:c.poolId,kind:p.kind,unit:p.unit,measurement:p.measurement,window:p.window,observedAt:p.observedAt,expiresAt:p.expiresAt,state:p.state,freshness:p.observedAt&&at-Date.parse(p.observedAt)<FRESH_MS?'fresh':'stale',maxAgeSeconds:FRESH_MS/1000});}
    const evidence=qualityEvidence(authorized?authorizedQualityReport:emptyQualityReport,c,task,at,input.project);
    rows.push({id:c.id,provider:c.provider,model:c.model,configuration:{agentBuild:c.agent.agentBuild,digest:fingerprint(Object.fromEntries(CONFIG.map(k=>[k,c.agent[k]])))},authorization:authorized?'caller-attested':'unverified',provenance:authenticated?'caller-attested observations; labels alone are not authentication':'unverified',status:reasons.length?'unavailable':'available',reasons:[...new Set(reasons)],funding:authorized?{kind:'person',actorId:input.actorId,accountId:c.accountId}:null,windowIds,...evidence});
  }
  const available=rows.filter(c=>c.status==='available'), rank=id=>{const n=input.preferenceOrder.indexOf(id);return n<0?Infinity:n;};
  const ordered=[...available].sort((a,b)=>rank(a.id)-rank(b.id)||a.id.localeCompare(b.id)).map(c=>c.id);
  const suggested=ordered.find(id=>input.preferenceOrder.includes(id))??(ordered.length===1?ordered[0]:null);
  return {schemaVersion:1,kind:'personal-agent-recommendations',generatedAt:now,task:{...task,requiredCapabilities:[...task.requiredCapabilities]},scope:Object.fromEntries(SCOPE.map(k=>[k,input[k]])),authorization:verified?'caller-attested':'unverified',authorityFreshness:{checkedAt:verified?authority.checkedAt:null,expiresAt:verified?authority.expiresAt:null,maxAgeSeconds:FRESH_MS/1000},candidates:rows,capacity:{pools:[...pools.values()],aggregation:'none; every applicable window independently constrains availability'},recommendation:{state:ordered.length?'choices-available':rows.some(c=>c.reasons.includes('capacity-exhausted'))?'wait':'unavailable',suggestedCandidateId:suggested,orderedCandidateIds:ordered,basis:suggested?(input.preferenceOrder.includes(suggested)?'explicit user preference among available choices':'sole available choice; quality superiority unknown'):'choose among available alternatives or refresh missing evidence',userControlled:true,automaticRouting:false,reserved:false,executed:false},limitations:['Caller attestations require a trusted authenticated adapter; local JSON cannot authenticate itself.','Availability means observed positive allowance within five minutes, not enough capacity for an arbitrary task, a reservation or guaranteed future provider allowance.','Quality is descriptive and task-specific; no causal superiority claim or universal score.','No organization pooling, payer transfer or model execution is supported.']};
}
