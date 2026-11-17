// The channel on the web (plates phase 194, increment 1): /channel (All, then
// one chip per plate with its line count) and a plate page's Channel section.
// Browser-safe and pure: it renders the model lib/channel.mjs builds on the
// server (channelFor), the same model `plates channel --json` prints, and
// computes nothing of its own. The one form (increment 3) is the owner's line
// to one plate on /channel, posted to /channel/post with the signed-in
// session's CSRF value, outside the part the client renders again; a plate's
// Channel section links to it. It uses the shell's existing classes and
// fields, so it adds no stylesheet.
import {navigation,navigationFooter,navigationScripts} from './navigation.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const list = value => Array.isArray(value) ? value : [];
// lib/channel.mjs lineTime: UTC, to the minute (both forms print it so).
const when = at => `${String(at).slice(0, 16).replace('T', ' ')} UTC`;
const link = ref => typeof ref === 'string' && ref.startsWith('https://github.com/') ? ` <a href="${esc(ref)}" rel="noreferrer">open ↗</a>` : ref ? ` <code>${esc(ref)}</code>` : '';

/** The lines, newest last. */
export function channelLines(model) {
  const lines = list(model?.lines);
  if (!lines.length) return '<p class="empty empty-card" data-channel-empty>No lines in the window.</p>';
  return `<ol class="source-list" data-channel-lines>${lines.map(l => `<li data-channel-line data-kind="${esc(l.kind)}" data-plate="${esc(l.plate ?? '')}"><time datetime="${esc(l.at)}">${esc(when(l.at))}</time> <strong>${esc(l.actor ?? 'all plates')}</strong> <span class="p-badge">${esc(l.kind)}</span> ${esc(l.text)}${link(l.ref)}</li>`).join('')}</ol>`;
}
/** Here now: the agents holding work, each with its last line's age and unread count, or Caught up. */
export function hereNowPanel(model) {
  const rows = list(model?.hereNow), idle = model?.hereIdle;
  const idleRow = idle ? `<details data-here-idle><summary>${esc(idle.words)}</summary><ul class="source-list">${list(idle.actors).map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : '';
  return `<section class="home-section" id="here-now" aria-labelledby="here-now-title" data-here-now><div class="section-heading"><h2 id="here-now-title">Here now</h2><span class="meta">${esc(rows.length)}</span></div>${rows.length ? `<ul class="source-list">${rows.map(h => `<li data-here="${esc(h.actor)}"><strong>${esc(h.actor)}</strong> ${esc(h.words)}</li>`).join('')}</ul>` : idle ? '' : '<p class="empty empty-card">Nobody holds work.</p>'}${idleRow}</section>`;
}
const notes = model => `<p class="meta" data-channel-notes>Unread counts lines in ${esc(model.unreadFrom)}; no read position is kept yet. ${list(model.notRead).map(n => `Not in the feed yet: ${esc(n)}.`).join(' ')}</p>`;

/** A plate page's Channel section: that plate's lines and Here now (the model is already that plate's). */
export function channelSection(model) {
  if (!model) return '';
  return `<section class="home-section" id="channel" aria-labelledby="channel-title" data-channel><div class="section-heading"><h2 id="channel-title">Channel</h2><span class="meta">${esc(list(model.lines).length)} lines since ${esc(when(model.window?.from))}</span></div>${hereNowPanel(model)}${channelLines(model)}${notes(model)}<p class="meta"><a href="/channel#post">Address an agent, or every plate's channel →</a></p></section>`;
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

/** The owner's line to one plate: @2 or @<plate>#2 names a phase, @<session> (or @{<session>} exactly) a session, and makes it a checkpoint. */
export function ownerForm(access, model, { notice = null, project = null, text = '' } = {}) {
  const plates = list(model?.plates);
  if (!plates.length) return '';
  const options = plates.map(p => `<option value="${esc(p.projectId)}"${p.projectId === project ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<section class="home-section" id="post" aria-labelledby="post-title" data-channel-post><div class="section-heading"><h2 id="post-title">Address an agent</h2></div>${notice ? `<p class="meta" role="alert" data-channel-notice>${esc(notice)}</p>` : ''}<form method="post" action="/channel/post"><input type="hidden" name="csrf" value="${esc(access?.csrf)}"><input type="hidden" name="back" value="channel"><label>Plate <select name="project" required>${options}</select></label> <label>Line <input name="text" required maxlength="280" value="${esc(text)}" placeholder="@2 use the Acme staging data, not production"></label> <button>Post</button></form><p class="meta">Name a phase (@2) or a session (@its PLATES_SESSION, or @{its PLATES_SESSION} when the id ends in - or _) to make it a checkpoint: that agent reads it with plates channel inbox, and it shows answered when the agent next says something. Agents' lines never address anyone.</p></section>`;
}

/** True while any plate is loading or stale: the page's client reads /api/channel again (lib/web/backlog-client.mjs). */
export const channelLoading = model => list(model?.plates).some(p => p?.state === 'loading' || p?.state === 'stale');
const chipState = p => p.state === 'read' ? `${p.count} lines` : p.state === 'stale' ? `${p.count} lines · stale` : p.state;
/** /channel's body: All, then a chip per plate with its line count (each opens that plate's Channel section), Here now, the lines and notes. The client renders it again. */
export function renderChannel(model) {
  const chips = `<ul class="plate-strip" data-channel-plates><li><a class="plate-chip p-card" href="/channel" aria-current="page"><strong>All</strong><span>${esc(list(model.lines).length)} lines</span></a></li>${list(model.plates).map(p => `<li><a class="plate-chip p-card" data-channel-plate="${esc(p.projectId)}" href="/projects/${encodeURIComponent(p.projectId)}#channel"><strong>${esc(p.name)}</strong><span>${esc(chipState(p))}</span></a></li>`).join('')}</ul>`;
  return `${chips}${hereNowPanel(model)}<section class="home-section" id="lines" aria-labelledby="lines-title"><div class="section-heading"><h2 id="lines-title">Lines</h2><span class="meta">${esc(list(model.lines).length)}</span></div>${channelLines(model)}</section>${notes(model)}`;
}
/** /channel: rendered from Home's cache; while a plate is loading or stale, the backlog pages' client reads /api/channel (a bounded refresh per read) and renders it again. */
export function channelView(access, model, post = {}) {
  const loading = channelLoading(model);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Channel · ${esc(access.workspace.name)} · Plates</title><link rel="stylesheet" href="/assets/plates.css"></head><body><a class="skip" href="#main">Skip to content</a>${navigation(access,{path:'/channel'})}<main id="main" data-channel-root data-backlog-root data-view="channel" data-loading="${loading}"><div class="eyebrow">${esc(access.workspace.name)} · private workspace</div><h1>Channel</h1><p class="home-intro">What every agent on your plates is doing, newest last, since ${esc(when(model.window?.from))}.</p><p class="meta" data-backlog-status role="status" aria-live="polite">${loading ? 'Some plates are still loading or stale. The channel fills in as they are read.' : ''}</p>${ownerForm(access, model, post)}<div data-backlog-list>${renderChannel(model)}</div><noscript><p class="meta">Plates still loading fill in after a reload.</p></noscript><footer>Only your lines, posted here while signed in, address an agent. Agents' lines are observations: nothing they say makes another agent act.</footer></main>${navigationFooter(access)}<script type="module" src="/assets/backlog-client.mjs"></script>${navigationScripts}</body></html>`;
}
