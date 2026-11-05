// plates promote for a Vercel target (phase 177): scripts/plates/vercel.mjs,
// the delivery practice's. A bare Acme origin and a clone of it; the Vercel CLI
// is a fake `run` the client is given (nothing here spawns vercel); production
// is a stub HTTP server on 127.0.0.1 that serves whatever deployment the fake
// has pointed it at; the gate is injected (phase 82's tests read the real one);
// the clock is a counter the sleeps advance. No network, no real remote, nobody's
// git settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile, mkdir, cp, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { scratch, ENV } from './helpers/improve.mjs';
import { run } from './helpers/run.mjs';
import { deliveryProblems, deliveryOf } from '../practices/delivery/files/scripts/plates/delivery.mjs';
import { deployResults, openRollbacks, rollbackLine } from '../practices/night/files/scripts/plates/morning.mjs';

const repo = 'acme/anvils';
const NIGHT = resolve('practices/night/files/scripts/plates');
const DELIVERY = resolve('practices/delivery/files/scripts/plates');
const QUIET = { ...ENV, GITHUB_ACTIONS: '', CI: '' };
const T0 = Date.parse('2026-11-03T12:00:00Z');

/**
 * The fake Vercel: deployments by id, the one production points at, and what
 * the next deploy will do (drop the revision env, answer a smoke path with
 * 500, log errors so many ms after it is ready, fail its build). Every call is
 * logged with its cwd.
 */
function fakeVercel(clock) {
  const state = { deployments: { dpl_1: { id: 'dpl_1', commit: null, smoke: 200, errors: [], ready: T0 - 86_400_000 } }, prod: 'dpl_1', n: 1, calls: [], next: {}, failServing: false, failRollback: false };
  const ok = stdout => ({ status: 0, stdout, stderr: '' });
  const no = stderr => ({ status: 1, stdout: '', stderr });
  const arg = (args, flag) => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
  const run = (args, { cwd } = {}) => {
    state.calls.push({ args, cwd });
    // What changes production takes a second; a read takes none.
    if (['deploy', 'promote', 'rollback'].includes(args[0])) clock.tick(1000);
    const [sub, id] = args;
    const json = d => ok(`Vercel CLI 59.23.2\n${JSON.stringify({ id: d.id, url: `${d.id}.anvils.vercel.app`, readyState: 'READY', target: 'production', ready: d.ready })}\n`);
    if (sub === 'inspect') return state.failServing ? no('Error: Not authorized (403)') : json(state.deployments[state.prod]);
    if (sub === 'deploy') {
      const n = state.next; state.next = {};
      if (n.buildFails) return no('Error: Command "npm run build" exited with 1');
      const env = arg(args, '--env') ?? '', commit = env.startsWith('PLATES_DEPLOY_REVISION=') ? env.slice(23) : null;
      const d = { id: `dpl_${++state.n}`, commit: n.dropRevision ? null : commit, smoke: n.smoke ?? 200, errors: n.errors ?? [], ready: clock.now(), files: cwd };
      state.deployments[d.id] = d;
      return json(d);
    }
    if (sub === 'promote') { if (!state.deployments[id]) return no('Error: no such deployment'); state.prod = id; return ok(''); }
    if (sub === 'rollback') { if (state.failRollback || !state.deployments[id]) return no('Error: rollback failed'); state.prod = id; return ok(''); }
    if (sub === 'logs') {
      const d = state.deployments[arg(args, '--deployment')], since = Date.parse(arg(args, '--since'));
      return ok(d.errors.map(ms => ({ timestamp: d.ready + ms, level: 'error', message: `Acme TypeError at ${ms}ms` })).filter(e => e.timestamp >= since && e.timestamp <= clock.now()).map(e => JSON.stringify(e)).join('\n'));
    }
    return no(`unknown command ${sub}`);
  };
  return { state, run };
}

/** Production, as the fake points it: /api/version is the serving deployment's commit, / its smoke answer. */
async function production(t, vercel) {
  const server = createServer((req, res) => {
    const d = vercel.state.deployments[vercel.state.prod], close = { connection: 'close' };
    if (req.url === '/api/version') { res.writeHead(200, { 'content-type': 'application/json', ...close }); return res.end(JSON.stringify({ commit: d.commit })); }
    if (req.url === '/') { res.writeHead(d.smoke, close); return res.end('acme'); }
    res.writeHead(404, close); res.end('not found');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }));
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * A bare origin and a clone. main is A → B → C → D, where C adds the
 * migration lib/web/migrations/002-acme.sql; green (the tested ref) is at D.
 * Production is dpl_1, built from A before plates recorded anything, and it
 * reports A. Every gate passed but F's, a commit off green.
 */
async function acme(t, { delivery = {} } = {}) {
  const dir = await scratch(t, 'plates-promote-vercel-');
  const origin = join(dir, 'origin.git'), root = join(dir, 'acme'), checkout = join(dir, 'deploy');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim();
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'init', '-q', '-b', 'main', root);
  git(root, 'remote', 'add', 'origin', origin);
  let now = T0;
  const clock = { now: () => now, sleep: async ms => { now += ms; }, tick: ms => { now += ms; } };
  const vercel = fakeVercel(clock);
  const site = await production(t, vercel);
  const config = { name: 'Acme', repo, practices: ['night', 'delivery'], ci: { gateWorkflow: 'check.yml' },
    delivery: { promote: 'vercel:anvils', vercel: { scope: 'acme', checkout }, site, version: '/api/version', smoke: ['/'], ...delivery } };
  await mkdir(join(root, '.plates'));
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify(config));
  const commit = async (name, path = `${name}.mjs`) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), `-- Acme ${name}\n`);
    git(root, 'add', '-A'); git(root, 'commit', '-qm', `Acme ${name}`);
    return git(root, 'rev-parse', 'HEAD');
  };
  const A = await commit('anvil'); await commit('first', 'lib/web/migrations/001-acme.sql');
  const A2 = git(root, 'rev-parse', 'HEAD');
  const B = await commit('bellows'), C = await commit('crucible', 'lib/web/migrations/002-acme.sql'), D = await commit('drill');
  git(root, 'push', '-q', 'origin', 'main');
  git(root, 'push', '-q', 'origin', `${D}:refs/heads/green`);
  git(root, 'checkout', '-q', '-b', 'acme-side', B);
  const F = await commit('forge');
  git(root, 'checkout', '-q', 'main');
  vercel.state.deployments.dpl_1.commit = A2;
  const scripts = join(root, 'scripts', 'plates');
  await cp(NIGHT, scripts, { recursive: true });
  await cp(DELIVERY, scripts, { recursive: true });
  const p = await import(pathToFileURL(join(scripts, 'promote.mjs')).href);
  const v = await import(pathToFileURL(join(scripts, 'vercel.mjs')).href);
  const gate = async ({ sha }) => (sha === F ? { reused: false, reason: 'its gate run failed' } : { reused: true, workflow: '.github/workflows/check.yml', runId: 7, attempt: 1, tests: 3, completedAt: '2026-11-02T00:00:00Z' });
  const client = v.vercelClient({ scope: 'acme', project: 'anvils', run: vercel.run });
  const promote = opts => p.promote({ root, config, env: QUIET, client, gate, clock: clock.now, sleep: clock.sleep, within: 0, every: 10, watch: 120, ...opts });
  const records = () => {
    try { return deployResults(git(root, 'show', `${git(root, 'ls-remote', 'origin', 'refs/heads/plates-verify').split('\t')[0]}:deploys.jsonl`)); } catch { return []; }
  };
  git(root, 'fetch', '-q', 'origin');
  return { root, config, vercel, clock, site, checkout, p, v, promote, records, A: A2, B, C, D, F, git: (...a) => git(root, ...a) };
}

const subs = a => a.vercel.state.calls.map(c => c.args[0]);
/** The delivery scripts as a project has them, beside the night's they import. */
async function installed(t) {
  const dir = await scratch(t, 'plates-promote-vercel-scripts-');
  await cp(NIGHT, dir, { recursive: true });
  await cp(DELIVERY, dir, { recursive: true });
  return { promote: await import(pathToFileURL(join(dir, 'promote.mjs')).href), vercel: await import(pathToFileURL(join(dir, 'vercel.mjs')).href) };
}

// ---- the rollback target ------------------------------------------------------------------------

test('no rollback target, no deploy', async t => {
  const a = await acme(t);
  a.vercel.state.failServing = true;
  await assert.rejects(a.promote({ commit: a.B, yes: true }), e => e.exitCode === 1 && /^no rollback target: cannot read the deployment serving 127\.0\.0\.1:\d+: vercel inspect failed \(exit 1\): Error: Not authorized \(403\)\. Nothing deploys without a way back, and nothing deployed$/.test(e.message));
  assert.deepEqual(subs(a), ['inspect'], 'nothing but the read: no deploy, no promote');
  assert.equal(a.vercel.state.prod, 'dpl_1');
  assert.deepEqual(a.records(), [], 'nothing recorded');
  // The preview reads it too, and says it.
  await assert.rejects(a.promote({ commit: a.B }), /no rollback target/);
  // Readable again: the preview names the target and what will follow, and deploys nothing.
  a.vercel.state.failServing = false;
  const preview = await a.promote({ commit: a.B });
  assert.equal(preview.exitCode, 3);
  assert.deepEqual([preview.action, preview.target.id, preview.target.commit, preview.to], ['deploy', 'dpl_1', a.A, a.B]);
  assert.ok(!subs(a).includes('deploy'));
  assert.match(a.v.promoteVercelText(preview), /preview, nothing deployed \(--yes to deploy it\)[\s\S]*any failure rolls back to dpl_1\.$/);
});

test('the installed script runs as a command: it loads the Vercel client and settles', async t => {
  // vercel.mjs imports promote.mjs, so while promote.mjs awaited its main at the top
  // level, its dynamic import of vercel.mjs never settled: node exited 13, having done nothing.
  const a = await acme(t);
  const r = run(process.execPath, [join(a.root, 'scripts/plates/promote.mjs'), a.B, '--json'], { cwd: a.root, env: { ...QUIET, PLATES_VERCEL: join(a.root, 'no-vercel') }, timeout: 60_000 });
  assert.equal(r.status, 1, `${r.stderr}${r.stdout}`);
  assert.match(JSON.parse(r.stdout).error, /^no rollback target: cannot read the deployment serving 127\.0\.0\.1:\d+: vercel inspect failed/);
  assert.equal(r.stderr, '');
});

test('a deploy runs from a clean checkout of exactly the commit, carries the commit, and passes its checks', async t => {
  const a = await acme(t);
  const r = await a.promote({ commit: a.B, yes: true });
  assert.equal(r.exitCode, 0, JSON.stringify(r.checks));
  assert.deepEqual(r.checks.map(c => [c.check, c.ok]), [['revision', true], ['smoke', true], ['errors', true]]);
  assert.equal(a.vercel.state.prod, 'dpl_2');
  // The deploy: production, domains held until promote, the commit as the deployment's runtime env, from the checkout.
  const deploy = a.vercel.state.calls.find(c => c.args[0] === 'deploy');
  // No --meta: Vercel refuses a meta key it does not know ("should NOT have additional property"), and the commit is in the env.
  assert.deepEqual(deploy.args.slice(0, 9), ['deploy', '--prod', '--skip-domain', '--yes', '--json', '--env', `PLATES_DEPLOY_REVISION=${a.B}`, '--project', 'anvils']);
  assert.ok(deploy.args.includes('--scope') && deploy.args.includes('acme'));
  assert.equal(deploy.cwd, a.checkout);
  assert.deepEqual((await readdir(a.checkout)).sort(), ['.plates', '.vercel', 'anvil.mjs', 'bellows.mjs', 'lib'], 'exactly B\'s tree, and plates\'s marker in .vercel');
  assert.deepEqual(subs(a).filter(s => s !== 'inspect' && s !== 'logs'), ['deploy', 'promote']);
  // Never an env read: no vercel env, pull or a secret, in any call.
  assert.ok(a.vercel.state.calls.every(c => !['env', 'pull'].includes(c.args[0])));
  // The record: one line on the verify branch, with the rollback target it read first.
  const [rec] = a.records();
  assert.deepEqual([rec.action, rec.commit, rec.ok, rec.rolledBack, rec.deployment.id, rec.target.id, rec.target.commit, rec.serving.id], ['deploy', a.B, true, false, 'dpl_2', 'dpl_1', a.A, 'dpl_2']);
  assert.match(a.v.promoteVercelText(r), /deployed [0-9a-f]{7} as dpl_2, checked[\s\S]*ok {5}revision[\s\S]*ok {5}errors: no error logged in 120s/);
  // Again: production serves B, so it is checked, not deployed again.
  const again = await a.promote({ commit: a.B, yes: true });
  assert.deepEqual([again.action, again.exitCode], ['verify', 0]);
  assert.equal(subs(a).filter(s => s === 'deploy').length, 1);
  // A dirty or foreign checkout is never filled; an earlier commit is a rollback; a commit off green or with a failed gate is refused.
  const { unlink } = await import('node:fs/promises');
  await unlink(join(a.checkout, '.vercel', 'plates-deploy.json'));
  await assert.rejects(a.promote({ commit: a.D, yes: true, migrated: ['002-acme.sql'] }), e => e.exitCode === 1 && /holds files plates did not put there/.test(e.message));
  await assert.rejects(a.promote({ commit: a.A, yes: true }), /is earlier than production \(dpl_2, [0-9a-f]{7}\): rolling back is plates promote --back/);
  await assert.rejects(a.promote({ commit: a.F, yes: true }), /is not on green/);
  assert.equal(a.vercel.state.prod, 'dpl_2', 'none of them moved production');
});

// ---- the checks and the rollback -------------------------------------------------------------------

test('each failed check rolls back to the recorded deployment', async t => {
  for (const [check, next, why] of [
    ['revision', { dropRevision: true }, /\/api\/version "commit" is not a string, after 1 read over 0s/],
    ['smoke', { smoke: 500 }, /GET \/: expected 200, got 500/],
    ['errors', { errors: [45_000] }, /1 error logged since 2026-11-03T12:00:01\.000Z, the first: Acme TypeError at 45000ms/],
  ]) {
    const a = await acme(t);
    a.vercel.state.next = next;
    const r = await a.promote({ commit: a.B, yes: true });
    assert.equal(r.exitCode, 1, check);
    assert.equal(r.failed, check);
    assert.match(r.checks.find(c => c.check === check).detail, why, check);
    assert.deepEqual(r.checks.map(c => c.check), check === 'errors' ? ['revision', 'smoke', 'errors'] : ['revision', 'smoke'], `${check}: the checks run in order, the watch only after the others held`);
    // Rolled back to the deployment read before the deploy, and that one is verified serving.
    const calls = a.vercel.state.calls.map(c => c.args.slice(0, 2).join(' '));
    assert.ok(calls.includes('rollback dpl_1'), `${check}: rolled back to dpl_1`);
    assert.equal(calls.lastIndexOf('inspect 127.0.0.1:' + new URL(a.site).port) > calls.indexOf('rollback dpl_1'), true, `${check}: what serves is read after the rollback`);
    assert.deepEqual([r.rolledBack, r.serving.id, a.vercel.state.prod], [true, 'dpl_1', 'dpl_1']);
    assert.match(r.next, new RegExp(`the ${check} check failed on dpl_2 \\([0-9a-f]{7}\\); production is back on dpl_1`));
    assert.match(a.v.promoteVercelText(r), new RegExp(`FAILED ${check} on [0-9a-f]{7}, rolled back to dpl_1`));
    const [rec] = a.records();
    assert.deepEqual([rec.ok, rec.failed, rec.rolledBack, rec.deployment.id, rec.serving.id], [false, check, true, 'dpl_2', 'dpl_1']);
    assert.match(rollbackLine(rec), new RegExp(`^Production rolled back: ${check} failed on \`[0-9a-f]{7}\` \\(dpl_2\\)`));
  }
  // An error the old deployment logged before the new one was ready does not count; the watch reads until its window ends.
  const a = await acme(t);
  a.vercel.state.next = { errors: [-5000, 121_000] };
  const ok = await a.promote({ commit: a.B, yes: true });
  assert.equal(ok.exitCode, 0, JSON.stringify(ok.checks));
  assert.equal(subs(a).filter(s => s === 'logs').length, 13, 'read every 10s across 120s, and once at the end');
  // A rollback that does not take: recorded as failed, the owner's first item.
  const b = await acme(t);
  b.vercel.state.next = { smoke: 500 };
  b.vercel.state.failRollback = true;
  const failed = await b.promote({ commit: b.B, yes: true });
  assert.deepEqual([failed.exitCode, failed.rolledBack, failed.serving.id], [1, 'failed', 'dpl_2']);
  assert.match(failed.next, /the rollback to dpl_1 did not take: .*Production may be serving the failed deploy/);
  const [rec] = b.records();
  assert.equal(rec.rolledBack, 'failed');
  assert.match(rollbackLine(rec), /^Production's rollback FAILED: smoke failed/);
  // A build that fails moves nothing, and so rolls nothing back.
  const c = await acme(t);
  c.vercel.state.next = { buildFails: true };
  const build = await c.promote({ commit: c.B, yes: true });
  assert.deepEqual([build.exitCode, build.failed, build.rolledBack, c.vercel.state.prod], [1, 'deploy', false, 'dpl_1']);
  assert.ok(!subs(c).includes('rollback') && !subs(c).includes('promote'));
});

test('back means the last good deployment', async t => {
  const a = await acme(t);
  assert.equal((await a.promote({ commit: a.B, yes: true })).exitCode, 0);
  assert.equal((await a.promote({ commit: a.D, yes: true, migrated: ['lib/web/migrations/002-acme.sql'] })).exitCode, 0);
  assert.equal(a.vercel.state.prod, 'dpl_3');
  // The owner sees an issue: --back, no commit, no --yes: at once, to B's dpl_2, checked by the exact commit.
  const r = await a.promote({ back: true });
  assert.equal(r.exitCode, 0, JSON.stringify(r.checks));
  assert.deepEqual([r.deployment.id, r.to, r.from.id, a.vercel.state.prod], ['dpl_2', a.B, 'dpl_3', 'dpl_2']);
  assert.deepEqual(r.checks.map(c => [c.check, c.ok]), [['revision', true], ['smoke', true]]);
  assert.ok(a.vercel.state.calls.some(c => c.args[0] === 'rollback' && c.args[1] === 'dpl_2'));
  assert.equal(a.records()[0].action, 'back');
  assert.match(a.v.promoteVercelText(r), /production is back on dpl_2/);
  // Again: further back is the deploy before B's; there is none that passed, so nothing moves.
  await assert.rejects(a.promote({ back: true }), e => e.exitCode === 1 && /no deployment has passed its checks before the one serving \(dpl_2\)/.test(e.message));
  assert.equal(a.vercel.state.prod, 'dpl_2');
  // Forward again, then back with a commit: phase 82's rule, previewed first.
  assert.equal((await a.promote({ commit: a.D, yes: true, migrated: ['002-acme.sql'] })).exitCode, 0);
  const preview = await a.promote({ back: true, commit: a.B });
  assert.deepEqual([preview.exitCode, preview.deployment.id, a.vercel.state.prod], [3, 'dpl_2', 'dpl_4']);
  await assert.rejects(a.promote({ back: true, commit: a.F, yes: true }), /is not on green/);
  await assert.rejects(a.promote({ back: true, commit: a.C, yes: true }), /no deployment of [0-9a-f]{7} passed its checks/);
  assert.equal((await a.promote({ back: true, commit: a.B, yes: true })).exitCode, 0);
  assert.equal(a.vercel.state.prod, 'dpl_2');
  // A deploy that passes closes every rollback before it; one that rolled back is open until then.
  assert.deepEqual(openRollbacks(a.records()), []);
});

test('a deploy waits for its migration', async t => {
  const a = await acme(t);
  assert.equal((await a.promote({ commit: a.B, yes: true })).exitCode, 0);
  // D carries C's new migration since B, the last deploy that passed: refused by name, nothing deployed.
  await assert.rejects(a.promote({ commit: a.D, yes: true }), e => e.exitCode === 1 && /^[0-9a-f]{7} waits for its migration: lib\/web\/migrations\/002-acme\.sql is new since [0-9a-f]{7} .*plates promote --yes --migrated lib\/web\/migrations\/002-acme\.sql; nothing deployed$/.test(e.message));
  assert.equal(subs(a).filter(s => s === 'deploy').length, 1);
  // The owner applied it and says so: it deploys, and the record carries it.
  const r = await a.promote({ commit: a.D, yes: true, migrated: ['lib/web/migrations/002-acme.sql'] });
  assert.equal(r.exitCode, 0, JSON.stringify(r.checks));
  assert.deepEqual(r.migrations, { base: a.B, added: ['lib/web/migrations/002-acme.sql'], migrated: ['lib/web/migrations/002-acme.sql'] });
  // A project's own migrations path.
  const b = await acme(t, { delivery: { migrations: 'db' } });
  assert.equal((await b.promote({ commit: b.D, yes: true })).exitCode, 0, 'nothing new under db/');
  // No deploy has passed and production reports no commit: which migrations are new cannot be told.
  const c = await acme(t);
  c.vercel.state.deployments.dpl_1.commit = null;
  await assert.rejects(c.promote({ commit: c.B, yes: true }), /which migrations [0-9a-f]{7} adds cannot be told: .*--migrations-from <commit>/);
  assert.equal((await c.promote({ commit: c.B, yes: true, migrationsFrom: c.A })).exitCode, 0);
});

// ---- configuration, arguments and the version path ---------------------------------------------------

test('a Vercel target is validated, naming its key', async () => {
  const site = { site: 'https://anvils.acme.example', version: '/api/version' };
  const vercel = { scope: 'acme', checkout: '/srv/acme-deploy' };
  assert.deepEqual(deliveryProblems({ delivery: { promote: 'vercel:anvils', vercel, ...site } }), []);
  assert.deepEqual(deliveryOf({ delivery: { promote: 'vercel:anvils', vercel, ...site, grant: { agentPromote: true, since: '2026-11-03' } } }).promote, { kind: 'vercel', name: 'anvils', ref: null, spec: 'vercel:anvils' });
  for (const [delivery, why] of [
    [{ promote: 'vercel:anvils', ...site }, /"delivery"\.promote is a Vercel target and needs "delivery"\.vercel/],
    [{ promote: 'vercel:Anvils!', vercel, ...site }, /"delivery"\.promote must be .*a Vercel project's name/],
    [{ promote: 'tag:prod', vercel, ...site }, /"delivery"\.vercel is read only with a Vercel target/],
    [{ promote: 'vercel:anvils', vercel: { ...vercel, checkout: 'deploy' }, ...site }, /"delivery"\.vercel\.checkout must be an absolute directory/],
    [{ promote: 'vercel:anvils', vercel: { checkout: '/srv/x' }, ...site }, /"delivery"\.vercel\.scope must be the Vercel team/],
    [{ promote: 'vercel:anvils', vercel: { ...vercel, token: 'x' }, ...site }, /"delivery"\.vercel takes scope, checkout and globalConfig only \(got token\)/],
    [{ promote: 'vercel:anvils', vercel, ...site, migrations: '../db' }, /"delivery"\.migrations must be a directory in the repository/],
    [{ promote: 'vercel:anvils', vercel, ...site, grant: { agentPromote: 'yes', since: '2026-11-03' } }, /"delivery"\.grant\.agentPromote must be true or false/],
    [{ promote: 'vercel:anvils', vercel, ...site, grant: { agentPromote: true, since: '2026-02-30' } }, /"delivery"\.grant\.since must be the date the owner granted it/],
    [{ promote: 'vercel:anvils', vercel, ...site, grant: { agentPromote: true, since: '2026-11-03', scope: 'all' } }, /"delivery"\.grant takes agentPromote and since only/],
  ]) assert.match(deliveryProblems({ delivery }).join('\n'), why, JSON.stringify(delivery));
});

test('the arguments: --back takes an optional commit; --watch, --migrated and --migrations-from are a Vercel target\'s', async t => {
  const { parseArgs } = (await installed(t)).promote;
  assert.deepEqual(parseArgs(['--back']), { commit: null, back: true, yes: false, migrated: [], migrationsFrom: null });
  assert.equal(parseArgs(['--back', 'abc1234', '--yes']).commit, 'abc1234');
  assert.deepEqual(parseArgs(['--yes', '--watch', '30', '--migrated', 'a.sql', '--migrated', 'b.sql']).migrated, ['a.sql', 'b.sql']);
  assert.equal(parseArgs(['--watch', '30']).watch, 30);
  assert.throws(() => parseArgs(['--watch', '9000']), /--watch is seconds/);
  assert.throws(() => parseArgs(['--migrated']), /--migrated needs a value/);
});

test('the Vercel client never reads environment values, and reads what serves production from inspect', async t => {
  const { vercelClient, deploymentOf } = (await installed(t)).vercel;
  const calls = [];
  const c = vercelClient({ scope: 'acme', globalConfig: '/srv/acme-vercel', project: 'anvils', run: args => { calls.push(args); return { status: 0, stdout: JSON.stringify({ id: 'dpl_9', url: 'anvils-9.vercel.app', readyState: 'READY', ready: T0 }) }; } });
  assert.deepEqual(c.serving('https://anvils.acme.example'), { id: 'dpl_9', url: 'https://anvils-9.vercel.app', state: 'READY', readyAt: '2026-11-03T12:00:00.000Z' });
  assert.deepEqual(calls[0], ['inspect', 'anvils.acme.example', '--json', '--scope', 'acme', '--global-config', '/srv/acme-vercel', '--non-interactive', '--no-color']);
  assert.equal(deploymentOf({ deployment: { id: 'dpl_3', url: 'x.vercel.app' } }).id, 'dpl_3', 'deploy --json nests it');
  assert.equal(deploymentOf({ id: 'not-a-deployment' }), null);
  // The record reader refuses what it does not recognise.
  assert.throws(() => deployResults('{"schema":1}\n'), /deploys\.jsonl line 1 is not a deploy record/);
});
