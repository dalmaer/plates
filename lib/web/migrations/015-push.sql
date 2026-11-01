-- Phase 152: Web Push subscriptions and the one-notification-per-item ledger.
-- Apply once, after 001-014, to the explicit private database using an owner
-- SQL session and only with the owner's resource approval. Local tests grant no
-- remote permission. The service seals every subscription before it arrives:
-- this schema holds ciphertext, opaque scope/key digests and timestamps only.
-- Its own schema: no new legacy-named identity is added before the name transition.
begin;
create schema if not exists plates_push;
revoke all on schema plates_push from public, anon, authenticated;
create table if not exists plates_push.subscriptions (
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 key text not null check(key ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value) <= 4096),
 created_at timestamptz not null,
 updated_at timestamptz not null,
 primary key(scope, key)
);
-- One row per notified item and owner. A claim is made before sending, so an
-- item notifies at most once; rows expire after 400 days in bounded batches.
create table if not exists plates_push.ledger (
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 key text not null check(key ~ '^[a-f0-9]{64}$'),
 claimed_at timestamptz not null,
 expires_at timestamptz not null,
 primary key(scope, key)
);
alter table plates_push.subscriptions enable row level security;
alter table plates_push.ledger enable row level security;
revoke all on plates_push.subscriptions from public, anon, authenticated, service_role;
revoke all on plates_push.ledger from public, anon, authenticated, service_role;
create or replace function public.plates_push_rpc(p_operation text, p_scope text, p_key text default null, p_value text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); changed integer := 0;
begin
 if p_operation is null or p_operation not in ('subscribe', 'unsubscribe', 'list', 'claim')
  or p_scope is null or p_scope !~ '^[a-f0-9]{64}$' then raise exception 'invalid push input'; end if;
 if p_operation = 'list' then
  if p_key is not null or p_value is not null then raise exception 'invalid push list'; end if;
 elsif p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid push key';
 elsif p_operation = 'subscribe' and (p_value is null or octet_length(p_value) > 4096) then raise exception 'invalid push subscription';
 elsif p_operation <> 'subscribe' and p_value is not null then raise exception 'invalid push mutation';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-push', 152));
 if p_operation = 'subscribe' then
  -- Ten devices per owner and 1,000 rows per instance; a full store says so.
  if not exists (select 1 from plates_push.subscriptions where scope = p_scope and key = p_key) then
   if (select count(*) from plates_push.subscriptions where scope = p_scope) >= 10
    or (select count(*) from plates_push.subscriptions) >= 1000 then return jsonb_build_object('capacity', true); end if;
  end if;
  insert into plates_push.subscriptions(scope, key, value, created_at, updated_at) values(p_scope, p_key, p_value, stamp, stamp)
   on conflict(scope, key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return jsonb_build_object('subscribed', true, 'devices', (select count(*) from plates_push.subscriptions where scope = p_scope));
 elsif p_operation = 'unsubscribe' then
  delete from plates_push.subscriptions where scope = p_scope and key = p_key;
  get diagnostics changed = row_count;
  return jsonb_build_object('removed', changed > 0, 'devices', (select count(*) from plates_push.subscriptions where scope = p_scope));
 elsif p_operation = 'list' then
  return jsonb_build_object('subscriptions', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value) order by s.created_at, s.key)
   from (select key, value, created_at from plates_push.subscriptions where scope = p_scope order by created_at, key limit 10) s), '[]'::jsonb));
 end if;
 delete from plates_push.ledger where (scope, key) in (select scope, key from plates_push.ledger where expires_at <= stamp limit 100);
 if not exists (select 1 from plates_push.ledger where scope = p_scope and key = p_key)
  and (select count(*) from plates_push.ledger) >= 100000 then return jsonb_build_object('capacity', true); end if;
 insert into plates_push.ledger(scope, key, claimed_at, expires_at) values(p_scope, p_key, stamp, stamp + interval '400 days')
  on conflict do nothing;
 get diagnostics changed = row_count;
 return jsonb_build_object('claimed', changed = 1);
end;
$$;
revoke all on function public.plates_push_rpc(text, text, text, text) from public, anon, authenticated;
grant execute on function public.plates_push_rpc(text, text, text, text) to service_role;
commit;
