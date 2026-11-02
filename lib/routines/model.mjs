// Metadata-only observation contract. Switchboard a6651db5 supplied source-format
// evidence; this is a Plates-native model, not an execution or migration policy.
import { createHash } from 'node:crypto';
export const SOURCE_KINDS = ['launchd','claude-desktop','codex','vercel','declared','switchboard','github-actions'];
export const LIMITS = Object.freeze({ sources: 30, entries: 500, fileBytes: 4*1024*1024, databaseBytes: 64*1024*1024, totalBytes: 128*1024*1024, milliseconds: 25000, commandBytes: 4*1024*1024 });
export const digest = value => createHash('sha256').update(value).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const slug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
export const identity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
export const nativeIdentity = value => typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\x00-\x1f\x7f]/.test(value);
export const exact = (value, keys) => object(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
export class ObservationError extends Error { constructor(code) { super(code); this.code=code; } }
export const check = (condition, code='invalid_source') => { if(!condition) throw new ObservationError(code); };
export function iso(value) { if(typeof value!=='string'&&typeof value!=='number')return null; const ms=typeof value==='number'?value:Date.parse(value); return Number.isFinite(ms)&&Math.abs(ms)<=8640000000000000?new Date(ms).toISOString():null; }
export function validateRegistry(value) {
  check(exact(value,['version','workspaceId','actorId','sources'])&&value.version===1&&slug(value.workspaceId)&&identity(value.actorId)&&Array.isArray(value.sources)&&value.sources.length<=LIMITS.sources,'invalid_registry');
  const ids=new Set();
  const fields={launchd:['dir','uid','prefixes'],'claude-desktop':['root'],codex:['dbPath','statePath','rolloutRoot'],vercel:['file'],declared:['file'],switchboard:['dir','runFile'],'github-actions':['project']};
  for(const source of value.sources) {
    check(SOURCE_KINDS.includes(source?.kind)&&exact(source,['id','kind','label','scope',...fields[source.kind]])&&slug(source.id)&&!ids.has(source.id),'invalid_registry');ids.add(source.id);
    check(typeof source.label==='string'&&source.label===source.label.trim()&&source.label.length>0&&source.label.length<=80&&!/[\x00-\x1f\x7f]/.test(source.label),'invalid_registry');
    check(exact(source.scope,['projectId','hostId','accountId'])&&(source.scope.projectId===null||slug(source.scope.projectId))&&(source.scope.hostId===null||identity(source.scope.hostId))&&(source.scope.accountId===null||identity(source.scope.accountId)),'invalid_registry');
    if(source.kind!=='github-actions')check(source.scope.hostId!==null&&source.scope.accountId!==null,'invalid_registry');
    for(const key of fields[source.kind].filter(key=>!['uid','prefixes','project'].includes(key)))check(typeof source[key]==='string'&&source[key].startsWith('/')&&!source[key].split('/').includes('..')&&!source[key].includes('\0'),'invalid_registry');
    if(source.kind==='launchd')check(Number.isSafeInteger(source.uid)&&source.uid>=0&&Array.isArray(source.prefixes)&&source.prefixes.length>0&&source.prefixes.length<=30&&source.prefixes.every(v=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(v)),'invalid_registry');
    if(source.kind==='github-actions')check(exact(source.project,['id','repoId','repo'])&&source.project.id===source.scope.projectId&&Number.isSafeInteger(source.project.repoId)&&source.project.repoId>0&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source.project.repo),'invalid_registry');
  }
  return structuredClone(value);
}
export function scopedRegistry(value,{workspaceId,actorId,projectIds}) {
  const registry=validateRegistry(value);
  check(registry.workspaceId===workspaceId&&registry.actorId===String(actorId)&&Array.isArray(projectIds)&&projectIds.every(slug),'source_access_denied');
  return {...registry,sources:registry.sources.filter(source=>source.scope.projectId===null||projectIds.includes(source.scope.projectId))};
}
export const sourceScope = (registry,source) => ({workspaceId:registry.workspaceId,actorId:registry.actorId,projectId:source.scope.projectId,hostId:source.scope.hostId,accountId:source.scope.accountId});
export const observationId = (scope,kind,native) => digest(JSON.stringify(['plates-routine-observation-v1',[scope.workspaceId,scope.actorId,scope.projectId,scope.hostId,scope.accountId],kind,native]));
const canonicalFacts = value => Array.isArray(value)?value.map(canonicalFacts):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalFacts(value[key])])):value;
export function schedule(kind, raw, timezone=null) {
  if(kind==='cron'&&typeof raw==='string'&&raw.length<=160&&/^[\d*,/\- ]+$/.test(raw)&&raw.trim().split(/\s+/).length===5)return {kind,raw:raw.trim(),timezone:timezone==='UTC'?'UTC':null,interpreted:false};
  if(kind==='rrule'&&typeof raw==='string'&&raw.length<=500) {
    const parts=raw.replace(/^RRULE:/,'').split(';').map(part=>part.split('=')),keys=new Set();
    const ranges={INTERVAL:[1,10000],COUNT:[1,100000],BYHOUR:[0,23],BYMINUTE:[0,59],BYMONTH:[1,12],BYMONTHDAY:[-31,31]};
    const valid=parts.every(([key,value,...extra])=>{if(!key||!value||extra.length||keys.has(key))return false;keys.add(key);
      if(key==='FREQ')return ['DAILY','WEEKLY','MONTHLY','YEARLY','HOURLY','MINUTELY'].includes(value);
      if(key==='BYDAY')return /^(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR|SA|SU))*$/.test(value);
      if(key==='WKST')return /^(?:MO|TU|WE|TH|FR|SA|SU)$/.test(value);
      if(key==='UNTIL')return /^\d{8}T\d{6}Z$/.test(value);
      if(ranges[key])return value.split(',').every(item=>/^-?\d{1,6}$/.test(item)&&Number(item)>=ranges[key][0]&&Number(item)<=ranges[key][1]&&(key!=='BYMONTHDAY'||Number(item)!==0));
      return false;});
    if(valid&&keys.has('FREQ'))return {kind,raw,timezone:null,interpreted:false};
  }
  if(kind==='calendar') {
    const rows=Array.isArray(raw)?raw:[raw],ranges={Month:[1,12],Day:[1,31],Weekday:[0,7],Hour:[0,23],Minute:[0,59]};
    if(rows.length>0&&rows.length<=100&&rows.every(row=>object(row)&&Object.keys(row).length>0&&Object.entries(row).every(([key,value])=>ranges[key]&&Number.isSafeInteger(value)&&value>=ranges[key][0]&&value<=ranges[key][1])))return {kind,raw:structuredClone(rows),timezone:null,interpreted:false};
  }
  if(kind==='interval'&&Number.isSafeInteger(raw)&&raw>0&&raw<=31536000)return {kind,raw,timezone:null,interpreted:true};
  if(['manual','event','continuous','at-load','none'].includes(kind))return {kind,raw:null,timezone:null,interpreted:kind!=='event'};
  return {kind:'unknown',raw:null,timezone:null,interpreted:false};
}
export function routine(context,native,{revision,status='unknown',trigger=schedule('unknown'),placement='unknown',runner='unknown',confirmedAt=null}={}) {
  context.reserve?.('routines');
  check(nativeIdentity(native));
  return {id:observationId(context.scope,context.source.kind,['routine',native]),sourceId:context.source.id,source:context.source.kind,scope:{...context.scope},name:`${context.source.label} · ${digest(native).slice(0,8)}`,revision:revision??null,status:['active','paused','disabled','unknown'].includes(status)?status:'unknown',schedule:trigger,placement:['home','cloud','unknown'].includes(placement)?placement:'unknown',runner:['shell','claude','codex','github-actions','vercel','unknown'].includes(runner)?runner:'unknown',confirmedAt:iso(confirmedAt),observedAt:context.now,acceptance:'not-established'};
}
export function attempt(context,routineId,native,{state='unknown',startedAt=null,completedAt=null,revision=null,timeBasis='source-recorded',parentId=null,retryOf=null}={}) {
  context.reserve?.('attempts');
  check(nativeIdentity(native)&&/^[a-f0-9]{64}$/.test(routineId));
  const start=iso(startedAt),end=iso(completedAt);
  check(!start||Date.parse(start)<=Date.parse(context.now));check(!end||(!start||end>=start)&&Date.parse(end)<=Date.parse(context.now));
  return {id:observationId(context.scope,context.source.kind,['attempt',native]),routineId,sourceId:context.source.id,source:context.source.kind,scope:{...context.scope},state:['queued','waiting','running','succeeded','failed','cancelled','skipped','unknown'].includes(state)?state:'unknown',startedAt:start,completedAt:end,durationMs:start&&end?Date.parse(end)-Date.parse(start):null,timeBasis,revision,parentId,retryOf,observedAt:context.now,acceptance:'not-established',usage:null};
}
export function uniqueObservations(values) {
  const found=new Map(),conflicts=new Set(),origins=new Map();
  const facts = ({sourceId,name,sourceIds,...value}) => JSON.stringify(canonicalFacts(value));
  for(const value of values){
    const old=found.get(value.id);
    if(old&&facts(old)!==facts(value))conflicts.add(value.id);else if(!old)found.set(value.id,value);
    if(value.sourceId)origins.set(value.id,new Set([...(origins.get(value.id)||[]),value.sourceId]));
  }
  for(const id of conflicts)found.delete(id);
  return {values:[...found.values()].map(value=>origins.get(value.id)?.size>1?{...value,sourceIds:[...origins.get(value.id)].sort()}:value),conflicts:conflicts.size};
}
