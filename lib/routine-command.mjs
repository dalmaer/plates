// Explicit inspection and exact-digest metadata capture. Browser requests never choose local paths.
import { inspectRoutineRegistry, readObservationInput, validateUsageBinding, readUsageBinding, readRecommendationBinding, managementProjection } from './management-observations.mjs';
const fail=message=>{throw Object.assign(new Error(message),{exitCode:2});};
export function parseRoutineArgs(args) {
  if(args.filter(v=>v==='--json').length>1)fail('repeated JSON flag');
  const [action,...rest]=args.filter(v=>v!=='--json');
  if(!['inspect','usage','record-usage','recommend'].includes(action))fail('routines needs inspect, usage, record-usage or recommend');
  const allowed=action==='recommend'?['--input','--manifest','--state']:action==='inspect'?['--registry']:action==='usage'?['--manifest','--state','--project','--pr','--actor','--verify-repository']:['--manifest','--state','--project','--episode','--record','--yes','--digest'];
  const values={};
  for(let i=0;i<rest.length;i++){const flag=rest[i];if(!allowed.includes(flag)||Object.hasOwn(values,flag))fail('invalid routines arguments');if(['--yes','--verify-repository'].includes(flag)){values[flag]=true;continue;}const value=rest[++i];if(typeof value!=='string'||!value||value.startsWith('--'))fail('invalid routines arguments');values[flag]=value;}
  if(action==='inspect'&&!values['--registry']||action!=='inspect'&&['--manifest','--state',...(action==='recommend'?['--input']:['--project']),...(action==='record-usage'?['--episode','--record']:[])].some(key=>!values[key]))fail('missing routines input');
  if(action==='record-usage'&&(!!values['--yes']!==!!values['--digest']||values['--digest']&&!/^[a-f0-9]{64}$/.test(values['--digest'])))fail('record-usage apply requires --yes and exact --digest');
  if(values['--verify-repository']&&!values['--pr'])fail('repository verification requires --pr');
  return {action,values};
}
export async function routineCommand({args,appRoot}) {
  const {action,values:v}=parseRoutineArgs(args);
  try {
    let data;
    if(action==='recommend')data=await readRecommendationBinding({input:v['--input'],manifest:v['--manifest'],state:v['--state']},{appRoot});
    else if(action==='record-usage') {
      validateUsageBinding({manifest:v['--manifest'],state:v['--state'],projects:[v['--project']],pr:null,actorId:null,shared:true});
      const observation=await readObservationInput(v['--record']);
      const {appendUsageObservation}=await import('./agent-quality-usage.mjs');
      const result=await appendUsageObservation({manifest:v['--manifest'],state:v['--state'],appRoot,project:v['--project'],episodeId:v['--episode'],observation,yes:v['--yes']===true,digest:v['--digest']});
      data={status:result.status,digest:result.digest??null,added:result.added??null,duplicates:result.duplicates??null,recovered:result.recovered===true,provenance:'Supplied observation metadata; not independently authenticated.',billingVerified:false};
    } else if(action==='inspect')data=managementProjection({observation:await inspectRoutineRegistry(v['--registry'])});
    else {
      let pr=null;if(v['--pr']){if(!/^[1-9][0-9]*:[1-9][0-9]*$/.test(v['--pr']))fail('invalid PR identity');const [repositoryId,number]=v['--pr'].split(':').map(Number);pr={repositoryId,number};}
      const usage=await readUsageBinding({manifest:v['--manifest'],state:v['--state'],projects:[v['--project']],pr,actorId:v['--actor']??null,shared:!v['--actor']},{appRoot,verifyRepository:v['--verify-repository']===true});
      data=managementProjection({usage});
    }
    return {data,text:JSON.stringify(data,null,2),exitCode:action==='record-usage'&&!v['--yes']?3:0};
  }catch{fail('routine observation input or source unavailable');}
}
