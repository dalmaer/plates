// A dated, read-only baseline of integration waits, work in progress and change
// failure for one repository (plates phase 158, increment 3; the contract is
// docs/specs/integration-delays.md, and the first report is
// docs/research/2026-11-04-integration-delays-baseline.md).
//
//   node scripts/integration-baseline.mjs --repo <owner/name> [--phases <dir>] [--json]
//
// Reads only: gh GETs (repository activity, Actions runs of the gate and publish
// workflows, closed PRs, the verify branch's deploys.jsonl) and the phase files
// on disk (Trajectory lines that start "Escape:"). The current snapshot of
// changes in flight is lib/integration-observations.mjs's. Nothing is written
// to GitHub. `baseline(raw, { now })` is pure: the numbers follow from the raw
// reads, which --json prints beside them so the report can be re-derived.
//
// Every measure says its start and end events and its denominator: `n` are the
// measured intervals; `open` started and has not ended; `unpaired` could not
// be matched and are excluded, never counted as 0.
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN = 60_000;
/** A ready ref deleted this soon after a push to main was landed by that push (integrate deletes it right after). */
export const LANDING_SLACK_MS = 2 * MIN;

const t = s => Date.parse(s);
const sorted = xs => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => { const s = sorted(xs); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
/** A distribution in ms: its denominator and quantiles; null quantiles when nothing was measured. */
export const stats = (ms, extra = {}) => ({ n: ms.length, medianMs: pct(ms, 0.5), p90Ms: pct(ms, 0.9), maxMs: ms.length ? Math.max(...ms) : null, ...extra });

/** The Monday (UTC) of a time's week. */
const weekOf = ms => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
/** A measure by week: [{ week, n, medianMs }] from [{ at (ms), ms }]. */
export const weekly = items => Object.entries(items.reduce((m, x) => { (m[weekOf(x.at)] ??= []).push(x.ms); return m; }, {})).sort().map(([week, ms]) => ({ week, n: ms.length, medianMs: pct(ms, 0.5) }));
/** stats() of [{ at, ms }], with its weeks and its last seven days. */
const series = (items, now, extra = {}) => ({ ...stats(items.map(x => x.ms), extra), last7: stats(items.filter(x => x.at > now - 7 * 86_400_000).map(x => x.ms)), weeks: weekly(items) });

/** Activity on one ref, oldest first. */
const on = (activity, ref) => activity.filter(a => a.ref === `refs/heads/${ref}`).sort((a, b) => t(a.timestamp) - t(b.timestamp));

/**
 * Intervals of a ref that is created and deleted (ready marks, the lock, claims):
 * [{ ref, start (its last creation or push before the deletion), first (its creation), end, endSha }], and those still open.
 */
export function intervals(activity, prefix) {
  const refs = [...new Set(activity.filter(a => a.ref.startsWith(`refs/heads/${prefix}`)).map(a => a.ref.slice('refs/heads/'.length)))];
  const closed = [], open = [];
  for (const ref of refs) {
    let cur = null;
    for (const a of on(activity, ref)) {
      if (a.activity_type === 'branch_creation') cur = { ref, first: a.timestamp, start: a.timestamp };
      else if (a.activity_type === 'branch_deletion') { if (cur) closed.push({ ...cur, end: a.timestamp, endSha: a.before }); else closed.push({ ref, first: null, start: null, end: a.timestamp, endSha: a.before }); cur = null; }
      else if (cur) cur.start = a.timestamp; // a re-mark (push or force push) restarts the wait
      else cur = { ref, first: null, start: a.timestamp };
    }
    if (cur) open.push(cur);
  }
  return { closed, open };
}

/** Peak and time-weighted mean of how many intervals were open at once within [from, to]. */
export function concurrency(spans, from, to) {
  const ev = [];
  for (const s of spans) { const a = Math.max(t(s.first ?? s.start ?? from), from), b = Math.min(s.end ? t(s.end) : to, to); if (b > a) ev.push([a, 1], [b, -1]); }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0, peak = 0, area = 0, last = from;
  for (const [at, d] of ev) { area += cur * (at - last); last = at; cur += d; peak = Math.max(peak, cur); }
  area += cur * (to - last);
  return { peak, mean: to > from ? Math.round((area / (to - from)) * 100) / 100 : null };
}

/**
 * The baseline from raw reads. raw: { repo, activity, mainRuns (the gate workflow on main pushes), prRuns (the gate
 * on pull_request), publishRuns, pulls (closed), deploys (records, or null when unread), escapes ([{ phase, date, text }]),
 * snapshot (waitsModel of now, or null), gaps }. now: ms.
 */
export function baseline(raw, { now }) {
  const gaps = [...(raw.gaps ?? [])];
  const activity = (raw.activity ?? []).filter(a => a && typeof a.ref === 'string' && Number.isFinite(t(a.timestamp)));
  const from = activity.length ? Math.min(...activity.map(a => t(a.timestamp))) : null;
  const window = { from: from === null ? null : new Date(from).toISOString(), to: new Date(now).toISOString() };
  const inWindow = s => from !== null && t(s) >= from && t(s) <= now;
  const mainPushes = on(activity, 'main').filter(a => ['push', 'force_push', 'pr_merge'].includes(a.activity_type));
  const pushOf = sha => mainPushes.find(a => a.after === sha) ?? null;

  // Integration: a ready mark (its last mark) → the push to main that landed it (the ready ref is deleted just after).
  const ready = intervals(activity, 'ready/');
  const landings = [], unlanded = [];
  for (const r of ready.closed) {
    const push = [...mainPushes].reverse().find(p => t(p.timestamp) <= t(r.end) && t(r.end) - t(p.timestamp) <= LANDING_SLACK_MS);
    if (push && r.start) landings.push({ branch: r.ref.slice('ready/'.length), ready: r.start, firstReady: r.first, landed: push.timestamp, sha: push.after });
    else unlanded.push(r);
  }
  const integration = series(landings.map(l => ({ at: t(l.landed), ms: t(l.landed) - t(l.ready) })), now, { open: ready.open.length, unpaired: unlanded.length,
    start: 'last ready mark (ready/<branch> created or re-pushed)', end: 'the push to main just before ready/<branch> was deleted' });

  // To ready and time to main, per increment: from the work branch's first push after its previous landing (or its creation).
  const toReady = [], toMain = [];
  for (const l of landings) {
    const prev = landings.filter(x => x.branch === l.branch && t(x.landed) < t(l.firstReady ?? l.ready)).map(x => t(x.landed)).sort((a, b) => b - a)[0] ?? -Infinity;
    const work = on(activity, l.branch).find(a => ['branch_creation', 'push', 'force_push'].includes(a.activity_type) && t(a.timestamp) > prev && t(a.timestamp) <= t(l.firstReady ?? l.ready));
    if (!work) continue;
    toReady.push(t(l.firstReady ?? l.ready) - t(work.timestamp));
    toMain.push(t(l.landed) - t(work.timestamp));
  }
  const unstarted = landings.length - toReady.length;
  // A floor: plates ready pushes the branch as it marks it, so the remote rarely sees work before the mark.
  const toReadyStats = stats(toReady, { unpaired: unstarted, floor: true, start: 'first push to the work branch after its previous landing (or its creation)', end: 'first ready mark of that increment' });
  const toMainStats = stats(toMain, { unpaired: unstarted, floor: true, start: 'as to-ready', end: 'the push to main that landed it' });
  // The first increment of a claimed phase: claims/phase-<n> created → the first ready mark, and the first landing, of a branch naming phase n.
  const phaseOf = name => Number(/(?:^|[/_-])phase-0*(\d+)(?!\d)/i.exec(name)?.[1] ?? NaN);
  const claimSpans = intervals(activity, 'claims/phase-');
  const claimReady = [], claimMain = [];
  let claimNone = 0;
  for (const c of [...claimSpans.closed, ...claimSpans.open].filter(c => c.first)) {
    const n = Number(c.ref.slice('claims/phase-'.length));
    const first = landings.filter(l => phaseOf(l.branch) === n && t(l.firstReady ?? l.ready) >= t(c.first)).sort((a, b) => t(a.landed) - t(b.landed))[0];
    if (!first) { claimNone++; continue; }
    claimReady.push(t(first.firstReady ?? first.ready) - t(c.first)); claimMain.push(t(first.landed) - t(c.first));
  }
  const claimToReady = stats(claimReady, { unpaired: claimNone, start: 'claims/phase-<n> created', end: 'first ready mark of a branch naming phase <n>' });
  const claimToMain = stats(claimMain, { unpaired: claimNone, start: 'claims/phase-<n> created', end: 'first landing of a branch naming phase <n>' });

  // The integrate lock.
  const lock = intervals(activity, 'claims/integrate');
  const lockStats = series(lock.closed.filter(x => x.first).map(x => ({ at: t(x.end), ms: t(x.end) - t(x.first) })), now, { open: lock.open.length, start: 'claims/integrate created', end: 'claims/integrate deleted' });

  // The integrator: runs (lock holds), pushes that landed changes, and ready marks pushed again (a re-mark, or the
  // integrator's sent-back rewrite: activity does not say which).
  const integrator = { lockRuns: lock.closed.length + lock.open.length, landingPushes: new Set(landings.map(l => l.sha)).size, changesLanded: landings.length,
    readyRepushes: activity.filter(a => a.ref.startsWith('refs/heads/ready/') && ['push', 'force_push'].includes(a.activity_type)).length,
    runsWithoutLanding: Math.max(0, lock.closed.length - new Set(landings.map(l => l.sha)).size) };

  // Main's gate: a push's run, created → completed. Cancelled runs were superseded by a later push.
  const runs = (raw.mainRuns ?? []).filter(r => inWindow(r.created_at));
  const done = runs.filter(r => r.status === 'completed');
  const real = done.filter(r => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const mainCi = series(real.map(r => ({ at: t(r.created_at), ms: t(r.updated_at) - t(r.created_at) })), now, { cancelled: done.filter(r => r.conclusion === 'cancelled').length, running: runs.length - done.length,
    start: 'gate run created for a push to main', end: 'run completed (updated_at)' });
  // A first attempt's run_started_at is its created_at: the queue before a runner picks it up is in the jobs API, not read here.
  gaps.push({ measure: 'main-queue', why: 'a run\'s run_started_at equals created_at on its first attempt; runner queue time needs the jobs API, not read' });
  // Change failure and recovery: a failed gate run on main, and the time to the next successful run's completion.
  const failed = real.filter(r => r.conclusion !== 'success').sort((a, b) => t(a.created_at) - t(b.created_at));
  const ok = real.filter(r => r.conclusion === 'success').sort((a, b) => t(a.updated_at) - t(b.updated_at));
  const episodes = [];
  for (const f of failed) {
    const last = episodes.at(-1);
    if (last && (!last.recovered || t(f.created_at) < t(last.recovered))) continue; // one red period, however many runs failed in it
    episodes.push({ firstFailedRun: f.id, sha: f.head_sha, red: f.updated_at, recovered: null });
    const next = ok.find(r => t(r.created_at) > t(f.created_at));
    if (next) Object.assign(episodes.at(-1), { recovered: next.updated_at, recoveredBy: next.id });
  }
  const redRecovery = stats(episodes.filter(e => e.recovered).map(e => t(e.recovered) - t(e.red)), { open: episodes.filter(e => !e.recovered).length,
    start: 'a failed gate run on main completed', end: 'the next successful gate run on main completed' });
  const changeFailure = { failedRuns: failed.length, completedRuns: real.length, conclusions: real.reduce((m, r) => ({ ...m, [r.conclusion]: (m[r.conclusion] ?? 0) + 1 }), {}), last7: { failed: failed.filter(r => t(r.created_at) > now - 7 * 86_400_000).length, completed: real.filter(r => t(r.created_at) > now - 7 * 86_400_000).length }, rate: real.length ? Math.round(failed.length / real.length * 1000) / 1000 : null, redPeriods: episodes.length,
    denominator: 'completed gate runs on pushes to main, cancelled and skipped excluded' };

  // The tested ref: a push to main → the push of the tested ref to that commit.
  const tested = raw.tested ?? 'green';
  const testedPushes = on(activity, tested).filter(a => ['push', 'force_push', 'branch_creation'].includes(a.activity_type));
  const lag = [], lagUnpaired = [];
  for (const g of testedPushes) { const p = pushOf(g.after); if (p) lag.push({ at: t(g.timestamp), ms: t(g.timestamp) - t(p.timestamp) }); else lagUnpaired.push(g.after); }
  const testedLag = series(lag, now, { unpaired: lagUnpaired.length, start: 'push to main of a commit', end: `${tested} pushed to that commit` });

  // Deploys: the tested push of a commit → its deploy record; failures, rollbacks and the time to the next passing deploy.
  let deploy = null, deployFailure = null;
  if (raw.deploys === null || raw.deploys === undefined) gaps.push({ measure: 'deploy', why: 'the deploy records were not read' });
  else {
    const recs = raw.deploys.filter(r => inWindow(r.at)).sort((a, b) => t(a.at) - t(b.at));
    const waits = [], unpaired = [];
    for (const r of recs.filter(r => r.action === 'deploy')) { const g = testedPushes.find(p => p.after === r.commit); if (g && t(r.at) >= t(g.timestamp)) waits.push(t(r.at) - t(g.timestamp)); else unpaired.push(r.commit); }
    deploy = stats(waits, { unpaired: unpaired.length, start: `${tested} pushed to a commit`, end: 'its deploy record (deploys.jsonl at)' });
    const bad = recs.filter(r => !r.ok), rec = [];
    for (const b of bad) { const next = recs.find(r => r.ok && t(r.at) > t(b.at)); if (next) rec.push(t(next.at) - t(b.at)); }
    deployFailure = { records: recs.length, failed: bad.length, rolledBack: recs.filter(r => r.rolledBack === true).length, rollbackFailed: recs.filter(r => r.rolledBack === 'failed').length,
      rate: recs.length ? Math.round(bad.length / recs.length * 1000) / 1000 : null, recovery: stats(rec, { open: bad.length - rec.length, start: 'a failed deploy record', end: 'the next passing deploy record' }),
      denominator: 'deploy records (deploy, back and verify actions)' };
  }

  // PRs: review is created → merged, by kind of branch; PR CI is the gate on pull_request, created → completed.
  const prs = (raw.pulls ?? []).filter(p => p.merged_at && inWindow(p.created_at));
  const kind = ref => /^plates-night\//.test(ref) ? 'night' : /^renovate\//.test(ref) ? 'renovate' : /^(claude|codex)\//.test(ref) ? 'agent' : 'other';
  const review = Object.fromEntries(['agent', 'night', 'renovate', 'other'].map(k => [k, stats(prs.filter(p => kind(p.head?.ref ?? '') === k).map(p => t(p.merged_at) - t(p.created_at)))]));
  review.start = 'PR created'; review.end = 'PR merged'; review.closedUnmerged = (raw.pulls ?? []).filter(p => !p.merged_at && inWindow(p.created_at)).length;
  const prRuns = (raw.prRuns ?? []).filter(r => inWindow(r.created_at) && r.status === 'completed' && !['cancelled', 'skipped'].includes(r.conclusion));
  const prCi = series(prRuns.map(r => ({ at: t(r.created_at), ms: t(r.updated_at) - t(r.created_at) })), now, { failed: prRuns.filter(r => r.conclusion !== 'success').length, start: 'gate run created on a pull_request event', end: 'run completed' });

  // Work in progress over the window: ready marks and phase claims open at once.
  const claims = intervals(activity, 'claims/phase-');
  const wip = from === null ? null : { ready: concurrency([...ready.closed, ...ready.open], from, now), claims: concurrency([...claims.closed, ...claims.open], from, now),
    openClaims: claims.open.length, openReady: ready.open.length, now: raw.snapshot ? { counts: raw.snapshot.counts, wip: raw.snapshot.wip, tested: raw.snapshot.tested } : null };

  // Escapes: Trajectory lines that start "Escape:", in the window and in all.
  const escapes = (raw.escapes ?? []);
  const escaped = { inWindow: escapes.filter(e => window.from && e.date >= window.from.slice(0, 10)).length, total: escapes.length,
    byPhase: Object.entries(escapes.reduce((m, e) => ({ ...m, [e.phase]: (m[e.phase] ?? 0) + 1 }), {})).map(([phase, n]) => ({ phase: Number(phase), n })).sort((a, b) => b.n - a.n || a.phase - b.phase),
    denominator: 'Trajectory lines in docs/phases that start "Escape:" (dated by their line)' };

  return { schema: 1, repo: raw.repo, now: new Date(now).toISOString(), window, sources: raw.sources ?? null,
    waits: { 'to-ready': toReadyStats, 'claim-to-ready': claimToReady, 'pr-ci': prCi, review, integration, lock: lockStats, 'main-ci': mainCi, tested: testedLag, deploy, 'time-to-main': toMainStats, 'claim-to-main': claimToMain },
    integrator,
    failure: { main: changeFailure, recovery: redRecovery, redPeriods: episodes, deploys: deployFailure, escapes: escaped }, wip, gaps };
}

// ---- the reads ------------------------------------------------------------------

const gh = (args, env = process.env) => new Promise((done, fail) => execFile(env.PLATES_GH || 'gh', ['api', ...args], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300_000 },
  (error, stdout, stderr) => error ? fail(new Error(`gh api ${args.join(' ')}: ${String(stderr || error.message).trim().split('\n')[0]}`)) : done(JSON.parse(stdout))));
const all = async path => (await gh(['--paginate', '--slurp', path])).flat();

/** Escape lines from the phase files: "- **YYYY-MM-DD** — Escape: …". */
export async function readEscapes(dir) {
  const out = [];
  for (const file of (await readdir(dir)).filter(f => /^\d+-.*\.md$/.test(f))) {
    const text = await readFile(join(dir, file), 'utf8');
    for (const m of text.matchAll(/^- \*\*(\d{4}-\d{2}-\d{2})\*\* — Escape: (.+)$/gm)) out.push({ phase: Number(/^(\d+)/.exec(file)[1]), date: m[1], text: m[2].slice(0, 160) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.phase - b.phase);
}

/** Every read the baseline makes, with the commands' paths as its sources. */
export async function collect({ repo, phases, now = Date.now() }) {
  const base = `repos/${repo}`, gaps = [], sources = {};
  const read = async (name, path, fn = all) => { sources[name] = path; try { return await fn(path); } catch (e) { gaps.push({ measure: name, why: e.message.slice(0, 200) }); return null; } };
  const meta = await gh([base]);
  const workflows = (await gh([`${base}/actions/workflows`])).workflows ?? [];
  const gate = workflows.find(w => /\/check\.yml$/.test(w.path)), publish = workflows.find(w => /\/plates-publish\.yml$/.test(w.path));
  const activity = await read('activity', `${base}/activity?per_page=100`);
  const runs = list => (list ?? []).flatMap(p => p.workflow_runs ?? []);
  const mainRuns = gate ? runs(await read('mainRuns', `${base}/actions/workflows/${gate.id}/runs?branch=${meta.default_branch}&event=push&per_page=100`, p => gh(['--paginate', '--slurp', p]))) : (gaps.push({ measure: 'main-ci', why: 'no check.yml gate workflow' }), []);
  const prRuns = gate ? runs(await read('prRuns', `${base}/actions/workflows/${gate.id}/runs?event=pull_request&per_page=100`, p => gh(['--paginate', '--slurp', p]))) : [];
  const publishRuns = publish ? runs(await read('publishRuns', `${base}/actions/workflows/${publish.id}/runs?per_page=100`, p => gh(['--paginate', '--slurp', p]))) : [];
  const pulls = await read('pulls', `${base}/pulls?state=closed&per_page=100`);
  let deploys = null;
  for (const branch of ['plates-verify', 'keel-verify']) {
    try {
      const file = await gh([`${base}/contents/deploys.jsonl?ref=${branch}`]);
      const { deployResults } = await import('../practices/night/files/scripts/plates/morning.mjs');
      deploys = deployResults(Buffer.from(file.content, 'base64').toString('utf8')); sources.deploys = `${base}/contents/deploys.jsonl?ref=${branch}`; break;
    } catch { /* the next name */ }
  }
  if (!deploys) gaps.push({ measure: 'deploys', why: 'no deploys.jsonl on plates-verify or keel-verify' });
  const escapes = await readEscapes(phases);
  sources.escapes = `${phases}/*.md Trajectory "Escape:" lines`;
  let snapshot = null;
  try {
    const { readObservations, waitsModel, waitsSourceOf } = await import('../lib/integration-observations.mjs');
    const config = JSON.parse(await readFile(join(phases, '..', '..', '.plates', 'plates.json'), 'utf8'));
    const api = async (path, { missing = false } = {}) => { try { return await gh([path.replace(/^\//, '')]); } catch (e) { if (missing && /404/.test(e.message)) return null; throw e; } };
    const got = await readObservations({ repo, api, now, source: waitsSourceOf(config), can: { pulls: true, checks: true, activity: true } });
    snapshot = waitsModel(got.observations, got.gaps, { now });
    sources.snapshot = 'lib/integration-observations.mjs readObservations (bounded GETs)';
  } catch (e) { gaps.push({ measure: 'snapshot', why: e.message.slice(0, 200) }); }
  return { repo, tested: 'green', activity: activity ?? [], mainRuns, prRuns, publishRuns, pulls: pulls ?? [], deploys, escapes, snapshot, sources, gaps,
    ids: { gateWorkflow: gate?.id ?? null, publishWorkflow: publish?.id ?? null, defaultBranch: meta.default_branch, mainSha: (activity ?? []).filter(a => a.ref === `refs/heads/${meta.default_branch}`).sort((a, b) => t(b.timestamp) - t(a.timestamp))[0]?.after ?? null } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const repo = opt('--repo');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) { console.error('usage: node scripts/integration-baseline.mjs --repo <owner/name> [--phases <dir>] [--json]'); process.exit(2); }
  const now = Date.now();
  const raw = await collect({ repo, phases: opt('--phases') ?? 'docs/phases', now });
  const result = { ...baseline(raw, { now }), ids: raw.ids };
  console.log(JSON.stringify(args.includes('--json') ? result : { window: result.window, waits: result.waits, failure: { ...result.failure, redPeriods: result.failure.redPeriods.length }, wip: result.wip, gaps: result.gaps }, null, 2));
}
