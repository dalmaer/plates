-- Phase 173: Not now, per owner. An item the owner put off leaves Home's
-- "Needs you" until its date, then returns; it is counted, never silently gone.
-- Apply once, after 001-016, to the explicit private database using an owner
-- SQL session and only with the owner's resource approval. Local tests grant no
-- remote permission. The service seals each record before it arrives (the item,
-- its date and the owner's reason): this schema holds ciphertext, opaque
-- scope/key digests, the return date and timestamps only.
-- Its own schema: no new legacy-named identity is added after the name transition.
begin;
create schema if not exists plates_home;
revoke all on schema plates_home from public, anon, authenticated;
-- One row per owner and item. A row is kept until its return date and removed
-- in bounded batches after it, so an expired record never hides anything.
create table if not exists plates_home.not_now (
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 key text not null check(key ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value) <= 4096),
 until date not null,
 updated_at timestamptz not null,
 primary key(scope, key)
);
alter table plates_home.not_now enable row level security;
revoke all on plates_home.not_now from public, anon, authenticated, service_role;
create or replace function public.plates_not_now_rpc(p_operation text, p_scope text, p_key text default null, p_value text default null, p_until date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); today date := (clock_timestamp() at time zone 'UTC')::date; changed integer := 0;
begin
 if p_operation is null or p_operation not in ('put', 'clear', 'list')
  or p_scope is null or p_scope !~ '^[a-f0-9]{64}$' then raise exception 'invalid not now input'; end if;
 if p_operation = 'list' then
  if p_key is not null or p_value is not null or p_until is not null then raise exception 'invalid not now list'; end if;
 elsif p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid not now key';
 elsif p_operation = 'put' and (p_value is null or octet_length(p_value) > 4096 or p_until is null or p_until <= today or p_until > today + 400) then raise exception 'invalid not now record';
 elsif p_operation = 'clear' and (p_value is not null or p_until is not null) then raise exception 'invalid not now clear';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-not-now', 173));
 -- Records past their date return their items; they are removed a hundred at a time.
 delete from plates_home.not_now where (scope, key) in (select scope, key from plates_home.not_now where until <= today limit 100);
 if p_operation = 'put' then
  -- 500 items per owner and 10,000 rows per instance; a full store says so.
  if not exists (select 1 from plates_home.not_now where scope = p_scope and key = p_key) then
   if (select count(*) from plates_home.not_now where scope = p_scope) >= 500
    or (select count(*) from plates_home.not_now) >= 10000 then return jsonb_build_object('capacity', true); end if;
  end if;
  insert into plates_home.not_now(scope, key, value, until, updated_at) values(p_scope, p_key, p_value, p_until, stamp)
   on conflict(scope, key) do update set value = excluded.value, until = excluded.until, updated_at = excluded.updated_at;
  return jsonb_build_object('put', true, 'count', (select count(*) from plates_home.not_now where scope = p_scope and until > today));
 elsif p_operation = 'clear' then
  delete from plates_home.not_now where scope = p_scope and key = p_key;
  get diagnostics changed = row_count;
  return jsonb_build_object('cleared', changed > 0);
 end if;
 return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value, 'until', s.until::text) order by s.until, s.key)
  from (select key, value, until from plates_home.not_now where scope = p_scope and until > today order by until, key limit 500) s), '[]'::jsonb));
end;
$$;
revoke all on function public.plates_not_now_rpc(text, text, text, text, date) from public, anon, authenticated;
grant execute on function public.plates_not_now_rpc(text, text, text, text, date) to service_role;
commit;
