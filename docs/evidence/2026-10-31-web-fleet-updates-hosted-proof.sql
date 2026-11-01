-- Hosted proof for lib/web/migrations/010-fleet-updates.sql (phase 105, plan step migration-010).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (after 009, before 013). Paste the whole file and run it once;
-- then run the two-connection race at the end of this file in two editor tabs.
--
-- Proves: keel_private.fleet_records exists with row level security and no table
--   privilege for anon, authenticated or service_role; public.keel_fleet_rpc(text,text,
--   text,bigint,jsonb) is SECURITY DEFINER with an empty search_path and returns jsonb;
--   public.keel_job_rpc is now 010's body (a claim deadline bounded by the job's own
--   minutes, not 15) with its grants intact; anon and authenticated cannot execute
--   either RPC or touch the table (catalog and SET LOCAL ROLE); 013 is not applied
--   yet. As service_role, a synthetic rollout record is idempotent, actor-bound and
--   CAS-versioned to a terminal stop; an update preparation reserves a 30-minute job
--   on a project lane that an ordinary job then cannot take; that preparation claims
--   with a 20-minute deadline (009 would refuse it), begins, and writes one fenced
--   output artifact, which a wrong worker nonce cannot write.
-- Leaves behind: nothing. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the race commits synthetic rows
--   under one Acme scope and its last statement deletes them.
-- Expected result: one row, result = 'PASS 010-fleet-updates hosted proof'. Any wrong
--   fact stops the script with an exception naming it. The race's expected results
--   are written beside its statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), the canary project and its container. This proof
--   never reapplies 010; after 013 it refuses, naming 013.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-010; the
--   race is replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('c1',32); digest_key text:=repeat('e1',32); nonce_key text:=repeat('f1',32);
 f1 text:=repeat('51',32); f2 text:=repeat('52',32); f3 text:=repeat('53',32); f4 text:=repeat('54',32);
 pv1 text:=repeat('11',32); pv2 text:=repeat('12',32); j1 text:=repeat('21',32); j2 text:=repeat('22',32);
 fleet text:='public.keel_fleet_rpc(text,text,text,bigint,jsonb)'; job text:='public.keel_job_rpc(text,text,text,jsonb)';
 tbl text:='keel_private.fleet_records';
 deadline bigint; r jsonb; f text; role_name text;
begin
 if to_regprocedure('keel_private.job_rpc_before_night(text,text,text,jsonb)') is not null or to_regclass('keel_private.night_retries') is not null then
  raise exception '013 is already applied: this proof describes the 010 step, run before 013'; end if;
 if to_regclass(tbl) is null then raise exception 'missing table %',tbl; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass(tbl)) then raise exception 'row level security off on %',tbl; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,tbl; end if;
 end loop;
 foreach f in array array[fleet,job] loop
  if to_regprocedure(f) is null then raise exception 'missing function %',f; end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(f) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',f; end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'a browser role can execute %',f; end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'service_role cannot execute %',f; end if;
 end loop;
 if position('make_interval(mins=>r.minutes)' in (select prosrc from pg_proc where oid=to_regprocedure(job)))=0 then raise exception 'keel_job_rpc is not 010''s body (claim deadline bounded by the job''s minutes)'; end if;
 if exists(select 1 from keel_private.fleet_records where scope=scope_key) or exists(select 1 from keel_private.jobs where scope=scope_key) or exists(select 1 from keel_private.job_previews where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin perform 1 from keel_private.fleet_records limit 1; raise exception 'direct read of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   begin delete from keel_private.fleet_records where false; raise exception 'direct write of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.keel_fleet_rpc('read',scope_key,f1,1,'{}'::jsonb); raise exception 'client fleet RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
    begin perform public.keel_job_rpc('read',scope_key,j1,'{}'::jsonb); raise exception 'client job RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.keel_fleet_rpc('read',scope_key,f1,1,'{}'::jsonb) is not null then raise exception 'missing record invented'; end if;
  r:=public.keel_fleet_rpc('create',scope_key,f1,1,jsonb_build_object('kind','rollout','project',null,'digest',digest_key,'value','Acme rollout'));
  if r->>'changed' is distinct from 'true' or r->'row'->>'state' is distinct from 'ready' or r->'row'->>'version' is distinct from '1' then raise exception 'rollout not created: %',r; end if;
  r:=public.keel_fleet_rpc('create',scope_key,f1,1,jsonb_build_object('kind','rollout','project',null,'digest',digest_key,'value','Acme replay'));
  if r->>'changed' is distinct from 'false' or r->'row'->>'value' is distinct from 'Acme rollout' then raise exception 'replay changed the rollout: %',r; end if;
  r:=public.keel_fleet_rpc('create',scope_key,f1,1,jsonb_build_object('kind','rollout','project',null,'digest',repeat('e2',32),'value','Acme other digest'));
  if r->>'conflict' is distinct from 'identity' then raise exception 'changed digest accepted: %',r; end if;
  if public.keel_fleet_rpc('read',scope_key,f1,2,'{}'::jsonb) is not null then raise exception 'rollout visible to another actor'; end if;
  r:=public.keel_fleet_rpc('cas',scope_key,f1,1,jsonb_build_object('version',1,'state','stopped','stage',0,'value','Acme stopped'));
  if r->'row'->>'version' is distinct from '2' or r->'row'->>'state' is distinct from 'stopped' then raise exception 'rollout CAS failed: %',r; end if;
  r:=public.keel_fleet_rpc('cas',scope_key,f1,1,jsonb_build_object('version',2,'state','ready','stage',0,'value','Acme revived'));
  if r->>'conflict' is distinct from 'state' then raise exception 'stopped rollout revived: %',r; end if;
  -- An update preparation and an ordinary job share one project lane.
  perform public.keel_fleet_rpc('create',scope_key,f2,1,jsonb_build_object('kind','preparation','project',project_key,'digest',digest_key,'value','Acme preparation'));
  perform public.keel_job_rpc('preview-create',scope_key,pv1,jsonb_build_object('project',project_key,'actor',1,'digest',digest_key,'value','Acme preparation preview'));
  r:=public.keel_job_rpc('reserve',scope_key,j1,jsonb_build_object('project',project_key,'actor',1,'digest',digest_key,'preview',pv1,'value','Acme preparation intent','minutes',30,'workspaceLimit',60,'projectLimit',60));
  if r->'row'->>'state' is distinct from 'prepared' then raise exception 'preparation job not reserved: %',r; end if;
  perform public.keel_job_rpc('preview-create',scope_key,pv2,jsonb_build_object('project',project_key,'actor',1,'digest',digest_key,'value','Acme ordinary preview'));
  r:=public.keel_job_rpc('reserve',scope_key,j2,jsonb_build_object('project',project_key,'actor',1,'digest',digest_key,'preview',pv2,'value','Acme ordinary intent','minutes',15,'workspaceLimit',60,'projectLimit',60));
  if r->>'conflict' is distinct from 'lane' then raise exception 'ordinary job took the preparation''s lane: %',r; end if;
  if public.keel_job_rpc('dispatch',scope_key,j1,'{}'::jsonb)->>'granted' is distinct from 'true' then raise exception 'preparation dispatch not granted'; end if;
  deadline:=(extract(epoch from clock_timestamp()+interval '20 minutes')*1000)::bigint;
  r:=public.keel_job_rpc('claim',scope_key,j1,jsonb_build_object('runId',7001,'jobId',9001,'nonce',nonce_key,'fence',1,'deadline',deadline));
  if r->'row'->>'state' is distinct from 'claimed' then raise exception 'a 20-minute deadline on a 30-minute job was refused: %',r; end if;
  r:=public.keel_job_rpc('begin',scope_key,j1,jsonb_build_object('runId',7001,'jobId',9001,'nonce',nonce_key,'fence',1));
  if r->>'granted' is distinct from 'true' or r->'row'->>'state' is distinct from 'running' then raise exception 'begin failed: %',r; end if;
  r:=public.keel_fleet_rpc('output',scope_key,f3,1,jsonb_build_object('project',project_key,'digest',digest_key,'value','Acme patch artifact','operationId',j1,'runId',7001,'jobId',9001,'nonce',nonce_key,'fence',1));
  if r->>'changed' is distinct from 'true' or r->'row'->>'kind' is distinct from 'artifact' then raise exception 'fenced output not written: %',r; end if;
  r:=public.keel_fleet_rpc('output',scope_key,f3,1,jsonb_build_object('project',project_key,'digest',digest_key,'value','Acme replay','operationId',j1,'runId',7001,'jobId',9001,'nonce',nonce_key,'fence',1));
  if r->>'changed' is distinct from 'false' or r->'row'->>'value' is distinct from 'Acme patch artifact' then raise exception 'output replay changed the artifact: %',r; end if;
  r:=public.keel_fleet_rpc('output',scope_key,f4,1,jsonb_build_object('project',project_key,'digest',digest_key,'value','Acme forged artifact','operationId',j1,'runId',7001,'jobId',9001,'nonce',repeat('f2',32),'fence',1));
  if r->>'conflict' is distinct from 'identity' then raise exception 'output with a wrong worker nonce accepted: %',r; end if;
  begin perform public.keel_fleet_rpc('cas',scope_key,f1,1,'{}'::jsonb); raise exception 'CAS without fields accepted';
  exception when raise_exception then if sqlerrm<>'invalid fleet operation' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.fleet_records where scope=scope_key) or exists(select 1 from keel_private.jobs where scope=scope_key) or exists(select 1 from keel_private.job_previews where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 010-fleet-updates hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a two-connection race between an update preparation and an ordinary job on one lane").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statement [2] holds its transaction for 8 seconds after reserving: start [3]
   in tab B within those 8 seconds. Record both result rows.
   Expected: [2] (the update preparation) changed true; [3] (the ordinary job)
   {"conflict": "lane"}, with a different pid and a finished_at no earlier than [2]'s.
   [4] returns its PASS row. Run [5] whatever happened, to remove the synthetic rows.

-- [1] tab A: setup, a preparation record and two previews on lane c1
do $setup$
begin
 if exists(select 1 from keel_private.jobs where scope=repeat('ac',32)) or exists(select 1 from keel_private.job_previews where scope=repeat('ac',32)) or exists(select 1 from keel_private.fleet_records where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [5] first'; end if;
 perform public.keel_fleet_rpc('create',repeat('ac',32),repeat('55',32),1,jsonb_build_object('kind','preparation','project',repeat('c1',32),'digest',repeat('e1',32),'value','Acme race preparation'));
 perform public.keel_job_rpc('preview-create',repeat('ac',32),repeat('31',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'value','Acme preparation preview'));
 perform public.keel_job_rpc('preview-create',repeat('ac',32),repeat('32',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'value','Acme ordinary preview'));
end $setup$;
select 'race ready' as result;

-- [2] tab A: reserve the update preparation's job on lane c1 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('41',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('31',32),'value','Acme preparation intent','minutes',30,'workspaceLimit',60,'projectLimit',60)) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result from action cross join held;

-- [3] tab B: reserve an ordinary job on the same lane while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('42',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('32',32),'value','Acme ordinary intent','minutes',15,'workspaceLimit',60,'projectLimit',60)) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result from action;

-- [4] tab A: exactly one job holds the lane
do $check$
begin
 if (select count(*) from keel_private.jobs where scope=repeat('ac',32) and project=repeat('c1',32) and state not in('terminal','refused'))<>1 then raise exception 'expected exactly one active job on lane c1'; end if;
end $check$;
select 'PASS 010 preparation and ordinary job race' as result;

-- [5] tab A: cleanup, always
delete from keel_private.jobs where scope=repeat('ac',32);
delete from keel_private.job_previews where scope=repeat('ac',32);
delete from keel_private.fleet_records where scope=repeat('ac',32);
select (select count(*) from keel_private.jobs where scope=repeat('ac',32))+(select count(*) from keel_private.job_previews where scope=repeat('ac',32))+(select count(*) from keel_private.fleet_records where scope=repeat('ac',32)) as acme_rows_left;
*/
