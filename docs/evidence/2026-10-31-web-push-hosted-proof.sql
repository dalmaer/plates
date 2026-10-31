-- Hosted proof for lib/web/migrations/015-push.sql (phase 152, plan step migration-015).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-014 are already applied). Paste the whole file and run it once.
--
-- Proves: the plates_push schema exists and anon and authenticated cannot use it;
--   plates_push.subscriptions and plates_push.ledger exist with row level security and
--   no table privilege for anon, authenticated or service_role; public.plates_push_rpc
--   (text,text,text,text) is SECURITY DEFINER with an empty search_path and returns
--   jsonb, executable by service_role only, and no legacy keel_ name was added; anon and
--   authenticated cannot execute it or touch the tables (catalog and SET LOCAL ROLE);
--   service_role cannot touch the tables directly. As service_role, a synthetic owner
--   subscribes one sealed device (resubscribing replaces it, not duplicates it), lists
--   it, unsubscribes it once, is capped at ten devices, and claims one notification
--   item exactly once; malformed input is refused.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a subtransaction
--   that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 015-push hosted proof'. Any wrong fact
--   stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); the authenticated subscribe request through the
--   deployed route, which the step records with its response status; push delivery.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-015.
do $proof$
declare
 scope_key text:=repeat('ac',32); device_key text:=repeat('d1',32); item_key text:=repeat('e1',32);
 rpc text:='public.plates_push_rpc(text,text,text,text)';
 tables text[]:=array['plates_push.subscriptions','plates_push.ledger'];
 r jsonb; t text; role_name text; i integer;
begin
 if to_regnamespace('plates_push') is null then raise exception 'missing schema plates_push'; end if;
 if has_schema_privilege('anon','plates_push','USAGE') or has_schema_privilege('authenticated','plates_push','USAGE') then raise exception 'a browser role can use schema plates_push'; end if;
 foreach t in array tables loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='keel_push_rpc') then raise exception 'a legacy keel_push_rpc name exists'; end if;
 if exists(select 1 from plates_push.subscriptions where scope=scope_key) or exists(select 1 from plates_push.ledger where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
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
    begin perform public.plates_push_rpc('list',scope_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_push_rpc('list',scope_key)<>'{"subscriptions":[]}'::jsonb then raise exception 'empty list not empty'; end if;
  r:=public.plates_push_rpc('subscribe',scope_key,device_key,'Acme sealed subscription');
  if r<>'{"subscribed":true,"devices":1}'::jsonb then raise exception 'subscribe failed: %',r; end if;
  r:=public.plates_push_rpc('subscribe',scope_key,device_key,'Acme resealed subscription');
  if r<>'{"subscribed":true,"devices":1}'::jsonb then raise exception 'resubscribe duplicated the device: %',r; end if;
  r:=public.plates_push_rpc('list',scope_key);
  if r<>jsonb_build_object('subscriptions',jsonb_build_array(jsonb_build_object('key',device_key,'value','Acme resealed subscription'))) then raise exception 'list wrong: %',r; end if;
  if public.plates_push_rpc('unsubscribe',scope_key,device_key)<>'{"removed":true,"devices":0}'::jsonb then raise exception 'unsubscribe failed'; end if;
  if public.plates_push_rpc('unsubscribe',scope_key,device_key)<>'{"removed":false,"devices":0}'::jsonb then raise exception 'second unsubscribe removed something'; end if;
  for i in 1..10 loop
   r:=public.plates_push_rpc('subscribe',scope_key,lpad(to_hex(i),64,'0'),'Acme sealed subscription');
  end loop;
  if r->>'devices' is distinct from '10' then raise exception 'ten devices not stored: %',r; end if;
  r:=public.plates_push_rpc('subscribe',scope_key,device_key,'Acme eleventh device');
  if r<>'{"capacity":true}'::jsonb then raise exception 'eleventh device accepted: %',r; end if;
  if public.plates_push_rpc('claim',scope_key,item_key)<>'{"claimed":true}'::jsonb then raise exception 'first claim refused'; end if;
  if public.plates_push_rpc('claim',scope_key,item_key)<>'{"claimed":false}'::jsonb then raise exception 'an item was claimed twice'; end if;
  begin perform public.plates_push_rpc('send',scope_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid push input' then raise; end if; end;
  begin perform public.plates_push_rpc('list',scope_key,device_key); raise exception 'list with a key accepted';
  exception when raise_exception then if sqlerrm<>'invalid push list' then raise; end if; end;
  begin perform public.plates_push_rpc('subscribe',scope_key,device_key,repeat('x',4097)); raise exception 'oversized subscription accepted';
  exception when raise_exception then if sqlerrm<>'invalid push subscription' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from plates_push.subscriptions where scope=scope_key) or exists(select 1 from plates_push.ledger where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 015-push hosted proof' as result;
