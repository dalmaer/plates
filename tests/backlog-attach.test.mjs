// Attach an agent to a phase (plates phase 181): preview, create-only claim and
// read-back, journal, dispatch, receipt. Two clones of one bare Acme origin on
// this disk; no network, no agent process, no paid workflow: every dispatch
// here is the session route's brief, or a recording stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { attach, attachPreview, attachCommand, checkRoute, sessionBrief, hostBrief, hostState, localHostExecutions, localHostsFile, readLocalHost, BUILT_ROUTES, HOST_STATES } from '../lib/attach.mjs';
import { backlogOf } from '../lib/work-items.mjs';
import { readFile } from 'node:fs/promises';
import { offeredRoutes } from '../lib/web/agents-model.mjs';
import { run } from './helpers/run.mjs';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));

const phase = (title, depends = '[]', status = 'planned', evidence = '[]') => `---
status: ${status}
since: 2026-10-01
goal: G0
depends: ${depends}
note: "Acme."
evidence: ${evidence}
---

# ${title}

## Done when

The anvil lands.

## Scope

Small.

## Acceptance

- [${status === 'built' ? 'x' : ' '}] Lands. \`tests/anvil.test.mjs\`

## Proof

A command.

## Deliberately open

Nothing yet.

## Next action

Build the anvil.
`;
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CONFIG = { name: 'Acme', repo: 'acme/app', practices: ['phases'], agents: { claude: {}, codex: {} } };

/** One bare Acme origin and two clones, `a` and `b`; phase 1 is ready. */
async function acme(t) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-attach-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'), origin = join(dir, 'origin.git');
  const w = async (p, text) => { await mkdir(dirname(join(seed, p)), { recursive: true }); await writeFile(join(seed, p), text); };
  await w('.plates/plates.json', JSON.stringify(CONFIG));
  await w('docs/goals.json', JSON.stringify([{ id: 'G0', title: 'Anvils', outcome: 'They land.' }]));
  await w('docs/evidence/acme-0.md', '# Evidence: phase 0\n');
  await w('docs/phases/00-start.md', phase('Start', '[]', 'built', '["evidence/acme-0.md"]'));
  await w('docs/phases/01-anvil.md', phase('Build the anvil', '[0]'));
  execFileSync('git', ['init', '-q', '-b', 'main', seed]);
  git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'acme');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const a = join(dir, 'a'), b = join(dir, 'b');
  for (const clone of [a, b]) execFileSync('git', ['clone', '-q', origin, clone]);
  // gh lists no open PRs; nothing else is asked of it.
  const gh = join(dir, 'gh');
  await writeFile(gh, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === 'pr' && a[1] === 'list') { console.log('[]'); process.exit(0); }\nconsole.error('gh: offline'); process.exit(1);\n`, { mode: 0o755 });
  const env = (machine, provider) => {
    const e = { ...process.env, PLATES_GH: gh, PLATES_MACHINE: machine, PLATES_PROVIDER: provider, PLATES_SESSION: '' };
    for (const k of Object.keys(e)) if (/^(CLAUDE|CODEX_)/.test(k)) delete e[k];
    return e;
  };
  return { origin, a, b, env };
}
/** A route that records each dispatch and recovery instead of starting anything. */
const recording = () => {
  const calls = { dispatch: 0, recover: 0 };
  return { calls, handlers: { session: { dispatch: async ({ effect }) => { calls.dispatch++; return { state: 'handed', brief: effect.brief.text }; }, recover: async ({ effect }) => { calls.recover++; return { state: 'handed', brief: effect.brief.text, recovered: true }; } } } };
};
const target = { projectId: 'app', phase: 1, title: 'Build the anvil', route: 'session', config: CONFIG };

test('a lost race never dispatches', async t => {
  const x = await acme(t), rec = recording();
  // The preview writes nothing: exit 3, no claim on the origin.
  const preview = await attach({ root: x.a, ...target, provider: 'claude' }, { env: x.env('acme-laptop', 'claude'), handlers: rec.handlers });
  assert.equal(preview.exitCode, 3);
  assert.deepEqual(preview.data.effect.claimRef, 'refs/heads/claims/phase-1');
  assert.throws(() => git(x.origin, 'rev-parse', '--verify', '--quiet', 'refs/heads/claims/phase-1'));
  assert.equal(rec.calls.dispatch, 0);
  // Two attaches to one phase: the first claims and dispatches.
  const won = await attach({ root: x.a, ...target, provider: 'claude', yes: true }, { env: x.env('acme-laptop', 'claude'), handlers: rec.handlers });
  assert.deepEqual([won.exitCode, won.data.state, rec.calls.dispatch], [0, 'attached', 1]);
  assert.match(won.text, /\/spin 1/);
  // The second, from another clone, finds the claim taken: it names the holder and dispatches nothing.
  const lost = await attach({ root: x.b, ...target, provider: 'codex', yes: true }, { env: x.env('acme-desk', 'codex'), handlers: rec.handlers });
  assert.deepEqual([lost.exitCode, lost.data.state, lost.data.holder.provider, lost.data.holder.machine], [1, 'taken', 'claude', 'acme-laptop']);
  assert.match(lost.text, /^Taken by claude on acme-laptop since /m);
  assert.match(lost.text, /Nothing was dispatched\.$/);
  assert.equal(rec.calls.dispatch, 1, 'the loser dispatched nothing');
  // The winner's claim is the only one on the origin, untouched by the loser.
  assert.match(git(x.origin, 'log', '-1', '--format=%B', 'refs/heads/claims/phase-1'), /^Provider: claude$/m);
});

test('dispatch recovers, never repeats', async () => {
  const journal = new Map(), store = { read: async d => journal.get(d) ?? null, write: async (d, v) => { journal.set(d, structuredClone(v)); } };
  let claims = 0;
  const claim = async () => { claims++; return { data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }; };
  const calls = { dispatch: 0, recover: 0 };
  // The first dispatch dies after the intent is journaled: whether it happened is unknown.
  const handlers = { session: { dispatch: async () => { calls.dispatch++; throw new Error('the connection dropped'); }, recover: async ({ effect }) => { calls.recover++; return { state: 'handed', brief: effect.brief.text, recovered: true }; } } };
  await assert.rejects(attach({ root: '/acme', ...target, provider: 'claude', yes: true }, { journal: store, claim, handlers }), /connection dropped/);
  const { digest } = attachPreview({ ...target, provider: 'claude' });
  assert.ok(journal.get(digest).intent, 'the intent was journaled before the dispatch');
  assert.equal(journal.get(digest).receipt, undefined, 'and no receipt: uncertain');
  // Asked again: the journal's intent is recovered. Nothing is claimed or dispatched again.
  const again = await attach({ root: '/acme', ...target, provider: 'claude', yes: true }, { journal: store, claim, handlers });
  assert.deepEqual([again.data.state, again.data.recovered, calls.dispatch, calls.recover, claims], ['attached', true, 1, 1, 1]);
  assert.ok(journal.get(digest).receipt, 'recovery writes the receipt');
  // Asked a third time: the receipt, as it is.
  const third = await attach({ root: '/acme', ...target, provider: 'claude', yes: true }, { journal: store, claim, handlers });
  assert.deepEqual([third.data.repeated, calls.dispatch, calls.recover, claims], [true, 1, 1, 1]);
  // The digest covers the effect: another provider is another attach.
  assert.notEqual(attachPreview({ ...target, provider: 'codex' }).digest, digest);
  assert.equal(attachPreview({ ...target, provider: 'claude' }).digest, digest, 'and the same effect is the same digest');
  assert.equal(attachPreview({ ...target, provider: 'claude' }).effect.brief.text, sessionBrief({ projectId: 'app', phase: 1, title: 'Build the anvil', provider: 'claude' }));
});

test('absent policy is session only', async () => {
  assert.deepEqual(offeredRoutes({}).on, ['session']);
  assert.deepEqual(checkRoute({}, 'session'), ['session']);
  assert.throws(() => checkRoute({}, 'tonight'), /route tonight is off: not in policy \(no "backlog" key: session only\) \(backlog\.routes\)/);
  assert.throws(() => checkRoute({}, 'robot'), /route robot is off: robot\.on is not true/);
  assert.throws(() => checkRoute({}, 'worker'), /route worker is off: durable workers are disabled/);
  // A policy that lists tonight offers it; this build does not start it yet, and says so.
  assert.throws(() => checkRoute({ backlog: { routes: ['session', 'tonight'] } }, 'tonight'), /route tonight is offered by this plate's policy but not built yet/);
  assert.throws(() => checkRoute({ backlog: { routes: ['tonight'] } }, 'session'), /route session is off: not in backlog\.routes/);
  assert.deepEqual(BUILT_ROUTES, ['session', 'local-host']);
  // An agent the plate does not list is refused before anything is read.
  await assert.rejects(attach({ root: '/acme', ...target, provider: 'gemini', yes: true }, { claim: () => assert.fail('no claim') }), /--provider gemini is not one of this plate's agents \(claude, codex\)/);
});

test('plates home --attach previews, then claims and hands over the session brief', async t => {
  const x = await acme(t);
  const plates = (args, env) => { const r = run(process.execPath, [BIN, 'home', ...args], { cwd: x.a, env }); return { code: r.status, out: r.stdout, err: r.stderr }; };
  const env = x.env('acme-laptop', 'claude');
  const preview = plates(['--attach', 'app:phase:1', '--route', 'session', '--json'], env);
  assert.equal(preview.code, 3, preview.err);
  assert.equal(JSON.parse(preview.out).state, 'preview');
  assert.throws(() => git(x.origin, 'rev-parse', '--verify', '--quiet', 'refs/heads/claims/phase-1'), 'a preview claims nothing');
  const done = plates(['--attach', 'app:phase:1', '--route', 'session', '--provider', 'claude', '--yes'], env);
  assert.equal(done.code, 0, done.err);
  assert.match(done.out, /^ {2}\/spin 1$/m);
  assert.match(git(x.origin, 'log', '-1', '--format=%B', 'refs/heads/claims/phase-1'), /^Provider: claude$/m);
  // A second --yes finds the receipt: nothing is claimed or handed over again.
  assert.match(plates(['--attach', 'app:phase:1', '--route', 'session', '--provider', 'claude', '--yes'], env).out, /Already attached at /);
  // Refusals: a route off by policy, a key for another plate, a phase not ready, a usage error.
  for (const [args, code, says] of [[['--attach', 'app:phase:1', '--route', 'tonight', '--yes'], 2, /route tonight is off/], [['--attach', 'forge:phase:1', '--route', 'session'], 2, /forge's; this checkout is app/],
    [['--attach', 'app:phase:0', '--route', 'session'], 1, /not ready to build/], [['--attach', 'app:phase:1'], 2, /--attach <key> --route <r>/]]) {
    const r = plates(args, env);
    assert.equal(r.code, code, `${args.join(' ')}: ${r.out}${r.err}`); assert.match(r.out + r.err, says);
  }
});

// ---- phase 183: the local-host route ------------------------------------------------
const LOCAL = { ...CONFIG, backlog: { routes: ['session', 'local-host'] } };
/**
 * A fake local agent host in the test's temp dir: it records its argv, cwd,
 * environment and stdin, prints a session id, and answers a state query from a
 * file the test writes. It starts no agent.
 */
async function fakeHost(dir, { state = true, session = 'acme-session-1' } = {}) {
  const host = join(dir, 'host.cjs'), log = join(dir, 'host-log');
  await mkdir(log, { recursive: true });
  await writeFile(host, `#!${process.execPath}
const { writeFileSync, readFileSync, existsSync } = require('node:fs');
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'state') { const f = ${JSON.stringify(join(log, 'state'))}; process.stdout.write(existsSync(f) ? readFileSync(f, 'utf8') : ''); process.exit(0); }
const chunks = []; process.stdin.on('data', c => chunks.push(c)); process.stdin.on('end', () => {
  const n = existsSync(${JSON.stringify(join(log, 'runs'))}) ? Number(readFileSync(${JSON.stringify(join(log, 'runs'))}, 'utf8')) : 0;
  writeFileSync(${JSON.stringify(join(log, 'runs'))}, String(n + 1));
  writeFileSync(${JSON.stringify(join(log, 'stdin'))}, Buffer.concat(chunks));
  writeFileSync(${JSON.stringify(join(log, 'call.json'))}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: Object.keys(process.env) }));
  console.log(${JSON.stringify(session)});
});
`, { mode: 0o755 });
  const config = join(dir, 'xdg');
  await mkdir(join(config, 'plates'), { recursive: true });
  await writeFile(join(config, 'plates', 'local-hosts.json'), JSON.stringify({ hosts: { claude: { start: [host, 'start'], ...(state ? { state: [host, 'state'] } : {}) } } }));
  return { log, config, runs: async () => Number(await readFile(join(log, 'runs'), 'utf8').catch(() => '0')) };
}
const hostEnvFor = (x, h) => ({ ...x.env('acme-laptop', 'claude'), XDG_CONFIG_HOME: h.config, GH_TOKEN: 'not-a-real-token', PLATES_SECRET_TEST: 'x' });
async function localAcme(t) {
  const x = await acme(t);
  await writeFile(join(x.a, '.plates', 'plates.json'), JSON.stringify(LOCAL));
  git(x.a, 'add', '-A'); git(x.a, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'local-host');
  return x;
}

test('local host brief matches its preview', async t => {
  const x = await localAcme(t), h = await fakeHost(dirname(x.a));
  const env = hostEnvFor(x, h);
  const preview = await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude' }, { env });
  assert.equal(preview.exitCode, 3);
  const brief = preview.data.effect.brief.text;
  // The brief carries Done when, Acceptance and the current decisions, and the preview prints it whole.
  assert.match(brief, /^## Done when\n\nThe anvil lands\.\n/m);
  assert.match(brief, /^## Acceptance\n\n- \[ \] Lands\. `tests\/anvil\.test\.mjs`\n/m);
  assert.match(brief, /^## Current decisions \(decision context: not-configured, digest [0-9a-f]{64}\)\n\nNone accepted\.$/m);
  assert.ok(preview.text.includes(brief), 'the preview shows the exact bytes');
  assert.equal(await h.runs(), 0, 'a preview runs no host');
  assert.throws(() => git(x.origin, 'rev-parse', '--verify', '--quiet', 'refs/heads/claims/phase-1'));
  // Attached: claimed with the host's provider name, the host run once in the checkout with the checkout path, the brief on stdin byte for byte.
  const done = await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { env });
  assert.deepEqual([done.exitCode, done.data.state, done.data.receipt.result.session], [0, 'attached', 'acme-session-1']);
  assert.equal(done.data.digest, preview.data.digest, 'the same effect as previewed');
  assert.deepEqual(await readFile(join(h.log, 'stdin')), Buffer.from(brief), 'byte-identical to the preview');
  assert.equal(done.data.effect.brief.sha256, (await import('node:crypto')).createHash('sha256').update(await readFile(join(h.log, 'stdin'))).digest('hex'));
  const call = JSON.parse(await readFile(join(h.log, 'call.json'), 'utf8'));
  assert.deepEqual(call.argv, ['start', x.a]);
  assert.equal(await (await import('node:fs/promises')).realpath(call.cwd), await (await import('node:fs/promises')).realpath(x.a));
  assert.ok(!call.env.includes('GH_TOKEN') && !call.env.includes('PLATES_SECRET_TEST') && !call.env.includes('PLATES_GH'), 'no token or plates setting passes to the host');
  assert.match(git(x.origin, 'log', '-1', '--format=%B', 'refs/heads/claims/phase-1'), /^Provider: claude$/m);
  // Asked again: the receipt; the host is never run twice. A moved phase (another digest) is refused, not run again.
  assert.equal((await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { env })).data.repeated, true);
  const moved = await attach({ root: x.a, projectId: 'app', phase: 1, title: 'Build the anvil', route: 'local-host', provider: 'claude', config: LOCAL, yes: true, phaseText: { doneWhen: 'x', acceptance: 'y', context: {} }, host: await readLocalHost({ root: x.a, provider: 'claude', env }) }, { env });
  assert.deepEqual([moved.exitCode, moved.data.state], [1, 'already-dispatched']);
  assert.equal(await h.runs(), 1, 'the host ran exactly once');
  // Accepted decisions are listed with who decided them; proposals are marked undecided.
  const withDecisions = hostBrief({ projectId: 'app', phase: 1, title: 'Build the anvil', provider: 'claude', doneWhen: 'x', acceptance: 'y',
    context: { state: 'complete', digest: 'd'.repeat(64), decisions: [{ ref: 'docs/decisions/anvil.md#weight', scope: ['phase:1'], statement: 'Anvils weigh 50 kg.', decided_by: 'owner', decided_at: '2026-11-01' }], proposals: [{ ref: 'docs/decisions/anvil.md#colour', scope: ['phase:1'], statement: 'Paint them red.' }] } });
  assert.match(withDecisions, /^- docs\/decisions\/anvil\.md#weight \(phase:1\): Anvils weigh 50 kg\. \(decided by owner on 2026-11-01\)\n\nProposed, not decided:\n- docs\/decisions\/anvil\.md#colour \(phase:1\): Paint them red\.$/m);
  // An uncertain run (intent, no receipt) is recovered without running the host.
  const journal = new Map(), store = { read: async d => journal.get(d) ?? null, write: async (d, v) => { journal.set(d, structuredClone(v)); } };
  const args = { root: x.a, projectId: 'app', phase: 1, title: 'Build the anvil', route: 'local-host', provider: 'claude', config: LOCAL, yes: true, phaseText: { doneWhen: 'x', acceptance: 'y', context: {} }, host: { file: 'f', start: ['/nonexistent/host'], state: null } };
  const claim = async () => ({ data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' });
  await assert.rejects(attach(args, { journal: store, claim, env }), /could not run/);
  const again = await attach(args, { journal: store, claim, env });
  assert.deepEqual([again.data.state, again.data.receipt.result.state], ['attached', 'uncertain']);
});

test('local host needs the policy', async t => {
  const x = await acme(t);
  assert.ok(!(await import('../lib/web/agents-model.mjs')).offeredRoutes(CONFIG).on.includes('local-host'));
  assert.throws(() => checkRoute(CONFIG, 'local-host'), /route local-host is off: not in policy/);
  // Refused before any host configuration is read, and nothing is claimed.
  await assert.rejects(attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude' }, { env: x.env('acme-laptop', 'claude'), readHost: () => assert.fail('no host is read') }), /route local-host is off/);
  assert.deepEqual(checkRoute(LOCAL, 'local-host'), ['session', 'local-host']);
  // The configuration is the owner's private file outside any repo: a missing one names where it goes, and one inside the checkout is refused.
  assert.equal(localHostsFile({ XDG_CONFIG_HOME: '/cfg' }), '/cfg/plates/local-hosts.json');
  assert.equal(localHostsFile({ HOME: '/home/o' }), '/home/o/.config/plates/local-hosts.json');
  await assert.rejects(readLocalHost({ root: x.a, provider: 'claude', env: { XDG_CONFIG_HOME: join(dirname(x.a), 'none') } }), /no local agent host is configured: write .*local-hosts\.json/);
  await assert.rejects(readLocalHost({ root: x.a, provider: 'claude', env: { XDG_CONFIG_HOME: join(x.a, '.config') } }), /inside this checkout/);
});

test('a silent host is never running', async t => {
  const x = await localAcme(t);
  // A host with no state query: attached, and its card says claimed.
  const silent = await fakeHost(join(dirname(x.a), 'silent'), { state: false });
  const env = hostEnvFor(x, silent);
  assert.equal((await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { env })).exitCode, 0);
  assert.deepEqual(await localHostExecutions(x.a, { env }), [], 'no state command: no execution source');
  // A host whose state query answers nothing, or a word it may not say, is silent too.
  assert.equal(await hostState({ state: [process.execPath, '-e', 'process.stdout.write("busy")'], session: 's1' }), null);
  assert.equal(await hostState({ state: [process.execPath, '-e', ''], session: 's1' }), null);
  assert.equal(await hostState({ state: [process.execPath, '-e', 'process.exit(1)'], session: 's1' }), null);
  for (const word of HOST_STATES) assert.equal(await hostState({ state: [process.execPath, '-e', `process.stdout.write(${JSON.stringify(word + '\n')})`], session: 's1' }), word);
  // On the card: claimed with no source, a reported state with its source.
  const card = executions => backlogOf({ docket: [], lists: {}, projects: [{ id: 'app', name: 'Acme', state: 'complete' }] },
    [{ projectId: 'app', phases: [{ id: 1, file: '01-anvil.md', title: 'Build the anvil', status: 'planned', goal: 'G0', depends: [], spec: 2 }], goals: [{ id: 'G0' }], free: [], behind: [],
      claimed: [{ id: 1, title: 'Build the anvil', holder: { by: 'branch', provider: 'claude', machine: 'acme-laptop', at: '2026-11-06T08:00:00.000Z' } }], executions, claims: { read: true, prs: false } }],
    { now: Date.parse('2026-11-06T09:00:00Z') }).lanes.find(l => l.lane === 'in-flight').items[0];
  assert.deepEqual([card(await localHostExecutions(x.a, { env })).presence, card([]).presenceSource], ['claimed', 'claim branch']);
  // The same host with a state query that answers: its state is the presence, with its source; it never says running unless it does.
  const answering = await localHostExecutions(x.a, { env, query: async () => 'waiting' });
  assert.deepEqual(answering, [{ phase: 1, state: 'waiting', source: 'local host claude, session acme-session-1' }]);
  assert.deepEqual([card(answering).presence, card(answering).presenceSource], ['waiting', 'local host claude, session acme-session-1']);
  assert.equal((await localHostExecutions(x.a, { env, query: async () => null })).length, 0);
});
