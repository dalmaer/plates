// Synthetic current-actor adapter attestations; no credential or live quota.
import { sealRecord, fingerprint } from '../../lib/evaluation-records.mjs';
import { acmeQualityEpisode, acmeQualityBundle, QUALITY_HASH } from './agent-quality.mjs';
import { observation } from './web-capacity.mjs';
export function recommendationFixture({actorId='alice',workspaceId='acme',projectId='widget',repositoryId=102,project='acme/widget',now='2026-10-30T01:00:00.000Z'}={}) {
  const expiresAt=new Date(Date.parse(now)+240000).toISOString(),scope={actorId,workspaceId,projectId,repositoryId,project,policyDigest:QUALITY_HASH};
  const episodes=Array.from({length:3},(_,n)=>{const e=structuredClone(acmeQualityEpisode(`acme-task-${n}`));e.project=project;e.attempts[0].agent.provider='codex';e.attempts[0].agent.model='acme-model';return sealRecord(e);});
  const candidate={id:'PRIVATE-CHOICE',actorId,workspaceId,projectId,repositoryId,policyDigest:QUALITY_HASH,provider:'codex',model:'acme-model',accountId:`PRIVATE-ACCOUNT-${actorId}`,poolId:'PRIVATE-POOL',fundingKind:'person',connectionId:'PRIVATE-CONNECTION',connectionGeneration:1,expiresAt,stages:['coding','review'],capabilities:['acme-tools'],requiredWindows:[{kind:'subscription',unit:'percent',durationMinutes:300}],agent:{...episodes[0].attempts[0].agent}};
  const capacity=observation({identity:{account:candidate.accountId,workspace:null,scope:'account',provenance:'authenticated-reporter'},pool:{id:candidate.poolId,provenance:'authenticated-reporter'},observedAt:now,expiresAt,window:{durationMinutes:300,resetAt:new Date(Date.parse(now)+300*60000).toISOString()}});
  const input={...scope,task:{stage:'coding',family:'feature',specialty:'frontend',difficultyBand:'medium',risk:'medium',requiredCapabilities:['acme-tools'],independentFromProvider:null},candidates:[candidate],observations:[capacity],qualityBundle:acmeQualityBundle(episodes),preferenceOrder:[]};
  return {input,authority:attestRecommendation(input,now)};
}
export function attestRecommendation(input,now) {
  const expiresAt=new Date(Date.parse(now)+240000).toISOString();
  return {...Object.fromEntries(['actorId','workspaceId','projectId','repositoryId','project','policyDigest'].map(k=>[k,input[k]])),checkedAt:now,expiresAt,candidateDigests:input.candidates.map(fingerprint),capacityDigests:input.observations.map(fingerprint),qualityEpisodeDigests:input.qualityBundle.episodes.map(e=>e.digest),accountBindings:[...new Map(input.candidates.map(c=>[c.accountId,{provider:c.provider,accountId:c.accountId,actorId:c.actorId}])).values()],connections:[...new Map(input.candidates.map(c=>[c.connectionId,{id:c.connectionId,generation:c.connectionGeneration,expiresAt}])).values()]};
}
