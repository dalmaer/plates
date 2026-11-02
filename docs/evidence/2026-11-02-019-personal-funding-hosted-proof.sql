-- Hosted proof for lib/web/migrations/019-personal-funding.sql (phase 138).
-- Prepared for an owner-attended SQL session; never run remotely by this task.
-- Proves: the funding columns exist; no browser or service role can execute a
--   private funding helper; invalid funding is refused; and, as service_role, an
--   ordinary (non-personal) connection still round-trips metadata and put through
--   the public plates_connection_rpc wrapper 019 installs, while a row carrying
--   funding metadata is hidden from that ordinary path.
-- Leaves behind: nothing. The round trip writes one synthetic Acme connection
--   inside a subtransaction that is rolled back on success.
-- Expected result: PASS 019-personal-funding hosted proof. A failed condition raises an exception.
-- Record the migration SHA-256 separately before applying it. Local PGlite checks
-- privileges, catalog and isolated RPC behavior; it cannot attest hosted grants,
-- two-connection locking, wrapping keys, transport identity or live providers.
do $proof$
declare t text; role_name text; f record; r jsonb; a text:=repeat('a1',32); b text:=repeat('b2',32); i text:=repeat('c3',32); k text:=repeat('d4',32);
 scope_key text:=repeat('e5',32); connection_key text:=repeat('f6',32); r1 text:=repeat('a7',32); r2 text:=repeat('b8',32); cipher text:='Acme opaque ciphertext placeholder';
 rpc text:='public.plates_connection_rpc(text,text,text,bigint,text,text,bigint,text,jsonb)';
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
 -- The main production risk: an ordinary connection through the new public wrapper.
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if position('keel_private.personal_connection_rpc' in (select prosrc from pg_proc where oid=to_regprocedure(rpc)))=0 then raise exception '% is not the 019 wrapper',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from keel_private.connection_credentials where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
 begin
  set local role service_role;
  if public.plates_connection_rpc('metadata',scope_key,connection_key) is not null then raise exception 'missing connection invented'; end if;
  r:=public.plates_connection_rpc('put',scope_key,connection_key,0,a,r1,1,cipher,'{"state":"valid"}'::jsonb);
  if r->>'version' is distinct from '1' or r->>'state' is distinct from 'present' or r ? 'conflict' then raise exception 'ordinary put through the wrapper failed: %',r; end if;
  if r ? 'value' or position(cipher in r::text)>0 then raise exception 'wrapper put returned ciphertext'; end if;
  r:=public.plates_connection_rpc('metadata',scope_key,connection_key);
  if r->>'version' is distinct from '1' or r->>'policy' is distinct from a or r->>'request' is distinct from r1 or r ? 'value' or position(cipher in r::text)>0 then raise exception 'ordinary metadata through the wrapper wrong: %',r; end if;
  r:=public.plates_connection_rpc('put',scope_key,connection_key,1,a,r2,1,'Acme rotated ciphertext placeholder','{}'::jsonb);
  if r->>'version' is distinct from '2' or r->>'request' is distinct from r2 then raise exception 'ordinary rotation through the wrapper failed: %',r; end if;
  reset role;
  if (select funding_metadata from keel_private.connection_credentials where scope=scope_key and connection=connection_key) is not null then raise exception 'ordinary put wrote funding metadata'; end if;
  update keel_private.connection_credentials set funding_metadata='{}'::jsonb where scope=scope_key and connection=connection_key;
  set local role service_role;
  if public.plates_connection_rpc('metadata',scope_key,connection_key) is not null then raise exception 'personal row visible through ordinary metadata'; end if;
  if public.plates_connection_rpc('put',scope_key,connection_key,2,a,r1,1,cipher,'{}'::jsonb)->>'conflict' is distinct from 'true' then raise exception 'ordinary put over a personal row accepted'; end if;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.connection_credentials where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 019-personal-funding hosted proof' as result;
