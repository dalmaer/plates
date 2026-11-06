// A read-only projection of existing Home and Backlog records. Source kinds,
// permissions and action workflows remain owned by their existing readers.
import {safeSourceLink, decisionHref} from './source-links.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list = value => Array.isArray(value) ? value : [];
const path = id => `/projects/${encodeURIComponent(id)}`;
export const MESSAGE_TYPES = Object.freeze([['all','All messages'],['issue','Issues'],['bug','Bugs'],['decision','Decisions'],['review','Reviews'],['walk','Walks'],['phase','Phases'],['change','Changes'],['other','Other']]);
export function messageType(item) {
  const kind = item.itemKind ?? item.kind;
  if (kind === 'bug' || list(item.labels).some(l => (typeof l === 'string' ? l : l?.name)?.toLowerCase() === 'bug')) return 'bug';
  if (kind === 'issue') return 'issue';
  if (item.kind === 'decision') return 'decision';
  if (item.kind === 'review' || kind === 'merge') return 'review';
  if (item.kind === 'walk') return 'walk';
  if (item.kind === 'phase') return 'phase';
  if (item.kind === 'change' || ['commit','release'].includes(kind)) return 'change';
  return 'other';
}
export function plateMessages(snapshot, projectId) {
  const seen = new Map(), rows = [];
  const add = (item, lane, type = messageType(item)) => {
    if (item?.projectId !== projectId) return;
    const key = item.key ?? `${projectId}:${item.kind}:${item.id ?? item.ref ?? item.title}`;
    if (seen.has(key)) {
      const index = seen.get(key);
      rows[index] = {...rows[index],...item,key,lane:rows[index].lane,type};
      return;
    }
    seen.set(key,rows.length); rows.push({...item, key, lane, type});
  };
  for (const lane of list(snapshot.backlog?.lanes)) for (const item of list(lane.items)) add(item, lane.lane);
  for (const group of ['decisions','reviews','walks','waiting','changes']) for (const item of list(snapshot[group])) add(item, group === 'changes' ? 'done' : group === 'waiting' || item.ready === false ? 'waiting' : 'yours', group === 'changes' ? 'change' : messageType(item));
  return rows;
}
const laneNames = {'in-flight':'In progress',yours:'Needs you','agent-ready':'Ready for an agent',waiting:'Waiting',done:'Recent changes'};
const typeLabel = type => MESSAGE_TYPES.find(([id]) => id === type)?.[1] ?? 'Other';
export function renderPlateCards(snapshot) {
  const sections = list(snapshot.home?.sections), summaries = list(sections.find(s => s.id === 'plates')?.items);
  const needs = list(sections.find(s => s.id === 'needs-you')?.items);
  const since = list(sections.find(s => s.id === 'since')?.plates);
  return `<section class="plate-overview" aria-labelledby="plate-overview-title"><div class="section-heading"><h2 id="plate-overview-title">Your plates</h2><span class="meta">${list(snapshot.projects).length} projects</span></div><div class="plate-grid">${list(snapshot.projects).map(p => {
    const summary = summaries.find(s => s.projectId === p.id), own = needs.filter(n => n.projectId === p.id), recent = list(since.find(s => s.projectId === p.id)?.lines);
    const known = p.state === 'complete', status = p.state === 'loading' ? 'Loading sources' : p.state === 'unavailable' ? 'Sources unavailable' : summary?.status ?? 'Status unavailable';
    return `<a class="plate-summary p-card" href="${path(p.id)}" data-filterable data-groups="${esc([...new Set(own.map(n => n.verb))].join(' '))}" data-search="${esc([p.name,p.id,p.repo,p.tagline,...own.map(n=>n.title)].join(' ').toLowerCase())}" data-focus="plate-card-${esc(p.id)}"><div class="plate-summary-heading"><span class="plate-avatar" aria-hidden="true">${esc((p.name || p.id).slice(0,1).toUpperCase())}</span><div><h3>${esc(p.name || p.id)}</h3><span class="meta">${esc(p.repo)}</span></div><span aria-hidden="true">↗</span></div><p class="plate-description">${esc(p.tagline || p.planning?.headline || 'Project sources and next actions.')}</p><div class="plate-summary-status"><span class="status-dot" data-state="${esc(p.state)}" aria-hidden="true"></span>${esc(status)}${!known && !['loading','unavailable'].includes(p.state) ? ` · ${esc(p.state)} sources` : ''}</div><ul class="plate-highlights">${own.slice(0,2).map(n=>`<li><span>${esc(n.label || 'Needs you')}</span>${esc(n.title)}</li>`).join('') || `<li>${esc(known ? 'No owner actions in this read.' : 'Owner actions may be incomplete.')}</li>`}${recent[0] ? `<li><span>Latest</span>${esc(recent[0].text)}</li>` : ''}</ul><div class="plate-summary-foot"><span>${summary?.inFlight ? `${esc(summary.inFlight)} in flight` : Number.isSafeInteger(summary?.inFlight) ? 'No changes in flight' : 'Activity unavailable'}${summary?.waiting ? ` · ${esc(summary.waiting)} waiting` : ''}</span><strong>Open plate →</strong></div></a>`;
  }).join('') || '<p class="empty-card">No plates are available.</p>'}</div></section>`;
}
function source(item, project) {
  const direct = safeSourceLink(item.link ?? item.source?.url);
  if (direct) return direct;
  if (/^[\w.-]+\/[\w.-]+$/.test(project?.repo ?? '') && /^[a-f0-9]{40}$/.test(item.source?.revision ?? '') && typeof item.source?.file === 'string' && !item.source.file.split('/').includes('..')) return safeSourceLink(`https://github.com/${project.repo}/blob/${item.source.revision}/${item.source.file.split('/').map(encodeURIComponent).join('/')}`);
  return null;
}
function detail(item, index, project) {
  const href = source(item,project), decision = item.kind === 'decision' ? decisionHref(item) : null;
  const action = decision ? `<a class="button" href="${esc(decision)}">Review decision →</a>` : item.type === 'walk' || list(item.children).some(k=>k.split(':')[1] === 'walk') ? `<a class="button" href="${path(project.id)}/walks">Open guided walks →</a>` : list(item.answers).length ? `<a class="button" href="${path(project.id)}/review">Open review →</a>` : '';
  const why = Array.isArray(item.why) ? item.why.join(' · ') : item.why;
  const facts = [['Question',item.question?.ask ?? item.details?.ask],['Context',why],['Next',item.next],['Look at',item.details?.look],['Then',item.details?.then]];
  return `<article class="message-detail" id="message-${index}" data-message-detail="${esc(item.key)}" data-focus="message-detail-${esc(item.key)}" tabindex="-1"><div class="message-detail-type">${esc(typeLabel(item.type))} <span>· ${esc(laneNames[item.lane] ?? item.lane)}</span></div><h2>${esc(item.title)}</h2><div class="message-facts">${facts.filter(([,v])=>v).map(([k,v])=>`<section><h3>${k}</h3><p>${esc(v)}</p></section>`).join('') || '<p>Open the source for the complete record.</p>'}</div>${list(item.question?.choices ?? item.details?.choices).length ? `<section><h3>Choices in the source</h3><ul>${list(item.question?.choices ?? item.details?.choices).map(c=>`<li>${esc(typeof c === 'string' ? c : c?.label ?? c?.text)}</li>`).join('')}</ul></section>` : ''}<div class="message-actions">${action}${href ? `<a href="${esc(href)}" rel="noreferrer">Open source ↗</a>` : '<span class="meta">Source link unavailable</span>'}</div>${item.holder?.provider ? `<p class="meta">Held by ${esc(item.holder.provider)}${item.presence ? ` · ${esc(item.presence)}` : ''}</p>` : ''}${item.source?.readAt ? `<p class="meta">Source read: ${esc(item.source.readAt)}</p>` : ''}</article>`;
}
export function renderPlateWorkspace(snapshot, projectId) {
  const project = list(snapshot.projects).find(p=>p.id === projectId);
  if (!project) return '';
  const backlogPlate = list(snapshot.backlog?.plates).find(p=>p.projectId === projectId);
  const items = plateMessages(snapshot,projectId), count = type => items.filter(i=>i.type === type).length;
  const nav = MESSAGE_TYPES.map(([type,label])=>`<button type="button" class="message-type" data-message-type="${type}" aria-pressed="${type === 'all'}"><span>${label}</span><span>${type === 'all' ? items.length : count(type)}</span></button>`).join('');
  const groups = Object.entries(laneNames).map(([lane,label])=>{
    const rows = items.map((item,index)=>({item,index})).filter(({item})=>item.lane===lane);
    return rows.length ? `<section data-message-group><h3>${label} <span>${rows.length}</span></h3><ol>${rows.map(({item,index})=>`<li data-message-row data-message-key="${esc(item.key)}" data-message-kind="${item.type}" data-message-search="${esc([item.title,item.ref,item.kind,item.question?.ask].filter(Boolean).join(' ').toLowerCase())}"><a href="#message-${index}" data-message-open="${esc(item.key)}" data-focus="message-open-${esc(item.key)}"><span class="message-circle" aria-hidden="true">${lane==='in-flight'?'◐':lane==='done'?'●':'○'}</span><span class="message-row-content"><span class="message-row-title">${esc(item.title)}</span><span class="message-row-meta">${esc(item.ref ? `#${item.ref} · ` : '')}${esc(typeLabel(item.type))}${item.holder?.provider ? ` · ${esc(item.holder.provider)}` : ''}</span></span>${item.since ? `<span class="message-date">${esc(item.since)}</span>` : ''}</a></li>`).join('')}</ol></section>` : '';
  }).join('');
  return `<section class="plate-workspace" data-plate-workspace aria-label="Plate messages"><aside class="message-sidebar"><div class="message-sidebar-title">${esc(project.name || project.id)}</div><nav aria-label="Message types">${nav}</nav><div class="message-sidebar-links"><a href="${path(projectId)}/review">Review what needs you →</a><a href="${path(projectId)}/activity">Activity</a><a href="${path(projectId)}/routines">Routines</a><a href="${path(projectId)}/changes">Changes</a></div></aside><div class="message-workbench"><div class="message-toolbar"><h2>All messages</h2><label><span class="sr-only">Search messages</span><input class="p-field" type="search" data-message-search placeholder="Search this plate…"></label></div><p class="message-coverage">${project.state === 'complete' && backlogPlate?.state === 'read' && backlogPlate.coverage !== 'partial' ? 'Source-backed work on this plate.' : `Showing available records · ${esc(project.state)} sources.`} ${backlogPlate?.reason ? ` ${esc(backlogPlate.reason)}.` : ''} Issues and bugs appear when supplied by a connected source.</p><div class="message-split"><div class="message-list" aria-label="Messages">${groups}<p class="message-empty" data-message-empty${items.length ? ' hidden' : ''}>${project.state === 'loading' ? 'Reading this plate’s messages…' : 'No matching messages in the available sources.'}</p></div><div class="message-reader"><div class="message-reader-tools" hidden><button type="button" class="quiet" data-message-back>← List</button><span data-message-position role="status" aria-live="polite"></span><button type="button" class="quiet" data-message-prev aria-label="Previous message">↑</button><button type="button" class="quiet" data-message-next aria-label="Next message">↓</button></div><p class="message-reader-empty" data-message-placeholder>Select a message to read its context.<br><small>Use ↑ / ↓ in the list to move quickly.</small></p>${items.map((item,i)=>detail(item,i,project)).join('')}</div></div></div></section>`;
}
