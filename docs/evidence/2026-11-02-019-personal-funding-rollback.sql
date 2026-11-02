-- Rollback for lib/web/migrations/019-personal-funding.sql (phase 138).
-- Prepared for an owner-attended SQL session; never run remotely by this task.
-- Run only with personalFunding.enabled false and the prior deployment serving.
--
-- 019 is not additive: it replaces the active public connection_rpc, model_rpc
-- and model_credential_read with wrappers and adds the personal_attempt_guard
-- trigger on keel_private.model_attempts. Restoring the prior deployment leaves
-- both in place, so this file undoes them:
--   * each active public function (plates_ after 014, else keel_) gets back the
--     exact body 019 saved as keel_private.<name>_v1; its grants are kept,
--   * the personal_attempt_guard trigger and its function are dropped.
-- Leaves behind: every row and column. The funding columns, the saved *_v1
-- copies and the private helpers stay (no role can execute them), so applying
-- 019 again reuses the saved copies instead of saving a wrapper as "v1".
-- Refuses while any connection holds personal funding metadata: the restored
-- functions would treat a personal credential as an ordinary shared one.
-- Revoke or remove those connections first. Safe to run twice.
-- Expected result: PASS 019-personal-funding rollback. A failed condition raises an exception.
begin;
do $rollback$
declare stem text; prefix text; definition text;
begin
 if exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='connection_credentials' and column_name='funding_metadata')
  and exists(select 1 from keel_private.connection_credentials where funding_metadata is not null) then
  raise exception 'personal funding rows remain; revoke or remove them before rolling back 019';
 end if;
 prefix:=case when exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='plates_connection_rpc') then 'plates_' else 'keel_' end;
 foreach stem in array array['connection_rpc','model_rpc','model_credential_read'] loop
  select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='keel_private'::regnamespace and proname=stem||'_v1';
  if definition is null then raise exception 'missing keel_private.%_v1; 019 was not applied here', stem; end if;
  execute replace(definition, 'keel_private.'||stem||'_v1(', 'public.'||prefix||stem||'(');
 end loop;
end $rollback$;
drop trigger if exists personal_attempt_guard on keel_private.model_attempts;
drop function if exists keel_private.personal_attempt_guard();
commit;
select 'PASS 019-personal-funding rollback' as result;
