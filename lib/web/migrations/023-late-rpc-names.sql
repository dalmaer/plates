-- Phase 127 / 151: repeatable naming repair for optional stores installed after 014.
-- Apply with owner approval after any 005–013 installation or replay, before
-- feature activation; the activation guide names the hosted proof order.
-- Absent stores stay absent. Core RPCs are excluded: never downgrade 016's sessions or 020/021's decisions.
begin;
do $migration$
declare
 pair record; permission record; old record; candidate record; target oid; definition text; forward text; args text;
begin
 perform pg_advisory_xact_lock(hashtextextended('keel-job-migrations',107));
 for pair in select * from (values
    ('keel_model_credential_read', 'plates_model_credential_read', 'p_scope text, p_connection text, p_policy text, p_expected bigint'),
    ('keel_walk_rpc', 'plates_walk_rpc', 'p_operation text, p_id text, p_scope text, p_project text, p_expected bigint DEFAULT NULL::bigint, p_digest text DEFAULT NULL::text, p_value text DEFAULT NULL::text'),
    ('keel_media_rpc', 'plates_media_rpc', 'p_operation text, p_scope text, p_project text, p_actor bigint, p_id text DEFAULT NULL::text, p_expected bigint DEFAULT NULL::bigint, p_value text DEFAULT NULL::text, p_bytes bigint DEFAULT NULL::bigint, p_digest text DEFAULT NULL::text, p_slot text DEFAULT NULL::text, p_requirements text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_after text DEFAULT NULL::text, p_capacity bigint DEFAULT 268435456'),
    ('keel_connection_rpc', 'plates_connection_rpc', 'p_operation text, p_scope text, p_connection text, p_expected bigint DEFAULT NULL::bigint, p_policy text DEFAULT NULL::text, p_request text DEFAULT NULL::text, p_actor bigint DEFAULT NULL::bigint, p_value text DEFAULT NULL::text, p_health jsonb DEFAULT NULL::jsonb'),
    ('keel_job_rpc', 'plates_job_rpc', 'p_operation text, p_scope text, p_id text, p_data jsonb DEFAULT ''{}''::jsonb'),
    ('keel_fleet_rpc', 'plates_fleet_rpc', 'p_operation text, p_scope text, p_id text, p_actor bigint, p_data jsonb DEFAULT ''{}''::jsonb'),
    ('keel_model_rpc', 'plates_model_rpc', 'p_operation text, p_scope text, p_id text, p_actor bigint, p_project text, p_data jsonb'),
    ('keel_editor_draft_rpc', 'plates_editor_draft_rpc', 'p_operation text, p_scope text, p_expected bigint DEFAULT NULL::bigint, p_request text DEFAULT NULL::text, p_request_digest text DEFAULT NULL::text, p_digest text DEFAULT NULL::text, p_value text DEFAULT NULL::text'),
    ('keel_night_retry_rpc', 'plates_night_retry_rpc', 'p_operation text, p_scope text, p_id text, p_data jsonb DEFAULT ''{}''::jsonb'),
    ('keel_run_history', 'plates_run_history', 'p_scope text, p_project text, p_after text DEFAULT NULL::text, p_limit integer DEFAULT 20')
 ) as names(legacy,current,arguments) loop
  -- Check both names even on the no-op path. Signatures include parameter names
  -- and defaults because PostgREST dispatches named arguments.
  for candidate in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (pair.legacy,pair.current) loop
   if (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
       and p.proname=candidate.proname) <> 1 then
    raise exception 'overloaded RPC: %', candidate.proname;
   end if;
   if pg_get_function_arguments(candidate.oid) <> pair.arguments
      or candidate.prorettype <> 'jsonb'::regtype or candidate.proretset
      or candidate.prokind <> 'f' or not candidate.prosecdef
      or candidate.proconfig is distinct from array['search_path=""']::text[] then
    raise exception 'unexpected RPC contract: %', candidate.proname;
   end if;
  end loop;
  select p.* into old from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=pair.legacy;
  if not found then continue; end if;
  select string_agg(format('$%s',i),', ' order by i) into args from generate_series(1,old.pronargs) i;
  forward := format('SELECT public.%I(%s)',pair.current,args);
  target := to_regprocedure(format('public.%I(%s)',pair.current,oidvectortypes(old.proargtypes)));
  if old.prosrc = forward then
   if target is null then raise exception 'missing forwarding target: %', pair.current; end if;
   continue;
  end if;
  -- A later 005–013 replay replaces the legacy forwarder with its real body.
  -- Refresh that implementation under the current name, then restore the alias.
  -- If 013 followed an incremental rename of 010, it saved the legacy
  -- forwarder as its private delegate. Recover 010's still-current body before
  -- refreshing plates_job_rpc with 013's wrapper, or both would recurse.
  if pair.legacy = 'keel_job_rpc' and
     (select prosrc from pg_proc where oid=to_regprocedure('keel_private.job_rpc_before_night(text,text,text,jsonb)')) = forward then
   if target is null or (select prosrc from pg_proc where oid=target) = forward
      or (select prosrc from pg_proc where oid=target) like '%keel_private.job_rpc_before_night%' then
    raise exception 'original job implementation unavailable; inspect before repair';
   end if;
   definition := pg_get_functiondef(target);
   definition := overlay(definition placing 'CREATE OR REPLACE FUNCTION keel_private.job_rpc_before_night('
     from 1 for length('CREATE OR REPLACE FUNCTION public.plates_job_rpc('));
   -- CREATE OR REPLACE preserves this private delegate's owner and revoked ACL.
   execute definition;
  end if;
  definition := pg_get_functiondef(old.oid);
  -- Only the declared function name changes; its body, defaults, security and
  -- configuration are copied verbatim, including private implementation calls.
  definition := overlay(definition placing format('CREATE OR REPLACE FUNCTION public.%I(',pair.current)
    from 1 for length(format('CREATE OR REPLACE FUNCTION public.%I(',pair.legacy)));
  execute definition;
  target := to_regprocedure(format('public.%I(%s)',pair.current,oidvectortypes(old.proargtypes)));
  execute format('ALTER FUNCTION public.%I(%s) OWNER TO %I',pair.current,pg_get_function_identity_arguments(old.oid),pg_get_userbyid(old.proowner));
  -- Remove default-privilege grants too, then reproduce the source ACL exactly.
  for permission in select distinct grantee from pg_proc p,
    lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target loop
   execute format('REVOKE ALL ON FUNCTION public.%I(%s) FROM %s',pair.current,pg_get_function_identity_arguments(old.oid),
     case when permission.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(permission.grantee)) end);
  end loop;
  for permission in select * from aclexplode(coalesce(old.proacl,acldefault('f',old.proowner))) loop
   execute format('GRANT %s ON FUNCTION public.%I(%s) TO %s%s',permission.privilege_type,pair.current,pg_get_function_identity_arguments(old.oid),
     case when permission.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(permission.grantee)) end,
     case when permission.is_grantable then ' WITH GRANT OPTION' else '' end);
  end loop;
  execute format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = %L AS %L',
   pair.legacy,pg_get_function_arguments(old.oid),'',forward);
 end loop;
end;
$migration$;
commit;
