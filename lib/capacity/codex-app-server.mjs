// Codex CLI 0.164.0 protocol, generated offline: v1/Initialize{Params,Response},
// v2/GetAccount{Params,Response}, NullableGetAccountRateLimitsParams and
// GetAccountRateLimitsResponse. Source-schema compatibility, not live proof.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { codexUsageSnapshot } from './codex-capacity.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,199}$/.test(v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const path=v=>typeof v==='string'&&isAbsolute(v)&&v.length<=4096&&!v.includes('\0');
const fail=code=>{throw Error(code);};
export const codexLaunchDigest=launch=>createHash('sha256').update(JSON.stringify([launch.executable,launch.args,launch.cwd,launch.codexHome])).digest('hex');
function validLaunch(launch) {
  return exact(launch,['executable','args','cwd','codexHome'])&&[launch.executable,launch.cwd,launch.codexHome].every(path)&&Array.isArray(launch.args)&&JSON.stringify(launch.args)===JSON.stringify(['app-server','--listen','stdio://']);
}
function validGrant(grant,launch,now) {
  return exact(grant,['launchDigest','actorId','hostId','expectedAccountId','checkedAt','expiresAt'])&&grant.launchDigest===codexLaunchDigest(launch)&&[grant.actorId,grant.hostId,grant.expectedAccountId].every(id)&&iso(grant.checkedAt)&&iso(grant.expiresAt)&&Date.parse(grant.checkedAt)<=now&&now-Date.parse(grant.checkedAt)<300000&&Date.parse(grant.expiresAt)>now&&Date.parse(grant.expiresAt)-Date.parse(grant.checkedAt)<=300000;
}
/** Constructor dependencies are trusted host code, never browser/file inputs.
 * An exact, fresh start grant is mandatory; merely importing this starts nothing.
 * Production arguments are fixed. spawnProcess injection is for synthetic tests. */
export async function readCodexCapacity({launch,signal},{authorizeStart,spawnProcess=spawn,now=Date.now,timeoutMs=4000}={}) {
  if(!validLaunch(launch)||typeof authorizeStart!=='function')fail('codex_start_not_authorized');
  if(process.platform==='win32'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>4000||signal?.aborted)fail('codex_read_unavailable');
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),timeoutMs),bounded=AbortSignal.any([deadline.signal,...(signal?[signal]:[])]);
  const authorization=()=>new Promise((resolve,reject)=>{
    const stop=()=>reject(Error(signal?.aborted?'codex_read_aborted':'codex_read_timeout'));
    if(bounded.aborted)return stop();bounded.addEventListener('abort',stop,{once:true});
    Promise.resolve().then(()=>authorizeStart({launch:structuredClone(pinned),launchDigest:codexLaunchDigest(pinned),signal:bounded})).then(value=>{if(bounded.aborted)stop();else resolve(value);},()=>reject(Error('codex_start_not_authorized'))).finally(()=>bounded.removeEventListener('abort',stop));
  });
  const pinned=structuredClone(launch);
  try {
    const grant=await authorization();
    if(!validGrant(grant,pinned,now())||bounded.aborted)fail('codex_start_not_authorized');
    const result=await session(pinned,grant,{spawnProcess,now,signal:bounded,timeout:()=>deadline.signal.aborted});
    const final=await authorization();
    if(!validGrant(grant,pinned,now())||!validGrant(final,pinned,now())||['actorId','hostId','expectedAccountId'].some(k=>final[k]!==grant[k]))fail('codex_start_authorization_changed');
    result.expiresAt=new Date(Math.min(Date.parse(result.expiresAt),Date.parse(final.expiresAt))).toISOString();return result;
  }finally{clearTimeout(timer);}
}
function session(launch,grant,{spawnProcess,now,signal,timeout}) {
  return new Promise((resolve,reject)=>{
    let child,ending=false,settled=false,failure=null,result=null,pending=null,buffer=Buffer.alloc(0),stdout=0,stderr=0,frames=0,killTimer,closeTimer;
    // detached gives only this invocation its own POSIX process group.
    const killGroup=signal=>{if(Number.isSafeInteger(child?.pid)&&child.pid>1)try{process.kill(-child.pid,signal);}catch{}};
    const finish=confirmed=>{if(settled)return;settled=true;clearTimeout(killTimer);clearTimeout(closeTimer);signal.removeEventListener('abort',abort);killGroup('SIGKILL');
      if(!confirmed)reject(Error('codex_shutdown_unconfirmed'));else if(failure)reject(failure);else if(!ending||!result?.schema||buffer.length)reject(Error('codex_protocol_incomplete'));else resolve(result);};
    const stop=code=>{if(code)failure??=Error(code);if(ending||settled)return;ending=true;pending=null;try{child?.stdin.end();}catch{}killGroup('SIGTERM');killTimer=setTimeout(()=>killGroup('SIGKILL'),100);closeTimer=setTimeout(()=>finish(false),350);};
    const abort=()=>stop(timeout()?'codex_read_timeout':'codex_read_aborted');
    const send=message=>{if(ending)return;child.stdin.write(JSON.stringify(message)+'\n',error=>{if(error)stop('codex_transport_unavailable');});};
    const request=(number,method,params)=>{pending={id:number,method};send({id:number,method,params});};
    const consume=message=>{
      if(ending||settled)return stop('codex_protocol_invalid');
      if(!message||typeof message!=='object'||Array.isArray(message))return stop('codex_protocol_invalid');
      // No server-initiated command, credential refresh, approval or tool request.
      if(Object.hasOwn(message,'method'))return stop(Object.hasOwn(message,'id')?'codex_server_request_refused':'codex_notification_refused');
      if(!pending||message.id!==pending.id||Object.hasOwn(message,'error')||!exact(message,['id','result']))return stop('codex_protocol_invalid');
      const phase=pending.id;pending=null;
      if(phase===1) {
        const v=message.result;
        if(!v||!['codexHome','platformFamily','platformOs','userAgent'].every(k=>typeof v[k]==='string'&&v[k].length<=4096)||v.codexHome!==launch.codexHome)return stop('codex_protocol_invalid');
        send({method:'initialized'});request(2,'account/read',{refreshToken:false});
      }else if(phase===2) {
        result={account:message.result};request(3,'account/rateLimits/read',{supportsLunaReserve:false,excludeResetCreditDetails:true});
      }else {
        try{const observedAt=new Date(now()).toISOString();result=codexUsageSnapshot(result.account,message.result,{...grant,observedAt,expiresAt:new Date(Math.min(Date.parse(grant.expiresAt),now()+300000)).toISOString()});stop();}catch{stop('codex_protocol_invalid');}
      }
    };
    try {
      // Explicit home; no inherited Node preload hooks, shell or custom protocol args.
      const env={PATH:process.env.PATH??'',HOME:launch.cwd,CODEX_HOME:launch.codexHome};
      child=spawnProcess(launch.executable,[...launch.args],{cwd:launch.cwd,env,stdio:['pipe','pipe','pipe'],shell:false,detached:true});
      child.once('spawn',()=>request(1,'initialize',{clientInfo:{name:'plates-capacity',version:'1'},capabilities:{experimentalApi:false,requestAttestation:false,explicitGatewayOauth:true}}));
      child.stdout.on('data',chunk=>{
        stdout+=chunk.length;if(stdout>1024*1024)return stop('codex_protocol_limit');
        buffer=Buffer.concat([buffer,chunk]);if(buffer.length>262144)return stop('codex_protocol_limit');
        let newline;
        while((newline=buffer.indexOf(10))!==-1) {
          const line=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);if(++frames>16)return stop('codex_protocol_limit');
          try{const message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));consume(message);}catch{return stop('codex_protocol_invalid');}
        }
      });
      child.stderr.on('data',chunk=>{stderr+=chunk.length;if(stderr>65536)stop('codex_protocol_limit');});
      child.stdin.on('error',()=>stop('codex_transport_unavailable'));
      child.once('error',()=>stop('codex_transport_unavailable'));
      child.once('close',()=>finish(true));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    }catch{failure=Error('codex_transport_unavailable');if(child)stop(failure.message);else finish(true);}
  });
}
