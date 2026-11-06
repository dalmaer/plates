-- Hosted proof for lib/web/migrations/019-backlog-events.sql (phase 184, plan step migration-019).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-018 are already applied). Paste the whole file and run it once.
--
-- Proves: plates_home.backlog_events exists with row level security and no table
--   privilege for anon, authenticated or service_role, and anon and authenticated
--   still cannot use schema plates_home; its columns are an owner digest, the
--   database's time and short codes only; public.plates_backlog_events_rpc(text,text,jsonb,timestamptz)
--   is SECURITY DEFINER with an empty search_path and returns jsonb, executable by
--   service_role only, and no legacy keel_ name was added; anon and authenticated
--   cannot execute it or touch the table (catalog and SET LOCAL ROLE); service_role
--   cannot touch the table directly. As service_role, a synthetic owner appends one
--   event and lists it back, another owner sees none, a Not now's reason text, an
--   unknown field and a malformed scope are refused, and a stored event cannot be
--   changed (append-only).
-- Leaves behind: nothing. The synthetic Acme row is written inside a subtransaction
--   that is rolled back on success; the last check fails if it survived.
-- Expected result: one row, result = 'PASS 019-backlog-events hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); an event written by the deployed web and read back,
--   which the step records.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-019.
do $proof$
declare
 scope_key text:=repeat('ae',32);
 other_key text:=repeat('af',32);
 rpc text:='public.plates_backlog_events_rpc(text,text,jsonb,timestamptz)';
 r jsonb; role_name text;
begin
 if to_regnamespace('plates_home') is null then raise exception 'missing schema plates_home'; end if;
 if has_schema_privilege('anon','plates_home','USAGE') or has_schema_privilege('authenticated','plates_home','USAGE') then raise exception 'a browser role can use schema plates_home'; end if;
 if to_regclass('plates_home.backlog_events') is null then raise exception 'missing table plates_home.backlog_events'; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass('plates_home.backlog_events')) then raise exception 'row level security off on plates_home.backlog_events'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'plates_home.backlog_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on plates_home.backlog_events',role_name; end if;
 end loop;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='plates_home' and table_name='backlog_events')
  <> array['id','scope','at','actor','key','action','reason','route','lane','position','takes','outcome','receipt'] then raise exception 'plates_home.backlog_events holds more than an owner digest, a time and codes'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if not exists(select 1 from pg_trigger where tgrelid=to_regclass('plates_home.backlog_events') and tgname='backlog_events_append_only' and tgenabled<>'D') then raise exception 'plates_home.backlog_events is not append-only'; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='keel_backlog_events_rpc') then raise exception 'a legacy keel_backlog_events_rpc name exists'; end if;
 if exists(select 1 from plates_home.backlog_events where scope in (scope_key,other_key)) then raise exception 'Acme proof key already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin execute 'select 1 from plates_home.backlog_events limit 1'; raise exception 'direct read of plates_home.backlog_events allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin execute 'delete from plates_home.backlog_events where false'; raise exception 'direct write of plates_home.backlog_events allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.plates_backlog_events_rpc('list',scope_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_backlog_events_rpc('list',scope_key)<>'{"events":[]}'::jsonb then raise exception 'an unknown owner has events'; end if;
  r:=public.plates_backlog_events_rpc('append',scope_key,'{"actor":"owner","key":"acme:phase:1","action":"not-now","reason":"stated","takes":5,"outcome":"not-now"}'::jsonb);
  if r->>'appended'<>'true' or r->>'at' is null then raise exception 'an event was not appended: %',r; end if;
  r:=public.plates_backlog_events_rpc('list',scope_key);
  if jsonb_array_length(r->'events')<>1 or r->'events'->0->>'action'<>'not-now' or r->'events'->0->>'reason'<>'stated' or (r->'events'->0->>'takes')::int<>5 then raise exception 'the event did not read back: %',r; end if;
  if public.plates_backlog_events_rpc('list',other_key)<>'{"events":[]}'::jsonb then raise exception 'another owner sees the event'; end if;
  begin perform public.plates_backlog_events_rpc('append',scope_key,'{"actor":"owner","key":"acme:phase:1","action":"not-now","reason":"waiting on the vendor"}'::jsonb); raise exception 'reason text accepted';
  exception when raise_exception then if sqlerrm<>'invalid backlog event' then raise; end if; end;
  begin perform public.plates_backlog_events_rpc('append',scope_key,'{"actor":"owner","key":"acme:phase:1","action":"answer","why":"words"}'::jsonb); raise exception 'unknown field accepted';
  exception when raise_exception then if sqlerrm<>'invalid backlog event' then raise; end if; end;
  begin perform public.plates_backlog_events_rpc('list','not-a-digest'); raise exception 'malformed scope accepted';
  exception when raise_exception then if sqlerrm<>'invalid backlog event input' then raise; end if; end;
  reset role;
  begin update plates_home.backlog_events set lane='yours' where scope=scope_key; raise exception 'a stored event was changed';
  exception when raise_exception then if sqlerrm<>'backlog events are append-only' then raise; end if; end;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from plates_home.backlog_events where scope in (scope_key,other_key)) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 019-backlog-events hosted proof' as result;
