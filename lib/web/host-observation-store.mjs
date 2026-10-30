import { exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { hex } from './host-observation-model.mjs';
export function createHostObservationStore(config,fetcher=fetch) {
  const instance=hash(JSON.stringify(['host-observation-v1',config.appId,config.installationId,config.workspace.id,config.workspace.repoId]));
  const actor=id=>hash(JSON.stringify([instance,id]));
  const project=p=>hash(JSON.stringify([instance,p.id,p.repoId]));
  const aad=(id,kind)=>`host-observation-v1:${instance}:${id}:${kind}`;
  function decode(row,owner=null,id=null) {
    if(!exact(row,['instance','id','actor','digest','token_hash','value','state','expires_at','preview_expires_at','last_sequence','last_digest'])||row.instance!==instance||owner!==null&&row.actor!==actor(owner)||id!==null&&row.id!==id||![row.id,row.actor,row.digest,row.token_hash].every(hex)||!['preview','active','revoked'].includes(row.state)||!Number.isSafeInteger(row.last_sequence)||row.last_sequence<0||!(row.last_digest===null||hex(row.last_digest)))throw new WebError('invalid_host_store');
    return {...row,value:unseal(row.value,config.encryptionKey,aad(row.id,'grant'))};
  }
  async function rpc(op,owner,id,data={}) {
    const value=await requestJson(fetcher,`${config.storageUrl}/rest/v1/rpc/plates_host_observation_rpc`,{method:'POST',headers:{apikey:config.storageKey,Authorization:`Bearer ${config.storageKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_operation:op,p_instance:instance,p_actor:actor(owner),p_id:id,p_data:data})},9000000);
    if(value===null)return null;
    if(value.conflict===true)throw new WebError('host_observation_conflict',409);
    if(value.capacity===true)throw new WebError('host_observation_capacity',409);
    if(op==='report') {
      if(!exact(value,['sequence','digest','replayed'])||value.sequence!==data.sequence||value.digest!==data.digest||typeof value.replayed!=='boolean')throw new WebError('invalid_host_store');
      return value;
    }
    if(op==='list') {
      if(!exact(value,['rows'])||!Array.isArray(value.rows)||value.rows.length>21)throw new WebError('invalid_host_store');
      return {truncated:value.rows.length>20,rows:value.rows.slice(0,20).map(item=>{
        if(!exact(item,['grant','report']))throw new WebError('invalid_host_store');
        const grant=decode(item.grant,owner),r=item.report;
        if(!exact(r,['instance','grant_id','project','sequence','digest','value','expires_at'])||r.instance!==instance||r.grant_id!==grant.id||r.project!==id||!hex(r.digest)||!Number.isSafeInteger(r.sequence)||r.sequence<1||r.sequence>grant.last_sequence)throw new WebError('invalid_host_store');
        return {grant,report:{...r,value:unseal(r.value,config.encryptionKey,aad(`${grant.id}:${id}:${r.sequence}:${r.digest}`,'report'))}};
      })};
    }
    return decode(value,op==='token'?null:owner,op==='token'?null:id);
  }
  return {actor,project,instance,
    preview:(owner,id,digest,value)=>rpc('preview',owner,id,{digest,tokenHash:hash(value.token),value:seal(value,config.encryptionKey,aad(id,'grant')),expiresAt:value.expiresAt,previewExpiresAt:value.previewExpiresAt}),
    read:(owner,id)=>rpc('read',owner,id),token:token=>rpc('token',0,hash(token)),
    apply:(owner,id,digest)=>rpc('apply',owner,id,{grantDigest:digest}),revoke:(owner,id,digest)=>rpc('revoke',owner,id,{grantDigest:digest}),
    list:(owner,p)=>rpc('list',owner,project(p)),
    report:(owner,grant,report,digest)=>rpc('report',owner,grant.id,{grantDigest:grant.digest,tokenHash:grant.token_hash,sequence:report.sequence,digest,project:project(report.project),expiresAt:report.expiresAt,value:seal(report,config.encryptionKey,aad(`${grant.id}:${project(report.project)}:${report.sequence}:${digest}`,'report'))})};
}
