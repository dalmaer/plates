import { exact, hash, requestJson, seal, unseal, WebError } from './common.mjs';
import { hex } from './learning-model.mjs';
export function createPrivateLearningStore(config,fetcher=fetch) {
 const instance=hash(JSON.stringify(['private-lessons-v1',config.appId,config.installationId,config.workspace.repoId,config.workspace.id]));
 const actor=id=>hash(JSON.stringify([instance,id]));
 const aad=(recipient,id,kind)=>`private-lessons-v1:${instance}:${recipient}:${id}:${kind}`;
 function decode(r,recipient,id=null) {
  if(!exact(r,['instance','recipient','owner','id','kind','operation','digest','value','revoked','revocation','created_at'])||r.instance!==instance||r.recipient!==recipient||id!==null&&r.id!==id||![r.owner,r.id,r.operation,r.digest].every(hex)||!['preview','original','copy','receipt'].includes(r.kind)||typeof r.value!=='string'||typeof r.revoked!=='boolean'||!Number.isFinite(Date.parse(r.created_at)))throw new WebError('invalid_lesson_store');
  return {...r,revocation:r.revocation===null?null:unseal(r.revocation,config.encryptionKey,aad(recipient,r.id,'revocation')),value:unseal(r.value,config.encryptionKey,aad(recipient,r.id,r.kind))};
 }
 async function rpc(op,user,id,data={}) {
  const recipient=actor(user);
  const result=await requestJson(fetcher,`${config.storageUrl}/rest/v1/rpc/plates_private_lesson_rpc`,{method:'POST',headers:{apikey:config.storageKey,Authorization:`Bearer ${config.storageKey}`,'Content-Type':'application/json'},body:JSON.stringify({p_operation:op,p_instance:instance,p_actor:recipient,p_id:id,p_data:data})},11000000);
  if(result===null)return null;
  if(result.conflict)throw new WebError('lesson_identity_conflict',409);
  if(result.capacity)throw new WebError('lesson_capacity',409);
  if(op==='list') {
   if(!exact(result,['rows'])||!Array.isArray(result.rows)||result.rows.length>51)throw new WebError('invalid_lesson_store');
   const rows=result.rows.map(r=>decode(r,recipient));
   if(rows.some((r,i)=>!['original','copy'].includes(r.kind)||r.revoked||r.id<=id||i&&r.id<=rows[i-1].id))throw new WebError('invalid_lesson_store');
   return {rows:rows.slice(0,50),after:rows.length>50?rows[49].id:null};
  }
  return decode(result,recipient,id);
 }
 const encode=(user,id,kind,operation,digest,value)=>{const recipient=actor(user);return {recipient,id,kind,operation,digest,value:seal(value,config.encryptionKey,aad(recipient,id,kind))};};
 return {actor,instance,read:(u,id)=>rpc('read',u,id),list:(u,after='0'.repeat(64))=>rpc('list',u,after),
  preview:(u,id,operation,digest,value)=>rpc('preview',u,id,{operation,digest,rows:[encode(u,id,'preview',operation,digest,value)]}),
  commit:(u,id,digest,rows)=>rpc('commit',u,id,{operation:id,digest,rows:rows.map(r=>encode(r.user,r.id,r.kind,id,digest,r.value))}),
  revoke:(u,id,proof)=>rpc('revoke',u,id,{revocation:seal(proof,config.encryptionKey,aad(actor(u),id,'revocation'))})};
}
