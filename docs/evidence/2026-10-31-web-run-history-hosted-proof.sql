-- Hosted proof for lib/web/migrations/007-run-history.sql (phase 102, plan step migration-007).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (004 is already applied). Paste the whole file and run it once.
--
-- Proves: the index keel_private.decision_history_scope exists on the 004
--   operation store; public.keel_run_history(text,text,text,integer) exists, is
--   STABLE, SECURITY DEFINER with an empty search_path and returns jsonb; anon and
--   authenticated cannot execute it (catalog and SET LOCAL ROLE), and no role reads
--   the 004 tables directly. As service_role, three synthetic decision operations
--   (refused, committed, expired-prepared) are read back in two bounded pages:
--   newest preview first, a stable cursor, actor-scope and project isolation, a
--   foreign cursor refused, the 20-row bound enforced, and reading never changes an
--   expired prepared reservation (no recovery, no purge).
-- Leaves behind: nothing. The synthetic Acme rows are written inside a subtransaction
--   that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 007-run-history hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it). Run it before 014: after 014 the keel_ name is a
--   forwarder and the STABLE check describes plates_run_history instead.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-007.
do $proof$
declare
 scope_key text:=repeat('ac',32); other_scope text:=repeat('bd',32);
 project_key text:=repeat('c1',32); other_project text:=repeat('c2',32); fence_key text:=repeat('e1',32);
 p1 text:=repeat('11',32); p2 text:=repeat('12',32); p3 text:=repeat('13',32);
 o1 text:=repeat('21',32); o2 text:=repeat('22',32); o3 text:=repeat('23',32);
 rpc text:='public.keel_run_history(text,text,text,integer)';
 tables text[]:=array['keel_private.decision_previews','keel_private.decision_operations'];
 r jsonb; h jsonb; t text; role_name text;
begin
 if to_regclass('keel_private.decision_history_scope') is null then raise exception 'missing index keel_private.decision_history_scope'; end if;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('keel_private.decision_history_scope') and indrelid='keel_private.decision_operations'::regclass) then raise exception 'history index is not on decision_operations'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and provolatile='s' and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not STABLE SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 foreach t in array tables loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 if exists(select 1 from keel_private.decision_previews where scope in(scope_key,other_scope)) or exists(select 1 from keel_private.decision_operations where scope in(scope_key,other_scope)) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   foreach t in array tables loop
    begin execute format('select 1 from %s limit 1',t); raise exception 'direct read of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
   end loop;
   if role_name<>'service_role' then
    begin perform public.keel_run_history(scope_key,project_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.keel_run_history(scope_key,project_key)<>jsonb_build_object('rows','[]'::jsonb,'after',null,'hasMore',false) then raise exception 'empty history not empty'; end if;
  perform public.keel_decision_rpc('preview-create',p,scope_key,p_value=>'Acme preview') from unnest(array[p1,p2,p3]) p;
  perform public.keel_decision_rpc('reserve',o1,scope_key,project_key,p1,fence_key,'Acme first intent');
  r:=public.keel_decision_rpc('refused',o1,scope_key,p_fence=>fence_key,p_value=>'Acme refused receipt');
  if r->>'state' is distinct from 'refused' then raise exception 'setup: refusal failed: %',r; end if;
  perform public.keel_decision_rpc('reserve',o2,scope_key,project_key,p2,fence_key,'Acme second intent');
  perform public.keel_decision_rpc('dispatched',o2,scope_key,p_fence=>fence_key);
  r:=public.keel_decision_rpc('committed',o2,scope_key,p_fence=>fence_key,p_value=>'Acme committed receipt');
  if r->>'state' is distinct from 'committed' then raise exception 'setup: commit failed: %',r; end if;
  r:=public.keel_decision_rpc('reserve',o3,scope_key,project_key,p3,fence_key,'Acme third intent');
  if r->>'state' is distinct from 'prepared' then raise exception 'setup: third reservation failed: %',r; end if;
  reset role;
  -- Deterministic preview times, and an expired lease on the prepared intent.
  update keel_private.decision_previews set expires_at=clock_timestamp()+case id when p1 then interval '11 minutes' when p2 then interval '12 minutes' else interval '13 minutes' end where id in(p1,p2,p3);
  update keel_private.decision_operations set lease_until=clock_timestamp()-interval '1 second' where id=o3;
  set local role service_role;
  h:=public.keel_run_history(scope_key,project_key,null,2);
  if jsonb_path_query_array(h->'rows','$[*].id')<>jsonb_build_array(o3,o2) or h->>'hasMore' is distinct from 'true' or h->>'after' is distinct from o2 then raise exception 'first page wrong: %',h; end if;
  if h->'rows'->0->>'state' is distinct from 'prepared' or h->'rows'->0->>'previewId' is distinct from p3
  or h->'rows'->0->>'timeBasis' is distinct from 'inferred-preview-created-at' or h->'rows'->1->>'value' is distinct from 'Acme committed receipt' then raise exception 'history row shape wrong: %',h->'rows'; end if;
  h:=public.keel_run_history(scope_key,project_key,o2,2);
  if jsonb_path_query_array(h->'rows','$[*].id')<>jsonb_build_array(o1) or h->>'hasMore' is distinct from 'false' or h->'after'<>'null'::jsonb then raise exception 'second page wrong: %',h; end if;
  if jsonb_array_length(public.keel_run_history(other_scope,project_key)->'rows')<>0 then raise exception 'history leaked across actor scopes'; end if;
  if jsonb_array_length(public.keel_run_history(scope_key,other_project)->'rows')<>0 then raise exception 'history leaked across projects'; end if;
  begin perform public.keel_run_history(scope_key,other_project,o2,2); raise exception 'foreign cursor accepted';
  exception when raise_exception then if sqlerrm<>'invalid history cursor' then raise; end if; end;
  begin perform public.keel_run_history(scope_key,project_key,null,21); raise exception 'oversized page accepted';
  exception when raise_exception then if sqlerrm<>'invalid history input' then raise; end if; end;
  reset role;
  if (select state from keel_private.decision_operations where id=o3) is distinct from 'prepared' then raise exception 'reading history changed an expired prepared reservation'; end if;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.decision_previews where scope=scope_key) or exists(select 1 from keel_private.decision_operations where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 007-run-history hosted proof' as result;
