-- Hosted proof for lib/web/migrations/009-jobs.sql (phase 104, plan step migration-009).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits and before 010 and 013. Paste the whole file and run it once;
-- then run the two-connection races at the end of this file in two editor tabs.
--
-- Proves: keel_private.job_previews and keel_private.jobs exist with row level
--   security and no table privilege for anon, authenticated or service_role; the
--   partial unique index keel_private.jobs_lane exists; public.keel_job_rpc(text,text,
--   text,jsonb) is SECURITY DEFINER with an empty search_path and returns jsonb; anon
--   and authenticated cannot execute it or touch the tables (catalog and SET LOCAL
--   ROLE); 013 is not applied yet, so 009's own body is what answers. As service_role,
--   synthetic previews are immutable; a reservation is idempotent and keeps its
--   identity; a second job on the same project lane conflicts; the workspace weekly
--   minutes refuse an over-budget project; dispatch is granted once; a completed
--   provider observation releases the lane while its minutes stay charged; a refusal
--   uncharges; another actor scope sees nothing; malformed operations are refused.
-- Leaves behind: nothing. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the races commit synthetic rows
--   under one Acme scope and their last statement deletes them.
-- Expected result: one row, result = 'PASS 009-jobs hosted proof'. Any wrong fact
--   stops the script with an exception naming it. The races' expected results are
--   written beside their statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it). This proof never reapplies 009: after 013 the
--   migration refuses to run, and this proof refuses too, naming 013.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-009; the
--   races are replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 scope_key text:=repeat('ac',32); other_scope text:=repeat('bd',32);
 project_one text:=repeat('c1',32); project_two text:=repeat('c2',32); digest_key text:=repeat('e1',32);
 pv1 text:=repeat('11',32); pv2 text:=repeat('12',32); pv3 text:=repeat('13',32);
 j1 text:=repeat('21',32); j2 text:=repeat('22',32); j3 text:=repeat('23',32);
 rpc text:='public.keel_job_rpc(text,text,text,jsonb)';
 tables text[]:=array['keel_private.job_previews','keel_private.jobs'];
 provider jsonb:=jsonb_build_object('runId',7001,'attempt',1,'state','completed','conclusion','success','url','https://github.com/acme/studio/actions/runs/7001','createdAt','2026-10-31T00:00:00Z','updatedAt','2026-10-31T00:05:00Z','observedAt','2026-10-31T00:06:00Z');
 r jsonb; t text; role_name text;
begin
 if to_regprocedure('keel_private.job_rpc_before_night(text,text,text,jsonb)') is not null or to_regclass('keel_private.night_retries') is not null then
  raise exception '013 is already applied: this proof describes the 009 step, run before 010 and 013'; end if;
 foreach t in array tables loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('keel_private.jobs_lane') and indisunique and indpred is not null) then raise exception 'missing partial unique index keel_private.jobs_lane'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from keel_private.job_previews where scope in(scope_key,other_scope)) or exists(select 1 from keel_private.jobs where scope in(scope_key,other_scope)) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   foreach t in array tables loop
    begin execute format('select 1 from %s limit 1',t); raise exception 'direct read of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from %s where false',t); raise exception 'direct write of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
   end loop;
   if role_name<>'service_role' then
    begin perform public.keel_job_rpc('read',scope_key,j1,'{}'::jsonb); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  r:=public.keel_job_rpc('preview-create',scope_key,pv1,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'value','Acme job preview'));
  if r->'preview'->>'id' is distinct from pv1 then raise exception 'preview not created: %',r; end if;
  if public.keel_job_rpc('preview-create',scope_key,pv1,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'value','Acme replacement')) is not null then raise exception 'preview mutable'; end if;
  if public.keel_job_rpc('preview-read',scope_key,pv1,'{}'::jsonb)->'preview'->>'value' is distinct from 'Acme job preview' then raise exception 'preview not readable'; end if;
  r:=public.keel_job_rpc('reserve',scope_key,j1,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'preview',pv1,'value','Acme job intent','minutes',15,'workspaceLimit',30,'projectLimit',30));
  if r->>'changed' is distinct from 'true' or r->'row'->>'state' is distinct from 'prepared' or r->'row'->>'minutes' is distinct from '15' then raise exception 'reservation failed: %',r; end if;
  r:=public.keel_job_rpc('reserve',scope_key,j1,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'preview',pv1,'value','Acme replay','minutes',15,'workspaceLimit',30,'projectLimit',30));
  if r->>'changed' is distinct from 'false' or r->'row'->>'value' is distinct from 'Acme job intent' then raise exception 'replay changed the reservation: %',r; end if;
  r:=public.keel_job_rpc('reserve',scope_key,j1,jsonb_build_object('project',project_one,'actor',1,'digest',repeat('e2',32),'preview',pv1,'value','Acme other digest','minutes',15,'workspaceLimit',30,'projectLimit',30));
  if r->>'conflict' is distinct from 'identity' then raise exception 'changed identity accepted: %',r; end if;
  perform public.keel_job_rpc('preview-create',scope_key,pv2,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'value','Acme second preview'));
  r:=public.keel_job_rpc('reserve',scope_key,j2,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'preview',pv2,'value','Acme second intent','minutes',15,'workspaceLimit',30,'projectLimit',30));
  if r->>'conflict' is distinct from 'lane' then raise exception 'project lane not enforced: %',r; end if;
  perform public.keel_job_rpc('preview-create',scope_key,pv3,jsonb_build_object('project',project_two,'actor',1,'digest',digest_key,'value','Acme third preview'));
  r:=public.keel_job_rpc('reserve',scope_key,j3,jsonb_build_object('project',project_two,'actor',1,'digest',digest_key,'preview',pv3,'value','Acme third intent','minutes',20,'workspaceLimit',30,'projectLimit',30));
  if r->>'conflict' is distinct from 'budget' then raise exception 'workspace weekly minutes not enforced: %',r; end if;
  if public.keel_job_rpc('budget',scope_key,j1,jsonb_build_object('project',project_one))<>'{"workspaceMinutes":15,"projectMinutes":15}'::jsonb then raise exception 'budget wrong after one reservation'; end if;
  r:=public.keel_job_rpc('dispatch',scope_key,j1,'{}'::jsonb);
  if r->>'granted' is distinct from 'true' or r->'row'->>'state' is distinct from 'dispatching' then raise exception 'dispatch not granted: %',r; end if;
  r:=public.keel_job_rpc('dispatch',scope_key,j1,'{}'::jsonb);
  if r->>'conflict' is distinct from 'state' then raise exception 'second dispatch granted: %',r; end if;
  r:=public.keel_job_rpc('observe',scope_key,j1,jsonb_build_object('provider',provider));
  if r->'row'->>'state' is distinct from 'terminal' then raise exception 'completed observation not terminal: %',r; end if;
  r:=public.keel_job_rpc('reserve',scope_key,j2,jsonb_build_object('project',project_one,'actor',1,'digest',digest_key,'preview',pv2,'value','Acme second intent','minutes',15,'workspaceLimit',30,'projectLimit',30));
  if r->'row'->>'state' is distinct from 'prepared' then raise exception 'terminal job kept the lane: %',r; end if;
  if public.keel_job_rpc('budget',scope_key,j1,jsonb_build_object('project',project_one))<>'{"workspaceMinutes":30,"projectMinutes":30}'::jsonb then raise exception 'terminal minutes not charged'; end if;
  r:=public.keel_job_rpc('refuse',scope_key,j2,'{}'::jsonb);
  if r->'row'->>'state' is distinct from 'refused' or r->'row'->>'charged' is distinct from 'false' then raise exception 'refusal failed: %',r; end if;
  if public.keel_job_rpc('budget',scope_key,j1,jsonb_build_object('project',project_one))<>'{"workspaceMinutes":15,"projectMinutes":15}'::jsonb then raise exception 'refusal still charged'; end if;
  if public.keel_job_rpc('read',other_scope,j1,'{}'::jsonb) is not null then raise exception 'job visible to another actor scope'; end if;
  if jsonb_array_length(public.keel_job_rpc('list',scope_key,j1,jsonb_build_object('project',project_one,'after',null))->'rows')<>2 then raise exception 'list wrong'; end if;
  begin perform public.keel_job_rpc('reserve',scope_key,j3,'{}'::jsonb); raise exception 'reservation without fields accepted';
  exception when raise_exception then if sqlerrm<>'invalid job operation' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.job_previews where scope=scope_key) or exists(select 1 from keel_private.jobs where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 009-jobs hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a two-connection lane and weekly-minute reservation race").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statements [2] and [4] hold their transaction for 8 seconds after reserving:
   start [3] (and then [5]) in tab B within those 8 seconds. Record every result row.
   Expected: [2] changed true; [3] {"conflict": "lane"}. [4] changed true; [5]
   {"conflict": "budget"} (15 + 20 of 50 workspace minutes are taken, 20 more would be
   55). Each B row has a different pid from A and a finished_at no earlier than A's.
   [6] returns its PASS row. Run [7] whatever happened, to remove the synthetic rows.

-- [1] tab A: setup, four synthetic previews (two on one lane, two on other projects)
do $setup$
declare p record;
begin
 if exists(select 1 from keel_private.jobs where scope=repeat('ac',32)) or exists(select 1 from keel_private.job_previews where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [7] first'; end if;
 for p in select * from (values (repeat('31',32),repeat('c1',32)),(repeat('32',32),repeat('c1',32)),(repeat('33',32),repeat('c2',32)),(repeat('34',32),repeat('c3',32))) v(id,project) loop
  if public.keel_job_rpc('preview-create',repeat('ac',32),p.id,jsonb_build_object('project',p.project,'actor',1,'digest',repeat('e1',32),'value','Acme race preview')) is null then raise exception 'setup preview failed'; end if;
 end loop;
end $setup$;
select 'race ready' as result;

-- [2] tab A: reserve on lane c1 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('41',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('31',32),'value','Acme lane A','minutes',15,'workspaceLimit',50,'projectLimit',30)) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result from action cross join held;

-- [3] tab B: reserve on the same lane c1 while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('42',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('32',32),'value','Acme lane B','minutes',15,'workspaceLimit',50,'projectLimit',30)) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result from action;

-- [4] tab A: reserve 20 minutes on project c2 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('43',32),jsonb_build_object('project',repeat('c2',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('33',32),'value','Acme minutes A','minutes',20,'workspaceLimit',50,'projectLimit',30)) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result from action cross join held;

-- [5] tab B: reserve 20 minutes on project c3 while [4] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('44',32),jsonb_build_object('project',repeat('c3',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('34',32),'value','Acme minutes B','minutes',20,'workspaceLimit',50,'projectLimit',30)) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result from action;

-- [6] tab A: one job per lane, and the workspace minutes held
do $check$
begin
 if (select count(*) from keel_private.jobs where scope=repeat('ac',32) and project=repeat('c1',32) and state not in('terminal','refused'))<>1 then raise exception 'lane race: expected exactly one active job on lane c1'; end if;
 if (select count(*) from keel_private.jobs where scope=repeat('ac',32) and project in(repeat('c2',32),repeat('c3',32)))<>1 then raise exception 'minute race: expected exactly one of the two 20-minute reservations'; end if;
 if (select sum(minutes) from keel_private.jobs where scope=repeat('ac',32) and charged)>50 then raise exception 'workspace weekly minutes exceeded'; end if;
end $check$;
select 'PASS 009 lane and weekly-minute races' as result;

-- [7] tab A: cleanup, always
delete from keel_private.jobs where scope=repeat('ac',32);
delete from keel_private.job_previews where scope=repeat('ac',32);
select (select count(*) from keel_private.jobs where scope=repeat('ac',32))+(select count(*) from keel_private.job_previews where scope=repeat('ac',32)) as acme_rows_left;
*/
