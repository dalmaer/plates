-- Sessions waiting on you: the owner's devices push the home sessions on their
-- machine that ended on a question (plates sessions push), and Home lists them.
-- Apply once, after 001-021, to the explicit private database using an owner
-- SQL session and only with the owner's resource approval. Local tests grant no
-- remote permission. The service seals each record before it arrives (a device's
-- name and owner, and a snapshot's sessions): this schema holds ciphertext,
-- opaque scope/key/device digests and timestamps only. A device key is never
-- stored: only its SHA-256.
begin;
create schema if not exists plates_home;
revoke all on schema plates_home from public, anon, authenticated;
-- One row per device key. Revoking deletes the key and that device's snapshot.
create table if not exists plates_home.device_keys (
 key_hash text primary key check(key_hash ~ '^[a-f0-9]{64}$'),
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 device text not null check(device ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value) <= 2048),
 created_at timestamptz not null,
 unique(scope, device)
);
-- The newest snapshot each device sent: replaced whole on every push.
create table if not exists plates_home.waiting_sessions (
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 device text not null check(device ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value) <= 65536),
 scanned_at timestamptz not null,
 primary key(scope, device)
);
alter table plates_home.device_keys enable row level security;
alter table plates_home.waiting_sessions enable row level security;
revoke all on plates_home.device_keys from public, anon, authenticated, service_role;
revoke all on plates_home.waiting_sessions from public, anon, authenticated, service_role;
create or replace function public.plates_waiting_rpc(p_operation text, p_scope text default null, p_key_hash text default null, p_device text default null, p_value text default null, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); changed integer := 0; row_key plates_home.device_keys;
begin
 if p_operation is null or p_operation not in ('key-create', 'key-list', 'key-revoke', 'key-resolve', 'push', 'list') then raise exception 'invalid waiting operation'; end if;
 if (p_scope is not null and p_scope !~ '^[a-f0-9]{64}$') or (p_key_hash is not null and p_key_hash !~ '^[a-f0-9]{64}$')
  or (p_device is not null and p_device !~ '^[a-f0-9]{64}$') then raise exception 'invalid waiting input'; end if;
 if p_operation = 'key-resolve' then
  if p_key_hash is null or p_scope is not null or p_device is not null or p_value is not null then raise exception 'invalid waiting resolve'; end if;
  select * into row_key from plates_home.device_keys where key_hash = p_key_hash;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'scope', row_key.scope, 'device', row_key.device, 'value', row_key.value);
 end if;
 if p_scope is null then raise exception 'invalid waiting scope'; end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-waiting-sessions', 22));
 if p_operation = 'key-create' then
  if p_key_hash is null or p_device is null or p_value is null or octet_length(p_value) > 2048 then raise exception 'invalid waiting key'; end if;
  -- Ten devices per owner and 1,000 keys per instance; a full store says so.
  if (select count(*) from plates_home.device_keys where scope = p_scope) >= 10 or (select count(*) from plates_home.device_keys) >= 1000 then return jsonb_build_object('capacity', true); end if;
  insert into plates_home.device_keys(key_hash, scope, device, value, created_at) values(p_key_hash, p_scope, p_device, p_value, stamp);
  return jsonb_build_object('created', true);
 elsif p_operation = 'key-list' then
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('device', k.device, 'value', k.value, 'createdAt', k.created_at, 'scannedAt', w.scanned_at) order by k.created_at)
   from plates_home.device_keys k left join plates_home.waiting_sessions w on w.scope = k.scope and w.device = k.device where k.scope = p_scope), '[]'::jsonb));
 elsif p_operation = 'key-revoke' then
  if p_device is null then raise exception 'invalid waiting revoke'; end if;
  delete from plates_home.waiting_sessions where scope = p_scope and device = p_device;
  delete from plates_home.device_keys where scope = p_scope and device = p_device;
  get diagnostics changed = row_count;
  return jsonb_build_object('revoked', changed > 0);
 elsif p_operation = 'push' then
  if p_device is null or p_value is null or octet_length(p_value) > 65536 or p_at is null or p_at > stamp + interval '5 minutes' then raise exception 'invalid waiting push'; end if;
  -- Only a device whose key still exists may push; a revoked one is refused.
  if not exists (select 1 from plates_home.device_keys where scope = p_scope and device = p_device) then return jsonb_build_object('revoked', true); end if;
  insert into plates_home.waiting_sessions(scope, device, value, scanned_at) values(p_scope, p_device, p_value, p_at)
   on conflict(scope, device) do update set value = excluded.value, scanned_at = excluded.scanned_at;
  return jsonb_build_object('pushed', true);
 end if;
 return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('device', w.device, 'value', w.value, 'scannedAt', w.scanned_at) order by w.scanned_at desc)
  from plates_home.waiting_sessions w where w.scope = p_scope), '[]'::jsonb));
end;
$$;
revoke all on function public.plates_waiting_rpc(text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.plates_waiting_rpc(text, text, text, text, text, timestamptz) to service_role;
commit;
