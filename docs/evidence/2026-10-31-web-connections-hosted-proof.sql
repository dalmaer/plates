-- Hosted proof for lib/web/migrations/008-connections.sql (phase 103, plan step migration-008).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits. Paste the whole file and run it once; then run the
-- two-connection race at the end of this file in two editor tabs.
--
-- Proves: keel_private.connection_credentials exists with row level security and no
--   table privilege for anon, authenticated or service_role; public.keel_connection_rpc
--   has its 9-argument signature, is SECURITY DEFINER with an empty search_path and
--   returns jsonb; anon and authenticated cannot execute it or read the table (catalog
--   and SET LOCAL ROLE); service_role reads no ciphertext directly. As service_role, a
--   synthetic credential is stored and its metadata never carries the ciphertext; a
--   stale generation and a replayed request conflict; one rotation wins; another
--   actor scope sees nothing; removal leaves a tombstone without ciphertext; malformed
--   input is refused.
-- Leaves behind: nothing. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the race commits one synthetic row
--   and its last statement deletes it.
-- Expected result: one row, result = 'PASS 008-connections hosted proof'. Any wrong
--   fact stops the script with an exception naming it. The race's expected results
--   are written beside its statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), the wrapping key and the provider.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-008; the
--   race is replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 scope_key text:=repeat('ac',32); other_scope text:=repeat('bd',32); connection_key text:=repeat('c3',32);
 policy_key text:=repeat('a1',32); r1 text:=repeat('b1',32); r2 text:=repeat('b2',32); r3 text:=repeat('b3',32);
 cipher text:='Acme opaque ciphertext placeholder';
 rpc text:='public.keel_connection_rpc(text,text,text,bigint,text,text,bigint,text,jsonb)';
 tbl text:='keel_private.connection_credentials';
 r jsonb; row_now keel_private.connection_credentials; role_name text;
begin
 if to_regclass(tbl) is null then raise exception 'missing table %',tbl; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass(tbl)) then raise exception 'row level security off on %',tbl; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,tbl; end if;
 end loop;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from keel_private.connection_credentials where scope in(scope_key,other_scope)) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin perform 1 from keel_private.connection_credentials limit 1; raise exception 'direct read of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   begin delete from keel_private.connection_credentials where false; raise exception 'direct write of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.keel_connection_rpc('metadata',scope_key,connection_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.keel_connection_rpc('metadata',scope_key,connection_key) is not null then raise exception 'missing credential invented'; end if;
  r:=public.keel_connection_rpc('put',scope_key,connection_key,0,policy_key,r1,1,cipher,'{"state":"valid"}'::jsonb);
  if r->>'version' is distinct from '1' or r->>'state' is distinct from 'present' then raise exception 'first put failed: %',r; end if;
  if r ? 'value' or position(cipher in r::text)>0 then raise exception 'mutation returned ciphertext'; end if;
  r:=public.keel_connection_rpc('metadata',scope_key,connection_key);
  if r->>'version' is distinct from '1' or r->>'policy' is distinct from policy_key or r ? 'value' or position(cipher in r::text)>0 then raise exception 'metadata wrong or carries ciphertext: %',r; end if;
  r:=public.keel_connection_rpc('put',scope_key,connection_key,0,policy_key,r2,1,cipher,'{}'::jsonb);
  if r->>'conflict' is distinct from 'true' then raise exception 'stale generation accepted: %',r; end if;
  r:=public.keel_connection_rpc('put',scope_key,connection_key,1,policy_key,r1,1,cipher,'{}'::jsonb);
  if r->>'conflict' is distinct from 'true' then raise exception 'replayed request accepted: %',r; end if;
  r:=public.keel_connection_rpc('put',scope_key,connection_key,1,policy_key,r2,1,'Acme rotated ciphertext placeholder','{}'::jsonb);
  if r->>'version' is distinct from '2' or r->>'request' is distinct from r2 then raise exception 'rotation failed: %',r; end if;
  if public.keel_connection_rpc('metadata',other_scope,connection_key) is not null then raise exception 'credential visible to another actor scope'; end if;
  r:=public.keel_connection_rpc('remove',scope_key,connection_key,2,policy_key,r3,1);
  if r->>'version' is distinct from '3' or r->>'state' is distinct from 'removed' then raise exception 'removal failed: %',r; end if;
  begin perform public.keel_connection_rpc('put',scope_key,connection_key,3,policy_key,r1,1,'short','{}'::jsonb); raise exception 'short ciphertext accepted';
  exception when raise_exception then if sqlerrm<>'invalid connection ciphertext' then raise; end if; end;
  begin perform public.keel_connection_rpc('metadata',scope_key,connection_key,3); raise exception 'metadata with a mutation field accepted';
  exception when raise_exception then if sqlerrm<>'invalid metadata input' then raise; end if; end;
  reset role;
  select * into row_now from keel_private.connection_credentials where scope=scope_key and connection=connection_key;
  if row_now.value is not null or row_now.health is not null then raise exception 'removal kept ciphertext'; end if;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.connection_credentials where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 008-connections hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a CAS rotation race between two connections").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statement [2] holds its transaction for 8 seconds after rotating: start [3]
   in tab B within those 8 seconds. Record both result rows.
   Expected: [2] returns version 2; [3] returns {"conflict": true}, with a different
   pid and a finished_at no earlier than [2]'s; [4] returns its PASS row. Run [5]
   whatever happened, to remove the synthetic row.

-- [1] tab A: setup, one synthetic credential at version 1
do $setup$
begin
 if exists(select 1 from keel_private.connection_credentials where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [5] first'; end if;
 if public.keel_connection_rpc('put',repeat('ac',32),repeat('c3',32),0,repeat('a1',32),repeat('b0',32),1,'Acme opaque ciphertext placeholder','{}'::jsonb)->>'version' is distinct from '1' then raise exception 'setup put failed'; end if;
end $setup$;
select 'race ready' as result;

-- [2] tab A: rotate from generation 1 and hold the transaction for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_connection_rpc('put',repeat('ac',32),repeat('c3',32),1,repeat('a1',32),repeat('ba',32),1,'Acme rotation from tab A','{}'::jsonb) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result from action cross join held;

-- [3] tab B: rotate from the same generation 1 while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_connection_rpc('put',repeat('ac',32),repeat('c3',32),1,repeat('a1',32),repeat('bb',32),1,'Acme rotation from tab B','{}'::jsonb) as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result from action;

-- [4] tab A: exactly one rotation won
do $check$
declare r keel_private.connection_credentials;
begin
 select * into r from keel_private.connection_credentials where scope=repeat('ac',32) and connection=repeat('c3',32);
 if r.version is distinct from 2 then raise exception 'expected exactly one winning rotation (version 2), found version %',r.version; end if;
 if r.request not in(repeat('ba',32),repeat('bb',32)) then raise exception 'winning request is neither tab'; end if;
end $check$;
select 'PASS 008 CAS rotation race' as result;

-- [5] tab A: cleanup, always
with removed as (delete from keel_private.connection_credentials where scope=repeat('ac',32) returning 1)
select count(*) as synthetic_rows_removed from removed;
*/
