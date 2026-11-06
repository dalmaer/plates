-- Phase 184: the backlog remembers what happened to each item. Apply once, after
-- 001-018, to the explicit private database using an owner SQL session and only
-- with the owner's resource approval. Local tests grant no remote permission.
-- Append-only and metadata only: an opaque owner-scope digest, the database's
-- own time, and short codes (lib/backlog-events.mjs). No source text and no owner
-- words: every text column is a code checked by pattern, so a sentence does not
-- fit in one, and a Not now's reason is a code, never the reason.
-- It joins phase 173's own schema: no new legacy-named identity is added.
begin;
create schema if not exists plates_home;
revoke all on schema plates_home from public, anon, authenticated;
create table if not exists plates_home.backlog_events (
 id bigint generated always as identity primary key,
 scope text not null check(scope ~ '^[a-f0-9]{64}$'),
 at timestamptz not null,
 actor text not null check(actor ~ '^(owner|agent:[a-z][a-z0-9-]{0,31})$'),
 key text not null check(octet_length(key) <= 300 and key ~ '^[a-z][a-z0-9-]{0,63}:[a-z][a-z-]{0,31}:[A-Za-z0-9][A-Za-z0-9._/#@+-]{0,199}$'),
 action text not null check(action in ('view', 'attach', 'assist', 'dispatch', 'release', 'answer', 'not-now')),
 reason text check(reason in ('none', 'stated')),
 route text check(route ~ '^[a-z][a-z0-9-]{0,31}$'),
 lane text check(lane ~ '^[a-z][a-z-]{0,31}$'),
 position integer check(position between 1 and 10000),
 takes integer check(takes between 0 and 1440),
 outcome text check(outcome ~ '^[a-z][a-z0-9-]{0,63}$'),
 receipt text check(receipt ~ '^[a-z][a-z-]{0,31}:[a-f0-9]{12,64}$'),
 check((action = 'not-now') = (reason is not null))
);
create index if not exists backlog_events_scope_at on plates_home.backlog_events(scope, at, id);
alter table plates_home.backlog_events enable row level security;
revoke all on plates_home.backlog_events from public, anon, authenticated, service_role;
-- Append-only: a recorded event is never changed. Retention is deliberately open
-- (phase 184); removing old events is a later migration's own decision.
create or replace function plates_home.backlog_events_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'backlog events are append-only'; end;
$$;
drop trigger if exists backlog_events_append_only on plates_home.backlog_events;
create trigger backlog_events_append_only before update or delete on plates_home.backlog_events
 for each row execute function plates_home.backlog_events_append_only();
revoke all on function plates_home.backlog_events_append_only() from public, anon, authenticated, service_role;
create or replace function public.plates_backlog_events_rpc(p_operation text, p_scope text, p_event jsonb default null, p_since timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); fields text[]; added plates_home.backlog_events%rowtype;
begin
 if p_operation is null or p_operation not in ('append', 'list')
  or p_scope is null or p_scope !~ '^[a-f0-9]{64}$' then raise exception 'invalid backlog event input'; end if;
 if p_operation = 'list' then
  if p_event is not null then raise exception 'invalid backlog event list'; end if;
  return jsonb_build_object('events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor', e.actor, 'key', e.key, 'action', e.action, 'reason', e.reason, 'route', e.route, 'lane', e.lane, 'position', e.position,
    'takes', e.takes, 'outcome', e.outcome, 'receipt', e.receipt) order by e.at, e.id)
   from (select * from plates_home.backlog_events where scope = p_scope and (p_since is null or at >= p_since) order by at, id limit 1000) e), '[]'::jsonb));
 end if;
 if p_since is not null or p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'invalid backlog event'; end if;
 select array_agg(k order by k) into fields from jsonb_object_keys(p_event) k;
 if not fields <@ array['action', 'actor', 'key', 'lane', 'outcome', 'position', 'reason', 'receipt', 'route', 'takes'] then raise exception 'invalid backlog event'; end if;
 if exists (select 1 from jsonb_each(p_event) f where jsonb_typeof(f.value) not in ('string', 'number', 'null')
  or (f.key in ('position', 'takes') and jsonb_typeof(f.value) = 'string')
  or (f.key not in ('position', 'takes') and jsonb_typeof(f.value) = 'number')) then raise exception 'invalid backlog event'; end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended('plates-backlog-events', 184));
 -- 50,000 events per owner and 200,000 per instance; a full store says so and records nothing.
 if (select count(*) from plates_home.backlog_events where scope = p_scope) >= 50000
  or (select count(*) from plates_home.backlog_events) >= 200000 then return jsonb_build_object('capacity', true); end if;
 begin
  insert into plates_home.backlog_events(scope, at, actor, key, action, reason, route, lane, position, takes, outcome, receipt)
   values(p_scope, stamp, p_event->>'actor', p_event->>'key', p_event->>'action', p_event->>'reason', p_event->>'route', p_event->>'lane',
    (p_event->>'position')::integer, (p_event->>'takes')::integer, p_event->>'outcome', p_event->>'receipt')
   returning * into added;
 exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid backlog event';
 end;
 return jsonb_build_object('appended', true, 'id', added.id, 'at', to_char(added.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;
revoke all on function public.plates_backlog_events_rpc(text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.plates_backlog_events_rpc(text, text, jsonb, timestamptz) to service_role;
commit;
