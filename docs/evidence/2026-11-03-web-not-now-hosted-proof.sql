-- Hosted proof for lib/web/migrations/017-not-now.sql (phase 173, plan step migration-017).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-016 are already applied). Paste the whole file and run it once.
--
-- Proves: the plates_home schema exists and anon and authenticated cannot use it;
--   plates_home.not_now exists with row level security and no table privilege for
--   anon, authenticated or service_role; public.plates_not_now_rpc
--   (text,text,text,text,date) is SECURITY DEFINER with an empty search_path and
--   returns jsonb, executable by service_role only, and no legacy keel_ name was
--   added; anon and authenticated cannot execute it or touch the table (catalog and
--   SET LOCAL ROLE); service_role cannot touch the table directly. As service_role,
--   a synthetic owner puts one sealed item off (putting it off again replaces it, not
--   duplicates it), lists it, clears it once, is capped at 500 items, and a date that
--   is today or past is refused; malformed input is refused.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a subtransaction
--   that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 017-not-now hosted proof'. Any wrong fact
--   stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); the authenticated Not now request through the
--   deployed route, which the step records with its response status.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-017.
do $proof$
declare
 scope_key text:=repeat('ac',32); item_key text:=repeat('e1',32);
 rpc text:='public.plates_not_now_rpc(text,text,text,text,date)';
 later date:=(clock_timestamp() at time zone 'UTC')::date + 7;
 r jsonb; role_name text; i integer;
begin
 if to_regnamespace('plates_home') is null then raise exception 'missing schema plates_home'; end if;
 if has_schema_privilege('anon','plates_home','USAGE') or has_schema_privilege('authenticated','plates_home','USAGE') then raise exception 'a browser role can use schema plates_home'; end if;
 if to_regclass('plates_home.not_now') is null then raise exception 'missing table plates_home.not_now'; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass('plates_home.not_now')) then raise exception 'row level security off on plates_home.not_now'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'plates_home.not_now','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on plates_home.not_now',role_name; end if;
 end loop;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='keel_not_now_rpc') then raise exception 'a legacy keel_not_now_rpc name exists'; end if;
 if exists(select 1 from plates_home.not_now where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin execute 'select 1 from plates_home.not_now limit 1'; raise exception 'direct read of plates_home.not_now allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin execute 'delete from plates_home.not_now where false'; raise exception 'direct write of plates_home.not_now allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.plates_not_now_rpc('list',scope_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_not_now_rpc('list',scope_key)<>'{"items":[]}'::jsonb then raise exception 'empty list not empty'; end if;
  r:=public.plates_not_now_rpc('put',scope_key,item_key,'Acme sealed record',later);
  if r<>'{"put":true,"count":1}'::jsonb then raise exception 'put failed: %',r; end if;
  r:=public.plates_not_now_rpc('put',scope_key,item_key,'Acme resealed record',later);
  if r<>'{"put":true,"count":1}'::jsonb then raise exception 'a second put duplicated the item: %',r; end if;
  r:=public.plates_not_now_rpc('list',scope_key);
  if r<>jsonb_build_object('items',jsonb_build_array(jsonb_build_object('key',item_key,'value','Acme resealed record','until',later::text))) then raise exception 'list wrong: %',r; end if;
  if public.plates_not_now_rpc('clear',scope_key,item_key)<>'{"cleared":true}'::jsonb then raise exception 'clear failed'; end if;
  if public.plates_not_now_rpc('clear',scope_key,item_key)<>'{"cleared":false}'::jsonb then raise exception 'second clear removed something'; end if;
  for i in 1..500 loop
   r:=public.plates_not_now_rpc('put',scope_key,lpad(to_hex(i),64,'0'),'Acme sealed record',later);
  end loop;
  if r->>'count' is distinct from '500' then raise exception 'five hundred items not stored: %',r; end if;
  r:=public.plates_not_now_rpc('put',scope_key,item_key,'Acme five hundred and first',later);
  if r<>'{"capacity":true}'::jsonb then raise exception 'five hundred and first item accepted: %',r; end if;
  begin perform public.plates_not_now_rpc('put',scope_key,item_key,'Acme sealed record',(clock_timestamp() at time zone 'UTC')::date); raise exception 'a date of today accepted';
  exception when raise_exception then if sqlerrm<>'invalid not now record' then raise; end if; end;
  begin perform public.plates_not_now_rpc('snooze',scope_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid not now input' then raise; end if; end;
  begin perform public.plates_not_now_rpc('list',scope_key,item_key); raise exception 'list with a key accepted';
  exception when raise_exception then if sqlerrm<>'invalid not now list' then raise; end if; end;
  begin perform public.plates_not_now_rpc('put',scope_key,item_key,repeat('x',4097),later); raise exception 'oversized record accepted';
  exception when raise_exception then if sqlerrm<>'invalid not now record' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from plates_home.not_now where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 017-not-now hosted proof' as result;
