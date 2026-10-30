// Source-schema compatibility: Codex CLI 0.164.0, offline generated
// v2/GetAccountResponse, GetAccountRateLimitsResponse and nullable params.
// This is not a live verification, account enrollment or entitlement discovery.
import { createHash } from 'node:crypto';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,199}$/.test(v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fresh=(checked,expires,now)=>iso(checked)&&iso(expires)&&Date.parse(checked)<=now&&now-Date.parse(checked)<300000&&Date.parse(expires)>now&&Date.parse(expires)-Date.parse(checked)<=300000;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const CODEX_CAPACITY_SCHEMA='0.164.0';
export function codexUsageSnapshot(account,response,{actorId,hostId,expectedAccountId,observedAt,expiresAt}) {
  if(!object(account)||typeof account.requiresOpenaiAuth!=='boolean'||!object(response)||!object(response.rateLimits))throw Error('codex_protocol_invalid');
  const gaps=new Set(),at=Date.parse(observedAt),type=account.account?.type??null;
  if(![null,'apiKey','chatgpt','amazonBedrock'].includes(type))throw Error('codex_protocol_invalid');
  if(type!=='chatgpt')gaps.add('subscription_account_unavailable');
  const accountId=id(response.accountId)?response.accountId:null;
  if(!accountId||accountId!==expectedAccountId)gaps.add('account_identity_unavailable');
  if(!accountId||accountId!==expectedAccountId)return {schema:1,sourceVersion:CODEX_CAPACITY_SCHEMA,compatibility:'source-schema-only',scope:{actorId,hostId,expectedAccountId},observedAt,expiresAt,accountType:type,accountId:null,ordinaryUsageAllowed:null,buckets:[],gaps:[...gaps].sort()};
  if(response.ordinaryUsageAllowed!==undefined&&response.ordinaryUsageAllowed!==null&&typeof response.ordinaryUsageAllowed!=='boolean')throw Error('codex_protocol_invalid');
  const allowed=response.ordinaryUsageAllowed??null;
  if(allowed!==true)gaps.add(allowed===false?'ordinary_usage_blocked':'ordinary_usage_unknown');
  const multiple=response.rateLimitsByLimitId;
  if(multiple!==null&&multiple!==undefined&&!object(multiple))throw Error('codex_protocol_invalid');
  const entries=multiple===null||multiple===undefined?[[response.rateLimits.limitId??null,response.rateLimits]]:Object.entries(multiple);
  if(entries.length>30)throw Error('codex_protocol_limit');
  const window=value=>{
    if(value===null||value===undefined)return null;
    if(!object(value)||!Number.isInteger(value.usedPercent)||value.usedPercent<0||value.usedPercent>100)throw Error('codex_protocol_invalid');
    const duration=Number.isSafeInteger(value.windowDurationMins)&&value.windowDurationMins>0?value.windowDurationMins:null;
    const reset=Number.isSafeInteger(value.resetsAt)&&value.resetsAt>0&&value.resetsAt<=8640000000000?new Date(value.resetsAt*1000).toISOString():null;
    if(!duration||!reset||Date.parse(reset)<=at)gaps.add('quota_window_unavailable');
    return {usedPercent:value.usedPercent,durationMinutes:duration,resetAt:reset};
  };
  const buckets=entries.map(([key,value])=>{
    if(!object(value)||key!==null&&!id(key)||value.limitId!=null&&value.limitId!==key)throw Error('codex_protocol_invalid');
    if(key===null)gaps.add('quota_pool_unavailable');
    if(value.spendControlReached!=null&&typeof value.spendControlReached!=='boolean')throw Error('codex_protocol_invalid');
    const reached=value.rateLimitReachedType??null;
    if(reached!==null&&!['rate_limit_reached','workspace_owner_credits_depleted','workspace_member_credits_depleted','workspace_owner_usage_limit_reached','workspace_member_usage_limit_reached'].includes(reached))throw Error('codex_protocol_invalid');
    const primary=window(value.primary),secondary=window(value.secondary);
    if(!primary&&!secondary)gaps.add('quota_window_unavailable');
    if(value.spendControlReached===true||reached!==null)gaps.add('quota_backend_blocked');
    return {limitId:key,modelAlias:id(value.normalModelSlug)?value.normalModelSlug:null,primary,secondary,spendControlReached:value.spendControlReached??null,rateLimitReachedType:reached};
  });
  if(!buckets.length)gaps.add('quota_pool_unavailable');
  // Email, codexHome, plan labels, reset credits and upsell payloads are discarded.
  return {schema:1,sourceVersion:CODEX_CAPACITY_SCHEMA,compatibility:'source-schema-only',scope:{actorId,hostId,expectedAccountId},observedAt,expiresAt,accountType:type,accountId,ordinaryUsageAllowed:allowed,buckets,gaps:[...gaps].sort()};
}

/** Binding comes only from a trusted authenticated service. This pure mapper
 * cannot authenticate supplied JSON. A limit id/model alias is never entitlement. */
export function bindCodexCapacity(raw,binding,{now=Date.now()}={}) {
  const unavailable=code=>({observations:[],gaps:[code]});
  if(!exact(binding,['actorId','hostId','expectedAccountId','sourceId','checkedAt','expiresAt','pools'])||![binding.actorId,binding.hostId,binding.expectedAccountId,binding.sourceId].every(id)||!fresh(binding.checkedAt,binding.expiresAt,now)||!Array.isArray(binding.pools)||binding.pools.length<1||binding.pools.length>30)return unavailable('capacity_binding_unavailable');
  if(raw?.schema!==1||raw.sourceVersion!==CODEX_CAPACITY_SCHEMA||raw.accountType!=='chatgpt'||raw.ordinaryUsageAllowed!==true||raw.accountId!==binding.expectedAccountId||!['actorId','hostId','expectedAccountId'].every(k=>raw.scope?.[k]===binding[k])||!fresh(raw.observedAt,raw.expiresAt,now)||!Array.isArray(raw.buckets)||raw.buckets.length>30||!Array.isArray(raw.gaps)||raw.gaps.length)return unavailable('capacity_snapshot_unavailable');
  const seen=new Set(),observations=[];
  for(const pool of binding.pools) {
    if(!exact(pool,['limitId','poolId','models','windows'])||![pool.limitId,pool.poolId].every(id)||seen.has(pool.limitId)||!Array.isArray(pool.models)||!pool.models.length||pool.models.length>100||!pool.models.every(id)||new Set(pool.models).size!==pool.models.length||!Array.isArray(pool.windows)||!pool.windows.length||pool.windows.length>2)return unavailable('capacity_binding_unavailable');
    seen.add(pool.limitId);
    const matches=raw.buckets.filter(b=>b.limitId===pool.limitId);if(matches.length!==1)return unavailable('capacity_pool_unavailable');
    const bucket=matches[0],slots=new Set();
    if(bucket.spendControlReached===true||bucket.rateLimitReachedType!==null)return unavailable('quota_backend_blocked');
    for(const expected of pool.windows) {
      if(!exact(expected,['slot','durationMinutes'])||!['primary','secondary'].includes(expected.slot)||slots.has(expected.slot)||!Number.isSafeInteger(expected.durationMinutes)||expected.durationMinutes<=0)return unavailable('capacity_binding_unavailable');
      slots.add(expected.slot);const window=bucket[expected.slot];
      if(!window||window.durationMinutes!==expected.durationMinutes||!Number.isInteger(window.usedPercent)||window.usedPercent<0||window.usedPercent>100||!iso(window.resetAt)||Date.parse(window.resetAt)<=now)return unavailable('quota_window_unavailable');
      observations.push({provider:'codex',identity:{account:binding.expectedAccountId,workspace:null,scope:'account',provenance:'authenticated-reporter'},pool:{id:pool.poolId,provenance:'authenticated-reporter'},kind:'subscription',unit:'percent',models:{ids:[...pool.models],provenance:'authenticated-reporter'},measurement:{used:window.usedPercent,remaining:100-window.usedPercent,limit:100},window:{durationMinutes:window.durationMinutes,resetAt:window.resetAt},observedAt:raw.observedAt,expiresAt:new Date(Math.min(Date.parse(raw.expiresAt),Date.parse(binding.expiresAt),Date.parse(window.resetAt))).toISOString(),source:{kind:'local-reporter',id:hash([binding.sourceId,pool.limitId,expected.slot])},confidence:'observed',nonAdditive:false});
    }
    if(['primary','secondary'].some(slot=>bucket[slot]&&!slots.has(slot)))return unavailable('quota_window_coverage_unverified');
  }
  // Unmapped buckets may constrain the same model; no optimistic omission.
  if(raw.buckets.some(b=>!seen.has(b.limitId)))return unavailable('quota_pool_coverage_unverified');
  return {observations,gaps:[]};
}
