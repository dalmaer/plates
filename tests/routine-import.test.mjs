import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeWorkspace } from '../lib/web/workspace.mjs';
import { byteDigest } from '../lib/evaluation-records.mjs';
import { previewRoutineImport, prepareRoutineImport } from '../lib/routines/import-plan.mjs';
const now='2026-10-30T12:00:00.000Z',project={id:'studio',repoId:101,repo:'acme/studio'},startedAt='2026-10-30T10:00:00.000Z',runKey=startedAt.replace(/[:.]/g,'-');
async function fixture(t) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'plates-import-acme-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),typeof value==='string'?value:JSON.stringify(value));return join(root,path);};
  const manifest=await put('config/workspace.json',{version:1,id:'acme',name:'Acme',repo:'acme/workspace',projects:[{id:'studio',repo:'acme/studio'}]});
  const workspace={manifest,state:join(root,'runtime'),appRoot:process.cwd()};await initializeWorkspace(workspace);
  const task='PRIVATE task content\n';await put('source/routines/daily/task.md',task);
  await put('source/routines/daily/routine.json',{name:'PRIVATE legacy title',trigger:{manual:true},placement:{where:'home'},runners:['codex'],needs:[],permissions:{},review:{outbox:'approve'}});
  await put('source/state/runs.jsonl',JSON.stringify({routineId:'switchboard:daily',name:'PRIVATE title',startedAt,endedAt:'2026-10-30T10:01:00.000Z',outcome:'ok',why:'PRIVATE reason',effects:[]})+'\n');
  const policy={schemaVersion:1,id:'daily',scope:{workspaceId:'acme',actorId:'alice',project},purpose:'PRIVATE owner purpose',task:{sha256:byteDigest(task),bytes:Buffer.byteLength(task)},trigger:{kind:'manual'},placement:{kind:'home',requirements:[]},adapters:[{id:'codex-cli',version:'1'}],connections:[],effects:[],bounds:{runtimeSeconds:600,modelCalls:0,maxCostMicroUsd:0},overlap:'wait',state:'dormant'};
  const options={workspace,actorId:'alice',repositoryBindings:[project],source:{id:'acme-source',root:join(root,'source'),hostId:'acme-host',accountId:'acme-account',boundary:{kind:'unverified',evidenceDigest:null}},mappings:[{legacyId:'switchboard:daily',policy}],now};
  return {root,put,options};
}
const gap=(preview,code)=>preview.gaps.some(row=>row.code===code);
async function inventory(root) {const values=[];for(const name of (await readdir(root)).sort()){const path=join(root,name);try{values.push([name,await inventory(path)]);}catch(error){if(error.code!=='ENOTDIR')throw error;values.push([name,byteDigest(await readFile(path))]);}}return values;}

test('explicit import preview is deterministic, read-only, private and bound to an initialized workspace',async t=>{
  const f=await fixture(t),before=await inventory(f.root),first=await previewRoutineImport(f.options),second=await previewRoutineImport({...f.options,now:'2026-10-30T12:01:00.000Z'});
  assert.equal(first.digest,second.digest);assert.deepEqual(await inventory(f.root),before);
  assert.equal(first.counts.routines,1);assert.equal(first.counts.history,1);assert.equal(first.applyAllowed,false);assert.equal(first.dispatchEnabled,false);assert.equal(first.snapshotBoundary.verified,false);
  assert.ok(gap(first,'snapshot_boundary_unverified'));assert.ok(gap(first,'local_owner_declared'));assert.ok(gap(first,'numeric_repository_binding_declared'));
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE|switchboard:daily|task\.md|runs\.jsonl|acme-account|acme-host|plates-import-acme/);
  const prepared=await prepareRoutineImport(f.options);assert.equal(prepared.plan.definitions[0].policy.purpose,'PRIVATE owner purpose');assert.equal(prepared.plan.activationReceipt,null);
  const uninitialized={...f.options,workspace:{...f.options.workspace,state:join(f.root,'missing-state')}};
  await assert.rejects(()=>previewRoutineImport(uninitialized),/import_input_unavailable/);
});

test('scope binding requires exact workspace project and numeric repository mapping; labels grant no authority',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>previewRoutineImport({...f.options,actorId:'bob'}),/policy_scope_mismatch/);
  await assert.rejects(()=>previewRoutineImport({...f.options,repositoryBindings:[{...project,repoId:999}]}),/policy_scope_mismatch/);
  await assert.rejects(()=>previewRoutineImport({...f.options,repositoryBindings:[{...project,repo:'acme/other'}]}),/repository_binding_mismatch/);
  await assert.rejects(()=>previewRoutineImport({...f.options,mappings:[...f.options.mappings,...f.options.mappings]}),/duplicate_import_identity/);
  const declaredFrozen={...f.options,source:{...f.options.source,boundary:{kind:'declared-frozen',evidenceDigest:'a'.repeat(64)}}};
  const preview=await previewRoutineImport(declaredFrozen);assert.equal(preview.snapshotBoundary.verified,false);assert.equal(preview.applyAllowed,false);
});

test('task references bind exact source bytes and changed definition or destination produces a new preview',async t=>{
  const f=await fixture(t),first=await previewRoutineImport(f.options);
  await f.put('source/routines/daily/task.md','PRIVATE changed');await assert.rejects(()=>previewRoutineImport(f.options),/task_reference_mismatch/);
  await f.put('source/routines/daily/task.md','PRIVATE task content\n');
  await f.put('source/routines/daily/routine.json',{name:'changed',trigger:{manual:true},placement:{where:'home'},grant:true});
  const changed=await previewRoutineImport(f.options);assert.notEqual(changed.digest,first.digest);assert.ok(gap(changed,'unsupported_definition_fields'));assert.equal(changed.artifacts.find(row=>row.role==='definition').disposition,'quarantine');
  await f.put('config/workspace.json',{version:1,id:'acme',name:'Acme renamed',repo:'acme/workspace',projects:[{id:'studio',repo:'acme/studio'}]});
  assert.notEqual((await previewRoutineImport(f.options)).bindingDigest,first.bindingDigest);
});

test('configuration copies only allowlisted nonsecret fields and excludes unmapped declarations',async t=>{
  const f=await fixture(t);await f.put('source/switchboard.json',{repos:['acme/studio'],token:'PRIVATE TOKEN',mcp:{benos:{command:'/PRIVATE',args:['PRIVATE']}},notify:{to:'PRIVATE HANDLE'},drive:{remote:'PRIVATE'}});await f.put('source/routines.declared.json',[{name:'PRIVATE',schedule:'PRIVATE'}]);
  const {preview,plan}=await prepareRoutineImport(f.options),config=plan.artifacts.find(row=>row.role==='configuration');
  assert.deepEqual(config.projection,{repos:['acme/studio']});assert.equal(config.disposition,'project');assert.ok(gap(preview,'configuration_fields_excluded'));assert.ok(gap(preview,'declared_mapping_required'));
  assert.doesNotMatch(JSON.stringify(plan),/PRIVATE TOKEN|PRIVATE HANDLE|"command"|"args"/);assert.doesNotMatch(JSON.stringify(preview),/PRIVATE/);
});

test('log aliases retain byte offsets and hashes, identical repeats deduplicate and conflicting timestamp joins quarantine',async t=>{
  const f=await fixture(t),run={routineId:'switchboard:daily',startedAt,outcome:'ok'},line=JSON.stringify(run),approval={kind:'approval',routineId:run.routineId,run:startedAt,at:now,effects:[]};
  await f.put('source/state/runs.jsonl',[line,line,JSON.stringify(approval)].join('\n')+'\n');
  const {plan}=await prepareRoutineImport(f.options),runs=plan.aliases.filter(row=>row.kind==='run');assert.equal(runs.length,2);assert.equal(runs[0].destinationId,runs[1].destinationId);assert.equal(runs[1].source.byteOffset,Buffer.byteLength(line)+1);assert.equal(runs[0].source.sha256,byteDigest(line));assert.equal(plan.history.length,2);assert.ok(plan.history.find(row=>row.kind==='approval').runId);
  await f.put('source/state/runs.jsonl',[line,JSON.stringify({...run,outcome:'failed'}),JSON.stringify(approval)].join('\n')+'\n');
  const conflicting=await prepareRoutineImport(f.options);assert.ok(gap(conflicting.preview,'ambiguous_run_identity'));assert.ok(gap(conflicting.preview,'ambiguous_approval_join'));assert.ok(conflicting.plan.history.every(row=>row.disposition==='quarantined'));
});

test('torn and malformed JSONL stays explicit, and foreign unselected history is not imported',async t=>{
  const f=await fixture(t);await f.put('source/state/runs.jsonl','{PRIVATE malformed}\n'+JSON.stringify({routineId:'switchboard:other',startedAt,outcome:'ok'})+'\n'+JSON.stringify({routineId:'switchboard:daily',startedAt,outcome:'ok'}));
  const result=await previewRoutineImport(f.options);assert.equal(result.counts.history,0);assert.ok(gap(result,'malformed_log_record'));assert.ok(gap(result,'torn_log'));assert.doesNotMatch(JSON.stringify(result),/PRIVATE|switchboard:other/);
});

test('held and historical effects retain evidence references without approval, delivery or payload disclosure',async t=>{
  const f=await fixture(t),held=`source/state/daily/outbox-held/${runKey}`,done=`source/state/daily/outbox-done/${runKey}`;
  await f.put(`${held}/report.txt`,'PRIVATE attachment bytes');await f.put(`${held}/items.jsonl`,JSON.stringify({kind:'drive.file',folder:'acmeFolder1234',name:'PRIVATE filename',path:'report.txt'})+'\n');
  await f.put(`${done}/items.jsonl`,JSON.stringify({kind:'notify',text:'PRIVATE notification'})+'\n');
  const {preview,plan}=await prepareRoutineImport(f.options);assert.equal(preview.counts.effects,2);assert.ok(plan.effects.some(row=>row.disposition==='held-requires-review'));assert.ok(plan.effects.some(row=>row.disposition==='historical-never-replay'));assert.ok(plan.effects.every(row=>row.approval===null&&row.dispatchEnabled===false));assert.ok(plan.artifacts.some(row=>row.role==='attachment'));assert.doesNotMatch(JSON.stringify(preview),/PRIVATE|acmeFolder1234|report\.txt/);
});

test('missing attachments, external record attachments, unknown outbox joins and pending effects remain blocked',async t=>{
  const f=await fixture(t),box='source/state/daily/outbox-held/unknown';
  await f.put(`${box}/items.jsonl`,[{kind:'drive.file',folder:'acmeFolder1234',name:'Acme',path:'missing.txt'},{kind:'drive.file',folder:'acmeFolder1234',name:'Acme',record:'mail/abc',part:'one'}].map(JSON.stringify).join('\n')+'\n');
  await f.put('source/state/daily/outbox/items.jsonl',JSON.stringify({kind:'notify',text:'PRIVATE pending'})+'\n');
  const {preview,plan}=await prepareRoutineImport(f.options);for(const code of ['attachment_missing','record_attachment_unavailable','ambiguous_outbox_join','pending_outbox_unresolved'])assert.ok(gap(preview,code),code);assert.ok(plan.effects.every(row=>['quarantined','unresolved'].includes(row.disposition)));
});

test('unsafe linked sources, traversal and source/destination overlap refuse without leaking filenames',async t=>{
  const f=await fixture(t),task=join(f.root,'source/routines/daily/task.md');await rm(task);await f.put('PRIVATE-secret','PRIVATE');await symlink(join(f.root,'PRIVATE-secret'),task);
  await assert.rejects(()=>previewRoutineImport(f.options),error=>error.code==='unsafe_path'&&!error.message.includes('PRIVATE'));
  await rm(task);await link(join(f.root,'PRIVATE-secret'),task);await assert.rejects(()=>previewRoutineImport(f.options),/unsafe_path/);
  await assert.rejects(()=>previewRoutineImport({...f.options,source:{...f.options.source,root:join(f.root,'source')+'/../source'}}),/unsafe_path/);
  await assert.rejects(()=>previewRoutineImport({...f.options,source:{...f.options.source,root:f.options.workspace.state}}),/source_destination_overlap/);
});

test('file changes and newly appearing selected files during inventory invalidate the entire preview',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>previewRoutineImport(f.options,{afterInventory:()=>f.put('source/state/runs.jsonl','')}),/source_changed/);
  await assert.rejects(()=>previewRoutineImport(f.options,{afterInventory:()=>f.put('source/switchboard.json',{repos:[]})}),/source_changed/);
});

test('event match references bind exact definition bytes and cursor ambiguity never becomes a clean checkpoint',async t=>{
  const f=await fixture(t),definition={name:'PRIVATE',trigger:{event:{kind:'sync.completed',instance:['mail'],match:{from:['PRIVATE']}}},placement:{where:'home'}},bytes=JSON.stringify(definition);
  await f.put('source/routines/daily/routine.json',bytes);
  f.options.mappings[0].policy.trigger={kind:'event',provider:'benos',event:'sync.completed',matchRef:{sha256:byteDigest(bytes),bytes:Buffer.byteLength(bytes)},catchUp:{overlapSeconds:600,retentionDays:14,initial:'now'}};
  await f.put('source/state/daily/events.json',{since:startedAt,seen:[{ref:'mail/one',lastAt:startedAt},{ref:'mail/one',lastAt:now}]});
  const preview=await previewRoutineImport(f.options);assert.ok(gap(preview,'unsupported_cursor'));assert.ok(!gap(preview,'match_reference_mismatch'));assert.equal(preview.counts.cursors,0);
  await f.put('source/routines/daily/routine.json',JSON.stringify(definition,null,2));await assert.rejects(()=>previewRoutineImport(f.options),/match_reference_mismatch/);
});

test('oversized files and aggregate record counts refuse within explicit bounds',async t=>{
  const f=await fixture(t),row=JSON.stringify({routineId:'switchboard:daily',startedAt,outcome:'ok'})+'\n';await f.put('source/state/runs.jsonl',row.repeat(501));await assert.rejects(()=>previewRoutineImport(f.options),/entry_limit/);
  await f.put('source/state/runs.jsonl',' '.repeat(4*1024*1024+1));await assert.rejects(()=>previewRoutineImport(f.options),/byte_limit/);
});


test('invalid JSON values and unknown source permission fields remain quarantined or unresolved',async t=>{
  const f=await fixture(t);await f.put('source/routines/daily/routine.json','null');await f.put('source/switchboard.json','null');await f.put('source/state/daily/events.json','null');
  const result=await previewRoutineImport(f.options);assert.ok(gap(result,'unsupported_definition_fields'));assert.ok(gap(result,'unsupported_configuration'));assert.ok(gap(result,'unsupported_cursor'));
  await f.put('source/routines/daily/routine.json',{trigger:{manual:true},placement:{where:'home'},runners:['codex'],permissions:{grant:true},review:{autoApprove:true}});
  const changed=await previewRoutineImport(f.options);assert.ok(gap(changed,'unsupported_legacy_permissions'));assert.ok(gap(changed,'unsupported_legacy_review'));
});

test('outbox path traversal refuses and orphaned held notifications cannot become actionable',async t=>{
  const f=await fixture(t);await f.put('source/state/daily/outbox-held/unknown/items.jsonl',JSON.stringify({kind:'notify',text:'PRIVATE'})+'\n');
  assert.equal((await prepareRoutineImport(f.options)).plan.effects[0].disposition,'quarantined');
  await f.put('source/state/daily/outbox/items.jsonl',JSON.stringify({kind:'drive.file',folder:'acmeFolder1234',name:'Acme',path:'../outside'})+'\n');
  await assert.rejects(()=>previewRoutineImport(f.options),/unsafe_path/);
});
