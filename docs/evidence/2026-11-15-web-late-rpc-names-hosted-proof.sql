-- Hosted proof for lib/web/migrations/023-late-rpc-names.sql (phase 127, plan step migration-023).
-- Run only with the owner's approval after applying 023 to the installed optional
-- stores. No assumption that pending 005-013 or 015-021 have all run: absent pairs
-- are reported as notices. This script is a proof procedure, not evidence of use.
-- Checks both names, forwarder body, implementation security, matching arguments,
-- defaults, owners and grants, browser-role denials, service-role reads and the
-- private job delegate. Record actual definitions against the approved source too.
-- Leaves behind: nothing; all calls run in a subtransaction rolled back below.
-- Expected result: one row, result = 'PASS 023-late-rpc-names hosted proof'.
-- Not covered: applied file SHA-256, actual HTTP callers, concurrent lock waits,
-- or the unresolved historical ordering of 014; inspect and record those separately.
-- Re-run 023 and this proof, comparing definitions and grants before and after.
do $proof$
declare
 k text:=repeat('ac',32);
 calls jsonb:='[]'; pair record; legacy_fn record; current_fn record; args text; a jsonb; b jsonb; role_name text; delegate text:='keel_private.job_rpc_before_night(text,text,text,jsonb)';
begin
 if to_regnamespace('keel_private') is null then raise exception 'internal schema keel_private missing'; end if;
 for pair in select * from (values
   ('keel_model_credential_read','plates_model_credential_read',format('%L,%L,%L,1',k,k,k)),
   ('keel_walk_rpc','plates_walk_rpc',format('''read'',%L,%L,%L',k,k,k)),
   ('keel_media_rpc','plates_media_rpc',format('''list'',%L,%L,1',k,k)),
   ('keel_connection_rpc','plates_connection_rpc',format('''metadata'',%L,%L',k,k)),
   ('keel_job_rpc','plates_job_rpc',format('''read'',%L,%L,''{}''::jsonb',k,k)),
   ('keel_fleet_rpc','plates_fleet_rpc',format('''read'',%L,%L,1',k,k)),
   ('keel_model_rpc','plates_model_rpc',format('''read'',%L,%L,1,%L,''{}''::jsonb',k,k,k)),
   ('keel_editor_draft_rpc','plates_editor_draft_rpc',format('''read'',%L',k)),
   ('keel_night_retry_rpc','plates_night_retry_rpc',format('''read'',%L,%L,%L::jsonb',k,k,jsonb_build_object('project',k,'actor',1))),
   ('keel_run_history','plates_run_history',format('%L,%L',k,k))
  ) v(legacy,current,args) loop
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=pair.legacy) then
   if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=pair.current) then raise exception 'target without source: %',pair.current; end if;
   raise notice 'absent store: %',pair.legacy;
   continue;
  end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=pair.legacy)<>1 then raise exception 'expected exactly one public %',pair.legacy; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=pair.current)<>1 then raise exception 'expected exactly one public %',pair.current; end if;
  select p.*,l.lanname,pg_get_function_arguments(p.oid) arguments into legacy_fn from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace and p.proname=pair.legacy;
  select p.*,l.lanname,pg_get_function_arguments(p.oid) arguments into current_fn from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace and p.proname=pair.current;
  if current_fn.lanname<>'plpgsql' or not current_fn.prosecdef or current_fn.prorettype<>'jsonb'::regtype or not current_fn.proconfig @> array['search_path=""'] then raise exception '% is not the SECURITY DEFINER plpgsql implementation with an empty search_path',pair.current; end if;
  if current_fn.proargtypes::text<>legacy_fn.proargtypes::text or current_fn.arguments<>legacy_fn.arguments then raise exception '% and % differ in arguments',pair.current,pair.legacy; end if;
  foreach role_name in array array['anon','authenticated'] loop
   if has_function_privilege(role_name,current_fn.oid,'EXECUTE') then raise exception 'a browser role can execute %',pair.current; end if;
   if has_function_privilege(role_name,legacy_fn.oid,'EXECUTE') then raise exception 'a browser role can execute %',pair.legacy; end if;
  end loop;
  if not has_function_privilege('service_role',current_fn.oid,'EXECUTE') or not has_function_privilege('service_role',legacy_fn.oid,'EXECUTE') then raise exception 'service_role cannot execute % or %',pair.current,pair.legacy; end if;
  if current_fn.proowner<>legacy_fn.proowner or current_fn.proacl::text is distinct from legacy_fn.proacl::text then raise exception '% and % differ in owner or ACL',pair.current,pair.legacy; end if;
  select string_agg(format('$%s',i),', ' order by i) into args from generate_series(1,legacy_fn.pronargs) i;
  if legacy_fn.lanname<>'sql' or not legacy_fn.prosecdef or not legacy_fn.proconfig @> array['search_path=""'] or legacy_fn.prosrc<>format('SELECT public.%I(%s)',pair.current,args) then raise exception '% is not a forwarder to %',pair.legacy,pair.current; end if;
  calls:=calls||jsonb_build_object('legacy',pair.legacy,'current',pair.current,'args',pair.args);
 end loop;
 if to_regprocedure('public.keel_night_retry_rpc(text,text,text,jsonb)') is not null then
  if to_regprocedure(delegate) is null or has_function_privilege('service_role',delegate,'EXECUTE') then raise exception 'the saved admission delegate is missing or executable by service_role'; end if;
  if (select prosrc from pg_proc where oid=to_regprocedure(delegate)) like '%public.plates_job_rpc%' then raise exception 'the saved admission delegate still forwards'; end if;
 end if;
 begin
  -- Role denials, exercised through both names of every installed RPC.
  for pair in select * from jsonb_to_recordset(calls) as x(legacy text,current text,args text) loop
   foreach role_name in array array['anon','authenticated'] loop
    execute format('set local role %I',role_name);
    begin execute format('select public.%I(%s)',pair.current,pair.args); raise exception 'client call of % allowed for %',pair.current,role_name;
    exception when insufficient_privilege then null; end;
    begin execute format('select public.%I(%s)',pair.legacy,pair.args); raise exception 'client call of % allowed for %',pair.legacy,role_name;
    exception when insufficient_privilege then null; end;
    reset role;
   end loop;
  end loop;
  -- One bounded read through each old and new name, as the service role.
  set local role service_role;
  for pair in select * from jsonb_to_recordset(calls) as x(legacy text,current text,args text) loop
   execute format('select public.%I(%s)',pair.legacy,pair.args) into a;
   execute format('select public.%I(%s)',pair.current,pair.args) into b;
   if a is distinct from b then raise exception '% and % answered differently: % / %',pair.legacy,pair.current,a,b; end if;
  end loop;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
end $proof$;
select 'PASS 023-late-rpc-names hosted proof' as result;
