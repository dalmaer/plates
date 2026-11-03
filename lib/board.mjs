// plates board: the item model (lib/work-items.mjs) as a terminal list and a
// page on 127.0.0.1 (plates phase 51). Only the rendering and the local
// server live here; every item, source and action comes from the model.
//
//   plates board --json        the model's every open item and source state
//   plates board [--open]      the same, as a page on 127.0.0.1 (a free port and
//                            a per-launch token, both printed with the URL)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { clock } from './quota.mjs';
import { workItems, COLUMNS, ACTION_VERBS, DIFF_NOTE } from './work-items.mjs';

const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 160) => { const t = oneLine(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** The board's read: the item model, every source. */
export const board = workItems;

export function boardText(data) {
  const out = [`${data.name ?? 'plates'} — whose turn it is (${data.today})`, ''];
  for (const c of COLUMNS) {
    const mine = data.items.filter(i => i.waits === c.waits);
    if (!mine.length && c.waits === 'external') continue;
    out.push(`${c.title} (${mine.length})`);
    if (!mine.length) out.push('  nothing');
    for (const it of mine) {
      if (it.ask) out.push(`  ${it.ask}`, `      ${it.title}${it.why ? ` — ${it.why}` : ''}`);
      else out.push(`  ${it.title}${it.kind === 'walk' && !it.yourPart ? ' (needs plain words)' : ''}`, `      ${it.why}`);
      if (it.yourPart?.takes && it.ready !== false) out.push(`      takes ${it.yourPart.takes}`);
      if (it.read) out.push(`      read: ${it.read}`);
      for (const a of it.actions) out.push(`      $ plates ${a.verb} ${a.args.map(q).join(' ')}${a.note === 'required' ? ' --note "…"' : a.choice !== undefined ? ' [--note "…"]' : ''}`);
    }
    out.push('');
  }
  if (data.feedback) {
    out.push('Feedback to review', `  ${data.feedback.pending} pending; ${data.feedback.total} observations; coverage ${data.feedback.state}`);
    if (data.feedback.reason) out.push(`  ${data.feedback.reason}`);
    for (const item of data.feedback.items) out.push(`  ${item.id} [${item.state}]${item.resolution?.reference ? ` — ${item.resolution.reference}` : ''}`);
    if (data.feedback.omitted) out.push(`  ${data.feedback.omitted} more; plates feedback list --json`);
    out.push('');
  }
  if (data.fleet?.length) out.push('Fleet:', ...data.fleet.map(r => `  ${r.repo}  ${r.unreadable ? `unreadable: ${r.unreadable}` : `${r.practice}  health ${r.health}  CI ${r.ci}`}`), '');
  out.push('Sources:', ...data.sources.map(s => `  ${s.source}: ${s.state}${s.count !== undefined ? ` (${s.count})` : ''}${s.why ? ` — ${s.why}` : ''}`));
  const g = data.github;
  if (g && (g.readAt || g.queries)) out.push(`GitHub: read ${g.readAt ? `${Math.max(0, Math.round((Date.now() - Date.parse(g.readAt)) / 60_000))} min ago` : 'not at all'}, ${g.cost} point${g.cost === 1 ? '' : 's'}${Number.isFinite(g.remaining) ? `, ${g.remaining} left until ${clock(g.resetAt)}` : ''} (--fresh reads again)`);
  if (g?.rest && (g.rest.requests || g.rest.remaining !== null)) out.push(`Robot GitHub REST: ${g.rest.requests} requests this refresh${g.rest.remaining !== null ? `, ${g.rest.remaining} left until ${clock(g.rest.resetAt)}` : ''}`);
  return out.join('\n');
}
const q = s => /^[\w./:@#-]+$/.test(s) ? s : JSON.stringify(s);

// ---- the page ------------------------------------------------------------------------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The board's view: one renderer, self-contained (it reads nothing outside
 * itself), so the server draws the first page with it and the page's script
 * (which embeds its source) redraws from /board.json on refresh. Returns
 * { page(data) → the board's HTML, drill(phase) → a phase's drill-down HTML }.
 * Everything from the data is escaped; only https links are links.
 */
export function boardView() {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safe = u => /^https:\/\//.test(u ?? '') ? u : null;
  // Escaped text with `code` and **bold** kept: the phase files' own markdown, read plainly.
  const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const ext = (href, label, cls = '') => safe(href) ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const bare = t => String(t ?? '').replace(/^phase \d+: /, '');
  const textOf = it => esc([it.ask, it.title, it.why, it.read, it.next, it.kind, it.source].filter(Boolean).join(' ').toLowerCase());
  // A Your part's text: fmt, and [text](https://…) as a link (anything else stays text).
  const md = s => fmt(s).replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  const tableOf = t => t?.head?.length ? `<div class="yp-table-wrap"><table class="yp-table"><thead><tr>${t.head.map(h => `<th scope="col">${md(h)}</th>`).join('')}</tr></thead><tbody>${(t.rows ?? []).map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${md(c)}</th>` : `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const KINDS = [
    ['walk', 'Walks to do', ['walk']],
    ['decide', 'Decisions', ['proposal', 'lesson', 'health', 'inbox', 'check']],
    ['setup', 'Set up', null],
    ['question', 'Questions', ['session']],
    ['repo', 'Repos to tidy', ['repo']],
  ];
  const groupOf = kind => (KINDS.find(k => k[2]?.includes(kind)) ?? KINDS[2])[0];
  const drillBtn = (n, label) => `<button type="button" class="title-btn" data-drill="${esc(n)}" aria-haspopup="dialog">${label}</button>`;
  const titleOf = it => it.phase !== undefined && it.phase !== null ? drillBtn(it.phase, esc(it.title)) : esc(it.title);
  const readOf = it => safe(it.link) ? ext(it.link, it.kind === 'review' ? 'Open the PR' : it.kind === 'ci' ? 'Open the runs' : 'Read', 'read')
    : it.read ? `<code class="cmd">${esc(it.read)}</code>` : '';
  const cardAttrs = it => `data-card tabindex="0" data-key="${esc(it.title)}" data-text="${textOf(it)}"${it.phase !== undefined && it.phase !== null ? ` data-phase="${esc(it.phase)}"` : ''}`;

  const actionsOf = it => {
    if (!it.actions?.length) return '';
    return `<div class="acts">${it.actions.map((a, i) => {
      const cmd = `plates ${a.verb} ${a.args.join(' ')}`;
      const cls = i === 0 ? 'btn primary' : 'btn';
      const expect = esc([a.verb, ...a.args].join(' '));
      if (a.note === 'required') return `<button type="button" class="${cls}" data-note-for="${esc(a.id)}" data-required="1" data-label="${esc(a.label)}" data-expect="${expect}" title="${esc(cmd)} --note …" aria-expanded="false">${esc(a.label)}…</button>`;
      const run = `<button type="button" class="${cls}" data-action="${esc(a.id)}" data-expect="${expect}" title="${esc(cmd)}">${esc(a.label)}</button>`;
      return a.note === 'optional' ? `${run}<button type="button" class="btn-link" data-note-for="${esc(a.id)}" data-label="${esc(a.label)}" data-expect="${expect}" aria-expanded="false">with a note</button>` : run;
    }).join('')}</div>
    <div class="note-form" hidden><label>Note <span class="need"></span><textarea rows="3"></textarea></label><div class="acts"><button type="button" class="btn primary" data-submit>Submit</button><button type="button" class="btn-link" data-cancel>Cancel</button></div></div>`;
  };

  // A walk with a Your part: the Ask is the headline, the phase a small label; one button per choice, a note optional.
  // A choice that keeps the walk open is never the primary button.
  const choiceBtn = (a, i) => `<button type="button" class="${i === 0 && !a.keepsOpen ? 'btn primary' : 'btn'}" data-action="${esc(a.id)}" data-expect="${esc([a.verb, ...a.args].join(' '))}" data-choice="${esc(a.choice)}"${a.keepsOpen ? ' data-keeps-open="1"' : ''}${a.then ? ` data-then="${esc(a.then)}"` : ''} title="${esc(`plates ${a.verb} ${a.args.join(' ')}`)} [--note …]">${esc(a.label)}</button>`;
  const partOf = (it, part, i, several) => {
    const acts = (it.actions ?? []).filter(a => (a.part ?? 0) === i);
    const choices = acts.filter(a => a.choice !== undefined);
    return `<div class="yp-part" data-part="${i}">
    ${several && part.heading ? `<p class="yp-heading">${md(part.heading)}</p>` : ''}
    ${i === 0 ? '' : `<h4 class="card-title ask">${md(part.ask)}</h4>`}
    ${i > 0 && part.why ? `<p class="why">${md(part.why)}</p>` : ''}
    ${tableOf(part.table)}
    ${part.look ? `<p class="look"><span class="k">Look at</span> ${md(part.look)}</p>` : ''}
    ${part.takes ? `<p class="takes">Takes ${md(part.takes)}</p>` : ''}
    ${choices.length ? `<div class="acts">${choices.map(choiceBtn).join('')}<button type="button" class="btn-link" data-choice-note aria-expanded="false">with a note</button></div>
    <div class="choice-note" hidden><label>Note <span class="need">(optional: it goes with your choice)</span><textarea rows="2"></textarea></label></div>` : actionsOf({ actions: acts })}
  </div>`;
  };
  const ypCard = it => {
    const yp = it.yourPart, parts = yp.parts ?? [yp];
    return `<article class="card yp" ${cardAttrs(it)}>
  <p class="yp-label">${drillBtn(it.phase, `Phase ${esc(it.phase)} · ${esc(bare(it.title))}`)}</p>
  <h4 class="card-title ask">${md(yp.ask ?? bare(it.title))}</h4>
  ${yp.why ? `<p class="why">${md(yp.why)}</p>` : ''}
  ${parts.map((part, i) => partOf(it, part, i, parts.length > 1)).join('')}
  <div class="result" role="status" aria-live="polite"></div>
</article>`;
  };
  const plainWords = it => it.kind === 'walk' && !it.yourPart ? ' <span class="pill warn" title="The phase file has no Your part yet: it does not say in plain words what you are asked">needs plain words</span>' : '';

  const card = (it, extra = '') => it.kind === 'walk' && it.yourPart && it.ready !== false ? ypCard(it) : `<article class="card${extra}" ${cardAttrs(it)}>
  <h4 class="card-title">${titleOf(it)}${plainWords(it)}</h4>
  ${it.why ? `<p class="why">${fmt(it.why)}</p>` : ''}
  <div class="foot">${readOf(it)}<span class="src">${esc(it.source)}</span></div>
  ${actionsOf(it)}
  <div class="result" role="status" aria-live="polite"></div>
</article>`;

  const section = (waits, title, n, body, cls = '') => `<section class="col${cls}" data-waits="${waits}" aria-labelledby="h-${waits}"><h2 id="h-${waits}">${esc(title)} <span class="n">${n}</span></h2>${body}</section>`;
  const none = t => `<p class="none">${t}</p>`;

  function yours(items) {
    if (!items.length) return none('Nothing is yours right now.');
    return KINDS.map(([key, label]) => {
      const mine = items.filter(it => groupOf(it.kind) === key);
      return mine.length ? `<div class="group" data-group="${key}"><h3>${label} <span class="n">${mine.length}</span></h3><div class="cards">${mine.map(it => card(it)).join('')}</div></div>` : '';
    }).join('');
  }

  function agents(items) {
    if (!items.length) return none('Nothing for the agent.');
    const phases = items.filter(it => it.phase !== undefined && it.phase !== null);
    const rest = items.filter(it => it.phase === undefined || it.phase === null);
    const row = (it, i) => `<li class="row${i === 0 ? ' is-next' : ''}" ${cardAttrs(it)}>
  <span class="num">${esc(it.phase)}</span>
  <div class="row-body"><div class="row-title">${drillBtn(it.phase, esc(bare(it.title)))}${i === 0 ? ' <span class="pill accent">next</span>' : ''}</div><p class="why">${fmt(it.next ?? it.why)}</p></div>
</li>`;
    const loose = it => `<li class="row" ${cardAttrs(it)}><div class="row-body"><div class="row-title">${esc(it.title)}</div><p class="why">${fmt(it.why)}</p><div class="foot">${readOf(it)}</div></div></li>`;
    return `${phases.length ? `<ol class="queue">${phases.map(row).join('')}</ol>` : ''}${rest.length ? `<h3>Loose ends <span class="n">${rest.length}</span></h3><ul class="queue">${rest.map(loose).join('')}</ul>` : ''}`;
  }

  function waiting(items) {
    if (!items.length) return none('Nothing waiting.');
    const dated = items.filter(it => it.after).sort((a, b) => a.after.localeCompare(b.after));
    const other = items.filter(it => !it.after);
    const row = (it, tag) => `<li class="row muted-row" ${cardAttrs(it)}><span class="when">${tag}</span><div class="row-body"><div class="row-title">${titleOf(it)}</div>${it.yourPart?.ask ? `<p class="why ask-later">${md(it.yourPart.ask)}</p>` : ''}<p class="why">${fmt(it.why)}</p></div></li>`;
    return `${dated.length ? `<h3>On a date</h3><ul class="queue">${dated.map(it => row(it, `<time datetime="${esc(it.after)}">${esc(it.after)}</time>`)).join('')}</ul>` : ''}${other.length ? `<h3>On something else</h3><ul class="queue">${other.map(it => row(it, `<span class="pill">${it.waits === 'external' ? 'outside' : 'time'}</span>`)).join('')}</ul>` : ''}`;
  }

  const bar = (n, total) => `<svg class="bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="track" width="100" height="6" rx="3"/><rect class="fill" width="${total ? Math.round(100 * n / total) : 0}" height="6" rx="3"/></svg>`;

  function roadmap(r) {
    if (!r) return '';
    return `<section class="panel roadmap" aria-labelledby="h-roadmap"><h2 id="h-roadmap">Roadmap</h2><p class="headline">${esc(r.headline)}</p><ul class="goals">${r.goals.map(g => `<li><div class="goal-line"><span class="goal-id">${esc(g.id)}</span><span class="goal-title">${esc(g.title)}</span><span class="tnum">${g.built}/${g.total}</span></div>${bar(g.built, g.total)}${g.owed ? `<span class="owed">${plural(g.owed, 'owes a walk', 'owe a walk')}</span>` : ''}</li>`).join('')}</ul></section>`;
  }

  function fleet(rows) {
    if (!rows?.length) return '';
    return `<section class="panel fleet" aria-labelledby="h-fleet"><h2 id="h-fleet">Fleet</h2><ul class="fleet-grid">${rows.map(r => r.unreadable
      ? `<li class="fleet-card"><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener noreferrer">${esc(r.repo)}</a><span class="muted">unreadable: ${esc(r.unreadable)}</span></li>`
      : `<li class="fleet-card"><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener noreferrer">${esc(r.repo)}</a>
  <span class="pill ${/ current$/.test(r.practice ?? '') ? 'ok' : 'warn'}">${esc(r.practice)}</span>
  <span class="ci"><span class="dot ci-${esc(r.ci)}" aria-hidden="true"></span>CI ${esc(r.ci)}</span>
  <span class="muted">health ${esc(r.health)}</span></li>`).join('')}</ul></section>`;
  }

  // What the GitHub reads cost of the owner's allowance, how old the kept read is, and what is left (lib/quota.mjs).
  const hhmm = iso => { const d = new Date(iso ?? NaN); return Number.isNaN(d.getTime()) ? '?' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const githubLine = g => {
    if (!g || (!g.readAt && !g.queries && !Number.isFinite(g.remaining))) return '';
    const m = g.readAt ? Math.round((Date.now() - Date.parse(g.readAt)) / 60_000) : null;
    const parts = [m === null ? 'GitHub not read' : `GitHub read ${m < 1 ? 'just now' : `${m} min ago`}`, `${g.cost ?? 0} point${g.cost === 1 ? '' : 's'} this refresh`];
    if (Number.isFinite(g.remaining)) parts.push(`${g.remaining} left until ${hhmm(g.resetAt)}`);
    if (g.rest && (g.rest.requests || g.rest.remaining !== null)) parts.push(`robot REST: ${g.rest.requests} requests this refresh${g.rest.remaining !== null ? `, ${g.rest.remaining} left until ${hhmm(g.rest.resetAt)}` : ''}`);
    return `<p class="github-read">${esc(parts.join(' · '))}</p>`;
  };
  const sources = (list, github) => `<footer class="sources" aria-label="Sources"><h2 class="sr">Sources</h2><ul>${list.map(s => `<li class="src-${esc(s.state.replace('/', ''))}"><span class="dot" aria-hidden="true"></span><b>${esc(s.source)}</b>: ${esc(s.state)}${s.count !== undefined ? ` (${s.count})` : ''}${s.why ? ` — ${esc(s.why)}` : ''}</li>`).join('')}</ul>${githubLine(github)}</footer>`;

  function page(data) {
    const by = w => data.items.filter(i => i.waits === w);
    const c = data.counts ?? {};
    const n = w => c[w] ?? by(w).length;
    const tile = (filter, label, count, sub = '') => `<button type="button" class="tile tile-${filter}" data-filter="${filter}" aria-pressed="false"><span class="tile-n">${count}</span><span class="tile-l">${esc(label)}</span>${sub ? `<span class="tile-s">${sub}</span>` : ''}</button>`;
    const waitingItems = [...by('time'), ...by('external')];
    return `<nav class="tiles" aria-label="Filter by whose turn">
${tile('owner', 'Yours', n('owner'))}${tile('broken', 'Broken', n('broken'))}${tile('agent', "The agent's", n('agent'))}${tile('waiting', 'Waiting', n('time') + n('external'), `${n('time')} on time · ${n('external')} outside`)}
</nav>
<div class="layout">
  <div class="primary">
    ${section('owner', 'Yours', by('owner').length, yours(by('owner')))}
    ${data.feedback ? `<section class="panel" aria-label="Feedback to review"><h2>Feedback to review</h2><p class="muted">${esc(data.feedback.pending)} pending · ${esc(data.feedback.total)} observations · coverage ${esc(data.feedback.state)}${data.feedback.gaps ? ' (gaps present)' : ''}</p>${data.feedback.reason ? `<p class="muted">${esc(data.feedback.reason)}</p>` : ''}<ul>${data.feedback.items.map(item => `<li><code>${esc(item.id)}</code> — ${esc(item.state)}${item.gaps ? ' (result coverage incomplete)' : ''}${item.resolution?.reference ? ` · ${/^https:\/\//.test(item.resolution.reference) ? ext(item.resolution.reference, 'Open resolution') : esc(item.resolution.reference)}` : ''}${item.resolution?.supersededBy ? ` · superseded by <code>${esc(item.resolution.supersededBy)}</code>` : ''}</li>`).join('')}</ul><p class="muted">${data.feedback.omitted ? `${esc(data.feedback.omitted)} more observations. ` : ''}Review locally with <code>plates feedback list --json</code>. Private words and result files are not shown here.</p></section>` : ''}
    ${section('broken', 'Broken', by('broken').length, by('broken').length ? `<div class="cards">${by('broken').map(it => card(it, ' bad')).join('')}</div>` : none('Nothing broken.'), by('broken').length ? ' has-bad' : '')}
  </div>
  <div class="secondary">
    ${section('agent', "The agent's", by('agent').length, agents(by('agent')))}
    ${section('waiting', 'Waiting', waitingItems.length, waiting(waitingItems))}
    ${roadmap(data.roadmap)}
  </div>
</div>
${data.timing ? `<section class="panel"><h2>Gate wall time by week</h2><p class="muted">Root project only (dir .); subproject gates excluded. Medians use successful gates only.</p><ul class="fleet-grid">${data.timing.weeks.map(w => `<li class="fleet-card">${esc(w.week)}<span>${w.lanes.filter(l => l.kind === 'gate').map(l => `${esc(l.machine)}: ${Number.isFinite(l.gateMs) && l.gateMs >= 0 ? `${Math.round(l.gateMs)} ms` : 'Unavailable'} (${esc(l.successful ?? 'Unavailable')} successful, ${esc(l.unsuccessful ?? 'Unavailable')} unsuccessful) [config=${esc(l.lane?.split('\0')[1] ?? 'Unavailable')} command=${esc(l.commandHash ?? 'Unavailable')}${l.gateSources?.length ? ` source=${l.gateSources.map(esc).join(', ')}` : ''}]`).join('; ') || 'Unavailable'}</span></li>`).join('')}</ul><p class="muted">${esc(data.timing.coverage.note)}</p></section>` : ''}
${fleet(data.fleet)}
${sources(data.sources ?? [], data.github)}`;
  }

  function drill(p) {
    if (!p) return '<p>No detail for this phase.</p>';
    const facts = [
      ['Status', `<span class="pill status-${esc(p.status)}">${esc(p.status)}</span>${p.owes ? ` <span class="pill accent">owes a ${esc(p.owes)}${p.waits && p.waits !== 'owner' ? ` (${esc(p.waits)})` : ''}</span>` : ''}`],
      ['Goal', esc(p.goal)], ['Since', esc(p.since)], ...(p.source === 'milestones' ? [['Source', 'GitHub milestone — planning state only'], ...(p.due ? [['Due', esc(p.due)]] : [])] : []), ...(p.after ? [['Not before', esc(p.after)]] : []),
    ];
    return `<header class="drill-head"><p class="eyebrow">Phase ${esc(p.id)}</p><h2 id="drill-title">${esc(p.title)}</h2>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></header>
<h3>Done when${p.doneFrom === 'description' ? ' (whole description)' : ''}</h3><p>${fmt(p.done)}</p>
<h3>${p.source === 'milestones' ? 'GitHub issue state (not verified acceptance)' : 'Acceptance'} <span class="n">${p.boxes.filter(b => b.checked).length}/${p.boxes.length}</span></h3>
<ul class="boxes">${p.boxes.map(b => `<li class="${b.checked ? 'checked' : 'open'}${b.walk ? ' walk' : ''}"><span class="box" role="img" aria-label="${b.checked ? 'checked' : 'open'}"></span><span>${b.walk ? '<span class="pill accent">walk</span> ' : ''}${fmt(b.text)}${b.url ? ext(b.url, 'Issue') : ''}</span></li>`).join('')}</ul>
<h3>Next action</h3><p>${fmt(p.next)}</p>
${p.trajectory?.length ? `<h3>Trajectory, latest</h3><ul class="traj">${p.trajectory.map(t => `<li>${fmt(t)}</li>`).join('')}</ul>` : ''}
<p class="drill-links">${ext(p.link, p.source === 'milestones' ? 'GitHub milestone (read-only)' : 'The phase file')}${(p.evidence ?? []).map(e => ext(e.link, `Evidence: ${esc(e.path.replace(/^docs\/evidence\//, ''))}`)).join('')}</p>`;
  }

  return { page, drill };
}

const CSS = `
:root { color-scheme: light dark; --bg: #f7f7f5; --fg: #1b1b19; --muted: #6b6b65; --faint: #8f8f88; --card: #ffffff; --line: #e4e4de; --soft: #f0f0ec;
  --accent: #2357c6; --accent-soft: #e8eefb; --on-accent: #ffffff; --bad: #b3261e; --bad-soft: #fcebea; --ok: #1e7a3a; --warn: #9a6400; --focus: #2357c6; }
@media (prefers-color-scheme: dark) { :root { --bg: #141413; --fg: #ecece6; --muted: #a3a39b; --faint: #7d7d76; --card: #1e1e1c; --line: #33332f; --soft: #262624;
  --accent: #8cb1ff; --accent-soft: #1f2a44; --on-accent: #0f1a33; --bad: #ff8a80; --bad-soft: #3a1d1b; --ok: #7bd88f; --warn: #f0b85a; --focus: #8cb1ff; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 0 16px 32px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip { position: absolute; left: -999px; } .skip:focus { left: 16px; top: 8px; z-index: 10; background: var(--card); padding: 6px 10px; border-radius: 6px; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
code { font: 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft); padding: 1px 4px; border-radius: 4px; overflow-wrap: anywhere; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
.tnum, .n, .tile-n, .num, time { font-variant-numeric: tabular-nums; }
.top { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
.top .wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding-top: 10px; padding-bottom: 10px; }
.brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-right: auto; }
h1 { font-size: 17px; margin: 0; letter-spacing: -0.01em; }
.meta { color: var(--muted); font-size: 13px; }
.tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
input[type=search] { font: inherit; width: min(280px, 60vw); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); }
.btn, .tools button { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
.btn:hover, .tools button:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
.btn:disabled, .tools button:disabled { opacity: .55; cursor: default; }
.btn-link, .title-btn { font: inherit; background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; text-align: left; }
.btn-link { font-size: 13px; padding: 5px 4px; }
.title-btn { color: inherit; font-weight: 600; } .title-btn:hover { color: var(--accent); text-decoration: underline; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0 20px; }
.tile { font: inherit; text-align: left; display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
.tile:hover { border-color: var(--faint); }
.tile[aria-pressed=true] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.tile-n { font-size: 26px; font-weight: 650; line-height: 1.1; }
.tile-l { font-weight: 600; } .tile-s { color: var(--muted); font-size: 12px; }
.tile-owner .tile-n { color: var(--accent); } .tile-broken .tile-n { color: var(--bad); } .tile-waiting .tile-n { color: var(--muted); }
.layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.primary, .secondary { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
h2 { font-size: 15px; margin: 0 0 10px; display: flex; align-items: baseline; gap: 8px; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 16px 0 8px; font-weight: 600; }
.group:first-of-type h3 { margin-top: 4px; }
.n { color: var(--muted); font-weight: 500; font-size: 12px; background: var(--soft); border-radius: 999px; padding: 0 7px; }
.col[data-waits=owner] > h2 { font-size: 18px; }
.col.has-bad > h2 { color: var(--bad); }
.cards { display: flex; flex-direction: column; gap: 8px; }
.card { background: var(--card); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 8px; padding: 10px 14px; overflow-wrap: anywhere; }
.card.bad { border-left-color: var(--bad); background: linear-gradient(var(--bad-soft), var(--bad-soft)) left / 3px 100% no-repeat, var(--card); }
.card.bad .card-title { color: var(--bad); }
.card.done { border-left-color: var(--ok); opacity: .9; }
.card-title { font-size: 14px; margin: 0 0 2px; font-weight: 600; }
.why { color: var(--muted); margin: 2px 0 0; }
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 6px; font-size: 13px; }
.read { font-weight: 600; } .src { color: var(--faint); font-size: 12px; margin-left: auto; }
.acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.note-form { margin-top: 8px; } .note-form label { display: block; font-size: 13px; color: var(--muted); }
.note-form textarea { display: block; width: 100%; margin-top: 4px; font: inherit; padding: 8px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); resize: vertical; }
.card.yp .yp-label { margin: 0 0 4px; font-size: 12px; } .card.yp .yp-label .title-btn { font-weight: 500; color: var(--muted); }
.card.yp .ask { font-size: 15px; line-height: 1.4; margin: 0 0 4px; }
.yp-part + .yp-part { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line); }
.yp-heading { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.look, .takes { margin: 6px 0 0; font-size: 13px; } .look .k { color: var(--muted); font-weight: 600; margin-right: 4px; } .takes { color: var(--muted); }
.yp-table-wrap { overflow-x: auto; margin-top: 8px; }
.yp-table { border-collapse: collapse; font-size: 12.5px; width: 100%; font-variant-numeric: tabular-nums; }
.yp-table th, .yp-table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: normal; min-width: 6.5em; }
.yp-table th[scope=row] { min-width: 8em; }
.yp-table thead th { color: var(--muted); font-weight: 600; } .yp-table tbody th { font-weight: 500; }
.choice-note { margin-top: 8px; } .choice-note label { display: block; font-size: 13px; color: var(--muted); }
.choice-note textarea { display: block; width: 100%; margin-top: 4px; font: inherit; padding: 8px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); resize: vertical; }
.result .then { margin: 4px 0 0; }
.ask-later { color: var(--fg); }
.result:empty { display: none; } .result { margin-top: 8px; font-size: 13px; }
.result .ok { color: var(--ok); margin: 0; } .result .err { color: var(--bad); margin: 0; white-space: pre-wrap; }
.result pre, .drill pre { white-space: pre-wrap; font: 12px/1.45 ui-monospace, Menlo, monospace; background: var(--soft); border-radius: 6px; padding: 8px; max-height: 360px; overflow: auto; margin: 6px 0 0; }
summary { cursor: pointer; color: var(--muted); margin-top: 4px; }
.queue { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--card); }
.row { display: flex; gap: 10px; padding: 8px 12px; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
.row:first-child { border-top: 0; }
.row.is-next { background: var(--accent-soft); border-radius: 8px 8px 0 0; }
.num { flex: none; min-width: 2.2em; height: 1.7em; display: inline-grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--muted); background: var(--soft); border-radius: 6px; }
.is-next .num { background: var(--accent); color: var(--on-accent); }
.row-body { min-width: 0; flex: 1; } .row-title { font-weight: 600; }
.row .why { font-size: 13px; }
.muted-row .row-title, .muted-row .title-btn { font-weight: 500; color: var(--muted); }
.when { flex: none; min-width: 6.5em; color: var(--muted); font-size: 12px; padding-top: 2px; }
.pill { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 0 7px; border-radius: 999px; background: var(--soft); color: var(--muted); vertical-align: 1px; white-space: nowrap; }
.pill.accent { background: var(--accent-soft); color: var(--accent); } .pill.ok { color: var(--ok); } .pill.warn { color: var(--warn); }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--faint); margin-right: 6px; }
.ci-green { background: var(--ok); } .ci-red { background: var(--bad); }
.none { color: var(--muted); margin: 0; padding: 10px 14px; border: 1px dashed var(--line); border-radius: 8px; }
.panel { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.headline { margin: 0 0 10px; font-weight: 600; }
.goals { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.goal-line { display: flex; gap: 8px; font-size: 13px; } .goal-id { color: var(--muted); font-weight: 600; min-width: 2em; }
.goal-title { flex: 1; min-width: 0; } .bar { display: block; width: 100%; height: 6px; margin-top: 3px; }
.bar .track { fill: var(--soft); } .bar .fill { fill: var(--accent); }
.owed { font-size: 12px; color: var(--muted); }
.fleet { margin-top: 28px; }
.fleet-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.fleet-card { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.fleet-card a { font-weight: 600; } .fleet-card > * { align-self: flex-start; } .muted { color: var(--muted); }
.ci { display: inline-flex; align-items: center; }
.sources { margin-top: 20px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.sources ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; }
.sources li { min-width: 0; max-width: 100%; }
.sources .dot { width: 6px; height: 6px; background: var(--ok); }
.github-read { margin: 8px 0 0; }
.src-na .dot, .src-partial .dot { background: var(--bad); } .src-na b, .src-partial b { color: var(--bad); }
[hidden], .filtered-out { display: none !important; }
[data-card], .col { scroll-margin-top: 80px; } @media (max-width: 560px) { [data-card], .col { scroll-margin-top: 150px; } }
#session-done { margin-bottom: 20px; }
dialog { border: 1px solid var(--line); background: var(--card); color: var(--fg); padding: 0; border-radius: 12px; max-width: 100vw; }
dialog::backdrop { background: rgb(0 0 0 / .35); }
dialog#drill { margin: 0 0 0 auto; height: 100dvh; max-height: 100dvh; width: min(560px, 100vw); border-radius: 12px 0 0 12px; }
.dialog-inner { padding: 18px 20px 28px; }
.dialog-bar { display: flex; justify-content: flex-end; position: sticky; top: 0; background: var(--card); padding: 10px 12px 0; }
.drill h2 { font-size: 18px; margin: 0 0 8px; } .eyebrow { margin: 0; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: 13px; } .facts dt { color: var(--muted); font-size: 11.5px; } .facts dd { margin: 0; }
.boxes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.boxes li { display: flex; gap: 8px; } .boxes li.checked { color: var(--muted); }
.box { flex: none; width: 14px; height: 14px; margin-top: 3px; border: 1.5px solid var(--faint); border-radius: 3px; }
.checked .box { background: var(--ok); border-color: var(--ok); } .open.walk .box { border-color: var(--accent); }
.traj { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; display: grid; gap: 4px; }
.drill-links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 18px; font-weight: 600; }
dialog#help { width: min(420px, 92vw); } .keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; } .keys dd { margin: 0; }
kbd { font: 12px ui-monospace, Menlo, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; background: var(--soft); }
@media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) {
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  dialog#drill { margin: auto 0 0; width: 100vw; height: 92dvh; border-radius: 12px 12px 0 0; }
  .src { margin-left: 0; } input[type=search] { width: 100%; } .tools { width: 100%; } .tools label { flex: 1; }
  .row { flex-wrap: wrap; } .when { min-width: 0; }
}
`;

/** The page's script: actions, refresh, filters, search, keys and the drill-down. Runs under the CSP nonce; no inline handlers. */
const SCRIPT = String.raw`
const V = boardView();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let data = JSON.parse($('#board-data').textContent);
let updated = Date.now(), filter = null, busy = false;
const results = new Map();
const say = t => { $('#status').textContent = t; };

function ago() {
  const s = Math.round((Date.now() - updated) / 1000);
  $('#ago').textContent = 'updated ' + (s < 5 ? 'just now' : s < 90 ? s + ' s ago' : Math.round(s / 60) + ' min ago');
}
setInterval(ago, 5000);

function apply() {
  for (const t of document.querySelectorAll('.tile')) t.setAttribute('aria-pressed', String(t.dataset.filter === filter));
  for (const c of document.querySelectorAll('.col[data-waits]')) c.classList.toggle('filtered-out', !!filter && c.dataset.waits !== filter && c.id !== 'session-done');
  const q = $('#q').value.trim().toLowerCase();
  for (const c of document.querySelectorAll('#board [data-card]')) c.hidden = !!q && !c.dataset.text.includes(q);
  for (const g of document.querySelectorAll('#board .group, #board .queue')) g.hidden = !!q && !g.querySelector('[data-card]:not([hidden])');
}

function settle(card, html, done) {
  const res = card.querySelector('.result');
  res.innerHTML = html;
  if (done) { card.classList.add('done'); for (const x of card.querySelectorAll('.acts, .note-form, .choice-note')) x.remove(); }
}

function draw() {
  const focused = document.activeElement?.closest?.('[data-card]')?.dataset.key;
  $('#board').innerHTML = V.page(data);
  $('#today').textContent = data.today;
  const list = $('#session-done .cards'); list.innerHTML = '';
  for (const [key, r] of results) {
    const card = [...document.querySelectorAll('#board [data-card]')].find(c => c.dataset.key === key);
    if (card) settle(card, r.html, r.done);
    else if (r.done) list.insertAdjacentHTML('beforeend', '<article class="card done" data-card tabindex="0" data-key="' + esc(key) + '" data-text="' + esc(key.toLowerCase()) + '"><h4 class="card-title">' + esc(key) + '</h4><div class="result" role="status">' + r.html + '</div></article>');
  }
  $('#session-done').hidden = !list.children.length;
  apply();
  if (focused) [...document.querySelectorAll('[data-card]')].find(c => c.dataset.key === focused)?.focus();
}

const typing = () => [...document.querySelectorAll('.note-form:not([hidden]) textarea, .choice-note:not([hidden]) textarea')].some(t => t.value.trim()) || document.activeElement?.matches?.('textarea');

async function refresh(auto = false) {
  if (busy || (auto && typing())) return;
  busy = true; $('#refresh').disabled = true; say('Refreshing the board…');
  try {
    // The 60 s refresh uses GitHub reads kept in the last 10 minutes; the button reads GitHub again.
    const r = await fetch(auto ? '/board.json' : '/board.json?fresh=1', { headers: { 'x-plates-token': token }, cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    data = j; updated = Date.now(); draw(); ago(); say('Board refreshed.');
  } catch (e) { $('#ago').textContent = 'refresh failed: ' + e.message; say('Refresh failed: ' + e.message); }
  finally { busy = false; $('#refresh').disabled = false; }
}
setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - updated >= 60000) refresh(true); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - updated >= 60000) refresh(true); });

async function act(card, id, expect, note, choice) {
  const res = card.querySelector('.result');
  const buttons = [...card.querySelectorAll('.acts button')];
  buttons.forEach(b => { b.disabled = true; });
  res.innerHTML = '<p>Running…</p>';
  let html, done = false;
  try {
    const r = await fetch('/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-plates-token': token }, body: JSON.stringify({ id, note, expect }) });
    const j = await r.json();
    const cmd = (j.argv || []).join(' ');
    if (j.error) html = '<p class="err">Refused: ' + esc(j.error) + '</p>';
    else if (j.code !== 0) html = '<p class="err">' + esc(cmd) + ' exited ' + esc(j.code) + '</p><pre>' + esc((j.err || '') + (j.out || '')) + '</pre>';
    else { done = true; html = (choice ? '<p class="ok"><b>Chose: ' + esc(choice.label) + '</b> — ' + (choice.open ? 'recorded, still open' : 'recorded') + '; uncommitted: commit when the gate passes.</p>' + (choice.then ? '<p class="then"><b>Then:</b> ' + esc(choice.then) + '</p>' : '') : '<p class="ok"><b>Done</b> — uncommitted: commit when the gate passes.</p>') + '<details><summary>The diff, from <code>' + esc(cmd) + '</code></summary><pre>' + esc(j.out || '') + (j.err ? '\n' + esc(j.err) : '') + '</pre></details>'; }
  } catch (e) { html = '<p class="err">Failed: ' + esc(e.message) + '</p>'; }
  results.set(card.dataset.key, { html, done });
  if (done) { settle(card, html, true); card.focus(); }
  else { res.innerHTML = html; buttons.forEach(b => { b.disabled = false; }); }
  say(done ? 'Done: ' + card.dataset.key + '. Uncommitted.' : 'Not done: ' + res.textContent);
}

function openNote(btn) {
  const card = btn.closest('[data-card]');
  const form = card.querySelector('.note-form');
  const same = !form.hidden && form.dataset.for === btn.dataset.noteFor;
  for (const b of card.querySelectorAll('[data-note-for]')) b.setAttribute('aria-expanded', 'false');
  if (same) { form.hidden = true; return; }
  form.hidden = false; form.dataset.for = btn.dataset.noteFor; form.dataset.expect = btn.dataset.expect; form.dataset.required = btn.dataset.required || '';
  btn.setAttribute('aria-expanded', 'true');
  form.querySelector('.need').textContent = btn.dataset.required ? '(required: what you saw, or why)' : '(optional)';
  form.querySelector('[data-submit]').textContent = btn.dataset.label;
  form.querySelector('textarea').focus();
}

function openDrill(n) {
  const p = data.phases?.[n];
  if (!p) return;
  $('#drill .drill').innerHTML = V.drill(p);
  $('#drill').showModal();
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, dialog');
  if (!t) return;
  if (t.matches('dialog')) { if (e.target === t) t.close(); return; }
  if (t.matches('.tile')) { filter = filter === t.dataset.filter ? null : t.dataset.filter; apply(); say(filter ? 'Showing ' + t.querySelector('.tile-l').textContent + ' only.' : 'Showing everything.'); return; }
  if (t.matches('[data-drill]')) return openDrill(t.dataset.drill);
  if (t.matches('[data-action]')) {
    // A choice carries the note written beside it, if any, and says what happens next once it is recorded.
    const chose = t.dataset.choice !== undefined;
    const note = chose ? t.closest('.yp-part')?.querySelector('.choice-note:not([hidden]) textarea')?.value.trim() : '';
    return act(t.closest('[data-card]'), t.dataset.action, t.dataset.expect, note || undefined, chose ? { label: t.dataset.choice, then: t.dataset.then, open: !!t.dataset.keepsOpen } : null);
  }
  if (t.matches('[data-choice-note]')) {
    const box = t.closest('.yp-part').querySelector('.choice-note');
    box.hidden = !box.hidden; t.setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) box.querySelector('textarea').focus();
    return;
  }
  if (t.matches('[data-note-for]')) return openNote(t);
  if (t.matches('[data-cancel]')) { const f = t.closest('.note-form'); f.hidden = true; f.closest('[data-card]').querySelector('[aria-expanded=true]')?.focus(); return; }
  if (t.matches('[data-submit]')) {
    const f = t.closest('.note-form'), note = f.querySelector('textarea').value.trim();
    if (f.dataset.required && !note) { f.querySelector('.need').textContent = '(required: write what you saw, or why)'; f.querySelector('textarea').focus(); return; }
    return act(t.closest('[data-card]'), f.dataset.for, f.dataset.expect, note || undefined);
  }
  if (t.matches('[data-close]')) return t.closest('dialog').close();
  if (t.id === 'refresh') return refresh();
  if (t.id === 'keys') return $('#help').showModal();
});

$('#q').addEventListener('input', apply);

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.matches?.('input, textarea, select')) { if (e.key === 'Escape' && t.id === 'q') { t.value = ''; apply(); t.blur(); } return; }
  if (document.querySelector('dialog[open]')) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  else if (e.key === 'j' || e.key === 'k') {
    const cards = [...document.querySelectorAll('[data-card]')].filter(c => c.offsetParent !== null);
    if (!cards.length) return;
    const i = cards.indexOf(document.activeElement?.closest?.('[data-card]'));
    const next = cards[Math.max(0, Math.min(cards.length - 1, i < 0 ? 0 : i + (e.key === 'j' ? 1 : -1)))];
    next.focus(); next.scrollIntoView({ block: 'nearest' });
  }
  else if (e.key === 'Enter' && t.matches?.('[data-card]')) { if (t.dataset.phase) { e.preventDefault(); openDrill(t.dataset.phase); } }
  else if (e.key === 'r') refresh();
  else if (e.key === '?') $('#help').showModal();
});
`;

/**
 * The page: the board drawn on the server by boardView (so it reads without
 * script), its data inline for the drill-down and refresh, CSS and JS inline
 * under the CSP nonce. No CDN, no build.
 */
export function pageHtml(data, token, nonce = '') {
  const n = nonce ? ` nonce="${nonce}"` : '';
  const json = s => JSON.stringify(s).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16)}`);
  const name = esc(data.name ?? 'plates');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${name}: whose turn it is</title>
<style${n}>${CSS}</style></head><body>
<a class="skip" href="#h-owner">Skip to your turn</a>
<header class="top"><div class="wrap">
  <div class="brand"><h1>${name}: whose turn it is</h1><span class="meta"><time id="today">${esc(data.today)}</time> · <span id="ago">updated just now</span></span></div>
  <div class="tools"><label><span class="sr">Search the board</span><input id="q" type="search" placeholder="Search  ( / )" autocomplete="off"></label><button type="button" id="refresh" title="Refresh (r)">Refresh</button><button type="button" id="keys" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button></div>
</div></header>
<div class="wrap">
<section id="session-done" class="col" aria-labelledby="h-done" hidden><h2 id="h-done">Done this session</h2><div class="cards"></div></section>
<main id="board">
${boardView().page(data)}
</main>
</div>
<dialog id="drill" aria-labelledby="drill-title"><div class="dialog-bar"><button type="button" class="btn" data-close>Close</button></div><div class="dialog-inner drill"></div></dialog>
<dialog id="help" aria-labelledby="help-title"><div class="dialog-inner"><h2 id="help-title">Keys</h2>
<dl class="keys"><dt><kbd>/</kbd></dt><dd>search</dd><dt><kbd>j</kbd> <kbd>k</kbd></dt><dd>next, previous card</dd><dt><kbd>Enter</kbd></dt><dd>open the focused phase</dd><dt><kbd>r</kbd></dt><dd>refresh</dd><dt><kbd>?</kbd></dt><dd>these keys</dd><dt><kbd>Esc</kbd></dt><dd>close, or clear the search</dd></dl>
<p><button type="button" class="btn" data-close>Close</button></p></div></dialog>
<div id="status" class="sr" role="status" aria-live="polite"></div>
<script type="application/json" id="board-data"${n}>${json(data)}</script>
<script${n}>
const token = ${json(token)};
${boardView.toString().replace(/<\/script/gi, '<\\/script')}
${SCRIPT}
</script>
</body></html>`;
}

// ---- the server ------------------------------------------------------------------------

/** The page's Content-Security-Policy: nothing loads from elsewhere; inline script and style only with this response's nonce. */
export const csp = nonce => [
  "default-src 'none'",
  nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
  nonce ? `style-src 'nonce-${nonce}'` : "style-src 'none'",
  "connect-src 'self'", "img-src 'self' data:", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');

const same = (a, b) => { const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? '')); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * The board's server, on 127.0.0.1 only. Every request carries the launch's
 * token (the page's URL, then x-plates-token on each action), and a Host that is
 * this server's own (no DNS rebinding); an action runs only one the latest
 * board offered (by id), through `run(argv)` — the CLI's own main by default.
 */
export async function serve({ root, port = 0, token = randomBytes(24).toString('hex') }, deps = {}) {
  const build = deps.board ?? (({ fresh = false } = {}) => board({ root }, { ...deps, fresh }));
  const runVerb = deps.run ?? (async argv => {
    const { main } = await import('./cli.mjs');
    let out = '', err = '';
    const code = await main(argv, { cwd: root, out: s => { out += s; }, err: s => { err += s; } });
    return { code, out, err };
  });
  let actions = new Map();
  const send = (res, status, body, type = 'application/json', nonce = null) => {
    res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
      'content-security-policy': csp(nonce), 'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-origin' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const server = createServer(async (req, res) => {
    try {
      const { port: at } = server.address();
      const url = new URL(req.url, `http://127.0.0.1:${at}`);
      if (![`127.0.0.1:${at}`, `localhost:${at}`].includes(req.headers.host)) return send(res, 403, { error: 'wrong host' });
      if (req.headers.origin && ![`http://127.0.0.1:${at}`, `http://localhost:${at}`].includes(req.headers.origin)) return send(res, 403, { error: 'wrong origin' });
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/board.json')) {
        // The page's own refresh sends the token as a header, so it stays out of request lines and logs.
        if (!same(url.searchParams.get('token'), token) && !(url.pathname === '/board.json' && same(req.headers['x-plates-token'], token))) return send(res, 403, { error: 'no token: open the URL plates board printed' });
        const data = await build({ fresh: url.pathname === '/board.json' && url.searchParams.get('fresh') === '1' });
        actions = new Map(data.items.flatMap(it => it.actions.map(a => [a.id, a])));
        if (url.pathname !== '/') return send(res, 200, data);
        const nonce = randomBytes(16).toString('base64');
        return send(res, 200, pageHtml(data, token, nonce), 'text/html', nonce);
      }
      if (req.method === 'POST' && url.pathname === '/action') {
        if (!same(req.headers['x-plates-token'], token)) return send(res, 403, { error: 'no token' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 64 * 1024) return send(res, 413, { error: 'too large' }); }
        let ask;
        try { ask = JSON.parse(body); } catch { return send(res, 400, { error: 'not JSON' }); }
        const a = actions.get(ask?.id);
        if (!a || !ACTION_VERBS.includes(a.verb)) return send(res, 404, { error: 'no such action on the board: reload it' });
        // The page says which command it meant; a board rebuilt since (another tab, a refresh) may have moved the ids.
        if (ask.expect !== undefined && ask.expect !== [a.verb, ...a.args].join(' ')) return send(res, 409, { error: 'the board changed since this page drew it: refresh, then try again' });
        const note = typeof ask.note === 'string' ? oneLine(ask.note) : '';
        if (a.note === 'required' && !note) return send(res, 400, { error: 'this action needs a note' });
        const args = [...a.args];
        if (note) {
          if (a.verb === 'walk decide') args.push(note); // the why after --accept/--decline
          else if (a.verb === 'walk done') { const i = args.indexOf('--note'); if (i >= 0) args[i + 1] = note; else args.push('--note', note); }
          else args.push('--note', note);
        } else if (a.verb === 'walk decide' && args.at(-1) === '--decline') return send(res, 400, { error: 'declining needs a why' });
        const r = await runVerb([...a.verb.split(' '), ...args]);
        return send(res, 200, { ...r, argv: ['plates', ...a.verb.split(' '), ...args], note: DIFF_NOTE });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: clip(e?.message ?? e, 300) });
    }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done); });
  const { address, port: bound } = server.address();
  const url = `http://127.0.0.1:${bound}/?token=${token}`;
  return { server, address, port: bound, token, url, close: () => new Promise(done => server.close(done)) };
}

/** Open a URL in the owner's browser; a failure is said, never thrown. */
export function openBrowser(url, platform = process.platform) {
  const [cmd, args] = platform === 'darwin' ? ['open', [url]] : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); return true; } catch { return false; }
}

/** plates board (no --json): serve the page until stopped. */
export async function boardServe({ root, open = false, port }, deps = {}) {
  const s = await serve({ root, port }, deps);
  if (open) openBrowser(s.url);
  return { data: { ok: true, url: s.url, address: s.address, port: s.port },
    text: `plates board: ${s.url}\nServing on 127.0.0.1 only; the token in the URL is this launch's. Ctrl-C stops it.${open ? '' : ' (--open opens it.)'}` };
}
