-- Hosted proof for lib/web/migrations/022-waiting-sessions.sql (plan step migration-022).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-021 are already applied). Paste the whole file and run it once.
--
-- Proves: plates_home.device_keys and plates_home.waiting_sessions exist with row
--   level security and no table privilege for anon, authenticated or service_role,
--   and anon and authenticated still cannot use schema plates_home;
--   public.plates_waiting_rpc(text,text,text,text,text,timestamptz) is SECURITY
--   DEFINER with an empty search_path and returns jsonb, executable by service_role
--   only; anon and authenticated cannot execute it or touch either table. As
--   service_role, a synthetic device key is created, resolved by its digest, pushes
--   a snapshot that lists back, and once revoked it resolves to nothing, its
--   snapshot is gone and a push is refused; malformed input is refused. The tables
--   hold digests, ciphertext and times only.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 022-waiting-sessions hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); a real device's push through the deployed route,
--   which the step records with what Home's Sessions waiting on you shows.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-022.
do $proof$
declare
 scope_key text:=repeat('ac',32); key_hash text:=repeat('ab',32); device_key text:=repeat('cd',32);
 rpc text:='public.plates_waiting_rpc(text,text,text,text,text,timestamptz)';
 r jsonb; role_name text; tbl text;
begin
 if to_regnamespace('plates_home') is null then raise exception 'missing schema plates_home'; end if;
 if has_schema_privilege('anon','plates_home','USAGE') or has_schema_privilege('authenticated','plates_home','USAGE') then raise exception 'a browser role can use schema plates_home'; end if;
 foreach tbl in array array['plates_home.device_keys','plates_home.waiting_sessions'] loop
  if to_regclass(tbl) is null then raise exception 'missing table %',tbl; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(tbl)) then raise exception 'row level security off on %',tbl; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,tbl; end if;
  end loop;
 end loop;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='plates_home' and table_name='device_keys')
  <> array['key_hash','scope','device','value','created_at'] then raise exception 'plates_home.device_keys holds more than digests, ciphertext and a time'; end if;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='plates_home' and table_name='waiting_sessions')
  <> array['scope','device','value','scanned_at'] then raise exception 'plates_home.waiting_sessions holds more than digests, ciphertext and a time'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute public.plates_waiting_rpc'; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from plates_home.device_keys where scope=scope_key) then raise exception 'Acme proof key already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin execute 'select 1 from plates_home.device_keys limit 1'; raise exception 'direct read of plates_home.device_keys allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin execute 'delete from plates_home.waiting_sessions where false'; raise exception 'direct write of plates_home.waiting_sessions allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.plates_waiting_rpc('list',scope_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_waiting_rpc('key-resolve',null,key_hash)<>'{"found":false}'::jsonb then raise exception 'an unknown key resolved'; end if;
  r:=public.plates_waiting_rpc('key-create',scope_key,key_hash,device_key,'sealed-acme-device');
  if r<>'{"created":true}'::jsonb then raise exception 'key-create wrong: %',r; end if;
  r:=public.plates_waiting_rpc('key-resolve',null,key_hash);
  if r->>'scope'<>scope_key or r->>'device'<>device_key then raise exception 'key-resolve wrong: %',r; end if;
  r:=public.plates_waiting_rpc('push',scope_key,null,device_key,'sealed-acme-snapshot',clock_timestamp());
  if r<>'{"pushed":true}'::jsonb then raise exception 'push wrong: %',r; end if;
  if jsonb_array_length(public.plates_waiting_rpc('list',scope_key)->'items')<>1 then raise exception 'a pushed snapshot does not list'; end if;
  begin perform public.plates_waiting_rpc('push',scope_key,null,device_key,'x',clock_timestamp()+interval '1 day'); raise exception 'a snapshot from the future accepted';
  exception when raise_exception then if sqlerrm<>'invalid waiting push' then raise; end if; end;
  begin perform public.plates_waiting_rpc('steal',scope_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid waiting operation' then raise; end if; end;
  r:=public.plates_waiting_rpc('key-revoke',scope_key,null,device_key);
  if r<>'{"revoked":true}'::jsonb then raise exception 'key-revoke wrong: %',r; end if;
  if public.plates_waiting_rpc('key-resolve',null,key_hash)<>'{"found":false}'::jsonb then raise exception 'a revoked key still resolves'; end if;
  if jsonb_array_length(public.plates_waiting_rpc('list',scope_key)->'items')<>0 then raise exception 'a revoked device kept its snapshot'; end if;
  if public.plates_waiting_rpc('push',scope_key,null,device_key,'x',clock_timestamp())<>'{"revoked":true}'::jsonb then raise exception 'a revoked device pushed'; end if;
  reset role;
  raise exception using errcode='P0001', message='plates-waiting-proof-rollback';
 exception when raise_exception then
  if sqlerrm<>'plates-waiting-proof-rollback' then raise; end if;
 end;
 if exists(select 1 from plates_home.device_keys where scope=scope_key) or exists(select 1 from plates_home.waiting_sessions where scope=scope_key) then raise exception 'Acme proof rows survived'; end if;
end;
$proof$;
select 'PASS 022-waiting-sessions hosted proof' as result;
