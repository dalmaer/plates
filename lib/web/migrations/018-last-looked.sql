-- Phase 166: "Since you last looked", per owner. Home's second section starts at
-- the owner's previous visit. Apply once, after 001-017, to the explicit private
-- database using an owner SQL session and only with the owner's resource
-- approval. Local tests grant no remote permission. This schema holds an opaque
-- owner-scope digest and two times only: when the owner last loaded Home, and
-- when they last loaded it in the visit before this one. No project content,
-- item or page is stored.
-- It joins phase 173's own schema: no new legacy-named identity is added.
begin;
create schema if not exists plates_home;
revoke all on schema plates_home from public, anon, authenticated;
-- One row per owner. A visit is a run of Home page loads less than thirty
-- minutes apart; "since" is the last load of the visit before, so a reload never
-- moves it past what the owner has not yet seen. Background refreshes only read.
create table if not exists plates_home.last_looked (
 scope text primary key check(scope ~ '^[a-f0-9]{64}$'),
 seen_at timestamptz not null,
 previous_at timestamptz,
 updated_at timestamptz not null
);
alter table plates_home.last_looked enable row level security;
revoke all on plates_home.last_looked from public, anon, authenticated, service_role;
create or replace function public.plates_last_looked_rpc(p_operation text, p_scope text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stamp timestamptz := clock_timestamp(); row_value plates_home.last_looked%rowtype;
begin
 if p_operation is null or p_operation not in ('read', 'visit')
  or p_scope is null or p_scope !~ '^[a-f0-9]{64}$' then raise exception 'invalid last looked input'; end if;
 select * into row_value from plates_home.last_looked where scope = p_scope;
 if p_operation = 'visit' then
  if not found then
   -- 10,000 owners per instance; a full store says so and records nothing.
   if (select count(*) from plates_home.last_looked) >= 10000 then return jsonb_build_object('capacity', true); end if;
   insert into plates_home.last_looked(scope, seen_at, previous_at, updated_at) values(p_scope, stamp, null, stamp)
    on conflict(scope) do update set seen_at = excluded.seen_at, updated_at = excluded.updated_at
    returning * into row_value;
  else
   update plates_home.last_looked set previous_at = case when seen_at <= stamp - interval '30 minutes' then seen_at else previous_at end,
    seen_at = greatest(seen_at, stamp), updated_at = stamp where scope = p_scope
    returning * into row_value;
  end if;
 end if;
 return jsonb_build_object('seen', case when row_value.scope is null then null else to_char(row_value.seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
  'previous', case when row_value.previous_at is null then null else to_char(row_value.previous_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end);
end;
$$;
revoke all on function public.plates_last_looked_rpc(text, text) from public, anon, authenticated;
grant execute on function public.plates_last_looked_rpc(text, text) to service_role;
commit;
