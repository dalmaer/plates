// Synthetic checked private funding and canonical AQ-shaped records. No live I/O.
import { recommendationFixture } from './recommendation-surfaces.mjs';
import { fundingBroker } from '../../lib/web/funding.mjs';
import { sealRecord } from '../../lib/evaluation-records.mjs';
import { validateModelPolicy } from '../../lib/web/model-policy.mjs';
export function recommendationServiceFixture({project={id:'widget',repoId:102,repo:'acme/widget'},config=null}={}) {
 const state={now:Date.parse('2026-10-30T01:00:00.000Z'),fundingReads:0,capacityReads:0,policyReads:0,qualityReads:0};
 config??={appId:11,installationId:21,workspace:{id:'acme',repoId:101},ownerIds:[1,2],projectRepoIds:{[project.id]:project.repoId}};
 const stamp=new Date(state.now).toISOString(),expiresAt=new Date(state.now+240000).toISOString(),digest='a'.repeat(64),connectionDigest='b'.repeat(64);
 config.personalFunding={enabled:true,brokerScope:fundingBroker(config),verifiedAt:stamp,restoreReconciledAt:stamp};
 const {input}=recommendationFixture({actorId:'1',projectId:project.id,repositoryId:project.repoId,project:project.repo});
 input.candidates[0].provider='openai';input.candidates[0].agent.provider='openai';input.observations[0].provider='openai';input.qualityBundle.episodes=input.qualityBundle.episodes.map(e=>{e.attempts[0].agent.provider='openai';return sealRecord(e);});
 input.candidates[0].id='acme-choice';input.candidates[0].connectionId='acme-connection';input.candidates[0].requiredWindows=[{kind:'api-rate',unit:'tokens',durationMinutes:300}];input.observations[0].kind='api-rate';input.observations[0].unit='tokens';
 const candidate=input.candidates[0],descriptor={version:1,id:candidate.connectionId,provider:'openai',label:'Acme account',projects:[{id:project.id,repoId:project.repoId}],enabled:true,scope:{organization:null,project:null,workspace:null},secretRef:'c'.repeat(64)};
 const binding={version:1,ownerActorId:1,provider:'openai',accountIdentity:{account:candidate.accountId,workspace:null,scope:'account'},poolId:candidate.poolId,brokerScope:fundingBroker(config),connectionGeneration:1,connectionPolicyDigest:connectionDigest,grant:{id:'d'.repeat(64),version:1,state:'active',projects:[{id:project.id,repoId:project.repoId,modelPolicyDigest:digest}],models:[candidate.model],expiresAt},evidence:{digest:'e'.repeat(64),observedAt:stamp,expiresAt}};
 const record={descriptor,policyDigest:connectionDigest},model={digest,policy:validateModelPolicy({version:1,enabled:true,taskClass:'planning',adapter:'project-evidence-brief-v1',automaticFallback:false,candidates:[{id:candidate.id,connectionId:candidate.connectionId,model:candidate.model,unknownCapacity:'wait'}],requirements:{minimumContext:10000,privacy:'allow-temporary-provider-retention',independentReview:false},limits:{maxInputTokens:10000,maxOutputTokens:1000,attemptMicroUsd:30000,taskMicroUsd:60000,workspaceMicroUsd:120000,projectMicroUsd:120000,connectionMicroUsd:120000,concurrency:2},capacity:{maxAgeSeconds:60,reservePercent:10,cooldownSeconds:60,reentryPercent:20}})};
 const access={userId:1,workspace:{id:'acme'},projects:[project]};
 const profile={task:input.task,candidates:[Object.fromEntries(['id','connectionId','model','stages','capabilities','requiredWindows','agent'].map(k=>[k,candidate[k]]))],preferenceOrder:[]};
 const options={now:()=>state.now,profileFor:async()=>structuredClone(profile),capacityReader:async()=>{state.capacityReads++;return{observations:structuredClone(input.observations),gaps:[]};},qualityReader:async()=>{state.qualityReads++;return structuredClone(input.qualityBundle);},services:{policies:{read:async()=>{state.policyReads++;return structuredClone(model);}},connections:{read:async()=>({records:[structuredClone(record)],gaps:[]}),authorize:()=>{}},store:{readFunding:async(_descriptor,actor)=>{state.fundingReads++;return actor===1?{version:binding.connectionGeneration,state:'present',policy:binding.connectionPolicyDigest,binding:structuredClone(binding)}:null;}}}};
 return{config,state,options,access,project,binding,profile,model,record,input,request:()=>({access,token:'acme-session',project,reauthorize:async()=>structuredClone(access)})};
}
