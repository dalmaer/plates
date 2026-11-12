// Agents and Pending review (plates phase 186; docs/specs/web-backlog.md, the
// sidebar's Agents and Pending review rows, Agent presence and Policy). Pure
// and browser-safe: the readers hand it each plate's config (its `agents`
// provider map and `backlog` policy, as Home's read keeps them), its claims as
// each form reads them, its phases' titles, and its open pull requests.
// Nothing here starts, stops or attaches an agent (phase 181).

/** The routes an agent may join by (the spec's Agents join → Routes), in order. */
export const ROUTES = Object.freeze([
  { id: 'session', title: 'Session', start: 'claim, then /spin in Claude Code or Codex' },
  { id: 'local-host', title: 'Local agent host', start: 'a command on the owner\'s machine (phase 183)' },
  { id: 'tonight', title: 'Tonight', start: 'tonight\'s plan' },
  { id: 'robot', title: 'Robot', start: 'an agent issue' },
  { id: 'worker', title: 'Worker', start: 'a registered workflow' },
]);
/** With no `backlog` policy, the only route is a session: today's behaviour, unchanged. */
export const DEFAULT_ROUTES = Object.freeze(['session']);
/** Durable workers stay off until they are activated (phase 104). */
export const WORKER_OFF = 'durable workers are disabled until activated (phase 104)';
/** A claim with no push for this many days is stale (lib/claim.mjs STALE_DAYS; tests hold them equal). */
export const PRESENCE_STALE_DAYS = 7;
const DAY = 86_400_000;
const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (v, n = 200) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n) : null;

/** A claim's presence word (spec: Agent presence): claimed, or stale after STALE_DAYS; an execution source would say more, and none is read yet. */
export function presenceOf(claim, now) {
  const at = Date.parse(claim?.at ?? ''), t = typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(t)) return { word: 'claimed', source: 'claim branch', since: null };
  return { word: t - at >= PRESENCE_STALE_DAYS * DAY ? 'stale' : 'claimed', source: 'claim branch', since: new Date(at).toISOString() };
}

/** Why a route is off on one plate, or null when it is on: robot.on first, then the worker, then the policy. */
function routeOff(route, config) {
  if (route === 'robot' && config?.robot?.on !== true) return { key: 'robot.on', why: 'robot.on is not true' };
  if (route === 'worker') return { key: 'worker', why: WORKER_OFF };
  const routes = record(config?.backlog) && Array.isArray(config.backlog.routes) ? config.backlog.routes : DEFAULT_ROUTES;
  if (!routes.includes(route)) return { key: 'backlog.routes', why: record(config?.backlog) ? `not in backlog.routes` : 'not in policy (no "backlog" key: session only)' };
  return null;
}

/** The routes one plate offers an attach, and why each other route is off (phase 181). Absent policy: session only. */
export function offeredRoutes(config) {
  const on = [], off = {};
  for (const r of ROUTES) { const why = routeOff(r.id, config); if (why) off[r.id] = why; else on.push(r.id); }
  return { on, off };
}

/**
 * The fleet's agents. plates: [{ projectId, projectName, config, claims:
 * [{ phase, branch, provider, machine, at }], titles: { [phase]: title } }]
 * (a plate whose config or claims could not be read is { projectId, na }):
 * each plate's config and claims together, since policy is per plate.
 * presence: a function (claim, now, plate) → { word, source, since }; presenceOf by
 * default. Returns { providers, routes }: each provider in any plate's `agents`
 * map, and any provider a claim names that is not there (listed: false), with
 * the items it holds or idle; each route with the plates it is on for, or off
 * with each reason.
 */
export function agentsOf(plates, { now, presence = presenceOf } = {}) {
  const read = plates.filter(p => !p.na);
  const providers = new Map();
  const provider = (id, listed) => {
    if (!providers.has(id)) providers.set(id, { id, listed, plates: [], holds: [] });
    const p = providers.get(id); if (listed) p.listed = true; return p;
  };
  for (const plate of read) for (const id of Object.keys(record(plate.config?.agents) ? plate.config.agents : {})) provider(id, true).plates.push(plate.projectId);
  for (const plate of read) for (const c of plate.claims ?? []) {
    const p = provider(clip(c.provider, 40) ?? 'unknown', false);
    const pres = presence(c, now, plate);
    p.holds.push({ projectId: plate.projectId, projectName: plate.projectName ?? plate.projectId, phase: c.phase, title: clip(plate.titles?.[c.phase] ?? null, 180), branch: c.branch, machine: clip(c.machine, 80), presence: pres.word, presenceSource: pres.source, since: pres.since });
  }
  const list = [...providers.values()].map(p => ({ ...p, holds: p.holds.sort((a, b) => String(a.since).localeCompare(String(b.since)) || a.projectId.localeCompare(b.projectId) || a.phase - b.phase),
    state: p.holds.length ? 'working' : 'idle' })).sort((a, b) => Number(b.listed) - Number(a.listed) || a.id.localeCompare(b.id));
  const routes = ROUTES.map(r => {
    const on = [], off = [];
    for (const plate of read) { const why = routeOff(r.id, plate.config); if (why) off.push({ projectId: plate.projectId, ...why }); else on.push(plate.projectId); }
    const reasons = [...new Map(off.map(o => [`${o.key}:${o.why}`, { key: o.key, why: o.why, plates: off.filter(x => x.key === o.key && x.why === o.why).map(x => x.projectId) }])).values()];
    return { id: r.id, title: r.title, start: r.start, state: on.length ? 'on' : 'off', plates: on, ...(on.length ? {} : { off: reasons }) };
  });
  return { providers: list, routes, plates: plates.map(p => ({ projectId: p.projectId, projectName: p.projectName ?? p.projectId, state: p.na ? (p.state ?? 'not read') : (p.state ?? 'read'), ...(p.na ? { reason: p.na } : {}) })) };
}

/**
 * Pending review across the fleet: open PRs whose autoMergeRequest is null,
 * oldest first. plates: [{ projectId, projectName, repo, prs: { state: 'read',
 * items: [{ number, title, url, createdAt, isDraft, reviewDecision,
 * autoMerge, author }] } | { state: 'unavailable', why } }]. A PR set to
 * auto-merge merges itself when its checks pass: it is not waiting on you.
 */
export function pendingOf(plates, { now }) {
  const t = typeof now === 'number' ? now : Date.parse(now), items = [];
  for (const plate of plates) if (plate.prs?.state === 'read') for (const pr of plate.prs.items) {
    if (pr.autoMerge === true || !Number.isSafeInteger(pr.number)) continue;
    const at = Date.parse(pr.createdAt ?? '');
    items.push({ key: `${plate.projectId}:review:${pr.number}`, projectId: plate.projectId, projectName: plate.projectName ?? plate.projectId, number: pr.number, title: clip(pr.title, 200) ?? `#${pr.number}`,
      url: typeof pr.url === 'string' && pr.url.startsWith('https://github.com/') ? pr.url : null, createdAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
      ageDays: Number.isFinite(at) && Number.isFinite(t) ? Math.max(0, Math.floor((t - at) / DAY)) : null, draft: pr.isDraft === true,
      review: typeof pr.reviewDecision === 'string' && pr.reviewDecision ? pr.reviewDecision.toLowerCase().replaceAll('_', ' ') : null, author: clip(pr.author, 60) });
  }
  items.sort((a, b) => String(a.createdAt ?? '9999').localeCompare(String(b.createdAt ?? '9999')) || a.key.localeCompare(b.key));
  return { items, plates: plates.map(p => ({ projectId: p.projectId, projectName: p.projectName ?? p.projectId, state: p.prs?.state === 'read' ? 'read' : (p.state === 'loading' ? 'loading' : 'not read'),
    ...(p.prs?.state === 'read' ? {} : { reason: p.prs?.why ?? p.na ?? 'not read' }) })) };
}

/** A pull request from GitHub's GraphQL (the App) or gh pr list --json (the CLI), in the one shape pendingOf reads. */
export function prOf(raw) {
  return { number: raw?.number, title: raw?.title ?? null, url: raw?.url ?? null, createdAt: raw?.createdAt ?? null, isDraft: raw?.isDraft === true,
    reviewDecision: raw?.reviewDecision ?? null, autoMerge: raw?.autoMergeRequest != null, author: raw?.author?.login ?? null };
}

/** Both lists, the model both forms render (plates home --agents --json, /api/agents). */
export function agentsFor(plates, { now }) {
  const at = typeof now === 'number' ? now : Date.parse(now);
  return { schema: 1, generatedAt: new Date(at).toISOString(), agents: agentsOf(plates, { now: at }), pending: pendingOf(plates, { now: at }) };
}
/** The sidebar's counts: agents at work now, and PRs waiting on review (null when no plate's PRs were read). */
export function agentCounts(model) {
  const working = (model?.agents?.providers ?? []).filter(p => p.state === 'working').length;
  const read = (model?.pending?.plates ?? []).some(p => p.state === 'read');
  return { agents: working, pending: read ? model.pending.items.length : null };
}

const days = n => n === null ? 'age unknown' : n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} old`;
/** Agents and Pending review in a terminal (plates home --agents). */
export function agentsText(model) {
  const out = [`plates home --agents — all plates (${String(model.generatedAt).slice(0, 10)})`, '', 'Agents'];
  for (const p of model.agents.providers) {
    if (!p.holds.length) out.push(`  ${p.id}${p.listed ? '' : ' (not in agents)'}: idle`);
    for (const h of p.holds) out.push(`  ${p.id}${p.listed ? '' : ' (not in agents)'}: working on ${h.projectName} #${h.phase}${h.title ? ` ${h.title}` : ''} · ${h.presence}${h.machine ? ` on ${h.machine}` : ''}`);
  }
  if (!model.agents.providers.length) out.push('  none listed in "agents"');
  out.push('', 'Routes');
  for (const r of model.agents.routes) out.push(r.state === 'on' ? `  ${r.title}: on for ${r.plates.join(', ')}` : `  ${r.title}: off — ${r.off.map(o => `${o.why} (${o.key}${o.plates.length ? `: ${o.plates.join(', ')}` : ''})`).join('; ') || 'no plate read'}`);
  out.push('', `Pending review ${model.pending.items.length}${model.pending.plates.some(p => p.state !== 'read') ? ' (at least)' : ''}`);
  if (!model.pending.items.length) out.push('  none');
  for (const pr of model.pending.items) out.push(`  ${pr.projectName} #${pr.number}  ${pr.title}${pr.draft ? ' · draft' : ''}${pr.review ? ` · ${pr.review}` : ''}  — ${days(pr.ageDays)}`);
  for (const p of [...model.agents.plates.filter(p => p.state !== 'read'), ...model.pending.plates.filter(p => p.state !== 'read')].filter((p, i, a) => a.findIndex(q => q.projectId === p.projectId && q.reason === p.reason) === i))
    out.push(`${p.projectName}: ${p.state} — ${p.reason}`);
  return out.join('\n');
}

/** A plate's agents input from its Home value (config and phases from the same read in both forms), its claims and its PRs as the form read them. */
export function agentsInputOf(project, claims, prs) {
  const base = { projectId: project?.id ?? null, projectName: project?.name ?? project?.id ?? null, repo: project?.repo ?? null };
  const readable = ['complete', 'partial', 'stale'].includes(project?.state);
  if (!readable) return { ...base, state: project?.state === 'loading' ? 'loading' : 'not read', na: project?.gaps?.[0]?.reason ?? 'the plate was not read', prs: prs ?? null };
  const titles = Object.fromEntries((project.roadmap?.phases ?? []).map(p => [p.id, p.title]));
  if (!claims || claims.state === 'unavailable') return { ...base, state: 'not read', na: `its claims could not be read: ${claims?.why ?? 'not read'}`, prs: prs ?? null };
  return { ...base, config: project.recurring?.config ?? {}, claims: claims.state === 'read' ? claims.claims : [], titles, prs: prs ?? { state: 'unavailable', why: 'not read' } };
}
