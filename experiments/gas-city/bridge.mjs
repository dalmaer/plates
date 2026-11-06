// Opt-in local experiment: trusted caller supplies authenticated identities and policy.
// Never import from production routes. No subscriptions, background scheduling or credentials.
import { randomUUID, createHash } from 'node:crypto';
import { loopback } from './client.mjs';
import { checkFundingBinding, fundingMetadata, fundingDigest } from '../../lib/web/funding.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert = (ok, code) => {if (!ok) throw new Error(code);};
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);

export function bridge({store, client, authorize, now = Date.now, callbackUrl = 'http://127.0.0.1:9180'}) {
  const callback=loopback(callbackUrl); // server-owned, never chosen by a chat caller
  function permit(actor,project,action) {
    const grant=authorize(actor,project,action); // synchronous trusted server boundary, never message text
    assert(grant?.allowed === true,'authority-refused');
    return grant;
  }
  function runFor(actor,id,action='read') {
    const run=store.read('run',id);assert(run,'run-missing');permit(actor,run.project,action);return run;
  }
  function funded(actor, project) {
    const grant=permit(actor,project,'launch');
    checkFundingBinding(grant.binding,{...grant.context,actorId:actor,now:now()});
    assert(grant.context.project.id===project,'project-mismatch');
    assert(Number.isSafeInteger(grant.capacity?.remaining)&&grant.capacity.remaining>=0&&Number.isFinite(grant.capacity.expiresAt)&&grant.capacity.expiresAt>now(),'capacity-unavailable');
    return grant;
  }
  function update(id,fn) {return store.atomic(()=>{const run=store.read('run',id);assert(run,'run-missing');fn(run);store.put('run',id,run);return run;});}
  return {
    async launch({id,actor,project,pr,agent,units=1}) {
      assert(idOK(id)&&idOK(project)&&idOK(pr)&&typeof agent==='string'&&agent.length>0&&Number.isSafeInteger(units)&&units>0,'invalid-launch');
      const grant=funded(actor,project), key=digest({id,actor,project,pr,agent,units});
      const claim=store.atomic(()=>{
        const existing=store.read('run',id);
        if(existing){assert(existing.key===key,'operation-conflict');assert(existing.payer===actor&&existing.binding===fundingDigest(grant.binding),'payer-or-policy-changed');return {run:existing,send:false};}
        assert(!store.all('run').some(r=>r.project===project&&r.hold),'project-lane-held');
        const pool=fundingMetadata(grant.binding).pool;
        const held=store.all('run').filter(r=>r.pool===pool&&r.capacityHold).reduce((sum,r)=>sum+r.units,0);
        assert(held+units<=grant.capacity.remaining,'capacity-exhausted');
        const run={id,key,project,pr,actor,payer:actor,pool,binding:fundingDigest(grant.binding),units,agent,fence:randomUUID(),hold:true,capacityHold:true,state:'launch-uncertain',request:null,session:null,outcome:null,learning:'pending',createdAt:now()};
        store.put('run',id,run);return {run,send:true};
      });
      if(!claim.send)return claim.run;
      try {
        const reply=await client.create(id,project,agent);
        assert(idOK(reply.request_id)&&/^\d+$/.test(reply.event_cursor),'invalid-create-response');
        return update(id,r=>{r.request=reply.request_id;r.cursor=reply.event_cursor;if(!r.stopRequested)r.state='accepted';});
      } catch {return store.read('run',id);} // retain intent/hold: never resend an uncertain POST
    },
    // Read-only event consumption. Caller obtains events from the configured local city, never chat.
    observeCreate(actor,id,event) {
      const run=runFor(actor,id,'attest');assert(run.request&&event?.payload?.request_id===run.request,'request-mismatch');
      assert(event.type==='request.result.session.create'&&idOK(event.payload.session?.id),'invalid-create-event');
      return update(id,r=>{assert(!r.session||r.session===event.payload.session.id,'session-conflict');r.session=event.payload.session.id;if(r.state==='accepted')r.state='running';});
    },
    async inspect(actor,id) {
      const run=runFor(actor,id);const observation=run.session?await client.inspect(run.session):null;
      permit(actor,run.project,'read');return {run:store.read('run',id),observation,terminationConfirmed:false};
    },
    async stop(actor,id) {
      const run=runFor(actor,id,'stop');
      const sessionToStop=store.atomic(()=>{const current=store.read('run',id);current.stopRequested=true;if(current.state!=='terminated')current.state='stop-pending';const send=!!current.session&&!current.killClaimed&&current.hold;if(send)current.killClaimed=true;store.put('run',id,current);return send?current.session:null;});
      if(sessionToStop) {try {await client.kill(sessionToStop,`stop:${id}`);}catch {/* uncertain stop remains pending */}}
      return store.read('run',id);
    },
    // A separate trusted runtime attestor is required. GC inactivity/404 and callbacks are insufficient.
    terminated(actor,id,{fence,session,evidence}) {
      runFor(actor,id,'attest');return update(id,r=>{
        assert(idOK(session)&&r.fence===fence&&r.session===session&&idOK(evidence),'stale-termination');
        r.state='terminated';r.hold=false;r.terminationEvidence=evidence;
      });
    },
    complete(actor,id,{fence,session,outcome}) {
      runFor(actor,id,'attest');assert(['success','failure','abandoned'].includes(outcome),'invalid-outcome');
      return update(id,r=>{assert(idOK(session)&&r.fence===fence&&r.session===session,'stale-callback');assert(!r.outcome||r.outcome===outcome,'outcome-conflict');r.outcome=outcome;}); // outcome and pending learning are one durable row
    },
    learning(actor,id,{status,text='',evidence=''}) {
      runFor(actor,id,'review-learning');assert(['captured','no-useful-lesson'].includes(status),'invalid-learning');
      assert(status!=='captured'||(text.trim()&&idOK(evidence)),'lesson-evidence-required');
      return update(id,r=>{assert(r.outcome,'outcome-required');const decision={status,text,evidence};assert(!r.lesson||digest(r.lesson)===digest(decision),'learning-conflict');r.learning=status;r.lesson=decision;});
    },
    promote(actor,id,{version,projects}) {
      const run=runFor(actor,id,'review-learning');assert(run.learning==='captured'&&idOK(version)&&Array.isArray(projects)&&projects.length>0,'promotion-invalid');
      for(const project of projects)permit(actor,project,'review-learning');
      return store.atomic(()=>{assert(!store.read('lesson',version),'version-exists');const record={version,source:id,projects:[...new Set(projects)],text:run.lesson.text,evidence:run.lesson.evidence,active:true};store.put('lesson',version,record);return record;});
    },
    rollback(actor,version) {
      const lesson=store.read('lesson',version);assert(lesson,'lesson-missing');for(const p of lesson.projects)permit(actor,p,'review-learning');
      return store.atomic(()=>{lesson.active=false;store.put('lesson',version,lesson);return lesson;});
    },
    lessons(actor,project) {permit(actor,project,'read');return store.all('lesson').filter(l=>l.active&&l.projects.includes(project));},
    async message({actor,project,id,source,thread,target,text,expectedRevision}) {
      permit(actor,project,'message');assert(['issue','chat'].includes(source)&&idOK(id)&&idOK(thread)&&idOK(target)&&typeof text==='string'&&text.length<=20000&&Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'invalid-message');
      const run=store.all('run').find(r=>r.project===project&&r.session===target);assert(run,'target-unbound');
      const canDeliver=()=>{const current=store.read('run',run.id);assert(current.hold&&!current.stopRequested&&current.state==='running','target-not-running');const grant=funded(current.payer,project);assert(current.binding===fundingDigest(grant.binding),'payer-or-policy-changed');};
      canDeliver();
      const key=digest([project,source,thread,id]), content=digest([actor,target,text]);
      const claimed=store.atomic(()=>{
        const existing=store.read('message',key);if(existing){assert(existing.content===content,'message-conflict');return {record:existing,send:false};}
        const revision=store.all('message').filter(m=>m.project===project).length;
        const record={key,content,project,actor,source,thread,id,target,text,revision:revision+1,state:revision===expectedRevision?'delivery-uncertain':'human-conflict'};
        store.put('message',key,record);return {record,send:record.state!=='human-conflict'};
      });
      if(!claimed.send)return claimed.record;
      // Separate conversation per target preserves direct worker/coordinator addressing.
      const conversation={provider:'plates',account_id:'plates-experiment',scope_id:project,conversation_id:`${thread}:${target}`,kind:'thread'};
      try {
        await client.register(callback);await client.bind(conversation,target);
        permit(actor,project,'message');canDeliver(); // fresh caller, original payer and lifecycle checks
        const result=await client.inbound({provider_message_id:key,conversation,actor:{id:String(actor),is_bot:false},text,received_at:new Date(now()).toISOString()});
        assert(result.TargetSessionID===target,'routing-unconfirmed');
        store.atomic(()=>{const m=store.read('message',key);m.state='routed-accepted';store.put('message',key,m);});
      } catch {/* upstream may have notified; operator reconciliation, never blind retry */}
      return store.read('message',key);
    },
    usage(actor,id,{receipt,stage,tokens,costMicroUsd}) {
      const run=runFor(actor,id,'attest');assert(idOK(receipt)&&['planning','coding','review','retry','failure'].includes(stage),'usage-invalid');
      for(const v of [tokens,costMicroUsd])assert(v===null||Number.isSafeInteger(v)&&v>=0,'usage-invalid');
      return store.atomic(()=>{const value={receipt,run:id,project:run.project,pr:run.pr,stage,tokens,costMicroUsd};const old=store.read('usage',receipt);assert(!old||digest(old)===digest(value),'usage-conflict');store.put('usage',receipt,value);return value;});
    },
    // Small Mission Control view model, no new UI or routes. Reconnect is inspection only.
    view(actor,project,pr) {
      permit(actor,project,'read');const runs=store.all('run').filter(r=>r.project===project&&r.pr===pr);
      const usage=store.all('usage').filter(u=>u.project===project&&u.pr===pr);
      const complete=runs.length>0&&runs.every(r=>r.outcome&&usage.some(u=>u.run===r.id))&&usage.every(u=>u.tokens!==null&&u.costMicroUsd!==null);
      return {project,pr,observedAt:now(),freshness:'local-journal-only',usageCoverage:'partial',
        runs:runs.map(({id,state,hold,capacityHold,outcome,learning,stopRequested,session})=>({id,state,hold,capacityHold,outcome,learning,stopRequested:!!stopRequested,session})),
        messages:store.all('message').filter(m=>m.project===project).map(({id,target,state,actor,revision,text})=>({id,target,state,actor,revision,text})),
        usage:{knownTokens:usage.reduce((n,u)=>n+(u.tokens??0),0),knownCostMicroUsd:usage.reduce((n,u)=>n+(u.costMicroUsd??0),0),totalTokens:null,totalCostMicroUsd:null,receipts:usage.length,recordedAttemptsComplete:complete}};
    },
  };
}
