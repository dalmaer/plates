// The review session (plates phase 174): the docket in "Needs you", one full
// screen card at a time, answered from a bottom bar. Shared by the server (the
// first card, so /review is never blank before JS) and the browser
// (/assets/review-views.mjs). The page has its own layout inside the shell and
// theme: no navigation header and no page footer. Colours, buttons, the toast
// and the progress bar come from the design layer; review.css places them.
import {inlineMarkdown} from './markdown.mjs';
import {decisionHref,safeSourceLink} from './source-links.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list=value=>Array.isArray(value)?value:[];
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);

// Layout only (tests/web-design.test.mjs): the card fills the screen, the bar
// sits in the thumb zone above the bottom safe area, answers two to a row.
export const reviewStyles=`
.review{display:flex;flex-direction:column;min-height:100dvh;max-width:720px;margin:0 auto;padding:max(12px,env(safe-area-inset-top)) 16px 0}.review-top{display:flex;align-items:center;gap:12px}.review-top .p-progress{flex:1;min-width:0}.review-count{font-size:var(--t-sm);color:var(--muted);white-space:nowrap}
.review-card{flex:1;padding:20px 0 24px;overflow-wrap:anywhere}.review-chips{display:flex;flex-wrap:wrap;gap:6px}.review-ask{font-size:22px;line-height:1.3;letter-spacing:0;margin:16px 0 10px}.review-why{color:var(--muted);margin:0 0 12px}.review-look{display:flex;align-items:center;min-height:44px}.review-quiet{color:var(--muted);font-size:var(--t-sm)}
.review-bar{position:sticky;bottom:0;margin:0 -16px;padding:12px 16px max(12px,env(safe-area-inset-bottom));border-width:1px 0 0}.review-bar .p-toast{position:absolute;left:16px;right:16px;bottom:calc(100% + 8px)}.p-toast span{flex:1}
.review-answers,.review-more,.review-later{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.review-more,.review-later{margin-top:8px}.review-answers>*,.review-more>*{white-space:normal}.review-answers>:last-child:nth-child(odd){grid-column:1/-1}
.review-why-field{display:grid;gap:4px;margin-bottom:8px;font-size:var(--t-sm)}.review-why-field input{width:100%}.review-note{margin:0 0 8px;font-size:var(--t-sm)}.review-error{color:var(--danger)}
`;

/**
 * The docket's items in the model's order (phases 174, 175), each { key, list, kind, label, group, minutes, quick, sets, item };
 * one plate's when projectId is given; only the quick ones (the model's `quick`: 2 minutes or less) when quick is true.
 */
export function docketItems(snapshot,{projectId=null,quick=false,order=null}={}) {
  const byKey=new Map();
  for(const key of ['decisions','walks','reviews'])for(const item of list(snapshot?.[key]))if(item?.key)byKey.set(item.key,item);
  for(const row of list(snapshot?.sections))for(const item of list(row?.items))if(item?.key)byKey.set(item.key,item);
  const out=list(snapshot?.docket).filter(entry=>entry&&byKey.has(entry.key)&&(!projectId||entry.key.startsWith(`${projectId}:`))&&(!quick||entry.quick===true)).map(entry=>({...entry,item:byKey.get(entry.key)}));
  // From Yours (phase 180): exactly the lane's items, in the backlog's order.
  if(!Array.isArray(order))return out;
  const at=new Map(order.map((k,i)=>[k,i]));
  return out.filter(e=>at.has(e.key)).sort((a,b)=>at.get(a.key)-at.get(b.key));
}

/** The owner's lane as the session's docket keys, in the backlog's order: a phase card answers through its walk or step (phase 180). */
export const yoursOrder=backlog=>list(list(backlog?.lanes).find(l=>l?.lane==='yours')?.items).map(i=>list(i.children)[0]??i.key);

/** What is left, honestly (phase 180): how many, and the minutes from Takes and DEFAULT_MINUTES; "at least" when one is unknown. */
export function sessionTime(entries) {
  const known=list(entries).filter(e=>Number.isSafeInteger(e?.minutes)&&e.minutes>=0);
  return {count:list(entries).length,minutes:known.reduce((n,e)=>n+e.minutes,0),atLeast:known.length<list(entries).length};
}
export const sessionLine=({count,minutes,atLeast})=>`${count} left · ${atLeast?'at least ':'~'}${minutes} min`;

/** Whether the lane was read completely: Needs you's count is not "known" (a plate or source not read), and no plate is still loading or stale. */
export const laneComplete=snapshot=>{
  const needs=list(snapshot?.home?.sections).find(s=>s?.id==='needs-you');
  return !!needs&&needs.known!==true&&!list(snapshot?.projects).some(p=>['loading','stale','unavailable'].includes(p?.state));
};

/** The Start panel's numbers: how many, about how long in all (the sum of the model's estimates), and how many are quick. */
export function docketTotals(items) {
  const minutes=n=>Number.isSafeInteger(n)&&n>0?n:0;
  return {count:items.length,minutes:items.reduce((sum,e)=>sum+minutes(e.minutes),0),quick:items.filter(e=>e.quick===true).length};
}
export const aboutMinutes=n=>`about ${n} min`;

/** What an answer sets moving, in words: "phase 176 (Merges from home)", "claims/phase-7 freed". */
export const setsText=sets=>list(sets).map(s=>s?.kind==='claim'?`${s.branch} freed`:s?.kind==='phase'?`phase ${s.phase}${s.title?` (${s.title})`:''}`:null).filter(Boolean);

/** The end screen's total of what the settled answers set moving: { phases, claims }. */
export function setMoving(settled) {
  const phases=new Set(),claims=new Set();
  for(const x of list(settled))for(const s of list(x?.sets)){if(s?.kind==='phase')phases.add(`${x.key?.split(':')[0]}:${s.phase}`);else if(s?.kind==='claim')claims.add(`${x.key?.split(':')[0]}:${s.branch}`);}
  return {phases:phases.size,claims:claims.size};
}
export const setMovingText=({phases,claims})=>[phases?`${phases} phase${phases===1?'':'s'} can start`:null,claims?`${claims} claim${claims===1?'':'s'} freed`:null].filter(Boolean).join(' · ');

/** The answers a card shows as big buttons: every answer but the plain Not now, which has its own button (a "Keep" or "Not yet" stays an answer). */
export const cardAnswers=item=>list(item?.answers).filter(a=>!(a.id==='not-now'&&a.label==='Not now'));
export const notNowAnswer=item=>list(item?.answers).find(a=>a.id==='not-now')??null;

/** Where "look at" goes: a decision's own page, else the item's GitHub source. */
function lookAt(item) {
  const decision=decisionHref(item),source=safeSourceLink(item.link);
  const href=decision??source;if(!href)return '';
  const label=item.details?.look?inlineMarkdown(item.details.look):escape(decision?'Open the decision':item.kind==='review'||item.itemKind==='review'?'Open the pull request':'Open the source');
  return `<p class="review-look"><a href="${escape(href)}" target="_blank" rel="noreferrer" data-review-look>Look at: ${label} ↗</a></p>`;
}

function answerButton(answer,index) {
  const off=answer.unavailable,filled=answer.recommended&&!off;
  // A recommended answer says so in words as well as fill (phase 178), so a disabled one still reads as recommended.
  return `<button type="button" class="p-lg${filled?'':' p-quiet'}" data-answer="${escape(answer.id)}"${answer.recommended?' data-recommended':''}${off?' aria-disabled="true"':''}${index<4?` aria-keyshortcuts="${index+1}"`:''}>${escape(answer.label)}${answer.recommended?' · Recommended':''}</button>`;
}

/** The peek stack (phase 180): the next card's header, so the owner sees what comes next. */
function peek(entry) {
  const item=entry.item??{},plate=item.projectName??item.plate??entry.key.split(':')[0];
  return `<aside class="review-peek" data-review-peek="${escape(entry.key)}" aria-label="Next card"><span class="review-quiet">Next</span> <span class="p-badge">${escape(plate)}</span> <span class="p-badge">${escape(entry.label)}</span> ${inlineMarkdown(item.details?.ask??item.title)}</aside>`;
}

/** One card: the ask, why, look at, and the bottom bar of answers (keys 1–4, W, N; ← → flip). */
export function renderReviewCard(entry,{index=0,total=1,reason=null,next=null,remaining=null}={}) {
  const item=entry.item,details=item.details??{};
  const plate=item.projectName??item.plate??entry.key.split(':')[0];
  const chips=[plate,entry.label,Number.isSafeInteger(entry.minutes)?aboutMinutes(entry.minutes):details.takes].filter(Boolean).map(text=>`<span class="p-badge">${escape(text)}</span>`).join('');
  const why=details.why??item.why;
  const answers=cardAnswers(item),later=notNowAnswer(item);
  return `<div class="review-top"><button type="button" class="p-ghost" data-review-close aria-label="End the review" aria-keyshortcuts="Escape">✕</button><progress class="p-progress" max="${total}" value="${index+1}" aria-label="Card ${index+1} of ${total}"></progress><span class="review-count">${index+1} of ${total}</span></div>${remaining?`<p class="review-left" data-review-left>${escape(sessionLine(sessionTime(remaining)))}</p>`:''}`
    +`<article class="review-card" data-review-card="${escape(entry.key)}"><div class="review-chips">${chips}</div><h1 class="review-ask" tabindex="-1">${inlineMarkdown(details.ask??item.title)}</h1>${why?`<p class="review-why">${inlineMarkdown(why)}</p>`:''}${details.ask&&details.ask!==item.title?`<p class="review-quiet">${inlineMarkdown(item.title)}</p>`:''}${lookAt(item)}${setsText(entry.sets).length?`<p class="review-quiet" data-review-sets>Sets moving: ${escape(setsText(entry.sets).join(' · '))}</p>`:''}${reason?`<p class="review-note p-card" role="alert"><strong>Needs another look.</strong> ${escape(reason)}</p>`:''}</article>${next?peek(next):''}`
    +`<div class="review-bar p-glass" data-review-bar><div class="p-toast" data-review-toast role="status" hidden></div><p class="review-note" data-review-note role="status" hidden></p><label class="review-why-field" data-review-why hidden>Why, in one line <span class="review-error" data-review-why-error></span><input type="text" class="p-field" maxlength="300" autocomplete="off" enterkeyhint="send" data-review-why-input></label>`
    +`<div class="review-answers">${answers.map(answerButton).join('')}</div><div class="review-more"><button type="button" class="quiet" data-review-add-why aria-keyshortcuts="W">Add why</button>${later?`<button type="button" class="quiet" data-review-not-now aria-keyshortcuts="N"${later.unavailable?' aria-disabled="true"':''}>Not now</button>`:''}</div>`
    +`<div class="review-later" data-review-later hidden><button type="button" class="quiet" data-review-until="1">Tomorrow</button><button type="button" class="quiet" data-review-until="7">Next week</button><input type="text" class="p-field" maxlength="300" autocomplete="off" aria-label="Why not now (optional)" placeholder="Why not now (optional)" data-review-reason><input type="date" class="p-field" aria-label="Put off until" data-review-until-date><button type="button" class="quiet" data-review-until="date">Put off until then</button></div></div>`;
}

/** The end: what was settled (each with its link), what was put off, and what needs another look, with the reason. */
export function renderReviewEnd({settled=[],putOff=[],again=[],skipped=[],home='/'}={},{nothing=false,loading=false,complete=false}={}) {
  const title=item=>inlineMarkdown(item.details?.ask??item.title);
  const link=href=>{const safe=safeSourceLink(href)??(typeof href==='string'&&/^\/projects\/[a-z][a-z0-9-]{0,63}\/operations\/[a-f0-9]{64}$/.test(href)?href:null);return safe?` <a href="${escape(safe)}" target="_blank" rel="noreferrer">${safe.startsWith('https:')?'the commit':'the operation'} ↗</a>`:'';};
  const section=(heading,rows)=>rows.length?`<h2>${heading}</h2><ul>${rows.join('')}</ul>`:'';
  // "All caught up" (phase 180) only when the lane was read completely and nothing came back or was skipped: never on a partial read.
  const caught=complete&&!again.length&&!skipped.length;
  const head=loading?'<h1 class="review-ask">Reading what needs you…</h1><p class="review-why">The plates are still being read. This page fills in when they are.</p>':nothing?(complete?'<h1 class="review-ask" data-review-caught-up>All caught up</h1><p class="review-why">Every item waiting on you is answered or put off. Home lists what is moving.</p>':'<h1 class="review-ask">Nothing needs you in what was read</h1><p class="review-why">Some plates or sources were not read completely, so this is not all caught up. Home says which.</p>')
    :caught?`<h1 class="review-ask" data-review-caught-up>All caught up</h1><p class="review-why">${settled.length} settled · ${putOff.length} put off</p>`:`<h1 class="review-ask">${again.length?'Almost done':'Done for now'}</h1><p class="review-why">${settled.length} settled · ${putOff.length} put off${again.length?` · ${again.length} need${again.length===1?'s':''} another look`:''}${skipped.length?` · ${skipped.length} skipped`:''}</p>`;
  return `<section class="review-card review-end" data-review-end tabindex="-1">${head}`
    +section('Needs another look',again.map(x=>`<li><strong>${title(x.item)}</strong>: ${escape(x.reason)}${link(x.link)}${x.command?` <code>${escape(x.command)}</code>`:''}</li>`))
    +section('Set moving',setMovingText(setMoving(settled))?[`<li>${escape(setMovingText(setMoving(settled)))}: ${escape(settled.flatMap(x=>setsText(x.sets)).filter((v,i,a)=>a.indexOf(v)===i).join(' · '))}</li>`]:[])
    +section('Settled',settled.map(x=>`<li>${title(x.item)}: ${escape(x.label)}${link(x.link)}</li>`))
    +section('Put off',putOff.map(x=>`<li>${title(x.item)}: put off until ${escape(x.until)}</li>`))
    +section('Skipped',skipped.map(x=>`<li>${title(x.item)}: still waiting on Home</li>`))
    +`<p><a class="button p-lg" href="${escape(home)}" data-review-home>Back to Home</a></p></section>`;
}

/** The whole page, server-side: its own layout, inside the shell and theme. */
export function reviewView(access,snapshot,project=null,{quick=false,order=null}={}) {
  const projectId=slug(project?.id)?project.id:null,home=order?'/backlog':projectId?`/projects/${projectId}`:'/';
  const items=docketItems(snapshot,{projectId,quick,order}),endpoint=projectId?`/api/projects/${projectId}/home`:'/api/home';
  const loading=list(snapshot?.projects).some(p=>p?.state==='loading');
  const body=items.length?renderReviewCard(items[0],{index:0,total:items.length,next:items[1]??null,remaining:items}):renderReviewEnd({home},{nothing:true,loading,complete:laneComplete(snapshot)});
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Review · ${escape(project?.name||project?.id||access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/review.css"><link rel="stylesheet" href="/assets/review-session.css"></head><body><main class="review" id="main" data-review-root data-endpoint="${escape(endpoint)}" data-home="${escape(home)}" data-project-id="${escape(projectId??'')}" data-count="${items.length}"${quick?' data-quick="1"':''}${order?` data-order="${escape(JSON.stringify(order))}"`:''}><input type="hidden" data-review-csrf value="${escape(access.csrf)}">${body}</main><script type="module" src="/assets/review-client.mjs"></script></body></html>`;
}

/**
 * Home's Start panel: "N need you · about M min" and Start review (Everything and Quick ones, when both are non-empty), or plainly
 * that nothing needs you (no button). N is Needs you's own count (phase 166), so the panel and the section never disagree; the
 * minutes and the session cover the answerable ones (the docket), and a Fix with no answers is counted but not timed.
 */
export function renderReviewStart(snapshot,{projectId=null}={}) {
  const loading=list(snapshot?.projects).some(p=>p?.state==='loading'&&(!projectId||p.id===projectId));
  const totals=docketTotals(docketItems(snapshot,{projectId})),answerable=totals.count;
  const needs=Array.isArray(snapshot?.home?.sections)?snapshot.home.sections.find(s=>s?.id==='needs-you'):null;
  const n=needs?list(needs.items).filter(r=>!projectId||r?.projectId===projectId).length:answerable;
  const href=slug(projectId)?`/projects/${projectId}/review`:'/review';
  // Never hedged here; Needs you's own count says "known" when a read is partial.
  if(!n)return `<p class="review-start p-card"><strong>${loading?'Reading what needs you…':'Nothing needs you'}</strong></p>`;
  const both=totals.quick>0&&totals.quick<answerable;
  // From Yours (phase 180): the same session over the backlog's lane, in its order; on the fleet's Home only.
  const lane=projectId?'':` <a class="button quiet" href="/review/yours" data-review-yours>Your lane, in backlog order</a>`;
  const start=both?`<span><a class="button" href="${href}" data-focus="review-start">Everything</a> <a class="button quiet" href="${href}?quick=1">Quick ones (${totals.quick})</a>${lane}</span>`:`<span><a class="button" href="${href}" data-focus="review-start">Start review</a>${lane}</span>`;
  // A docket from before phase 175 carries no estimates: then the panel says how many, not "about 0 min".
  return `<p class="review-start p-card"><strong>${n} need${n===1?'s':''} you${totals.minutes?` · ${aboutMinutes(totals.minutes)}`:''}</strong>${answerable?start:''}</p>`;
}

/** The session's own parts (phase 180): the running total, the peek and Not now's reason. Layout only; its own sheet and cap. */
export const reviewSessionStyles=`.review-left{margin:4px 0 0;font-size:var(--t-sm);color:var(--muted)}.review-peek{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px;padding:8px 12px;border:1px dashed var(--line-strong);border-radius:var(--r);font-size:var(--t-sm);color:var(--muted);overflow-wrap:anywhere}.review-later [data-review-reason]{grid-column:1/-1}`;
