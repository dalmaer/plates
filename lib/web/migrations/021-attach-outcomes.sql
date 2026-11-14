-- Phase 181: definitive pre-ref refusal; historical 020 remains unchanged.
-- Source only. Apply after 014 with separate owner approval; no provider wiring.
begin;
do $migration$
begin
 perform pg_advisory_xact_lock(hashtextextended('keel-job-migrations',107));
 if to_regprocedure('public.plates_decision_rpc(text,text,text,text,text,text,text)') is null then
  raise exception 'apply 014-plates-names.sql first';
 end if;
 if (select prosrc from pg_proc where oid=to_regprocedure('public.keel_decision_rpc(text,text,text,text,text,text,text)'))
  is distinct from 'SELECT public.plates_decision_rpc($1, $2, $3, $4, $5, $6, $7)' then
  raise exception 'keel_decision_rpc is not the 014 forwarder';
 end if;
 if not exists(select 1 from information_schema.columns where table_schema='keel_private' and table_name='decision_operations' and column_name='attach_observations') then
  raise exception 'apply 020-attach-operation-stages.sql first';
 end if;
end;
$migration$;
alter table keel_private.decision_operations drop constraint decision_operations_attach_stage_check;
alter table keel_private.decision_operations add constraint decision_operations_attach_stage_check
 check(attach_stage in('ready','mint-started','mint-recorded','mint-uncertain','commit-started','commit-recorded','commit-uncertain','ref-started','ref-recorded','ref-uncertain','ref-declined'));
alter table keel_private.decision_operations drop constraint decision_operations_attach_observations_check;
alter table keel_private.decision_operations add constraint decision_operations_attach_observations_check
 check(jsonb_typeof(attach_observations)='object' and octet_length(attach_observations::text)<=65536
  and attach_observations - array['ready','mint-recorded','mint-uncertain','commit-recorded','commit-uncertain','ref-recorded','ref-uncertain','ref-declined']='{}'::jsonb);
create or replace function public.plates_decision_rpc(p_operation text,p_id text,p_scope text,p_project text default null,p_preview text default null,p_fence text default null,p_value text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r keel_private.decision_operations; preview_row keel_private.decision_previews; now_at timestamptz:=clock_timestamp(); created boolean:=false; changed boolean:=false; granted boolean:=false; expected_stage text; next_stage text;
begin
 if p_id is null or p_id!~'^[a-f0-9]{64}$' or p_scope is null or p_scope!~'^[a-f0-9]{64}$'
 or (p_project is not null and p_project!~'^[a-f0-9]{64}$') or (p_preview is not null and p_preview!~'^[a-f0-9]{64}$')
 or (p_fence is not null and p_fence!~'^[a-f0-9]{64}$') or (p_value is not null and octet_length(p_value)>1048576) then raise exception 'invalid decision input'; end if;
 if p_operation like 'attach-%' then
  if p_project is null or p_preview is null or p_fence is null
   or (p_operation in('attach-read','attach-mint-begin','attach-commit-begin','attach-ref-begin') and p_value is not null)
   or (p_operation not in('attach-read','attach-mint-begin','attach-commit-begin','attach-ref-begin') and p_value is null)
   or (p_operation<>'attach-reserve' and octet_length(p_value)>8192) then raise exception 'invalid attach input'; end if;
 end if;
 if p_operation='preview-create' then
  perform pg_catalog.pg_advisory_xact_lock(21259,7);
  delete from keel_private.decision_previews where id in(select id from keel_private.decision_previews p where expires_at<=now_at and not exists(select 1 from keel_private.decision_operations o where o.preview=p.id) limit 100);
  if (select count(*) from keel_private.decision_previews)>=10000 then raise exception 'preview capacity'; end if;
  insert into keel_private.decision_previews(id,scope,value) values(p_id,p_scope,p_value) on conflict do nothing returning * into preview_row;
  if not found then return null; end if;
  return jsonb_build_object('value',preview_row.value);
 elsif p_operation='preview-read' then
  select * into preview_row from keel_private.decision_previews where id=p_id and scope=p_scope and expires_at>now_at;
  if not found then return null; end if;
  return jsonb_build_object('value',preview_row.value);
 elsif p_operation in('reserve','attach-reserve') then
  perform pg_catalog.pg_advisory_xact_lock(21259,8);
  select * into r from keel_private.decision_operations where preview=p_preview and scope=p_scope;
  if found then
   if p_operation='reserve' then
    if r.attach_stage is not null then return null; end if;
    return jsonb_build_object('id',r.id,'state',r.state,'value',r.value,'created',false,'leaseUntil',r.lease_until);
   end if;
   if r.attach_stage is null or r.id<>p_id or r.project<>p_project or r.fence<>p_fence then return null; end if;
  else
  if p_project is null or p_fence is null or not exists(select 1 from keel_private.decision_previews where id=p_preview and scope=p_scope and expires_at>now_at) then return null; end if;
  -- Expiry can free only an intent which was never dispatched. Dispatched/uncertain reservations persist.
  update keel_private.decision_operations set state='refused' where project=p_project and state='prepared' and lease_until<=now_at;
  if exists(select 1 from keel_private.decision_operations where project=p_project and state in('prepared','dispatched','uncertain')) then return jsonb_build_object('conflict',true); end if;
  if(select count(*) from keel_private.decision_operations)>=5000 then raise exception 'operation capacity'; end if;
  insert into keel_private.decision_operations(id,scope,project,preview,fence,state,value) values(p_id,p_scope,p_project,p_preview,p_fence,'prepared',p_value) returning * into r;
  created:=true; changed:=true;
  if p_operation='attach-reserve' then
   update keel_private.decision_operations set attach_stage='ready' where id=p_id returning * into r;
  end if;
  end if;
 elsif p_operation like 'attach-%' then
  if p_operation='attach-read' then
   select * into r from keel_private.decision_operations where id=p_id and scope=p_scope and project=p_project and preview=p_preview and fence=p_fence and attach_stage is not null;
  else
   expected_stage:=case p_operation
    when 'attach-mint-begin' then 'ready'
    when 'attach-mint-record' then 'mint-started' when 'attach-mint-uncertain' then 'mint-started'
    when 'attach-commit-begin' then 'mint-recorded'
    when 'attach-commit-record' then 'commit-started' when 'attach-commit-uncertain' then 'commit-started'
    when 'attach-commit-reconcile' then 'commit-uncertain'
    when 'attach-ref-begin' then 'commit-recorded'
    when 'attach-ref-record' then 'ref-started' when 'attach-ref-uncertain' then 'ref-started'
    when 'attach-ref-reconcile' then 'ref-uncertain'
    when 'attach-ref-decline' then 'commit-recorded'
    when 'attach-refuse' then 'ready' end;
   next_stage:=case p_operation
    when 'attach-mint-begin' then 'mint-started'
    when 'attach-mint-record' then 'mint-recorded' when 'attach-mint-uncertain' then 'mint-uncertain'
    when 'attach-commit-begin' then 'commit-started'
    when 'attach-commit-record' then 'commit-recorded' when 'attach-commit-uncertain' then 'commit-uncertain'
    when 'attach-commit-reconcile' then 'commit-recorded'
    when 'attach-ref-begin' then 'ref-started'
    when 'attach-ref-record' then 'ref-recorded' when 'attach-ref-uncertain' then 'ref-uncertain'
    when 'attach-ref-reconcile' then 'ref-recorded'
    when 'attach-ref-decline' then 'ref-declined'
    when 'attach-refuse' then 'ready' end;
   if expected_stage is null then raise exception 'unsupported attach operation'; end if;
   update keel_private.decision_operations set attach_stage=next_stage,
    state=case when p_operation in('attach-refuse','attach-ref-decline') then 'refused' when next_stage='ref-recorded' then 'committed'
      when next_stage like '%-uncertain' then 'uncertain' else 'dispatched' end,
    attach_observations=case when p_value is null then attach_observations else attach_observations||jsonb_build_object(next_stage,p_value) end
    where id=p_id and scope=p_scope and project=p_project and preview=p_preview and fence=p_fence
     and attach_stage=expected_stage and (p_value is null or not attach_observations ? next_stage) and state in('prepared','dispatched','uncertain')
     and (expected_stage<>'ready' or p_operation='attach-refuse' or lease_until>now_at)
    returning * into r;
   changed:=found;
   granted:=changed and p_operation in('attach-mint-begin','attach-commit-begin','attach-ref-begin');
  end if;
 elsif p_operation='read' then
  select * into r from keel_private.decision_operations where id=p_id and scope=p_scope;
 elsif p_operation='dispatched' then
  update keel_private.decision_operations set state='dispatched' where id=p_id and scope=p_scope and fence=p_fence and attach_stage is null and state='prepared' and lease_until>now_at returning * into r;
 elsif p_operation in('uncertain','committed','refused') then
  update keel_private.decision_operations set state=p_operation,value=p_value where id=p_id and scope=p_scope and fence=p_fence
   and attach_stage is null and (state in('dispatched','uncertain') or (state='prepared' and p_operation='refused')) returning * into r;
 else raise exception 'unsupported decision operation'; end if;
 if r.id is null then return null; end if;
 if p_operation like 'attach-%' then
  return jsonb_build_object('id',r.id,'scope',r.scope,'project',r.project,'previewId',r.preview,'fence',r.fence,
   'state',r.state,'value',r.value,'leaseUntil',r.lease_until,'stage',r.attach_stage,
   'observations',r.attach_observations,'created',created,'changed',changed,'granted',granted);
 end if;
 return jsonb_build_object('id',r.id,'state',r.state,'value',r.value,'created',created,'leaseUntil',r.lease_until);
end;
$$;
revoke all on function public.plates_decision_rpc(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.plates_decision_rpc(text,text,text,text,text,text,text) to service_role;
commit;
