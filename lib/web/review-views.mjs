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

/** The docket's items in the model's order (phase 174), each { key, list, kind, label, item }; one plate's when projectId is given. */
export function docketItems(snapshot,{projectId=null}={}) {
  const byKey=new Map();
  for(const key of ['decisions','walks','reviews'])for(const item of list(snapshot?.[key]))if(item?.key)byKey.set(item.key,item);
  for(const row of list(snapshot?.sections))for(const item of list(row?.items))if(item?.key)byKey.set(item.key,item);
  return list(snapshot?.docket).filter(entry=>entry&&byKey.has(entry.key)&&(!projectId||entry.key.startsWith(`${projectId}:`))).map(entry=>({...entry,item:byKey.get(entry.key)}));
}

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
  return `<button type="button" class="p-lg${filled?'':' p-quiet'}" data-answer="${escape(answer.id)}"${off?' aria-disabled="true"':''}${index<4?` aria-keyshortcuts="${index+1}"`:''}>${escape(answer.label)}</button>`;
}

/** One card: the ask, why, look at, and the bottom bar of answers (keys 1–4, W, N). */
export function renderReviewCard(entry,{index=0,total=1,reason=null}={}) {
  const item=entry.item,details=item.details??{};
  const plate=item.projectName??item.plate??entry.key.split(':')[0];
  const chips=[plate,entry.label,details.takes].filter(Boolean).map(text=>`<span class="p-badge">${escape(text)}</span>`).join('');
  const why=details.why??item.why;
  const answers=cardAnswers(item),later=notNowAnswer(item);
  return `<div class="review-top"><button type="button" class="p-ghost" data-review-close aria-label="End the review" aria-keyshortcuts="Escape">✕</button><progress class="p-progress" max="${total}" value="${index+1}" aria-label="Card ${index+1} of ${total}"></progress><span class="review-count">${index+1} of ${total}</span></div>`
    +`<article class="review-card" data-review-card="${escape(entry.key)}"><div class="review-chips">${chips}</div><h1 class="review-ask" tabindex="-1">${inlineMarkdown(details.ask??item.title)}</h1>${why?`<p class="review-why">${inlineMarkdown(why)}</p>`:''}${details.ask&&details.ask!==item.title?`<p class="review-quiet">${inlineMarkdown(item.title)}</p>`:''}${lookAt(item)}${reason?`<p class="review-note p-card" role="alert"><strong>Needs another look.</strong> ${escape(reason)}</p>`:''}</article>`
    +`<div class="review-bar p-glass" data-review-bar><div class="p-toast" data-review-toast role="status" hidden></div><p class="review-note" data-review-note role="status" hidden></p><label class="review-why-field" data-review-why hidden>Why, in one line <span class="review-error" data-review-why-error></span><input type="text" class="p-field" maxlength="300" autocomplete="off" enterkeyhint="send" data-review-why-input></label>`
    +`<div class="review-answers">${answers.map(answerButton).join('')}</div><div class="review-more"><button type="button" class="quiet" data-review-add-why aria-keyshortcuts="W">Add why</button>${later?`<button type="button" class="quiet" data-review-not-now aria-keyshortcuts="N"${later.unavailable?' aria-disabled="true"':''}>Not now</button>`:''}</div>`
    +`<div class="review-later" data-review-later hidden><button type="button" class="quiet" data-review-until="1">Tomorrow</button><button type="button" class="quiet" data-review-until="7">Next week</button><input type="date" class="p-field" aria-label="Put off until" data-review-until-date><button type="button" class="quiet" data-review-until="date">Put off until then</button></div></div>`;
}

/** The end: what was settled (each with its link), what was put off, and what needs another look, with the reason. */
export function renderReviewEnd({settled=[],putOff=[],again=[],home='/'}={},{nothing=false,loading=false}={}) {
  const title=item=>inlineMarkdown(item.details?.ask??item.title);
  const link=href=>{const safe=safeSourceLink(href)??(typeof href==='string'&&/^\/projects\/[a-z][a-z0-9-]{0,63}\/operations\/[a-f0-9]{64}$/.test(href)?href:null);return safe?` <a href="${escape(safe)}" target="_blank" rel="noreferrer">${safe.startsWith('https:')?'the commit':'the operation'} ↗</a>`:'';};
  const section=(heading,rows)=>rows.length?`<h2>${heading}</h2><ul>${rows.join('')}</ul>`:'';
  const head=loading?'<h1 class="review-ask">Reading what needs you…</h1><p class="review-why">The plates are still being read. This page fills in when they are.</p>':nothing?'<h1 class="review-ask">Nothing needs you</h1><p class="review-why">Every item waiting on you is answered or put off. Home lists what is moving.</p>'
    :`<h1 class="review-ask">${again.length?'Almost done':'Done for now'}</h1><p class="review-why">${settled.length} settled · ${putOff.length} put off${again.length?` · ${again.length} need${again.length===1?'s':''} another look`:''}</p>`;
  return `<section class="review-card review-end" data-review-end tabindex="-1">${head}`
    +section('Needs another look',again.map(x=>`<li><strong>${title(x.item)}</strong>: ${escape(x.reason)}${link(x.link)}${x.command?` <code>${escape(x.command)}</code>`:''}</li>`))
    +section('Settled',settled.map(x=>`<li>${title(x.item)}: ${escape(x.label)}${link(x.link)}</li>`))
    +section('Put off',putOff.map(x=>`<li>${title(x.item)}: put off until ${escape(x.until)}</li>`))
    +`<p><a class="button p-lg" href="${escape(home)}" data-review-home>Back to Home</a></p></section>`;
}

/** The whole page, server-side: its own layout, inside the shell and theme. */
export function reviewView(access,snapshot,project=null) {
  const projectId=slug(project?.id)?project.id:null,home=projectId?`/projects/${projectId}`:'/';
  const items=docketItems(snapshot,{projectId}),endpoint=projectId?`/api/projects/${projectId}/home`:'/api/home';
  const loading=list(snapshot?.projects).some(p=>p?.state==='loading');
  const body=items.length?renderReviewCard(items[0],{index:0,total:items.length}):renderReviewEnd({home},{nothing:true,loading});
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Review · ${escape(project?.name||project?.id||access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/review.css"></head><body><main class="review" id="main" data-review-root data-endpoint="${escape(endpoint)}" data-home="${escape(home)}" data-project-id="${escape(projectId??'')}" data-count="${items.length}"><input type="hidden" data-review-csrf value="${escape(access.csrf)}">${body}</main><script type="module" src="/assets/review-client.mjs"></script></body></html>`;
}

/** Home's Start panel: "N for you · Start review", or plainly that nothing needs you (no button). */
export function renderReviewStart(snapshot,{projectId=null}={}) {
  const loading=list(snapshot?.projects).some(p=>p?.state==='loading'&&(!projectId||p.id===projectId));
  const n=docketItems(snapshot,{projectId}).length,partial=snapshot?.coverage?.state!=='complete';
  const href=slug(projectId)?`/projects/${projectId}/review`:'/review';
  if(!n)return `<p class="review-start p-card"><strong>${loading?'Reading what needs you…':partial?'Nothing known needs you':'Nothing needs you'}</strong></p>`;
  return `<p class="review-start p-card"><strong>${partial?'At least ':''}${n} for you</strong><a class="button" href="${href}" data-focus="review-start">Start review</a></p>`;
}
