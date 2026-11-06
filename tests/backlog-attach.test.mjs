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
import { attach, attachPreview, checkRoute, sessionBrief, BUILT_ROUTES } from '../lib/attach.mjs';
import { offeredRoutes } from '../lib/web/agents-model.mjs';

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
  assert.deepEqual(BUILT_ROUTES, ['session']);
  // An agent the plate does not list is refused before anything is read.
  await assert.rejects(attach({ root: '/acme', ...target, provider: 'gemini', yes: true }, { claim: () => assert.fail('no claim') }), /--provider gemini is not one of this plate's agents \(claude, codex\)/);
});
