-- Hosted proof for lib/web/migrations/025-channel-owner-lines.sql (plan step migration-025).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-024 are already applied). Paste the whole file and run it once.
--
-- Proves: public.plates_channel_rpc(text,text,text,text,text,text,timestamptz) is
--   still one function, SECURITY DEFINER with an empty search_path, returning jsonb,
--   executable by service_role only; anon and authenticated cannot execute it;
--   plates_home.channel_posts is unchanged (row level security, no table privilege
--   for anon, authenticated or service_role, digests, ciphertext and times only).
--   As service_role, with a synthetic device key (022) and a synthetic owner digest:
--   a device line still posts through 'post' and 'list' still returns value and
--   postedAt only; the owner's line posts through 'owner-post' with no device key;
--   'list-marked' marks the owner's row true and the device's row false; an owner
--   post whose digest is a device key's, or whose session is not its digest, is
--   refused; the owner's eleventh line within a minute on one plate is refused as too
--   frequent; an oversized owner record and an unknown operation are refused.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 025-channel-owner-lines hosted proof'. Any
--   wrong fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); a real owner line posted from the deployed site and
--   read by plates channel inbox, which the step records.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-025.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('ae',32); key_hash text:=repeat('ab',32); device_key text:=repeat('cd',32);
 owner_key text:=repeat('0e',32); session_one text:=repeat('a1',32);
 rpc text:='public.plates_channel_rpc(text,text,text,text,text,text,timestamptz)';
 r jsonb; role_name text; i integer;
begin
 if to_regnamespace('plates_home') is null then raise exception 'missing schema plates_home'; end if;
 if has_schema_privilege('anon','plates_home','USAGE') or has_schema_privilege('authenticated','plates_home','USAGE') then raise exception 'a browser role can use schema plates_home'; end if;
 if to_regclass('plates_home.channel_posts') is null then raise exception 'missing table plates_home.channel_posts'; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass('plates_home.channel_posts')) then raise exception 'row level security off on plates_home.channel_posts'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'plates_home.channel_posts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on plates_home.channel_posts',role_name; end if;
 end loop;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='plates_home' and table_name='channel_posts')
  <> array['id','scope','project','session','device','value','posted_at'] then raise exception 'plates_home.channel_posts holds more than digests, ciphertext and times'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='plates_channel_rpc')<>1 then raise exception 'expected exactly one public plates_channel_rpc'; end if;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if (select prosrc from pg_proc where oid=to_regprocedure(rpc)) not like '%owner-post%' then raise exception 'public.plates_channel_rpc has no owner-post operation (025 not applied)'; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute public.plates_channel_rpc'; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from plates_home.channel_posts where scope=scope_key) or exists(select 1 from plates_home.device_keys where scope=scope_key) then raise exception 'Acme proof rows already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated'] loop
   execute format('set local role %I',role_name);
   begin perform public.plates_channel_rpc('owner-post',scope_key,project_key,owner_key,owner_key,'sealed-x'); raise exception 'client RPC allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_waiting_rpc('key-create',scope_key,key_hash,device_key,'sealed-acme-device')<>'{"created":true}'::jsonb then raise exception 'the synthetic device key was not created'; end if;
  r:=public.plates_channel_rpc('post',scope_key,project_key,session_one,device_key,'sealed-acme-line');
  if r->>'posted'<>'true' then raise exception 'a device line no longer posts: %',r; end if;
  r:=public.plates_channel_rpc('owner-post',scope_key,project_key,owner_key,owner_key,'sealed-acme-owner');
  if r->>'posted'<>'true' or r->>'at' is null then raise exception 'the owner line did not post: %',r; end if;
  r:=public.plates_channel_rpc('list',scope_key,project_key);
  if jsonb_array_length(r->'items')<>2 or exists(select 1 from jsonb_array_elements(r->'items') e where (select count(*) from jsonb_object_keys(e))<>2) then raise exception 'list changed shape: %',r; end if;
  r:=public.plates_channel_rpc('list-marked',scope_key,project_key,null,owner_key);
  if jsonb_array_length(r->'items')<>2 or r->'items'->0->>'value'<>'sealed-acme-line' or r->'items'->0->>'owner'<>'false'
   or r->'items'->1->>'value'<>'sealed-acme-owner' or r->'items'->1->>'owner'<>'true' then raise exception 'list-marked does not mark the owner''s line only: %',r; end if;
  begin perform public.plates_channel_rpc('owner-post',scope_key,project_key,device_key,device_key,'sealed-y'); raise exception 'an owner post under a device key''s digest accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel owner post' then raise; end if; end;
  begin perform public.plates_channel_rpc('owner-post',scope_key,project_key,session_one,owner_key,'sealed-y'); raise exception 'an owner post with another session accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel owner post' then raise; end if; end;
  begin perform public.plates_channel_rpc('owner-post',scope_key,project_key,owner_key,owner_key,repeat('x',2049)); raise exception 'an oversized owner line accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel owner post' then raise; end if; end;
  begin perform public.plates_channel_rpc('list-marked',scope_key,project_key); raise exception 'list-marked without the owner digest accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel list' then raise; end if; end;
  begin perform public.plates_channel_rpc('steal',scope_key,project_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel operation' then raise; end if; end;
  for i in 2..10 loop
   if public.plates_channel_rpc('owner-post',scope_key,project_key,owner_key,owner_key,'sealed-owner-'||i)->>'posted'<>'true' then raise exception 'owner line % within the bound refused',i; end if;
  end loop;
  if public.plates_channel_rpc('owner-post',scope_key,project_key,owner_key,owner_key,'sealed-owner-11')<>'{"tooFrequent":true}'::jsonb then raise exception 'the owner''s eleventh line within a minute was accepted'; end if;
  reset role;
  raise exception using errcode='P0001', message='plates-channel-owner-proof-rollback';
 exception when raise_exception then
  if sqlerrm<>'plates-channel-owner-proof-rollback' then raise; end if;
 end;
 if exists(select 1 from plates_home.channel_posts where scope=scope_key) or exists(select 1 from plates_home.device_keys where scope=scope_key) then raise exception 'Acme proof rows survived'; end if;
end;
$proof$;
select 'PASS 025-channel-owner-lines hosted proof' as result;
