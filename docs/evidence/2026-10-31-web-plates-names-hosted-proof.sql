-- Hosted proof for lib/web/migrations/014-plates-names.sql (phase 127, plan step migration-014).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-013 are already applied). Paste the whole file and run it once.
--
-- Proves, for each of the 15 public RPC names 014 renames: exactly one public
--   plates_* function and one keel_* function exist; plates_* is the original
--   implementation (plpgsql, SECURITY DEFINER, empty search_path, jsonb, the same
--   argument list with defaults, owner and ACL as the keel_* name); keel_* is now only
--   a SECURITY DEFINER SQL forwarder whose body is exactly SELECT public.plates_*($1..$n);
--   anon and authenticated can execute neither name (catalog and SET LOCAL ROLE) and
--   service_role can execute both; the dependency 013 left (plates_job_rpc calling
--   keel_private.job_rpc_before_night, which no API role can execute) still resolves;
--   the internal schema is unchanged. As service_role, one bounded read through each
--   old name and each new name returns the same result.
-- Leaves behind: nothing. The reads run inside a subtransaction that is rolled back
--   (two of them, the editor-draft and home-cursor reads, would otherwise create an
--   empty synthetic row); the last check fails if any survived.
-- Expected result: one row, result = 'PASS 014-plates-names hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); the measured schema size and the two HTTP callers
--   (the step records one request through each name with its response status); the
--   20 held writer rows, which move in a separate reviewed change.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-014.
do $proof$
declare
 k text:=repeat('ac',32);
 calls jsonb:='[]'; pair record; legacy_fn record; current_fn record; args text; a jsonb; b jsonb; role_name text; delegate text:='keel_private.job_rpc_before_night(text,text,text,jsonb)';
begin
 if to_regnamespace('keel_private') is null then raise exception 'internal schema keel_private missing'; end if;
 if exists(select 1 from keel_private.editor_drafts where scope=k) or exists(select 1 from keel_private.home_cursors where key=k) then raise exception 'Acme proof keys already present'; end if;
 for pair in select * from (values
   ('keel_model_credential_read','plates_model_credential_read',format('%L,%L,%L,1',k,k,k)),
   ('keel_web_rpc','plates_web_rpc',format('''read'',''session'',%L',k)),
   ('keel_home_cache_rpc','plates_home_cache_rpc',format('''read'',%L',k)),
   ('keel_home_quota_rpc','plates_home_quota_rpc',format('''read'',%L',k)),
   ('keel_home_cursor_rpc','plates_home_cursor_rpc',format('%L,%L',k,k)),
   ('keel_decision_rpc','plates_decision_rpc',format('''read'',%L,%L',k,k)),
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
 if to_regprocedure(delegate) is null or has_function_privilege('service_role',delegate,'EXECUTE') then raise exception 'the saved admission delegate is missing or executable by service_role'; end if;
 if position('keel_private.job_rpc_before_night(' in (select prosrc from pg_proc where oid='public.plates_job_rpc(text,text,text,jsonb)'::regprocedure))=0 then raise exception 'plates_job_rpc no longer calls the saved admission delegate'; end if;
 begin
  -- Role denials, exercised through both names of three representative RPCs.
  for pair in select * from (values
    ('keel_web_rpc','plates_web_rpc',format('''read'',''session'',%L',k)),
    ('keel_job_rpc','plates_job_rpc',format('''read'',%L,%L,''{}''::jsonb',k,k)),
    ('keel_run_history','plates_run_history',format('%L,%L',k,k))
   ) v(legacy,current,args) loop
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
 if exists(select 1 from keel_private.editor_drafts where scope=k) or exists(select 1 from keel_private.home_cursors where key=k) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 014-plates-names hosted proof' as result;
