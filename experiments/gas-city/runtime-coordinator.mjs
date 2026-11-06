// One actual coordinator OS process per command. Synthetic identity/funding only.
// Talks to our real-provider component driver, not the supervisor API.
import { journal } from './store.mjs';
import { bridge } from './bridge.mjs';
import { loopback } from './client.mjs';
import { createHash } from 'node:crypto';
const [path,baseInput,action]=process.argv.slice(2),base=loopback(baseInput);
const store=journal(path),at=Date.parse('2026-10-30T12:00:00Z'),h='a'.repeat(64),stamp=n=>new Date(n).toISOString();
const binding={version:1,ownerActorId:1,provider:'openai',accountIdentity:{account:'acme-runtime-account',workspace:null,scope:'account'},poolId:'acme-runtime-pool',brokerScope:h,connectionGeneration:1,connectionPolicyDigest:h,grant:{id:h,version:1,state:'active',projects:[{id:'acme-canvas',repoId:101,modelPolicyDigest:h}],models:['acme-no-model'],expiresAt:stamp(at+60000)},evidence:{digest:h,observedAt:stamp(at),expiresAt:stamp(at+60000)}};
async function component(action,fence) {
 const response=await fetch(`${base}/component`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify({action,fence})});
 if(!response.ok)throw new Error(`component-${response.status}`);return response.json();
}
const api=bridge({store,now:()=>at,authorize:(actor,project)=>({allowed:actor===1&&project==='acme-canvas',binding,context:{project:{id:project,repoId:101},modelPolicyDigest:h,connectionPolicyDigest:h,connectionGeneration:1,brokerScope:h,model:'acme-no-model'},capacity:{remaining:1,expiresAt:at+60000}}),client:{
 async create(id){const native=await component('create',store.read('run',id).fence);store.atomic(()=>store.put('native',id,native));return {request_id:'acme-component-request',event_cursor:'0'};},
 inspect:()=>component('inspect'),kill:()=>component('stop'),
}});
const launch=()=>api.launch({id:'acme-run',actor:1,project:'acme-canvas',pr:'acme-pr',agent:'acme-fixed-sleep'});
let result;
try {
 if(action==='launch') {
  const run=await launch();if(run.state!=='accepted')throw new Error('native launch not accepted');
  api.observeCreate(1,run.id,{type:'request.result.session.create',payload:{request_id:run.request,session:{id:'acme-run'}}});
  result={run:store.read('run',run.id),native:await component('inspect')};
 } else if(action==='recover') {await launch();result=await api.inspect(1,'acme-run');}
 else if(action==='stop') {await api.stop(1,'acme-run');result={run:store.read('run','acme-run'),native:await component('inspect')};}
 else if(action==='confirm'||action==='stale-confirm') {
  const native=await component('inspect'),original=store.read('native','acme-run'),run=store.read('run','acme-run');
  if(!native.exitConfirmed||native.running||native.pid!==original.pid||native.startIdentity!==original.startIdentity||native.fence!==run.fence)throw new Error('native-termination-not-proven');
  const evidence=createHash('sha256').update(JSON.stringify(native)).digest('hex');
  store.atomic(()=>store.put('termination-proof',evidence,native));
  result=api.terminated(1,'acme-run',{fence:action==='stale-confirm'?'acme-old-fence':run.fence,session:native.session,evidence});
 } else throw new Error('unsupported coordinator action');
 process.stdout.write(JSON.stringify({ok:true,result})+'\n');
 if(action==='launch')await new Promise(resolve=>setTimeout(resolve,60000)); // parent kills this process after the durable result
} catch(error) {process.stdout.write(JSON.stringify({ok:false,error:error.message})+'\n');process.exitCode=1;}
finally {store.close();}
