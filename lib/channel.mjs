// A project's channel (plates phase 194, increment 1): what every agent on a
// plate is doing, newest last, read only. One read model, two renderers: the
// CLI (`plates channel`, lib/home.mjs reads the sources) and the web
// (`/channel` and a plate page's Channel section, lib/web/home.mjs reads them)
// hand this module the sources they already read, as plain data, and render
// the same lines and the same Here now.
//
//   channelInputOf(project, { claims, prs })   one plate's sources, from Home's value and the claims and PR reads
//   channelFor(plates, { now, since, waiting }) the model: { lines, hereNow, plates, window, readFrom, notRead }
//   channelText(model)                          the terminal's rendering
//
// A line is { at, plate, kind, actor, text, ref, source, phase, pr }. `kind`
// is one of KINDS; `actor` is `<plate>#<phase>` when the line belongs to a
// phase, else `<plate>!<PR number>` for a pull request that names no phase
// (a different mark, so PR 42 is never phase 42), else the plate. `phase` and
// `pr` are the same identity as numbers (or null): Here now matches on them,
// never on the display string. `ref` is the line's link (or, for a waiting
// session, the command that opens it). A source that could not be
// read is a `gap` line naming it, never an empty, quiet channel.
//
// Pure: no reads, no clock, no imports. Nothing here writes, posts or makes
// any agent act; agents' own lines (`plates say`) and the owner's arrive with
// increments 2 and 3.

export const KINDS = Object.freeze(['joined', 'left', 'pushed', 'pr', 'ci', 'deploy', 'waiting', 'say', 'owner', 'checkpoint', 'gap']);
/** The feed covers this many days unless --since asks for less. */
export const WINDOW_DAYS = 7;
/** Joined/left runs of more than `more` lines within `withinMs` on one plate fold into one line. */
export const FOLD = Object.freeze({ more: 3, withinMs: 10 * 60_000 });
/** Unread counts lines newer than this many hours: the channel keeps no read position yet (no write this increment). */
export const UNREAD_HOURS = 24;
/** What the feed does not show yet, said in both forms rather than left out quietly. */
export const NOT_READ_YET = Object.freeze([
  'merged and closed pull requests and released claims (left lines): no reader keeps them yet',
  'lines agents post themselves (plates say) and the owner\'s lines: increments 2 and 3',
]);
const DAY = 86_400_000, HOUR = 3_600_000;
const iso = v => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const clip = (v, n = 200) => typeof v === 'string' && v.trim() ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : null;
const repoOk = repo => /^[\w.-]+\/[\w.-]+$/.test(repo ?? '');
const github = (repo, path) => repoOk(repo) ? `https://github.com/${repo}${path}` : null;
const httpsGithub = url => typeof url === 'string' && url.startsWith('https://github.com/') ? url : null;
const branchPath = branch => branch.split('/').map(encodeURIComponent).join('/');
const READABLE = ['complete', 'partial', 'stale'];

/**
 * One plate's channel input from its Home value (the same read in both forms), its claims ({ state: 'read', claims, prs }
 * from lib/claim.mjs readClaims or the App's claims read, { state: 'none' } with no remote, or { state: 'unavailable', why })
 * and its open pull requests ({ state: 'read', items } in agents-model prOf's shape, or { state: 'unavailable', why }).
 * The value carries its phases' titles (roadmap), its changes in flight (waits) and main vs production (release).
 */
export function channelInputOf(project, { claims = null, prs = null } = {}) {
  const base = { projectId: project?.id ?? null, name: project?.name ?? project?.id ?? null, repo: project?.repo ?? null };
  if (!READABLE.includes(project?.state)) return { ...base, loading: project?.state === 'loading', na: project?.state === 'loading' ? 'its sources are still loading' : clip(project?.gaps?.[0]?.reason) ?? 'the plate was not read' };
  return { ...base, stale: project.state === 'stale', titles: Object.fromEntries((project.roadmap?.phases ?? []).map(p => [String(p.id), clip(p.title, 180)])),
    claims: claims ?? { state: 'unavailable', why: 'not read' }, prs: prs ?? { state: 'unavailable', why: 'not read' },
    waits: project.waits ?? null, release: project.release ?? null };
}

/**
 * A change in flight (lib/integration-delays.mjs states) as lines, each dated by what it says: a push by the branch head's time
 * (headAt), and a state by when it began (since). A `branch` change whose since is not its last push was sent back: its checks
 * failed, or plates integrate returned it; that is its own line at its own time. States with no line here are left to the PR lines.
 */
function waitLines(i) {
  const b = i.branch, next = clip(i.next, 160);
  switch (i.state) {
    case 'active': return [{ kind: 'pushed', at: i.headAt ?? i.since, text: `pushed ${b}` }];
    case 'branch': {
      const sentBack = /^sent back by plates integrate/.test(i.next ?? ''), failed = !sentBack && /^fix /.test(i.next ?? '');
      const pushedAt = i.headAt ?? (sentBack || failed ? null : i.since);
      return [...(pushedAt ? [{ kind: 'pushed', at: pushedAt, text: `last pushed ${b}` }] : []),
        ...(failed ? [{ kind: 'ci', at: i.since, text: `checks failed on ${b}: ${next}` }] : []),
        ...(sentBack ? [{ kind: 'pr', at: i.since, text: `${b} was ${next}` }] : [])];
    }
    case 'ci': return [{ kind: 'ci', at: i.since, text: `checks: ${next ?? `running on ${b}`}` }];
    case 'integration': return [{ kind: 'pr', at: i.since, text: `${b} is marked ready to integrate` }];
    case 'deploy': return [{ kind: 'deploy', at: i.since, text: `${b} passed main's checks and is not deployed yet` }];
    default: return [];
  }
}

/** One plate's lines, unwindowed and unfolded. */
function plateLines(p, { at }) {
  const out = [], plate = p.projectId;
  const add = (l) => out.push({ at: l.at, plate, kind: l.kind, actor: l.phase != null ? `${plate}#${l.phase}` : l.pr != null ? `${plate}!${l.pr}` : plate,
    text: l.text, ref: l.ref ?? null, source: l.source, phase: l.phase ?? null, pr: l.phase != null ? null : l.pr ?? null });
  const gap = (source, text) => add({ at, kind: 'gap', text, source });
  if (p.na) { gap('plate', `${p.name ?? plate} was not read: ${p.na}`); return out; }
  const title = n => p.titles?.[String(n)] ?? null;
  // Which phase each open PR and branch belongs to: the claims read's PRs whose branch names a phase.
  const prPhase = new Map(), branchPr = new Map();
  if (p.claims?.state === 'read') {
    for (const pr of p.claims.prs ?? []) if (Number.isSafeInteger(pr?.number)) { prPhase.set(pr.number, pr.phase); if (pr.branch) branchPr.set(pr.branch, pr.number); }
    const joined = new Set();
    for (const c of p.claims.claims ?? []) {
      const t = iso(c.at);
      if (!t) { gap('claims', `the claim on phase ${c.phase} has no readable time`); continue; }
      joined.add(c.phase);
      add({ at: t, kind: 'joined', phase: c.phase, source: 'claims', ref: github(p.repo, `/tree/claims/phase-${c.phase}`),
        text: `${clip(c.provider, 40) ?? 'an agent'} claimed phase ${c.phase}${title(c.phase) ? `: ${title(c.phase)}` : ''}${clip(c.machine, 80) ? ` on ${clip(c.machine, 80)}` : ''}` });
    }
    // An open PR naming a phase nobody claims is that phase's agent joining too.
    for (const pr of p.claims.prs ?? []) {
      const t = iso(pr.at);
      if (joined.has(pr.phase) || !t) continue;
      joined.add(pr.phase);
      add({ at: t, kind: 'joined', phase: pr.phase, source: 'claims', ref: httpsGithub(pr.url),
        text: `${clip(pr.author, 60) ?? 'an agent'} joined phase ${pr.phase}${title(pr.phase) ? `: ${title(pr.phase)}` : ''} with #${pr.number}` });
    }
  } else if (p.claims?.state !== 'none') gap('claims', `claims unread: ${clip(p.claims?.why) ?? 'not read'}`);
  if (p.prs?.state === 'read') {
    for (const pr of p.prs.items ?? []) {
      const t = iso(pr.createdAt);
      if (!t || !Number.isSafeInteger(pr.number)) continue;
      const phase = prPhase.get(pr.number);
      add({ at: t, kind: 'pr', phase: phase ?? null, pr: pr.number, source: 'prs', ref: httpsGithub(pr.url),
        text: `opened #${pr.number}: ${clip(pr.title, 160) ?? 'untitled'}${pr.isDraft ? ' (draft)' : ''}${clip(pr.author, 60) ? ` by ${clip(pr.author, 60)}` : ''}` });
    }
  } else gap('prs', `open pull requests unread: ${clip(p.prs?.why) ?? 'not read'}`);
  // Pushes, CI and changes waiting to land or deploy: the plate's changes in flight (phase 158), as Home read them.
  const w = p.waits;
  if (!w) gap('waits', 'pushes and CI unread: the plate\'s changes in flight were not read');
  else if (w.state === 'off') gap('waits', `pushes and CI are not read here: ${clip(w.reason) ?? 'the delivery practice is off'}`);
  else if (w.state !== 'read') gap('waits', `pushes and CI unread: ${clip(w.reason) ?? 'not read'}`);
  else {
    for (const i of w.items ?? []) {
      if (typeof i?.branch !== 'string') continue;
      const phase = Number.isInteger(i.phase) ? i.phase : null, pr = branchPr.get(i.branch) ?? null;
      for (const l of waitLines(i)) {
        const t = iso(l.at);
        if (t) add({ at: t, kind: l.kind, phase, pr, source: 'waits', text: l.text, ref: github(p.repo, l.kind === 'ci' ? '/actions' : `/tree/${branchPath(i.branch)}`) });
      }
    }
    // A read that is 'read' overall can still have lost a source (no Checks permission, a bound): each is named, once.
    const said = new Set(), named = new Set();
    for (const [name, c] of Object.entries(w.coverage ?? {})) if (c?.state === 'unavailable' && c.why) { named.add(name); gap('waits', `${name} unread: ${clip(c.why)}`); }
    for (const g of w.gaps?.items ?? []) {
      if (!['source', 'partial'].includes(g?.kind) || !g.why || (g.kind === 'source' && named.has(g.source))) continue;
      const text = `${g.source ?? 'a source'} ${g.kind === 'partial' ? 'partly read' : 'unread'}: ${clip(g.why)}`;
      if (!said.has(text)) { said.add(text); gap('waits', text); }
    }
    if (w.gaps?.count > (w.gaps?.items ?? []).length) gap('waits', `${w.gaps.count - w.gaps.items.length} more gaps in the changes in flight are not listed`);
    if (w.more > 0) gap('waits', `${w.more} more change${w.more === 1 ? '' : 's'} in flight not listed: the read keeps the newest`);
  }
  // Deploys: production's commit and when it began serving, from the deploy records Home read (main vs production).
  const r = p.release;
  if (!r) gap('deploys', 'deploys unread: the deploy records were not read');
  else if (r.state === 'unknown' && !r.production) gap('deploys', `deploys unread: ${clip(r.why) ?? 'unknown'}`);
  const sha = r?.production?.sha, served = iso(r?.production?.at);
  if (typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha) && served) add({ at: served, kind: 'deploy', source: 'deploys', ref: github(p.repo, `/commit/${sha}`), text: `deployed ${sha.slice(0, 7)} to production` });
  return out;
}

/** Sessions waiting on the owner (Home's row, lib/waiting-sessions.mjs waitingRows): lines on the plates shown, or one gap for every plate. */
function waitingLines(waiting, shown, { at }) {
  if (!waiting) return [{ at, plate: null, kind: 'gap', actor: null, text: 'sessions waiting on you unread', ref: null, source: 'waiting', phase: null, pr: null }];
  if (waiting.na) return [{ at, plate: null, kind: 'gap', actor: null, text: `sessions waiting on you unread: ${clip(waiting.na)}`, ref: null, source: 'waiting', phase: null, pr: null }];
  const out = [];
  for (const s of waiting.items ?? []) {
    const t = iso(s.at ?? s.since);
    if (!shown.has(s.plate) || !t) continue;
    out.push({ at: t, plate: s.plate, kind: 'waiting', actor: s.plate, text: `${clip(s.title, 120) ?? 'a session is waiting on you'}${clip(s.why, 200) ? `: ${clip(s.why, 200)}` : ''}`, ref: clip(s.read, 120), source: 'waiting', phase: null, pr: null });
  }
  return out;
}

const ORDER = new Map(KINDS.map((k, i) => [k, i]));
const byTime = (a, b) => a.at.localeCompare(b.at) || String(a.plate ?? '').localeCompare(String(b.plate ?? '')) || ORDER.get(a.kind) - ORDER.get(b.kind)
  || String(a.actor ?? '').localeCompare(String(b.actor ?? '')) || a.text.localeCompare(b.text);

/** Joined/left runs: more than FOLD.more on one plate within FOLD.withinMs of the run's first become one line. Lines in time order. */
export function foldRoutine(lines) {
  const routine = l => l.kind === 'joined' || l.kind === 'left', out = [], used = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const l = lines[i];
    if (!routine(l)) { out.push(l); continue; }
    const start = Date.parse(l.at), run = [i];
    for (let j = i + 1; j < lines.length && Date.parse(lines[j].at) - start <= FOLD.withinMs; j++) if (routine(lines[j]) && lines[j].plate === l.plate) run.push(j);
    if (run.length <= FOLD.more) { out.push(l); continue; }
    for (const j of run) used.add(j);
    const members = run.map(j => lines[j]), kinds = new Set(members.map(m => m.kind)), last = members.at(-1);
    out.push({ at: last.at, plate: l.plate, kind: kinds.size === 1 ? l.kind : 'joined', actor: l.plate, source: 'claims', ref: null, phase: null, pr: null, folded: members.length,
      text: `${members.length} agents rotated: ${[...new Set(members.map(m => m.actor))].join(', ')}` });
  }
  return out.sort(byTime);
}

/**
 * The agents holding work: each live claim, and each open PR naming a phase nobody claims; with its last line's age (or, with
 * no line in the window, its claim's or PR's) and unread count. Most recent activity first: the newest of its last line, its
 * claim and its PR. Holders with no activity for more than WINDOW_DAYS are folded out (idleOf); they still hold the work.
 */
export function hereNow(plates, lines, { now, readFrom }) {
  const out = [];
  for (const p of plates) {
    if (p.na || p.claims?.state !== 'read') continue;
    const held = new Map();
    for (const c of p.claims.claims ?? []) held.set(c.phase, { phase: c.phase, provider: clip(c.provider, 40), since: iso(c.at), via: 'claim' });
    for (const pr of p.claims.prs ?? []) if (!held.has(pr.phase)) held.set(pr.phase, { phase: pr.phase, provider: clip(pr.author, 60), since: iso(pr.at), via: `#${pr.number}` });
    for (const h of [...held.values()].sort((a, b) => a.phase - b.phase)) {
      // Matched on the structured identity (this plate, this phase), never on the display string: PR 42 is not phase 42.
      const actor = `${p.projectId}#${h.phase}`, mine = lines.filter(l => l.plate === p.projectId && l.phase === h.phase && l.kind !== 'gap'), last = mine.at(-1) ?? null;
      const unread = mine.filter(l => l.at > readFrom).length;
      const activeAt = [last?.at, h.since].filter(Boolean).sort().at(-1) ?? null;
      const row = { plate: p.projectId, name: p.name ?? p.projectId, actor, phase: h.phase, title: p.titles?.[String(h.phase)] ?? null, provider: h.provider, via: h.via,
        since: h.since, sinceAge: h.since ? ageText(now - Date.parse(h.since)) : null, activeAt,
        last: last ? { at: last.at, kind: last.kind, text: last.text, age: ageText(now - Date.parse(last.at)) } : null, unread, caughtUp: unread === 0 };
      out.push({ ...row, words: hereText(row) });
    }
  }
  return out.sort((a, b) => String(b.activeAt ?? '').localeCompare(String(a.activeAt ?? '')) || a.actor.localeCompare(b.actor));
}

/** Here now split: the holders active within WINDOW_DAYS, and the rest as one trailing row (or null). Rows in hereNow's order. */
export function idleOf(rows, { now }) {
  const floor = new Date(now - WINDOW_DAYS * DAY).toISOString();
  const active = rows.filter(r => r.activeAt && r.activeAt >= floor), idle = rows.filter(r => !active.includes(r));
  if (!idle.length) return { active, idle: null };
  const oldest = idle.map(r => r.activeAt).filter(Boolean).sort()[0] ?? null, age = oldest ? ageText(now - Date.parse(oldest)) : 'unknown';
  return { active, idle: { count: idle.length, oldest, actors: idle.map(r => r.actor), words: `${idle.length} idle claim${idle.length === 1 ? '' : 's'}, oldest ${age}` } };
}

/** An age in words both forms print: "now", "12m", "3h", "2d". */
export function ageText(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 60_000) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / 60_000)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/**
 * The channel both forms render. plates: channelInputOf each plate shown. waiting: Home's Sessions waiting on you row
 * ({ items, why } or { na }), read once for every plate. since: an ISO time; the window starts at the later of it and
 * WINDOW_DAYS ago. Gap lines are dated now, so they sit at the newest end, and are never windowed out.
 */
export function channelFor(plates, { now, since = null, waiting = null } = {}) {
  const t = typeof now === 'number' ? now : Date.parse(now), at = new Date(t).toISOString();
  const floor = t - WINDOW_DAYS * DAY, asked = Date.parse(since ?? '');
  const from = new Date(Number.isFinite(asked) && asked > floor ? asked : floor).toISOString();
  const shown = new Set(plates.map(p => p.projectId));
  const all = [...plates.flatMap(p => plateLines(p, { at })), ...waitingLines(waiting, shown, { at })]
    .filter(l => l.kind === 'gap' || l.at >= from).sort(byTime);
  // Folding is for the feed only: Here now reads each agent's own lines, unfolded.
  const lines = foldRoutine(all);
  const readFrom = new Date(t - UNREAD_HOURS * HOUR).toISOString();
  return { schema: 1, generatedAt: at, window: { days: WINDOW_DAYS, from }, readFrom, unreadFrom: `the last ${UNREAD_HOURS} hours`,
    // state: read, stale (read before Home's ten minutes), loading or not read; the web reads again while any is loading or stale.
    plates: plates.map(p => ({ projectId: p.projectId, name: p.name ?? p.projectId, state: p.na ? (p.loading ? 'loading' : 'not read') : p.stale ? 'stale' : 'read', count: lines.filter(l => l.plate === p.projectId).length })),
    lines, ...(({ active, idle }) => ({ hereNow: active, hereIdle: idle }))(idleOf(hereNow(plates, all, { now: t, readFrom }), { now: t })), notRead: [...NOT_READ_YET] };
}

/** A line's time as both forms print it: UTC, to the minute. */
export const lineTime = at => `${String(at).slice(0, 16).replace('T', ' ')} UTC`;
/** A Here now row's words, as both forms print them (the model carries them as `words`). */
export const hereText = h => `${h.title ?? `phase ${h.phase}`}${h.provider ? ` · ${h.provider}` : ''} · ${h.last ? `last line ${h.last.age} ago` : h.sinceAge ? `${h.via === 'claim' ? 'claimed' : `${h.via} opened`} ${h.sinceAge} ago` : 'no line yet'} · ${h.caughtUp ? 'Caught up' : `${h.unread} unread`}`;

/** The channel in a terminal (plates channel). */
export function channelText(model) {
  const names = model.plates.map(p => p.name).join(', ') || 'no plates';
  const out = [`plates channel — ${names}, since ${lineTime(model.window.from)}`, '', `Here now (${model.hereNow.length})`];
  if (!model.hereNow.length && !model.hereIdle) out.push('  nobody holds work');
  for (const h of model.hereNow) out.push(`  ${h.actor}  ${h.words}`);
  if (model.hereIdle) out.push(`  ${model.hereIdle.words}: ${model.hereIdle.actors.join(', ')}`);
  out.push('', `Lines (${model.lines.length}), newest last`);
  if (!model.lines.length) out.push('  none in the window');
  for (const l of model.lines) out.push(`  ${lineTime(l.at)}  ${l.actor ?? 'all plates'}  ${l.kind}  ${l.text}`);
  for (const p of model.plates.filter(p => p.state !== 'read')) out.push(`${p.name}: ${p.state}`);
  out.push('', `Unread counts lines in ${model.unreadFrom}; no read position is kept yet.`, ...model.notRead.map(n => `Not in the feed yet: ${n}.`));
  return out.join('\n');
}
