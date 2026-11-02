// Explicit personal funding. Provider/account claims require a trusted server
// adapter; neither file input nor a credential's last mutation actor is ownership.
import { exact, hash, numeric, projectId, WebError } from './common.mjs';
import { featureRestoreReady } from './recovery.mjs';
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,199}$/.test(v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const fail=code=>{throw new WebError(code,409);};
export const fundingDigest=value=>hash(JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v));
export const fundingBroker=config=>hash(JSON.stringify(['model-routing-v1',config.appId,config.installationId,config.workspace.id,config.workspace.repoId]));
export const fundingProject=(broker,project)=>hash(JSON.stringify([broker,project.id,project.repoId]));
export function personalDescriptor(descriptor,actorId){if(!numeric(actorId)||!hex(descriptor?.secretRef))fail('funding_identity');return {...descriptor,secretRef:hash(JSON.stringify(['personal-funding-v1',descriptor.secretRef,actorId]))};}
export function fundingEnabled(config,now=Date.now()){
 const f=config.personalFunding;return f?.enabled===true&&f.brokerScope===fundingBroker(config)&&iso(f.verifiedAt)&&Date.parse(f.verifiedAt)<=now&&iso(f.restoreReconciledAt)&&featureRestoreReady(config,f.restoreReconciledAt,now);
}
export function validateFundingBinding(b){
 if(!exact(b,['version','ownerActorId','provider','accountIdentity','poolId','brokerScope','connectionGeneration','connectionPolicyDigest','grant','evidence'])||b.version!==1||!numeric(b.ownerActorId)||!['openai','anthropic','codex','claude'].includes(b.provider)||!opaque(b.poolId)||!hex(b.brokerScope)||!numeric(b.connectionGeneration)||!hex(b.connectionPolicyDigest)
 ||!exact(b.accountIdentity,['account','workspace','scope'])||!opaque(b.accountIdentity.account)||!['account','workspace'].includes(b.accountIdentity.scope)||(b.accountIdentity.scope==='account'?b.accountIdentity.workspace!==null:!opaque(b.accountIdentity.workspace)))fail('funding_binding_invalid');
 const g=b.grant,e=b.evidence;
 if(!exact(g,['id','version','state','projects','models','expiresAt'])||!hex(g.id)||!numeric(g.version)||!['active','revoked'].includes(g.state)||!iso(g.expiresAt)||!Array.isArray(g.projects)||!g.projects.length||g.projects.length>100||!g.projects.every(p=>exact(p,['id','repoId','modelPolicyDigest'])&&projectId(p.id)&&numeric(p.repoId)&&hex(p.modelPolicyDigest))||new Set(g.projects.map(p=>p.repoId)).size!==g.projects.length||!Array.isArray(g.models)||!g.models.length||g.models.length>100||!g.models.every(opaque)||new Set(g.models).size!==g.models.length
 ||!exact(e,['digest','observedAt','expiresAt'])||!hex(e.digest)||!iso(e.observedAt)||!iso(e.expiresAt)||Date.parse(e.expiresAt)<=Date.parse(e.observedAt))fail('funding_binding_invalid');
 return structuredClone(b);
}
export function fundingMetadata(binding){
 const b=validateFundingBinding(binding),g=b.grant;
 return {version:1,owner:b.ownerActorId,grant:g.id,grantVersion:g.version,digest:fundingDigest(b),state:g.state,connectionVersion:b.connectionGeneration,connectionPolicy:b.connectionPolicyDigest,broker:b.brokerScope,pool:hash(JSON.stringify([b.provider,b.accountIdentity.scope,b.accountIdentity.account,b.accountIdentity.workspace,b.poolId])),expiresAt:g.expiresAt,evidenceObservedAt:b.evidence.observedAt,evidenceExpiresAt:b.evidence.expiresAt,projects:g.projects.map(p=>({project:fundingProject(b.brokerScope,p),policy:p.modelPolicyDigest})),models:g.models};
}
export function checkFundingBinding(binding,{actorId,project,modelPolicyDigest,connectionPolicyDigest,connectionGeneration,brokerScope,model,now=Date.now()}){
 const b=validateFundingBinding(binding),g=b.grant;
 if(Date.parse(b.evidence.observedAt)>now||now-Date.parse(b.evidence.observedAt)>=300000||Date.parse(b.evidence.expiresAt)<=now||Date.parse(b.evidence.expiresAt)>Date.parse(b.evidence.observedAt)+300000)fail('funding_identity_evidence_expired');
 if(b.ownerActorId!==actorId)fail('funding_owner');
 if(b.brokerScope!==brokerScope)fail('funding_broker');
 if(b.connectionGeneration!==connectionGeneration||b.connectionPolicyDigest!==connectionPolicyDigest)fail('funding_connection_changed');
 if(g.state!=='active'||Date.parse(g.expiresAt)<=now)fail('funding_grant_expired_or_revoked');
 if(!g.projects.some(p=>p.id===project.id&&p.repoId===project.repoId&&p.modelPolicyDigest===modelPolicyDigest))fail('funding_project_policy');
 if(model!==undefined&&!g.models.includes(model))fail('funding_model');
 return b;
}
export function fundingObservations(envelope,binding,context){
 const b=checkFundingBinding(binding,context),at=context.now??Date.now();
 if(b.provider!=='openai')fail('funding_execution_provider_unsupported');
 if(!exact(envelope,['version','actorId','brokerScope','projectId','repositoryId','bindingDigest','checkedAt','expiresAt','observations'])||envelope.version!==1||envelope.actorId!==context.actorId||envelope.brokerScope!==b.brokerScope||envelope.projectId!==context.project.id||envelope.repositoryId!==context.project.repoId||envelope.bindingDigest!==fundingDigest(b)||!iso(envelope.checkedAt)||!iso(envelope.expiresAt)||Date.parse(envelope.checkedAt)>at||at-Date.parse(envelope.checkedAt)>=300000||Date.parse(envelope.expiresAt)<=at||Date.parse(envelope.expiresAt)>Date.parse(envelope.checkedAt)+300000||!Array.isArray(envelope.observations)||!envelope.observations.length||envelope.observations.length>16)fail('funding_evidence_unavailable');
 for(const o of envelope.observations)if(o.provider!==b.provider||o.identity?.account!==b.accountIdentity.account||o.identity?.workspace!==b.accountIdentity.workspace||o.identity?.scope!==b.accountIdentity.scope||o.pool?.id!==b.poolId||o.kind!=='api-rate'||!['requests','tokens','input-tokens','output-tokens'].includes(o.unit)||!iso(o.observedAt)||!iso(o.expiresAt)||Date.parse(o.observedAt)>at||at-Date.parse(o.observedAt)>=300000||Date.parse(o.expiresAt)<=at)fail('funding_capacity_unavailable');
 return envelope.observations.map(o=>({...structuredClone(o),expiresAt:new Date(Math.min(Date.parse(o.expiresAt),Date.parse(envelope.expiresAt),Date.parse(b.evidence.expiresAt),Date.parse(b.grant.expiresAt))).toISOString()}));
}
export function fundingPin(binding,context,claims,{inputTokens,maxOutputTokens}){
 const b=checkFundingBinding(binding,context),metadata=fundingMetadata(b),at=context.now??Date.now();
 if(b.provider!=='openai')fail('funding_execution_provider_unsupported');
 if(!Number.isSafeInteger(inputTokens)||inputTokens<0||!numeric(maxOutputTokens)||!Array.isArray(claims)||!claims.length||claims.length>16)fail('funding_demand');
 const windows=claims.map(c=>{let tuple;try{tuple=JSON.parse(c.poolId);}catch{fail('funding_capacity_unavailable');}
  const demand={requests:1,tokens:inputTokens+maxOutputTokens,'input-tokens':inputTokens,'output-tokens':maxOutputTokens}[c.unit];
  if(!Array.isArray(tuple)||tuple.length!==9||hash(JSON.stringify(tuple.slice(0,5)))!==metadata.pool||tuple[5]!=='api-rate'||tuple[6]!==c.unit||!numeric(tuple[7])||!iso(tuple[8])||c.amount!==demand||!numeric(c.amount)||!Number.isSafeInteger(c.remaining)||c.remaining<0||!iso(c.observedAt)||Date.parse(c.observedAt)>at||at-Date.parse(c.observedAt)>=300000||Date.parse(tuple[8])<=at)fail('funding_capacity_unavailable');
  return {tuple,amount:c.amount,available:c.remaining,observedAt:c.observedAt,expiresAt:new Date(Math.min(Date.parse(tuple[8]),Date.parse(c.observedAt)+300000)).toISOString()};
 });
 if(new Set(windows.map(w=>hash(JSON.stringify(w.tuple)))).size!==windows.length)fail('funding_duplicate_window');
 return {version:1,owner:b.ownerActorId,grant:metadata.grant,grantVersion:metadata.grantVersion,digest:metadata.digest,broker:b.brokerScope,project:fundingProject(b.brokerScope,context.project),modelPolicy:context.modelPolicyDigest,model:context.model,inputTokens,maxOutputTokens,windows,label:'Personal account'};
}
export function sharedFundingSummary(pin){return pin?{kind:'person',label:'Personal account'}:null;}
