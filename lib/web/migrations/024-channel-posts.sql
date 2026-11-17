-- Channel posts (phase 194, increment 2): an agent's own line on its project's
-- channel (plates say), posted with the owner's device key (SQL022).
-- Apply once, after 001-023, to the explicit private database using an owner
-- SQL session and only with the owner's resource approval. Local tests grant no
-- remote permission. The service seals each line before it arrives (its text,
-- session, provider, phase and device): this schema holds ciphertext, opaque
-- scope/project/session/device digests and timestamps only.
-- Bounds held here as well as in the service: a line of at most 280 characters
-- (its sealed record at most 2048 bytes), one per session per minute, kept 14
-- days (expired lines are deleted on every write) and at most 500 per project
-- (the oldest go first). Only a device whose key exists may post.
begin;
create schema if not exists plates_home;
revoke all on schema plates_home from public, anon, authenticated;
create table if not exists plates_home.channel_posts (
 id bigint generated always as identity primary key,
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 project text not null check(project ~ '^[a-f0-9]{64}$'),
 session text not null check(session ~ '^[a-f0-9]{64}$'),
 device text not null check(device ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value) <= 2048),
 posted_at timestamptz not null
);
create index if not exists channel_posts_project on plates_home.channel_posts(scope, project, posted_at desc, id desc);
create index if not exists channel_posts_session on plates_home.channel_posts(scope, session, posted_at desc);
alter table plates_home.channel_posts enable row level security;
revoke all on plates_home.channel_posts from public, anon, authenticated, service_role;
create or replace function public.plates_channel_rpc(p_operation text, p_scope text default null, p_project text default null, p_session text default null, p_device text default null, p_value text default null, p_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); posted plates_home.channel_posts;
begin
 if p_operation is null or p_operation not in ('post', 'list') then raise exception 'invalid channel operation'; end if;
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
 if p_session is not null or p_device is not null or p_value is not null then raise exception 'invalid channel list'; end if;
 return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('value', l.value, 'postedAt', l.posted_at) order by l.posted_at, l.id)
  from (select value, posted_at, id from plates_home.channel_posts where scope = p_scope and project = p_project and posted_at >= stamp - interval '14 days'
   and (p_since is null or posted_at > p_since) order by posted_at desc, id desc limit 500) l), '[]'::jsonb));
end;
$$;
revoke all on function public.plates_channel_rpc(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.plates_channel_rpc(text, text, text, text, text, text, timestamptz) to service_role;
commit;
