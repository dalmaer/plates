// Plates-native dormant policy. Imported declarations describe intent, never grants.
import { fingerprint } from '../evaluation-records.mjs';
import { exact, identity, slug, object } from './model.mjs';
export class RoutinePolicyError extends Error { constructor(code) { super(code); this.code=code; } }
export const policyCheck=(ok,code='invalid_routine_policy')=>{if(!ok)throw new RoutinePolicyError(code);};
export const policyHash=value=>fingerprint(value);
export const hashId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
const list=(value,test,max=50)=>Array.isArray(value)&&value.length<=max&&value.every(test);
const unique=(value,key)=>new Set(value.map(key)).size===value.length;
export const repositoryBinding=value=>exact(value,['id','repoId','repo'])&&slug(value.id)&&integer(value.repoId,1,Number.MAX_SAFE_INTEGER)&&typeof value.repo==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value.repo)&&!value.repo.toLowerCase().endsWith('.git');
export const contentReference=value=>exact(value,['sha256','bytes'])&&hashId(value.sha256)&&integer(value.bytes,1,4*1024*1024);
export function validCron(value) {
  if(typeof value!=='string'||value.length>160||value!==value.trim())return false;
  const fields=value.split(' '),bounds=[[0,59],[0,23],[1,31],[1,12],[0,7]];
  return fields.length===5&&fields.every((field,index)=>field.split(',').every(part=>{
    const match=/^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(part);if(!match)return false;
    const [min,max]=bounds[index],step=match[2]===undefined?1:Number(match[2]);
    if(!integer(step,1,max-min+1))return false;
    if(match[1]==='*')return true;
    const [start,end=Number(match[1])]=match[1].split('-').map(Number);
    return integer(start,min,max)&&integer(end,start,max);
  }));
}
export function validTimeZone(value) {
  if(typeof value!=='string'||value.length>100||! /^(?:UTC|[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value))return false;
  try {new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}
}
export function validateRoutinePolicy(value,context) {
  let serialized;try{serialized=JSON.stringify(value);}catch{policyCheck(false);}
  policyCheck(object(value)&&Buffer.byteLength(serialized??'')<=65536);
  policyCheck(exact(value,['schemaVersion','id','scope','purpose','task','trigger','placement','adapters','connections','effects','bounds','overlap','state'])&&value.schemaVersion===1&&slug(value.id)&&value.state==='dormant');
  const scope=value.scope;
  policyCheck(exact(scope,['workspaceId','actorId','project'])&&slug(scope.workspaceId)&&identity(scope.actorId)&&(scope.project===null||repositoryBinding(scope.project)));
  policyCheck(context&&scope.workspaceId===context.workspaceId&&scope.actorId===context.actorId&&Array.isArray(context.projects),'policy_scope_mismatch');
  if(scope.project)policyCheck(context.projects.some(project=>repositoryBinding(project)&&policyHash(project)===policyHash(scope.project)),'policy_scope_mismatch');
  policyCheck(text(value.purpose,2000)&&contentReference(value.task));
  const trigger=value.trigger;
  policyCheck(object(trigger));
  if(trigger.kind==='manual')policyCheck(exact(trigger,['kind']));
  else if(trigger.kind==='cron')policyCheck(exact(trigger,['kind','expression','timeZone'])&&validCron(trigger.expression)&&validTimeZone(trigger.timeZone),'unsupported_policy_trigger');
  else if(trigger.kind==='event')policyCheck(exact(trigger,['kind','provider','event','matchRef','catchUp'])&&trigger.provider==='benos'&&trigger.event==='sync.completed'&&contentReference(trigger.matchRef)&&exact(trigger.catchUp,['overlapSeconds','retentionDays','initial'])&&integer(trigger.catchUp.overlapSeconds,0,86400)&&integer(trigger.catchUp.retentionDays,1,365)&&trigger.catchUp.initial==='now','unsupported_policy_trigger');
  else policyCheck(false,'unsupported_policy_trigger');
  policyCheck(exact(value.placement,['kind','requirements'])&&['home','cloud'].includes(value.placement.kind)&&list(value.placement.requirements,identity)&&unique(value.placement.requirements,x=>x));
  policyCheck(list(value.adapters,adapter=>exact(adapter,['id','version'])&&slug(adapter.id)&&typeof adapter.version==='string'&&/^\d+(?:\.\d+){0,2}$/.test(adapter.version),10)&&value.adapters.length>0&&unique(value.adapters,x=>x.id));
  policyCheck(list(value.connections,connection=>exact(connection,['id','policyDigest','generation'])&&slug(connection.id)&&hashId(connection.policyDigest)&&integer(connection.generation,1,2147483647))&&unique(value.connections,x=>x.id));
  const connections=new Set(value.connections.map(x=>x.id));
  policyCheck(list(value.effects,effect=>exact(effect,['kind','targetRef','connectionId','review'])&&['drive.file','notification','benos.change'].includes(effect.kind)&&hashId(effect.targetRef)&&slug(effect.connectionId)&&connections.has(effect.connectionId)&&effect.review==='required')&&unique(value.effects,x=>policyHash(x)));
  policyCheck(exact(value.bounds,['runtimeSeconds','modelCalls','maxCostMicroUsd'])&&integer(value.bounds.runtimeSeconds,1,86400)&&integer(value.bounds.modelCalls,0,100)&&integer(value.bounds.maxCostMicroUsd,0,1000000000000)&&['wait','refuse'].includes(value.overlap));
  // Canonical order makes the stored policy digest independent of input key order.
  return JSON.parse(canonicalPolicy(value));
}
function canonicalPolicy(value) {
  if(Array.isArray(value))return `[${value.map(canonicalPolicy).join(',')}]`;
  if(object(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalPolicy(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function routinePolicySummary(policy) {
  return {id:policy.id,scope:structuredClone(policy.scope),digest:policyHash(policy),task:structuredClone(policy.task),trigger:{kind:policy.trigger.kind,...(policy.trigger.kind==='cron'?{expression:policy.trigger.expression,timeZone:policy.trigger.timeZone}:{})},placement:policy.placement.kind,adapterCount:policy.adapters.length,connectionCount:policy.connections.length,effectKinds:[...new Set(policy.effects.map(effect=>effect.kind))].sort(),bounds:structuredClone(policy.bounds),overlap:policy.overlap,state:'dormant',dispatchEnabled:false,authority:'declared-policy-only'};
}
