-- Optional personal funding extension. Applying this migration does not enable
-- the feature, enroll owners, move credentials or grant provider permissions.
begin;
alter table keel_private.connection_credentials add column if not exists funding_metadata jsonb;
alter table keel_private.connection_credentials add column if not exists funding_value text;
alter table keel_private.connection_credentials add column if not exists funding_request text;
alter table keel_private.model_attempts add column if not exists funding jsonb;
-- Preserve the original algorithms once, regardless of the name-transition state.
do $$
declare old_name text; stem text; definition text;
begin
 foreach stem in array array['connection_rpc','model_rpc','model_credential_read'] loop
  if not exists(select 1 from pg_proc where pronamespace='keel_private'::regnamespace and proname=stem||'_v1') then
   old_name:=case when exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='plates_'||stem) then 'plates_'||stem else 'keel_'||stem end;
   select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname=old_name;
   execute replace(definition,'public.'||old_name||'(', 'keel_private.'||stem||'_v1(');
  end if;
 end loop;
end $$;

create or replace function keel_private.funding_key(v jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to('['||(select string_agg(value::text,',' order by ordinality) from jsonb_array_elements(v) with ordinality)||']','UTF8')),'hex')
$$;
create or replace function keel_private.funding_metadata_valid(m jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;x jsonb;
begin
 if jsonb_typeof(m) is distinct from 'object' or not(m ?& array['version','owner','grant','grantVersion','digest','state','connectionVersion','connectionPolicy','broker','pool','expiresAt','evidenceObservedAt','evidenceExpiresAt','projects','models']) or (select count(*) from jsonb_object_keys(m))<>15 or exists(select 1 from jsonb_each(m) where value='null'::jsonb) then return false;end if;
 foreach k in array array['version','owner','grantVersion','connectionVersion'] loop if jsonb_typeof(m->k) is distinct from 'number' or not coalesce((m->>k)~'^[1-9][0-9]{0,15}$',false) then return false;end if;end loop;
 foreach k in array array['grant','digest','connectionPolicy','broker','pool'] loop if jsonb_typeof(m->k) is distinct from 'string' or not coalesce((m->>k)~'^[a-f0-9]{64}$',false) then return false;end if;end loop;
 foreach k in array array['expiresAt','evidenceObservedAt','evidenceExpiresAt'] loop if jsonb_typeof(m->k) is distinct from 'string' or not coalesce((m->>k)~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$',false) then return false;end if;perform (m->>k)::timestamptz;end loop;
 if m->>'version'<>'1' or not coalesce(m->>'state'=any(array['active','revoked']),false) or jsonb_typeof(m->'projects') is distinct from 'array' or jsonb_array_length(m->'projects') not between 1 and 100 or jsonb_typeof(m->'models') is distinct from 'array' or jsonb_array_length(m->'models') not between 1 and 100 then return false;end if;
 for x in select * from jsonb_array_elements(m->'projects') loop if jsonb_typeof(x) is distinct from 'object' or not(x ?& array['project','policy']) or (select count(*) from jsonb_object_keys(x))<>2 or jsonb_typeof(x->'project') is distinct from 'string' or jsonb_typeof(x->'policy') is distinct from 'string' or not coalesce((x->>'project')~'^[a-f0-9]{64}$' and (x->>'policy')~'^[a-f0-9]{64}$',false) then return false;end if;end loop;
 for x in select * from jsonb_array_elements(m->'models') loop if jsonb_typeof(x) is distinct from 'string' or not coalesce((x#>>'{}')~'^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,199}$',false) then return false;end if;end loop;
 return true;
exception when others then return false;
end $$;
create or replace function keel_private.funding_check(c jsonb,p jsonb,a bigint,j text,s text) returns boolean language plpgsql security definer set search_path='' as $$
declare r keel_private.connection_credentials%rowtype; m jsonb; w jsonb; t jsonb; demand bigint; n timestamptz:=clock_timestamp();
begin
 if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(p) is distinct from 'object' or not coalesce(a>0 and j~'^[a-f0-9]{64}$' and s~'^[a-f0-9]{64}$',false) then return false;end if;
 if not(c ?& array['scope','connection','policy','version']) or (select count(*) from jsonb_object_keys(c))<>4 or exists(select 1 from jsonb_each(c) where value='null'::jsonb) then return false;end if;
 if exists(select 1 from unnest(array['version','owner','grantVersion','inputTokens','maxOutputTokens']) k where jsonb_typeof(p->k) is distinct from 'number') then return false;end if;
 select * into r from keel_private.connection_credentials where scope=c->>'scope' and connection=c->>'connection' for share;
 m:=r.funding_metadata;
 if not keel_private.funding_metadata_valid(m) or exists(select 1 from jsonb_each(p) where value='null'::jsonb) then return false;end if;
 if r.state is distinct from 'present' or m is null or r.version<>(c->>'version')::bigint or r.policy<>c->>'policy'
 or not(p ?& array['version','owner','grant','grantVersion','digest','broker','project','modelPolicy','model','inputTokens','maxOutputTokens','windows','label']) or (select count(*) from jsonb_object_keys(p))<>13
 or p->>'version'<>'1' or p->>'owner'<>a::text or m->>'owner'<>a::text or m->>'state'<>'active' or (m->>'expiresAt')::timestamptz<=n
 or (m->>'evidenceObservedAt')::timestamptz>n or (m->>'evidenceObservedAt')::timestamptz<=n-interval '5 minutes' or (m->>'evidenceExpiresAt')::timestamptz<=n or (m->>'evidenceExpiresAt')::timestamptz>(m->>'evidenceObservedAt')::timestamptz+interval '5 minutes'
 or p->>'grant'<>m->>'grant' or p->>'grantVersion'<>m->>'grantVersion' or p->>'digest'<>m->>'digest'
 or p->>'broker'<>s or m->>'broker'<>s or p->>'project'<>j or p->>'label'<>'Personal account'
 or not exists(select 1 from jsonb_array_elements(m->'projects') x where x->>'project'=j and x->>'policy'=p->>'modelPolicy')
 or not(m->'models' ? (p->>'model')) or m->>'connectionVersion'<>r.version::text or m->>'connectionPolicy'<>r.policy
 or not coalesce((p->>'inputTokens')~'^(0|[1-9][0-9]{0,8})$',false) or not coalesce((p->>'maxOutputTokens')~'^[1-9][0-9]{0,8}$',false)
 or jsonb_typeof(p->'windows') is distinct from 'array' or jsonb_array_length(p->'windows') not between 1 and 16 then return false;end if;
 for w in select * from jsonb_array_elements(p->'windows') loop
  if jsonb_typeof(w) is distinct from 'object' or not(w ?& array['tuple','amount','available','observedAt','expiresAt']) or (select count(*) from jsonb_object_keys(w))<>5 or exists(select 1 from jsonb_each(w) where value='null'::jsonb) then return false;end if;
  t:=w->'tuple';
  if jsonb_typeof(t) is distinct from 'array' or jsonb_array_length(t)<>9 or keel_private.funding_key(jsonb_build_array(t->0,t->1,t->2,t->3,t->4))<>m->>'pool'
   or jsonb_typeof(t->0) is distinct from 'string' or jsonb_typeof(t->1) is distinct from 'string' or jsonb_typeof(t->2) is distinct from 'string' or jsonb_typeof(t->4) is distinct from 'string' or jsonb_typeof(t->7) is distinct from 'number' or jsonb_typeof(t->8) is distinct from 'string'
   or t->>0<>'openai' or not coalesce(t->>1=any(array['account','workspace']),false) or (t->>1='account' and t->3 is distinct from 'null'::jsonb) or (t->>1='workspace' and jsonb_typeof(t->3) is distinct from 'string') or t->>5<>'api-rate' or not coalesce(t->>6=any(array['requests','tokens','input-tokens','output-tokens']),false)
   or not coalesce((t->>7)~'^[1-9][0-9]{0,8}$',false) or t->>8<>to_char((t->>8)::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') or (t->>8)::timestamptz<=n
   or (w->>'observedAt')::timestamptz>n or (w->>'observedAt')::timestamptz<=n-interval '5 minutes' or (w->>'expiresAt')::timestamptz<=n
   or (w->>'expiresAt')::timestamptz>(w->>'observedAt')::timestamptz+interval '5 minutes' or (w->>'expiresAt')::timestamptz>(t->>8)::timestamptz
   or jsonb_typeof(w->'amount') is distinct from 'number' or jsonb_typeof(w->'available') is distinct from 'number' or jsonb_typeof(w->'observedAt') is distinct from 'string' or jsonb_typeof(w->'expiresAt') is distinct from 'string'
   or not coalesce((w->>'amount')~'^[1-9][0-9]{0,12}$',false) or not coalesce((w->>'available')~'^(0|[1-9][0-9]{0,12})$',false) then return false;end if;
  demand:=case t->>6 when 'requests' then 1 when 'input-tokens' then (p->>'inputTokens')::bigint when 'output-tokens' then (p->>'maxOutputTokens')::bigint else (p->>'inputTokens')::bigint+(p->>'maxOutputTokens')::bigint end;
  if (w->>'amount')::bigint<>demand then return false;end if;
 end loop;
 if (select count(distinct keel_private.funding_key(x->'tuple')) from jsonb_array_elements(p->'windows') x)<>jsonb_array_length(p->'windows') then return false;end if;
 return true;
exception when others then return false;
end $$;

create or replace function keel_private.funding_recovery_check(c jsonb,ref jsonb,a bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare r keel_private.connection_credentials%rowtype;t keel_private.model_attempts%rowtype;m jsonb;n timestamptz:=clock_timestamp();
begin
 if jsonb_typeof(ref) is distinct from 'object' or not(ref ?& array['attemptId','attemptScope']) or (select count(*) from jsonb_object_keys(ref))<>2 or not coalesce((ref->>'attemptId')~'^[a-f0-9]{64}$' and (ref->>'attemptScope')~'^[a-f0-9]{64}$' and a>0,false) then return false;end if;
 select * into r from keel_private.connection_credentials where scope=c->>'scope' and connection=c->>'connection' for share;
 select * into t from keel_private.model_attempts where scope=ref->>'attemptScope' and id=ref->>'attemptId' and actor=a;
 m:=r.funding_metadata;
 if not keel_private.funding_metadata_valid(m) or t.funding is null or t.response_id is null or t.state in('reserved','refused') or t.credential is distinct from c
 or r.state is distinct from 'present' or r.version<>(c->>'version')::bigint or r.policy<>c->>'policy' or m->>'owner'<>a::text or m->>'broker'<>t.scope or m->>'state'<>'active' or (m->>'expiresAt')::timestamptz<=n
 or (m->>'evidenceObservedAt')::timestamptz>n or (m->>'evidenceObservedAt')::timestamptz<=n-interval '5 minutes' or (m->>'evidenceExpiresAt')::timestamptz<=n or (m->>'evidenceExpiresAt')::timestamptz>(m->>'evidenceObservedAt')::timestamptz+interval '5 minutes'
 or m->>'connectionVersion'<>r.version::text or m->>'connectionPolicy'<>r.policy or not(m->'models' ? (t.funding->>'model'))
 or not exists(select 1 from jsonb_array_elements(m->'projects') x where x->>'project'=t.project)
 or exists(select 1 from jsonb_array_elements(t.funding->'windows') w where keel_private.funding_key(jsonb_build_array(w->'tuple'->0,w->'tuple'->1,w->'tuple'->2,w->'tuple'->3,w->'tuple'->4))<>m->>'pool') then return false;end if;
 return true;
exception when others then return false;
end $$;
create or replace function keel_private.personal_connection_rpc(p_operation text,p_scope text,p_connection text,p_expected bigint default null,p_policy text default null,p_request text default null,p_actor bigint default null,p_value text default null,p_health jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r keel_private.connection_credentials%rowtype;m jsonb;out_value jsonb;
begin
 if p_operation not in('personal-put','funding-read','funding-update','personal-key','personal-recovery-key') then
  if exists(select 1 from keel_private.connection_credentials where scope=p_scope and connection=p_connection and funding_metadata is not null) then
   if p_operation='metadata' then return null;end if;return jsonb_build_object('conflict',true);
  end if;
  return keel_private.connection_rpc_v1(p_operation,p_scope,p_connection,p_expected,p_policy,p_request,p_actor,p_value,p_health);
 end if;
 if not coalesce(p_scope~'^[a-f0-9]{64}$' and p_connection~'^[a-f0-9]{64}$' and p_actor>0,false) then raise exception 'invalid personal connection';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope,103));
 select * into r from keel_private.connection_credentials where scope=p_scope and connection=p_connection for update;
 if r.connection is not null and (r.funding_metadata is null or r.funding_metadata->>'owner'<>p_actor::text) then return jsonb_build_object('conflict',true);end if;
 if p_operation='personal-recovery-key' then
  if not keel_private.funding_recovery_check(jsonb_build_object('scope',p_scope,'connection',p_connection,'policy',p_policy,'version',p_expected),p_health,p_actor) then return jsonb_build_object('conflict',true);end if;
  return jsonb_build_object('version',r.version,'policy',r.policy,'value',r.value);
 elsif p_operation='personal-key' then
  if not keel_private.funding_check(jsonb_build_object('scope',p_scope,'connection',p_connection,'policy',p_policy,'version',p_expected),p_health,p_actor,p_health->>'project',p_health->>'broker') then return jsonb_build_object('conflict',true);end if;
  return jsonb_build_object('version',r.version,'policy',r.policy,'value',r.value);
 elsif p_operation in('personal-put','funding-update') then
  if p_request is null or p_request!~'^[a-f0-9]{64}$' or p_value is null or octet_length(p_value) not between 20 and 65536 or p_health is null or not(p_health ?& array['metadata','binding'])
   or (select count(*) from jsonb_object_keys(p_health))<>(case when p_operation='personal-put' then 3 else 2 end) or p_health->>'binding' is null or octet_length(p_health->>'binding') not between 20 and 65536 then raise exception 'invalid personal binding';end if;
  m:=p_health->'metadata';
  if not keel_private.funding_metadata_valid(m) then raise exception 'invalid personal metadata';end if;
  if jsonb_typeof(m) is distinct from 'object' or not(m ?& array['version','owner','grant','grantVersion','digest','state','connectionVersion','connectionPolicy','broker','pool','expiresAt','evidenceObservedAt','evidenceExpiresAt','projects','models']) or (select count(*) from jsonb_object_keys(m))<>15
   or m->>'version'<>'1' or m->>'owner'<>p_actor::text or not coalesce((m->>'grant')~'^[a-f0-9]{64}$' and (m->>'digest')~'^[a-f0-9]{64}$' and (m->>'broker')~'^[a-f0-9]{64}$' and (m->>'pool')~'^[a-f0-9]{64}$',false)
   or not coalesce((m->>'grantVersion')~'^[1-9][0-9]{0,8}$',false) or m->>'connectionPolicy'<>p_policy or not coalesce(m->>'state'=any(array['active','revoked']),false)
   or jsonb_typeof(m->'projects') is distinct from 'array' or jsonb_array_length(m->'projects') not between 1 and 100 or jsonb_typeof(m->'models') is distinct from 'array' or jsonb_array_length(m->'models') not between 1 and 100 then raise exception 'invalid personal metadata';end if;
  if r.funding_request=p_request then
   if r.funding_metadata->>'digest'<>m->>'digest' then return jsonb_build_object('conflict',true);end if;
  elsif p_operation='personal-put' then
   if r.connection is not null or p_expected<>0 or m->>'connectionVersion'<>'1' or m->>'grantVersion'<>'1' or m->>'state'<>'active' then return jsonb_build_object('conflict',true);end if;
   out_value:=keel_private.connection_rpc_v1('put',p_scope,p_connection,0,p_policy,p_request,p_actor,p_value,p_health->'health');
   if out_value ? 'conflict' then return out_value;end if;
   update keel_private.connection_credentials set funding_metadata=m,funding_value=p_health->>'binding',funding_request=p_request where scope=p_scope and connection=p_connection;
  else
   if r.connection is null or r.version<>p_expected or r.policy<>p_policy or m->>'connectionVersion'<>r.version::text or m->>'grant'<>r.funding_metadata->>'grant' or (m->>'grantVersion')::bigint<>(r.funding_metadata->>'grantVersion')::bigint+1 then return jsonb_build_object('conflict',true);end if;
   update keel_private.connection_credentials set funding_metadata=m,funding_value=p_health->>'binding',funding_request=p_request where scope=p_scope and connection=p_connection;
  end if;
  select * into r from keel_private.connection_credentials where scope=p_scope and connection=p_connection;
 end if;
 if r.connection is null then return null;end if;
 return jsonb_build_object('version',r.version,'state',r.state,'policy',r.policy,'request',r.funding_request,'fundingMetadata',r.funding_metadata,'binding',r.funding_value);
end $$;

create or replace function keel_private.personal_attempt_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare pin jsonb;personal boolean;
begin
 select funding_metadata is not null into personal from keel_private.connection_credentials where scope=new.credential->>'scope' and connection=new.credential->>'connection';
 if tg_op='INSERT' and personal then
  begin pin:=current_setting('plates.personal_funding',true)::jsonb;exception when others then pin:=null;end;
  if not keel_private.funding_check(new.credential,pin,new.actor,new.project,new.scope) then raise exception 'personal funding required';end if;
  new.funding:=pin;
 elsif tg_op='UPDATE' then
  if old.funding is distinct from new.funding then raise exception 'immutable funding binding';end if;
  if old.state='reserved' and new.state='sending' and (personal or old.funding is not null) and not keel_private.funding_check(new.credential,new.funding,new.actor,new.project,new.scope) then raise exception 'personal funding changed';end if;
 end if;
 return new;
end $$;
drop trigger if exists personal_attempt_guard on keel_private.model_attempts;
create trigger personal_attempt_guard before insert or update on keel_private.model_attempts for each row execute function keel_private.personal_attempt_guard();

create or replace function keel_private.personal_model_rpc(p_operation text,p_scope text,p_id text,p_actor bigint,p_project text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;w jsonb;windows jsonb;result jsonb;r keel_private.model_attempts%rowtype;
begin
 if p_operation='reserve' and p_data ? 'funding' then
  p:=p_data->'funding';
  select * into r from keel_private.model_attempts where scope=p_scope and id=p_id;
  if r.id is not null then
   if r.funding is distinct from p then return jsonb_build_object('conflict','funding');end if;
  elsif not keel_private.funding_check(p_data->'credential',p,p_actor,p_project,p_scope) then return jsonb_build_object('conflict','funding');end if;
  select jsonb_agg(jsonb_build_object('pool',keel_private.funding_key(x->'tuple'),'amount',x->'amount','available',x->'available','expiresAt',x->'expiresAt')) into windows from jsonb_array_elements(p->'windows')x;
  if p_data->'windows' is distinct from windows then return jsonb_build_object('conflict','funding');end if;
  perform set_config('plates.personal_funding',p::text,true);
  result:=keel_private.model_rpc_v1(p_operation,p_scope,p_id,p_actor,p_project,p_data-'funding');
  perform set_config('plates.personal_funding','',true);return result;
 elsif p_operation='begin' then
  select * into r from keel_private.model_attempts where scope=p_scope and id=p_id;
  if r.funding is not null and r.state='reserved' and not keel_private.funding_check(r.credential,r.funding,p_actor,p_project,p_scope) then return jsonb_build_object('conflict','funding');end if;
 end if;
 return keel_private.model_rpc_v1(p_operation,p_scope,p_id,p_actor,p_project,p_data);
end $$;
create or replace function keel_private.personal_credential_read(p_scope text,p_connection text,p_policy text,p_expected bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from keel_private.connection_credentials where scope=p_scope and connection=p_connection and funding_metadata is not null) then return jsonb_build_object('conflict',true);end if;
 return keel_private.model_credential_read_v1(p_scope,p_connection,p_policy,p_expected);
end $$;
-- Replace only the active public implementation. Existing legacy forwarders stay.
do $$
declare active_name text;prefix text;
begin
 prefix:=case when exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='plates_connection_rpc') then 'plates_' else 'keel_' end;
 execute 'create or replace function public.'||prefix||'connection_rpc(p_operation text,p_scope text,p_connection text,p_expected bigint default null,p_policy text default null,p_request text default null,p_actor bigint default null,p_value text default null,p_health jsonb default null) returns jsonb language sql security definer set search_path='''' as $fn$ select keel_private.personal_connection_rpc(p_operation,p_scope,p_connection,p_expected,p_policy,p_request,p_actor,p_value,p_health) $fn$';
 execute 'create or replace function public.'||prefix||'model_rpc(p_operation text,p_scope text,p_id text,p_actor bigint,p_project text,p_data jsonb) returns jsonb language sql security definer set search_path='''' as $fn$ select keel_private.personal_model_rpc(p_operation,p_scope,p_id,p_actor,p_project,p_data) $fn$';
 execute 'create or replace function public.'||prefix||'model_credential_read(p_scope text,p_connection text,p_policy text,p_expected bigint) returns jsonb language sql security definer set search_path='''' as $fn$ select keel_private.personal_credential_read(p_scope,p_connection,p_policy,p_expected) $fn$';
end $$;
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='keel_private'::regnamespace and proname=any(array['connection_rpc_v1','model_rpc_v1','model_credential_read_v1','funding_key','funding_metadata_valid','funding_check','funding_recovery_check','personal_connection_rpc','personal_attempt_guard','personal_model_rpc','personal_credential_read']) loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';end loop;end $$;
commit;
