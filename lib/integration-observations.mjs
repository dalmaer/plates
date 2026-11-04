// The observations lib/integration-delays.mjs reads, gathered from one plate's
// GitHub repository (plates phase 158, increment 2; the contract is
// docs/specs/integration-delays.md).
//
//   waitsSourceOf(config)                 whether a plate's waits are read: the switch
//   readObservations({ repo, api, can, now, source })   bounded REST GETs → observations
//   projectWaits(value, { read, now })    a plate's home value with its `waits`
//
// Both forms read the same REST paths through their own client, so the same
// repository gives the same waits: plates home through `gh api` (lib/home.mjs),
// the hosted home through the GitHub App (lib/web/projects.mjs). `api(path,
// { missing })` returns the parsed JSON, or null for a 404 when `missing` is
// set; `can` says which reads this form is permitted (pulls, checks, activity),
// each with the reason when it is not. A read that is not permitted, fails or
// passes the request bound is a named gap, never an empty list.
//
// Only GETs. Nothing here pushes, deletes, releases or takes a ref, claim or lock.

import { delays } from './integration-delays.mjs';

/** At most this many GitHub requests per plate per read; then the rest is a gap. */
export const WAITS_REQUESTS = 40;
/** At most this many changes not yet on main are read; the newest first. */
export const WAITS_WORK = 12;
/** At most this many commits' check runs are read (PR heads and main's push tips together). */
export const WAITS_CHECKS = 8;
/** At most this many items a plate's waits keep in its home value. */
export const WAITS_SHOWN = 15;
const READY = 'ready/', CLAIM = 'claims/phase-', LOCK = 'claims/integrate';
/** A branch that names a phase: lib/claim.mjs NAMES_PHASE (not imported, to keep the hosted reader's graph small). */
const NAMES_PHASE = /(?:^|[/_-])phase-0*(\d+)(?!\d)/i;
const VERIFY = ['plates-verify', 'keel-verify'];
const SHA = /^[0-9a-f]{40}$/;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, n = 200) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n) : null;
const field = (message, key) => new RegExp(`^${key}: (.+)$`, 'm').exec(message ?? '')?.[1].trim() ?? null;
const enc = s => s.split('/').map(encodeURIComponent).join('/');

/**
 * The switch. A plate's waits are read when it has the delivery practice: ready
 * and integrate, the tested ref and deploy records are that practice's, so a
 * plate without it would show only gaps. No new configuration key.
 * { on, reason, tested, deploys } (deploys: a Vercel target records them).
 */
export function waitsSourceOf(config) {
  const practices = Array.isArray(config?.practices) ? config.practices : [];
  if (!practices.includes('delivery')) return { on: false, reason: 'The delivery practice is off on this plate: ready and integrate, the tested ref and deploy records are its, so its waits are not read.' };
  const d = isObj(config.delivery) ? config.delivery : {};
  const tested = typeof d.tested === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(d.tested) ? d.tested : 'green';
  return { on: true, reason: null, tested, deploys: typeof d.promote === 'string' && d.promote.startsWith('vercel:') };
}

/** One bounded reader: each GET counted; past the bound, or after a refusal, it says why instead. */
function boundedApi(api, limit) {
  let used = 0, stopped = null;
  const get = async (path, opts = {}) => {
    if (stopped) throw Object.assign(new Error(stopped), { bound: true, saving: stopped === 'saving GitHub quota' });
    if (++used > limit) { stopped = `the ${limit}-request bound was reached`; throw Object.assign(new Error(stopped), { bound: true }); }
    try { return await api(path, opts); }
    catch (error) {
      // Saving quota: stop reading; every later read is the same gap. Signed out (401): the caller's to handle.
      if (error?.code === 'quota_saving' || error?.saving) stopped = 'saving GitHub quota';
      throw error;
    }
  };
  return { get, used: () => used };
}
/** Signed out, or saving quota: the whole waits read stops (projectWaits says which); anything else is one source's gap. */
const fatal = e => e?.status === 401 || e?.code === 'quota_saving' || e?.saving === true;
const why = e => str(e?.bound || e?.code === 'not_permitted' ? e.message : e?.code === 'quota_saving' || e?.saving ? 'saving GitHub quota' : e?.status ? `HTTP ${e.status}` : e?.message ?? String(e), 160);

/**
 * The observations for delays(), from one repository. now: ms. source:
 * waitsSourceOf(config). Returns { observations, gaps } — gaps are what the
 * read itself could not cover (a bound, a refusal), beside the reader's own.
 */
export async function readObservations({ repo, api, can = {}, now, source }) {
  const { get } = boundedApi(api, WAITS_REQUESTS);
  const base = `/repos/${enc(repo)}`;
  const gaps = [];
  const sources = {};
  const set = (name, state, reason = null) => { sources[name] = { state, ...(reason ? { why: reason } : {}) }; };
  const obs = { schema: 1, source: { repository: repo, revision: null, readAt: new Date(now).toISOString() }, sources, lock: null, tested: null, work: [] };
  const unread = reason => { for (const s of ['claims', 'branches', 'ready', 'lock', 'prs', 'checks', 'main', 'tested', 'deploys']) sources[s] ??= { state: 'unavailable', why: reason }; return { observations: obs, gaps }; };

  // The refs, in one read: claims, ready marks, the lock, main, the tested ref, the verify branch and the work branches.
  let meta, heads;
  try {
    meta = await get(base);
    heads = await get(`${base}/git/matching-refs/heads/`);
    if (!isObj(meta) || typeof meta.default_branch !== 'string' || !Array.isArray(heads)) throw new Error('GitHub did not return the repository and its branches');
  } catch (e) { if (fatal(e)) throw e; return unread(`the branches could not be read: ${why(e)}`); }
  const main = meta.default_branch;
  const refs = new Map(heads.filter(h => isObj(h) && typeof h.ref === 'string' && SHA.test(h.object?.sha ?? '')).map(h => [h.ref.replace(/^refs\/heads\//, ''), h.object.sha]));
  if (!refs.has(main)) return unread(`${main} is not among the branches read`);
  obs.source.revision = refs.get(main);
  for (const s of ['claims', 'branches', 'ready', 'lock', 'main']) set(s, 'read');

  const commits = new Map();
  const commitOf = async sha => {
    if (!commits.has(sha)) commits.set(sha, get(`${base}/git/commits/${sha}`).then(c => ({ message: typeof c?.message === 'string' ? c.message.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ').slice(0, 4000) : '', at: str(c?.committer?.date, 40) })));
    return commits.get(sha);
  };

  // Repository activity: when each ref was created, pushed and deleted, including refs since deleted. One page.
  let activity = null, windowFrom = null;
  if (can.activity === true) {
    try {
      const list = await get(`${base}/activity?per_page=100`);
      if (!Array.isArray(list)) throw new Error('activity is not a list');
      activity = list.filter(a => isObj(a) && typeof a.ref === 'string' && typeof a.timestamp === 'string' && Number.isFinite(Date.parse(a.timestamp)));
      windowFrom = activity.length ? activity.map(a => a.timestamp).sort()[0] : null;
      if (list.length >= 100) gaps.push({ kind: 'partial', field: 'activity', source: 'activity', why: `one page of repository activity, back to ${windowFrom}: earlier landings and ready marks are not read` });
    } catch (e) { if (fatal(e)) throw e; gaps.push({ kind: 'source', field: 'activity', source: 'activity', why: `repository activity could not be read: ${why(e)}` }); }
  } else gaps.push({ kind: 'source', field: 'activity', source: 'activity', why: can.activityWhy ?? 'repository activity is not read here' });
  obs.source.window = { from: windowFrom, to: obs.source.readAt };
  const pushes = ref => (activity ?? []).filter(a => a.ref === `refs/heads/${ref}`);

  // The integrate lock.
  if (refs.has(LOCK)) {
    try { const c = await commitOf(refs.get(LOCK)); obs.lock = { at: field(c.message, 'At') ?? undefined, provider: field(c.message, 'Provider'), machine: field(c.message, 'Machine') }; }
    catch (e) { if (fatal(e)) throw e; set('lock', 'unavailable', `claims/integrate could not be read: ${why(e)}`); }
  }

  // Open PRs.
  let prs = [];
  if (can.pulls === true) {
    try {
      const list = await get(`${base}/pulls?state=open&per_page=50`);
      if (!Array.isArray(list)) throw new Error('pulls is not a list');
      prs = list.filter(p => isObj(p) && typeof p.head?.ref === 'string');
      set('prs', list.length >= 50 ? 'partial' : 'read', list.length >= 50 ? '50 or more open PRs: one page read' : null);
    } catch (e) { if (fatal(e)) throw e; set('prs', 'unavailable', `the open PRs could not be read: ${why(e)}`); }
  } else set('prs', 'unavailable', can.pullsWhy ?? 'pull requests are not read here');
  let checkReads = 0;
  const checksOf = async sha => {
    if (can.checks !== true) return undefined;
    if (++checkReads > WAITS_CHECKS) { gaps.push({ kind: 'partial', field: `checks ${sha.slice(0, 7)}`, source: 'checks', why: `past the ${WAITS_CHECKS}-commit check-run bound` }); return undefined; }
    const r = await get(`${base}/commits/${sha}/check-runs?per_page=50`);
    if (!Array.isArray(r?.check_runs)) throw new Error('check runs are not a list');
    return r.check_runs.map(c => ({ name: str(c.name, 80) ?? 'check', startedAt: str(c.started_at, 40) ?? undefined, completedAt: c.status === 'completed' ? str(c.completed_at, 40) ?? undefined : null,
      conclusion: c.status === 'completed' ? str(c.conclusion, 40) ?? undefined : null }));
  };
  if (can.checks === true) set('checks', 'read'); else set('checks', 'unavailable', can.checksWhy ?? 'check runs are not read here');
  const safeChecks = async (sha, item, key) => {
    try { const runs = await checksOf(sha); if (runs !== undefined) item[key] = runs; }
    catch (e) { if (fatal(e)) throw e; item[key] = undefined; gaps.push({ kind: 'source', field: key, source: 'checks', why: `check runs for ${sha.slice(0, 7)} could not be read: ${why(e)}` }); }
  };
  const claimOf = async phase => {
    if (phase === null || !refs.has(`${CLAIM}${phase}`)) return null;
    try {
      const c = await commitOf(refs.get(`${CLAIM}${phase}`)), at = field(c.message, 'At');
      return at ? { at, provider: field(c.message, 'Provider'), machine: field(c.message, 'Machine') } : { unreadable: 'the claim commit has no At: line' };
    } catch (e) { if (fatal(e)) throw e; return { unreadable: why(e) }; }
  };
  const phaseOf = name => { const m = name.startsWith('claims/') ? null : NAMES_PHASE.exec(name); return m ? Number(m[1]) : null; };
  const builderOf = (name, claim, ready) => claim?.provider ?? ready?.provider ?? (/^([a-z][a-z0-9-]{0,39})\//.exec(name)?.[1] ?? null);

  // Changes not yet on main: ready marks, open PRs, and branches naming a claimed phase.
  const own = new Set([main, source.tested, ...VERIFY, LOCK]);
  const claimed = new Set([...refs.keys()].filter(r => r.startsWith(CLAIM)).map(r => Number(r.slice(CLAIM.length))));
  const names = new Set();
  for (const r of refs.keys()) if (r.startsWith(READY)) names.add(r.slice(READY.length));
  for (const p of prs) if (refs.has(p.head.ref)) names.add(p.head.ref);
  for (const r of refs.keys()) if (!r.startsWith(READY) && !r.startsWith('claims/') && !own.has(r) && claimed.has(phaseOf(r))) names.add(r);
  const order = [...names].filter(n => !own.has(n) && refs.has(n)).sort((a, b) => (refs.has(READY + b) - refs.has(READY + a)) || a.localeCompare(b));
  if (order.length > WAITS_WORK) gaps.push({ kind: 'partial', field: 'work', source: 'branches', why: `${order.length} changes not on main; the first ${WAITS_WORK} are read` });
  const readWork = async name => {
    const item = { branch: name, phase: phaseOf(name), builder: null };
    try {
      const cmp = await get(`${base}/compare/${enc(main)}...${enc(name)}`, { missing: true });
      if (cmp === null) return null;
      const list = Array.isArray(cmp?.commits) ? cmp.commits : null;
      if (!list) throw new Error('compare has no commits');
      if (cmp.ahead_by === 0 && !refs.has(READY + name)) return null; // nothing of its own off main: not in flight
      item.headAt = str(list.at(-1)?.commit?.committer?.date, 40) ?? undefined;
      item.firstCommitAt = list.length && (cmp.total_commits ?? list.length) <= list.length ? str(list[0]?.commit?.committer?.date, 40) ?? undefined : undefined;
    } catch (e) { if (fatal(e)) throw e; item.headAt = undefined; item.firstCommitAt = undefined; gaps.push({ kind: 'source', field: `${name}`, source: 'branches', why: `${name} could not be compared with ${main}: ${why(e)}` }); }
    item.claim = await claimOf(item.phase);
    let ready = null;
    if (refs.has(READY + name)) {
      try { const c = await commitOf(refs.get(READY + name)); ready = { at: field(c.message, 'At') ?? str(c.at, 40) ?? undefined, status: field(c.message, 'Status') === 'blocked' ? 'blocked' : 'ready', blocked: field(c.message, 'Blocked'), provider: field(c.message, 'Provider') }; }
      catch (e) { if (fatal(e)) throw e; ready = { at: undefined, status: 'ready' }; gaps.push({ kind: 'source', field: `ready/${name}`, source: 'ready', why: `ready/${name} could not be read: ${why(e)}` }); }
    }
    item.ready = ready ? { at: ready.at, status: ready.status, ...(ready.blocked ? { blocked: ready.blocked } : {}) } : null;
    item.builder = builderOf(name, item.claim, ready);
    const pr = prs.find(p => p.head.ref === name);
    item.pr = sources.prs.state === 'unavailable' ? undefined : pr ? { number: pr.number, state: 'open', draft: pr.draft === true, createdAt: str(pr.created_at, 40) ?? undefined } : null;
    if (pr && pr.draft !== true && !ready && SHA.test(pr.head?.sha ?? '')) await safeChecks(pr.head.sha, item, 'checks');
    item.landed = null;
    return item;
  };
  // A few at once, kept in their order: the same items whatever finishes first.
  const picked = order.slice(0, WAITS_WORK), read = new Array(picked.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, picked.length) }, async () => { while (next < picked.length) { const k = next++; read[k] = await readWork(picked[k]); } }));
  obs.work.push(...read.filter(Boolean));

  // Landed and not yet tested: main's first-parent commits the tested ref does not contain.
  const landedTime = (chain, i) => {
    // A commit landed with the first push to main whose tip is it or a later one in the chain.
    if (!activity) return undefined;
    for (let j = i; j < chain.length; j++) { const p = pushes(main).filter(a => a.after === chain[j].sha).map(a => a.timestamp).sort()[0]; if (p) return p; }
    return undefined;
  };
  const changeOf = message => {
    const first = (message ?? '').split('\n')[0];
    return /^integrate: (\S+) \(/.exec(first)?.[1] ?? /^Merge pull request #\d+ from [^/\s]+\/(\S+)/.exec(first)?.[1] ?? null;
  };
  const landedItems = async (chain, tips, deployedSource) => {
    for (const [i, c] of chain.entries()) {
      const name = changeOf(c.commit?.message) ?? `${main}@${c.sha.slice(0, 7)}`;
      if (obs.work.some(w => w.branch === name)) continue;
      const at = landedTime(chain, i);
      const readyAct = (activity ?? []).filter(a => a.ref === `refs/heads/${READY}${name}` && a.activity_type === 'branch_creation' && (!at || a.timestamp <= at)).map(a => a.timestamp).sort().at(-1);
      const item = { branch: name, phase: phaseOf(name), claim: await claimOf(phaseOf(name)), builder: null, firstCommitAt: undefined, headAt: undefined,
        ready: readyAct ? { at: readyAct, status: 'landed' } : null, pr: null, landed: { at, sha: c.sha }, deployed: deployedSource };
      item.builder = builderOf(name, item.claim, null);
      // main's checks for it: the first push tip at or after it whose runs were not superseded (cancelled) by a later push.
      const later = chain.slice(i).map(x => x.sha).filter(x => pushes(main).some(a => a.after === x));
      item.mainChecks = undefined;
      for (const t of later) {
        if (!tips.has(t)) { const got = {}; await safeChecks(t, got, 'runs'); tips.set(t, got); }
        item.mainChecks = tips.get(t).runs;
        if (!Array.isArray(item.mainChecks) || !item.mainChecks.some(r => r.conclusion === 'cancelled')) break;
      }
      obs.work.push(item);
    }
  };
  const firstParentChain = (cmp, from) => {
    const by = new Map((cmp.commits ?? []).filter(c => SHA.test(c?.sha ?? '')).map(c => [c.sha, c]));
    const chain = [];
    for (let sha = from; by.has(sha); sha = by.get(sha).parents?.[0]?.sha) chain.push(by.get(sha));
    return chain.reverse(); // oldest first
  };
  const tips = new Map();
  if (!refs.has(source.tested)) { set('tested', 'unavailable', `the tested ref ${source.tested} does not exist`); }
  else {
    try {
      const cmp = await get(`${base}/compare/${enc(source.tested)}...${enc(main)}`);
      if (!Number.isInteger(cmp?.ahead_by) || !Array.isArray(cmp?.commits)) throw new Error('compare has no count');
      set('tested', 'read');
      const chain = firstParentChain(cmp, refs.get(main));
      obs.tested = { ref: source.tested, behindBy: cmp.ahead_by, ...(chain.length ? { oldestUntestedAt: landedTime(chain, 0) } : {}) };
      await landedItems(chain, tips, source.deploys ? null : undefined);
    } catch (e) { if (fatal(e)) throw e; set('tested', 'unavailable', `${source.tested}...${main} could not be compared: ${why(e)}`); }
  }

  // Deploy records: tested but not yet deployed is a deploy wait.
  if (!source.deploys) set('deploys', 'not-configured', 'no Vercel target records deploys here');
  else {
    const verify = VERIFY.find(v => refs.has(v));
    try {
      if (!verify) throw new Error('there is no verify branch');
      const tree = await get(`${base}/git/trees/${refs.get(verify)}`);
      const entry = Array.isArray(tree?.tree) ? tree.tree.find(t => t?.path === 'deploys.jsonl' && t.type === 'blob') : null;
      if (!entry) { set('deploys', 'read'); }
      else {
        const blob = await get(`${base}/git/blobs/${entry.sha}`);
        if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('deploys.jsonl is not readable');
        const { deployResults } = await import('../practices/night/files/scripts/plates/morning.mjs');
        const records = deployResults(Buffer.from(blob.content, 'base64').toString('utf8'));
        set('deploys', 'read');
        const last = records.find(r => r.ok);
        if (last && refs.has(source.tested) && last.commit !== refs.get(source.tested)) {
          const cmp = await get(`${base}/compare/${last.commit}...${enc(source.tested)}`, { missing: true });
          if (cmp && Array.isArray(cmp.commits)) await landedItems(firstParentChain(cmp, refs.get(source.tested)), tips, null);
        }
      }
    } catch (e) { if (fatal(e)) throw e; set('deploys', 'unavailable', `the deploy records could not be read: ${why(e)}`); }
  }
  // A landed change found before its deploy records were read carries their state now.
  for (const w of obs.work) if (w.landed && w.deployed === null && sources.deploys.state !== 'read') w.deployed = undefined;
  return { observations: obs, gaps };
}

/** delays()'s answer, bounded for a plate's home value: the items, counts, tested, lock, wip, summary, gaps and provenance. */
export function waitsModel(observations, readGaps, { now }) {
  const d = delays(observations, { now });
  const order = { unknown: 0, ci: 1, integration: 2, deploy: 3, review: 4, branch: 5, active: 6, done: 7 };
  const items = d.items.filter(i => i.state !== 'done').sort((a, b) => (b.stale === true) - (a.stale === true) || order[a.state] - order[b.state] || (b.ageMs ?? -1) - (a.ageMs ?? -1) || String(a.branch).localeCompare(String(b.branch)));
  const gaps = [...readGaps, ...d.gaps, ...d.items.flatMap(i => i.gaps.map(g => ({ ...g, branch: i.branch })))];
  return { state: 'read', reason: null, source: { ...d.source, window: observations.source?.window ?? null }, now: d.now, coverage: d.coverage, counts: d.counts,
    items: items.slice(0, WAITS_SHOWN).map(({ waits, gaps: g, ...i }) => ({ ...i, gaps: g.length })), more: Math.max(0, items.length - WAITS_SHOWN),
    lock: d.lock, tested: d.tested, wip: d.wip, summary: d.summary, targets: d.targets,
    gaps: { count: gaps.length, items: gaps.slice(0, 10).map(g => ({ kind: g.kind, source: g.source ?? null, why: str(g.why, 200), ...(g.branch ? { branch: g.branch } : {}) })) } };
}

/**
 * A plate's home value with `waits`: read when its delivery practice is on and
 * this form has a read (`read(repo, source)` → { observations, gaps }), off
 * with the reason otherwise. Its own failures are the waits' gap, never the plate's.
 */
export async function projectWaits(value, { read = null, unavailable = 'Waits are not read here.', now = Date.now } = {}) {
  const out = { ...value };
  if (out.state === 'unavailable' || !out.waitsSource) return out;
  if (!out.waitsSource.on) { out.waits = { state: 'off', reason: out.waitsSource.reason }; return out; }
  if (!read) { out.waits = { state: 'unavailable', reason: unavailable }; return out; }
  try {
    const { observations, gaps } = await read(out.repo, out.waitsSource);
    out.waits = waitsModel(observations, gaps, { now: now() });
  } catch (error) {
    if (error?.status === 401) throw error;
    out.waits = { state: 'unavailable', reason: error?.saving || error?.code === 'quota_saving' ? 'Saving GitHub quota; waits are not read.' : `Waits could not be read: ${why(error)}` };
  }
  return out;
}
