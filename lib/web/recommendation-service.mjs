// Trusted server composition only. No HTTP/file claim can create this service,
// authenticate funding, start a provider, reserve capacity or dispatch work.
import { createModelPolicy,validateModelPolicy } from './model-policy.mjs';
import { createConnectionPolicy,validatePolicy } from './connection-policy.mjs';
import { createConnectionStore } from './connection-store.mjs';
import { checkFundingBinding,fundingBroker,fundingDigest,fundingEnabled } from './funding.mjs';
import { agentRecommendations } from '../agent-recommendations.mjs';
import { validateQualityBundle } from '../agent-quality-records.mjs';
import { qualityOperation } from '../agent-quality-ledger.mjs';
import { readObservationInput } from '../management-observations.mjs';
import { fingerprint } from '../evaluation-records.mjs';
import { exact,WebError } from './common.mjs';
const fail=()=>{throw new WebError('recommendation_service_unavailable',503);};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const future=(value,now)=>iso(value)&&Date.parse(value)>now;
function authorized(config,access,project) {
  if(!config.ownerIds?.includes(access?.userId)||access.workspace?.id!==config.workspace.id||!Number.isSafeInteger(project?.repoId)||config.projectRepoIds?.[project.id]!==project.repoId||!access.projects?.some(p=>p.id===project.id&&p.repoId===project.repoId&&p.repo===project.repo))fail();
}
/** Canonical AQ ledger, with an explicit startup-owned per-actor source binding.
 * Binding selection is trusted code; a browser never supplies paths or episodes. */
export async function readCanonicalRecommendationQuality(binding,{workspaceId,project,now}) {
  if(!exact(binding,['manifest','state','appRoot']))fail();
  const manifest=await readObservationInput(binding.manifest);
  if(manifest.id!==workspaceId||!manifest.projects?.some(p=>p.id===project.id&&p.repo.toLowerCase()===project.repo.toLowerCase()))fail();
  const inspected=await qualityOperation({action:'inspect',...binding,now:new Date(now).toISOString()});
  return validateQualityBundle({...inspected.bundle,episodes:inspected.bundle.episodes.filter(e=>e.project.toLowerCase()===project.repo.toLowerCase())});
}
/** profileFor, capacityReader and qualityBindingFor are installed trusted host
 * adapters, not authority supplied by a request. Default policy/store reads use
 * the existing current-source and encrypted personal-funding APIs. `services`
 * and `qualityReader` support synthetic transport tests without live accounts. */
export function createRecommendationService(config,{fetcher=fetch,now=Date.now,profileFor=null,capacityReader=null,qualityBindingFor=null,qualityReader=null,services=null}={}) {
  return {async read({access,token,project,reauthorize,signal}) {
    if(typeof reauthorize!=='function'||typeof profileFor!=='function'||(!qualityReader&&typeof qualityBindingFor!=='function')||!fundingEnabled(config,now()))fail();
    authorized(config,access,project);const actor=access.userId;
    const abort=AbortSignal.any([AbortSignal.timeout(4500),...(signal?[signal]:[])]);
    const guard=promise=>new Promise((resolve,reject)=>{
      const stop=()=>reject(new WebError('recommendation_service_unavailable',503));
      if(abort.aborted)return stop();abort.addEventListener('abort',stop,{once:true});
      Promise.resolve(promise).then(value=>{if(abort.aborted)stop();else resolve(value);},()=>stop()).finally(()=>abort.removeEventListener('abort',stop));
    });
    const boundedFetch=(url,options={})=>fetcher(url,{...options,signal:AbortSignal.any([abort,...(options.signal?[options.signal]:[])])});
    const policies=services?.policies??createModelPolicy(config,{fetcher:boundedFetch,now});
    const connections=services?.connections??createConnectionPolicy(config,{fetcher:boundedFetch,now});
    const store=services?.store??createConnectionStore(config,boundedFetch,{now});
    const fresh=async()=>{const value=await guard(reauthorize());authorized(config,value,project);if(value.userId!==actor)fail();return value;};
    const snapshot=async current=>{
      const [model,connection]=await guard(Promise.all([policies.read(current,token,project),connections.read(current,token)]));
      const isProject=Object.hasOwn(model.policy??{},'projectId');
      validateModelPolicy(model.policy,isProject);
      if(isProject&&(model.policy.projectId!==project.id||model.policy.repoId!==project.repoId))fail();
      if(!hash(model.digest)||!model.policy.enabled||!Array.isArray(connection.records)||connection.records.length>100||connection.gaps?.length)fail();
      return {model,connection,pin:fingerprint([model.digest,model.policy,connection.records.map(r=>[r.policyDigest,r.descriptor])])};
    };
    let current=await fresh();const initial=await snapshot(current);
    const profile=await guard(profileFor({access:current,project,policy:initial.model.policy,policyDigest:initial.model.digest,signal:abort}));
    if(!exact(profile,['task','candidates','preferenceOrder'])||!Array.isArray(profile.candidates)||profile.candidates.length>100||!Array.isArray(profile.preferenceOrder))fail();
    const stamp=now(),scope={actorId:String(actor),workspaceId:config.workspace.id,projectId:project.id,repositoryId:project.repoId,project:project.repo,policyDigest:initial.model.digest};
    const candidates=[],observations=[],accountBindings=[],connectionPins=[],fundingPins=[];
    let expires=stamp+240000;
    for(const proposed of profile.candidates) {
      if(!exact(proposed,['id','connectionId','model','stages','capabilities','requiredWindows','agent']))fail();
      if(!initial.model.policy.candidates.some(c=>c.id===proposed.id&&c.connectionId===proposed.connectionId&&c.model===proposed.model))continue;
      const matches=initial.connection.records.filter(r=>r.descriptor.id===proposed.connectionId);if(matches.length!==1)continue;
      const record=matches[0],descriptor=validatePolicy(record.descriptor);
      if(!descriptor.enabled||descriptor.provider!==proposed.agent?.provider||!descriptor.projects.some(p=>p.id===project.id&&p.repoId===project.repoId))continue;
      connections.authorize(current,descriptor);
      const owned=await guard(store.readFunding(descriptor,actor));if(!owned||owned.state!=='present'||owned.policy!==record.policyDigest)continue;
      const context={actorId:actor,project,modelPolicyDigest:scope.policyDigest,connectionPolicyDigest:record.policyDigest,connectionGeneration:owned.version,brokerScope:fundingBroker(config),model:proposed.model,now:now()};
      let binding;try{binding=checkFundingBinding(owned.binding,context);}catch{continue;}
      if(binding.provider!==descriptor.provider||binding.accountIdentity.scope!=='account'||!future(binding.evidence.expiresAt,now())||Date.parse(binding.evidence.observedAt)>now())continue;
      expires=Math.min(expires,Date.parse(binding.grant.expiresAt),Date.parse(binding.evidence.expiresAt));
      const candidate={...proposed,...Object.fromEntries(['actorId','workspaceId','projectId','repositoryId','policyDigest'].map(k=>[k,scope[k]])),provider:descriptor.provider,accountId:binding.accountIdentity.account,poolId:binding.poolId,fundingKind:'person',connectionGeneration:owned.version,expiresAt:new Date(expires).toISOString()};
      candidates.push(candidate);accountBindings.push({provider:candidate.provider,accountId:candidate.accountId,actorId:scope.actorId});connectionPins.push({id:descriptor.id,generation:owned.version,expiresAt:candidate.expiresAt});fundingPins.push({descriptor,digest:fundingDigest(binding),context});
      if(typeof capacityReader==='function') {
        const observed=await guard(capacityReader({access:current,project,candidate,binding,signal:abort,now:new Date(now()).toISOString()}));
        if(!exact(observed,['observations','gaps'])||!Array.isArray(observed.observations)||observed.observations.length>100||!Array.isArray(observed.gaps))fail();
        for(const observation of observed.observations) {
          if(observation.provider!==candidate.provider||observation.identity?.account!==candidate.accountId||observation.identity?.scope!=='account'||observation.identity?.workspace!==null||observation.pool?.id!==candidate.poolId||!Array.isArray(observation.models?.ids)||observation.models.ids.some(m=>!binding.grant.models.includes(m)))fail();
        }
        // Partial adapter evidence cannot silently omit an applicable constraint.
        if(!observed.gaps.length)observations.push(...observed.observations);
      }
    }
    const quality=async current=>{
      const bundle=qualityReader?await guard(qualityReader({access:current,project,signal:abort,now:now()})):await guard(readCanonicalRecommendationQuality(await guard(qualityBindingFor({access:current,project,signal:abort})),{workspaceId:scope.workspaceId,project,now:now()}));
      validateQualityBundle(bundle);if(bundle.episodes.length>1000)fail();
      return {...bundle,episodes:bundle.episodes.filter(e=>e.project.toLowerCase()===project.repo.toLowerCase())};
    };
    const qualityBundle=await quality(current),qualityPin=fingerprint(qualityBundle);
    current=await fresh();if((await snapshot(current)).pin!==initial.pin)fail();
    for(const pin of fundingPins) {
      connections.authorize(current,pin.descriptor);const owned=await guard(store.readFunding(pin.descriptor,actor));
      if(!owned||owned.state!=='present'||owned.version!==pin.context.connectionGeneration||owned.policy!==pin.context.connectionPolicyDigest||fundingDigest(checkFundingBinding(owned.binding,{...pin.context,now:now()}))!==pin.digest)fail();
    }
    if(fingerprint(await quality(current))!==qualityPin)fail();
    await fresh();const checked=now();if(expires<=checked||checked-stamp>=300000)fail();
    const unique=(rows,key)=>[...new Map(rows.map(row=>[key(row),row])).values()];
    const input={...scope,task:profile.task,candidates,observations,qualityBundle,preferenceOrder:profile.preferenceOrder};
    const authority={...scope,checkedAt:new Date(checked).toISOString(),expiresAt:new Date(expires).toISOString(),candidateDigests:candidates.map(fingerprint),capacityDigests:observations.map(fingerprint),qualityEpisodeDigests:qualityBundle.episodes.map(e=>e.digest),accountBindings:unique(accountBindings,b=>[b.provider,b.accountId].join(':')),connections:unique(connectionPins,c=>c.id)};
    // Validate the complete closed contract before making an attestation usable.
    agentRecommendations(input,{authority,now:new Date(checked).toISOString()});
    // This descriptive profile cannot prove compliance with the effective
    // planning policy's model evidence, task bounds, reserve/freshness,
    // cooldowns or current reservations. Do not invent an empty ledger or
    // treat model membership as a checked selection. Keep composition private
    // until that selection integration exists; no attestation leaves here.
    throw new WebError('recommendation_selection_context_unavailable',503);
  }};
}
