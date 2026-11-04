// Where each change is waiting, from recorded observations (plates phase 158,
// increment 1; the contract is docs/specs/integration-delays.md).
//
//   delays(observations, { now, targets })   pure: no git, no gh, no clock
//
// The observations are what the existing sources already record, gathered by a
// caller: phase claims (claims/phase-<n>, lib/claim.mjs), branch commit times,
// ready refs (ready/<branch>, lib/integrate.mjs), the integrate lock
// (claims/integrate), PRs and their reviews, check runs (the PR head's and the
// landing commit's on main), the tested ref (delivery's "tested", default green)
// and deploy records (deploys.jsonl on the verify branch). Nothing here reads
// them; increment 2 adds the read, behind an opt-in.
//
// The rule the whole module keeps: a wait whose start or end cannot be read is
// unknown, never 0. A source that was not read, a timestamp that is missing or
// unparseable, a time in the future beyond the skew allowance, a claim that
// cannot be read, an end before its start, and history the sources no longer
// keep (a ready ref is deleted when its change lands) each produce a named gap.
// Each gap leaves the wait unknown (ms null), and where the state itself
// depends on it, the state is 'unknown' with the read that would settle it.
//
// The thresholds are advisory (the philosophy's "hours and same-day
// integration"): `stale` marks an observation for the owner; nothing here
// deletes, releases, retries or integrates anything.

export const SCHEMA = 1;
export const STATES = Object.freeze(['active', 'branch', 'review', 'ci', 'integration', 'deploy', 'done', 'unknown']);
export const SOURCES = Object.freeze(['claims', 'branches', 'ready', 'lock', 'prs', 'checks', 'main', 'tested', 'deploys']);
const MINUTE = 60_000, HOUR = 60 * MINUTE;
/** A head commit this recent is active work; older, the branch is waiting on its builder. */
export const ACTIVE_MS = 2 * HOUR;
/** A timestamp this far past `now` is the clock's, not the event's: skew, unknown. */
export const SKEW_MS = 5 * MINUTE;
/** Advisory targets, by state: an age past one marks the item stale. A guess until increment 3's baseline. */
export const TARGETS = Object.freeze({ active: 24 * HOUR, branch: 24 * HOUR, review: 24 * HOUR, ci: HOUR, integration: HOUR, deploy: HOUR, lock: HOUR });
/** The measured waits: each from its start event to its end event (the contract's table). */
export const WAITS = Object.freeze([
  { wait: 'to-ready', start: 'work started', end: 'marked ready' },
  { wait: 'pr-ci', start: 'first PR check started', end: 'last PR check completed' },
  { wait: 'review', start: 'PR ready for review', end: 'PR merged or closed' },
  { wait: 'integration', start: 'marked ready', end: 'landed on main' },
  { wait: 'main-ci', start: 'landed on main', end: 'main checks completed' },
  { wait: 'deploy', start: 'main checks passed', end: 'deployed' },
  { wait: 'time-to-main', start: 'work started', end: 'landed on main' },
]);

export class DelaysError extends Error {}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const iso = ms => new Date(ms).toISOString();
const median = xs => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length ? s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 : null; };

/** A source's coverage: read, partial, not-configured, or unavailable (also when it was never named). */
function coverageOf(sources) {
  const out = {};
  for (const name of SOURCES) {
    const s = isObj(sources) ? sources[name] : undefined;
    const state = isObj(s) && ['read', 'partial', 'not-configured', 'unavailable'].includes(s.state) ? s.state : 'unavailable';
    out[name] = { state, why: isObj(s) && typeof s.why === 'string' ? s.why.slice(0, 300) : state === 'unavailable' ? (s === undefined ? 'not read' : 'unrecognised coverage') : null };
  }
  return out;
}

/**
 * One event: { at } (it happened, at ms), { none: true } (the source was read
 * and it has not happened), or { unknown, kind } (it cannot be said). `value`
 * undefined: not observed; null: observed absent; else an ISO timestamp.
 */
function eventOf(value, source, cov, now, field, gaps) {
  const c = cov[source];
  const unknown = (kind, why) => { gaps.push({ kind, field, source, why }); return { unknown: why, kind }; };
  if (c.state === 'unavailable') return unknown('source', `${source} not read: ${c.why}`);
  if (c.state === 'not-configured') return { none: true, notConfigured: true };
  if (value === null) return c.state === 'partial' ? unknown('partial', `${source} is partial (${c.why ?? 'incomplete'}): absent is not observed`) : { none: true };
  if (value === undefined) return unknown('missing', `${field} was not observed`);
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) return unknown('unreadable', `${field} is not a timestamp (${JSON.stringify(value).slice(0, 60)})`);
  if (ms > now + SKEW_MS) return unknown('skew', `${field} is ${Math.round((ms - now) / MINUTE)} min after now: clock skew`);
  return { at: Math.min(ms, now) };
}

/** Check runs, summarised: pending, failed, passed, none, or unknown; with first start and last completion. */
function checksOf(runs, cov, now, field, gaps) {
  const c = cov.checks;
  if (c.state === 'unavailable') { gaps.push({ kind: 'source', field, source: 'checks', why: `checks not read: ${c.why}` }); return { state: 'unknown' }; }
  if (c.state === 'not-configured') return { state: 'none' };
  if (runs === undefined) { gaps.push({ kind: 'missing', field, source: 'checks', why: `${field} was not observed` }); return { state: 'unknown' }; }
  if (runs === null || (Array.isArray(runs) && !runs.length)) {
    if (c.state === 'partial') { gaps.push({ kind: 'partial', field, source: 'checks', why: 'checks are partial: no runs is not observed' }); return { state: 'unknown' }; }
    return { state: 'none' };
  }
  if (!Array.isArray(runs)) { gaps.push({ kind: 'unreadable', field, source: 'checks', why: `${field} is not a list of runs` }); return { state: 'unknown' }; }
  const starts = [], ends = [];
  let pending = false, failed = [], unknown = false;
  for (const [i, r] of runs.entries()) {
    const name = isObj(r) && typeof r.name === 'string' ? r.name.slice(0, 80) : `#${i + 1}`;
    if (!isObj(r)) { unknown = true; gaps.push({ kind: 'unreadable', field, source: 'checks', why: `${field} run ${name} is not a run` }); continue; }
    const s = eventOf(r.startedAt, 'checks', cov, now, `${field}.${name}.startedAt`, gaps);
    if (s.at !== undefined) starts.push(s.at); else if (s.unknown) unknown = true;
    if (r.completedAt === null) { pending = true; continue; }
    const e = eventOf(r.completedAt, 'checks', cov, now, `${field}.${name}.completedAt`, gaps);
    if (e.at !== undefined) ends.push(e.at); else unknown = true;
    if (typeof r.conclusion !== 'string') { unknown = true; gaps.push({ kind: 'unreadable', field: `${field}.${name}.conclusion`, source: 'checks', why: `${field} run ${name} completed with no conclusion` }); }
    else if (!['success', 'skipped', 'neutral'].includes(r.conclusion)) failed.push(name);
  }
  const first = starts.length ? Math.min(...starts) : null, last = ends.length ? Math.max(...ends) : null;
  if (failed.length) return { state: 'failed', failed, first, last: pending ? null : last, unknown };
  if (pending) return { state: 'pending', first, last: null, unknown };
  return { state: unknown ? 'unknown' : 'passed', first, last, unknown };
}

/** A wait from two events: measured (ms), open (ongoing, ms so far), not applicable, or unknown. */
function waitOf(wait, start, end, now, gaps) {
  if (start.none) return null;
  if (start.at === undefined) return { wait, start: null, end: null, ms: null, open: false, unknown: start.unknown ?? 'start unknown' };
  if (end.none) return { wait, start: iso(start.at), end: null, ms: now - start.at, open: true };
  if (end.at === undefined) return { wait, start: iso(start.at), end: null, ms: null, open: false, unknown: end.unknown ?? 'end unknown' };
  if (end.at < start.at) {
    const why = `${wait} ends (${iso(end.at)}) before it starts (${iso(start.at)})`;
    gaps.push({ kind: 'conflict', field: wait, source: null, why });
    return { wait, start: iso(start.at), end: iso(end.at), ms: null, open: false, unknown: why };
  }
  return { wait, start: iso(start.at), end: iso(end.at), ms: end.at - start.at, open: false };
}

const ago = ms => ms < HOUR ? `${Math.round(ms / MINUTE)} min` : ms < 48 * HOUR ? `${Math.round(ms / HOUR * 10) / 10} h` : `${Math.round(ms / (24 * HOUR))} days`;

/** One change: its state, since when, its waits, the next action, and its gaps. */
function itemOf(raw, cov, ctx) {
  const { now, targets, lock, conflicted } = ctx;
  const gaps = [];
  if (!isObj(raw) || typeof raw.branch !== 'string' || !raw.branch) {
    return { branch: null, phase: null, builder: null, state: 'unknown', since: null, ageMs: null, stale: null, next: 'read the observation again: it names no branch', waits: [], gaps: [{ kind: 'unreadable', field: 'branch', source: null, why: 'an observation with no branch' }] };
  }
  const { branch } = raw;
  const ev = (value, source, field) => eventOf(value, source, cov, now, field, gaps);
  // Work started: the earliest of the claim and the branch's first commit. Either unknown makes it unknown.
  let claimAt;
  if (raw.claim === undefined || raw.claim === null) claimAt = ev(raw.claim, 'claims', 'claim.at');
  else if (!isObj(raw.claim) || typeof raw.claim.unreadable === 'string') {
    const why = `the claim could not be read${isObj(raw.claim) ? `: ${raw.claim.unreadable.slice(0, 200)}` : ''}`;
    gaps.push({ kind: 'unreadable', field: 'claim', source: 'claims', why });
    claimAt = { unknown: why, kind: 'unreadable' };
  } else claimAt = ev(raw.claim.at, 'claims', 'claim.at');
  const firstAt = ev(raw.firstCommitAt, 'branches', 'firstCommitAt');
  const headAt = ev(raw.headAt, 'branches', 'headAt');
  const parts = [claimAt, firstAt].filter(e => !e.none);
  const workStart = !parts.length ? { none: true } : parts.some(e => e.at === undefined)
    ? { unknown: parts.find(e => e.at === undefined).unknown } : { at: Math.min(...parts.map(e => e.at)) };

  const landed = isObj(raw.landed) ? ev(raw.landed.at, 'main', 'landed.at') : ev(raw.landed, 'main', 'landed');
  // A ready ref is deleted when its change lands: for a landed change, "no ready ref" is lost history, not "never ready".
  let ready;
  if (raw.ready === null && landed.at !== undefined && cov.ready.state === 'read') {
    const why = 'the ready ref is deleted when its change lands: when it was marked ready is no longer recorded';
    gaps.push({ kind: 'history', field: 'ready.at', source: 'ready', why });
    ready = { unknown: why, kind: 'history' };
  } else ready = isObj(raw.ready) ? ev(raw.ready.at, 'ready', 'ready.at') : ev(raw.ready, 'ready', 'ready');
  // status: 'ready' or 'blocked' (the ref as it stands), or 'landed' (its history, recovered from repository activity).
  const readyStatus = isObj(raw.ready) ? raw.ready.status : null;
  if (ready.at !== undefined && landed.at !== undefined && readyStatus === 'ready') {
    gaps.push({ kind: 'conflict', field: 'ready', source: 'ready', why: `${branch} is both marked ready and landed on main: read ready/${branch} and main again` });
  }

  const pr = isObj(raw.pr) ? raw.pr : null;
  const prSeen = pr ? { seen: true } : ev(raw.pr, 'prs', 'pr');
  const prOpen = pr && (pr.state ?? 'open') === 'open';
  const prReadyAt = pr ? (pr.draft ? { none: true } : ev(pr.readyAt ?? pr.createdAt, 'prs', 'pr.readyAt')) : { none: true };
  const prEnd = pr ? (prOpen ? { none: true } : ev(pr.mergedAt ?? pr.closedAt, 'prs', 'pr.mergedAt')) : { none: true };
  const prChecks = pr ? checksOf(raw.checks, cov, now, 'checks', gaps) : { state: 'none' };
  const mainChecks = landed.at !== undefined ? checksOf(raw.mainChecks, cov, now, 'mainChecks', gaps) : { state: 'none' };
  const deployed = landed.at === undefined ? { none: true } : isObj(raw.deployed) ? ev(raw.deployed.at, 'deploys', 'deployed.at') : ev(raw.deployed, 'deploys', 'deployed');

  const mainCiPassed = mainChecks.state === 'passed' && mainChecks.last !== null ? { at: mainChecks.last } : mainChecks.state === 'unknown' ? { unknown: 'main checks unknown' } : { none: true };
  const mainCiEnd = mainChecks.state === 'passed' ? (mainChecks.last !== null ? { at: mainChecks.last } : { unknown: 'main checks have no completion time' })
    : mainChecks.state === 'failed' ? (mainChecks.last !== null ? { at: mainChecks.last } : { none: true })
      : mainChecks.state === 'unknown' ? { unknown: 'main checks unknown' } : { none: true };
  const prCiStart = prChecks.first !== null && prChecks.first !== undefined ? { at: prChecks.first } : prChecks.state === 'unknown' ? { unknown: 'PR checks unknown' } : { none: true };
  const prCiEnd = prChecks.state === 'pending' ? { none: true } : prChecks.last !== null && prChecks.last !== undefined ? { at: prChecks.last } : { unknown: 'PR checks unknown' };

  // Integration waits from a mark that is still ready; a change sent back is its branch's again.
  const isReady = readyStatus === 'blocked' && ready.at !== undefined ? { none: true } : ready;
  const waits = [
    waitOf('to-ready', workStart, ready, now, gaps),
    pr ? waitOf('pr-ci', prCiStart, prCiEnd, now, gaps) : null,
    pr ? waitOf('review', prReadyAt, prEnd, now, gaps) : null,
    waitOf('integration', isReady, landed, now, gaps),
    landed.at !== undefined ? waitOf('main-ci', landed, mainCiEnd, now, gaps) : null,
    landed.at !== undefined && !deployed.notConfigured ? waitOf('deploy', mainCiPassed, deployed, now, gaps) : null,
    waitOf('time-to-main', workStart, landed, now, gaps),
  ].filter(Boolean);
  if (conflicted.has(branch)) gaps.push({ kind: 'conflict', field: 'branch', source: null, why: `${branch} has more than one observation, and they disagree` });

  // The state: where the change is now. Whatever it depends on that is unknown makes it unknown.
  const conflict = conflicted.has(branch) || gaps.some(g => g.kind === 'conflict' && g.field === 'ready');
  let state, since = null, next;
  const unknownOf = (e, read) => { state = 'unknown'; next = `read ${read}: ${e.unknown ?? 'unknown'}`; };
  if (conflict) { state = 'unknown'; next = `the observations of ${branch} disagree: read them again before acting`; }
  else if (landed.unknown) unknownOf(landed, `whether ${branch} is on main`);
  else if (landed.at !== undefined) {
    const sha = isObj(raw.landed) && typeof raw.landed.sha === 'string' ? raw.landed.sha.slice(0, 7) : 'its landing commit';
    if (mainChecks.state === 'unknown') unknownOf({ unknown: 'main checks unknown' }, `main's check runs for ${sha}`);
    else if (mainChecks.state === 'pending' || mainChecks.state === 'none') { state = 'ci'; since = landed.at; next = `wait for main's checks on ${sha}`; }
    else if (mainChecks.state === 'failed') { state = 'ci'; since = mainChecks.last ?? landed.at; next = `main is red at ${sha} (${mainChecks.failed.join(', ')}): restore it with a verified small fix or a compatible revert before integrating more`; }
    else if (deployed.notConfigured || deployed.at !== undefined) { state = 'done'; since = deployed.at ?? mainChecks.last; next = 'nothing: landed and checked' + (deployed.at !== undefined ? ', and deployed' : ''); }
    else if (deployed.unknown) unknownOf(deployed, 'the deploy records');
    else { state = 'deploy'; since = mainChecks.last; next = `${sha} passed main's checks and is not deployed: the tested ref and plates promote (the owner's, or the owner's grant) are next`; }
  } else if (ready.unknown && !ready.none) unknownOf(ready, `ready/${branch}`);
  else if (ready.at !== undefined && readyStatus === 'blocked') {
    state = 'branch'; since = ready.at;
    const why = isObj(raw.ready) && typeof raw.ready.blocked === 'string' ? raw.ready.blocked.slice(0, 200) : 'its recorded reason';
    next = `sent back by plates integrate (${why}): fix it on ${branch}, then plates ready again`;
  } else if (ready.at !== undefined) {
    state = 'integration'; since = ready.at;
    if (lock.held && lock.at !== undefined) {
      const held = now - lock.at;
      next = held > targets.lock
        ? `claims/integrate has been held by ${lock.by} for ${ago(held)}: if that run died, the lock is the owner's to delete (git push <remote> --delete claims/integrate); never take a live one`
        : `wait: ${lock.by} holds claims/integrate and takes every ready change`;
    } else if (lock.unknown) next = `read claims/integrate (${lock.unknown}), then plates integrate if it is free`;
    else next = 'run plates integrate: the change is ready and no integrator holds the lock';
  } else if (prSeen.unknown) unknownOf(prSeen, `the open PRs for ${branch}`);
  else if (pr && prOpen && !pr.draft) {
    const n = Number.isInteger(pr.number) ? `PR #${pr.number}` : 'its PR';
    if (prChecks.state === 'unknown') unknownOf({ unknown: 'PR checks unknown' }, `${n}'s check runs`);
    else if (prChecks.state === 'pending') { state = 'ci'; since = prChecks.first ?? prReadyAt.at ?? null; next = `wait for ${n}'s checks`; }
    else if (prChecks.state === 'failed') { state = 'branch'; since = prChecks.last ?? prReadyAt.at ?? null; next = `fix ${prChecks.failed.join(', ')} on ${branch} (${n})`; }
    else if (prReadyAt.unknown) unknownOf(prReadyAt, `${n}`);
    else { state = 'review'; since = prReadyAt.at; next = `${n} waits on review: answer every review, then merge or plates ready`; }
  } else if (headAt.unknown) unknownOf(headAt, `${branch}'s head commit`);
  else if (headAt.at !== undefined && now - headAt.at <= ACTIVE_MS) {
    state = 'active'; since = workStart.at ?? null;
    next = 'keep going; plates ready when the increment\'s fast checks pass';
  } else if (headAt.at !== undefined) {
    state = 'branch'; since = headAt.at;
    next = `no push for ${ago(now - headAt.at)}: plates ready ${branch} if it is done, or push the next commit`;
  } else unknownOf({ unknown: 'no head commit observed' }, `${branch}'s commits`);

  const ageMs = since === null || since === undefined ? null : now - since;
  // Branch age (since work started) is the same-day guidance; every other state is aged from when it began.
  const branchAge = workStart.at !== undefined ? now - workStart.at : null;
  const target = targets[state];
  let stale = null;
  if (state === 'active' || state === 'branch') stale = branchAge === null ? null : branchAge > targets.branch;
  else if (target !== undefined && ageMs !== null) stale = ageMs > target;
  else if (state === 'done') stale = false;
  if (stale && (state === 'active' || state === 'branch')) next += `. The branch is ${ago(branchAge)} old, past same-day integration: split it, refresh it onto main, or replan it`;
  const builder = typeof raw.builder === 'string' && raw.builder ? raw.builder.slice(0, 80) : isObj(raw.claim) && typeof raw.claim.provider === 'string' ? raw.claim.provider.slice(0, 80) : null;
  return { branch, phase: Number.isInteger(raw.phase) ? raw.phase : null, builder, state, since: since === null || since === undefined ? null : iso(since),
    ageMs, branchAgeMs: branchAge, stale, next, waits, gaps };
}

/**
 * Where every observed change is waiting. Pure: `now` is the clock (required),
 * `targets` overrides the advisory TARGETS. Throws DelaysError on input that
 * is not an observation set at all; everything short of that is a gap.
 */
export function delays(observations, { now, targets: given = {} } = {}) {
  if (!isObj(observations)) throw new DelaysError('observations must be an object');
  if (observations.schema !== SCHEMA) throw new DelaysError(`observations schema must be ${SCHEMA}`);
  if (!Number.isFinite(now)) throw new DelaysError('now must be a time in ms');
  const targets = { ...TARGETS, ...Object.fromEntries(Object.entries(isObj(given) ? given : {}).filter(([, v]) => Number.isFinite(v) && v >= 0)) };
  const cov = coverageOf(observations.sources);
  const gaps = [];
  // The integrate lock, once for every ready change.
  let lock;
  {
    const raw = observations.lock;
    const e = eventOf(isObj(raw) ? raw.at : raw, 'lock', cov, now, 'lock.at', gaps);
    lock = e.none ? { held: false } : e.at !== undefined ? { held: true, at: e.at, by: `${isObj(raw) && raw.provider ? raw.provider : 'unknown'} on ${isObj(raw) && raw.machine ? raw.machine : 'unknown'}` } : { held: null, unknown: e.unknown };
  }
  const list = Array.isArray(observations.work) ? observations.work : [];
  if (!Array.isArray(observations.work)) gaps.push({ kind: 'missing', field: 'work', source: null, why: 'no list of work was observed' });
  // Two observations of one branch that disagree are a conflict: neither is believed.
  const byBranch = new Map(), conflicted = new Set();
  for (const w of list) {
    if (!isObj(w) || typeof w.branch !== 'string') continue;
    const key = JSON.stringify(w);
    if (byBranch.has(w.branch) && byBranch.get(w.branch) !== key) conflicted.add(w.branch);
    byBranch.set(w.branch, byBranch.get(w.branch) ?? key);
  }
  const seen = new Set();
  const items = list.filter(w => { if (!isObj(w) || typeof w.branch !== 'string') return true; if (seen.has(w.branch)) return false; seen.add(w.branch); return true; })
    .map(w => itemOf(w, cov, { now, targets, lock, conflicted }));

  // Work in progress: one active increment per builder. A builder no source names is a gap, not a pass.
  const builders = new Map();
  for (const i of items.filter(i => i.state === 'active' || i.state === 'branch')) {
    const k = i.builder ?? null;
    builders.set(k, [...(builders.get(k) ?? []), i.branch]);
  }
  const wip = [...builders].map(([builder, branches]) => ({ builder, open: branches.length, branches,
    over: builder === null ? null : branches.length > 1,
    next: builder === null ? 'name each branch\'s builder (its claim or ready ref) to count work in progress'
      : branches.length > 1 ? `${builder} has ${branches.length} increments open: finish review and integration of ready work before opening more` : null }));

  // The tested ref against main: how far, and since when, tested trails integrated.
  const t = observations.tested;
  let tested;
  if (cov.tested.state === 'not-configured') tested = { state: 'not-configured', behindBy: null, lagMs: null, since: null };
  else if (cov.tested.state !== 'read' || !isObj(t)) {
    const why = cov.tested.state !== 'read' ? `tested not read: ${cov.tested.why}` : 'the tested ref was not observed';
    gaps.push({ kind: cov.tested.state !== 'read' ? 'source' : 'missing', field: 'tested', source: 'tested', why });
    tested = { state: 'unknown', behindBy: null, lagMs: null, since: null, unknown: why };
  } else if (t.behindBy === 0) tested = { state: 'current', ref: t.ref ?? null, behindBy: 0, lagMs: 0, since: null };
  else if (Number.isInteger(t.behindBy) && t.behindBy > 0) {
    const e = eventOf(t.oldestUntestedAt, 'tested', cov, now, 'tested.oldestUntestedAt', gaps);
    tested = { state: 'behind', ref: t.ref ?? null, behindBy: t.behindBy, lagMs: e.at !== undefined ? now - e.at : null, since: e.at !== undefined ? iso(e.at) : null,
      ...(e.at === undefined ? { unknown: e.unknown ?? 'when tested fell behind is not recorded' } : {}) };
  } else {
    const why = `tested.behindBy is not a count (${JSON.stringify(t.behindBy)})`;
    gaps.push({ kind: 'unreadable', field: 'tested.behindBy', source: 'tested', why });
    tested = { state: 'unknown', behindBy: null, lagMs: null, since: null, unknown: why };
  }

  // Each wait across changes: the denominator is the measured ones; open and unknown are counted, never averaged in.
  const summary = Object.fromEntries(WAITS.map(({ wait }) => {
    const ws = items.flatMap(i => i.waits.filter(w => w.wait === wait));
    const measured = ws.filter(w => !w.open && w.ms !== null).map(w => w.ms);
    return [wait, { measured: measured.length, open: ws.filter(w => w.open).length, unknown: ws.filter(w => w.ms === null).length, medianMs: median(measured) }];
  }));
  const counts = Object.fromEntries(STATES.map(s => [s, items.filter(i => i.state === s).length]));
  const source = isObj(observations.source) ? {
    repository: typeof observations.source.repository === 'string' ? observations.source.repository : null,
    revision: typeof observations.source.revision === 'string' ? observations.source.revision : null,
    readAt: typeof observations.source.readAt === 'string' ? observations.source.readAt : null,
  } : { repository: null, revision: null, readAt: null };
  if (!source.readAt) gaps.push({ kind: 'missing', field: 'source.readAt', source: null, why: 'when the observations were read is not recorded' });
  return { schema: SCHEMA, now: iso(now), source, coverage: cov, targets, lock: { held: lock.held, at: lock.at !== undefined ? iso(lock.at) : null, by: lock.by ?? null }, counts, items, wip, tested, summary, gaps };
}
