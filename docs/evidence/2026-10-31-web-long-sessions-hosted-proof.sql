-- Hosted proof for lib/web/migrations/016-long-sessions.sql (phase 154, plan step migration-016).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits (001-015 are already applied). Paste the whole file and run it once.
--
-- Proves: exactly one public plates_web_rpc and one public keel_web_rpc exist;
--   plates_web_rpc is still the SECURITY DEFINER plpgsql implementation with an
--   empty search_path returning jsonb, and its p_seconds bound now reads
--   31536000 for kind 'session' and 28800 for every other kind; keel_web_rpc is
--   still only the SECURITY DEFINER SQL forwarder SELECT public.plates_web_rpc($1..$8)
--   with the same arguments, owner and ACL; anon and authenticated can execute
--   neither name (catalog and SET LOCAL ROLE) and service_role can execute both.
--   As service_role, a synthetic session created with a 365-day lifetime succeeds
--   through each name, a session over 365 days is refused, and an attempt or a
--   versioned record over eight hours is refused.
-- Leaves behind: nothing. The synthetic rows are written inside a subtransaction
--   that is rolled back; the last check fails if any survived.
-- Expected result: one row, result = 'PASS 016-long-sessions hosted proof'. Any wrong
--   fact stops the script with an exception naming it.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it); the deployed build's renewal against GitHub and the
--   owner's overnight check (phase 154's walk).
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-016.
do $proof$
declare
 k_plates text:=repeat('a1',32); k_keel text:=repeat('a2',32); k_over text:=repeat('a3',32);
 signature text:='(text,text,text,text,text,text,integer,bigint)';
 impl record; fwd record; role_name text; outcome jsonb; refused boolean; probe record;
begin
 if to_regnamespace('keel_private') is null then raise exception 'internal schema keel_private missing'; end if;
 if exists(select 1 from keel_private.web_records where key in (k_plates,k_keel,k_over)) then raise exception 'Acme proof keys already present'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='plates_web_rpc')<>1 then raise exception 'expected exactly one public plates_web_rpc'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='keel_web_rpc')<>1 then raise exception 'expected exactly one public keel_web_rpc'; end if;
 select p.*,l.lanname,pg_get_function_arguments(p.oid) arguments into impl from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('public.plates_web_rpc'||signature);
 select p.*,l.lanname,pg_get_function_arguments(p.oid) arguments into fwd from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('public.keel_web_rpc'||signature);
 if impl.oid is null or fwd.oid is null then raise exception 'plates_web_rpc or keel_web_rpc has an unexpected signature'; end if;
 if impl.lanname<>'plpgsql' or not impl.prosecdef or impl.prorettype<>'jsonb'::regtype or not impl.proconfig @> array['search_path=""'] then raise exception 'plates_web_rpc is not the SECURITY DEFINER plpgsql implementation with an empty search_path'; end if;
 if position('p_seconds > (case when p_kind = ''session'' then 31536000 else 28800 end)' in impl.prosrc)=0 then raise exception 'plates_web_rpc does not carry the 016 session bound'; end if;
 if position('p_seconds > 28800' in impl.prosrc)>0 then raise exception 'plates_web_rpc still carries the eight-hour bound for every kind'; end if;
 if fwd.lanname<>'sql' or not fwd.prosecdef or not fwd.proconfig @> array['search_path=""'] or fwd.prosrc<>'SELECT public.plates_web_rpc($1, $2, $3, $4, $5, $6, $7, $8)' then raise exception 'keel_web_rpc is not a forwarder to plates_web_rpc'; end if;
 if impl.arguments<>fwd.arguments then raise exception 'plates_web_rpc and keel_web_rpc differ in arguments'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  if has_function_privilege(role_name,impl.oid,'EXECUTE') then raise exception 'a browser role can execute plates_web_rpc'; end if;
  if has_function_privilege(role_name,fwd.oid,'EXECUTE') then raise exception 'a browser role can execute keel_web_rpc'; end if;
 end loop;
 if not has_function_privilege('service_role',impl.oid,'EXECUTE') or not has_function_privilege('service_role',fwd.oid,'EXECUTE') then raise exception 'service_role cannot execute plates_web_rpc or keel_web_rpc'; end if;
 if impl.proowner<>fwd.proowner or impl.proacl::text is distinct from fwd.proacl::text then raise exception 'plates_web_rpc and keel_web_rpc differ in owner or ACL'; end if;
 begin
  -- Role denials, exercised through both names.
  foreach role_name in array array['anon','authenticated'] loop
   execute format('set local role %I',role_name);
   begin perform public.plates_web_rpc('read','session',k_plates); raise exception 'client call of plates_web_rpc allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   begin perform public.keel_web_rpc('read','session',k_plates); raise exception 'client call of keel_web_rpc allowed for %',role_name;
   exception when insufficient_privilege then null; end;
   reset role;
  end loop;
  set local role service_role;
  -- A synthetic session lives 365 days through each name.
  outcome:=public.plates_web_rpc('create','session',k_plates,'Acme synthetic',null,'1',31536000);
  if outcome->>'version' is distinct from '1' then raise exception 'a 365-day session was not created through plates_web_rpc: %',outcome; end if;
  outcome:=public.keel_web_rpc('create','session',k_keel,'Acme synthetic',null,'1',31536000);
  if outcome->>'version' is distinct from '1' then raise exception 'a 365-day session was not created through keel_web_rpc: %',outcome; end if;
  outcome:=public.plates_web_rpc('cas','session',k_plates,'Acme synthetic renewed',null,null,2592000,1);
  if outcome->>'version' is distinct from '2' then raise exception 'a session CAS within a year failed: %',outcome; end if;
  reset role;
  select extract(epoch from expires_at-clock_timestamp())::int as s into probe from keel_private.web_records where kind='session' and key=k_keel;
  if probe.s is null or probe.s<31535000 or probe.s>31536000 then raise exception 'the 365-day session expires in % seconds',probe.s; end if;
  set local role service_role;
  -- Over a year for a session, and over eight hours for anything else, is refused.
  for probe in select * from (values ('session',31536001),('attempt',28801),('record',28801),('attempt',31536000),('record',31536000)) v(kind,seconds) loop
   refused:=false;
   begin perform public.plates_web_rpc('create',probe.kind,k_over,'Acme synthetic',null,null,probe.seconds);
   exception when raise_exception then refused:=sqlerrm='invalid storage operation'; end;
   if not refused then raise exception 'a % of % seconds was not refused',probe.kind,probe.seconds; end if;
  end loop;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.web_records where key in (k_plates,k_keel,k_over)) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 016-long-sessions hosted proof' as result;
