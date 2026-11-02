-- Additive private catalogue. Apply only after explicit storage/restore review.
-- No existing Git lessons, auth grants, credentials or runtime policies change.
begin;
create schema if not exists keel_private;
create table if not exists keel_private.private_lessons (
 instance text not null check(instance ~ '^[a-f0-9]{64}$'),
 recipient text not null check(recipient ~ '^[a-f0-9]{64}$'),
 owner text not null check(owner ~ '^[a-f0-9]{64}$'),
 id text not null check(id ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('preview','original','copy','receipt')),
 operation text not null check(operation ~ '^[a-f0-9]{64}$'),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value)<=200000),
 revoked boolean not null default false,
 revocation text check(revocation is null or octet_length(revocation)<=4096),
 created_at timestamptz not null default clock_timestamp(),
 primary key(instance,recipient,id)
);
alter table keel_private.private_lessons enable row level security;
revoke all on keel_private.private_lessons from public,anon,authenticated,service_role;
create index if not exists private_lessons_operation on keel_private.private_lessons(instance,owner,operation);
create or replace function public.plates_private_lesson_rpc(p_operation text,p_instance text,p_actor text,p_id text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,keel_private as $$
declare r keel_private.private_lessons; item jsonb; existing keel_private.private_lessons; n integer; out_rows jsonb;
begin
 if p_instance is null or p_instance !~ '^[a-f0-9]{64}$' or p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_id is null or p_id !~ '^[a-f0-9]{64}$' or p_operation not in ('read','list','preview','commit','revoke') then raise exception 'invalid lesson request'; end if;
 if p_operation='read' then
  select * into r from keel_private.private_lessons where instance=p_instance and recipient=p_actor and id=p_id;
  return case when found then to_jsonb(r) else null end;
 end if;
 if p_operation='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into out_rows from (select * from keel_private.private_lessons where instance=p_instance and recipient=p_actor and kind in ('original','copy') and not revoked and id>p_id order by id limit 51) x;
  return jsonb_build_object('rows',out_rows);
 end if;
 perform pg_advisory_xact_lock(21259,16);
 if p_operation='revoke' then
  select * into r from keel_private.private_lessons where instance=p_instance and recipient=p_actor and owner=p_actor and id=p_id and kind='receipt';
  if not found then return null; end if;
  if p_data->>'revocation' is null or octet_length(p_data->>'revocation')>4096 then raise exception 'invalid lesson revocation'; end if;
  update keel_private.private_lessons set revoked=true,revocation=case when kind='receipt' then coalesce(revocation,p_data->>'revocation') else null end where instance=p_instance and owner=p_actor and operation=r.operation and kind in ('copy','receipt');
  select * into r from keel_private.private_lessons where instance=p_instance and recipient=p_actor and id=p_id;
  return to_jsonb(r);
 end if;
 if jsonb_typeof(p_data->'rows')<>'array' or jsonb_array_length(p_data->'rows')<1 or jsonb_array_length(p_data->'rows')>22 then raise exception 'invalid lesson rows'; end if;
 select * into r from keel_private.private_lessons where instance=p_instance and recipient=p_actor and id=p_id;
 if found then
  if r.digest is distinct from p_data->>'digest' or r.kind<>(case when p_operation='preview' then 'preview' else 'receipt' end) then return jsonb_build_object('conflict',true); end if;
  return to_jsonb(r);
 end if;
 n:=jsonb_array_length(p_data->'rows');
 if (select count(*) from keel_private.private_lessons)+n>10000 or (select coalesce(sum(octet_length(value)),0) from keel_private.private_lessons)+octet_length(p_data::text)>104857600 then return jsonb_build_object('capacity',true); end if;
 if (select count(*) from jsonb_array_elements(p_data->'rows') x where x->>'recipient'=p_actor and x->>'id'=p_id and x->>'kind'=case when p_operation='preview' then 'preview' else 'receipt' end)<>1 then raise exception 'missing lesson receipt'; end if;
 for item in select * from jsonb_array_elements(p_data->'rows') loop
  if item->>'operation' is distinct from p_data->>'operation' or item->>'digest' is distinct from p_data->>'digest' or (p_operation='preview' and (n<>1 or item->>'kind'<>'preview' or item->>'recipient'<>p_actor)) or (p_operation='commit' and item->>'kind' not in ('original','copy','receipt')) or (item->>'kind' in ('original','receipt') and item->>'recipient'<>p_actor) then raise exception 'invalid lesson transaction'; end if;
  insert into keel_private.private_lessons(instance,recipient,owner,id,kind,operation,digest,value) values(p_instance,item->>'recipient',p_actor,item->>'id',item->>'kind',item->>'operation',item->>'digest',item->>'value');
 end loop;
 select * into r from keel_private.private_lessons where instance=p_instance and recipient=p_actor and id=p_id;
 return to_jsonb(r);
end;
$$;
revoke all on function public.plates_private_lesson_rpc(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plates_private_lesson_rpc(text,text,text,text,jsonb) to service_role;
commit;
