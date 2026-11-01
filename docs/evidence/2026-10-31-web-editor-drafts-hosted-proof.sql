-- Hosted proof for lib/web/migrations/012-editor-drafts.sql (phase 107, plan step migration-012).
-- Run in the Supabase SQL editor as the owner (postgres role), right after the
-- migration commits. Paste the whole file and run it once; then run the
-- two-connection race at the end of this file in two editor tabs.
--
-- Proves: keel_private.editor_drafts exists with row level security and no table
--   privilege for anon, authenticated or service_role; the generation sequence
--   keel_private.editor_draft_generation grants nothing to those roles;
--   public.keel_editor_draft_rpc(text,text,bigint,text,text,text,text) is SECURITY
--   DEFINER with an empty search_path and returns jsonb; anon and authenticated
--   cannot execute it or touch the table (catalog and SET LOCAL ROLE); service_role
--   cannot touch the table or advance the sequence directly. As service_role, a
--   synthetic draft starts empty; a save takes a new generation; repeating the same
--   save identity returns its original result; a stale generation, a changed request
--   digest and a save to a never-read scope conflict; a delete leaves a tombstone
--   without the body; an expired draft becomes a new generation that an old save
--   cannot resurrect; malformed input is refused.
-- Leaves behind: no rows. Part 1's synthetic Acme rows are written inside a
--   subtransaction that is rolled back on success; the race commits one synthetic row
--   and its last statement deletes it. Sequence values used by the proof are not
--   returned (a sequence never rolls back); later generations only skip them.
-- Expected result: one row, result = 'PASS 012-editor-drafts hosted proof'. Any wrong
--   fact stops the script with an exception naming it. The race's expected results
--   are written beside its statements.
-- Not covered: the SHA-256 of the applied file against source (SQL cannot read the
--   file; the step records it), and the draft encryption (done by the service).
-- Checked locally by tests/web-hosted-proofs.test.mjs on PGlite after 001-012; the
--   race is replayed there serially on one connection, which cannot show a lock wait.
do $proof$
declare
 s1 text:=repeat('ac',32); s2 text:=repeat('ad',32); s3 text:=repeat('ae',32); never text:=repeat('af',32);
 rpc text:='public.keel_editor_draft_rpc(text,text,bigint,text,text,text,text)';
 tbl text:='keel_private.editor_drafts'; seq text:='keel_private.editor_draft_generation';
 initial jsonb; first jsonb; second jsonb; r jsonb; role_name text;
begin
 if to_regclass(tbl) is null then raise exception 'missing table %',tbl; end if;
 if not (select relrowsecurity from pg_class where oid=to_regclass(tbl)) then raise exception 'row level security off on %',tbl; end if;
 if (select relkind from pg_class where oid=to_regclass(seq)) is distinct from 'S' then raise exception 'missing sequence %',seq; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% holds a privilege on %',role_name,tbl; end if;
  if has_sequence_privilege(role_name,seq,'USAGE,SELECT,UPDATE') then raise exception '% holds a privilege on %',role_name,seq; end if;
 end loop;
 if to_regprocedure(rpc) is null then raise exception 'missing function %',rpc; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(rpc) and prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=""']) then raise exception '% is not SECURITY DEFINER jsonb with an empty search_path',rpc; end if;
 if has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('authenticated',rpc,'EXECUTE') then raise exception 'a browser role can execute %',rpc; end if;
 if not has_function_privilege('service_role',rpc,'EXECUTE') then raise exception 'service_role cannot execute %',rpc; end if;
 if exists(select 1 from keel_private.editor_drafts where scope in(s1,s2,s3,never)) then raise exception 'Acme proof keys already present'; end if;
 begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
   execute format('set local role %I',role_name);
   begin perform 1 from keel_private.editor_drafts limit 1; raise exception 'direct read of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   begin delete from keel_private.editor_drafts where false; raise exception 'direct write of % allowed for %',tbl,role_name;
   exception when insufficient_privilege then null; end;
   begin perform nextval('keel_private.editor_draft_generation'); raise exception 'sequence advanced by %',role_name;
   exception when insufficient_privilege then null; end;
   if role_name<>'service_role' then
    begin perform public.keel_editor_draft_rpc('read',s1); raise exception 'client RPC allowed for %',role_name;
    exception when insufficient_privilege then null; end;
   end if;
   reset role;
  end loop;
  set local role service_role;
  initial:=public.keel_editor_draft_rpc('read',s1);
  if initial->>'state' is distinct from 'empty' or (initial->>'revision')::bigint<1 then raise exception 'new draft not empty: %',initial; end if;
  if public.keel_editor_draft_rpc('read',s1)<>initial then raise exception 'reading changed the draft'; end if;
  first:=public.keel_editor_draft_rpc('save',s1,(initial->>'revision')::bigint,repeat('10',32),repeat('11',32),repeat('12',32),'Acme encrypted draft placeholder');
  if first->>'state' is distinct from 'saved' or (first->>'revision')::bigint<=(initial->>'revision')::bigint or first->>'value' is distinct from 'Acme encrypted draft placeholder' then raise exception 'save failed: %',first; end if;
  if public.keel_editor_draft_rpc('save',s1,(initial->>'revision')::bigint,repeat('10',32),repeat('11',32),repeat('12',32),'Acme encrypted draft placeholder')<>first then raise exception 'repeated save identity did not return its original result'; end if;
  r:=public.keel_editor_draft_rpc('save',s1,(initial->>'revision')::bigint,repeat('13',32),repeat('14',32),repeat('12',32),'Acme stale tab');
  if r->>'conflict' is distinct from 'true' then raise exception 'stale generation accepted: %',r; end if;
  r:=public.keel_editor_draft_rpc('save',s1,(initial->>'revision')::bigint,repeat('10',32),repeat('99',32),repeat('12',32),'Acme changed body');
  if r->>'conflict' is distinct from 'true' then raise exception 'changed request digest accepted: %',r; end if;
  r:=public.keel_editor_draft_rpc('save',never,(first->>'revision')::bigint,repeat('15',32),repeat('16',32),repeat('12',32),'Acme invented draft');
  if r->>'conflict' is distinct from 'true' then raise exception 'save to a never-read scope accepted: %',r; end if;
  r:=public.keel_editor_draft_rpc('delete',s1,(initial->>'revision')::bigint,repeat('17',32),repeat('18',32));
  if r->>'conflict' is distinct from 'true' then raise exception 'stale delete accepted: %',r; end if;
  r:=public.keel_editor_draft_rpc('delete',s1,(first->>'revision')::bigint,repeat('19',32),repeat('1a',32));
  if r->>'state' is distinct from 'deleted' or r->'value'<>'null'::jsonb or (r->>'revision')::bigint<=(first->>'revision')::bigint then raise exception 'delete failed: %',r; end if;
  r:=public.keel_editor_draft_rpc('read',s2);
  second:=public.keel_editor_draft_rpc('save',s2,(r->>'revision')::bigint,repeat('20',32),repeat('21',32),repeat('22',32),'Acme second draft placeholder');
  reset role;
  update keel_private.editor_drafts set expires_at=clock_timestamp()-interval '1 day' where scope=s2;
  set local role service_role;
  perform public.keel_editor_draft_rpc('read',s3);
  r:=public.keel_editor_draft_rpc('read',s2);
  if r->>'state' is distinct from 'expired' or r->'value'<>'null'::jsonb or (r->>'revision')::bigint<=(second->>'revision')::bigint then raise exception 'expiry not a new empty generation: %',r; end if;
  r:=public.keel_editor_draft_rpc('save',s2,(second->>'revision')::bigint,repeat('23',32),repeat('24',32),repeat('22',32),'Acme resurrection');
  if r->>'conflict' is distinct from 'true' then raise exception 'old save resurrected an expired draft: %',r; end if;
  begin perform public.keel_editor_draft_rpc('read',s1,1); raise exception 'read with a mutation field accepted';
  exception when raise_exception then if sqlerrm<>'invalid editor read' then raise; end if; end;
  begin perform public.keel_editor_draft_rpc('save',s1,1,repeat('25',32),repeat('26',32),repeat('22',32),repeat('x',200001)); raise exception 'oversized draft accepted';
  exception when raise_exception then if sqlerrm<>'invalid editor save' then raise; end if; end;
  reset role;
  raise exception using errcode='P0002',message='Acme proof passed; roll back all synthetic rows';
 exception when no_data_found then null;
 end;
 if exists(select 1 from keel_private.editor_drafts where scope in(s1,s2,s3,never)) then raise exception 'proof rows survived rollback'; end if;
end $proof$;
select 'PASS 012-editor-drafts hosted proof' as result;

/* TWO-CONNECTION RACE (plan: "a two-connection draft CAS race").
   Not run by pasting the file: this whole section is a comment. Open two SQL editor
   tabs, A and B, copy each numbered statement into the tab it names and run them in
   order. Statement [2] holds its transaction for 8 seconds after saving: start [3] in
   tab B within those 8 seconds. Record both result rows; they are the evidence that
   no save was lost, since one final row cannot show it.
   Expected: both tabs save from generation 1; [2] returns state "saved"; [3] returns
   {"conflict": true}, with a different pid and a finished_at no earlier than [2]'s.
   [4] returns its PASS row. Run [5] whatever happened, to remove the synthetic row.

-- [1] tab A: setup, one empty synthetic draft pinned at generation 1 so both tabs can name it
do $setup$
begin
 if exists(select 1 from keel_private.editor_drafts where scope=repeat('ac',32)) then raise exception 'Acme race rows present: run [5] first'; end if;
 if public.keel_editor_draft_rpc('read',repeat('ac',32))->>'state' is distinct from 'empty' then raise exception 'setup read failed'; end if;
 update keel_private.editor_drafts set revision=1 where scope=repeat('ac',32);
end $setup$;
select 'race ready' as result;

-- [2] tab A: save from generation 1 and hold for 8 seconds
with action as materialized (select pg_backend_pid() as pid, public.keel_editor_draft_rpc('save',repeat('ac',32),1,repeat('3a',32),repeat('3b',32),repeat('3c',32),'Acme draft from tab A') as result),
 held as materialized (select pg_sleep(8) from action)
select 'A' as tab, pid, clock_timestamp() as finished_at, result->>'state' as state, result->>'conflict' as conflict from action cross join held;

-- [3] tab B: save from the same generation 1 while [2] is still running
with action as materialized (select pg_backend_pid() as pid, public.keel_editor_draft_rpc('save',repeat('ac',32),1,repeat('4a',32),repeat('4b',32),repeat('4c',32),'Acme draft from tab B') as result)
select 'B' as tab, pid, clock_timestamp() as finished_at, result->>'state' as state, result->>'conflict' as conflict from action;

-- [4] tab A: one save holds the draft
do $check$
declare r keel_private.editor_drafts;
begin
 select * into r from keel_private.editor_drafts where scope=repeat('ac',32);
 if r.state is distinct from 'saved' or r.revision<=1 then raise exception 'expected one saved generation after 1, found % at %',r.state,r.revision; end if;
 if r.request not in(repeat('3a',32),repeat('4a',32)) then raise exception 'winning save is neither tab'; end if;
end $check$;
select 'PASS 012 draft CAS race' as result;

-- [5] tab A: cleanup, always
with removed as (delete from keel_private.editor_drafts where scope=repeat('ac',32) returning 1)
select count(*) as synthetic_rows_removed from removed;
*/
