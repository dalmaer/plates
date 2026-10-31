-- Hosted proof for lib/web/migrations/013-night-retries.sql (phase 107, plan step migration-013).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (009 and 010 are already applied). Paste the whole file and run
-- it once; then run the two-connection race at the end of this file in two editor tabs.
--
-- Proves: keel_private.night_previews and keel_private.night_retries exist with row
--   level security and no table privilege for anon, authenticated or service_role; the
--   partial unique index keel_private.night_retry_lane exists; 013 moved 010's job
--   admission (its body bounds a claim by the job's minutes, so 010 came first) to
--   keel_private.job_rpc_before_night, which no API role can execute; the single public
--   keel_job_rpc is now the wrapper that calls it; public.keel_night_retry_rpc(text,
--   text,text,jsonb) and the wrapper are SECURITY DEFINER with an empty search_path,
--   return jsonb and are executable by service_role only; 009's and 010's replay fence
--   now holds, so neither can be reapplied (inspected, never run). As service_role, a
--   synthetic night retry reservation is idempotent and actor/project-bound; it and an
--   ordinary job exclude each other on one lane; both charge one shared weekly budget;
--   send is granted once; only an accepted request settles on a completed observation;
--   malformed observations are refused; the lane is then free for a job.
-- Leaves behind: nothing. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the race commits synthetic rows
--   under one Acme scope and its last statement deletes them.
-- Expected result: one row, result = 'PASS 013-night-retries hosted proof'. Any wrong
--   fact stops the script with an exception naming it. The race's expected results
--   are written beside its statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), and GitHub's rerun API.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-013; the
--   race is replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('c1',32); digest_key text:=repeat('e1',32);
 npv1 text:=repeat('11',32); npv2 text:=repeat('12',32); jpv text:=repeat('13',32);
 n1 text:=repeat('21',32); n2 text:=repeat('22',32); j1 text:=repeat('23',32);
 delegate text:='keel_private.job_rpc_before_night(text,text,text,jsonb)';
 functions text[]:=array['public.keel_job_rpc(text,text,text,jsonb)','public.keel_night_retry_rpc(text,text,text,jsonb)'];
 tables text[]:=array['keel_private.night_previews','keel_private.night_retries'];
 who jsonb:=jsonb_build_object('project',repeat('c1',32),'actor',1);
 observation jsonb:=jsonb_build_object('runId',7001,'attempt',3,'state','completed','conclusion','failure','url','https://github.com/acme/studio/actions/runs/7001','observedAt','2026-10-31T00:06:00Z','attribution','unverified');
 r jsonb; t text; f text; role_name text;
begin
 foreach t in array tables loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('keel_private.night_retry_lane') and indisunique and indpred is not null) then raise exception 'missing partial unique index keel_private.night_retry_lane'; end if;
 if to_regprocedure(delegate) is null then raise exception 'missing saved admission delegate %',delegate; end if;
 if position('make_interval(mins=>r.minutes)' in (select prosrc from pg_proc where oid=to_regprocedure(delegate)))=0 then raise exception 'the saved delegate is not 010''s admission: 010 must precede 013'; end if;
 if has_function_privilege('anon',delegate,'EXECUTE') or has_function_privilege('authenticated',delegate,'EXECUTE') then raise exception 'a browser role can execute the saved admission delegate'; end if;
 if has_function_privilege('service_role',delegate,'EXECUTE') then raise exception 'service_role can execute the saved admission delegate'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='keel_job_rpc')<>1 then raise exception 'expected exactly one public keel_job_rpc'; end if;
 foreach f in array functions loop
  if to_regprocedure(f) is null then raise exception 'missing function %',f; end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(f) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',f; end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'a browser role can execute %',f; end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'service_role cannot execute %',f; end if;
 end loop;
 if position('keel_private.job_rpc_before_night(' in (select prosrc from pg_proc where oid=to_regprocedure(functions[1])))=0 then raise exception 'public keel_job_rpc is not the 013 wrapper'; end if;
 -- 009's and 010's first statement refuses to run when this (their exact condition) holds.
 if not (to_regprocedure('keel_private.job_rpc_before_night(text,text,text,jsonb)') is not null
    or to_regclass('keel_private.night_previews') is not null
    or to_regclass('keel_private.night_retries') is not null
    or to_regprocedure('public.keel_night_retry_rpc(text,text,text,jsonb)') is not null) then raise exception '009/010 replay fence would not hold'; end if;
 if exists(select 1 from keel_private.night_previews where scope=scope_key) or exists(select 1 from keel_private.night_retries where scope=scope_key)
 or exists(select 1 from keel_private.jobs where scope=scope_key) or exists(select 1 from keel_private.job_previews where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   foreach t in array tables loop
    begin execute format('select 1 from %s limit 1',t); raise exception 'direct read of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from %s where false',t); raise exception 'direct write of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
   end loop;
   begin perform keel_private.job_rpc_before_night('read',scope_key,j1,'{}'::jsonb); raise exception 'saved delegate callable by %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.keel_night_retry_rpc('read',scope_key,n1,who); raise exception 'client retry RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
    begin perform public.keel_job_rpc('read',scope_key,j1,'{}'::jsonb); raise exception 'client job RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  perform public.keel_night_retry_rpc('preview-create',scope_key,npv1,who||jsonb_build_object('digest',digest_key,'value','Acme retry preview'));
  r:=public.keel_night_retry_rpc('reserve',scope_key,n1,who||jsonb_build_object('digest',digest_key,'preview',npv1,'value','Acme retry intent','runId',7001,'attempt',2,'workspaceLimit',120,'projectLimit',120));
  if r->>'changed' is distinct from 'true' or r->'row'->>'state' is distinct from 'prepared' or r->'row'->>'minutes' is distinct from '60' then raise exception 'retry not reserved: %',r; end if;
  r:=public.keel_night_retry_rpc('reserve',scope_key,n1,who||jsonb_build_object('digest',digest_key,'preview',npv1,'value','Acme replay','runId',7001,'attempt',2,'workspaceLimit',120,'projectLimit',120));
  if r->>'changed' is distinct from 'false' or r->'row'->>'value' is distinct from 'Acme retry intent' then raise exception 'replay changed the retry: %',r; end if;
  if public.keel_night_retry_rpc('read',scope_key,n1,jsonb_build_object('project',project_key,'actor',2)) is not null
  or public.keel_night_retry_rpc('read',scope_key,n1,jsonb_build_object('project',repeat('c9',32),'actor',1)) is not null then raise exception 'retry visible to another actor or project'; end if;
  perform public.keel_job_rpc('preview-create',scope_key,jpv,who||jsonb_build_object('digest',digest_key,'value','Acme job preview'));
  r:=public.keel_job_rpc('reserve',scope_key,j1,who||jsonb_build_object('digest',digest_key,'preview',jpv,'value','Acme job intent','minutes',15,'workspaceLimit',120,'projectLimit',120));
  if r->>'conflict' is distinct from 'lane' then raise exception 'job took a retry''s lane: %',r; end if;
  perform public.keel_night_retry_rpc('preview-create',scope_key,npv2,who||jsonb_build_object('digest',digest_key,'value','Acme second retry preview'));
  r:=public.keel_night_retry_rpc('reserve',scope_key,n2,who||jsonb_build_object('digest',digest_key,'preview',npv2,'value','Acme second retry','runId',7001,'attempt',2,'workspaceLimit',120,'projectLimit',120));
  if r->>'conflict' is distinct from 'lane' then raise exception 'second retry on one lane: %',r; end if;
  if public.keel_job_rpc('budget',scope_key,j1,jsonb_build_object('project',project_key))<>'{"workspaceMinutes":60,"projectMinutes":60}'::jsonb then raise exception 'retry minutes not in the shared budget'; end if;
  r:=public.keel_night_retry_rpc('send',scope_key,n1,who);
  if r->>'granted' is distinct from 'true' then raise exception 'send not granted: %',r; end if;
  r:=public.keel_night_retry_rpc('send',scope_key,n1,who);
  if r->>'conflict' is distinct from 'state' then raise exception 'second send granted: %',r; end if;
  perform public.keel_night_retry_rpc('accepted',scope_key,n1,who);
  begin perform public.keel_night_retry_rpc('observe',scope_key,n1,who||jsonb_build_object('observation',observation||'{"attribution":"verified"}'::jsonb)); raise exception 'verified attribution accepted';
  exception when raise_exception then if sqlerrm<>'invalid retry observation' then raise; end if; end;
  r:=public.keel_night_retry_rpc('observe',scope_key,n1,who||jsonb_build_object('observation',observation));
  if r->'row'->>'state' is distinct from 'settled' then raise exception 'accepted retry not settled: %',r; end if;
  r:=public.keel_job_rpc('reserve',scope_key,j1,who||jsonb_build_object('digest',digest_key,'preview',jpv,'value','Acme job intent','minutes',15,'workspaceLimit',120,'projectLimit',120));
  if r->'row'->>'state' is distinct from 'prepared' then raise exception 'settled retry kept the lane: %',r; end if;
  if public.keel_job_rpc('budget',scope_key,j1,jsonb_build_object('project',project_key))<>'{"workspaceMinutes":75,"projectMinutes":75}'::jsonb then raise exception 'shared budget wrong after settlement'; end if;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.night_previews where scope=scope_key) or exists(select 1 from keel_private.night_retries where scope=scope_key)
 or exists(select 1 from keel_private.jobs where scope=scope_key) or exists(select 1 from keel_private.job_previews where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 013-night-retries hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a hosted race between a night retry and an ordinary job on one lane").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statement [2] holds its transaction for 8 seconds after reserving: start [3]
   in tab B within those 8 seconds. Record both result rows.
   Expected: [2] (the night retry) changed true; [3] (the ordinary job)
   {"conflict": "lane"}, with a different pid and a finished_at no earlier than [2]'s.
   [4] returns its PASS row. Run [5] whatever happened, to remove the synthetic rows.

-- [1] tab A: setup, a retry preview and a job preview on lane c1
do $setup$
begin
 if exists(select 1 from keel_private.night_retries where scope=repeat('ac',32)) or exists(select 1 from keel_private.night_previews where scope=repeat('ac',32))
 or exists(select 1 from keel_private.jobs where scope=repeat('ac',32)) or exists(select 1 from keel_private.job_previews where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [5] first'; end if;
 perform public.keel_night_retry_rpc('preview-create',repeat('ac',32),repeat('31',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'value','Acme race retry preview'));
 perform public.keel_job_rpc('preview-create',repeat('ac',32),repeat('32',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'value','Acme race job preview'));
end $setup$;
select 'race ready' as result;

-- [2] tab A: reserve the night retry on lane c1 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_night_retry_rpc('reserve',repeat('ac',32),repeat('41',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('31',32),'value','Acme retry intent','runId',7001,'attempt',2,'workspaceLimit',120,'projectLimit',120)) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result->>'changed' as changed, result->>'conflict' as conflict from action cross join held;

-- [3] tab B: reserve an ordinary job on the same lane while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_job_rpc('reserve',repeat('ac',32),repeat('42',32),jsonb_build_object('project',repeat('c1',32),'actor',1,'digest',repeat('e1',32),'preview',repeat('32',32),'value','Acme job intent','minutes',15,'workspaceLimit',120,'projectLimit',120)) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result->>'changed' as changed, result->>'conflict' as conflict from action;

-- [4] tab A: exactly one admission holds the lane
do $check$
begin
 if (select count(*) from keel_private.jobs where scope=repeat('ac',32) and project=repeat('c1',32) and state not in('terminal','refused'))
  + (select count(*) from keel_private.night_retries where scope=repeat('ac',32) and project=repeat('c1',32) and state not in('settled','refused'))<>1 then raise exception 'expected exactly one active admission on lane c1'; end if;
end $check$;
select 'PASS 013 night retry and job race' as result;

-- [5] tab A: cleanup, always
delete from keel_private.night_retries where scope=repeat('ac',32);
delete from keel_private.night_previews where scope=repeat('ac',32);
delete from keel_private.jobs where scope=repeat('ac',32);
delete from keel_private.job_previews where scope=repeat('ac',32);
select (select count(*) from keel_private.night_retries where scope=repeat('ac',32))+(select count(*) from keel_private.night_previews where scope=repeat('ac',32))+(select count(*) from keel_private.jobs where scope=repeat('ac',32))+(select count(*) from keel_private.job_previews where scope=repeat('ac',32)) as acme_rows_left;
*/
