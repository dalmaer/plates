-- Hosted proof for lib/web/migrations/021-attach-outcomes.sql (phase 181, plan step migration-021).
-- Run as the database owner after migrations 001-021, only under separate hosted
-- approval. Paste the whole file; execute the commented race separately in two tabs.
-- Proves: current and legacy RPC access remains service-only, SECURITY DEFINER,
-- empty search_path; tables retain RLS and deny API-role direct access. A decline
-- and ref begin compete from commit-recorded; only the winner changes the row.
-- Decline is refused/not claimed, never committed or an execution grant. It keeps
-- immutable intent and all prior observations, appends one outcome, and frees the
-- project lane. Wrong identities, premature/duplicate decline, generic bypass and
-- decline after ref-started/ref-uncertain refuse. Legacy unstaged behavior remains.
-- Leaves behind: nothing. Single-connection synthetic Acme rows roll back in a
-- subtransaction. The separately run race commits Acme rows and includes cleanup.
-- Expected result: one row, result = 'PASS 021-attach-outcomes hosted proof'.
-- Not covered: applied-file SHA-256 against source, actual encrypted payload
-- validation, provider effects, credentials or activation. SQL treats ciphertext
-- as opaque; this proof uses synthetic text and cannot prove a foreign winner.
-- Local PGlite replay in tests/web-hosted-proofs.test.mjs serializes the race;
-- that checks SQL and cleanup, not hosted concurrency or real connection waits.
do $proof$
declare
 s text:=repeat('a6',32); other_s text:=repeat('a7',32); p text:=repeat('b6',32);
 v text:=repeat('c6',32); o text:=repeat('d6',32); f text:=repeat('e6',32);
 v2 text:=repeat('c7',32); o2 text:=repeat('d7',32);
 v3 text:=repeat('c5',32); o3 text:=repeat('d5',32);
 funcs text[]:=array['public.plates_decision_rpc(text,text,text,text,text,text,text)','public.keel_decision_rpc(text,text,text,text,text,text,text)'];
 tables text[]:=array['keel_private.decision_previews','keel_private.decision_operations'];
 fn text; tab text; role_name text; op text; r jsonb; history jsonb;
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
 if exists(select 1 from keel_private.decision_previews where id in(v,v2,v3) or scope=s)
 or exists(select 1 from keel_private.decision_operations where id in(o,o2,o3) or scope=s) then raise exception 'Acme proof keys already present'; end if;
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
  perform public.keel_decision_rpc('preview-create',v,s,p_value=>'Acme decline preview');
  perform public.plates_decision_rpc('attach-reserve',o,s,p,v,f,'Acme immutable decline intent');
  if public.plates_decision_rpc('attach-ref-decline',o,s,p,v,f,'Acme premature decline') is not null then raise exception 'decline accepted before commit'; end if;
  perform public.plates_decision_rpc('attach-mint-begin',o,s,p,v,f);
  perform public.plates_decision_rpc('attach-mint-record',o,s,p,v,f,'Acme mint evidence');
  perform public.plates_decision_rpc('attach-commit-begin',o,s,p,v,f);
  perform public.plates_decision_rpc('attach-commit-uncertain',o,s,p,v,f,'Acme commit uncertainty');
  if public.plates_decision_rpc('attach-ref-decline',o,s,p,v,f,'Acme premature decline') is not null then raise exception 'decline released uncertain commit'; end if;
  r:=public.plates_decision_rpc('attach-commit-reconcile',o,s,p,v,f,'Acme verified commit');
  history:=jsonb_build_object('mint-recorded','Acme mint evidence','commit-uncertain','Acme commit uncertainty','commit-recorded','Acme verified commit');
  if r->'observations' is distinct from history or r->>'granted' is distinct from 'false' then raise exception 'commit reconciliation lost history or granted'; end if;
  if public.plates_decision_rpc('attach-ref-decline',o,other_s,p,v,f,'Acme wrong identity') is not null
   or public.plates_decision_rpc('attach-ref-decline',o,s,repeat('bf',32),v,f,'Acme wrong identity') is not null
   or public.plates_decision_rpc('attach-ref-decline',o,s,p,v2,f,'Acme wrong identity') is not null
   or public.plates_decision_rpc('attach-ref-decline',o,s,p,v,repeat('ef',32),'Acme wrong identity') is not null
   or public.plates_decision_rpc('attach-ref-decline',o2,s,p,v,f,'Acme wrong identity') is not null then raise exception 'decline crossed identity boundary'; end if;
  foreach op in array array['dispatched','uncertain','committed','refused'] loop
   if public.plates_decision_rpc(op,o,s,p,v,f,'Acme generic bypass') is not null then raise exception 'generic transition bypassed attach outcome'; end if;
  end loop;
  r:=public.keel_decision_rpc('attach-ref-decline',o,s,p,v,f,'Acme foreign winner before ref effect');
  history:=history||jsonb_build_object('ref-declined','Acme foreign winner before ref effect');
  if r->>'stage' is distinct from 'ref-declined' or r->>'state' is distinct from 'refused'
   or r->>'changed' is distinct from 'true' or r->>'granted' is distinct from 'false'
   or r->>'value' is distinct from 'Acme immutable decline intent' or r->'observations' is distinct from history then raise exception 'decline outcome incorrect: %',r; end if;
  foreach op in array array['attach-ref-begin','attach-mint-begin','attach-commit-begin'] loop
   if public.plates_decision_rpc(op,o,s,p,v,f) is not null then raise exception 'terminal decline authorized another effect'; end if;
  end loop;
  if public.plates_decision_rpc('attach-ref-decline',o,s,p,v,f,'Acme replacement') is not null
   or public.plates_decision_rpc('attach-ref-record',o,s,p,v,f,'Acme false claim') is not null then raise exception 'terminal decline replaced or marked claimed'; end if;
  r:=public.keel_decision_rpc('attach-read',o,s,p,v,f);
  if r->>'granted' is distinct from 'false' or r->>'changed' is distinct from 'false' or r->'observations' is distinct from history then raise exception 'read grants or changes decline history'; end if;
  r:=public.plates_decision_rpc('attach-reserve',o,s,p,v,f,'Acme replacement intent');
  if r->>'created' is distinct from 'false' or r->>'granted' is distinct from 'false' or r->>'value' is distinct from 'Acme immutable decline intent' or r->'observations' is distinct from history then raise exception 'reserve replay changed declined operation'; end if;

  -- Opposite ordering: ref-begin wins. Neither decline nor expiry may free its lane.
  perform public.plates_decision_rpc('preview-create',v2,s,p_value=>'Acme second preview');
  r:=public.plates_decision_rpc('attach-reserve',o2,s,p,v2,f,'Acme second intent');
  if r->>'created' is distinct from 'true' then raise exception 'proven prewrite decline kept project lane'; end if;
  perform public.plates_decision_rpc('attach-mint-begin',o2,s,p,v2,f);
  perform public.plates_decision_rpc('attach-mint-record',o2,s,p,v2,f,'Acme second mint');
  perform public.plates_decision_rpc('attach-commit-begin',o2,s,p,v2,f);
  perform public.plates_decision_rpc('attach-commit-record',o2,s,p,v2,f,'Acme second commit');
  r:=public.plates_decision_rpc('attach-ref-begin',o2,s,p,v2,f);
  if r->>'granted' is distinct from 'true' then raise exception 'ref begin did not win'; end if;
  if public.plates_decision_rpc('attach-ref-decline',o2,s,p,v2,f,'Acme unsafe release') is not null then raise exception 'decline accepted after ref began'; end if;
  perform public.plates_decision_rpc('attach-ref-uncertain',o2,s,p,v2,f,'Acme ref uncertainty');
  if public.plates_decision_rpc('attach-ref-decline',o2,s,p,v2,f,'Acme unsafe release') is not null then raise exception 'decline accepted after uncertain ref'; end if;
  reset role;
  update keel_private.decision_operations set lease_until=clock_timestamp()-interval '1 second' where id=o2;
  set local role service_role;
  perform public.keel_decision_rpc('preview-create',v3,s,p_value=>'Acme legacy preview');
  r:=public.keel_decision_rpc('reserve',o3,s,p,v3,f,'Acme legacy intent');
  if r->>'conflict' is distinct from 'true' then raise exception 'uncertain ref lost project lane'; end if;
  r:=public.plates_decision_rpc('attach-ref-reconcile',o2,s,p,v2,f,'Acme verified original ref');
  if r->>'state' is distinct from 'committed' or r->>'granted' is distinct from 'false'
   or r->'observations'->>'ref-uncertain' is distinct from 'Acme ref uncertainty' then raise exception 'original ref reconciliation incorrect'; end if;
  -- An ordinary historical lifecycle still works through the unchanged alias.
  r:=public.keel_decision_rpc('reserve',o3,s,p,v3,f,'Acme legacy intent');
  if r->>'created' is distinct from 'true' then raise exception 'legacy reserve failed'; end if;
  r:=public.keel_decision_rpc('dispatched',o3,s,p_fence=>f);
  if r->>'state' is distinct from 'dispatched' then raise exception 'legacy dispatch failed'; end if;
  r:=public.keel_decision_rpc('committed',o3,s,p_fence=>f,p_value=>'Acme legacy receipt');
  if r->>'state' is distinct from 'committed' or r->>'value' is distinct from 'Acme legacy receipt' then raise exception 'legacy commit semantics changed'; end if;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.decision_operations where scope=s) or exists(select 1 from keel_private.decision_previews where scope=s) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 021-attach-outcomes hosted proof' as result;

/* TWO-CONNECTION RACE: prewrite decline versus ref begin on the original operation.
   Run numbered statements in two owner SQL-editor tabs. Start [3] while [2] holds
   for eight seconds. Record distinct backend pids, A changed true/granted false,
   B changed null/granted null and B finished_at no earlier than A. Run [5] after
   both finish regardless of results. Local serial replay cannot prove lock waits.

-- [1] tab A: prepare a separate Acme operation through commit-recorded
do $setup$
begin
 if exists(select 1 from keel_private.decision_operations where scope=repeat('a4',32)) or exists(select 1 from keel_private.decision_previews where scope=repeat('a4',32)) then raise exception 'Acme race rows present; inspect before cleanup'; end if;
 perform public.plates_decision_rpc('preview-create',repeat('c4',32),repeat('a4',32),p_value=>'Acme race preview');
 perform public.plates_decision_rpc('attach-reserve',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32),'Acme race intent');
 perform public.plates_decision_rpc('attach-mint-begin',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32));
 perform public.plates_decision_rpc('attach-mint-record',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32),'Acme race mint');
 perform public.plates_decision_rpc('attach-commit-begin',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32));
 perform public.plates_decision_rpc('attach-commit-record',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32),'Acme race commit');
end $setup$;

-- [2] tab A: decline without any ref effect and hold the transaction
with action as materialized (select pg_backend_pid() as pid, public.plates_decision_rpc('attach-ref-decline',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32),'Acme race foreign winner') as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab,pid,clock_timestamp() as finished_at,result->>'changed' as changed,result->>'granted' as granted from action cross join held;

-- [3] tab B: try ref begin while A holds its decline transaction
with action as materialized (select pg_backend_pid() as pid, public.plates_decision_rpc('attach-ref-begin',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32)) as result)
select 'B' as tab,pid,clock_timestamp() as finished_at,result->>'changed' as changed,result->>'granted' as granted from action;

-- [4] tab A: confirm the original decline and preserved history
do $check$
declare r jsonb;
begin
 r:=public.plates_decision_rpc('attach-read',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32));
 if r->>'state' is distinct from 'refused' or r->>'stage' is distinct from 'ref-declined' or r->>'granted' is distinct from 'false'
  or r->'observations' is distinct from jsonb_build_object('mint-recorded','Acme race mint','commit-recorded','Acme race commit','ref-declined','Acme race foreign winner') then raise exception 'race did not preserve sole decline winner'; end if;
 if public.plates_decision_rpc('attach-ref-begin',repeat('d4',32),repeat('a4',32),repeat('b4',32),repeat('c4',32),repeat('e4',32)) is not null then raise exception 'race granted ref after decline'; end if;
end $check$;
select 'PASS 021 decline versus ref begin race' as result;

-- [5] tab A: cleanup after both transactions finish, whatever their result
delete from keel_private.decision_operations where scope=repeat('a4',32);
delete from keel_private.decision_previews where scope=repeat('a4',32);
select (select count(*) from keel_private.decision_operations where scope=repeat('a4',32))+(select count(*) from keel_private.decision_previews where scope=repeat('a4',32)) as acme_rows_left;
*/
