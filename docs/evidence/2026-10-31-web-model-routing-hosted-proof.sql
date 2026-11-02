-- Hosted proof for lib/web/migrations/011-model-routing.sql (phase 106, plan step migration-011).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (008 is already applied: 011 reads its credential table). Paste
-- the whole file and run it once; then run the two-connection race at the end of
-- this file in two editor tabs.
--
-- Proves: keel_private.model_records, model_tasks, model_attempts, model_reservations
--   and model_cooldowns exist with row level security and no table privilege for anon,
--   authenticated or service_role; public.keel_model_rpc(text,text,text,bigint,text,
--   jsonb) and public.keel_model_credential_read(text,text,text,bigint) are SECURITY
--   DEFINER with an empty search_path and return jsonb; anon and authenticated cannot
--   execute either or touch the tables (catalog and SET LOCAL ROLE). As service_role,
--   with one synthetic stored credential: quotes are immutable and actor-bound; a
--   reservation charges its ceiling, is idempotent, and holds the project's single
--   concurrency slot; begin is granted once against the exact credential generation;
--   settlement replaces the ceiling with the actual charge; the workspace allowance
--   then refuses an over-budget attempt; a stage-2 continuation needs a completed
--   checkpoint; a cooldown blocks its connection; the credential read returns
--   ciphertext only for the exact generation and policy.
-- Leaves behind: nothing. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the race commits synthetic rows
--   under one Acme scope and its last statement deletes them.
-- Expected result: one row, result = 'PASS 011-model-routing hosted proof'. Any wrong
--   fact stops the script with an exception naming it. The race's expected results
--   are written beside its statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), the provider, and real money.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-011; the
--   race is replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('c1',32);
 connection_key text:=repeat('c3',32); policy_key text:=repeat('a1',32); fence_key text:=repeat('f1',32); digest_key text:=repeat('e1',32);
 q1 text:=repeat('61',32); q2 text:=repeat('62',32); t1 text:=repeat('71',32); t2 text:=repeat('72',32); t3 text:=repeat('73',32);
 a1 text:=repeat('81',32); a2 text:=repeat('82',32); a3 text:=repeat('83',32); a4 text:=repeat('84',32);
 cipher text:='Acme opaque ciphertext placeholder';
 functions text[]:=array['public.keel_model_rpc(text,text,text,bigint,text,jsonb)','public.keel_model_credential_read(text,text,text,bigint)'];
 tables text[]:=array['keel_private.model_records','keel_private.model_tasks','keel_private.model_attempts','keel_private.model_reservations','keel_private.model_cooldowns'];
 spec jsonb; r jsonb; present boolean; t text; f text; role_name text;
begin
 if to_regclass('keel_private.connection_credentials') is null then raise exception '011 needs 008: keel_private.connection_credentials is missing'; end if;
 foreach t in array tables loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 foreach f in array functions loop
  if to_regprocedure(f) is null then raise exception 'missing function %',f; end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(f) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',f; end if;
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'a browser role can execute %',f; end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then raise exception 'service_role cannot execute %',f; end if;
 end loop;
 foreach t in array tables||array['keel_private.connection_credentials'] loop
  execute format('select exists(select 1 from %s where scope=%L)',t,scope_key) into present;
  if present then raise exception 'Acme proof keys already present in %',t; end if;
 end loop;
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
    begin perform public.keel_model_rpc('read',scope_key,a1,1,project_key,'{}'::jsonb); raise exception 'client model RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
    begin perform public.keel_model_credential_read(scope_key,connection_key,policy_key,1); raise exception 'client credential read allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  perform public.keel_connection_rpc('put',scope_key,connection_key,0,policy_key,repeat('b1',32),1,cipher,'{}'::jsonb);
  r:=public.keel_model_rpc('record-create',scope_key,q1,1,project_key,jsonb_build_object('kind','quote','value','Acme pinned quote record'));
  if r->>'id' is distinct from q1 or r->>'kind' is distinct from 'quote' then raise exception 'quote not recorded: %',r; end if;
  if public.keel_model_rpc('record-create',scope_key,q1,1,project_key,jsonb_build_object('kind','quote','value','Acme replacement quote')) is not null then raise exception 'quote mutable'; end if;
  if public.keel_model_rpc('record-read',scope_key,q1,2,project_key,jsonb_build_object('kind','quote')) is not null then raise exception 'quote visible to another actor'; end if;
  spec:=jsonb_build_object('task',t1,'stage',1,'connection',connection_key,'digest',digest_key,'quote',q1,'fence',fence_key,'value','Acme sealed model request','ceiling',100,'taskLimit',200,
   'workspaceLimit',130,'projectLimit',500,'connectionLimit',500,'concurrency',5,
   'windows',jsonb_build_array(jsonb_build_object('pool',repeat('91',32),'amount',2,'available',3,'expiresAt',to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
   'credential',jsonb_build_object('scope',scope_key,'connection',connection_key,'policy',policy_key,'version',1));
  r:=public.keel_model_rpc('reserve',scope_key,a1,1,project_key,spec);
  if r->>'changed' is distinct from 'true' or r->'row'->>'state' is distinct from 'reserved' or r->'row'->>'charged' is distinct from '100' then raise exception 'reservation failed: %',r; end if;
  r:=public.keel_model_rpc('reserve',scope_key,a1,1,project_key,spec);
  if r->>'changed' is distinct from 'false' then raise exception 'repeated reservation changed: %',r; end if;
  perform public.keel_model_rpc('record-create',scope_key,q2,1,project_key,jsonb_build_object('kind','quote','value','Acme second quote record'));
  r:=public.keel_model_rpc('reserve',scope_key,a2,1,project_key,spec||jsonb_build_object('task',t2,'quote',q2,'windows','[]'::jsonb));
  if r->>'conflict' is distinct from 'concurrency' then raise exception 'second attempt on a busy project: %',r; end if;
  r:=public.keel_model_rpc('begin',scope_key,a1,1,project_key,jsonb_build_object('fence',fence_key,'version',1));
  if r->>'granted' is distinct from 'true' or r->'row'->>'state' is distinct from 'sending' then raise exception 'begin not granted: %',r; end if;
  r:=public.keel_model_rpc('begin',scope_key,a1,1,project_key,jsonb_build_object('fence',fence_key,'version',1));
  if r->>'conflict' is distinct from 'version' then raise exception 'second begin granted: %',r; end if;
  r:=public.keel_model_rpc('update',scope_key,a1,1,project_key,jsonb_build_object('fence',fence_key,'version',2,'state','completed','responseId','resp_acme1','result','Acme summary artifact text','actual',40));
  if r->'row'->>'state' is distinct from 'completed' or r->'row'->>'charged' is distinct from '40' or r->'row'->>'settled' is distinct from 'true' then raise exception 'settlement failed: %',r; end if;
  r:=public.keel_model_rpc('reserve',scope_key,a2,1,project_key,spec||jsonb_build_object('task',t2,'quote',q2,'windows','[]'::jsonb));
  if r->>'conflict' is distinct from 'budget' then raise exception 'workspace allowance not enforced (40 + 100 of 130): %',r; end if;
  r:=public.keel_model_rpc('reserve',scope_key,a3,1,project_key,spec||jsonb_build_object('task',t3,'stage',2,'quote',q2,'windows','[]'::jsonb));
  if r->>'conflict' is distinct from 'checkpoint' then raise exception 'continuation without checkpoint: %',r; end if;
  r:=public.keel_model_credential_read(scope_key,connection_key,policy_key,1);
  if r->>'value' is distinct from cipher or r->>'version' is distinct from '1' then raise exception 'credential read failed: %',r; end if;
  if public.keel_model_credential_read(scope_key,connection_key,policy_key,2)->>'conflict' is distinct from 'true'
  or public.keel_model_credential_read(scope_key,connection_key,repeat('a2',32),1)->>'conflict' is distinct from 'true' then raise exception 'credential read ignored generation or policy'; end if;
  if public.keel_model_rpc('cooldown',scope_key,a4,1,project_key,jsonb_build_object('connection',connection_key,'seconds',60))->>'recorded' is distinct from 'true' then raise exception 'cooldown not recorded'; end if;
  r:=public.keel_model_rpc('reserve',scope_key,a4,1,project_key,spec||jsonb_build_object('task',repeat('74',32),'quote',q2,'windows','[]'::jsonb,'workspaceLimit',500));
  if r->>'conflict' is distinct from 'cooldown' then raise exception 'cooldown did not block its connection: %',r; end if;
  if jsonb_array_length(public.keel_model_rpc('list',scope_key,a1,1,project_key,jsonb_build_object('after',null))->'rows')<>1 then raise exception 'history list wrong'; end if;
  begin perform public.keel_model_rpc('reserve',scope_key,a2,1,project_key,'{}'::jsonb); raise exception 'reservation without fields accepted';
  exception when raise_exception then if sqlerrm<>'invalid model fields' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 foreach t in array tables||array['keel_private.connection_credentials'] loop
  execute format('select exists(select 1 from %s where scope=%L)',t,scope_key) into present;
  if present then raise exception 'proof rows survived rollback in %',t; end if;
 end loop;
end $proof$;
select 'PASS 011-model-routing hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a two-connection allowance reservation race").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statement [2] holds its transaction for 8 seconds after reserving: start [3]
   in tab B within those 8 seconds. Record both result rows.
   Expected: two attempts on different projects, each with a 100 ceiling, against a
   150 workspace allowance: [2] changed true; [3] {"conflict": "budget"}, with a
   different pid and a finished_at no earlier than [2]'s. [4] returns its PASS row.
   Run [5] whatever happened, to remove the synthetic rows.

-- [1] tab A: setup, one quote per project
do $setup$
begin
 if exists(select 1 from keel_private.model_attempts where scope=repeat('ac',32)) or exists(select 1 from keel_private.model_records where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [5] first'; end if;
 perform public.keel_model_rpc('record-create',repeat('ac',32),repeat('63',32),1,repeat('c1',32),jsonb_build_object('kind','quote','value','Acme race quote for A'));
 perform public.keel_model_rpc('record-create',repeat('ac',32),repeat('64',32),1,repeat('c2',32),jsonb_build_object('kind','quote','value','Acme race quote for B'));
end $setup$;
select 'race ready' as result;

-- [2] tab A: reserve a 100 ceiling on project c1 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_model_rpc('reserve',repeat('ac',32),repeat('85',32),1,repeat('c1',32),jsonb_build_object('task',repeat('75',32),'stage',1,'connection',repeat('c3',32),'digest',repeat('e1',32),'quote',repeat('63',32),'fence',repeat('f1',32),'value','Acme sealed request A','ceiling',100,'taskLimit',200,'workspaceLimit',150,'projectLimit',150,'connectionLimit',150,'concurrency',5,'windows','[]'::jsonb,'credential',jsonb_build_object('scope',repeat('ac',32),'connection',repeat('c3',32),'policy',repeat('a1',32),'version',1))) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result->>'changed' as changed, result->>'conflict' as conflict from action cross join held;

-- [3] tab B: reserve a 100 ceiling on project c2 while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_model_rpc('reserve',repeat('ac',32),repeat('86',32),1,repeat('c2',32),jsonb_build_object('task',repeat('76',32),'stage',1,'connection',repeat('c4',32),'digest',repeat('e1',32),'quote',repeat('64',32),'fence',repeat('f1',32),'value','Acme sealed request B','ceiling',100,'taskLimit',200,'workspaceLimit',150,'projectLimit',150,'connectionLimit',150,'concurrency',5,'windows','[]'::jsonb,'credential',jsonb_build_object('scope',repeat('ac',32),'connection',repeat('c4',32),'policy',repeat('a1',32),'version',1))) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result->>'changed' as changed, result->>'conflict' as conflict from action;

-- [4] tab A: the allowance held
do $check$
begin
 if (select count(*) from keel_private.model_attempts where scope=repeat('ac',32))<>1 then raise exception 'expected exactly one reserved attempt'; end if;
 if (select sum(charged) from keel_private.model_attempts where scope=repeat('ac',32))>150 then raise exception 'workspace allowance exceeded'; end if;
end $check$;
select 'PASS 011 allowance reservation race' as result;

-- [5] tab A: cleanup, always
delete from keel_private.model_reservations where scope=repeat('ac',32);
delete from keel_private.model_attempts where scope=repeat('ac',32);
delete from keel_private.model_tasks where scope=repeat('ac',32);
delete from keel_private.model_records where scope=repeat('ac',32);
delete from keel_private.model_cooldowns where scope=repeat('ac',32);
select (select count(*) from keel_private.model_attempts where scope=repeat('ac',32))+(select count(*) from keel_private.model_records where scope=repeat('ac',32))+(select count(*) from keel_private.model_tasks where scope=repeat('ac',32)) as acme_rows_left;
*/
