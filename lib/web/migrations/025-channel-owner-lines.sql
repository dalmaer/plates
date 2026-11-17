-- Channel owner lines (phase 194, increment 3): the owner's own line on a
-- project's channel, posted from the signed-in site, in SQL024's channel_posts.
-- Apply once, after 001-024, to the explicit private database using an owner
-- SQL session and only with the owner's resource approval. Local tests grant no
-- remote permission. It replaces public.plates_channel_rpc with the same
-- signature (so PostgREST's named arguments are unchanged), keeps 'post' and
-- 'list' exactly as 024 had them, and adds two operations:
--  'owner-post'  the owner's line: its device and session columns carry the
--                owner's digest, which the service derives from the owner's
--                scope (never a device key's digest: one that is a device key
--                is refused). No device key check: the RPC is service-role
--                only, and the service authenticates the site session. The
--                same 2048-byte record, 14 days and 500 per project; at most 10
--                of the owner's lines per project per minute.
--  'list-marked' 'list' with each row's owner mark: true when its device
--                column is the owner digest the service passes.
-- The table is unchanged: ciphertext, opaque digests and timestamps only.
begin;
create or replace function public.plates_channel_rpc(p_operation text, p_scope text default null, p_project text default null, p_session text default null, p_device text default null, p_value text default null, p_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); posted plates_home.channel_posts;
begin
 if p_operation is null or p_operation not in ('post', 'list', 'owner-post', 'list-marked') then raise exception 'invalid channel operation'; end if;
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}$' or p_project is null or p_project !~ '^[a-f0-9]{64}$'
  or (p_session is not null and p_session !~ '^[a-f0-9]{64}$') or (p_device is not null and p_device !~ '^[a-f0-9]{64}$') then raise exception 'invalid channel input'; end if;
 if p_operation = 'post' then
  if p_session is null or p_device is null or p_value is null or octet_length(p_value) > 2048 or p_since is not null then raise exception 'invalid channel post'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-channel-posts', 24));
  -- Only a device whose key still exists may post; a revoked one is refused.
  if not exists (select 1 from plates_home.device_keys where scope = p_scope and device = p_device) then return jsonb_build_object('revoked', true); end if;
  delete from plates_home.channel_posts where posted_at < stamp - interval '14 days';
  if exists (select 1 from plates_home.channel_posts where scope = p_scope and session = p_session and posted_at > stamp - interval '1 minute') then
   return jsonb_build_object('tooFrequent', true);
  end if;
  insert into plates_home.channel_posts(scope, project, session, device, value, posted_at) values(p_scope, p_project, p_session, p_device, p_value, stamp) returning * into posted;
  delete from plates_home.channel_posts where scope = p_scope and project = p_project and id not in (
   select id from plates_home.channel_posts where scope = p_scope and project = p_project order by posted_at desc, id desc limit 500);
  return jsonb_build_object('posted', true, 'at', posted.posted_at);
 end if;
 if p_operation = 'owner-post' then
  if p_session is null or p_device is null or p_session <> p_device or p_value is null or octet_length(p_value) > 2048 or p_since is not null then raise exception 'invalid channel owner post'; end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-channel-posts', 24));
  -- The owner's digest is never a device key's: a line from a device goes through 'post' and its key.
  if exists (select 1 from plates_home.device_keys where scope = p_scope and device = p_device) then raise exception 'invalid channel owner post'; end if;
  delete from plates_home.channel_posts where posted_at < stamp - interval '14 days';
  if (select count(*) from plates_home.channel_posts where scope = p_scope and project = p_project and device = p_device and posted_at > stamp - interval '1 minute') >= 10 then
   return jsonb_build_object('tooFrequent', true);
  end if;
  insert into plates_home.channel_posts(scope, project, session, device, value, posted_at) values(p_scope, p_project, p_session, p_device, p_value, stamp) returning * into posted;
  delete from plates_home.channel_posts where scope = p_scope and project = p_project and id not in (
   select id from plates_home.channel_posts where scope = p_scope and project = p_project order by posted_at desc, id desc limit 500);
  return jsonb_build_object('posted', true, 'at', posted.posted_at);
 end if;
 if p_operation = 'list-marked' then
  if p_device is null or p_session is not null or p_value is not null then raise exception 'invalid channel list'; end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('value', l.value, 'postedAt', l.posted_at, 'owner', l.device = p_device) order by l.posted_at, l.id)
   from (select value, posted_at, device, id from plates_home.channel_posts where scope = p_scope and project = p_project and posted_at >= stamp - interval '14 days'
    and (p_since is null or posted_at > p_since) order by posted_at desc, id desc limit 500) l), '[]'::jsonb));
 end if;
 if p_session is not null or p_device is not null or p_value is not null then raise exception 'invalid channel list'; end if;
 return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('value', l.value, 'postedAt', l.posted_at) order by l.posted_at, l.id)
  from (select value, posted_at, id from plates_home.channel_posts where scope = p_scope and project = p_project and posted_at >= stamp - interval '14 days'
   and (p_since is null or posted_at > p_since) order by posted_at desc, id desc limit 500) l), '[]'::jsonb));
end;
$$;
revoke all on function public.plates_channel_rpc(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.plates_channel_rpc(text, text, text, text, text, text, timestamptz) to service_role;
commit;
