// Enrolled observers may submit metadata only. No execution or provider authority.
import { exact, equal, hash, numeric, opaque, random, WebError } from './common.mjs';
import { authEpoch, featureRestoreReady, recoveryQuarantined } from './recovery.mjs';
import { createHostObservationStore } from './host-observation-store.mjs';
import { hex, iso, hostDigest, validateHostEnrollment, validateHostReport, hostReportObservation } from './host-observation-model.mjs';
export function hostObservationsEnabled(config,now=Date.now()) {
  const f=config.hostObservations;
  return f?.enabled===true&&!recoveryQuarantined(config)&&iso(f.verifiedAt)&&Date.parse(f.verifiedAt)<=now
    &&iso(f.restoreReconciledAt)&&Date.parse(f.restoreReconciledAt)<=now&&featureRestoreReady(config,f.restoreReconciledAt,now);
}
const fail=(code,status=409)=>{throw new WebError(code,status);};
const publicGrant=g=>Object.fromEntries(['version','id','hostId','actorId','workspaceId','workspaceRepoId','sources','projects','expiresAt','epoch'].map(k=>[k,g[k]]));
export function createHostObservations(config,{fetcher=fetch,now=Date.now,resolveInitiator}={}) {
  const store=createHostObservationStore(config,fetcher);
  const readGrants=new Map();
  const enabled=()=>{if(!hostObservationsEnabled(config,now()))fail('host_observations_disabled',403);};
  function owner(access) {
    enabled();if(!numeric(access?.userId)||!config.ownerIds.includes(access.userId)||access.workspace?.id!==config.workspace.id)fail('host_scope_denied',404);
  }
  function scope(access,projects) {
    owner(access);
    if(projects.some(p=>config.projectRepoIds[p.id]!==p.repoId||!access.projects.some(a=>a.id===p.id&&a.repoId===p.repoId&&(!p.repo||p.repo===a.repo))))fail('host_scope_changed',409);
  }
  function grant(row,{allowRevoked=false,allowExpired=false}={}) {
    const g=row?.value;
    if(!g||!exact(g,['version','id','hostId','actorId','workspaceId','workspaceRepoId','sources','projects','expiresAt','epoch','previewExpiresAt','sessionRef','token'])
      ||g.version!==1||row.id!==g.id||row.actor!==store.actor(g.actorId)||!numeric(g.actorId)||!config.ownerIds.includes(g.actorId)
      ||g.workspaceId!==config.workspace.id||g.workspaceRepoId!==config.workspace.repoId||g.epoch!==authEpoch(config)
      ||!hex(g.sessionRef)||!opaque(g.token)||row.token_hash!==hash(g.token)||row.digest!==hostDigest(publicGrant(g))
      ||!iso(g.expiresAt)||!iso(g.previewExpiresAt)||Date.parse(row.expires_at)!==Date.parse(g.expiresAt)
      ||!allowExpired&&Date.parse(g.expiresAt)<=now()||!allowRevoked&&row.state==='revoked')fail('host_grant_unavailable',401);
    // Validate immutable binding shape without requiring that its old expiry is new.
    validateHostEnrollment({hostId:g.hostId,sources:g.sources,projects:g.projects.map(({id,repoId})=>({id,repoId})),expiresAt:g.expiresAt},Date.parse(g.expiresAt)-1);
    if(g.projects.some(p=>!exact(p,['id','repoId','repo'])||typeof p.repo!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(p.repo)))fail('host_grant_unavailable',401);
    return g;
  }
  async function current(g) {
    enabled();if(typeof resolveInitiator!=='function')fail('host_authority_unavailable',403);
    const latest=await resolveInitiator(g.sessionRef,g.actorId);if(latest.access?.userId!==g.actorId)fail('host_scope_denied',404);scope(latest.access,g.projects);
    if(g.epoch!==authEpoch(config)||Date.parse(g.expiresAt)<=now())fail('host_grant_unavailable',401);
    return latest.access;
  }
  function previewResult(row) {
    const g=grant(row,{allowRevoked:true});
    return {schema:1,kind:'host-observation-enrollment',previewId:g.id,digest:row.digest,state:row.state,grant:publicGrant(g),capabilities:{observe:true,execute:false,providerAuthority:false},credentialIncluded:false};
  }
  return {
    async revalidateReads() {
      if(!readGrants.size)return true;
      try {
        enabled();for(const {actor,id,digest} of readGrants.values()) {
          const row=await store.read(actor,id),g=grant(row);
          if(row.state!=='active'||row.digest!==digest)return false;
          await current(g);
          const latest=await store.read(actor,id);grant(latest);
          if(latest.state!=='active'||latest.digest!==digest)return false;
        }
        enabled();return true;
      }catch{return false;}
    },
    async preview(access,currentSession,input,{reauthorize}) {
      owner(access);const selected=validateHostEnrollment(input,now());scope(access,selected.projects);
      if(currentSession.userId!==access.userId||!hex(currentSession.key))fail('host_session_required',401);
      const id=hash(random()),g={version:1,id,hostId:selected.hostId,actorId:access.userId,workspaceId:config.workspace.id,workspaceRepoId:config.workspace.repoId,
        sources:selected.sources,projects:selected.projects.map(p=>({...p,repo:access.projects.find(a=>a.id===p.id).repo})),expiresAt:selected.expiresAt,epoch:authEpoch(config),
        previewExpiresAt:new Date(Math.min(now()+600000,Date.parse(selected.expiresAt))).toISOString(),sessionRef:currentSession.key,token:random()};
      const fresh=await reauthorize();scope(fresh,g.projects);if(fresh.userId!==g.actorId||g.epoch!==authEpoch(config))fail('host_scope_changed');
      return previewResult(await store.preview(access.userId,id,hostDigest(publicGrant(g)),g));
    },
    async apply(access,input,{reauthorize}) {
      owner(access);if(!exact(input,['previewId','digest'])||!hex(input.previewId)||!hex(input.digest))fail('invalid_host_apply',400);
      const row=await store.read(access.userId,input.previewId),g=grant(row);if(row.digest!==input.digest)fail('host_preview_changed');
      const fresh=await reauthorize();scope(fresh,g.projects);if(fresh.userId!==g.actorId)fail('host_scope_changed');await current(g);
      const saved=await store.apply(access.userId,g.id,input.digest),live=grant(saved);enabled();
      return {...previewResult(saved),credentialIncluded:true,credential:{scheme:'Bearer',token:live.token,scope:'observation-only',expiresAt:live.expiresAt},nextSequence:saved.last_sequence+1};
    },
    async revoke(access,input,{reauthorize}) {
      owner(access);if(!exact(input,['grantId','digest'])||!hex(input.grantId)||!hex(input.digest))fail('invalid_host_revoke',400);
      const row=await store.read(access.userId,input.grantId),g=grant(row,{allowRevoked:true,allowExpired:true});if(row.digest!==input.digest)fail('host_preview_changed');
      const fresh=await reauthorize();scope(fresh,g.projects);if(fresh.userId!==g.actorId)fail('host_scope_changed');
      await store.revoke(g.actorId,g.id,row.digest);return {schema:1,grantId:g.id,digest:row.digest,state:'revoked',execution:false};
    },
    async ingest(token,body) {
      enabled();if(!opaque(token)||!exact(body,['report','digest'])||!hex(body.digest))fail('invalid_host_report',400);
      const row=await store.token(token),g=grant(row);if(row.state!=='active'||!equal(token,g.token))fail('host_identity_required',401);
      const report=validateHostReport(body.report,g,now());if(report.grantId!==g.id||hostDigest(report)!==body.digest)fail('host_report_digest',400);
      await current(g);validateHostReport(report,g,now());enabled();
      const receipt=await store.report(g.actorId,row,report,body.digest);
      return {schema:1,grantId:g.id,...receipt,authority:'enrolled-observer-only',execution:false};
    },
    async reader(context) {
      context.signal?.throwIfAborted();enabled();const actor=Number(context.actorId);
      if(!numeric(actor)||String(actor)!==context.actorId||!config.ownerIds.includes(actor)||context.workspaceId!==config.workspace.id
        ||context.projectId!==context.project?.id||context.repoId!==context.project?.repoId||config.projectRepoIds[context.projectId]!==context.repoId)fail('host_scope_denied',404);
      const found=await store.list(actor,context.project);if(!found.rows.length)fail('host_observations_unavailable');
      const observations=[],expires=[],gaps=found.truncated?['host_merge_truncated']:[];
      for(const item of found.rows) {
        context.signal?.throwIfAborted();
        const g=grant(item.grant);if(g.actorId!==actor||item.grant.state!=='active')fail('host_scope_denied');await current(g);
        context.signal?.throwIfAborted();
        const report=validateHostReport(item.report.value,g,now());
        if(report.grantId!==g.id||report.sequence!==item.report.sequence||hostDigest(report)!==item.report.digest||report.project.id!==context.projectId||report.project.repoId!==context.repoId||Date.parse(item.report.expires_at)!==Date.parse(report.expiresAt))fail('host_report_changed');
        observations.push(hostReportObservation(report,g));expires.push(Date.parse(report.expiresAt),Date.parse(g.expiresAt));
        readGrants.set(g.id,{actor,id:g.id,digest:item.grant.digest});
      }
      const merge=key=>{
        const map=new Map();for(const o of observations)for(const record of o[key]) {
          const old=map.get(record.id),value={record,at:o.observedAt,conflict:false};
          if(!old||old.at<value.at)map.set(record.id,value);
          else if(old.at===value.at&&hostDigest(old.record)!==hostDigest(record))old.conflict=true;
        }
        const values=[...map.values()];if(values.some(v=>v.conflict))gaps.push('host_identity_conflict');if(values.length>500)gaps.push('host_merge_truncated');return values.filter(v=>!v.conflict).slice(0,500).map(v=>v.record);
      };
      const routines=merge('routines'),attempts=merge('attempts').filter(a=>routines.some(r=>r.id===a.routineId));
      const observedAt=observations.map(o=>o.observedAt).sort().at(-1),expiresAt=new Date(Math.min(...expires)).toISOString();
      context.signal?.throwIfAborted();enabled();if(Date.parse(expiresAt)<=now())fail('host_observations_expired');
      return {schema:1,scope:{actorId:context.actorId,workspaceId:context.workspaceId,projectId:context.projectId,repoId:context.repoId},observedAt,expiresAt,
        observation:{schema:1,observedAt,window:{since:null,until:observedAt},routines,attempts,reports:observations.flatMap(o=>o.reports),coverage:{state:'partial',gaps:[...new Set([...gaps,...observations.flatMap(o=>o.coverage.gaps)])]}},usage:null};
    },
  };
}
