// The backlog (plates phase 178): every plate's work in lanes, as a list beside
// the workspace sidebar (docs/specs/web-backlog.md, "Views → The shape").
// Rendered on the server from the model plates home --backlog prints
// (lib/work-items.mjs backlogFor); read-only. Browser-safe: while a plate is
// loading, /assets/backlog-client.mjs reads /api/backlog and renders the list
// and sidebar again with these same functions. Colours,
// badges and buttons come from the design layer; backlog.css places them.
import {navigation,navigationFooter,navigationScripts} from './navigation.mjs';
import {safeSourceLink} from './source-links.mjs';
import {scheduleParts,timeText} from './recurring-model.mjs';
import {byGoal,countsText,memberText,GOAL_SHOWN} from './backlog-grouping.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list=value=>Array.isArray(value)?value:[];
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);

/** Why Start is off on the web (phase 181): attaching writes a claim, and the hosted attach is not on yet; the row says the command that attaches from the plate's checkout. */
export const START_UNAVAILABLE='Attaching from the web is not on yet. In the plate\'s checkout run';
/** The command that attaches an agent to a phase from its checkout (plates home --attach, phase 181). */
export const attachCommand=key=>`plates home --attach ${key} --route session`;
/** The sidebar's entries after Backlog: present, and not live until their phase. */
/** Sidebar entries still to come: none since phase 186. */
export const SIDEBAR_SOON=Object.freeze([]);

// Layout only (tests/web-design.test.mjs). One line per row on a laptop: place,
// glyph, plate and ref with the title, chips, and the right edge, where the
// time gives way to the row's action on hover or focus. At 600px and under the
// chips wrap under the title and the sidebar sits above the list.
export const backlogStyles=`
.backlog-shell{max-width:1280px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}.backlog-side{position:sticky;top:96px;display:grid;gap:4px;font-size:var(--t-sm)}.backlog-side>a,.backlog-side>span{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:0 12px;border-radius:var(--r-sm);color:var(--ink);text-decoration:none}.backlog-side>a[aria-current]{background:var(--surface-raised);font-weight:650}.backlog-side>span{color:var(--muted)}.backlog-side h2{font-size:var(--t-xs);color:var(--muted);margin:16px 12px 4px}.backlog-side ul{list-style:none;margin:0;padding:0 12px}
.backlog-main h1{font-size:28px;margin:0 0 12px}.backlog-lane{margin-bottom:12px}.backlog-lane h2{display:flex;gap:8px;align-items:baseline;font-size:var(--t-sm);margin:0;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--sunken)}.backlog-lane ol{list-style:none;margin:0;padding:0}
.backlog-row{display:grid;grid-template-columns:2.5em 1.25em minmax(0,1fr) auto 9.5em;gap:8px;align-items:center;min-height:44px;padding:0 12px;border-bottom:1px solid var(--line);font-size:var(--t-sm)}.backlog-row:hover,.backlog-row:focus-within{background:var(--surface-raised)}.backlog-n,.backlog-ref,.backlog-edge{color:var(--muted)}.backlog-n{text-align:right}.backlog-what{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.backlog-ref{margin-right:8px}.backlog-chips{display:flex;gap:4px;flex-wrap:wrap;justify-content:end}.backlog-q{white-space:normal;padding:6px 0}.backlog-q>strong,.backlog-q>.backlog-ref{display:block}.backlog-choices{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.backlog-choices [data-recommended]{border-color:var(--accent)}.backlog-edge{text-align:right;white-space:nowrap}
.backlog-act{display:none}.backlog-row:hover .backlog-act,.backlog-row:focus-within .backlog-act{display:inline-flex}.backlog-row:hover .backlog-act+.backlog-time,.backlog-row:focus-within .backlog-act+.backlog-time{display:none}.backlog-none{margin:0;padding:8px 12px;color:var(--muted);font-size:var(--t-sm)}.backlog-notes{font-size:var(--t-sm);color:var(--muted)}.backlog-shell>footer{grid-column:1/-1}.backlog-toggle{margin:0 0 8px;font-size:var(--t-sm)}.backlog-toggle [aria-current]{font-weight:650;text-decoration:none;color:var(--ink)}.backlog-members{margin:0;padding:0 0 6px;grid-column:3/-1;font-size:var(--t-sm);color:var(--muted)}.backlog-more{padding:4px 12px;font-size:var(--t-sm)}.recurring-row{padding:8px 12px;border-bottom:1px solid var(--line);font-size:var(--t-sm)}.recurring-row p{margin:2px 0;max-width:none}
@media(max-width:600px){.backlog-shell{grid-template-columns:minmax(0,1fr)}.backlog-side{position:static;grid-template-columns:repeat(2,minmax(0,1fr))}.backlog-side h2,.backlog-side ul{grid-column:1/-1}.backlog-row{grid-template-columns:2em 1.25em minmax(0,1fr) auto;padding:6px 8px}.backlog-what{white-space:normal}.backlog-edge{grid-column:4;grid-row:1}.backlog-chips{grid-column:3/-1;grid-row:2;justify-content:start}.backlog-chips:empty{display:none}.backlog-q{grid-column:3/-1}.backlog-row:has(.backlog-q) .backlog-edge{grid-row:3;grid-column:3/-1;text-align:left}.backlog-choices a{white-space:normal}}
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
  if(lane==='agent-ready')return `<button type="button" class="p-quiet backlog-act" aria-disabled="true" title="${escape(`${START_UNAVAILABLE}: ${attachCommand(item.key)}`)}" data-backlog-start>Start</button>`;
  if(lane!=='yours')return '';
  if(list(item.children).some(key=>key.split(':')[1]==='walk')&&slug(item.projectId))return `<a class="backlog-act" href="/projects/${escape(item.projectId)}/walks">Open walk</a>`;
  if(item.kind==='review'){const href=safeSourceLink(item.source?.url);return href?`<a class="backlog-act" href="${escape(href)}" target="_blank" rel="noreferrer">Open PR ↗</a>`:'';}
  return list(item.answers).length?'<a class="backlog-act" href="/review">Answer</a>':'';
}
function row(item,n,lane,generatedAt) {
  const chips=[item.holder?.provider?`${item.holder.provider}${item.presence?` · ${item.presence}`:''}`:null,item.holder?.pr?.number?`#${item.holder.pr.number}`:null,
    ...list(item.children).map(key=>`+${key.split(':')[1]}`)].filter(Boolean).map(text=>`<span class="p-badge">${escape(text)}</span>`).join('');
  const why=list(item.why).filter(w=>!/^(Waiting|Claimed|Done) /.test(w));
  const q=item.question&&typeof item.question.ask==='string'?item.question:null,ref=`${escape(item.projectName??item.projectId)} ${escape(refText(item))}`;
  // A question leads its row (phase 178): the Ask, then the plate, ref and title, then its choices, each going where Home answers.
  const what=q?`<strong>${escape(q.ask)}</strong><span class="backlog-ref">${ref} · ${escape(item.title??'')}</span>${list(q.choices).length?`<span class="backlog-choices">${q.choices.map(c=>`<a class="p-badge" href="/review"${c===q.recommend?' data-recommended':''}>${escape(c)}${c===q.recommend?' · Recommended':''}</a>`).join('')}</span>`:''}`
    :`<span class="backlog-ref">${ref}</span>${escape(item.title??'')}`;
  return `<li class="backlog-row" data-backlog-item="${escape(item.key)}"><span class="backlog-n">${n}</span><span aria-hidden="true">${glyph(lane)}</span><span class="backlog-what${q?' backlog-q':''}"${why.length?` title="${escape(why.join(' · '))}"`:''}>${what}</span><span class="backlog-chips">${chips}</span><span class="backlog-edge">${action(item,lane)}<span class="backlog-time">${escape(edgeText(item,lane,generatedAt))}</span></span></li>`;
}

/** The list: each lane a section with its count, In flight first; an empty lane says "none"; then what was not read. */
export function renderBacklog(backlog) {
  const lanes=list(backlog?.lanes),plates=list(backlog?.plates),names=new Map(plates.map(p=>[p.projectId,p.projectName??p.projectId]));
  const notes=[...plates.filter(p=>p.state==='loading').map(p=>`${p.projectName??p.projectId}: loading`),...plates.filter(p=>p.state==='not read').map(p=>`${p.projectName??p.projectId}: not read — ${p.reason}`),
    ...list(backlog?.claims).filter(c=>c.read===false&&c.why).map(c=>`${names.get(c.projectId)??c.projectId}: claims not read — ${c.why}; nothing is shown in flight there`),
    ...plates.filter(p=>p.state==='stale').map(p=>`${p.projectName??p.projectId}: stale, ${readAgo(p.readAt,backlog?.generatedAt)}, so its counts are at least these; a fresh read is under way`),
    ...plates.filter(p=>p.state!=='stale'&&p.coverage==='partial').map(p=>`${p.projectName??p.projectId}: partly read, so its counts are at least these`),
    ...(backlog?.needsShaping?[`${backlog.needsShaping} free phase${backlog.needsShaping===1?' waits':'s wait'} for shaping (not spec: 2), so ${backlog.needsShaping===1?'it is':'they are'} not agent-ready`]:[])];
  // Start (phase 180): the owner's lane as a review session, in this order, with what it takes.
  const start=l=>{if(l.lane!=='yours'||!list(l.items).length)return '';const known=l.items.filter(i=>Number.isSafeInteger(i.takes)),m=known.reduce((n,i)=>n+i.takes,0);return `<p class="backlog-none"><a class="button" href="/review/yours" data-backlog-start-session>Start · ${l.items.length} · ${known.length<l.items.length?'at least ':'~'}${m} min</a></p>`;};
  return lanes.map(l=>`<section class="backlog-lane" data-backlog-lane="${escape(l.lane)}" aria-labelledby="lane-${escape(l.lane)}"><h2 id="lane-${escape(l.lane)}">${escape(l.title)} <span class="meta">${list(l.items).length}</span></h2>${start(l)}${list(l.items).length?`<ol>${l.items.map((item,i)=>row(item,i+1,l.lane,backlog.generatedAt)).join('')}</ol>`:'<p class="backlog-none">none</p>'}</section>`).join('')
    +(notes.length?`<ul class="backlog-notes" data-backlog-notes>${notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>`:'');
}

/** Whether any plate is still loading or stale: the page then reads /api/backlog until none is. */
export const backlogLoading=backlog=>list(backlog?.plates).some(p=>p?.state==='loading'||p?.state==='stale');
/** How long ago a stale plate was read, as Home says ages. */
export function readAgo(readAt,generatedAt) {
  const ms=Date.parse(generatedAt??'')-Date.parse(readAt??'');
  return !Number.isFinite(ms)?'read at an unknown time':ms<3600000?`read ${Math.max(0,Math.round(ms/60000))} min ago`:ms<172800000?`read ${Math.round(ms/360000)/10} h ago`:`read ${Math.round(ms/86400000)} days ago`;
}

/** A plate's line in the sidebar on the backlog: its counts, or loading, or not read. */
const backlogPlate=(p,generatedAt)=>`${escape(p.projectName??p.projectId)}: ${p.state==='loading'?'loading':!['read','stale'].includes(p.state)||!p.counts?'not read':`${p.state==='stale'?`stale, ${readAgo(p.readAt,generatedAt)} · `:''}${p.counts.yours} yours · ${p.counts['agent-ready']} agent-ready · ${p.counts['in-flight']} in flight${p.coverage==='partial'?' (at least)':''}`}`;
/** A plate's line in the sidebar on Recurring: how many routines, or loading, or not read. */
const recurringPlate=p=>`${escape(p.projectName??p.projectId)}: ${p.state==='loading'?'loading':!Array.isArray(p.routines)?'not read':`${p.routines.length} routine${p.routines.length===1?'':'s'}${p.state==='stale'?' (stale)':''}`}`;
const link=(href,label)=>{const safe=safeSourceLink(href)??(typeof href==='string'&&/^https:\/\/[^\s"'<>]+$/.test(href)?href:null);return safe?`<a href="${escape(safe)}" target="_blank" rel="noreferrer">${escape(label)} ↗</a>`:'';};

/**
 * The sidebar, the same on Backlog and Recurring (phases 178, 185): Backlog and Recurring, the entries still to come,
 * each plate's line, the workspace's people (Humans) and each plate's Links. model.sidebar: { humans, links }.
 */
export function renderSidebar(model,{active='backlog'}={}) {
  const counts=model?.sidebar?.counts??{};
  const total=active==='backlog'?list(model?.lanes).reduce((n,l)=>n+list(l.items).length,0):active==='recurring'?list(model?.plates).reduce((n,p)=>n+list(p.routines).length,0):null;
  const own={backlog:total,recurring:total,agents:active==='agents'?list(model?.agents?.providers).filter(p=>p.state==='working').length:counts.agents,pending:active==='agents'&&list(model?.pending?.plates).some(p=>p.state==='read')?list(model?.pending?.items).length:counts.pending};
  const badge=n=>Number.isSafeInteger(n)?` <span class="p-badge">${n}</span>`:'';
  const entry=(id,href,title,count)=>`<a href="${href}"${active===id?' aria-current="page"':''}>${title}${active===id||['agents','pending'].includes(id)?badge(count):''}</a>`;
  const plateLine=p=>active==='backlog'?backlogPlate(p,model?.generatedAt):active==='recurring'?recurringPlate(p):`${escape(p.projectName??p.projectId)}: ${p.state==='read'?'read':escape(p.state)}`;
  const plates=list(active==='agents'?model?.agents?.plates:model?.plates).map(p=>`<li>${plateLine(p)}</li>`).join('');
  const humans=list(model?.sidebar?.humans).map(h=>`<li>${escape(h.login)}${h.role?` <small>${escape(h.role)}</small>`:''}</li>`).join('');
  const links=list(model?.sidebar?.links).map(l=>{const a=[link(l.repo,'repo'),link(l.canvas,'canvas'),link(l.production,'production')].filter(Boolean);return a.length?`<li>${escape(l.projectName??l.projectId)}: ${a.join(' · ')}</li>`:'';}).join('');
  return `<aside class="backlog-side" aria-label="Workspace" data-backlog-side>${entry('backlog','/backlog','Backlog',own.backlog)}${entry('recurring','/recurring','Recurring',own.recurring)}${entry('agents','/agents','Agents',own.agents)}${entry('pending','/agents#pending','Pending review',own.pending)}${SIDEBAR_SOON.map(s=>`<span data-sidebar-soon="${s.id}" title="Arrives in phase ${s.phase}">${escape(s.title)} <small>coming</small></span>`).join('')}<h2>Plates</h2><ul data-backlog-plates>${plates||'<li>none</li>'}</ul><h2>Humans</h2><ul data-sidebar-humans>${humans||'<li>unknown</li>'}</ul><h2>Links</h2><ul data-sidebar-links>${links||'<li>none</li>'}</ul></aside>`;
}

/** Agents (phase 186): each provider and what it holds or idle, each route on or off with its reason; then Pending review. */
export function renderAgents(model) {
  const a=model?.agents??{},p=model?.pending??{};
  const holds=x=>x.holds.length?`<ol>${x.holds.map(h=>`<li class="recurring-row" data-agent-holds="${escape(`${h.projectId}:${h.phase}`)}"><p>working on <strong>${escape(h.projectName)} #${escape(h.phase)}</strong>${h.title?` ${escape(h.title)}`:''}</p><p class="meta">${escape(h.presence)}${h.machine?` on ${escape(h.machine)}`:''}${h.since?` · since ${when(h.since,'datetime')}`:''} <small>(${escape(h.presenceSource)})</small></p></li>`).join('')}</ol>`:'<p class="backlog-none">idle</p>';
  const providers=list(a.providers).map(x=>`<section class="backlog-lane" data-agent="${escape(x.id)}" aria-labelledby="agent-${escape(x.id)}"><h2 id="agent-${escape(x.id)}">${escape(x.id)} <span class="meta">${x.state==='working'?`${x.holds.length} held`:'idle'}${x.listed?'':' · not in agents'}</span></h2>${holds(x)}</section>`).join('')||'<p class="backlog-none">none listed in "agents"</p>';
  const routes=`<section class="backlog-lane" aria-labelledby="routes"><h2 id="routes">Routes <span class="meta">${list(a.routes).filter(r=>r.state==='on').length} on</span></h2><ol>${list(a.routes).map(r=>`<li class="recurring-row" data-route="${escape(r.id)}"${r.state==='off'?' data-off':''}><p><strong>${escape(r.title)}</strong> · ${r.state==='on'?`on for ${escape(r.plates.join(', '))}`:`off: ${list(r.off).map(o=>`${escape(o.why)} (<code>${escape(o.key)}</code>${list(o.plates).length?`: ${escape(o.plates.join(', '))}`:''})`).join('; ')||'no plate read'}`}</p><p class="meta">${escape(r.start)}</p></li>`).join('')}</ol></section>`;
  const prs=list(p.items).map((x,i)=>`<li class="backlog-row" data-pending="${escape(x.key)}"><span class="backlog-n">${i+1}</span><span aria-hidden="true">○</span><span class="backlog-what"><span class="backlog-ref">${escape(x.projectName)} #${escape(x.number)}</span>${safeSourceLink(x.url)?`<a href="${escape(safeSourceLink(x.url))}" target="_blank" rel="noreferrer">${escape(x.title)}</a>`:escape(x.title)}</span><span class="backlog-chips">${[x.draft?'draft':null,x.review].filter(Boolean).map(t=>`<span class="p-badge">${escape(t)}</span>`).join('')}</span><span class="backlog-edge"><span class="backlog-time">${x.ageDays===null?'age unknown':x.ageDays===0?'opened today':`opened ${x.ageDays} day${x.ageDays===1?'':'s'} ago`}</span></span></li>`).join('');
  const unread=list(p.plates).filter(x=>x.state!=='read');
  const pending=`<section class="backlog-lane" id="pending" aria-labelledby="pending-title"><h2 id="pending-title">Pending review <span class="meta">${list(p.items).length}${unread.length?' (at least)':''}</span></h2>${prs?`<ol>${prs}</ol>`:'<p class="backlog-none">none</p>'}</section>`;
  const notes=[...list(a.plates).filter(x=>x.state!=='read'),...unread].filter((x,i,all)=>all.findIndex(y=>y.projectId===x.projectId&&y.reason===x.reason)===i).map(x=>`<li>${escape(x.projectName)}: ${escape(x.state)} — ${escape(x.reason)}</li>`).join('');
  return `${providers}${routes}${pending}${notes?`<ul class="backlog-notes">${notes}</ul>`:''}<p class="backlog-notes">An agent's item comes from its claim; presence says only what is recorded. A pull request set to auto-merge merges itself and is not listed.</p>`;
}
/** Whether any plate on Agents is still loading or stale. */
export const agentsLoading=model=>list(model?.agents?.plates).some(p=>p?.state==='loading'||p?.state==='stale');

/** Agents and Pending review, server-side: the same shell, sidebar and client as the backlog. */
export function agentsView(access,model) {
  const loading=agentsLoading(model);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agents · ${escape(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/backlog.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:'/agents'})}<main id="main" class="backlog-shell" data-backlog-root data-view="agents" data-endpoint="/api/agents" data-loading="${loading}">${renderSidebar(model,{active:'agents'})}<div class="backlog-main"><h1>Agents</h1><p class="backlog-notes" data-backlog-status role="status" aria-live="polite">${loading?'Some plates are still loading or stale. This list fills in as they are read.':''}</p><div data-backlog-list>${renderAgents(model)}</div><noscript><p class="backlog-notes">Times are shown in UTC without JavaScript; plates still loading fill in after a reload.</p></noscript></div><footer>Read only. Nothing here starts, stops or attaches an agent.</footer></main>${navigationFooter(access)}<script type="module" src="/assets/backlog-client.mjs"></script>${navigationScripts}</body></html>`;
}

/** A time in UTC on the server; the page's client says it in the viewer's time zone. */
const when=(iso,kind)=>`<time datetime="${escape(iso)}" data-local="${kind}">${escape(timeText(iso,kind))}</time>`;
/** One routine: its name and schedule with its next run, then its last result, budget, and what its config says. */
function routineRow(r) {
  const schedule=scheduleParts(r).map(p=>p.iso?`${escape(p.words)} ${when(p.iso,p.kind)}`:escape(p.words)).join('; ');
  const next=r.state==='off'?`<strong>off</strong>: ${escape(r.off.why)} (<code>${escape(r.off.key)}</code>)`:r.nextRun?`next ${when(r.nextRun,'datetime')}`:r.crons.length?'next run unknown':'';
  const lastUrl=safeSourceLink(r.last.url);
  const last=r.last.result?`last ${lastUrl?`<a href="${escape(lastUrl)}" target="_blank" rel="noreferrer">${escape(r.last.result)}</a>`:escape(r.last.result)}${r.last.at?` ${r.last.at.length>10?when(r.last.at,'datetime'):escape(r.last.at)}`:''} <small>(${escape(r.last.from)})</small>`:escape(r.last.none);
  const budget=r.budget?`budget ${r.budget.minutes} min${r.budget.per?` a ${escape(r.budget.per)}`:''} <small>(${escape(r.budget.key)})</small>`:'';
  const config=r.config?`<code>${escape(r.config.key)}</code>: ${escape(r.config.value)}${r.disagrees?' <strong>the workflow\'s cron says otherwise; both are shown</strong>':''}`:'';
  return `<li class="recurring-row" data-routine="${escape(r.id)}"${r.state==='off'?' data-off':''}><p><strong>${escape(r.name)}</strong> · ${schedule}${next?` · ${next}`:''}</p><p class="meta">${[last,budget,config].filter(Boolean).join(' · ')}</p></li>`;
}
/** Recurring's list: one section per plate with its routines, or what kept it from being read. */
export function renderRecurring(model) {
  return list(model?.plates).map(p=>`<section class="backlog-lane" data-recurring-plate="${escape(p.projectId)}" aria-labelledby="plate-${escape(p.projectId)}"><h2 id="plate-${escape(p.projectId)}">${escape(p.projectName??p.projectId)} <span class="meta">${Array.isArray(p.routines)?p.routines.length:p.state==='loading'?'loading':'not read'}</span></h2>${!Array.isArray(p.routines)?`<p class="backlog-none">${p.state==='loading'?'loading':`not read — ${escape(p.reason)}`}</p>`:p.routines.length?`<ol>${p.routines.map(routineRow).join('')}</ol>`:'<p class="backlog-none">none</p>'}${list(p.gaps).length?`<ul class="backlog-notes">${p.gaps.map(g=>`<li>${escape(g.routine)}: ${escape(g.reason)}</li>`).join('')}</ul>`:''}</section>`).join('')
    +'<p class="backlog-notes">Times are your time zone; each next run is computed from its workflow\'s cron in UTC. A schedule changes in its workflow file, never here.</p>';
}
/** Whether a Recurring plate is still loading or stale. */
export const recurringLoading=model=>list(model?.plates).some(p=>p?.state==='loading'||p?.state==='stale');

/** Recurring, server-side: the same shell, sidebar and client as the backlog. */
export function recurringView(access,model) {
  const loading=recurringLoading(model);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recurring · ${escape(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/backlog.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:'/recurring'})}<main id="main" class="backlog-shell" data-backlog-root data-view="recurring" data-endpoint="/api/recurring" data-loading="${loading}">${renderSidebar(model,{active:'recurring'})}<div class="backlog-main"><h1>Recurring</h1><p class="backlog-notes" data-backlog-status role="status" aria-live="polite">${loading?'Some plates are still loading or stale. This list fills in as they are read.':''}</p><div data-backlog-list>${renderRecurring(model)}</div><noscript><p class="backlog-notes">Times are shown in UTC without JavaScript; plates still loading fill in after a reload.</p></noscript></div><footer>Read only. Recurring starts, stops and reschedules nothing.</footer></main>${navigationFooter(access)}<script type="module" src="/assets/backlog-client.mjs"></script>${navigationScripts}</body></html>`;
}

/** The whole page, server-side, inside the workspace's navigation and theme. */
/** The arrangement toggle (phase 179): List, the default, or By goal; plain links, no query string. */
const arrangements=arrangement=>`<nav class="backlog-toggle" aria-label="Arrangement"><a href="/backlog"${arrangement==='list'?' aria-current="page"':''}>List</a> · <a href="/backlog/goals"${arrangement==='goals'?' aria-current="page"':''}>By goal</a></nav>`;

/** One card under its goal: its lead as a row, and what it holds under it, each with its sources. */
function cardRow(card,n,generatedAt) {
  const lead=row({...card.lead,lane:card.lane},n,card.lane,generatedAt);
  const sources=list(card.sources).length>1?`<li>${escape(card.lead.kind)} · seen at ${card.sources.map((u,i)=>link(u,`source ${i+1}`)||escape(u)).join(' · ')}</li>`:'';
  // A nested item the row's chip already names (+walk), seen once and at no particular box, adds nothing here.
  const shown=card.members.filter(m=>!(m.keys.length===1&&list(card.lead.children).includes(m.keys[0])&&m.box===null&&m.sources.length<=1));
  const members=shown.map(m=>`<li data-member="${escape(m.identity)}">${escape(memberText(m))}${m.sources.length?` · ${m.sources.map((u,i)=>link(u,m.sources.length>1?`source ${i+1}`:'source')||escape(u)).join(' · ')}`:''}</li>`).join('');
  return members||sources?lead.replace(/<\/li>$/,`<ul class="backlog-members">${sources}${members}</ul></li>`):lead;
}
/** By goal (phase 179): a header per goal of each plate with its lane counts, its first seven cards, and the rest behind "more". */
export function renderByGoal(backlog) {
  const {groups,notRead}=byGoal(backlog);
  const body=groups.map(g=>{
    const cards=g.cards.map((c,i)=>cardRow(c,i+1,backlog?.generatedAt));
    return `<section class="backlog-lane" data-goal="${escape(g.key)}" aria-labelledby="goal-${escape(g.key)}"><h2 id="goal-${escape(g.key)}">${escape(g.projectName)} · ${escape(g.goal??'No goal')}${g.title?` — ${escape(g.title)}`:''} <span class="meta">${escape(countsText(g.counts))}</span></h2><ol>${cards.slice(0,GOAL_SHOWN).join('')}</ol>${g.more?`<details class="backlog-more"><summary>${g.more} more in this goal</summary><ol start="${GOAL_SHOWN+1}">${cards.slice(GOAL_SHOWN).join('')}</ol></details>`:''}</section>`;
  }).join('')||'<p class="backlog-none">none</p>';
  const notes=notRead.map(p=>`<li>${escape(p.projectName)}: ${escape(p.state)}${p.reason?` — ${escape(p.reason)}`:''}</li>`).join('');
  return `${body}${notes?`<ul class="backlog-notes">${notes}</ul>`:''}<p class="backlog-notes">Each phase or pull request is one card; what it holds is listed under it, every source kept. Look-alike work in two plates is never merged.</p>`;
}

/** The whole page, server-side, inside the workspace's navigation and theme: the List (default) or By goal (phase 179). */
export function backlogView(access,backlog,{arrangement='list'}={}) {
  const goals=arrangement==='goals';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backlog${goals?' by goal':''} · ${escape(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"><link rel="stylesheet" href="/assets/backlog.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:goals?'/backlog/goals':'/backlog'})}<main id="main" class="backlog-shell" data-backlog-root data-view="${goals?'goals':'backlog'}" data-endpoint="/api/backlog" data-loading="${backlogLoading(backlog)}">${renderSidebar(backlog)}<div class="backlog-main"><h1>Backlog</h1>${arrangements(arrangement)}<p class="backlog-notes" data-backlog-status role="status" aria-live="polite">${backlogLoading(backlog)?'Some plates are still loading or stale. This list fills in as they are read.':''}</p><div data-backlog-list>${goals?renderByGoal(backlog):renderBacklog(backlog)}</div><noscript><p class="backlog-notes">Plates still loading fill in with JavaScript; reload this page to see them.</p></noscript></div><footer>Read only. Lanes are derived on every read; nothing here starts work.</footer></main>${navigationFooter(access)}<script type="module" src="/assets/backlog-client.mjs"></script>${navigationScripts}</body></html>`;
}
