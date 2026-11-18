// Dormant internal composition, NOT an authorization interface. A future trusted
// controller must validate the exact preview, current source/auth and activation.
// Recovery observes the original operation; it never invokes a begin or publisher.
import { createOperationStore } from './operation-store.mjs';
import { createAttachCommit } from './attach-commit.mjs';
import { createAttachGitHub } from './attach-github.mjs';
import { canonical } from '../attach.mjs';
import { WebError } from './common.mjs';

export function createAttachOperations(config, publisherConfig, {fetcher=fetch,now=Date.now,signal,timeoutMs=25000,beforeEffect}={}) {
 const storage=structuredClone(config), publication=structuredClone(publisherConfig);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>25000)throw new WebError('invalid_attach_deadline',400);
 const guidance=row=>row?.conflict?{reason:'project-conflict',recoveryAction:'inspect-project-activity'}
  :!row?{reason:'journal-unavailable',recoveryAction:'recover-original'}
  :row.stage==='ref-declined'?{reason:'claim-taken',recoveryAction:'inspect-project-activity'}
  :row.stage.startsWith('ref-')?{reason:'ref-outcome-unverified',recoveryAction:'inspect-original-ref'}
  :['commit-started','commit-uncertain'].includes(row.stage)?{reason:'commit-outcome-unverified',recoveryAction:'inspect-original-commit'}
  :row.stage==='mint-recorded'?{reason:'request-local-credential-unavailable',recoveryAction:'preserve-original-operation'}
  :['mint-started','mint-uncertain'].includes(row.stage)?{reason:'mint-outcome-unverified',recoveryAction:'preserve-original-operation'}
  :{reason:'original-operation-incomplete',recoveryAction:'recover-original'};
 const view=(row,verified=false)=>({operationId:row?.id??null,state:verified?'claim-verified':row?.stage==='ref-declined'?'not-claimed':'inspection-required',
  journalState:row?.state??null,stage:row?.stage??null,observations:row?.observations??{},claimVerified:verified,
  briefAvailable:verified&&!!row?.value.brief,brief:verified?row?.value.brief??null:null,running:false,dispatch:false,retryAuthorized:false,...(verified?{reason:null,recoveryAction:'open-session-brief'}:guidance(row))});
 async function run(input,recovery) {
  input=structuredClone(input);
  const controller=new AbortController(),cleanups=new Set();
  let stopped=false,row=null,rejectDeadline;
  const active=()=>{if(stopped||controller.signal.aborted)throw new WebError('attach_ended');};
  const cancel=value=>{try{Promise.resolve(value?.cancel()).catch(()=>{});}catch{}};
  const stop=()=>{stopped=true;controller.abort();for(const cleanup of cleanups)cleanup();rejectDeadline(new WebError('attach_ended'));};
  const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});
  const timer=setTimeout(stop,timeoutMs);signal?.addEventListener('abort',stop,{once:true});
  // Includes store response bodies and cleanup; noncooperative IO cannot allow
  // late continuations to issue another request after the enclosing operation ends.
  const boundedFetch=async(url,options)=>{
   active();
   const response=await fetcher(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal});
   if(stopped){cancel(response.body);active();}
   const body=response.body;
   return {ok:response.ok,status:response.status,body:body?{
    cancel:()=>{cancel(body);return Promise.resolve();},
    getReader:()=>{
     const reader=body.getReader(),cleanup=()=>cancel(reader);cleanups.add(cleanup);
     return {read:async()=>{active();const read=await reader.read();active();return read;},
      cancel:()=>{cleanups.delete(cleanup);cleanup();return Promise.resolve();}};
    },
   }:null};
  };
  const store=createOperationStore(storage,boundedFetch),identity=input.identity;
  const report=async(operation,extra={})=>{
   active();
   const stage=operation==='ref-decline'?'ref-declined':operation.replace(/-(record|reconcile)$/,'-recorded');
   const updated=await store.attachTransition(operation,identity,{stage,at:new Date(now()).toISOString(),...extra});active();
   if(!updated||!updated.changed||updated.granted)throw new WebError('attach_report_unacknowledged');
   row=updated;
  };
  const grant=async(effect,request)=>{
   active();
   if(canonical(request)!==canonical({operationId:identity.id,stage:effect+'-started'}))throw new WebError('attach_ack_mismatch');
   if(beforeEffect) {await beforeEffect();active();}
   if(input.parent.tokenExpiry<=now())throw new WebError('attach_credential_expired');
   if(effect==='commit')await report('mint-record');
   active();
   const updated=await store.attachTransition(effect+'-begin',identity);active();
   if(!updated?.granted||!updated.changed||updated.stage!==effect+'-started')throw new WebError('attach_begin_unacknowledged');
   row=updated;
   if(beforeEffect) {await beforeEffect();active();}
   return {operationId:identity.id,stage:effect+'-started',granted:true};
  };
  const uncertain=async effect=>{if(row?.stage===effect+'-started')await report(effect+'-uncertain');};
  async function work() {
   active();
   if(recovery) {
    row=await store.attachRead(identity);active();
    if(!row)return view(row);
    const intent=row.value.intent;
    const provider=createAttachGitHub(input.token,{fetcher:boundedFetch,signal:controller.signal,timeoutMs});
    if(['commit-started','commit-uncertain'].includes(row.stage)) {
     const commit=await provider.inspectCommit(intent);active();
     if(commit.state==='published') {
      await uncertain('commit');await report('commit-reconcile');
     }
    }
    const observed=await provider.inspectClaim(intent);active();
    if(observed.state==='claimed'&&['ref-started','ref-uncertain'].includes(row.stage)) {
     await uncertain('ref');await report('ref-reconcile');
    } else if(observed.state==='taken'&&row.stage==='commit-recorded') {
     // DB stage proves no ref begin won; inspectClaim.refEffect alone does not.
     await report('ref-decline',{reason:'claim-taken',refEffect:'not-started',observedCommit:observed.observedCommit});
    }
    return view(row,row.stage==='ref-recorded'&&observed.state==='claimed');
   }
   row=await store.attachReserve(identity,input.intent,input.brief);active();
   if(!row||row.conflict)return view(row);
   if(!row.created)return {...view(row),reason:'original-operation-exists',recoveryAction:'recover-original'};
   const intent=row.value.intent;
   const published=await createAttachCommit(publication,intent,input.parent,{
    fetcher:boundedFetch,now,signal:controller.signal,timeoutMs,
    beforeMint:request=>grant('mint',request),beforeCommit:request=>grant('commit',request),
   }).publishCommit();active();
   if(published.state!=='published') {
    if(row.stage==='mint-started')await uncertain('mint');
    else if(row.stage==='commit-started')await uncertain('commit');
    return view(row);
   }
   await report('commit-record');
   const provider=createAttachGitHub(input.parent.token,{fetcher:boundedFetch,signal:controller.signal,timeoutMs,beforeRef:request=>grant('ref',request)});
   const claimed=await provider.publishRef(intent);active();
   if(claimed.state==='claimed'&&row.stage==='ref-started')await report('ref-record');
   else if(claimed.state==='taken'&&claimed.refEffect==='not-started'&&row.stage==='commit-recorded')
    await report('ref-decline',{reason:'claim-taken',refEffect:'not-started',observedCommit:claimed.observedCommit});
   else await uncertain('ref');
   return view(row,row.stage==='ref-recorded'&&claimed.state==='claimed');
  }
  try {if(signal?.aborted)stop();return await Promise.race([deadline,Promise.resolve().then(work)]);}
  catch {return {...view(row),reason:'attach_observation_unavailable'};}
  finally {stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();for(const cleanup of cleanups)cleanup();cleanups.clear();}
 }
 return {execute:input=>run(input,false),recover:input=>run(input,true)};
}
