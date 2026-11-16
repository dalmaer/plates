-- Hosted proof for lib/web/migrations/024-channel-posts.sql (plan step migration-024).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-023 are already applied). Paste the whole file and run it once.
--
-- Proves: plates_home.channel_posts exists with row level security and no table
--   privilege for anon, authenticated or service_role, and anon and authenticated
--   still cannot use schema plates_home; its columns are digests, ciphertext and
--   times only; public.plates_channel_rpc(text,text,text,text,text,text,timestamptz)
--   is SECURITY DEFINER with an empty search_path and returns jsonb, executable by
--   service_role only; anon and authenticated cannot execute it or touch the table.
--   As service_role, with a synthetic device key (022): a line posts and lists back;
--   a second line from one session within a minute is refused; another session
--   posts; a device with no key is refused; a sealed record over 2048 bytes and
--   malformed input are refused; a line older than 14 days is deleted on the next
--   write; a plate keeps at most 500 lines, the oldest going first.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 024-channel-posts hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); a real plates say through the deployed route, which
--   the step records with what the plate's Channel shows.
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-024.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('ae',32); key_hash text:=repeat('ab',32); device_key text:=repeat('cd',32);
 session_one text:=repeat('a1',32); session_two text:=repeat('a2',32);
 rpc text:='public.plates_channel_rpc(text,text,text,text,text,text,timestamptz)';
 r jsonb; role_name text; n integer;
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
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute public.plates_channel_rpc'; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from plates_home.channel_posts where scope=scope_key) or exists(select 1 from plates_home.device_keys where scope=scope_key) then raise exception 'Acme proof rows already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin execute 'select 1 from plates_home.channel_posts limit 1'; raise exception 'direct read of plates_home.channel_posts allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin execute 'delete from plates_home.channel_posts where false'; raise exception 'direct write of plates_home.channel_posts allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.plates_channel_rpc('list',scope_key,project_key); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  if public.plates_waiting_rpc('key-create',scope_key,key_hash,device_key,'sealed-acme-device')<>'{"created":true}'::jsonb then raise exception 'the synthetic device key was not created'; end if;
  r:=public.plates_channel_rpc('post',scope_key,project_key,session_one,device_key,'sealed-acme-line');
  if r->>'posted'<>'true' or r->>'at' is null then raise exception 'post wrong: %',r; end if;
  r:=public.plates_channel_rpc('list',scope_key,project_key);
  if jsonb_array_length(r->'items')<>1 or r->'items'->0->>'value'<>'sealed-acme-line' then raise exception 'a posted line does not list: %',r; end if;
  if public.plates_channel_rpc('post',scope_key,project_key,session_one,device_key,'sealed-again')<>'{"tooFrequent":true}'::jsonb then raise exception 'a second line within a minute was accepted'; end if;
  if public.plates_channel_rpc('post',scope_key,project_key,session_two,device_key,'sealed-other')->>'posted'<>'true' then raise exception 'another session could not post'; end if;
  if public.plates_channel_rpc('post',scope_key,project_key,repeat('a3',32),repeat('ef',32),'sealed-x')<>'{"revoked":true}'::jsonb then raise exception 'a device with no key posted'; end if;
  begin perform public.plates_channel_rpc('post',scope_key,project_key,repeat('a4',32),device_key,repeat('x',2049)); raise exception 'an oversized line accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel post' then raise; end if; end;
  begin perform public.plates_channel_rpc('post','not-a-digest',project_key,repeat('a4',32),device_key,'x'); raise exception 'a malformed scope accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel input' then raise; end if; end;
  begin perform public.plates_channel_rpc('steal',scope_key,project_key); raise exception 'unknown operation accepted';
  exception when raise_exception then if sqlerrm<>'invalid channel operation' then raise; end if; end;
  reset role;
  -- Retention and the per-plate bound, on synthetic rows the owner writes directly.
  update plates_home.channel_posts set posted_at=clock_timestamp()-interval '15 days' where scope=scope_key and value='sealed-acme-line';
  insert into plates_home.channel_posts(scope,project,session,device,value,posted_at)
   select scope_key,project_key,lpad(to_hex(i),64,'0'),device_key,'sealed-'||i,clock_timestamp()-interval '1 day'+i*interval '1 second' from generate_series(1,499) i;
  set local role service_role;
  if public.plates_channel_rpc('post',scope_key,project_key,repeat('a5',32),device_key,'sealed-newest')->>'posted'<>'true' then raise exception 'the bounded post failed'; end if;
  reset role;
  if exists(select 1 from plates_home.channel_posts where scope=scope_key and value='sealed-acme-line') then raise exception 'a line older than 14 days survived a write'; end if;
  select count(*) into n from plates_home.channel_posts where scope=scope_key and project=project_key;
  if n<>500 then raise exception 'a plate holds % lines, not at most 500',n; end if;
  if exists(select 1 from plates_home.channel_posts where scope=scope_key and value='sealed-1') then raise exception 'the oldest line beyond 500 survived'; end if;
  raise exception using errcode='P0001', message='plates-channel-proof-rollback';
 exception when raise_exception then
  if sqlerrm<>'plates-channel-proof-rollback' then raise; end if;
 end;
 if exists(select 1 from plates_home.channel_posts where scope=scope_key) or exists(select 1 from plates_home.device_keys where scope=scope_key) then raise exception 'Acme proof rows survived'; end if;
end;
$proof$;
select 'PASS 024-channel-posts hosted proof' as result;
