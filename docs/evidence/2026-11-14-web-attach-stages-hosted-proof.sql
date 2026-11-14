-- Hosted proof for lib/web/migrations/020-attach-operation-stages.sql (phase 181, plan step migration-020).
-- Run as the database owner after migrations 001-020, only under separate hosted
-- approval. Paste the whole file; run the commented race separately in two tabs.
-- Proves: existing tables retain RLS and API-role isolation; current and legacy
-- RPCs retain service-only SECURITY DEFINER access with empty search_path; the
-- original intent and fixed observation history survive reports; each fixed effect has one begin winner;
-- identity mismatches, skipped stages, stale reports and generic bypass refuse;
-- uncertain mint cannot resume; only ref verification commits; legacy calls work.
-- Leaves behind: nothing. Single-connection synthetic Acme rows roll back in a
-- subtransaction. The race commits its own Acme rows and includes explicit cleanup.
-- Expected result: one row, result = 'PASS 020-attach-operation-stages hosted proof'.
-- Not covered: SHA-256 of the applied migration against source; provider effects,
-- credentials, routes or activation. No child credential is used in this proof.
-- Local PGlite execution by tests/web-hosted-proofs.test.mjs replays the race
-- serially; that checks SQL and cleanup, not concurrent lock waits or hosted grants.
do $proof$
declare
 s text:=repeat('a8',32); other_s text:=repeat('a9',32); p text:=repeat('b8',32);
 v text:=repeat('c8',32); o text:=repeat('d8',32); f text:=repeat('e8',32);
 v2 text:=repeat('c9',32); o2 text:=repeat('d9',32);
 funcs text[]:=array['public.plates_decision_rpc(text,text,text,text,text,text,text)','public.keel_decision_rpc(text,text,text,text,text,text,text)'];
 tables text[]:=array['keel_private.decision_previews','keel_private.decision_operations'];
 fn text; tab text; role_name text; effect text; op text; r jsonb; history jsonb:='{}'::jsonb;
begin
 foreach tab in array tables loop
  if to_regclass(tab) is null then raise exception 'missing table %',tab; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(tab)) then raise exception 'row level security off on %',tab; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,tab,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,tab; end if;
  end loop;
 end loop;
 foreach fn in array funcs loop
  if to_regprocedure(fn) is null then raise exception 'missing function %',fn; end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(fn) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% lacks SECURITY DEFINER jsonb empty search_path',fn; end if;
  if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') then raise exception 'a browser role can execute %',fn; end if;
  if not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'service_role cannot execute %',fn; end if;
 end loop;
 if (select prosrc from pg_proc where oid=to_regprocedure(funcs[2])) <> 'SELECT public.plates_decision_rpc($1, $2, $3, $4, $5, $6, $7)' then raise exception 'legacy RPC is not the exact forwarding body'; end if;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('keel_private.decision_project_reserved') and indisunique and indpred is not null) then raise exception 'missing unique project reservation'; end if;
 if exists(select 1 from keel_private.decision_previews where id in(v,v2,repeat('ca',32)) or scope=s)
 or exists(select 1 from keel_private.decision_operations where id in(o,o2,repeat('da',32)) or scope=s) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   foreach tab in array tables loop
    begin execute format('select 1 from %s limit 1',tab); raise exception 'direct read allowed for %',role_name;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from %s where false',tab); raise exception 'direct write allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end loop;
   if role_name<>'service_role' then
    begin perform public.plates_decision_rpc('read',o,s); raise exception 'client current RPC allowed'; exception when insufficient_privilege then null; end;
    begin perform public.keel_decision_rpc('read',o,s); raise exception 'client legacy RPC allowed'; exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  perform public.keel_decision_rpc('preview-create',v,s,p_value=>'Acme immutable preview');
  r:=public.plates_decision_rpc('attach-reserve',o,s,p,v,f,'Acme immutable intent');
  if r->>'created' is distinct from 'true' or r->>'stage' is distinct from 'ready' or r->>'granted' is distinct from 'false' or r->'observations' is distinct from '{}'::jsonb then raise exception 'attach reservation invalid: %',r; end if;
  r:=public.keel_decision_rpc('attach-reserve',o,s,p,v,f,'Acme replacement');
  if r->>'created' is distinct from 'false' or r->>'value' is distinct from 'Acme immutable intent' or r->>'granted' is distinct from 'false' then raise exception 'reservation replay replaced intent or granted: %',r; end if;
  if public.plates_decision_rpc('attach-read',o,other_s,p,v,f) is not null
   or public.plates_decision_rpc('attach-read',o,s,repeat('bb',32),v,f) is not null
   or public.plates_decision_rpc('attach-read',o,s,p,v2,f) is not null
   or public.plates_decision_rpc('attach-read',o,s,p,v,repeat('ee',32)) is not null then raise exception 'attach identity boundary leaked row'; end if;
  if public.plates_decision_rpc('attach-commit-begin',o,s,p,v,f) is not null
   or public.plates_decision_rpc('attach-ref-begin',o,s,p,v,f) is not null then raise exception 'skipped stage granted'; end if;
  foreach effect in array array['mint','commit','ref'] loop
   if public.plates_decision_rpc('attach-'||effect||'-begin',o,other_s,p,v,f) is not null
    or public.plates_decision_rpc('attach-'||effect||'-begin',o,s,repeat('bb',32),v,f) is not null
    or public.plates_decision_rpc('attach-'||effect||'-begin',o,s,p,v2,f) is not null
    or public.plates_decision_rpc('attach-'||effect||'-begin',o,s,p,v,repeat('ee',32)) is not null then raise exception 'wrong identity began %',effect; end if;
   r:=public.keel_decision_rpc('attach-'||effect||'-begin',o,s,p,v,f);
   if r->>'granted' is distinct from 'true' or r->>'changed' is distinct from 'true' or r->>'stage' is distinct from effect||'-started' then raise exception 'begin not granted for %: %',effect,r; end if;
   if public.plates_decision_rpc('attach-'||effect||'-begin',o,s,p,v,f) is not null then raise exception 'duplicate begin granted for %',effect; end if;
   r:=public.plates_decision_rpc('attach-read',o,s,p,v,f);
   if r->>'granted' is distinct from 'false' or r->'observations' is distinct from history then raise exception 'read grants execution or loses history'; end if;
   foreach op in array array['dispatched','uncertain','committed','refused'] loop
    if public.plates_decision_rpc(op,o,s,p,v,f,'Acme bypass') is not null then raise exception 'generic transition bypassed staged row: %',op; end if;
   end loop;
   if effect in('commit','ref') then
    r:=public.plates_decision_rpc('attach-'||effect||'-uncertain',o,s,p,v,f,'Acme uncertain '||effect);
    history:=history||jsonb_build_object(effect||'-uncertain','Acme uncertain '||effect);
    if r->'observations' is distinct from history then raise exception 'uncertain report lost history'; end if;
    if r->>'state' is distinct from 'uncertain' or r->>'granted' is distinct from 'false' then raise exception 'commit uncertainty lost'; end if;
    if public.plates_decision_rpc('attach-'||effect||'-begin',o,s,p,v,f) is not null then raise exception 'uncertain effect redispatched'; end if;
    op:='attach-'||effect||'-reconcile';
   else op:='attach-'||effect||'-record'; end if;
   r:=public.plates_decision_rpc(op,o,s,p,v,f,'Acme observation '||effect);
   if r->>'stage' is distinct from effect||'-recorded' or r->>'granted' is distinct from 'false' or r->>'value' is distinct from 'Acme immutable intent' then raise exception 'report corrupted intent or granted for %: %',effect,r; end if;
   history:=history||jsonb_build_object(effect||'-recorded','Acme observation '||effect);
   if r->'observations' is distinct from history then raise exception 'report replaced earlier history for %',effect; end if;
   if public.plates_decision_rpc(op,o,s,p,v,f,'Acme replacement report') is not null then raise exception 'duplicate report replaced history for %',effect; end if;
   r:=public.plates_decision_rpc('attach-read',o,s,p,v,f);
   if r->'observations' is distinct from history or r->>'granted' is distinct from 'false' then raise exception 'history changed after rejected replacement'; end if;
   if effect<>'ref' and r->>'state'='committed' then raise exception 'operation committed before ref'; end if;
   if effect='ref' and r->>'state' is distinct from 'committed' then raise exception 'ref did not commit'; end if;
   if public.plates_decision_rpc('attach-'||effect||'-uncertain',o,s,p,v,f,'Acme stale report') is not null then raise exception 'stale report accepted for %',effect; end if;
  end loop;
  perform public.plates_decision_rpc('preview-create',v2,s,p_value=>'Acme second preview');
  perform public.plates_decision_rpc('attach-reserve',o2,s,p,v2,f,'Acme second intent');
  perform public.plates_decision_rpc('attach-mint-begin',o2,s,p,v2,f);
  r:=public.plates_decision_rpc('attach-mint-uncertain',o2,s,p,v2,f,'Acme mint uncertain');
  if r->>'stage' is distinct from 'mint-uncertain' or r->>'state' is distinct from 'uncertain' then raise exception 'mint uncertainty lost'; end if;
  if public.plates_decision_rpc('attach-mint-begin',o2,s,p,v2,f) is not null
   or public.plates_decision_rpc('attach-commit-begin',o2,s,p,v2,f) is not null
   or public.plates_decision_rpc('attach-refuse',o2,s,p,v2,f,'Acme unsafe release') is not null then raise exception 'uncertain mint resumed or released'; end if;
  reset role;
  update keel_private.decision_operations set lease_until=clock_timestamp()-interval '1 second' where id=o2;
  set local role service_role;
  r:=public.plates_decision_rpc('attach-read',o2,s,p,v2,f);
  if r->>'state' is distinct from 'uncertain' then raise exception 'expiry released uncertain operation'; end if;
  -- Original legacy lifecycle remains usable on a separate project and preview.
  perform public.keel_decision_rpc('preview-create',repeat('ca',32),s,p_value=>'Acme legacy preview');
  r:=public.keel_decision_rpc('reserve',repeat('da',32),s,p,repeat('ca',32),f,'Acme conflicting intent');
  if r->>'conflict' is distinct from 'true' then raise exception 'expired uncertain mint released project lane'; end if;
  r:=public.keel_decision_rpc('reserve',repeat('da',32),s,repeat('ba',32),repeat('ca',32),f,'Acme legacy intent');
  if r->>'created' is distinct from 'true' then raise exception 'legacy reserve failed'; end if;
  r:=public.keel_decision_rpc('dispatched',repeat('da',32),s,p_fence=>f);
  if r->>'state' is distinct from 'dispatched' then raise exception 'legacy dispatch failed'; end if;
  r:=public.keel_decision_rpc('committed',repeat('da',32),s,p_fence=>f,p_value=>'Acme legacy receipt');
  if r->>'state' is distinct from 'committed' then raise exception 'legacy commit failed'; end if;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.decision_operations where scope=s) or exists(select 1 from keel_private.decision_previews where scope=s) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 020-attach-operation-stages hosted proof' as result;

/* TWO-CONNECTION RACE: one mint begin acknowledgement for the original operation.
   Run numbered statements in two owner SQL-editor tabs. Start [3] while [2] is
   holding for eight seconds. Record different backend pids, A granted true,
   B granted null and B finished_at no earlier than A. Run [5] after both finish.
   Local serial replay cannot establish concurrent exclusion or waiting behavior.

-- [1] tab A: create a separate synthetic Acme race operation
do $setup$
begin
 if exists(select 1 from keel_private.decision_operations where scope=repeat('ab',32)) or exists(select 1 from keel_private.decision_previews where scope=repeat('ab',32)) then raise exception 'Acme race rows present; inspect before cleanup'; end if;
 perform public.plates_decision_rpc('preview-create',repeat('cb',32),repeat('ab',32),p_value=>'Acme race preview');
 perform public.plates_decision_rpc('attach-reserve',repeat('db',32),repeat('ab',32),repeat('bb',32),repeat('cb',32),repeat('eb',32),'Acme race intent');
end $setup$;

-- [2] tab A: begin mint and hold the transaction
with action as materialized (select pg_backend_pid() as pid, public.plates_decision_rpc('attach-mint-begin',repeat('db',32),repeat('ab',32),repeat('bb',32),repeat('cb',32),repeat('eb',32)) as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab,pid,clock_timestamp() as finished_at,result->>'granted' as granted from action cross join held;

-- [3] tab B: attempt the identical begin while A holds its transaction
with action as materialized (select pg_backend_pid() as pid, public.plates_decision_rpc('attach-mint-begin',repeat('db',32),repeat('ab',32),repeat('bb',32),repeat('cb',32),repeat('eb',32)) as result)
select 'B' as tab,pid,clock_timestamp() as finished_at,result->>'granted' as granted from action;

-- [4] tab A: confirm the consumed fence and no further execution grant
do $check$
declare r jsonb;
begin
 r:=public.plates_decision_rpc('attach-read',repeat('db',32),repeat('ab',32),repeat('bb',32),repeat('cb',32),repeat('eb',32));
 if r->>'stage' is distinct from 'mint-started' or r->>'granted' is distinct from 'false' then raise exception 'race lost consumed mint fence'; end if;
 if public.plates_decision_rpc('attach-mint-begin',repeat('db',32),repeat('ab',32),repeat('bb',32),repeat('cb',32),repeat('eb',32)) is not null then raise exception 'race allowed another begin'; end if;
end $check$;
select 'PASS 020 attach mint begin race' as result;

-- [5] tab A: cleanup after both transactions finish, whatever their result
delete from keel_private.decision_operations where scope=repeat('ab',32);
delete from keel_private.decision_previews where scope=repeat('ab',32);
select (select count(*) from keel_private.decision_operations where scope=repeat('ab',32))+(select count(*) from keel_private.decision_previews where scope=repeat('ab',32)) as acme_rows_left;
*/
