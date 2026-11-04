-- Hosted proof for lib/web/migrations/018-last-looked.sql (phase 166, plan step migration-018).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-017 are already applied). Paste the whole file and run it once.
--
-- Proves: plates_home.last_looked exists with row level security and no table
--   privilege for anon, authenticated or service_role, and anon and authenticated
--   still cannot use schema plates_home; public.plates_last_looked_rpc(text,text) is
--   SECURITY DEFINER with an empty search_path and returns jsonb, executable by
--   service_role only, and no legacy keel_ name was added; anon and authenticated
--   cannot execute it or touch the table (catalog and SET LOCAL ROLE); service_role
--   cannot touch the table directly. As service_role, a synthetic owner reads
--   nothing, records a first visit (no previous one), a reload within thirty
--   minutes leaves it alone, and a load after a stored visit an hour old makes that
--   visit the previous one; malformed input is refused. The table holds an owner
--   digest and times only.
-- Leaves behind: nothing. The synthetic Acme row is written inside a subtransaction
--   that is rolled back on success; the last check fails if it survived.
-- Expected result: one row, result = 'PASS 018-last-looked hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); the authenticated Home load through the deployed
--   route, which the step records with what Since you last looked says.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-018.
do $proof$
declare
 scope_key text:=repeat('ad',32);
 rpc text:='public.plates_last_looked_rpc(text,text)';
 r jsonb; first jsonb; role_name text;
begin
 if to_regnamespace('plates_home') is null then raise exception 'missing schema plates_home'; end if;
 if has_schema_privilege('anon','plates_home','USAGE') or has_schema_privilege('authenticated','plates_home','USAGE') then raise exception 'a browser role can use schema plates_home'; end if;
 if to_regclass('plates_home.last_looked') is null then raise exception 'missing table plates_home.last_looked'; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass('plates_home.last_looked')) then raise exception 'row level security off on plates_home.last_looked'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'plates_home.last_looked','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on plates_home.last_looked',role_name; end if;
 end loop;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='plates_home' and table_name='last_looked')
  <> array['scope','seen_at','previous_at','updated_at'] then raise exception 'plates_home.last_looked holds more than an owner digest and times'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='keel_last_looked_rpc') then raise exception 'a legacy keel_last_looked_rpc name exists'; end if;
 if exists(select 1 from plates_home.last_looked where scope=scope_key) then raise exception 'Acme proof key already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin execute 'select 1 from plates_home.last_looked limit 1'; raise exception 'direct read of plates_home.last_looked allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin execute 'delete from plates_home.last_looked where false'; raise exception 'direct write of plates_home.last_looked allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.plates_last_looked_rpc('read',scope_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_last_looked_rpc('read',scope_key)<>'{"seen":null,"previous":null}'::jsonb then raise exception 'an unknown owner has a visit'; end if;
  first:=public.plates_last_looked_rpc('visit',scope_key);
  if first->>'seen' is null or first->'previous'<>'null'::jsonb then raise exception 'first visit wrong: %',first; end if;
  r:=public.plates_last_looked_rpc('visit',scope_key);
  if r->'previous'<>'null'::jsonb then raise exception 'a reload within thirty minutes made a previous visit: %',r; end if;
  reset role;
  update plates_home.last_looked set seen_at='2026-01-01T09:00:00Z' where scope=scope_key;
  set local role service_role;
  r:=public.plates_last_looked_rpc('visit',scope_key);
  if r->>'previous'<>'2026-01-01T09:00:00Z' then raise exception 'a new visit did not keep the last one: %',r; end if;
  if public.plates_last_looked_rpc('read',scope_key)<>r then raise exception 'a read differs from the visit it follows'; end if;
  begin perform public.plates_last_looked_rpc('write',scope_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid last looked input' then raise; end if; end;
  begin perform public.plates_last_looked_rpc('read','not-a-digest'); raise exception 'malformed scope accepted';
  exception when raise_exception then if sqlerrm<>'invalid last looked input' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from plates_home.last_looked where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 018-last-looked hosted proof' as result;
