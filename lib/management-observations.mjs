// Local startup bindings only. No discovery, execution, credentials or telemetry store.
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { managementProjection } from './management-projection.mjs';
import { recommendationProjection, unavailableRecommendation } from './recommendation-projection.mjs';
export { managementProjection, usageProjection } from './management-projection.mjs';
const fail = code => { throw Object.assign(new Error(code), { exitCode: 2 }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const opaque = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const repo = value => typeof value==='string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
export async function readObservationInput(path) {
  if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0'))fail('observation_input_requires_absolute_path');
  let handle;
  try {
    const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>262144)fail('observation_input_unavailable');
    handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=await handle.stat();if(!before.isFile()||before.nlink!==1||before.ino!==stat.ino||before.dev!==stat.dev)fail('observation_input_changed');
    const buffer=Buffer.alloc(262145);let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,null);if(!bytesRead)break;offset+=bytesRead;}
    const after=await handle.stat();if(offset>262144||before.size!==offset||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)fail('observation_input_changed');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,offset)));
  } catch { fail('observation_input_unavailable'); }
  finally { await handle?.close(); }
}
export function validateUsageBinding(value) {
  if(!exact(value,['manifest','state','projects','pr','actorId','shared'])||![value.manifest,value.state].every(v=>typeof v==='string'&&isAbsolute(v)&&!v.includes('\0'))
    ||!Array.isArray(value.projects)||!value.projects.length||value.projects.length>100||!value.projects.every(repo)||new Set(value.projects.map(v=>v.toLowerCase())).size!==value.projects.length
    ||!(value.actorId===null||opaque(value.actorId))||typeof value.shared!=='boolean'||!value.shared&&!value.actorId
    ||!(value.pr===null||exact(value.pr,['repositoryId','number'])&&[value.pr.repositoryId,value.pr.number].every(v=>Number.isSafeInteger(v)&&v>0)))fail('invalid_usage_binding');
  return structuredClone(value);
}
export async function readUsageBinding(value,{appRoot,now=new Date().toISOString(),verifyRepository=false,github=null}={}) {
  const binding=validateUsageBinding(value);
  const {qualityOperation}=await import('./agent-quality-ledger.mjs');
  const {qualityUsageReport}=await import('./agent-quality-usage.mjs');
  const inspected=await qualityOperation({action:'inspect',manifest:binding.manifest,state:binding.state,appRoot,now});
  let repositoryBindings=[];
  if(verifyRepository) {
    if(!binding.pr||binding.projects.length!==1)fail('repository_verification_requires_one_project_and_pr');
    const {namesGithub,namesRead,validRepo}=await import('./names-actions.mjs');
    const project=binding.projects[0];if(!validRepo(project))fail('invalid_usage_project');
    const metadata=await namesRead(github??namesGithub(),`/repos/${project}`);
    if(!Number.isSafeInteger(metadata?.id)||metadata.id!==binding.pr.repositoryId||typeof metadata.full_name!=='string'||metadata.full_name.toLowerCase()!==project.toLowerCase())fail('repository_identity_mismatch');
    repositoryBindings=[{project,repositoryId:metadata.id}];
  }
  return {...qualityUsageReport(inspected.bundle,{projects:binding.projects,pr:binding.pr,actorId:binding.actorId,shared:binding.shared,now,ledgerCoverage:inspected.coverage,repositoryBindings}),repositoryVerification:verifyRepository?'verified':binding.pr?'unverified':'not-requested'};
}
export async function inspectRoutineRegistry(path,{now=new Date().toISOString()}={}) {
  const registry=await readObservationInput(path);
  const {collectRoutineSources}=await import('./routines/index.mjs');
  return collectRoutineSources({registry,now});
}
export function validateRecommendationBinding(value) {
  if(!exact(value,['input','manifest','state'])||!Object.values(value).every(v=>typeof v==='string'&&isAbsolute(v)&&!v.includes('\0')))fail('invalid_recommendation_binding');
  return structuredClone(value);
}
export async function readRecommendationBinding(value,{appRoot,now=new Date().toISOString()}={}) {
  const binding=validateRecommendationBinding(value),input=await readObservationInput(binding.input);
  const keys=['version','actorId','workspaceId','projectId','repositoryId','project','policyDigest','task','candidates','observations','preferenceOrder'];
  if(!exact(input,keys)||input.version!==1)fail('invalid_recommendation_input');
  const {qualityOperation}=await import('./agent-quality-ledger.mjs');
  const inspected=await qualityOperation({action:'inspect',manifest:binding.manifest,state:binding.state,appRoot,now});
  const manifest=await readObservationInput(binding.manifest);
  if(manifest.id!==input.workspaceId||!manifest.projects.some(p=>p.id===input.projectId&&p.repo.toLowerCase()===input.project.toLowerCase()))fail('recommendation_project_mismatch');
  const {agentRecommendations}=await import('./agent-recommendations.mjs');
  const {version,...claims}=input;
  const qualityBundle={...inspected.bundle,episodes:inspected.bundle.episodes.filter(e=>e.project.toLowerCase()===input.project.toLowerCase())};
  return recommendationProjection(agentRecommendations({...claims,qualityBundle},{authority:null,now}),{localClaims:true});
}
export async function managementObservations(path,{appRoot,now=new Date().toISOString()}={}) {
  const binding=await readObservationInput(path);
  const validShape=binding?.version===1?exact(binding,['version','registry','usage']):binding?.version===2&&exact(binding,['version','registry','usage','recommendation']);
  if(!validShape||!(binding.registry===null||typeof binding.registry==='string'&&isAbsolute(binding.registry))||!binding.registry&&!binding.usage&&!binding.recommendation)fail('invalid_observation_binding');
  if(binding.usage!==null)validateUsageBinding(binding.usage);
  if(binding.version===2&&binding.recommendation!==null)validateRecommendationBinding(binding.recommendation);
  const gaps=[];let observation=null,usage=null;
  if(binding.registry)try{observation=await inspectRoutineRegistry(binding.registry,{now});}catch{gaps.push('routine_source_unavailable');}
  if(binding.usage)try{usage=await readUsageBinding(binding.usage,{appRoot,now});}catch{gaps.push('usage_ledger_unavailable');}
  let recommendation;
  if(binding.recommendation)try{recommendation=await readRecommendationBinding(binding.recommendation,{appRoot,now});}catch{recommendation=unavailableRecommendation('recommendation_input_unavailable');}
  return {...managementProjection({observation,usage,gaps}),...(recommendation?{recommendation}:{})};
}
