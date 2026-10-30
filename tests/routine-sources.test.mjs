import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { collectRoutineSources } from '../lib/routines/index.mjs';
import { routineDefinition } from '../lib/web/routines.mjs';
import { LIMITS } from '../lib/routines/model.mjs';
import { fixture, codexFixture, at } from './helpers/routine-sources.mjs';
import { observeSqliteProcess } from './helpers/sqlite-process-observer.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const inspect=(registry,deps={})=>collectRoutineSources({registry,now:at},deps);
const hasGap=(result,code)=>result.coverage.gaps.some(gap=>gap.code===code);

test('Claude explicit account reader preserves recorded skips, leaves success unknown and hides source titles/prompts',async t=>{
  const f=await fixture(t),root=join(f.root,'claude');
  await f.json('claude/scheduled-tasks.json',{scheduledTasks:[{id:'daily',displayName:'PRIVATE TITLE',enabled:true,cronExpression:'0 9 * * *',prompt:'PRIVATE PROMPT'}],recordedSkips:{daily:[{at:'2026-10-30T09:00:00Z',reason:'PRIVATE REASON'}]}});
  await f.json('claude/local_acme.json',{scheduledTaskId:'daily',createdAt:'2026-10-30T10:00:00Z',lastActivityAt:'2026-10-30T10:02:00Z',title:'PRIVATE TITLE',content:'PRIVATE TRANSCRIPT'});
  const result=await inspect(f.registry([f.source('claude-desktop',{root})]));
  assert.equal(result.routines.length,1);assert.deepEqual(result.attempts.map(a=>a.state).sort(),['skipped','unknown']);
  assert.equal(result.attempts.find(a=>a.state==='unknown').completedAt,null);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|local_acme|scheduled-tasks|\/claude/);
  assert.equal(result.reports[0].state,'partial');assert.ok(hasGap(result,'session_outcomes_unavailable'));
  const duplicate=f.source('claude-desktop',{root},{accountId:'bob'});duplicate.id='other-account';
  const both=await inspect(f.registry([f.source('claude-desktop',{root}),duplicate]));
  assert.equal(new Set(both.routines.map(r=>r.id)).size,2);
});

test('Codex snapshots include committed WAL data and bind turns without ever modifying original database files',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const before=await Promise.all([c.dbPath,c.dbPath+'-wal',c.dbPath+'-shm'].map(path=>readFile(path)));
  const result=await inspect(f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]));
  assert.equal(result.routines.length,1);assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].state,'succeeded');
  assert.equal(result.attempts[0].durationMs,60000);assert.equal(result.attempts[0].usage,null);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|thread-1|turn-1|rollouts|codex.db|daily/);
  assert.deepEqual(await Promise.all([c.dbPath,c.dbPath+'-wal',c.dbPath+'-shm'].map(path=>readFile(path))),before);
});

test('Codex torn snapshots and external rollout paths are explicit gaps, never successful empty history',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const source=f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot});let changed=false;
  const changedResult=await inspect(f.registry([source]),{snapshotHook:async path=>{if(path===c.dbPath&&!changed){changed=true;c.db.prepare('UPDATE automations SET status=?').run('PAUSED');}}});
  assert.ok(hasGap(changedResult,'source_changed'));assert.equal(changedResult.reports[0].read,false);assert.equal(changedResult.routines.length,0);
  await symlink(c.path,join(c.rolloutRoot,'alias.jsonl'));
  const {DatabaseSync}=await import('node:sqlite');const state=new DatabaseSync(c.statePath);state.prepare('UPDATE threads SET rollout_path=?').run(join(c.rolloutRoot,'alias.jsonl'));state.close();
  const linked=await inspect(f.registry([source]));assert.ok(hasGap(linked,'unsafe_path'));assert.equal(linked.attempts.length,0);
});

test('Codex malformed turn identities and missing completion cannot be promoted to success',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  await writeFile(c.path,c.lines.slice(0,-1).map(line=>JSON.stringify(line)).join('\n'));
  const registry=f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]);
  const pending=await inspect(registry);assert.equal(pending.attempts[0].state,'unknown');assert.ok(hasGap(pending,'completion_unobserved'));
  await writeFile(c.path,[...c.lines,c.lines.at(-1)].map(line=>JSON.stringify(line)).join('\n'));
  const duplicate=await inspect(registry);assert.equal(duplicate.attempts.length,0);assert.ok(hasGap(duplicate,'conflicting_attempt'));
});

test('Vercel and declarations retain definition evidence without claiming deployment, runs or prose schedules',async t=>{
  const f=await fixture(t);
  const vercel=await f.json('vercel.json',{crons:[{path:'/PRIVATE-path',schedule:'0 9 * * *'}],env:{SECRET:'PRIVATE'}});
  const declared=await f.json('declared.json',[{name:'PRIVATE name',where:'grok',schedule:'PRIVATE task every day',confirmedAt:'2026-10-29',notes:'PRIVATE notes',link:'https://private.example'}]);
  const result=await inspect(f.registry([f.source('vercel',{file:vercel}),f.source('declared',{file:declared})]));
  assert.equal(result.routines.length,2);assert.equal(result.attempts.length,0);assert.ok(result.routines.every(r=>r.status==='unknown'));
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private.example|grok/);assert.ok(hasGap(result,'declared_not_observed'));assert.ok(hasGap(result,'deployment_and_history_unavailable'));
});

test('Switchboard definitions and run receipts are observed without reading task bodies or effect payloads',async t=>{
  const f=await fixture(t);
  const dir=join(f.root,'routines');await f.json('routines/daily/routine.json',{name:'PRIVATE',trigger:{manual:true},placement:{where:'home'},runners:['codex'],permissions:{secret:'PRIVATE'}});
  await writeFile(join(dir,'daily','task.md'),'PRIVATE TASK BODY');
  const runFile=join(f.root,'runs.jsonl');const row={routineId:'switchboard:daily',startedAt:'2026-10-30T10:00:00Z',endedAt:'2026-10-30T10:01:00Z',outcome:'ok',tokens:40,why:'PRIVATE REASON',effects:[{target:'PRIVATE TARGET'}]};
  await writeFile(runFile,[row,row].map(value=>JSON.stringify(value)).join('\n'));
  const result=await inspect(f.registry([f.source('switchboard',{dir,runFile})]));
  assert.equal(result.routines.length,1);assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].state,'succeeded');
  assert.equal(result.attempts[0].usage,null);assert.ok(hasGap(result,'effects_not_projected'));assert.ok(hasGap(result,'usage_requires_ledger_attribution'));
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|task.md|switchboard:daily/);
});

test('launchd uses only bounded read commands, approved prefixes and honest undated last-state observations',async t=>{
  const f=await fixture(t),dir=join(f.root,'agents');await mkdir(dir);await writeFile(join(dir,'acme.plist'),'PRIVATE XML');
  const calls=[];const run=async(command,args,options)=>{calls.push({command,args,options});return command==='plutil'?{status:0,stdout:JSON.stringify({Label:'com.acme.daily',StartCalendarInterval:{Hour:9,Minute:0},ProgramArguments:['PRIVATE'],StandardOutPath:'/PRIVATE'})}:{status:0,stdout:'\tstate = waiting\n\truns = 7\n\tlast exit code = 0\n\tprivate = PRIVATE'};};
  const result=await inspect(f.registry([f.source('launchd',{dir,uid:501,prefixes:['com.acme.']})]),{run});
  assert.equal(result.routines.length,1);assert.equal(result.attempts[0].state,'succeeded');assert.equal(result.attempts[0].startedAt,null);assert.equal(result.attempts[0].timeBasis,'undated-last-state');
  assert.deepEqual(calls.map(c=>[c.command,c.args]),[['plutil',['-convert','json','-o','-','-']],['launchctl',['print','gui/501/com.acme.daily']]]);
  assert.ok(calls.every(c=>c.options.timeout<=10000&&c.options.maxBuffer===LIMITS.commandBytes));assert.doesNotMatch(JSON.stringify(result),/PRIVATE|com.acme.daily|501/);
});

test('missing, malformed, oversized, hardlinked and symlinked sources fail closed with sanitized gap codes',async t=>{
  const f=await fixture(t),good=await f.json('good.json',[]),hard=join(f.root,'hard.json'),sym=join(f.root,'sym.json');
  await link(good,hard);await symlink(good,sym);const huge=join(f.root,'huge.json');await writeFile(huge,' '.repeat(LIMITS.fileBytes+1));
  const invalid=join(f.root,'invalid.json');await writeFile(invalid,'PRIVATE JSON ERROR');
  for(const file of [join(f.root,'missing.json'),hard,sym,huge,invalid]) {
    const result=await inspect(f.registry([f.source('declared',{file})]));assert.equal(result.reports[0].read,false,file);assert.equal(result.routines.length,0);assert.equal(result.coverage.state,'unavailable');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|ENOENT|missing.json|hard.json|sym.json|huge.json|invalid.json/);
  }
});

test('GitHub projection reuses numeric attempt validation and keeps retries separate with unread-page coverage',async t=>{
  const f=await fixture(t),project={id:'studio',repoId:102,repo:'acme/studio'},source=f.source('github-actions',{project});
  const raw={id:9,run_attempt:2,workflow_id:3,head_sha:'a'.repeat(40),repository:{id:102},path:'.github/workflows/acme.yml',status:'completed',conclusion:'failure',run_started_at:'2026-10-30T10:00:00Z',display_title:'PRIVATE'};
  const registry=f.registry([source]);
  const result=await inspect(registry,{githubReader:async()=>({definitions:[],runs:[raw],complete:false})});
  assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].state,'failed');assert.deepEqual(result.attempts[0].providerIdentity,{repoId:102,runId:9,attempt:2});assert.ok(result.attempts[0].retryOf);assert.ok(hasGap(result,'provider_pages_unread'));assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  const wrong=await inspect(registry,{githubReader:async()=>({definitions:[],runs:[{...raw,repository:{id:999}}],complete:true})});assert.equal(wrong.attempts.length,0);assert.equal(wrong.reports[0].read,false);
  const absent=await inspect(registry);assert.ok(hasGap(absent,'authorized_reader_unavailable'));
});


test('GitHub schedules use the existing workflow parser and retry links resolve to actual normalized attempts',async t=>{
  const f=await fixture(t),project={id:'studio',repoId:102,repo:'acme/studio'};
  const definition=routineDefinition(project,{head:'a'.repeat(40)},'.github/workflows/acme.yml',"name: PRIVATE\non:\n  schedule:\n    - cron: '0 9 * * *'\njobs:\n  acme: {}\n");
  const base={id:9,run_attempt:1,workflow_id:3,head_sha:'a'.repeat(40),repository:{id:102},path:'.github/workflows/acme.yml',status:'completed',conclusion:'failure',run_started_at:'2026-10-30T10:00:00Z'};
  const result=await inspect(f.registry([f.source('github-actions',{project})]),{githubReader:async()=>({definitions:[definition],runs:[base,{...base,run_attempt:2}],complete:true})});
  assert.equal(result.routines.length,1);assert.equal(result.routines[0].schedule.raw,'0 9 * * *');
  assert.equal(result.attempts[1].retryOf,result.attempts[0].id);assert.equal(result.attempts[0].parentId,result.attempts[1].parentId);assert.ok(hasGap(result,'restricted_definition'));
});

test('same source registered under two labels is one observation with explicit origins; conflicting copies are suppressed',async t=>{
  const f=await fixture(t),path=await f.json('vercel.json',{crons:[{path:'/acme',schedule:'0 9 * * *'}]});
  const source=f.source('vercel',{file:path}),alias={...source,id:'acme-alias',label:'Acme alias'};
  const observed=await inspect(f.registry([source,alias]));assert.equal(observed.routines.length,1);assert.deepEqual(observed.routines[0].sourceIds,['acme-alias','acme-vercel']);
  alias.file=await f.json('different.json',{crons:[{path:'/acme',schedule:'1 9 * * *'}]});
  const conflicting=await inspect(f.registry([source,alias]));assert.equal(conflicting.routines.length,0);assert.ok(hasGap(conflicting,'cross_source_identity_conflict'));
});

test('an unsupported source format never echoes arbitrary schedule text or source errors',async t=>{
  const f=await fixture(t),file=await f.json('bad-vercel.json',{crons:[{path:'/acme',schedule:'PRIVATE task words'}]});
  const result=await inspect(f.registry([f.source('vercel',{file})]));assert.ok(hasGap(result,'unsupported_schedule'));assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);assert.equal(result.routines[0].schedule.raw,null);
  const dir=join(f.root,'agents');await mkdir(dir);await writeFile(join(dir,'acme.plist'),'PRIVATE');
  const failed=await inspect(f.registry([f.source('launchd',{dir,uid:501,prefixes:['com.acme.']})]),{run:async()=>{throw new Error('PRIVATE stderr path /Users/acme');}});
  assert.equal(failed.routines.length,0);assert.ok(hasGap(failed,'unsupported_format'));assert.doesNotMatch(JSON.stringify(failed),/PRIVATE|Users/);
});

test('Codex refuses executable view schemas and terminates copied-database reads at the configured tighter deadline',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const registry=f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]);
  const timed=await inspect(registry,{sqliteTimeoutMs:1});assert.ok(hasGap(timed,'read_timeout'));assert.equal(timed.reports[0].read,false);
  c.db.exec("ALTER TABLE automations RENAME TO original; CREATE VIEW automations AS WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT 'daily' AS id,'ACTIVE' AS status,'FREQ=DAILY' AS rrule,'thread-1' AS target_thread_id FROM n");
  const before=Date.now(),view=await inspect(registry);
  assert.equal(view.reports[0].read,false);assert.ok(hasGap(view,'unsupported_format'));assert.ok(Date.now()-before<5000,'view is refused before evaluating recursive query');
});

test('Codex rollout session identity and automation target thread must both match before attributing success',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const registry=f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]);
  const wrong=structuredClone(c.lines);wrong[0].payload.id='different-thread';await writeFile(c.path,wrong.map(line=>JSON.stringify(line)).join('\n'));
  const mismatch=await inspect(registry);assert.equal(mismatch.attempts.length,0);assert.ok(hasGap(mismatch,'source_identity_mismatch'));
  c.db.prepare('INSERT INTO automations VALUES (?,?,?,?,?,?)').run('other','PRIVATE','ACTIVE','FREQ=DAILY','thread-2','PRIVATE');
  const replay=structuredClone(c.lines);replay[2].payload.content[0].text='<heartbeat><automation_id>other</automation_id></heartbeat>';
  await writeFile(c.path,replay.map(line=>JSON.stringify(line)).join('\n'));
  const cross=await inspect(registry);assert.equal(cross.attempts.length,0);assert.ok(hasGap(cross,'unmatched_heartbeat'));
});

test('ambiguous native definitions within one account are withheld rather than choosing the first record',async t=>{
  const f=await fixture(t),root=join(f.root,'claude');
  await f.json('claude/scheduled-tasks.json',{scheduledTasks:[{id:'daily',enabled:true,cronExpression:'0 9 * * *'},{id:'daily',enabled:false,cronExpression:'1 9 * * *'}]});
  const result=await inspect(f.registry([f.source('claude-desktop',{root})]));assert.equal(result.routines.length,0);assert.ok(hasGap(result,'invalid_definition'));
});

test('reordered registry scope keys preserve full observation identities and alias reconciliation',async t=>{
  const f=await fixture(t),root=join(f.root,'claude');
  await f.json('claude/scheduled-tasks.json',{scheduledTasks:[{id:'daily',enabled:true}],recordedSkips:{daily:[{at:'2026-10-30T09:00:00Z'}]}});
  const source=f.source('claude-desktop',{root}),alias={...source,id:'alias',scope:Object.fromEntries(Object.entries(source.scope).reverse())};
  const first=await inspect(f.registry([source])),second=await inspect(f.registry([alias]));
  assert.equal(first.routines[0].id,second.routines[0].id);assert.equal(first.attempts[0].id,second.attempts[0].id);assert.deepEqual(first.routines[0].scope,second.routines[0].scope);
  const both=await inspect(f.registry([source,alias]));assert.equal(both.routines.length,1);assert.equal(both.attempts.length,1);assert.deepEqual(both.attempts[0].sourceIds,['acme-claude-desktop','alias']);assert.ok(!hasGap(both,'cross_source_identity_conflict'));
});

test('attempt and definition ceilings apply incrementally across tasks, threads, fallbacks and sources',async t=>{
  const f=await fixture(t),root=join(f.root,'claude');
  const skips=Array.from({length:251},(_,n)=>({at:new Date(Date.parse('2026-10-30T09:00:00Z')+n*1000).toISOString()}));
  await f.json('claude/scheduled-tasks.json',{scheduledTasks:[{id:'one'},{id:'two'}],recordedSkips:{one:skips,two:skips}});
  const claude=await inspect(f.registry([f.source('claude-desktop',{root})]));assert.equal(claude.attempts.length,500);assert.equal(claude.reports[0].read,false);assert.ok(hasGap(claude,'entry_limit'));
  const file=await f.json('vercel-many.json',{crons:Array.from({length:300},(_,n)=>({path:`/acme-${n}`,schedule:'0 9 * * *'}))});
  const one=f.source('vercel',{file}),two={...one,id:'second',scope:{...one.scope,accountId:'second'}};
  const across=await inspect(f.registry([one,two]));assert.equal(across.routines.length,500);assert.equal(across.reports[1].routineCount,200);assert.ok(hasGap(across,'entry_limit'));
  const project={id:'studio',repoId:102,repo:'acme/studio'};
  const github=await inspect(f.registry([f.source('github-actions',{project})]),{githubReader:async()=>({definitions:Array.from({length:500},(_,n)=>({id:`workflow-${n}`})),runs:[{id:9,run_attempt:1,workflow_id:3,repository:{id:102},head_sha:'a'.repeat(40),path:'.github/workflows/other.yml',status:'queued'}],complete:true})});
  assert.equal(github.routines.length,500);assert.equal(github.attempts.length,0);assert.ok(hasGap(github,'entry_limit'));
  const c=await codexFixture(f);t.after(()=>c.db.close());
  c.db.prepare('INSERT INTO automations VALUES (?,?,?,?,?,?)').run('second','PRIVATE','ACTIVE','FREQ=DAILY','thread-2','PRIVATE');
  const secondPath=join(c.rolloutRoot,'second.jsonl'),state=new DatabaseSync(c.statePath);
  state.prepare('INSERT INTO threads VALUES(?,?)').run('thread-2',secondPath);state.close();
  for(const [path,thread,id] of [[c.path,'thread-1','daily'],[secondPath,'thread-2','second']]) {
    const many=[{type:'session_meta',payload:{id:thread}},...Array.from({length:251},(_,n)=>c.lines.slice(1).map(line=>{const row=structuredClone(line);if(row.payload.turn_id)row.payload.turn_id=`turn-${n}`;if(row.payload.role==='user')row.payload.content[0].text=`<heartbeat><automation_id>${id}</automation_id></heartbeat>`;return row;})).flat()];
    await writeFile(path,many.map(row=>JSON.stringify(row)).join('\n'));
  }
  const codex=await inspect(f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]));assert.equal(codex.attempts.length,500);assert.ok(hasGap(codex,'entry_limit'));assert.equal(codex.reports[0].read,false);
});

test('SQLite refuses generated columns before beginning the metadata query',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const registry=f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]);
  c.db.exec("DROP TABLE automations; CREATE TABLE automations(seed INTEGER,id TEXT GENERATED ALWAYS AS (hex(zeroblob(seed))), status TEXT,rrule TEXT,target_thread_id TEXT); INSERT INTO automations(seed,status,rrule) VALUES(100000000,'ACTIVE','FREQ=DAILY')");
  let began=false;const generated=await inspect(registry,{sqliteQueryStarted:()=>{began=true;}});
  assert.ok(hasGap(generated,'unsupported_format'));assert.equal(began,false,'generated columns are refused before a query can evaluate them');
});

test('SQLite deadline kills native work at expiry and cleans the copy only after actual process closure',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const records=observeSqliteProcess(t,{worker:fileURLToPath(new URL('./fixtures/routines/sqlite-native-work.mjs',import.meta.url))});
  t.mock.timers.enable({apis:['setTimeout']});
  let began=false;
  const timed=await inspect(f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]),{
    sqliteTimeoutMs:100,sqliteQueryStarted:()=>{
      began=true;t.mock.timers.tick(99);assert.equal(records[0].child.killed,false);
      t.mock.timers.tick(1);
    },
  });
  assert.equal(began,true);assert.ok(hasGap(timed,'read_timeout'));
  assert.equal(records.length,1);await records[0].closed;
  assert.equal(records[0].signal,'SIGKILL');assert.equal(records[0].watchdog,false,'the production deadline must kill, not the test backstop');
  assert.equal(records[0].existedAtClose,true);assert.equal(existsSync(records[0].snapshot),false);
});

test('SQLite real deadline also kills a child still waiting for its initial query input',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const records=observeSqliteProcess(t,{suppressInput:true});let began=false;
  const timed=await inspect(f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]),{sqliteTimeoutMs:100,sqliteQueryStarted:()=>{began=true;}});
  assert.equal(began,false);assert.ok(hasGap(timed,'read_timeout'));
  assert.equal(records.length,1);await records[0].closed;
  assert.equal(records[0].signal,'SIGKILL');assert.equal(records[0].watchdog,false);
  assert.equal(records[0].existedAtClose,true);assert.equal(existsSync(records[0].snapshot),false);
});


test('GitHub requested attempts remain queued observations even before the history window',async t=>{
  const f=await fixture(t),project={id:'studio',repoId:102,repo:'acme/studio'};
  const result=await inspect(f.registry([f.source('github-actions',{project})]),{githubReader:async()=>({definitions:[],runs:[{id:9,run_attempt:1,workflow_id:3,head_sha:'a'.repeat(40),repository:{id:102},path:'.github/workflows/acme.yml',status:'requested',run_started_at:'2026-09-01T10:00:00Z'}],complete:true})});
  assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].state,'queued');
});


test('SQLite child command lines never contain private copy paths or native thread identities',async t=>{
  const f=await fixture(t),c=await codexFixture(f);t.after(()=>c.db.close());
  const invocations=[];
  const result=await inspect(f.registry([f.source('codex',{dbPath:c.dbPath,statePath:c.statePath,rolloutRoot:c.rolloutRoot})]),{sqliteQueryStarted:details=>invocations.push(details.argv)});
  assert.equal(result.attempts.length,1);assert.equal(invocations.length,2);
  for(const argv of invocations){assert.equal(argv.length,3);assert.match(argv[2],/sqlite-reader\.mjs$/);assert.doesNotMatch(JSON.stringify(argv),/thread-1|snapshot\.db|plates-routine-db-|"query"/);}
});
