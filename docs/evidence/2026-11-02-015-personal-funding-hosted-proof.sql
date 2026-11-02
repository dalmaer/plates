-- Hosted proof for lib/web/migrations/015-personal-funding.sql (phase 138).
-- Prepared for an owner-attended SQL session; never run remotely by this task.
-- Leaves behind: nothing. Synthetic Acme rows roll back inside the proof.
-- Expected result: PASS 015-personal-funding hosted proof. A failed condition raises an exception.
-- Record the migration SHA-256 separately before applying it. Local PGlite checks
-- privileges, catalog and isolated RPC behavior; it cannot attest hosted grants,
-- two-connection locking, wrapping keys, transport identity or live providers.
do $proof$
declare t text; role_name text; f record; r jsonb; a text:=repeat('a1',32); b text:=repeat('b2',32); i text:=repeat('c3',32); k text:=repeat('d4',32);
begin
 if not exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='connection_credentials' and column_name='funding_metadata') or not exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='connection_credentials' and column_name='funding_value') or not exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='connection_credentials' and column_name='funding_request') or not exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='model_attempts' and column_name='funding') then raise exception 'missing funding columns'; end if;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='keel_private'::regnamespace and proname=any(array['connection_rpc_v1','model_rpc_v1','model_credential_read_v1','funding_key','funding_metadata_valid','funding_check','funding_recovery_check','personal_connection_rpc','personal_attempt_guard','personal_model_rpc','personal_credential_read']) loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'EXECUTE') then raise exception '% can execute private funding helper',role_name; end if;
  end loop;
 end loop;
 if to_regprocedure('keel_private.funding_check(jsonb,jsonb,bigint,text,text)') is null or to_regprocedure('keel_private.funding_metadata_valid(jsonb)') is null then raise exception 'missing funding admission helper'; end if;
 if keel_private.funding_metadata_valid(null) or keel_private.funding_check(null,null,1,i,k) then raise exception 'invalid funding accepted'; end if;
 if keel_private.funding_key('["Acme",1]'::jsonb) is distinct from encode(sha256(convert_to('["Acme",1]','UTF8')),'hex') then raise exception 'funding tuple identity mismatch'; end if;
end $proof$;
select 'PASS 015-personal-funding hosted proof' as result;
