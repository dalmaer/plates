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
import { attach, attachJournal, attachPreview, attachCommand, cancelAttach, checkRoute, sessionBrief, hostBrief, hostState, runHost, localHostExecutions, localHostsFile, readLocalHost, BUILT_ROUTES, HOST_STATES } from '../lib/attach.mjs';
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

test('plates home --cancel previews, records the cancel once, and a restarted session checks it', async t => {
  const x = await acme(t);
  const plates = (args, env) => { const r = run(process.execPath, [BIN, 'home', ...args], { cwd: x.a, env }); return { code: r.status, out: r.stdout, err: r.stderr }; };
  const env = x.env('acme-laptop', 'claude');
  assert.equal(plates(['--cancel', 'app:phase:1', '--check'], env).code, 0, 'nothing attached is not cancelled');
  assert.match(plates(['--cancel', 'app:phase:1', '--yes'], env).out + plates(['--cancel', 'app:phase:1', '--yes'], env).err, /no attach in this checkout's journal: nothing to cancel/);
  assert.equal(plates(['--attach', 'app:phase:1', '--route', 'session', '--provider', 'claude', '--yes'], env).code, 0);
  const check = () => plates(['--cancel', 'app:phase:1', '--check', '--json'], env);
  assert.deepEqual([check().code, JSON.parse(check().out).state], [0, 'not-cancelled']);
  const preview = plates(['--cancel', 'app:phase:1'], env);
  assert.equal(preview.code, 3, preview.err);
  assert.match(preview.out, /Nothing is cancelled yet/);
  assert.equal(check().code, 0, 'a preview records nothing');
  const done = plates(['--cancel', 'app:phase:1', '--why', 'Built elsewhere', '--yes', '--json'], env);
  assert.equal(done.code, 0, done.err);
  const first = JSON.parse(done.out);
  assert.deepEqual([first.state, first.already, first.attaches[0].cancelled.stop, first.attaches[0].cancelled.done], ['cancelled', false, 'none', true]);
  assert.equal(first.attaches[0].cancel.why, 'Built elsewhere');
  // A restarted session's check: exit 1, stop.
  const after = check();
  assert.equal(after.code, 1);
  assert.match(plates(['--cancel', 'app:phase:1', '--check'], env).out, /cancelled at .*Built elsewhere.*Stop: do not continue/);
  // A second cancel, and attach again with the same brief: the one record, nothing handed over again.
  const again = JSON.parse(plates(['--cancel', 'app:phase:1', '--yes', '--json'], env).out);
  assert.deepEqual([again.already, again.attaches[0].cancel], [true, first.attaches[0].cancel]);
  const re = plates(['--attach', 'app:phase:1', '--route', 'session', '--provider', 'claude', '--yes'], env);
  assert.equal(re.code, 1);
  assert.match(re.out, /This attach was cancelled at .*It is not dispatched again/);
  assert.doesNotMatch(re.out, /\/spin 1/);
  for (const [args, says] of [[['--cancel', 'app:phase:1', '--check', '--yes'], /--cancel <key> \[--check/], [['--cancel'], /--cancel needs a value/], [['--cancel', 'forge:phase:1', '--check'], /forge's; this checkout is app/], [['--cancel', 'app:phase:1', '--why', 'a\tb', '--yes'], /--why is one line/]]) {
    const r = plates(args, env);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}${r.err}`); assert.match(r.out + r.err, says);
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

test('local-host attach hands distinct usable claim ownership to the launched worker while scrubbing credentials', async t => {
  const x = await localAcme(t);
  await writeFile(join(x.a, 'docs', 'phases', '02-rocket.md'), phase('Build the rocket', '[0]'));
  await writeFile(join(x.a, 'docs', 'phases', '03-sled.md'), phase('Build the sled', '[0]'));
  git(x.a, 'add', '-A'); git(x.a, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'phases 2 and 3');
  git(x.a, 'push', '-q', 'origin', 'HEAD:main');
  git(x.b, 'pull', '-q', '--ff-only', 'origin', 'main');

  const dir = join(dirname(x.a), 'ownership'), host = join(dir, 'host.cjs'), callsFile = join(dir, 'calls.jsonl');
  await mkdir(join(dir, 'xdg', 'plates'), { recursive: true });
  await writeFile(host, `#!${process.execPath}
const { appendFileSync } = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({ env: process.env }) + '\\n');
  console.log('acme-worker-host');
});
`, { mode: 0o755 });
  await writeFile(join(dir, 'xdg', 'plates', 'local-hosts.json'), JSON.stringify({ hosts: { claude: { start: [host, 'start'] } } }));
  const readCalls = async () => (await readFile(callsFile, 'utf8')).trim().split('\n').map(l => JSON.parse(l));

  // Case 1: launcher has a parent session and credentials; phase 1 is unclaimed.
  const launcherEnv = {
    ...x.env('acme-laptop', 'claude'),
    HOME: dir,
    PLATES_SESSION: 'acme-parent-session',
    CLAUDE_CODE_SESSION_ID: 'acme-parent-claude',
    XDG_CONFIG_HOME: join(dir, 'xdg'),
    GH_TOKEN: 'acme-secret-token',
    PLATES_SECRET_TEST: 'acme-secret',
  };
  const attached1 = await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { env: launcherEnv });
  assert.equal(attached1.exitCode, 0, attached1.text);
  assert.match(attached1.data.receipt.claim.token ?? '', /^[0-9a-f]{32}$/, 'retained claim metadata keeps the token');
  const [firstCall] = await readCalls();
  for (const forbidden of ['GH_TOKEN', 'PLATES_SECRET_TEST', 'PLATES_GH', 'CLAUDE_CODE_SESSION_ID', 'XDG_CONFIG_HOME']) {
    assert.ok(!(forbidden in firstCall.env), `${forbidden} is scrubbed from the launched host`);
  }
  assert.equal(firstCall.env.PLATES_PROVIDER, 'claude');
  assert.ok(firstCall.env.PLATES_SESSION && firstCall.env.PLATES_SESSION !== 'acme-parent-session', 'launched worker gets a distinct stable identity');
  assert.equal(attached1.data.receipt.claim.session, firstCall.env.PLATES_SESSION);

  // Inside the launched worker (even with its own native CLAUDE_CODE_SESSION_ID), claim resume and release succeed without --token.
  const baseEnv = x.env('acme-laptop', 'claude');
  const worker1Env = { ...firstCall.env, PLATES_GH: baseEnv.PLATES_GH, PLATES_MACHINE: 'acme-laptop', CLAUDE_CODE_SESSION_ID: 'claude-native-worker-1' };
  const resumed1 = run(process.execPath, [BIN, 'phase', 'claim', '1', '--json'], { cwd: x.a, env: worker1Env });
  assert.equal(resumed1.status, 0, resumed1.stdout + resumed1.stderr);
  assert.deepEqual([JSON.parse(resumed1.stdout).held, JSON.parse(resumed1.stdout).holder.mine], [true, true]);

  // Neither the parent launcher nor a session-less caller in the same tree owns the worker's claim without --token.
  for (const outsider of [launcherEnv, { ...baseEnv, PLATES_SESSION: '' }]) {
    assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '1', '--json'], { cwd: x.a, env: outsider }).status, 1);
    assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '1', '--release', '--json'], { cwd: x.a, env: outsider }).status, 1);
  }
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '1', '--release', '--json'], { cwd: x.a, env: worker1Env }).status, 0);

  // Case 2: phase 2 is pre-claimed by the launcher; competing attaches race #484's slot/intent, and only the dispatch winner binds its worker session.
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '2', '--provider', 'claude', '--json'], { cwd: x.a, env: launcherEnv }).status, 0);
  const hostCfg = await readLocalHost({ root: x.a, provider: 'claude', env: launcherEnv });
  const base2 = { root: x.a, projectId: 'app', phase: 2, title: 'Build the rocket', route: 'local-host', provider: 'claude', config: LOCAL, yes: true, host: hostCfg };
  const [d1, d2] = await Promise.all([
    attach({ ...base2, phaseText: { doneWhen: 'Rocket v1.', acceptance: '- [ ] Lands.', context: {} } }, { env: launcherEnv }),
    attach({ ...base2, phaseText: { doneWhen: 'Rocket v2.', acceptance: '- [ ] Lands.', context: {} } }, { env: launcherEnv }),
  ]);
  const won2 = [d1, d2].find(r => r.exitCode === 0), lost2 = [d1, d2].find(r => r.exitCode === 1);
  assert.ok(won2 && lost2 && lost2.data.state === 'already-dispatched', 'one attach wins the host slot; the competitor is refused');
  const callsAfter2 = await readCalls();
  assert.equal(callsAfter2.length, 2, 'only the slot winner ran the host');
  const secondCall = callsAfter2[1];
  assert.notEqual(secondCall.env.PLATES_SESSION, firstCall.env.PLATES_SESSION, 'parallel workers never share one identity');
  assert.notEqual(secondCall.env.PLATES_SESSION, 'acme-parent-session');
  const worker2Env = { ...secondCall.env, PLATES_GH: baseEnv.PLATES_GH, PLATES_MACHINE: 'acme-laptop', CODEX_THREAD_ID: 'codex-native-worker-2' };
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '2', '--json'], { cwd: x.a, env: worker2Env }).status, 0, 'slot winner owns the rebound claim');
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '2', '--json'], { cwd: x.a, env: launcherEnv }).status, 1, 'launcher relinquished session ownership to the worker');
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '2', '--release', '--json'], { cwd: x.a, env: worker2Env }).status, 0);

  // If a cancel wins #484's fate decision before dispatch starts, the launcher keeps its pre-existing claim.
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '3', '--provider', 'claude', '--json'], { cwd: x.a, env: launcherEnv }).status, 0);
  const jDir = join(dir, 'cancel-journal'), baseJournal = attachJournal(jDir);
  let cancelledOnce = false;
  const cancellingJournal = {
    ...baseJournal,
    intent: async (d, v) => {
      const r = await baseJournal.intent(d, v);
      if (!cancelledOnce) { cancelledOnce = true; await cancelAttach({ root: x.a, projectId: 'app', phase: 3, yes: true }, { journal: baseJournal, env: launcherEnv }); }
      return r;
    },
  };
  const stopped3 = await attach({ ...base2, phase: 3, title: 'Build the sled', phaseText: { doneWhen: 'Sled.', acceptance: '- [ ] Lands.', context: {} } }, { journal: cancellingJournal, env: launcherEnv });
  assert.deepEqual([stopped3.exitCode, stopped3.data.state], [1, 'cancelled']);
  assert.equal((await readCalls()).length, 2, 'cancelled attach did not start the host');
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '3', '--json'], { cwd: x.a, env: launcherEnv }).status, 0, 'unstarted cancelled attach did not rebind the caller claim');
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '3', '--release', '--json'], { cwd: x.a, env: launcherEnv }).status, 0);

  // Case 3: launcher has no session at all (plain shell) in clone b; launched worker still owns and releases its claim.
  const sessionlessLauncher = { ...baseEnv, HOME: dir, PLATES_SESSION: '', XDG_CONFIG_HOME: join(dir, 'xdg') };
  const attachedB = await attachCommand({ root: x.b, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { env: sessionlessLauncher });
  assert.equal(attachedB.exitCode, 0, attachedB.text);
  const [, , thirdCall] = await readCalls();
  const workerBEnv = { ...thirdCall.env, PLATES_GH: baseEnv.PLATES_GH, PLATES_MACHINE: 'acme-laptop' };
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '1', '--json'], { cwd: x.b, env: workerBEnv }).status, 0);
  assert.equal(run(process.execPath, [BIN, 'phase', 'claim', '1', '--release', '--json'], { cwd: x.b, env: workerBEnv }).status, 0);
});

test('a local-host cancel during a real claim leaves the printed release instruction usable by the launcher', async t => {
  const x = await localAcme(t), h = await fakeHost(join(dirname(x.a), 'cancel-host'));
  const env = { ...hostEnvFor(x, h), PLATES_SESSION: 'acme-launcher' };
  const journalDir = join(dirname(x.a), 'cancel-journal'), journal = attachJournal(journalDir);
  // Git calls this hook inside claim(), after the local token is kept and before its push.
  const hook = join(x.a, '.git', 'hooks', 'pre-push');
  await writeFile(hook, `#!${process.execPath}
(async () => {
  const { attachJournal, cancelAttach } = await import(${JSON.stringify(new URL('../lib/attach.mjs', import.meta.url).href)});
  const result = await cancelAttach({ root: ${JSON.stringify(x.a)}, projectId: 'app', phase: 1, yes: true, why: 'mid-claim' }, { journal: attachJournal(${JSON.stringify(journalDir)}) });
  if (result.exitCode !== 0) throw new Error(result.text);
})().catch(error => { console.error(error); process.exitCode = 1; });
`, { mode: 0o755 });
  const stopped = await attachCommand({ root: x.a, key: 'app:phase:1', route: 'local-host', provider: 'claude', yes: true }, { journal, env });
  await rm(hook);
  assert.deepEqual([stopped.exitCode, stopped.data.state], [1, 'cancelled']);
  assert.match(stopped.text, /mid-claim.*while it was being claimed/);
  assert.equal(await h.runs(), 0, 'nothing was dispatched');
  assert.equal((await journal.list()).length, 0, 'the cancel preceded the intent');
  const release = /release the claim with plates (phase claim 1 --release)\./.exec(stopped.text);
  assert.ok(release, stopped.text);
  const released = run(process.execPath, [BIN, ...release[1].split(' '), '--json'], { cwd: x.a, env });
  assert.equal(released.status, 0, released.stdout + released.stderr);
  assert.equal(git(x.a, 'ls-remote', 'origin', 'refs/heads/claims/phase-1'), '', 'the printed command released the claim');
});

test('a background worker writes progress and completes after the host timeout settles', async t => {
  const x = await localAcme(t), dir = join(dirname(x.a), 'output-probe');
  await mkdir(dir);
  for (const route of ['runHost', 'attach']) {
    const marker = join(dir, `${route}.done`), pidFile = join(dir, `${route}.pid`);
    const worker = join(dir, `${route}-worker.sh`), host = join(dir, `${route}-host.sh`);
    await writeFile(worker, `#!/bin/sh
set -e
sleep 1
echo progress
echo progress >&2
echo complete > ${JSON.stringify(marker)}
`, { mode: 0o755 });
    await writeFile(host, `#!/bin/sh
${JSON.stringify(worker)} &
echo $! > ${JSON.stringify(pidFile)}
wait
`, { mode: 0o755 });
    t.after(async () => {
      const pid = Number(await readFile(pidFile, 'utf8').catch(() => ''));
      if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* exited */ } }
    });
    const start = Date.now();
    const pending = route === 'runHost'
      ? runHost([host], { cwd: dir, timeoutMs: 300, stderr: true })
      : attach({ root: x.a, projectId: 'app', phase: 1, title: 'Build the anvil', route: 'local-host', provider: 'claude', config: LOCAL, yes: true,
        phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} },
        host: { file: join(dir, 'local-hosts.json'), start: [host], state: null, harness: null } },
      { env: x.env('acme-laptop', 'claude'), timeoutMs: 300 });
    await assert.rejects(pending, /ran past its bound \(300 ms/);
    assert.ok(Date.now() - start < 2500, `${route} settled promptly`);
    assert.equal(await readFile(marker, 'utf8').catch(() => null), null, 'the worker has not completed when the timeout settles');
    // Keep the caller alive to prove its timeout cleanup leaves inherited writers usable.
    const until = Date.now() + 3000;
    while (Date.now() < until && !await readFile(marker, 'utf8').catch(() => null)) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(await readFile(marker, 'utf8').catch(() => null), 'complete\n', `${route}: progress writes did not break the worker's pipes`);
  }
});

test('host timeouts settle at the deadline without waiting for descendant pipes or stopping launched work, retaining uncertain dispatch', async t => {
  const x = await localAcme(t);
  const dir = join(dirname(x.a), 'timeout-probe');
  await mkdir(dir, { recursive: true });
  const pidsFile = join(dir, 'descendants.txt'), runsFile = join(dir, 'runs.txt'), slowHost = join(dir, 'slow-host.sh');
  await writeFile(slowHost, `#!/bin/sh
echo 1 >> ${JSON.stringify(runsFile)}
sleep 4 &
echo $! >> ${JSON.stringify(pidsFile)}
sleep 6
`, { mode: 0o755 });
  t.after(async () => {
    const raw = await readFile(pidsFile, 'utf8').catch(() => '');
    for (const line of raw.split('\n').filter(Boolean)) { try { process.kill(Number(line), 'SIGKILL'); } catch { /* exited */ } }
  });

  // Direct runHost + hostState with a descendant holding stdout and stderr open for 4000 ms settles promptly at the 300 ms deadline.
  const t0 = Date.now();
  await assert.rejects(runHost([slowHost], { cwd: dir, timeoutMs: 300, stderr: true }), /ran past its bound \(300 ms/);
  const elapsedRun = Date.now() - t0;
  assert.ok(elapsedRun < 2000, `runHost settled in ${elapsedRun} ms without waiting for the 4000 ms descendant pipe`);
  const firstDescendant = Number((await readFile(pidsFile, 'utf8')).trim().split('\n')[0]);
  let alive = false;
  try { process.kill(firstDescendant, 0); alive = true; } catch { alive = false; }
  assert.equal(alive, true, 'wrapper cleanup does not kill work the host already launched');

  const t1 = Date.now();
  assert.equal(await hostState({ state: [slowHost], session: 'acme-s1', env: { ...process.env, HOME: dir }, timeoutMs: 300 }), null);
  assert.ok(Date.now() - t1 < 2000, 'state inspection settles at the deadline despite inherited pipes');

  // Attach with local-host: timeout retains an uncertain dispatch in the #484 journal (intent + fate: dispatch, no receipt) and never reruns.
  const attachRuns = join(dir, 'attach-runs.txt'), attachHost = join(dir, 'attach-host.sh');
  await writeFile(attachHost, `#!/bin/sh
echo 1 >> ${JSON.stringify(attachRuns)}
sleep 4 &
echo $! >> ${JSON.stringify(pidsFile)}
sleep 6
`, { mode: 0o755 });
  const env = { ...x.env('acme-laptop', 'claude'), HOME: dir };
  const jDir = join(dir, 'journal'), journal = attachJournal(jDir);
  const hostCfg = { file: join(dir, 'local-hosts.json'), start: [attachHost], state: null, harness: null };
  const args = { root: x.a, projectId: 'app', phase: 1, title: 'Build the anvil', route: 'local-host', provider: 'claude', config: LOCAL, yes: true, phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} }, host: hostCfg };
  const { digest } = attachPreview({ ...args, plate: 'Acme' });

  const t2 = Date.now();
  await assert.rejects(attach(args, { journal, env, timeoutMs: 300 }), /ran past its bound \(300 ms/);
  assert.ok(Date.now() - t2 < 2500, 'attach settles promptly when the host command times out');
  assert.equal((await readFile(attachRuns, 'utf8')).trim().split('\n').length, 1);
  const afterTimeout = await journal.read(digest);
  assert.ok(afterTimeout?.intent && !afterTimeout?.receipt, 'intent stays journaled with no receipt');
  assert.equal(JSON.parse(await readFile(join(jDir, `${digest}.fate.json`), 'utf8')).fate, 'dispatch', 'fate records dispatch');

  const recovered = await attach(args, { journal, env, timeoutMs: 300 });
  assert.deepEqual([recovered.exitCode, recovered.data.recovered, recovered.data.receipt.result.state], [0, true, 'uncertain']);
  const moved = await attach({ ...args, phaseText: { doneWhen: 'Changed.', acceptance: '- [ ] Lands.', context: {} } }, { journal, env, timeoutMs: 300 });
  assert.deepEqual([moved.exitCode, moved.data.state], [1, 'already-dispatched']);
  const cancelled = await cancelAttach({ root: x.a, projectId: 'app', phase: 1, yes: true }, { journal, env, readHost: async () => hostCfg });
  assert.equal(cancelled.data.attaches[0].cancelled.stop, 'unknown', 'cancel after uncertain timeout never claims nothing started');
  assert.equal((await readFile(attachRuns, 'utf8')).trim().split('\n').length, 1, 'host is never run again after uncertain timeout');
});
