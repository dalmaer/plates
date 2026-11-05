// plates promote for a Vercel target: a deploy checks itself and rolls itself
// back (plates phase 177; plates practice `delivery`; managed: plates render
// rewrites it). promote.mjs runs this when "delivery".promote is
// "vercel:<project>".
//
// .plates/plates.json "delivery": { "promote": "vercel:<project>",
// "vercel": { "scope": "<team>", "checkout": "<absolute directory>" },
// "site", "version", "smoke", "migrations"? (default lib/web/migrations) }.
//
//   plates promote [<commit>] [--yes] [--watch <s>] [--migrated <file>]... [--migrations-from <commit>]
//   plates promote --back            the last deployment that passed its checks, at once
//   plates promote --back <commit> [--yes]   phase 82's rule: an earlier tested commit's passing deployment
//
// Forward, in order; each refusal names why and nothing deploys (exit 1):
//   1. the guard (phase 82): the commit is on the tested ref, its gate passed,
//      and it is not earlier than what production serves;
//   2. the rollback target: the deployment serving production now is read
//      (vercel inspect <site>); unread, nothing deploys without a way back;
//   3. migrations: a file the commit adds under "delivery".migrations since
//      the last deploy that passed is refused by name, unless --migrated
//      <file> says the owner applied it;
//   4. the checkout: "delivery".vercel.checkout is filled with exactly the
//      commit (git archive), outside every git work tree.
// Without --yes it previews (exit 3). With --yes: vercel deploy --prod
// --skip-domain from the checkout, with the commit as the deployment's runtime
// env PLATES_DEPLOY_REVISION (a CLI deploy has no VERCEL_GIT_COMMIT_SHA), then
// vercel promote assigns production to it. A build that fails moves nothing.
// Then the checks, in order: the revision (production's version path reports
// exactly the commit, verify.mjs --exact), the smoke paths, and the error watch
// (vercel logs --level error for the new deployment, from its ready time for
// --watch seconds, default 120). Any that fails: vercel rollback to the
// recorded deployment, then read that it serves, and exit 1 naming the failed
// check, the deployment that failed and the one serving now. A rollback that
// does not take is recorded as failed: the first thing on the owner's docket.
//
// --back with no commit acts at once (it is the way back, and a known-good
// one): the newest deploy that passed and is older than the deploy serving now,
// rolled back to and checked (revision and smoke); a second --back goes one
// further back.
//
// Every deploy is one JSON line on the verify branch (deploys.jsonl, beside
// verify.json), written with a lease as verify.mjs --record writes.
//
// The Vercel CLI is one injected client (vercelClient): it reads the
// deployment serving production, deploys, promotes, rolls back and reads error
// logs. It never reads, pulls or lists environment values or secrets.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { environmentValue } from './lib.mjs';
import { deliveryOf } from './delivery.mjs';
import { ciResult } from './gate.mjs';
import { verify, readServing, verifyText, hostingOptOut, WITHIN, EVERY } from './verify.mjs';
import { VERIFY_BRANCH, VERIFY_FILE, DEPLOY_FILE, DEPLOYS_KEEP, deployResults } from './morning.mjs';
import { PromoteError, TESTED_REF, git, gitOk, ancestor, resolveCommit, gateConfig } from './promote.mjs';

/** How long the error watch reads production's error logs after the new deployment is ready, in seconds. */
export const WATCH = 120;
/** The runtime env that carries the deployed commit to the deployment (lib/web/config.mjs configFromEnv reads it). */
export const REVISION_ENV = 'PLATES_DEPLOY_REVISION';
/** The marker plates leaves in a checkout it fills (inside .vercel, which is never uploaded). */
const MARKER = join('.vercel', 'plates-deploy.json');
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{1,64}$/;
const short = s => (s ? s.slice(0, 7) : 'nothing');
const one = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---- the Vercel client ------------------------------------------------------------

/** The first JSON object a CLI printed (it may print a line or two before it). */
function jsonOf(text) {
  const s = String(text ?? ''), at = s.indexOf('{');
  if (at < 0) return null;
  try { return JSON.parse(s.slice(at)); } catch { return null; }
}

/** A deployment as the CLI's JSON names it: { id, url, state, readyAt }, or null. */
export function deploymentOf(data) {
  const d = data?.deployment && typeof data.deployment === 'object' ? data.deployment : data;
  const id = d?.id ?? d?.uid;
  if (typeof id !== 'string' || !DEPLOYMENT_ID.test(id)) return null;
  const host = typeof d.url === 'string' ? d.url.replace(/^https?:\/\//, '').split('/')[0] : null;
  const at = [d.ready, d.readyAt, d.readyStateAt].find(v => v !== undefined && v !== null);
  const readyAt = typeof at === 'number' ? new Date(at).toISOString() : typeof at === 'string' && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null;
  return { id, url: host ? `https://${host}` : null, state: typeof (d.readyState ?? d.state) === 'string' ? (d.readyState ?? d.state) : null, readyAt };
}

/**
 * The Vercel CLI, wrapped: { serving(site), deploy({ cwd, commit }), promote(id),
 * rollback(id), errors({ deployment, since }) }. Each returns its result or
 * throws (exit 1) naming the command that failed. `run(args, { cwd })` → {
 * status, stdout, stderr } is the only thing that touches the CLI, and tests
 * inject it. It never runs `vercel env`, nor reads a value or secret.
 */
export function vercelClient({ bin = 'vercel', scope, globalConfig = null, project, run } = {}) {
  run ??= (args, { cwd } = {}) => {
    const r = spawnSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60_000 });
    if (r.error) return { status: null, stdout: '', stderr: r.error.message };
    return r;
  };
  const common = [...(scope ? ['--scope', scope] : []), ...(globalConfig ? ['--global-config', globalConfig] : []), '--non-interactive', '--no-color'];
  const call = (args, what, opts = {}) => {
    if (['env', 'pull'].includes(args[0])) throw new PromoteError(`plates never runs vercel ${args[0]}: environment values and secrets stay out of plates promote`, 1);
    const r = run([...args, ...common], opts);
    if (r.status !== 0) throw new PromoteError(`${what}: vercel ${args[0]} failed${r.status === null ? '' : ` (exit ${r.status})`}: ${one(r.stderr || r.stdout).slice(0, 300) || 'no output'}`, 1);
    return r.stdout ?? '';
  };
  return {
    /** The deployment the production origin points at now. */
    serving(site) {
      const host = new URL(site).host;
      const d = deploymentOf(jsonOf(call(['inspect', host, '--json'], `cannot read the deployment serving ${host}`)));
      if (!d) throw new PromoteError(`cannot read the deployment serving ${host}: vercel inspect named no deployment id`, 1);
      return d;
    },
    /** A production deployment of the checkout, its domains not yet assigned (promote does that), carrying the commit. */
    deploy({ cwd, commit }) {
      const d = deploymentOf(jsonOf(call(['deploy', '--prod', '--skip-domain', '--yes', '--json', '--env', `${REVISION_ENV}=${commit}`, ...(project ? ['--project', project] : [])], `the deploy of ${short(commit)} failed, and production did not move`, { cwd })));
      if (!d) throw new PromoteError(`the deploy of ${short(commit)} named no deployment id, and production did not move`, 1);
      if (d.state && d.state !== 'READY') throw new PromoteError(`the deploy of ${short(commit)} is ${d.state}, not READY, and production did not move`, 1);
      return d;
    },
    promote(id) { call(['promote', id, '--yes', '--timeout', '3m'], `cannot point production at ${id}`); return { id }; },
    rollback(id) { call(['rollback', id, '--yes', '--timeout', '3m'], `cannot roll production back to ${id}`); return { id }; },
    /** Error-level log entries of one deployment since an instant: [{ at, message }]. */
    errors({ deployment, since }) {
      const out = call(['logs', '--deployment', deployment, '--level', 'error', '--since', since, '--json', '--limit', '100', ...(project ? ['--project', project] : [])], `cannot read ${deployment}'s error logs`);
      return out.split('\n').filter(l => l.trim().startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).map(e => {
        const t = e.timestamp ?? e.timestampInMs ?? e.date ?? e.time;
        return { at: typeof t === 'number' ? t : Date.parse(t), message: one(e.message ?? e.text ?? e.msg ?? JSON.stringify(e)).slice(0, 200) };
      });
    },
  };
}

// ---- the deploy records -------------------------------------------------------------

const LOCAL_TIP = 'refs/plates/deploy/tip';

/**
 * The verify branch as it is on `remote`: { tip, deploys, text, others }
 * (tip null when there is no branch). A branch holding neither verify.json
 * nor deploys.jsonl is someone else's and is refused (exit 1).
 */
export function readRecords({ root, env = process.env, remote = 'origin' }) {
  const ref = `refs/heads/${VERIFY_BRANCH}`;
  const listed = git(root, env, ['ls-remote', '--exit-code', '--heads', remote, ref]);
  if (![0, 2].includes(listed.status)) throw new PromoteError(`cannot read ${VERIFY_BRANCH} on ${remote}: git ls-remote exited ${listed.status}`, 1);
  if (listed.status === 2) return { tip: null, deploys: [], text: '', others: [] };
  gitOk(root, env, ['fetch', '--quiet', '--no-tags', remote, `+${ref}:${LOCAL_TIP}`], `cannot fetch ${VERIFY_BRANCH}`);
  const tip = gitOk(root, env, ['rev-parse', '--verify', `${LOCAL_TIP}^{commit}`], `cannot read ${VERIFY_BRANCH}`);
  const entries = gitOk(root, env, ['ls-tree', '-z', tip], `cannot read ${VERIFY_BRANCH}'s tree`).split('\0').filter(Boolean);
  const name = e => e.split('\t').slice(1).join('\t');
  if (!entries.some(e => [VERIFY_FILE, DEPLOY_FILE].includes(name(e)))) throw new PromoteError(`${VERIFY_BRANCH} exists on ${remote} and holds no ${VERIFY_FILE} or ${DEPLOY_FILE}: it is not plates's record, so it is left alone`, 1);
  const shown = git(root, env, ['show', `${tip}:${DEPLOY_FILE}`]);
  const text = shown.status === 0 ? shown.stdout : '';
  let deploys;
  try { deploys = deployResults(text); } catch (e) { throw new PromoteError(`${VERIFY_BRANCH}:${DEPLOY_FILE} is not a deploy record (${e.message}): it is left alone`, 1); }
  return { tip, deploys, text, others: entries.filter(e => name(e) !== DEPLOY_FILE) };
}

/** The lines kept: the newest DEPLOYS_KEEP, and the newest that passed whatever its age. */
function keptLines(lines) {
  const parsed = lines.map(l => ({ l, r: JSON.parse(l) }));
  const keep = parsed.slice(-DEPLOYS_KEEP);
  const lastGood = [...parsed].reverse().find(x => x.r.ok);
  if (lastGood && !keep.includes(lastGood)) keep.unshift(lastGood);
  return keep.map(x => x.l);
}

/** Add one deploy's record to deploys.jsonl on the verify branch, with a lease on the tip it read; every other file there stays. */
export function recordDeploy({ root, entry, env = process.env, remote = 'origin', attempts = 3 }) {
  const ref = `refs/heads/${VERIFY_BRANCH}`;
  const ok = (args, what, input) => {
    const r = spawnSync(environmentValue('variable:KEEL_GIT', env) ?? 'git', args, { cwd: root, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
    if (r.error || r.status !== 0) throw new PromoteError(`${what}: git ${args[0]} failed: ${(r.stderr || r.error?.message || '').trim().split('\n')[0]}`, 1);
    return r.stdout.trim();
  };
  for (let n = 1; n <= attempts; n++) {
    const { tip, text, others } = readRecords({ root, env, remote });
    const lines = keptLines([...text.split('\n').filter(l => l.trim()), JSON.stringify(entry)]);
    const blob = ok(['hash-object', '-w', '--stdin'], 'cannot write the deploy record', `${lines.join('\n')}\n`);
    const optOut = hostingOptOut(root, env, ok, new Set(others.map(e => e.split('\t').slice(1).join('\t'))));
    const tree = ok(['mktree', '-z'], 'cannot write the deploy record', [...others, ...optOut, `100644 blob ${blob}\t${DEPLOY_FILE}`].map(e => `${e}\0`).join(''));
    const commit = ok(['-c', 'user.name=keel-verify', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit-tree', tree, ...(tip ? ['-p', tip] : []), '-m', `plates promote: ${entry.action} ${short(entry.commit)} ${entry.ok ? 'passed' : entry.rolledBack === 'failed' ? 'failed, and its rollback failed' : entry.rolledBack ? 'failed, rolled back' : 'failed'} (${entry.at})`], 'cannot write the deploy record');
    const pushed = git(root, env, ['push', '--quiet', '--no-verify', `--force-with-lease=${ref}:${tip ?? ''}`, remote, `${commit}:${ref}`]);
    if (pushed.status === 0) return { recorded: true, commit, branch: VERIFY_BRANCH };
  }
  throw new PromoteError(`the deploy record could not be pushed to ${VERIFY_BRANCH}: it moved under every one of ${attempts} attempts`, 1);
}

// ---- the plan ------------------------------------------------------------------------

/** The tested ref's tip, fetched into the run's own ref. */
function testedTip(root, env, remote, tested) {
  const out = gitOk(root, env, ['ls-remote', remote, `refs/heads/${tested}`], `cannot read ${remote}`);
  const value = out.split('\n').map(l => l.split('\t')).find(([, r]) => r === `refs/heads/${tested}`)?.[0] ?? null;
  if (!value) throw new PromoteError(`${tested}, the tested ref, does not exist on ${remote}: nothing has passed through the publisher yet, so nothing can be promoted`, 1);
  gitOk(root, env, ['fetch', '--no-tags', '--quiet', remote, `+refs/heads/${tested}:${TESTED_REF}`], `cannot fetch ${remote}`);
  const tip = gitOk(root, env, ['rev-parse', '--verify', `${TESTED_REF}^{commit}`], `cannot read ${tested}`);
  if (tip !== value) throw new PromoteError(`${tested} moved while it was fetched: run again`, 1);
  return tip;
}

const has = (root, env, sha) => git(root, env, ['cat-file', '-e', `${sha}^{commit}`]).status === 0;

/**
 * The checkout a deploy runs from, checked: an absolute directory outside the
 * project and outside every git work tree, empty or plates's own (its marker),
 * so filling it never touches someone's work.
 */
function checkoutProblem(root, env, dir) {
  const inside = (a, b) => { const r = relative(a, b); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
  if (!isAbsolute(dir)) return `"delivery".vercel.checkout must be absolute (got ${JSON.stringify(dir)})`;
  if (inside(resolve(root), resolve(dir)) || inside(resolve(dir), resolve(root))) return `"delivery".vercel.checkout (${dir}) is inside this checkout, or holds it: the deploy runs from a directory of its own`;
  let probe = resolve(dir);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  if (existsSync(probe) && statSync(probe).isDirectory()) {
    const r = spawnSync(environmentValue('variable:KEEL_GIT', env) ?? 'git', ['rev-parse', '--show-toplevel'], { cwd: probe, env, encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return `"delivery".vercel.checkout (${dir}) is inside the git work tree ${r.stdout.trim()}: it must be outside every checkout, so a deploy never carries someone's uncommitted files`;
  }
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) return `"delivery".vercel.checkout (${dir}) is not a directory`;
  }
  return null;
}

/** Fill the checkout with exactly `sha` (git archive), keeping only its .vercel link; refuses a non-empty directory plates did not fill. */
async function fillCheckout(root, env, dir, sha) {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  if (entries.some(e => e !== '.vercel') && !existsSync(join(dir, MARKER))) throw new PromoteError(`"delivery".vercel.checkout (${dir}) holds files plates did not put there: it is left alone, and nothing deployed`, 1);
  for (const e of entries) if (e !== '.vercel') await rm(join(dir, e), { recursive: true, force: true });
  const tar = spawnSync(environmentValue('variable:KEEL_GIT', env) ?? 'git', ['archive', '--format=tar', sha], { cwd: root, env, maxBuffer: 1024 * 1024 * 1024 });
  if (tar.status !== 0) throw new PromoteError(`cannot archive ${short(sha)}: ${String(tar.stderr).trim().split('\n')[0]}`, 1);
  const x = spawnSync('tar', ['-x', '-f', '-', '-C', dir], { input: tar.stdout, maxBuffer: 16 * 1024 * 1024 });
  if (x.status !== 0) throw new PromoteError(`cannot unpack ${short(sha)} into ${dir}: ${String(x.stderr).trim().split('\n')[0]}`, 1);
  await mkdir(join(dir, '.vercel'), { recursive: true });
  await writeFile(join(dir, MARKER), `${JSON.stringify({ commit: sha })}\n`);
}

/** The migration files `to` adds under `dir` since `base`: [path]. */
function addedMigrations(root, env, base, to, dir) {
  const out = gitOk(root, env, ['diff', '--no-renames', '--diff-filter=A', '--name-only', base, to, '--', `${dir}/`], 'cannot read the migrations a deploy adds');
  return out.split('\n').filter(Boolean);
}

/** The commit a recorded deployment was checked serving, from the deploy records. */
const commitOfDeployment = (deploys, id) => deploys.find(r => r.ok && r.deployment?.id === id)?.commit ?? null;

/**
 * Everything before a deploy: the guard, the rollback target, the migrations
 * and the checkout. { action: 'deploy' | 'verify', project, to, subject,
 * target, servingCommit, gate, migrations, checkout, checks }. A refusal
 * throws (exit 1, naming why); a bad configuration throws (exit 2).
 */
export async function planVercel({ root, config, commit = null, migrated = [], migrationsFrom = null, within = WITHIN, every = EVERY, watch = WATCH, env = process.env, remote = 'origin', now = Date.now(), fetch, client, gate, request, download }) {
  if (env.GITHUB_ACTIONS === 'true') throw new PromoteError('plates promote is a person\'s command: it does not run in GitHub Actions, and no workflow promotes', 1);
  const d = deliveryOf(config);
  if (d.promote?.kind !== 'vercel') throw new PromoteError('.plates/plates.json "delivery".promote is not a Vercel target ("vercel:<project>")');
  const g = gateConfig(config, d);
  if (gitOk(root, env, ['rev-parse', '--is-shallow-repository'], 'cannot read this checkout') === 'true') throw new PromoteError('this checkout is shallow, so ancestry cannot be read: fetch its full history (git fetch --unshallow)');
  const tip = testedTip(root, env, remote, d.tested);
  const to = commit ? resolveCommit(root, env, commit) : tip;
  if (!ancestor(root, env, to, tip)) throw new PromoteError(`${short(to)} is not on ${d.tested} (its tip is ${short(tip)}): only a commit on the tested ref is deployed, and nothing deployed`, 1);
  const problem = checkoutProblem(root, env, d.vercel.checkout);
  if (problem) throw new PromoteError(`${problem}; nothing deployed`, 1);
  // The way back, before anything else is asked of production.
  const { deploys } = readRecords({ root, env, remote });
  let target;
  try { target = client.serving(d.site); }
  catch (e) { throw new PromoteError(`no rollback target: ${e.message}. Nothing deploys without a way back, and nothing deployed`, 1); }
  const reported = await readServing(new URL(d.version, d.site).href, { fetch });
  const servingCommit = commitOfDeployment(deploys, target.id) ?? reported.sha ?? null;
  target = { ...target, commit: servingCommit };
  const already = servingCommit === to;
  if (!already && servingCommit && has(root, env, servingCommit) && ancestor(root, env, to, servingCommit)) throw new PromoteError(`${short(to)} is earlier than production (${target.id}, ${short(servingCommit)}): rolling back is plates promote --back, and nothing deployed`, 1);
  // Its gate: phase 79's result for exactly this commit, at any age.
  const tree = gitOk(root, env, ['rev-parse', `${to}^{tree}`], `cannot read ${short(to)}'s tree`);
  const gr = await (gate ?? (o => ciResult(o)))({ config: g.config, sha: to, tree, clean: true, env, now, maxAgeMs: Infinity, request, download });
  if (!gr.reused) throw new PromoteError(`${short(to)}'s gate has not passed, as far as plates can show (${g.workflow}): ${gr.reason}; only a commit whose gate passed is deployed, and nothing deployed`, 1);
  // Migrations it adds since the last deploy that passed, each one the owner's to apply first.
  const lastGood = deploys.find(r => r.ok && r.action !== 'verify') ?? deploys.find(r => r.ok);
  const base = lastGood?.commit ?? (migrationsFrom ? resolveCommit(root, env, migrationsFrom) : null) ?? servingCommit;
  if (!base) throw new PromoteError(`which migrations ${short(to)} adds cannot be told: no deploy has passed yet and production reports no commit at ${d.version}; name the commit production was built from with --migrations-from <commit>, and nothing deployed`, 1);
  if (!has(root, env, base)) git(root, env, ['fetch', '--quiet', '--no-tags', remote]);
  if (!has(root, env, base)) throw new PromoteError(`${short(base)}, the last commit that passed, is not in this repository: which migrations ${short(to)} adds cannot be told, and nothing deployed`, 1);
  const added = already ? [] : addedMigrations(root, env, base, to, d.migrations);
  const applied = new Set(migrated);
  const waiting = added.filter(f => !applied.has(f) && !applied.has(f.split('/').pop()));
  if (waiting.length) throw new PromoteError(`${short(to)} waits for its migration${waiting.length === 1 ? '' : 's'}: ${waiting.join(', ')} ${waiting.length === 1 ? 'is' : 'are'} new since ${short(base)} and the hosted database may not have ${waiting.length === 1 ? 'it' : 'them'}. Apply ${waiting.length === 1 ? 'it' : 'them'}, then plates promote --yes ${waiting.map(f => `--migrated ${f}`).join(' ')}; nothing deployed`, 1);
  const subject = gitOk(root, env, ['log', '-1', '--format=%s', to], `cannot read ${short(to)}`);
  return {
    action: already ? 'verify' : 'deploy', project: d.promote.name, ref: d.promote.spec, tested: d.tested, testedTip: tip, to, subject, target, servingCommit,
    gate: { workflow: gr.workflow, runId: gr.runId, attempt: gr.attempt, tests: gr.tests, completedAt: gr.completedAt },
    migrations: { base, added, migrated: [...applied] }, checkout: d.vercel.checkout,
    checks: { site: d.site, version: d.version, smoke: d.smoke.length, within, every, watch },
    reason: already ? `production already serves ${short(to)} (${target.id}): it is checked, not deployed again` : `${short(to)} is on ${d.tested} and its gate passed; production serves ${target.id}${servingCommit ? ` (${short(servingCommit)})` : ''}, the rollback target`,
  };
}

// ---- the checks ----------------------------------------------------------------------

/** The revision and smoke checks, from one verify: [{ check, ok, detail }]. */
async function verifyChecks({ root, config, sha, within, every, env, fetch, clock, sleep }) {
  let v;
  try { v = await verify({ root, config, sha, exact: true, within, every, env, fetch, now: clock, sleep }); }
  catch (e) { return { v: null, checks: [{ check: 'revision', ok: false, detail: `the verify could not run: ${e.message}` }] }; }
  const smokeFailed = v.smoke.filter(s => !s.matched).map(s => `GET ${s.path}: expected ${s.expected.join(' or ')}, got ${s.got ?? 'no answer'}`);
  return { v, checks: [
    { check: 'revision', ok: v.contained === true, detail: v.contained ? `${v.site}${v.version} reports exactly ${short(sha)}` : v.failures[0] ?? 'production did not report the commit' },
    { check: 'smoke', ok: smokeFailed.length === 0, detail: smokeFailed.length ? smokeFailed.join('; ') : `${v.smoke.length} smoke check${v.smoke.length === 1 ? '' : 's'} matched` },
  ] };
}

/**
 * The error watch: the new deployment's error logs, from its ready time for
 * `watch` seconds, read every `every` seconds and once more at the end. Any
 * entry at or after the ready time fails it; logs that cannot be read fail it
 * too (it passes only on what it saw). { check: 'errors', ok, detail, reads }.
 */
export async function watchErrors({ client, deployment, readyAt, watch = WATCH, every = EVERY, clock = () => Date.now(), sleep = ms => delay(ms) }) {
  const start = Date.parse(readyAt), end = start + watch * 1000, since = new Date(start).toISOString();
  let reads = 0;
  for (;;) {
    const t = clock();
    let entries;
    try { entries = client.errors({ deployment: deployment.id, since }); reads++; }
    catch (e) { return { check: 'errors', ok: false, detail: `the error logs could not be read (${e.message}), so the deployment was not shown to be clean`, reads }; }
    const fresh = entries.filter(e => Number.isFinite(e.at) && e.at >= start);
    if (fresh.length) return { check: 'errors', ok: false, detail: `${fresh.length} error${fresh.length === 1 ? '' : 's'} logged since ${since}, the first: ${fresh[0].message}`, reads };
    if (t >= end) return { check: 'errors', ok: true, detail: `no error logged in ${watch}s from ${since} (${reads} read${reads === 1 ? '' : 's'})`, reads };
    await sleep(Math.max(1, Math.min(every * 1000, end - t)));
  }
}

/** Move production back to `target` and read that it serves: { rolledBack: true | 'failed', serving, why? }. */
function rollBack({ client, site, target }) {
  try { client.rollback(target.id); }
  catch (e) {
    let serving = null; try { serving = client.serving(site); } catch { /* unknown */ }
    return { rolledBack: 'failed', serving, why: e.message };
  }
  let serving;
  try { serving = client.serving(site); } catch (e) { return { rolledBack: 'failed', serving: null, why: `the rollback ran, but what serves production could not be read: ${e.message}` }; }
  if (serving.id !== target.id) return { rolledBack: 'failed', serving, why: `the rollback ran, but production serves ${serving.id}, not ${target.id}` };
  return { rolledBack: true, serving };
}

const brief = d => (d ? { id: d.id, url: d.url ?? null, ...(d.commit ? { commit: d.commit } : {}) } : null);

function recorded({ root, entry, env, remote }) {
  try { return recordDeploy({ root, entry, env, remote }); } catch (e) { return { recorded: false, why: e.message }; }
}

// ---- the command ---------------------------------------------------------------------

/**
 * A Vercel target's plates promote: plan, then (with yes) deploy, check, and
 * roll back on any failed check. { ...plan, deployment, checks, ok, failed,
 * rolledBack, serving, record, next, exitCode }.
 */
export async function promoteVercel(o) {
  const { root, config, commit = null, back = false, yes = false, env = process.env, remote = 'origin' } = o;
  const d = deliveryOf(config);
  const client = o.client ?? vercelClient({ bin: env.PLATES_VERCEL || 'vercel', scope: d.vercel?.scope, globalConfig: d.vercel?.globalConfig, project: d.promote?.name });
  const clock = o.clock ?? (() => Date.now()), sleep = o.sleep ?? (ms => delay(ms));
  const within = o.within ?? WITHIN, every = o.every ?? EVERY, watch = o.watch ?? WATCH;
  if (back) return backVercel({ ...o, client, clock, sleep, within, every });
  const p = await planVercel({ ...o, client, within, every, watch, now: clock() });
  if (!yes) return { ...p, preview: true, exitCode: 3 };
  const at = () => new Date(clock()).toISOString();
  const base = { schema: 1, project: p.project, commit: p.to, action: p.action, target: brief(p.target), migrations: p.migrations };
  const finish = (r) => {
    const entry = { ...base, at: at(), deployment: brief(r.deployment), checks: r.checks, ok: r.ok, failed: r.failed ?? null, rolledBack: r.rolledBack ?? false, serving: brief(r.serving) };
    const record = recorded({ root, entry, env, remote });
    return { ...p, ...r, record, exitCode: r.ok && record.recorded ? 0 : 1 };
  };
  // Already serving it: checked, never deployed again, and nothing to roll back to.
  if (p.action === 'verify') {
    const { checks } = await verifyChecks({ root, config, sha: p.to, within, every, env, fetch: o.fetch, clock, sleep });
    const failed = checks.find(c => !c.ok)?.check ?? null;
    return finish({ deployment: p.target, checks, ok: !failed, failed, rolledBack: false, serving: p.target,
      next: failed ? `production serves ${short(p.to)} and its ${failed} check failed; there is no earlier deployment this run moved from: plates promote --back, or fix forward` : null });
  }
  await fillCheckout(root, env, p.checkout, p.to);
  // A failed build moves nothing: the deployment has no domain until promote.
  let deployment;
  try { deployment = client.deploy({ cwd: p.checkout, commit: p.to }); }
  catch (e) { return finish({ deployment: null, checks: [{ check: 'deploy', ok: false, detail: one(e.message) }], ok: false, failed: 'deploy', rolledBack: false, serving: p.target, next: `the build failed, and production still serves ${p.target.id}` }); }
  const readyAt = deployment.readyAt ?? at();
  try { client.promote(deployment.id); }
  catch (e) {
    const checks = [{ check: 'promote', ok: false, detail: one(e.message) }];
    const undo = rollBack({ client, site: d.site, target: p.target });
    return finish({ deployment, checks, ok: false, failed: 'promote', ...undo, next: undo.rolledBack === true ? `production was not pointed at ${deployment.id}; it serves ${p.target.id}` : `production may be serving ${deployment.id}: ${undo.why}; plates promote --back` });
  }
  // The checks, in order; the first that fails rolls production back.
  const checks = [];
  const verified = await verifyChecks({ root, config, sha: p.to, within, every, env, fetch: o.fetch, clock, sleep });
  checks.push(...verified.checks);
  if (checks.every(c => c.ok)) checks.push(await watchErrors({ client, deployment, readyAt, watch, every, clock, sleep }).then(({ reads, ...c }) => c));
  const failed = checks.find(c => !c.ok)?.check ?? null;
  if (!failed) return finish({ deployment: { ...deployment, readyAt }, checks, ok: true, failed: null, rolledBack: false, serving: { ...deployment, commit: p.to }, verify: verified.v, next: null });
  const undo = rollBack({ client, site: d.site, target: p.target });
  const next = undo.rolledBack === true
    ? `the ${failed} check failed on ${deployment.id} (${short(p.to)}); production is back on ${p.target.id}${p.target.commit ? ` (${short(p.target.commit)})` : ''}`
    : `the ${failed} check failed on ${deployment.id} (${short(p.to)}), and the rollback to ${p.target.id} did not take: ${undo.why}. Production may be serving the failed deploy: plates promote --back, or vercel rollback ${p.target.id}`;
  return finish({ deployment: { ...deployment, readyAt }, checks, ok: false, failed, ...undo, verify: verified.v, next });
}

/**
 * plates promote --back for a Vercel target. With no commit: the newest
 * deploy that passed whose deployment is not the one serving, at once. With a
 * commit (phase 82's rule): that commit is on the tested ref, earlier than
 * production, its gate passed, and a deploy of it passed; previewed without
 * --yes. Then rolled back to and checked (revision and smoke), never rolled
 * again on its own.
 */
async function backVercel(o) {
  const { root, config, commit, yes, env = process.env, remote = 'origin', client, clock, sleep, within, every } = o;
  if (env.GITHUB_ACTIONS === 'true') throw new PromoteError('plates promote is a person\'s command: it does not run in GitHub Actions, and no workflow promotes', 1);
  const d = deliveryOf(config);
  const { deploys } = readRecords({ root, env, remote });
  let serving;
  try { serving = client.serving(d.site); } catch (e) { throw new PromoteError(`cannot read the deployment serving production (${e.message}): plates promote --back moves nothing it cannot check`, 1); }
  const servingCommit = commitOfDeployment(deploys, serving.id);
  let good;
  if (!commit) {
    // The deploys that passed, newest first; the last good one is the newest older than the deploy serving now
    // (so a second --back goes one further back, never forward to the one it left).
    const passed = deploys.filter(r => r.ok && r.action === 'deploy' && r.deployment?.id);
    const at = passed.findIndex(r => r.deployment.id === serving.id);
    good = (at < 0 ? passed : passed.slice(at + 1)).find(r => r.deployment.id !== serving.id);
    if (!good) throw new PromoteError(`no deployment has passed its checks before the one serving (${serving.id}) in ${VERIFY_BRANCH}:${DEPLOY_FILE}: there is no last good deployment to go back to, and nothing moved`, 1);
  } else {
    const g = gateConfig(config, d);
    const tip = testedTip(root, env, remote, d.tested);
    const to = resolveCommit(root, env, commit);
    if (!ancestor(root, env, to, tip)) throw new PromoteError(`${short(to)} is not on ${d.tested} (its tip is ${short(tip)}): only a commit on the tested ref is promoted, and nothing moved`, 1);
    if (servingCommit && (to === servingCommit || !ancestor(root, env, to, servingCommit))) throw new PromoteError(`${short(to)} is not earlier than production (${serving.id}, ${short(servingCommit)}): --back moves production to an earlier commit, and nothing moved`, 1);
    const tree = gitOk(root, env, ['rev-parse', `${to}^{tree}`], `cannot read ${short(to)}'s tree`);
    const gr = await (o.gate ?? (x => ciResult(x)))({ config: g.config, sha: to, tree, clean: true, env, now: clock(), maxAgeMs: Infinity });
    if (!gr.reused) throw new PromoteError(`${short(to)}'s gate has not passed, as far as plates can show (${g.workflow}): ${gr.reason}; nothing moved`, 1);
    good = deploys.find(r => r.ok && r.commit === to && r.deployment?.id && r.deployment.id !== serving.id);
    if (!good) throw new PromoteError(`no deployment of ${short(to)} passed its checks (${VERIFY_BRANCH}:${DEPLOY_FILE}): there is none to go back to; plates promote ${short(to)} deploys it, and nothing moved`, 1);
    if (!yes) return { action: 'back', project: d.promote.name, to: good.commit, deployment: good.deployment, serving, preview: true, exitCode: 3, reason: `${short(to)} is on ${d.tested}, earlier than production, its gate passed, and ${good.deployment.id} passed its checks at ${good.at}` };
  }
  const at = () => new Date(clock()).toISOString();
  const base = { schema: 1, project: d.promote.name, commit: good.commit, action: 'back', target: brief(serving), deployment: brief(good.deployment) };
  const done = r => {
    const entry = { ...base, at: at(), checks: r.checks, ok: r.ok, failed: r.failed ?? null, rolledBack: false, serving: brief(r.serving) };
    const record = recorded({ root, entry, env, remote });
    return { action: 'back', project: d.promote.name, to: good.commit, from: serving, deployment: good.deployment, ...r, record, exitCode: r.ok && record.recorded ? 0 : 1 };
  };
  const moved = rollBack({ client, site: d.site, target: good.deployment });
  if (moved.rolledBack !== true) return done({ checks: [{ check: 'rollback', ok: false, detail: one(moved.why) }], ok: false, failed: 'rollback', serving: moved.serving, next: `production did not move to ${good.deployment.id}: ${moved.why}` });
  const { checks } = await verifyChecks({ root, config, sha: good.commit, within, every, env, fetch: o.fetch, clock, sleep });
  const failed = checks.find(c => !c.ok)?.check ?? null;
  return done({ checks, ok: !failed, failed, serving: moved.serving,
    next: failed ? `production serves ${good.deployment.id} (${short(good.commit)}) again, and its ${failed} check failed: check the deployment` : null });
}

/** What a Vercel promote says: the preview, or what deployed, each check, and what serves now. */
export function promoteVercelText(r) {
  if (r.action === 'back') {
    if (r.preview) return [`plates promote --back: preview, nothing moved (--yes to move it)`, `  ${r.reason}.`, `  Production would serve ${r.deployment.id} (${short(r.to)}), from ${r.serving.id}.`].join('\n');
    const lines = [`plates promote --back: ${r.ok ? `production is back on ${r.deployment.id} (${short(r.to)})` : `FAILED going back to ${r.deployment.id} (${short(r.to)})`}`, `  from ${r.from.id}; serving now: ${r.serving?.id ?? 'unknown'}.`];
    for (const c of r.checks) lines.push(`  ${c.ok ? 'ok    ' : 'FAILED'} ${c.check}: ${c.detail}`);
    if (r.record && !r.record.recorded) lines.push(`  Not recorded: ${r.record.why}`);
    if (r.next) lines.push(`  Next: ${r.next}.`);
    return lines.join('\n');
  }
  const head = r.preview ? (r.action === 'verify' ? 'preview, nothing to deploy (--yes checks production)' : 'preview, nothing deployed (--yes to deploy it)')
    : r.ok ? (r.action === 'verify' ? `production serves ${short(r.to)}, checked` : `deployed ${short(r.to)} as ${r.deployment.id}, checked`)
    : r.rolledBack === true ? `FAILED ${r.failed} on ${short(r.to)}, rolled back to ${r.serving?.id}` : r.rolledBack === 'failed' ? `FAILED ${r.failed} on ${short(r.to)}, and the ROLLBACK FAILED` : `FAILED ${r.failed} on ${short(r.to)}`;
  const lines = [`plates promote (${r.ref}): ${head}`, `  ${short(r.to)} ${r.subject}`, `  ${r.reason}: ${r.gate.workflow} run ${r.gate.runId}, ${r.gate.tests} test${r.gate.tests === 1 ? '' : 's'} passed (${r.gate.completedAt}).`];
  const m = r.migrations;
  lines.push(`  Migrations since ${short(m.base)}: ${m.added.length ? m.added.map(f => `${f} (applied, --migrated)`).join(', ') : 'none added'}.`);
  if (r.preview) {
    const c = r.checks;
    lines.push(`  Then: deploy from ${r.checkout}, point production at it, and check: ${new URL(c.version, c.site).href} reports exactly ${short(r.to)} within ${c.within}s, ${c.smoke} smoke check${c.smoke === 1 ? '' : 's'}, and no error logged for ${c.watch}s; any failure rolls back to ${r.target.id}.`);
    return lines.join('\n');
  }
  for (const c of r.checks) lines.push(`  ${c.ok ? 'ok    ' : 'FAILED'} ${c.check}: ${c.detail}`);
  lines.push(`  Serving now: ${r.serving?.id ?? 'unknown'}${r.serving?.commit ? ` (${short(r.serving.commit)})` : ''}.`);
  if (r.record?.recorded) lines.push(`  Recorded on ${r.record.branch} (${short(r.record.commit)}).`);
  else if (r.record) lines.push(`  Not recorded: ${r.record.why}`);
  if (r.next) lines.push(`  Next: ${r.next}.`);
  return lines.join('\n');
}

export { verifyText };
