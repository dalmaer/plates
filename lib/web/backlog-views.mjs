// The backlog (plates phase 178): every plate's work in lanes, as a list beside
// the workspace sidebar (docs/specs/web-backlog.md, "Views → The shape").
// Rendered on the server from the model plates home --backlog prints
// (lib/work-items.mjs backlogFor); read-only, no client script. Colours,
// badges and buttons come from the design layer; backlog.css places them.
import {navigation,navigationFooter,navigationScripts} from './navigation.mjs';
import {safeSourceLink} from './source-links.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list=value=>Array.isArray(value)?value:[];
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);

/** Why Start is off until agents can be attached (phase 181). */
export const START_UNAVAILABLE='Attaching an agent arrives in phase 181';
/** The sidebar's entries after Backlog: present, and not live until their phase. */
export const SIDEBAR_SOON=Object.freeze([{id:'recurring',title:'Recurring',phase:185},{id:'agents',title:'Agents',phase:186},{id:'pending-review',title:'Pending review',phase:186}]);

// Layout only (tests/web-design.test.mjs). One line per row on a laptop: place,
// glyph, plate and ref with the title, chips, and the right edge, where the
// time gives way to the row's action on hover or focus. At 600px and under the
// chips wrap under the title and the sidebar sits above the list.
export const backlogStyles=`
.backlog-shell{max-width:1280px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}.backlog-side{position:sticky;top:96px;display:grid;gap:4px;font-size:var(--t-sm)}.backlog-side a,.backlog-side>span{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:0 12px;border-radius:var(--r-sm);color:var(--ink);text-decoration:none}.backlog-side a[aria-current]{background:var(--surface-raised);font-weight:650}.backlog-side>span{color:var(--muted)}.backlog-side h2{font-size:var(--t-xs);color:var(--muted);margin:16px 12px 4px}.backlog-side ul{list-style:none;margin:0;padding:0 12px}
.backlog-main h1{font-size:28px;margin:0 0 12px}.backlog-lane{margin-bottom:12px}.backlog-lane h2{display:flex;gap:8px;align-items:baseline;font-size:var(--t-sm);margin:0;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--sunken)}.backlog-lane ol{list-style:none;margin:0;padding:0}
.backlog-row{display:grid;grid-template-columns:2.5em 1.25em minmax(0,1fr) auto 9.5em;gap:8px;align-items:center;min-height:44px;padding:0 12px;border-bottom:1px solid var(--line);font-size:var(--t-sm)}.backlog-row:hover,.backlog-row:focus-within{background:var(--surface-raised)}.backlog-n,.backlog-ref,.backlog-edge{color:var(--muted)}.backlog-n{text-align:right}.backlog-what{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.backlog-ref{margin-right:8px}.backlog-chips{display:flex;gap:4px;flex-wrap:wrap;justify-content:end}.backlog-edge{text-align:right;white-space:nowrap}
.backlog-act{display:none}.backlog-row:hover .backlog-act,.backlog-row:focus-within .backlog-act{display:inline-flex}.backlog-row:hover .backlog-act+.backlog-time,.backlog-row:focus-within .backlog-act+.backlog-time{display:none}.backlog-none{margin:0;padding:8px 12px;color:var(--muted);font-size:var(--t-sm)}.backlog-notes{font-size:var(--t-sm);color:var(--muted)}.backlog-shell>footer{grid-column:1/-1}
@media(max-width:600px){.backlog-shell{grid-template-columns:minmax(0,1fr)}.backlog-side{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.backlog-side h2,.backlog-side ul{grid-column:1/-1}.backlog-row{grid-template-columns:2em 1.25em minmax(0,1fr) auto;padding:6px 8px}.backlog-what{white-space:normal}.backlog-edge{grid-column:4;grid-row:1}.backlog-chips{grid-column:3/-1;grid-row:2;justify-content:start}.backlog-chips:empty{display:none}}
`;

const glyph=lane=>lane==='in-flight'?'◐':lane==='done'?'●':'○';
const days=n=>n===1?'1 day':`${n} days`;
/** The right edge: a claim's days left in flight, else how long ago the item appeared. */
export function edgeText(item,lane,generatedAt) {
  if(lane==='in-flight')return item.ageLeft===null||item.ageLeft===undefined?'claim age unknown':item.ageLeft<=0?'claim stale':`claim ${Math.floor(item.ageLeft)}d left`;
  if(typeof item.since!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.since))return 'added: date unknown';
  const n=Math.max(0,Math.round((Date.parse(`${String(generatedAt).slice(0,10)}T00:00:00Z`)-Date.parse(`${item.since}T00:00:00Z`))/86400000));
  return n===0?'added today':`added ${days(n)} ago`;
}
/** A row's ref: a phase or PR by number, anything else by its kind; a loose end's fingerprint says nothing, so only its kind. */
export const refText=item=>item.kind==='phase'&&/^\d+$/.test(item.ref??'')?`#${item.ref}`:item.kind==='review'&&/^\d+$/.test(item.ref??'')?`PR #${item.ref}`:item.ref&&!/^[0-9a-f]{6,64}$/.test(item.ref)?`${item.kind} ${String(item.ref).slice(0,60)}`:item.kind;

/** The row's one action, as Home links it: Start (off until phase 181), Open walk, Answer, or Open PR. */
function action(item,lane) {
  if(lane==='agent-ready')return `<button type="button" class="p-quiet backlog-act" aria-disabled="true" title="${escape(START_UNAVAILABLE)}" data-backlog-start>Start</button>`;
  if(lane!=='yours')return '';
  if(list(item.children).some(key=>key.split(':')[1]==='walk')&&slug(item.projectId))return `<a class="backlog-act" href="/projects/${escape(item.projectId)}/walks">Open walk</a>`;
  if(item.kind==='review'){const href=safeSourceLink(item.source?.url);return href?`<a class="backlog-act" href="${escape(href)}" target="_blank" rel="noreferrer">Open PR ↗</a>`:'';}
  return list(item.answers).length?'<a class="backlog-act" href="/review">Answer</a>':'';
}
function row(item,n,lane,generatedAt) {
  const chips=[item.holder?.provider?`${item.holder.provider}${item.presence?` · ${item.presence}`:''}`:null,item.holder?.pr?.number?`#${item.holder.pr.number}`:null,
    ...list(item.children).map(key=>`+${key.split(':')[1]}`)].filter(Boolean).map(text=>`<span class="p-badge">${escape(text)}</span>`).join('');
  const why=list(item.why).filter(w=>!/^(Waiting|Claimed|Done) /.test(w));
  return `<li class="backlog-row" data-backlog-item="${escape(item.key)}"><span class="backlog-n">${n}</span><span aria-hidden="true">${glyph(lane)}</span><span class="backlog-what"${why.length?` title="${escape(why.join(' · '))}"`:''}><span class="backlog-ref">${escape(item.projectName??item.projectId)} ${escape(refText(item))}</span>${escape(item.title??'')}</span><span class="backlog-chips">${chips}</span><span class="backlog-edge">${action(item,lane)}<span class="backlog-time">${escape(edgeText(item,lane,generatedAt))}</span></span></li>`;
}

/** The list: each lane a section with its count, In flight first; an empty lane says "none"; then what was not read. */
export function renderBacklog(backlog) {
  const lanes=list(backlog?.lanes),plates=list(backlog?.plates),names=new Map(plates.map(p=>[p.projectId,p.projectName??p.projectId]));
  const notes=[...plates.filter(p=>p.state!=='read').map(p=>`${p.projectName??p.projectId}: not read — ${p.reason}`),
    ...list(backlog?.claims).filter(c=>c.read===false&&c.why).map(c=>`${names.get(c.projectId)??c.projectId}: claims not read — ${c.why}; nothing is shown in flight there`),
    ...plates.filter(p=>p.coverage==='partial').map(p=>`${p.projectName??p.projectId}: partly read, so its counts are at least these`),
    ...(backlog?.needsShaping?[`${backlog.needsShaping} free phase${backlog.needsShaping===1?' waits':'s wait'} for shaping (not spec: 2), so ${backlog.needsShaping===1?'it is':'they are'} not agent-ready`]:[])];
  return lanes.map(l=>`<section class="backlog-lane" data-backlog-lane="${escape(l.lane)}" aria-labelledby="lane-${escape(l.lane)}"><h2 id="lane-${escape(l.lane)}">${escape(l.title)} <span class="meta">${list(l.items).length}</span></h2>${list(l.items).length?`<ol>${l.items.map((item,i)=>row(item,i+1,l.lane,backlog.generatedAt)).join('')}</ol>`:'<p class="backlog-none">none</p>'}</section>`).join('')
    +(notes.length?`<ul class="backlog-notes" data-backlog-notes>${notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>`:'');
}

/** The sidebar: Backlog with its count, the entries still to come, each plate's counts (or "not read"), and Links. */
function sidebar(backlog) {
  const total=list(backlog?.lanes).reduce((n,l)=>n+list(l.items).length,0);
  const plates=list(backlog?.plates).map(p=>`<li>${escape(p.projectName??p.projectId)}: ${p.state!=='read'||!p.counts?'not read':`${p.counts.yours} yours · ${p.counts['agent-ready']} agent-ready · ${p.counts['in-flight']} in flight${p.coverage==='partial'?' (at least)':''}`}</li>`).join('');
  return `<aside class="backlog-side" aria-label="Workspace"><a href="/backlog" aria-current="page">Backlog <span class="p-badge">${total}</span></a>${SIDEBAR_SOON.map(s=>`<span data-sidebar-soon="${s.id}" title="Arrives in phase ${s.phase}">${escape(s.title)} <small>coming</small></span>`).join('')}<h2>Plates</h2><ul data-backlog-plates>${plates||'<li>none</li>'}</ul><h2>Links</h2><ul><li>none yet</li></ul></aside>`;
}

/** The whole page, server-side, inside the workspace's navigation and theme. */
export function backlogView(access,backlog) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backlog · ${escape(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/backlog.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:'/backlog'})}<main id="main" class="backlog-shell">${sidebar(backlog)}<div class="backlog-main"><h1>Backlog</h1>${renderBacklog(backlog)}</div><footer>Read only. Lanes are derived on every read; nothing here starts work.</footer></main>${navigationFooter(access)}${navigationScripts}</body></html>`;
}
