// Independently implemented import planning from Switchboard src/state.ts,
// routines.ts, types.ts and outbox.ts at a6651db5. Source license was absent;
// no original source is vendored. This module never imports or activates state.
import { join, relative as relativePath, isAbsolute } from 'node:path';
import { evaluationScope } from '../evaluation-ledger.mjs';
import { byteDigest } from '../evaluation-records.mjs';
import { budget, canonical, readBytes, list, safeCode } from './sources/files.mjs';
import { exact, identity, slug, object, iso } from './model.mjs';
import { RoutinePolicyError, policyCheck as check, policyHash, hashId, repositoryBinding, validateRoutinePolicy, routinePolicySummary } from './definitions.mjs';
export const IMPORT_LIMITS=Object.freeze({routines:50,files:500,bytes:32*1024*1024,records:500,effects:500,items:50});
const timestamp=value=>typeof value==='string'&&iso(value)!==null;
const native=value=>typeof value==='string'&&value.length>0&&value.length<=500&&!/[\x00-\x1f\x7f]/.test(value);
const relative=value=>typeof value==='string'&&value.length<=1024&&!value.includes('\\')&&!value.includes(':')&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part!=='.git');
const runKey=at=>at.replace(/[:.]/g,'-');
const errorCodes=new Set(['unsafe_path','source_changed','byte_limit','entry_limit','read_timeout','source_unavailable']);
const sanitizedError=error=>error instanceof RoutinePolicyError?error:new RoutinePolicyError(errorCodes.has(safeCode(error))?safeCode(error):'import_input_unavailable');
function sourceDescriptor(source) {
  check(exact(source,['id','root','hostId','accountId','boundary'])&&slug(source.id)&&identity(source.hostId)&&identity(source.accountId),'invalid_import_source');
  check(typeof source.root==='string'&&source.root.length<=4096&&source.root.startsWith('/')&&!source.root.split('/').includes('..')&&!/[\x00-\x1f\x7f]/.test(source.root),'unsafe_path');
  check(exact(source.boundary,['kind','evidenceDigest'])&&(['unverified','declared-frozen'].includes(source.boundary.kind))&&(source.boundary.kind==='unverified'?source.boundary.evidenceDigest===null:hashId(source.boundary.evidenceDigest)),'invalid_snapshot_boundary');
}
/** Private preparation seam for a future store. Do not serialize this result to CLI/web. */
export async function prepareRoutineImport(options,{afterInventory}={}) {
  try {return await prepare(options,afterInventory);}catch(error){throw sanitizedError(error);}
}
/** Public read-only projection: no task text, effect payloads, native IDs or paths. */
export async function previewRoutineImport(options,dependencies) {return (await prepareRoutineImport(options,dependencies)).preview;}
async function prepare(options,afterInventory) {
  check(exact(options,['workspace','actorId','repositoryBindings','source','mappings','now']),'invalid_import_options');
  check(identity(options.actorId)&&timestamp(options.now)&&iso(options.now)===options.now,'invalid_import_options');
  sourceDescriptor(options.source);
  check(exact(options.workspace,['manifest','state','appRoot']),'invalid_import_options');
  const bound=await evaluationScope(options.workspace),source=options.source;
  const root=(await canonical(source.root,true)).path;
  const inside=(parent,child)=>{const path=relativePath(parent,child);return path===''||!path.startsWith('../')&&!isAbsolute(path)&&path!=='..';};
  check(!inside(root,bound.paths.state)&&!inside(bound.paths.state,root),'source_destination_overlap');
  const projects=options.repositoryBindings;
  check(Array.isArray(projects)&&projects.length<=100&&projects.every(repositoryBinding)&&new Set(projects.map(p=>p.id)).size===projects.length&&new Set(projects.map(p=>p.repoId)).size===projects.length,'invalid_repository_binding');
  for(const project of projects)check(bound.projects.some(p=>p.id===project.id&&p.repo.toLowerCase()===project.repo.toLowerCase()),'repository_binding_mismatch');
  const context={workspaceId:bound.workspace.id,actorId:options.actorId,projects};
  check(Array.isArray(options.mappings)&&options.mappings.length>0&&options.mappings.length<=IMPORT_LIMITS.routines,'invalid_import_mapping');
  const mappings=options.mappings.map(mapping=>{
    check(exact(mapping,['legacyId','policy'])&&typeof mapping.legacyId==='string'&&/^switchboard:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mapping.legacyId),'invalid_import_mapping');
    return {legacyId:mapping.legacyId,policy:validateRoutinePolicy(mapping.policy,context)};
  });
  check(new Set(mappings.map(m=>m.legacyId)).size===mappings.length&&new Set(mappings.map(m=>m.policy.id)).size===mappings.length,'duplicate_import_identity');
  const binding={workspace:bound,actorId:options.actorId,repositoryBindings:projects,ownerAssurance:'declared-local-owner'};
  const bindingDigest=policyHash(binding),byLegacy=new Map(mappings.map(m=>[m.legacyId,m])),boundRead=budget();
  const files=new Map(),directories=new Map(),missing=new Set(),gaps=new Map(),aliases=[],history=[],effects=[],cursors=[],definitions=[];
  let bytes=0;
  const gap=(code,routineId=null,ref=null)=>{const value={code,routineId,ref};gaps.set(policyHash(value),value);};
  gap('source_identity_declared');gap('local_owner_declared');gap('numeric_repository_binding_declared');gap('snapshot_boundary_unverified');
  const aliasId=(kind,parts)=>policyHash(['routine-import-v1',bindingDigest,source.id,source.hostId,source.accountId,kind,parts]);
  async function capture(path,role,{required=true,disposition='copy'}={}) {
    check(relative(path),'unsafe_path');
    if(files.has(path))return files.get(path);
    check(files.size<IMPORT_LIMITS.files,'entry_limit');
    let raw;
    try {raw=await readBytes(join(source.root,path),boundRead);}catch(error){if(error.code==='ENOENT'){missing.add(path);if(required)gap('source_file_missing',null,aliasId('missing',path));return null;}throw error;}
    bytes+=raw.length;check(bytes<=IMPORT_LIMITS.bytes,'byte_limit');
    const descriptor={id:aliasId('artifact',path),path,role,sha256:byteDigest(raw),bytes:raw.length,disposition};
    const value={descriptor,raw};files.set(path,value);return value;
  }
  function json(file,routineId=null) {
    if(!file)return null;
    try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.raw));}catch{file.descriptor.disposition='quarantine';gap('malformed_source',routineId,file.descriptor.id);return null;}
  }
  async function names(path) {
    if(directories.has(path))return directories.get(path);
    let entries;
    try {entries=await list(join(source.root,path),boundRead);}catch(error){if(error.code==='ENOENT'){missing.add(path);return [];}throw error;}
    directories.set(path,entries);check(directories.size<=IMPORT_LIMITS.files,'entry_limit');return entries;
  }
  function recordLines(file,limit) {
    if(!file)return [];
    const rows=[];let offset=0,line=0;
    while(offset<file.raw.length) {
      check(rows.length<limit,'entry_limit');const end=file.raw.indexOf(10,offset),stop=end<0?file.raw.length:end;
      const raw=file.raw.subarray(offset,stop),start=offset;offset=end<0?file.raw.length:end+1;line++;
      if(!raw.length)continue;
      const ref={artifactId:file.descriptor.id,byteOffset:start,byteLength:raw.length,line,sha256:byteDigest(raw)};
      if(end<0){gap('torn_log',null,policyHash(ref));file.descriptor.disposition='quarantine';rows.push({ref,value:null});continue;}
      try {rows.push({ref,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))});}catch{rows.push({ref,value:null});gap('malformed_log_record',null,policyHash(ref));}
    }
    return rows;
  }
  for(const mapping of mappings) {
    const {legacyId,policy}=mapping,dir=legacyId.slice(12),definition=await capture(`routines/${dir}/routine.json`,'definition'),task=await capture(`routines/${dir}/task.md`,'task');
    const declaration=json(definition,policy.id);
    if(task)check(policy.task.sha256===task.descriptor.sha256&&policy.task.bytes===task.descriptor.bytes,'task_reference_mismatch');
    if(definition&&policy.trigger.kind==='event')check(policy.trigger.matchRef.sha256===definition.descriptor.sha256&&policy.trigger.matchRef.bytes===definition.descriptor.bytes,'match_reference_mismatch');
    if(definition) {
      if(!object(declaration)||Object.keys(declaration).some(key=>!['name','trigger','placement','runners','needs','permissions','review'].includes(key))){gap('unsupported_definition_fields',policy.id,definition.descriptor.id);definition.descriptor.disposition='quarantine';}
      const trigger=declaration?.trigger;
      if(exact(trigger,['manual'])&&trigger.manual===true){if(policy.trigger.kind!=='manual')gap('trigger_mapping_changed',policy.id);}
      else if(exact(trigger,['schedule'])&&typeof trigger.schedule==='string') {
        if(policy.trigger.kind!=='cron'||policy.trigger.expression!==trigger.schedule)gap('trigger_mapping_changed',policy.id);
        // The legacy declaration does not establish its scheduler timezone.
        gap('legacy_timezone_unverified',policy.id);
      }else if(exact(trigger,['event'])&&object(trigger.event)) {
        // matchRef above binds original file bytes, not reserialized nested JSON.
        if(policy.trigger.kind!=='event')gap('trigger_mapping_changed',policy.id);
        const event=trigger.event,instances=typeof event.instance==='string'?[event.instance]:event.instance,match=event.match;
        const stringList=value=>typeof value==='string'?native(value):Array.isArray(value)&&value.length>0&&value.length<=50&&value.every(native);
        if(!exact(event,['kind','instance','match'])||event.kind!=='sync.completed'||!Array.isArray(instances)||!instances.length||instances.length>50||!instances.every(native)||!object(match)||!Object.keys(match).length||Object.entries(match).some(([key,value])=>key==='label'?!native(value):!['from','phrases'].includes(key)||!stringList(value))){gap('unsupported_event_shape',policy.id);definition.descriptor.disposition='quarantine';}
      }else gap('unsupported_trigger',policy.id);
      if(!exact(declaration?.placement,['where','because'])&&!exact(declaration?.placement,['where']))gap('unsupported_placement',policy.id);
      if(declaration?.placement?.where!==policy.placement.kind)gap('placement_mapping_changed',policy.id);
      const runners=declaration?.runners,needs=declaration?.needs??[],permissions=declaration?.permissions??{},review=declaration?.review??{};
      if(!Array.isArray(runners)||!runners.length||runners.length>2||!runners.every(value=>['claude','codex'].includes(value))||new Set(runners).size!==runners.length)gap('unsupported_legacy_adapters',policy.id);
      else if(policyHash(runners.map(id=>`${id}-cli`))!==policyHash(policy.adapters.map(adapter=>adapter.id)))gap('adapter_mapping_changed',policy.id);
      if(!Array.isArray(needs)||needs.length>50||!needs.every(native))gap('unsupported_requirements',policy.id);
      else if(policyHash([...needs].sort())!==policyHash([...policy.placement.requirements].sort()))gap('requirements_mapping_changed',policy.id);
      if(!object(permissions)||Object.entries(permissions).some(([key,value])=>!['tools','folders','outward'].includes(key)||!Array.isArray(value)||value.length>50||!value.every(native)))gap('unsupported_legacy_permissions',policy.id);
      if(!object(review)||Object.entries(review).some(([key,value])=>!({data:['benos','none'],repo:['other-runner','none'],outbox:['approve','none']}[key]?.includes(value))))gap('unsupported_legacy_review',policy.id);
      // Legacy permissions/runner choices are evidence only, never current grants.
      gap('legacy_permissions_require_review',policy.id);
      if(policy.connections.length)gap('connections_unverified',policy.id);
      gap('adapters_unverified',policy.id);
    }
    const destinationId=aliasId('routine',legacyId);
    definitions.push({id:destinationId,policy,legacyId,definitionRef:definition?.descriptor.id??null,taskRef:task?.descriptor.id??null,dispatchEnabled:false});
    aliases.push({id:aliasId('alias',['routine',legacyId]),kind:'routine',legacyId,destinationId,source:definition?{artifactId:definition.descriptor.id,sha256:definition.descriptor.sha256}:null});
  }
  const configuration=await capture('switchboard.json','configuration',{required:false,disposition:'project'}),config=json(configuration);
  if(configuration) {
    if(!object(config)||!Array.isArray(config.repos??[])||(config.repos??[]).length>100||!(config.repos??[]).every(repo=>typeof repo==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))) {configuration.descriptor.disposition='exclude';gap('unsupported_configuration');}
    else {configuration.descriptor.projection={repos:config.repos??[]};if(Object.keys(config).some(key=>key!=='repos'))gap('configuration_fields_excluded');}
  }
  const declared=await capture('routines.declared.json','declared',{required:false,disposition:'exclude'});
  if(declared)gap('declared_mapping_required',null,declared.descriptor.id);
  const log=await capture('state/runs.jsonl','history',{disposition:'selected-records'}),records=recordLines(log,IMPORT_LIMITS.records),groups=new Map();
  for(const record of records) {
    const row=record.value;if(!object(row)||!byLegacy.has(row.routineId))continue;
    const mapping=byLegacy.get(row.routineId),approval=row.kind==='approval',at=approval?row.run:row.startedAt;
    if(!timestamp(at)||!approval&&!['ok','failed','unknown','queued','refused'].includes(row.outcome)||approval&&!Array.isArray(row.effects)) {gap('unsupported_history_record',mapping.policy.id,policyHash(record.ref));continue;}
    const destinationId=aliasId(approval?'approval':'history',[row.routineId,record.ref.sha256]);
    const item={id:destinationId,kind:approval?'approval':'run',routineId:mapping.policy.id,legacyId:row.routineId,at,source:record.ref,outcome:approval?null:row.outcome,disposition:'historical-unverified',runId:null};
    history.push(item);aliases.push({id:aliasId('alias',record.ref),kind:item.kind,legacyId:row.routineId,destinationId,source:record.ref});
    if(!approval){const key=`${row.routineId}\0${at}`;if(!groups.has(key))groups.set(key,new Map());groups.get(key).set(record.ref.sha256,item);}
  }
  for(const group of groups.values())if(group.size>1)for(const row of group.values()){row.disposition='quarantined';gap('ambiguous_run_identity',row.routineId,row.id);}
  for(const row of history)if(row.kind==='approval') {
    const group=groups.get(`${row.legacyId}\0${row.at}`);
    if(group?.size===1)row.runId=[...group.values()][0].id;else {row.disposition='quarantined';gap('ambiguous_approval_join',row.routineId,row.id);}
  }
  for(const mapping of mappings) {
    const dir=mapping.legacyId.slice(12),base=`state/${dir}`,cursorFile=await capture(`${base}/events.json`,'cursor',{required:mapping.policy.trigger.kind==='event'}),cursor=json(cursorFile,mapping.policy.id);
    if(cursorFile) {
      const valid=exact(cursor,['since','seen'])&&timestamp(cursor.since)&&Array.isArray(cursor.seen)&&cursor.seen.length<=IMPORT_LIMITS.records&&cursor.seen.every(row=>exact(row,['ref','lastAt'])&&native(row.ref)&&timestamp(row.lastAt))&&new Set(cursor.seen.map(row=>row.ref)).size===cursor.seen.length;
      if(valid)cursors.push({routineId:mapping.policy.id,artifactId:cursorFile.descriptor.id,sha256:cursorFile.descriptor.sha256,state:'dormant'});
      else {cursorFile.descriptor.disposition='quarantine';gap('unsupported_cursor',mapping.policy.id,cursorFile.descriptor.id);}
    }
    const boxes=[{path:`${base}/outbox`,state:'unresolved',run:null}];
    for(const [directory,state] of [['outbox-held','held'],['outbox-done','historical']])for(const name of await names(`${base}/${directory}`)) {
      check(/^[A-Za-z0-9_-]{1,100}$/.test(name),'unsafe_path');
      const candidates=[...groups.entries()].filter(([key])=>key.startsWith(`${mapping.legacyId}\0`)&&runKey(key.split('\0')[1])===name).flatMap(([,group])=>[...group.values()]);
      boxes.push({path:`${base}/${directory}/${name}`,state,run:candidates.length===1?candidates[0]:null});
      if(candidates.length!==1)gap('ambiguous_outbox_join',mapping.policy.id,aliasId('outbox',name));
    }
    for(const box of boxes) {
      const items=await capture(`${box.path}/items.jsonl`,'outbox',{required:box.state!=='unresolved',disposition:'selected-records'});
      if(!items)continue;
      if(box.state==='unresolved')gap('pending_outbox_unresolved',mapping.policy.id,items.descriptor.id);
      if(box.state==='held')gap('legacy_hold_requires_current_review',mapping.policy.id,items.descriptor.id);
      for(const record of recordLines(items,IMPORT_LIMITS.items)) {
        check(effects.length<IMPORT_LIMITS.effects,'entry_limit');
        const item=record.value,id=aliasId('effect',record.ref);let valid=false,attachmentRef=null,targetRef=null;
        if(exact(item,['kind','text'])&&item.kind==='notify'&&typeof item.text==='string'&&item.text.length>0&&item.text.length<=200)valid=true;
        else if(object(item)&&item.kind==='drive.file'&&typeof item.folder==='string'&&/^[A-Za-z0-9_-]{10,128}$/.test(item.folder)&&native(item.name)) {
          targetRef=byteDigest(Buffer.from(item.folder));
          if(exact(item,['kind','folder','name','path'])) {
            check(relative(item.path)&&item.path!=='items.jsonl','unsafe_path');
            const attachment=await capture(`${box.path}/${item.path}`,'attachment');attachmentRef=attachment?.descriptor.id??null;valid=!!attachment;
            if(!attachment)gap('attachment_missing',mapping.policy.id,id);
          }else if(exact(item,['kind','folder','name','record','part'])&&native(item.record)&&native(item.part))gap('record_attachment_unavailable',mapping.policy.id,id);
        }
        if(!valid)gap('unsupported_effect_payload',mapping.policy.id,id);
        if(box.run?.disposition==='quarantined')gap('ambiguous_effect_run',mapping.policy.id,id);
        const effect={id,routineId:mapping.policy.id,kind:valid&&item.kind==='notify'?'notification':valid?'drive.file':'unknown',source:record.ref,targetRef,attachmentRef,runId:box.run?.id??null,disposition:!valid||box.run?.disposition==='quarantined'||box.state!=='unresolved'&&!box.run?'quarantined':box.state==='historical'?'historical-never-replay':box.state==='held'?'held-requires-review':'unresolved',approval:null,dispatchEnabled:false};
        effects.push(effect);aliases.push({id:aliasId('alias',record.ref),kind:'effect',legacyId:mapping.legacyId,destinationId:id,source:record.ref});
      }
    }
  }
  if(afterInventory)await afterInventory();
  // Recheck all selected files and directory listings. This detects change, but
  // does not manufacture a quiescent multi-file snapshot or execution authority.
  for(const [path,file] of files)check(byteDigest(await readBytes(join(source.root,path),boundRead))===file.descriptor.sha256,'source_changed');
  for(const [path,entries] of directories)check(policyHash(await list(join(source.root,path),boundRead))===policyHash(entries),'source_changed');
  for(const path of missing)try {await canonical(join(source.root,path));check(false,'source_changed');}catch(error){if(error.code!=='ENOENT')throw error;}
  const fresh=await evaluationScope(options.workspace);check(policyHash(fresh)===policyHash(bound),'workspace_binding_changed');
  const artifacts=[...files.values()].map(file=>file.descriptor).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const uniqueHistory=[...new Map(history.map(row=>[row.id,row])).values()];
  const plan={schemaVersion:1,kind:'routine-import-plan',binding,source:structuredClone(source),definitions,artifacts,missing:[...missing].sort(),directoryDigests:[...directories].map(([path,entries])=>({path,digest:policyHash(entries)})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),aliases,history:uniqueHistory,effects,cursors,dispatchEnabled:false,activationReceipt:null};
  const digest=policyHash(plan);
  const preview={schemaVersion:1,kind:'routine-import-preview',digest,observedAt:options.now,bindingDigest,sourceId:source.id,sourceIdentity:'declared',ownership:'declared-local-owner',snapshotBoundary:{...source.boundary,verified:false},provisional:true,applyAllowed:false,dispatchEnabled:false,policies:definitions.map(item=>routinePolicySummary(item.policy)),artifacts:artifacts.map(({id,role,sha256,bytes,disposition})=>({id,role,sha256,bytes,disposition})),aliases:aliases.map(({id,kind,destinationId,source:ref})=>({id,kind,destinationId,source:ref})),counts:{routines:definitions.length,files:artifacts.length,bytes,history:uniqueHistory.length,effects:effects.length,cursors:cursors.length},gaps:[...gaps.values()].sort((a,b)=>policyHash(a).localeCompare(policyHash(b))),authority:'preview-only'};
  return {preview,plan};
}
