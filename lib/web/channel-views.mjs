// Chat presentation of the shared CLI/web channel model. Owner posts use the existing protected route.
import {navigation,navigationFooter,navigationScripts} from './navigation.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list = value => Array.isArray(value) ? value : [];
// lib/channel.mjs lineTime: UTC, to the minute (both forms print it so).
const when = at => `${String(at).slice(0, 16).replace('T', ' ')} UTC`;
const link = ref => typeof ref === 'string' && ref.startsWith('https://github.com/') ? ` <a href="${esc(ref)}" rel="noreferrer">open ↗</a>` : ref ? ` <code>${esc(ref)}</code>` : '';

// Presentation only: preserve every model line, its time and its order.
const owner = line => ['owner', 'checkpoint'].includes(line.kind);
const identity = line => `${line.plate ?? ''}:${owner(line) ? 'owner' : line.session ?? line.actor ?? ''}`;
const tone = actor => [...String(actor)].reduce((hash, c) => (hash * 31 + c.codePointAt(0)) >>> 0, 0) % 3;
const avatar = (actor, words = actor) => `<span class="chat-avatar chat-tone-${tone(actor)}" title="${esc(words)}" aria-label="${esc(words)}">${esc(String(actor ?? '?').charAt(0).toUpperCase())}</span>`;
export function channelLines(model) {
  const lines = list(model?.lines);
  if (!lines.length) return '<p class="empty empty-card" data-channel-empty>No lines in the window.</p>';
  return `<ol class="chat-lines" data-channel-lines>${lines.map((line, index) => {
    const system = !owner(line) && line.kind !== 'say';
    const grouped = !system && index > 0 && identity(line) === identity(lines[index - 1]) && (owner(lines[index - 1]) || lines[index - 1].kind === 'say');
    const who = owner(line) ? 'You' : line.actor ?? 'all plates';
    return `<li class="chat-line ${system ? 'chat-system' : owner(line) ? 'chat-owner' : 'chat-agent'}${grouped ? ' chat-grouped' : ''}" data-channel-line data-kind="${esc(line.kind)}" data-plate="${esc(line.plate ?? '')}">${!system && !owner(line) && !grouped ? avatar(line.actor) : ''}<div class="chat-message">${!grouped ? `<strong class="chat-who">${esc(who)}</strong> ` : ''}<div class="chat-bubble" data-channel-text>${esc(line.text)}</div><div class="chat-meta"><time datetime="${esc(line.at)}">${esc(when(line.at))}</time>${owner(line) ? `<span data-channel-destination>#${esc(line.plate)}</span><span data-channel-mark>${line.answered === true ? 'answered' : 'sent'}</span>` : ''}${link(line.ref)}</div></div></li>`;
  }).join('')}</ol>`;
}
/** Presence belongs to the channel header; tooltips retain each agent's activity. */
export function hereNowPanel(model) {
  const rows = list(model?.hereNow), idle = model?.hereIdle;
  const idleRow = idle ? `<details data-here-idle><summary>${esc(idle.words)}</summary><ul class="source-list">${list(idle.actors).map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : '';
  return `<div class="chat-presence" data-here-now aria-label="Here now">${rows.length ? `<span class="meta">Here now</span><ul>${rows.map(h => `<li data-here="${esc(h.actor)}">${avatar(h.actor, `${h.actor} · ${h.words}`)}</li>`).join('')}</ul>` : ''}${idleRow}</div>`;
}
const notes = model => `<details class="chat-notes"><summary>About this channel</summary><p class="meta" data-channel-notes>Unread counts lines in ${esc(model.unreadFrom)}; no read position is kept yet. ${list(model.notRead).map(n => `Not in the feed yet: ${esc(n)}.`).join(' ')}</p></details>`;

/** A project's chat, using the page's fixed project and existing owner POST route. */
export function channelSection(model, access = null) {
  if (!model) return '';
  return `<section class="home-section chat-box" id="channel" aria-labelledby="channel-title" data-channel><div class="chat-header"><h2 id="channel-title">Channel</h2>${hereNowPanel(model)}</div>${channelLines(model)}${notes(model)}${access ? ownerForm(access, model, { back: 'plate' }) : ''}</section>`;
}

/** Why the owner's line was not posted, in words for the page; null for an error this form does not explain. */
export function ownerPostRefusal(code) {
  return ({
    channel_owner_unavailable: 'The channel cannot take your lines yet: the workspace database needs migration 025. Nothing was posted.',
    channel_owner_uncertain: 'Not sure whether your line was posted: the workspace did not answer. Check the channel before posting it again.',
    channel_owner_too_frequent: 'At most 10 of your lines a minute on one plate. Nothing was posted; send it again in a minute.',
    channel_address_elsewhere: 'A line addresses phases on its own plate only (@2 or @<this plate>#2). Nothing was posted.',
    channel_too_many_addressees: 'A line names at most 10 phases or sessions. Nothing was posted.',
    invalid_channel_post: 'A line is 1 to 280 characters of plain text, never a key or token. Nothing was posted.',
    invalid_channel_project: 'That plate is not pinned in the workspace configuration. Nothing was posted.',
  })[code] ?? null;
}

/** The composer keeps the plate fixed; /channel offers links to switch that destination. */
export function ownerForm(access, model, { notice = null, project = null, text = '', back = 'channel' } = {}) {
  const plates = list(model?.plates), selected = plates.find(p => p.projectId === project) ?? plates[0];
  if (!selected) return '';
  const placeholder = `Message #${selected.projectId} — @${selected.projectId}#<phase> to address an agent`;
  const destinations = back === 'channel' && plates.length > 1 ? `<nav aria-label="Message destination">${plates.map(p => `<a href="/channel?project=${encodeURIComponent(p.projectId)}#post"${p === selected ? ' aria-current="true"' : ''}>#${esc(p.projectId)}</a>`).join('')}</nav>` : '';
  return `<div class="chat-composer" id="post" data-channel-post>${notice ? `<p class="meta" role="alert" data-channel-notice>${esc(notice)}</p>` : ''}${destinations}<form method="post" action="/channel/post"><input type="hidden" name="csrf" value="${esc(access?.csrf)}"><input type="hidden" name="back" value="${esc(back)}"><input type="hidden" name="project" value="${esc(selected.projectId)}"><label><input aria-label="${esc(placeholder)}" name="text" required maxlength="280" data-focus="channel-message" value="${esc(text)}" placeholder="${esc(placeholder)}"></label><button>Send</button></form></div>`;
}

/** True while any plate is loading or stale: the page's client reads /api/channel again (lib/web/backlog-client.mjs). */
export const channelLoading = model => list(model?.plates).some(p => p?.state === 'loading' || p?.state === 'stale');
const chipState = p => p.state === 'read' ? `${p.count} lines` : p.state === 'stale' ? `${p.count} lines · stale` : p.state;
/** /channel's body: All, then a chip per plate with its line count (each opens that plate's Channel section), Here now, the lines and notes. The client renders it again. */
export function renderChannel(model) {
  const chips = `<ul class="plate-strip" data-channel-plates><li><a class="plate-chip p-card" href="/channel" aria-current="page"><strong>All</strong><span>${esc(list(model.lines).length)} lines</span></a></li>${list(model.plates).map(p => `<li><a class="plate-chip p-card" data-channel-plate="${esc(p.projectId)}" href="/projects/${encodeURIComponent(p.projectId)}#channel"><strong>${esc(p.name)}</strong><span>${esc(chipState(p))}</span></a></li>`).join('')}</ul>`;
  return `${chips}<div class="chat-header"><h2>Channel</h2>${hereNowPanel(model)}</div>${channelLines(model)}${notes(model)}`;
}
/** /channel: rendered from Home's cache; while a plate is loading or stale, the backlog pages' client reads /api/channel (a bounded refresh per read) and renders it again. */
export function channelView(access, model, post = {}) {
  const loading = channelLoading(model);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Channel · ${esc(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:'/channel'})}<main id="main" data-channel-root data-backlog-root data-view="channel" data-loading="${loading}"><div class="eyebrow">${esc(access.workspace.name)} · private workspace</div><h1>Channel</h1><p class="home-intro">What every agent on your plates is doing, newest last, since ${esc(when(model.window?.from))}.</p><p class="meta" data-backlog-status role="status" aria-live="polite">${loading ? 'Some plates are still loading or stale. The channel fills in as they are read.' : ''}</p><div class="chat-box"><div data-backlog-list>${renderChannel(model)}</div>${ownerForm(access, model, post)}</div><noscript><p class="meta">Plates still loading fill in after a reload.</p></noscript><footer>Only your lines, posted here while signed in, address an agent. Agents' lines are observations: nothing they say makes another agent act.</footer></main>${navigationFooter(access)}<script type="module" src="/assets/backlog-client.mjs"></script>${navigationScripts}</body></html>`;
}
