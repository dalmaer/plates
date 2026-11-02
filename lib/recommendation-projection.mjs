// Personal display projection. Never serialize account, connection or source identities.
import { createHash } from 'node:crypto';
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const word=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,199}$/.test(v)?v:'unknown';
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const summary=v=>Object.fromEntries(['observed','denominator','min','max','mean','median'].map(k=>[k,number(v?.[k])]));
export function unavailableRecommendation(reason='authenticated_recommendation_transport_unavailable') {
  return {schema:1,kind:'personal-agent-recommendations',generatedAt:null,scope:null,task:null,authorization:'unverified',candidates:[],capacity:{pools:[],aggregation:'none'},recommendation:{state:'unavailable',suggestedCandidateId:null,orderedCandidateIds:[],basis:reason,userControlled:true,automaticRouting:false,reserved:false,executed:false},gaps:[reason],actions:[]};
}
export function recommendationProjection(value,{localClaims=false}={}) {
  return {schema:1,kind:'personal-agent-recommendations',generatedAt:iso(value.generatedAt),scope:{projectId:word(value.scope?.projectId),repositoryId:number(value.scope?.repositoryId),project:word(value.scope?.project),visibility:'personal'},
    task:value.task?Object.fromEntries(['stage','family','specialty','difficultyBand','risk'].map(k=>[k,word(value.task[k])])):null,
    authorization:value.authorization==='caller-attested'&&!localClaims?'caller-attested':'unverified',authorityFreshness:{checkedAt:iso(value.authorityFreshness?.checkedAt),expiresAt:iso(value.authorityFreshness?.expiresAt),maxAgeSeconds:number(value.authorityFreshness?.maxAgeSeconds)},
    provenance:localClaims?'Local claims only. No authenticated account or capacity adapter is configured.':'Current actor and project checked; account, policy and capacity attestations supplied by the trusted adapter.',
    candidates:value.candidates.slice(0,100).map(c=>({id:hash(c.id),provider:word(c.provider),model:word(c.model),configuration:{agentBuild:word(c.configuration?.agentBuild),digest:typeof c.configuration?.digest==='string'&&/^[a-f0-9]{64}$/.test(c.configuration.digest)?c.configuration.digest:null},status:word(c.status),authorization:word(c.authorization),reasons:c.reasons.map(word),windowIds:c.windowIds.map(hash),funding:c.funding?{kind:'person',identity:'current user; account identity withheld'}:null,
      quality:{state:word(c.quality.state),tasks:number(c.quality.tasks),samples:number(c.quality.samples),distribution:summary(c.quality.distribution),recentAttempts:number(c.quality.recentAttempts),newestAt:iso(c.quality.newestAt),minimumSamples:number(c.quality.minimumSamples),freshnessDays:number(c.quality.freshnessDays),uncertainty:c.quality.uncertainty.map(word),superiority:null},
      latency:{...summary(c.latency),unit:'ms',basis:'Historical matched attempts; not a forecast.'},cost:{observedUsd:summary(c.cost.observedUsd),estimatedUsd:summary(c.cost.estimatedUsd),basis:'Historical attributed USD; not a quote or verified billing.'}})),
    capacity:{pools:value.capacity.pools.slice(0,500).map(p=>({id:hash(p.id),provider:word(p.provider),kind:word(p.kind),unit:word(p.unit),measurement:Object.fromEntries(['used','remaining','limit'].map(k=>[k,number(p.measurement[k])])),window:{durationMinutes:number(p.window.durationMinutes),resetAt:iso(p.window.resetAt)},observedAt:iso(p.observedAt),expiresAt:iso(p.expiresAt),state:word(p.state),freshness:word(p.freshness),maxAgeSeconds:number(p.maxAgeSeconds)})),aggregation:'None. Every applicable window constrains availability independently; accounts and sets are never pooled.'},
    recommendation:{state:word(value.recommendation.state),suggestedCandidateId:value.recommendation.suggestedCandidateId?hash(value.recommendation.suggestedCandidateId):null,orderedCandidateIds:value.recommendation.orderedCandidateIds.map(hash),basis:value.recommendation.basis,userControlled:true,automaticRouting:false,reserved:false,executed:false},gaps:localClaims?['local_claims_not_authenticated']:[],actions:[]};
}
