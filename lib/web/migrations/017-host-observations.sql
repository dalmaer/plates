-- Additive dormant observation bridge. Requires separate explicit deployment review.
begin;
create schema if not exists keel_private;
create table if not exists keel_private.host_observation_grants (
 instance text not null check(instance ~ '^[a-f0-9]{64}$'),
 id text not null check(id ~ '^[a-f0-9]{64}$'),
 actor text not null check(actor ~ '^[a-f0-9]{64}$'),
 digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value)<=30000),
 state text not null default 'preview' check(state in ('preview','active','revoked')),
 expires_at timestamptz not null,
 preview_expires_at timestamptz not null,
 last_sequence integer not null default 0 check(last_sequence>=0),
 last_digest text check(last_digest ~ '^[a-f0-9]{64}$'),
 primary key(instance,id), unique(instance,token_hash)
);
create table if not exists keel_private.host_observation_reports (
 instance text not null, grant_id text not null, project text not null check(project ~ '^[a-f0-9]{64}$'),
 sequence integer not null check(sequence>0), digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 value text not null check(octet_length(value)<=400000), expires_at timestamptz not null,
 primary key(instance,grant_id,project),
 foreign key(instance,grant_id) references keel_private.host_observation_grants(instance,id)
);
alter table keel_private.host_observation_grants enable row level security;
alter table keel_private.host_observation_reports enable row level security;
revoke all on keel_private.host_observation_grants,keel_private.host_observation_reports from public,anon,authenticated,service_role;
create or replace function public.plates_host_observation_rpc(p_operation text,p_instance text,p_actor text,p_id text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,keel_private as $$
declare g keel_private.host_observation_grants; rows jsonb; instant timestamptz:=clock_timestamp(); seq integer;
begin
 if p_instance is null or p_instance !~ '^[a-f0-9]{64}$' or p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_id is null or p_id !~ '^[a-f0-9]{64}$' or p_operation not in ('preview','apply','revoke','read','token','report','list') then raise exception 'invalid host request'; end if;
 if p_operation='list' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rows from (
   select to_jsonb(a) as grant, to_jsonb(r) as report from keel_private.host_observation_grants a
   join keel_private.host_observation_reports r on r.instance=a.instance and r.grant_id=a.id
   where a.instance=p_instance and a.actor=p_actor and a.state='active' and a.expires_at>instant and r.project=p_id and r.expires_at>instant order by a.id limit 21
  ) x;
  return jsonb_build_object('rows',rows);
 end if;
 if p_operation in ('preview','apply','revoke','report') then perform pg_advisory_xact_lock(21259,17); end if;
 if p_operation='token' then
  select * into g from keel_private.host_observation_grants where instance=p_instance and token_hash=p_id and state='active' and expires_at>instant;
  return case when found then to_jsonb(g) else null end;
 end if;
 select * into g from keel_private.host_observation_grants where instance=p_instance and id=p_id and actor=p_actor;
 if p_operation='read' then return case when found then to_jsonb(g) else null end; end if;
 if p_operation='preview' then
  if found then
   if g.digest is distinct from p_data->>'digest' then return jsonb_build_object('conflict',true); end if;
   return to_jsonb(g);
  end if;
  if (p_data->>'expiresAt')::timestamptz<=instant or (p_data->>'expiresAt')::timestamptz>instant+interval '24 hours' or (p_data->>'previewExpiresAt')::timestamptz<=instant or (p_data->>'previewExpiresAt')::timestamptz>instant+interval '10 minutes' then raise exception 'invalid host expiry'; end if;
  if (select count(*) from keel_private.host_observation_grants)>=1000 or (select count(*) from keel_private.host_observation_grants where instance=p_instance and actor=p_actor and state<>'revoked' and expires_at>instant)>=20 then return jsonb_build_object('capacity',true); end if;
  insert into keel_private.host_observation_grants(instance,id,actor,digest,token_hash,value,expires_at,preview_expires_at) values(p_instance,p_id,p_actor,p_data->>'digest',p_data->>'tokenHash',p_data->>'value',(p_data->>'expiresAt')::timestamptz,(p_data->>'previewExpiresAt')::timestamptz) returning * into g;
  return to_jsonb(g);
 end if;
 if not found or g.digest is distinct from p_data->>'grantDigest' then return jsonb_build_object('conflict',true); end if;
 if p_operation='revoke' then
  update keel_private.host_observation_grants set state='revoked' where instance=p_instance and id=p_id returning * into g;
  return to_jsonb(g);
 end if;
 if g.state='revoked' or g.expires_at<=instant then return jsonb_build_object('conflict',true); end if;
 if p_operation='apply' then
  if g.state='preview' and g.preview_expires_at<=instant then return jsonb_build_object('conflict',true); end if;
  update keel_private.host_observation_grants set state='active' where instance=p_instance and id=p_id returning * into g;
  return to_jsonb(g);
 end if;
 if g.state<>'active' or g.token_hash is distinct from p_data->>'tokenHash' then return jsonb_build_object('conflict',true); end if;
 seq:=(p_data->>'sequence')::integer;
 if seq=g.last_sequence and g.last_digest=p_data->>'digest' then return jsonb_build_object('sequence',seq,'digest',g.last_digest,'replayed',true); end if;
 if seq is null or seq<>g.last_sequence+1 or p_data->>'digest' is null or p_data->>'digest' !~ '^[a-f0-9]{64}$' then return jsonb_build_object('conflict',true); end if;
 if (p_data->>'expiresAt')::timestamptz<=instant or (p_data->>'expiresAt')::timestamptz>instant+interval '5 minutes' then return jsonb_build_object('conflict',true); end if;
 if (select coalesce(sum(octet_length(value)),0) from keel_private.host_observation_reports)+octet_length(p_data->>'value')>104857600 then return jsonb_build_object('capacity',true); end if;
 insert into keel_private.host_observation_reports(instance,grant_id,project,sequence,digest,value,expires_at) values(p_instance,p_id,p_data->>'project',seq,p_data->>'digest',p_data->>'value',(p_data->>'expiresAt')::timestamptz)
 on conflict(instance,grant_id,project) do update set sequence=excluded.sequence,digest=excluded.digest,value=excluded.value,expires_at=excluded.expires_at;
 update keel_private.host_observation_grants set last_sequence=seq,last_digest=p_data->>'digest' where instance=p_instance and id=p_id;
 return jsonb_build_object('sequence',seq,'digest',p_data->>'digest','replayed',false);
end;
$$;
revoke all on function public.plates_host_observation_rpc(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.plates_host_observation_rpc(text,text,text,text,jsonb) to service_role;
commit;
