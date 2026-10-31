-- Hosted proof for lib/web/migrations/006-private-media.sql (phase 99, plan step migration-006).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits. Paste the whole file and run it once.
--
-- Proves: keel_private.media_receipts and keel_private.media_slots exist with row
--   level security and no table privilege for anon, authenticated or service_role;
--   public.keel_media_rpc has its 14-argument signature, is SECURITY DEFINER with an
--   empty search_path and returns jsonb; anon and authenticated cannot execute it or
--   touch the tables (checked from the catalog and by SET LOCAL ROLE); service_role
--   cannot touch the tables directly but can call the RPC. As service_role, a bounded
--   synthetic receipt is reserved (replay returns the original, another actor gets
--   nothing, another digest conflicts, the capacity cap refuses), moved through the
--   uploading/verified CAS, attached to a slot, listed, batched and fenced on delete.
-- Leaves behind: nothing. The synthetic Acme rows are written inside a subtransaction
--   that is rolled back on success; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 006-private-media hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), the Storage bucket itself, and any concurrent
--   behaviour (this step's proof names none).
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-006.
do $proof$
declare
 scope_key text:=repeat('ac',32); project_key text:=repeat('c1',32); other_project text:=repeat('c2',32);
 receipt_id text:=repeat('d1',32); other_receipt text:=repeat('d2',32);
 digest_one text:=repeat('e1',32); digest_two text:=repeat('e2',32);
 slot_key text:=repeat('f1',32); requirements_one text:=repeat('f2',32); requirements_two text:=repeat('f3',32);
 rpc text:='public.keel_media_rpc(text,text,text,bigint,text,bigint,text,bigint,text,text,text,integer,text,bigint)';
 tables text[]:=array['keel_private.media_receipts','keel_private.media_slots'];
 r jsonb; t text; role_name text;
begin
 -- Applied objects and grants, read from the catalog.
 foreach t in array tables loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not (select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if has_schema_privilege('anon','keel_private','USAGE') or has_schema_privilege('authenticated','keel_private','USAGE') then raise exception 'a browser role can use schema keel_private'; end if;
 if exists(select 1 from keel_private.media_receipts where scope=scope_key) or exists(select 1 from keel_private.media_slots where scope=scope_key) then raise exception 'Acme proof keys already present'; end if;
 begin
  -- Role denials, exercised.
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   foreach t in array tables loop
    begin execute format('select 1 from %s limit 1',t); raise exception 'direct read of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from %s where false',t); raise exception 'direct write of % allowed for %',t,role_name;
    exception when insufficient_privilege then null; end;
   end loop;
   if role_name<>'service_role' then
    begin perform public.keel_media_rpc('list',scope_key,project_key,1); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  -- A bounded synthetic receipt, as the service role.
  set local role service_role;
  if public.keel_media_rpc('list',scope_key,project_key,1)<>'[]'::jsonb then raise exception 'empty list not empty'; end if;
  r:=public.keel_media_rpc('reserve',scope_key,project_key,1,p_id=>receipt_id,p_value=>'Acme sealed capture receipt',p_bytes=>1024,p_digest=>digest_one);
  if r->>'state' is distinct from 'prepared' or r->>'revision' is distinct from '1' or r->>'created' is distinct from 'true' then raise exception 'receipt not reserved: %',r; end if;
  r:=public.keel_media_rpc('reserve',scope_key,project_key,1,p_id=>receipt_id,p_value=>'Acme replay',p_bytes=>1024,p_digest=>digest_one);
  if r->>'created' is distinct from 'false' or r->>'value' is distinct from 'Acme sealed capture receipt' then raise exception 'replay changed the original: %',r; end if;
  if public.keel_media_rpc('reserve',scope_key,project_key,2,p_id=>receipt_id,p_value=>'Acme other actor',p_bytes=>1024,p_digest=>digest_one) is not null then raise exception 'another actor reused the reservation'; end if;
  r:=public.keel_media_rpc('reserve',scope_key,project_key,1,p_id=>receipt_id,p_value=>'Acme other digest',p_bytes=>1024,p_digest=>digest_two);
  if r->>'conflict' is distinct from 'true' then raise exception 'changed digest accepted: %',r; end if;
  r:=public.keel_media_rpc('reserve',scope_key,project_key,1,p_id=>other_receipt,p_value=>'Acme over capacity',p_bytes=>1024,p_digest=>digest_two,p_capacity=>1024);
  if r->>'capacity' is distinct from 'true' then raise exception 'capacity cap not enforced: %',r; end if;
  if public.keel_media_rpc('read',scope_key,other_project,1,p_id=>receipt_id) is not null then raise exception 'receipt read across projects'; end if;
  r:=public.keel_media_rpc('uploading',scope_key,project_key,1,p_id=>receipt_id,p_expected=>1);
  if r->>'state' is distinct from 'uploading' or r->>'revision' is distinct from '2' then raise exception 'uploading CAS failed: %',r; end if;
  r:=public.keel_media_rpc('uploading',scope_key,project_key,1,p_id=>receipt_id,p_expected=>1);
  if r->>'conflict' is distinct from 'true' then raise exception 'stale revision accepted: %',r; end if;
  r:=public.keel_media_rpc('verified',scope_key,project_key,1,p_id=>receipt_id,p_expected=>2);
  if r->>'state' is distinct from 'verified' or r->>'revision' is distinct from '3' then raise exception 'verify failed: %',r; end if;
  r:=public.keel_media_rpc('attach',scope_key,project_key,1,p_id=>receipt_id,p_expected=>0,p_slot=>slot_key,p_requirements=>requirements_one);
  if r->>'artifact' is distinct from receipt_id or r->>'revision' is distinct from '1' then raise exception 'attach failed: %',r; end if;
  r:=public.keel_media_rpc('attach',scope_key,project_key,1,p_id=>receipt_id,p_expected=>0,p_slot=>slot_key,p_requirements=>requirements_one);
  if r->>'revision' is distinct from '1' then raise exception 'repeated attach changed the slot: %',r; end if;
  r:=public.keel_media_rpc('attach',scope_key,project_key,1,p_id=>receipt_id,p_expected=>0,p_slot=>slot_key,p_requirements=>requirements_two);
  if r->>'conflict' is distinct from 'true' then raise exception 'stale attach accepted: %',r; end if;
  r:=public.keel_media_rpc('list',scope_key,project_key,1);
  if jsonb_array_length(r)<>1 or r->0->>'id' is distinct from receipt_id then raise exception 'list wrong: %',r; end if;
  r:=public.keel_media_rpc('batch',scope_key,project_key,1,p_value=>jsonb_build_array(receipt_id,other_receipt)::text);
  if jsonb_array_length(r)<>1 then raise exception 'batch wrong: %',r; end if;
  if jsonb_array_length(public.keel_media_rpc('slots',scope_key,project_key,1))<>1 then raise exception 'slots wrong'; end if;
  r:=public.keel_media_rpc('deleting',scope_key,project_key,1,p_id=>receipt_id,p_expected=>2);
  if r->>'conflict' is distinct from 'true' then raise exception 'stale delete accepted: %',r; end if;
  r:=public.keel_media_rpc('deleting',scope_key,project_key,1,p_id=>receipt_id,p_expected=>3);
  if r->>'state' is distinct from 'deleting' or r->>'revision' is distinct from '4' then raise exception 'delete fence failed: %',r; end if;
  begin perform public.keel_media_rpc('list',scope_key,project_key,1,p_limit=>32); raise exception 'oversized page accepted';
  exception when raise_exception then if sqlerrm<>'invalid media input' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.media_receipts where scope=scope_key) or exists(select 1 from keel_private.media_slots where scope=scope_key) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 006-private-media hosted proof' as result;
