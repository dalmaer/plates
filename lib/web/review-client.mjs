// The review session's browser client (plates phase 174). Three parts, the
// first two pure and tested without a DOM (tests/web-review.test.mjs):
//
//   createReviewSession  the docket walked one card at a time. An answer shows
//                        the next card at once and is held for HOLD_MS with
//                        Undo; then it is sent. A failed send comes back as a
//                        card at the end of the session, with its reason; an
//                        uncertain one is listed with its operation, never resent.
//   createWebSender      how a held answer is written: POST /api/home/answer
//                        (Not now is written there). A walk or proposal answer's
//                        preview is asked for on the tap (it writes nothing) so
//                        the toast can show what will be written; when the hold
//                        ends, that exact preview goes through its apply route,
//                        which still checks its digest and the source revision.
//   startReviewClient    the page: buttons, keys (1–4, W, N, ← →, Esc), the
//                        why field, Not now's dates, the toast and the end.
import {docketItems,renderReviewCard,renderReviewEnd,cardAnswers,notNowAnswer,laneComplete} from './review-views.mjs';

export const HOLD_MS=5000;
const PREVIEWED=['walk decide','walk done','loose-ends mark','pr merge'];
const MESSAGES={why_required:'This answer needs a why.',item_not_waiting:'It no longer waits on you: it may be settled elsewhere, or its source changed.',answer_not_found:'That answer is no longer offered for this item.',answer_unavailable:'This answer is not written from the web.',invalid_csrf:'Your session changed. Reload the page and answer again.',access_denied:'Your access to this plate changed.',submission_disabled:'Submission is disabled until the owner enables decision writes.',preview_expired:'The preview expired before it was applied.',stale_preview:'The source changed since the preview, so nothing was written.',stale_source:'The source changed since the preview, so nothing was written.',project_busy:'Another write to this plate is in progress.',decision_no_longer_writable:'This plate can no longer be written by the App.',access_changed:'Your access changed since the preview.',public_acknowledgement_required:'This public write needs its preview acknowledged.',request_unavailable:'The network was unavailable, so nothing was confirmed.',invalid_answer:'The answer was not accepted.',invalid_why:'The why must be one line of at most 300 characters.',invalid_until:'The date must be after today.',not_ready:'It is no longer ready to merge: its checks or draft state changed, so nothing was merged.',merge_acknowledgement_required:'The merge needs its own preview confirmed, so nothing was merged.',checks_unavailable:'Its checks could not be read, so nothing was merged.',upstream_unavailable:'GitHub did not answer in time, so nothing was written. Try again.',source_limit:'The plate\'s sources were too large to read here, so nothing was written.',phase_inventory_limit:'The plate has more phases than the web reads, so nothing was written.'};
export const reviewMessage=code=>MESSAGES[code]??`The write was refused (${String(code??'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,64)||'unknown'}).`;
const day=(today,n)=>new Date(Date.parse(`${today}T00:00:00Z`)+n*86_400_000).toISOString().slice(0,10);

/**
 * The session over docket entries ({ key, item, label }). send(hold) resolves
 * { state: 'settled', link? } | { state: 'put-off', until } | { state: 'failed',
 * reason } | { state: 'uncertain', reason, link }. prepare(hold), if
 * given, runs at the tap (a preview; it writes nothing).
 */
export function createReviewSession({items,send,prepare=null,timers={setTimeout,clearTimeout},holdMs=HOLD_MS,onChange=()=>{}}) {
  const queue=items.map(entry=>({entry,reason:null})),holds=[],settled=[],putOff=[],again=[],sent=new Set();
  // passed: cards flipped past with → and not answered. They come round again before the end.
  let index=0,sending=0,closed=false,retried=new Set(),passed=new Set();
  const change=()=>onChange(api);
  const current=()=>closed?null:queue[index]??null;
  const open=i=>{const key=queue[i].entry.key;return !sent.has(key)&&!holds.some(h=>h.entry.key===key);};
  function advance(){
    index++;
    // The end of the queue: answers that failed come back once each, with their reason, before the end screen.
    // A card already answered (after ←) is not shown again.
    while(index<queue.length&&!open(index))index++;
    if(index>=queue.length)for(const failed of again.filter(x=>x.retry&&!retried.has(x.entry.key))){retried.add(failed.entry.key);again.splice(again.indexOf(failed),1);queue.push({entry:failed.entry,reason:failed.reason});}
    // Then the cards flipped past, in order.
    if(index>=queue.length){const first=queue.findIndex((q,i)=>passed.has(q.entry.key)&&open(i));if(first>=0)index=first;}
  }
  async function fire(hold){
    const at=holds.indexOf(hold);if(at<0)return;holds.splice(at,1);timers.clearTimeout(hold.timer);
    sending++;change();
    let result;
    try{result=await send(hold);}catch{result={state:'failed',reason:reviewMessage('request_unavailable')};}
    sending--;sent.add(hold.entry.key);
    const label=hold.answer.label;
    if(result?.state==='settled')settled.push({item:hold.entry.item,key:hold.entry.key,label,link:result.link??null,sets:hold.entry.sets??[]});
    else if(result?.state==='put-off')putOff.push({item:hold.entry.item,key:hold.entry.key,until:result.until});
    else {
      sent.delete(hold.entry.key);
      const uncertain=result?.state==='uncertain';
      again.push({entry:hold.entry,item:hold.entry.item,key:hold.entry.key,reason:result?.reason??reviewMessage(),link:result?.link??null,retry:!uncertain});
      // A failure that lands after the last card still comes back as a card.
      if(!uncertain&&!closed&&index>=queue.length&&!retried.has(hold.entry.key)){retried.add(hold.entry.key);again.pop();queue.push({entry:hold.entry,reason:result?.reason??reviewMessage()});}
    }
    change();
  }
  const api={
    get index(){return index;},get total(){return queue.length;},get holds(){return holds.slice();},get closed(){return closed;},
    get settled(){return settled.slice();},get putOff(){return putOff.slice();},get again(){return again.slice();},get sending(){return sending;},
    /** Cards flipped past and never answered: still waiting on Home. */
    get skipped(){return queue.filter((q,i)=>passed.has(q.entry.key)&&open(i)).map(q=>({item:q.entry.item,key:q.entry.key}));},
    current,
    /** The cards still to answer, the current one first (phase 180: the peek and the running total). */
    upcoming(){if(closed)return [];const out=[];for(let i=index;i<queue.length;i++)if(open(i))out.push(queue[i].entry);return out;},
    /** Whether the session is over: every card passed (or closed) and nothing held or in flight. */
    done:()=>(closed||index>=queue.length)&&!holds.length&&!sending,
    /** Answer the current card. Returns { held } | { error: 'why_required' | 'unavailable' | 'no_card', answer }. */
    choose(answerId,{why='',until}={}){
      const card=current();if(!card)return {error:'no_card'};
      const answer=(card.entry.item.answers??[]).find(a=>a.id===answerId);
      if(!answer)return {error:'no_card'};
      if(answer.unavailable)return {error:'unavailable',answer};
      const line=String(why??'').replace(/\s+/g,' ').trim();
      if(answer.needsWhy!=='never'&&!line)return {error:'why_required',answer};
      const hold={entry:card.entry,answer,why:line,until:answer.writer==='not now'?until:undefined,prepared:null,timer:null};
      hold.prepared=prepare&&PREVIEWED.includes(answer.writer)?Promise.resolve().then(()=>prepare(hold)).catch(()=>({refusal:reviewMessage('request_unavailable')})):null;
      hold.timer=timers.setTimeout(()=>fire(hold),holdMs);
      holds.push(hold);passed.delete(card.entry.key);advance();change();
      return {held:hold};
    },
    /** Undo a held answer (the latest by default): nothing is written, and its card comes back. */
    undo(hold=holds.at(-1)){
      const at=holds.indexOf(hold);if(at<0)return false;
      timers.clearTimeout(hold.timer);holds.splice(at,1);
      const position=queue.findIndex(q=>q.entry.key===hold.entry.key);
      if(position>=0)index=position;closed=false;change();return true;
    },
    /** ← : back one card. A held answer on it is undone; a card already sent is skipped. */
    back(){
      for(let i=Math.min(index,queue.length)-1;i>=0;i--){
        const key=queue[i].entry.key,held=holds.find(h=>h.entry.key===key);
        if(held)return api.undo(held);
        if(!sent.has(key)){index=i;change();return true;}
      }
      return false;
    },
    /** → : the next card not yet answered, leaving this one unanswered; it comes round again before the end. */
    forward(){
      const card=current();if(!card)return false;
      for(let i=index+1;i<queue.length;i++)if(open(i)){passed.add(card.entry.key);index=i;change();return true;}
      return false;
    },
    /** Esc / ✕: end the session. What was answered stays answered: held answers are sent now. */
    close(){
      // Cards still to come that came back with a reason stay listed, with it.
      for(const q of queue.slice(index))if(q.reason&&!holds.some(h=>h.entry.key===q.entry.key)&&!sent.has(q.entry.key)&&!again.some(a=>a.key===q.entry.key))again.push({entry:q.entry,item:q.entry.item,key:q.entry.key,reason:q.reason,link:null,retry:true});
      closed=true;for(const hold of holds.slice())fire(hold);change();
    },
    /** Send every held answer now (the page is going away). */
    flush(){for(const hold of holds.slice())fire(hold);},
  };
  return api;
}

/** JSON over fetch, as the walk and decision clients send theirs; a network failure is { status: 503, uncertain }. */
async function request(fetch,url,body,timeout=58000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});let data=null;try{data=await response.json();}catch{data=null;}return {status:response.status,data};}
  catch{return {status:503,data:{error:'request_unavailable'},uncertain:true};}
  finally{clearTimeout(timer);}
}

/** The writes behind a held answer, through the routes Home's answers already use. */
export function createWebSender({fetch,csrf}) {
  const answerBody=hold=>({csrf,key:hold.entry.key,answer:hold.answer.id,...(hold.why?{why:hold.why}:{}),...(hold.until?{until:hold.until}:{})});
  async function prepare(hold){
    const r=await request(fetch,'/api/home/answer',answerBody(hold));
    if(r.status!==200||r.data?.state!=='preview'||!r.data.preview?.id)return {refusal:reviewMessage(r.data?.error)};
    const preview=r.data.preview;
    return preview.canSubmit?{preview,summary:typeof preview.consequence==='string'?preview.consequence:''}:{refusal:preview.refusal||reviewMessage('submission_disabled')};
  }
  async function send(hold){
    if(!PREVIEWED.includes(hold.answer.writer)){
      const r=await request(fetch,'/api/home/answer',answerBody(hold));
      if(r.status===200&&r.data?.state==='written')return {state:'put-off',until:r.data.until};
      return {state:'failed',reason:reviewMessage(r.data?.error)};
    }
    const prepared=await(hold.prepared??prepare(hold));
    if(!prepared?.preview)return {state:'failed',reason:prepared?.refusal??reviewMessage()};
    const preview=prepared.preview,project=hold.entry.key.split(':')[0];
    const r=await request(fetch,`/api/projects/${encodeURIComponent(project)}/decisions/apply`,{csrf,previewId:preview.id,...(preview.digest?{publicAcknowledgement:preview.digest}:{})});
    const operation=typeof preview.operationUrl==='string'?preview.operationUrl:null;
    // An apply whose answer never came back may have written: it is checked through its operation, never sent again.
    if(r.uncertain)return {state:'uncertain',reason:'The write was sent but its outcome is not confirmed. Check the operation; do not answer again.',link:operation};
    if(r.status!==200)return {state:'failed',reason:reviewMessage(r.data?.error)};
    if(r.data?.state==='committed')return {state:'settled',link:r.data.receipt?.url??operation};
    if(r.data?.state==='refused')return {state:'failed',reason:r.data.reason&&!/^[a-z_]+$/.test(r.data.reason)?r.data.reason:reviewMessage(r.data?.reason)};
    return {state:'uncertain',reason:'The write is not confirmed yet. Check the operation; do not answer again.',link:operation};
  }
  return {prepare,send};
}

/** The page. Native DOM; the session and sender carry the behaviour the tests check. */
export function startReviewClient({document,window,fetch}) {
  const root=document.querySelector('[data-review-root]');if(!root)return null;
  const endpoint=root.dataset.endpoint,home=root.dataset.home||'/',projectId=root.dataset.projectId||null,quick=root.dataset.quick==='1';
  if(!/^\/api\/(?:home|projects\/[a-z][a-z0-9-]{0,63}\/home)$/.test(endpoint))return null;
  const csrf=root.querySelector('[data-review-csrf]')?.value;if(!csrf)return null;
  const sender=createWebSender({fetch:(...a)=>fetch(...a),csrf});
  let session=null,waitingWhy=null,toastTimer=null,pressTimer=null,pressed=false,complete=false;
  // From Yours (phase 180): the backlog's order of the owner's lane, as the server put it on the page.
  let order=null;try{const o=JSON.parse(root.dataset.order||'null');order=Array.isArray(o)&&o.every(k=>typeof k==='string')?o:null;}catch{order=null;}
  const $=selector=>root.querySelector(selector);
  const today=()=>new Date().toISOString().slice(0,10);
  function toast(html,{undo=false,keep=false,change=false}={}){
    const el=$('[data-review-toast]');if(!el)return;
    window.clearTimeout(toastTimer);
    el.innerHTML=`<span>${html}</span>${change?'<button type="button" class="p-ghost" data-review-change>Change</button>':''}${undo?'<button type="button" class="quiet" data-review-undo>Undo</button>':''}`;el.hidden=false;
    if(!keep)toastTimer=window.setTimeout(()=>{el.hidden=true;},undo?HOLD_MS:3500);
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function render(){
    const card=session.current(),keep=$('[data-review-toast]');const toastHtml=keep&&!keep.hidden?keep.innerHTML:null;
    if(card){
      if(root.dataset.shown!==card.entry.key){
        root.querySelectorAll(':scope>:not([data-review-csrf])').forEach(n=>n.remove());
        const upcoming=session.upcoming();
        root.insertAdjacentHTML('beforeend',renderReviewCard(card.entry,{index:session.index,total:session.total,reason:card.reason,next:upcoming[1]??null,remaining:upcoming}));
        root.dataset.shown=card.entry.key;waitingWhy=null;
        if(toastHtml){const el=$('[data-review-toast]');el.innerHTML=toastHtml;el.hidden=false;}
        $('.review-ask')?.focus({preventScroll:true});window.scrollTo(0,0);
      }
      return;
    }
    if(!session.done()){
      if(root.dataset.shown!=='sending'){root.dataset.shown='sending';root.querySelectorAll(':scope>:not([data-review-csrf])').forEach(n=>n.remove());root.insertAdjacentHTML('beforeend','<section class="review-card"><h1 class="review-ask">Sending your answers…</h1><p class="review-why">Undo is still open on the last one.</p></section><div class="review-bar p-glass"><div class="p-toast" data-review-toast role="status" hidden></div></div>');if(toastHtml){const el=$('[data-review-toast]');el.innerHTML=toastHtml;el.hidden=false;}}
      return;
    }
    root.dataset.shown='end';root.querySelectorAll(':scope>:not([data-review-csrf])').forEach(n=>n.remove());
    root.insertAdjacentHTML('beforeend',renderReviewEnd({settled:session.settled,putOff:session.putOff,again:session.again,skipped:session.skipped,home},{complete}));
    $('[data-review-end]')?.focus({preventScroll:true});
  }
  function note(html){const el=$('[data-review-note]');if(el){el.innerHTML=html;el.hidden=!html;}}
  function openWhy(error=''){
    const field=$('[data-review-why]');if(!field)return;field.hidden=false;
    $('[data-review-why-error]').textContent=error;const input=$('[data-review-why-input]');input.setAttribute('aria-invalid',String(Boolean(error)));input.focus();
  }
  function choose(answerId,options={}){
    const why=$('[data-review-why-input]')?.value??'';
    const result=session.choose(answerId,{why,...options});
    if(result.error==='unavailable'){note(`<strong>${esc(result.answer.label)} is not written from here.</strong> ${esc(result.answer.unavailable.reason)}`);return;}
    if(result.error==='why_required'){waitingWhy={answerId,options};openWhy(result.answer.needsWhy==='decline'?'A decline says why, for whoever reads it next.':`${result.answer.label} needs a why.`);return;}
    if(!result.held)return;
    const hold=result.held,label=esc(hold.answer.label);
    const off=hold.answer.writer==='not now';
    toast(off?`${label}: put off until ${esc(hold.until??day(today(),7))}`:`${label} · sending in ${HOLD_MS/1000}s`,{undo:true,change:off&&hold.answer.id==='not-now'});
    hold.prepared?.then(p=>{if(session.holds.includes(hold)&&session.holds.at(-1)===hold)toast(p.summary?`${label}: ${esc(p.summary)}`:`${label}: ${esc(p.refusal??'')}`,{undo:true});});
  }
  function later(choice){
    const card=session.current(),a=card&&notNowAnswer(card.entry.item);if(!a)return;
    // Not now's reason (phase 180): the panel's own line, else the why already typed; one line, metadata only, sealed in the store.
    const reason=($('[data-review-reason]')?.value??'').trim(),why=reason?{why:reason}:{};
    if(choice==='date'){const v=$('[data-review-until-date]')?.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(v??'')||v<=today()){note('Pick a date after today.');return;}return choose(a.id,{until:v,...why});}
    return choose(a.id,{until:day(today(),Number(choice)),...why});
  }
  const toggleLater=()=>{const el=$('[data-review-later]');if(el){el.hidden=!el.hidden;if(!el.hidden)el.querySelector('button')?.focus();}};
  function click(event){
    const target=event.target.closest('button,a');if(!target||!root.contains(target))return;
    if(target.matches('[data-answer]'))return choose(target.dataset.answer);
    if(target.matches('[data-review-undo]')){session.undo();$('[data-review-toast]')&&($('[data-review-toast]').hidden=true);return;}
    if(target.matches('[data-review-add-why]'))return openWhy();
    if(target.matches('[data-review-not-now]')){
      if(pressed){pressed=false;return;}
      const a=notNowAnswer(session.current()?.entry.item);if(!a)return;
      // The first tap puts it off for a week; a long press, or Change in the toast (a second tap), offers the dates.
      return choose(a.id);
    }
    if(target.matches('[data-review-change]')){session.undo();$('[data-review-toast]').hidden=true;return toggleLater();}
    if(target.matches('[data-review-until]'))return later(target.dataset.reviewUntil);
    if(target.matches('[data-review-close]'))return end();
  }
  function end(){if(!session.settled.length&&!session.putOff.length&&!session.holds.length&&!session.sending&&!session.again.length){window.location.assign(home);return;}session.close();}
  function key(event){
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey)return;
    const typing=event.target?.matches?.('input');
    if(typing){
      if(event.key==='Enter'&&event.target.matches('[data-review-why-input]')&&waitingWhy){event.preventDefault();choose(waitingWhy.answerId,waitingWhy.options);}
      if(event.key==='Escape'){event.target.blur();}
      return;
    }
    const card=session.current();
    if(event.key==='Escape'){event.preventDefault();return end();}
    if(event.key==='ArrowLeft'){event.preventDefault();session.back();return;}
    if(event.key==='ArrowRight'){event.preventDefault();session.forward();return;}
    if(!card)return;
    if(/^[1-4]$/.test(event.key)){const a=cardAnswers(card.entry.item)[Number(event.key)-1];if(a){event.preventDefault();choose(a.id);}return;}
    if(event.key==='w'||event.key==='W'){event.preventDefault();openWhy();return;}
    if(event.key==='n'||event.key==='N'){const a=notNowAnswer(card.entry.item);if(a){event.preventDefault();if(event.shiftKey)toggleLater();else choose(a.id);}}
  }
  function down(event){if(!event.target.closest?.('[data-review-not-now]'))return;pressed=false;window.clearTimeout(pressTimer);pressTimer=window.setTimeout(()=>{pressed=true;toggleLater();},500);}
  const up=()=>window.clearTimeout(pressTimer);
  const leaving=event=>{if(session&&(session.holds.length||session.sending)){event.preventDefault();event.returnValue='';}};
  async function load(){
    let snapshot=null;
    try{const r=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(r.status===200)snapshot=await r.json();}catch{snapshot=null;}
    if(!snapshot){toast('The docket could not be read. Reload to try again.',{keep:true});return;}
    const items=docketItems(snapshot,{projectId,quick,order});complete=laneComplete(snapshot);
    session=createReviewSession({items,send:sender.send,prepare:sender.prepare,timers:{setTimeout:(f,ms)=>window.setTimeout(f,ms),clearTimeout:t=>window.clearTimeout(t)},onChange:render});
    root.dataset.shown='';
    if(!items.length){root.querySelectorAll(':scope>:not([data-review-csrf])').forEach(n=>n.remove());root.insertAdjacentHTML('beforeend',renderReviewEnd({home},{nothing:true,complete}));return;}
    render();
  }
  root.addEventListener('click',click);root.addEventListener('pointerdown',down);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',up);
  document.addEventListener('keydown',key);window.addEventListener('beforeunload',leaving);
  load();
  return {get session(){return session;},stop(){root.removeEventListener('click',click);root.removeEventListener('pointerdown',down);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',up);document.removeEventListener('keydown',key);window.removeEventListener('beforeunload',leaving);}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')startReviewClient({document,window,fetch:window.fetch.bind(window)});
