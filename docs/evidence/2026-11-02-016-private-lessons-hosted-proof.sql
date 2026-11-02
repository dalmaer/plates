-- Hosted proof for lib/web/migrations/016-private-lessons.sql (phase 138).
-- Prepared for an owner-attended SQL session; never run remotely by this task.
-- Leaves behind: nothing. Synthetic Acme rows roll back inside the proof.
-- Expected result: PASS 016-private-lessons hosted proof. A failed condition raises an exception.
-- Record the migration SHA-256 separately before applying it. Local PGlite checks
-- privileges, catalog and isolated RPC behavior; it cannot attest hosted grants,
-- two-connection locking, wrapping keys, transport identity or live providers.
do $proof$
declare t text; role_name text; f record; r jsonb; a text:=repeat('a1',32); b text:=repeat('b2',32); i text:=repeat('c3',32); k text:=repeat('d4',32);
begin
 foreach t in array array['keel_private.private_lessons'] loop
  if to_regclass(t) is null then raise exception 'missing table %',t; end if;
  if not(select relrowsecurity from pg_class where oid=to_regclass(t)) then raise exception 'row level security off on %',t; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,t; end if;
  end loop;
 end loop;
 t:='public.plates_private_lesson_rpc(text,text,text,text,jsonb)';
 if to_regprocedure(t) is null then raise exception 'missing RPC %',t; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(t) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=pg_catalog, keel_private']) then raise exception 'unsafe RPC configuration'; end if;
 if has_function_privilege('anon',t,'EXECUTE') or has_function_privilege('authenticated',t,'EXECUTE') then raise exception 'a browser role can execute plates_private_lesson_rpc'; end if;
 if not has_function_privilege('service_role',t,'EXECUTE') then raise exception 'service role cannot execute plates_private_lesson_rpc'; end if;
 begin
  if exists(select 1 from keel_private.private_lessons where instance=i) then raise exception 'Acme proof keys already present'; end if;
  set local role service_role;
  r:=public.plates_private_lesson_rpc('preview',i,a,k,jsonb_build_object('operation',k,'digest',k,'rows',jsonb_build_array(jsonb_build_object('recipient',a,'id',k,'kind','preview','operation',k,'digest',k,'value','Acme opaque ciphertext'))));
  if r->>'recipient' is distinct from a or r->>'value' is distinct from 'Acme opaque ciphertext' then raise exception 'preview did not retain exact owner bytes'; end if;
  if public.plates_private_lesson_rpc('read',i,b,k) is not null then raise exception 'another actor read the preview'; end if;
  r:=public.plates_private_lesson_rpc('preview',i,a,k,jsonb_build_object('digest',a,'rows',jsonb_build_array(jsonb_build_object('id',k))));
  if r->>'conflict' is distinct from 'true' then raise exception 'changed preview identity did not conflict'; end if;
  reset role;
  raise exception 'Acme proof rollback';
 exception when raise_exception then if SQLERRM<>'Acme proof rollback' then raise; end if; end;
end $proof$;
select 'PASS 016-private-lessons hosted proof' as result;
