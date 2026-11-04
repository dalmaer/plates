// Phase 162: the overnight decision envelope (lib/night-decisions.mjs) and its journal (lib/night-journal.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm, readFile, symlink, appendFile } from 'node:fs/promises';
import { run } from './helpers/run.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  validateEnvelope, readEnvelope, contextProblems, assertEnvelope, isUnknown, unknown,
  EnvelopeError, ENVELOPE_SCHEMA, FOLLOW_UPS,
} from '../lib/night-decisions.mjs';
import { validatePlan, defaultPlan, PLAN_FIELDS, ITEM_FIELDS } from '../lib/night-plan.mjs';
import { collectDecisions, loopProblems, OUTCOMES } from '../lib/decision-loop.mjs';
import { appendEnvelope, readJournal, parseJournal, resumeStep, revisionProblem, keyOf, journalOf, JournalError } from '../lib/night-journal.mjs';

const SRC = 'a'.repeat(40), FIX = 'b'.repeat(40);
const clone = v => structuredClone(v);

// Acme's night: one build item and one triage item, as plates night plan writes them.
const acmePlan = () => ({
  schema: 1, date: '2026-11-04', shapedBy: 'owner', readyBy: '2026-11-05T07:00:00Z',
  willNotTouch: ['.github/workflows/', 'anvil.config.json'], settledToday: ['Anvils stay iron'], leftOpen: [],
  items: [
    { id: 'anvil-drops', title: 'Halve Acme anvil drops', kind: 'build', source: 'health:anvil_drops', number: { measure: 'anvil_drops', bound: 2, better: 'lower' }, lane: 'climb:anvils', budget: { minutes: 30 }, status: 'done', result: { note: 'drops 4 to 2', link: 'docs/health/2026-11-04.md' } },
    { id: 'anvil-colour', title: 'Pick the anvil colour', kind: 'triage', source: 'owner', number: null, lane: 'night', budget: null, status: 'left-alone', result: { note: 'parked: needs the owner' } },
  ],
});

// A chosen reversible choice: the retry limit for the anvil build, with a measured consequence.
const chosen = () => ({
  schema: 1, id: 'acme-retry-limit', night: '2026-11-04', planItem: 'anvil-drops',
  operation: { id: 'op-acme-0001', attempts: ['op-acme-0001-a1'] },
  sourceRevision: SRC,
  authority: [{ kind: 'plan-item', ref: 'anvil-drops' }, { kind: 'autonomy-policy', ref: '.plates/autonomy.json', digest: 'c'.repeat(64) }],
  dependsOn: [],
  choice: {
    question: 'How many times may the anvil job retry a drop?',
    alternatives: ['retry twice', 'retry once', 'never retry'],
    selected: 'retry twice',
    rationale: 'Two retries cover the transient drops seen last week inside the 30-minute budget.',
    evidence: ['docs/health/2026-10-28.md', 'health: anvil_drops 4'],
    confidence: 'medium',
    unknowns: ['whether drops on Saturday share a cause'],
    affects: [],
  },
  consequences: {
    expects: 'Acme anvil drops fall from 4 to at most 2 a night',
    checkBy: '2026-11-11',
    interactions: [{ with: 'acme-drop-timeout', expects: 'a shorter timeout with two retries still finishes inside 30 minutes' }],
    observations: [
      { basis: 'observation', evidence: 'docs/health/2026-11-04.md', version: 'retries=2', window: { from: '2026-11-04', to: '2026-11-04' }, denominator: 40, result: 'drops 2 of 40' },
      { basis: 'unavailable', evidence: null, version: unknown('no Saturday night yet'), window: unknown('no Saturday night yet'), denominator: unknown('no Saturday night yet'), result: null },
    ],
  },
  change: {
    commits: [FIX], flags: [], configuration: ['config/anvils.json'], references: ['acme/anvils#12'],
    validation: [{ command: 'npm test -- tests/anvils.test.mjs', outcome: 'passed' }],
    effects: ['receipt:op-acme-0001-a1'],
  },
  recovery: {
    door: 'reversible', preconditions: ['no anvil run in progress'], knownGood: SRC,
    steps: ['git revert ' + FIX], limits: ['drops already counted stay counted'], expires: null,
  },
  state: { decision: 'chosen', parked: null, action: 'completed', receipts: ['receipt:op-acme-0001-a1'] },
  followUp: null,
});

// A parked choice: the colour needs the owner, so its dependent work never started.
const parked = () => {
  const e = chosen();
  return {
    ...e, id: 'acme-anvil-colour', planItem: 'anvil-colour', operation: unknown('nothing was dispatched'),
    choice: { ...e.choice, question: 'Which colour are Acme anvils?', alternatives: ['black', 'red'], selected: null, rationale: unknown('owner-reserved'), confidence: 'unknown', unknowns: ['the owner\'s preference'], affects: ['docs/decisions/anvils.md#colour'] },
    consequences: { expects: unknown('not chosen'), checkBy: unknown('not chosen'), interactions: [], observations: [] },
    change: { commits: [], flags: [], configuration: [], references: [], validation: [], effects: [] },
    recovery: unknown('nothing changed'),
    state: { decision: 'parked', parked: { missing: ['owner-reserved decision: the colour'], dependents: ['anvil-colour'], next: 'ask the owner in the morning report' }, action: 'not-started', receipts: [] },
  };
};

const problems = e => validateEnvelope(e).problems;

async function acme(t, files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-night-decisions-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries({ '.plates/plates.json': '{"name":"Acme"}\n', ...files })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

test('envelope preserves scope, evidence, effects and unknowns', () => {
  for (const e of [chosen(), parked()]) {
    assert.deepEqual(problems(e), [], e.id);
    const before = clone(e);
    assert.deepEqual(contextProblems(e, { plan: acmePlan(), decisions: [] }), [], e.id);
    assert.deepEqual(e, before, 'validation never mutates the record');
    // A JSON round trip keeps every fact, unknown markers included.
    assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
  }
  const e = chosen();
  assert.equal(e.schema, ENVELOPE_SCHEMA);
  assert.equal(e.consequences.observations[0].denominator, 40, 'the measured consequence keeps its denominator');
  assert.ok(isUnknown(e.consequences.observations[1].denominator), 'an unmeasured denominator is unknown, not zero');

  // Unknowns are explicit: dropping a field is refused, marking it unknown is accepted.
  const dropped = chosen(); delete dropped.sourceRevision;
  assert.match(problems(dropped).join('\n'), /envelope\.sourceRevision: absent; record it, or mark it \{ "unknown"/);
  assert.deepEqual(problems({ ...chosen(), sourceRevision: unknown('runner did not report it') }), []);
  const noRecovery = chosen(); delete noRecovery.recovery.door;
  assert.match(problems(noRecovery).join('\n'), /envelope\.recovery\.door: absent/);
  // Identity binding cannot be unknown: a choice always names its night and plan item.
  assert.match(problems({ ...chosen(), planItem: unknown('lost') }).join('\n'), /envelope\.planItem: must be known/);
  assert.match(problems({ ...chosen(), confidence: 'high' }).join('\n'), /unknown field "confidence"/);
  assert.match(problems({ ...chosen(), choice: { ...chosen().choice, confidence: 0.8 } }).join('\n'), /confidence: low, medium, high, unknown/, 'confidence is a label, not a probability');

  // Null is not zero; a simulation is labelled and needs its evidence.
  const zero = chosen(); zero.consequences.observations[1].result = 'drops 0';
  assert.match(problems(zero).join('\n'), /unavailable evidence has no evidence or result/);
  const sim = chosen(); sim.consequences.observations[0] = { ...sim.consequences.observations[0], basis: 'simulation', evidence: null };
  assert.match(problems(sim).join('\n'), /a simulation names its evidence and result/);

  // The action is read from receipts: chosen is not completed, and a completed action names its effect.
  const noReceipt = chosen(); noReceipt.state.receipts = [];
  assert.match(problems(noReceipt).join('\n'), /a completed action is read from its original operation receipt/);
  const noEffect = chosen(); noEffect.change.effects = [];
  assert.match(problems(noEffect).join('\n'), /a completed action names its effect receipt/);
  const uncertain = chosen(); uncertain.state.action = 'uncertain';
  assert.deepEqual(problems(uncertain), [], 'uncertain stays uncertain with its original receipt');

  // A parked choice selects nothing and its dependent action has not run.
  const ran = parked(); ran.state.action = 'running';
  assert.match(problems(ran).join('\n'), /a parked choice's dependent action has not started/);
  const picked = parked(); picked.choice.selected = 'black';
  assert.match(problems(picked).join('\n'), /a parked choice selects nothing/);
  const noWhy = parked(); noWhy.state.parked = null;
  assert.match(problems(noWhy).join('\n'), /names the missing permission or evidence/);
  const offList = chosen(); offList.choice.selected = 'retry nine times';
  assert.match(problems(offList).join('\n'), /one of choice\.alternatives/);

  // Recovery reuses phase 150's door rule: an irreversible door is never reverted.
  const revert = chosen();
  revert.recovery.door = 'irreversible';
  revert.state.decision = 'revisited';
  revert.followUp = { of: 'acme-retry-limit', requested: 'revert', source: SRC, observed: 'docs/health/2026-11-11.md', result: null };
  assert.match(problems(revert).join('\n'), /an irreversible door cannot be reverted/);
  revert.followUp.requested = 'adjust';
  assert.deepEqual(problems(revert), []);
  assert.ok(Object.values(FOLLOW_UPS).every(o => OUTCOMES.includes(o)), 'keep/adjust/revert map onto phase 150 outcomes');
  const stray = chosen(); stray.followUp = { of: 'acme-retry-limit', requested: 'keep', source: SRC, observed: 'x', result: null };
  assert.match(problems(stray).join('\n'), /a record with a follow-up is revisited/);

  // Binding to the plan: the envelope names an existing item of its own night, never new work.
  assert.match(contextProblems({ ...chosen(), planItem: 'anvil-polish' }, { plan: acmePlan() }).join('\n'), /not an item of the 2026-11-04 plan; an envelope cannot add work/);
  assert.match(contextProblems({ ...chosen(), night: '2026-11-03' }, { plan: acmePlan() }).join('\n'), /the plan is 2026-11-04/);
  assert.throws(() => assertEnvelope({ ...chosen(), planItem: 'anvil-polish' }, { plan: acmePlan() }), EnvelopeError);
  assert.equal(assertEnvelope(chosen(), { plan: acmePlan() }).id, 'acme-retry-limit');
});

test('legacy plans and decision records remain readable', async t => {
  // The strict schema-1 plan is unchanged: no new field, and an envelope inside a plan is refused by name.
  assert.deepEqual(PLAN_FIELDS, ['schema', 'date', 'shapedBy', 'readyBy', 'willNotTouch', 'settledToday', 'leftOpen', 'items']);
  assert.deepEqual(ITEM_FIELDS, ['id', 'title', 'kind', 'source', 'number', 'lane', 'budget', 'status', 'result']);
  assert.deepEqual(validatePlan(acmePlan()).problems, []);
  assert.deepEqual(validatePlan(defaultPlan({ date: '2026-11-04' })).problems, []);
  const carrying = { ...acmePlan(), decisions: [chosen()] };
  assert.match(validatePlan(carrying).problems.join('\n'), /unknown field "decisions"/, 'no plan field becomes active because a record exists');
  const itemCarrying = acmePlan(); itemCarrying.items[0].result = { note: 'x', envelope: 'acme-retry-limit' };
  assert.match(validatePlan(itemCarrying).problems.join('\n'), /unknown field "result\.envelope"/);
  // A plan's existing result.link may reference a safe summary.
  const linked = acmePlan(); linked.items[0].result.link = 'docs/night/2026-11-04.json';
  assert.deepEqual(validatePlan(linked).problems, []);

  // Phase 150's records read exactly as before, and an envelope references them without changing them.
  const fence = v => `\`\`\`plates-decision\n${JSON.stringify({ version: 1, status: 'accepted', scope: ['anvils'], decided_by: 'Acme owner', decided_at: '2026-10-10', supersedes: [], superseded_by: [], ...v })}\n\`\`\`\n`;
  const root = await acme(t, {
    'docs/decisions/anvils.md': [
      '<a id="colour"></a>\n## Anvils are black\n', fence({ id: 'colour' }),
      '<a id="drops"></a>\n## Fewer drops\n', fence({ id: 'drops', evidence: ['health: anvil_drops 4'], expects: 'drops halve', checkBy: '2026-11-20', door: 'reversible' }),
    ].join('\n'),
  });
  const found = await collectDecisions(root);
  assert.deepEqual(found.gaps, []);
  assert.deepEqual(found.problems, []);
  assert.deepEqual(found.decisions.map(d => [d.ref, d.decision, d.door ?? null]), [
    ['docs/decisions/anvils.md#colour', 'accepted', null], ['docs/decisions/anvils.md#drops', 'accepted', 'reversible'],
  ]);
  const before = clone(found.decisions);
  assert.deepEqual(contextProblems(parked(), { plan: acmePlan(), decisions: found.decisions }), [], 'a parked choice may name the settled decision it waits on');
  assert.deepEqual(found.decisions, before, 'records are read, never rewritten to look complete');
  assert.ok(found.decisions.every(d => loopProblems(d).length === 0));

  // An older, partial envelope reads with every absent fact marked unknown, never defaulted.
  const old = { id: 'acme-old', night: '2026-11-01', planItem: 'anvil-drops', choice: { question: 'Retry?', selected: null }, state: { decision: 'parked', parked: { missing: ['evidence'], dependents: [], next: 'measure first' }, action: 'not-started', receipts: [] } };
  const frozen = clone(old);
  const r = readEnvelope(old);
  assert.deepEqual(old, frozen, 'reading never mutates the input');
  assert.equal(r.gap, null);
  assert.equal(r.schema, 'unknown');
  assert.deepEqual(r.problems, []);
  assert.ok(r.unknowns.includes('schema') && r.unknowns.includes('sourceRevision') && r.unknowns.includes('authority') && r.unknowns.includes('recovery') && r.unknowns.includes('change.effects') && r.unknowns.includes('choice.confidence'));
  assert.ok(isUnknown(r.envelope.sourceRevision) && isUnknown(r.envelope.change.effects) && isUnknown(r.envelope.consequences.checkBy));
  assert.equal(r.envelope.choice.confidence, 'unknown');
  // A current envelope reads back unchanged, with nothing unknown it did not say.
  const cur = readEnvelope(chosen());
  assert.deepEqual([cur.envelope, cur.unknowns, cur.problems], [chosen(), [], []]);
  const whole = readEnvelope(parked());
  assert.deepEqual([whole.envelope, whole.unknowns, whole.problems], [parked(), [], []], 'a group marked unknown as a whole reads back as that marker');
  // A newer schema is a gap, not "no decision".
  assert.match(readEnvelope({ ...chosen(), schema: 2 }).gap, /schema 2 is newer than this reader/);
  assert.equal(readEnvelope(null).envelope, null);
});

test('overnight mode cannot manufacture authority or bypass a hook', async () => {
  // A model-written approval, consent, permission or hook skip is refused by name, anywhere.
  for (const [where, key] of [[null, 'approvedBy'], [null, 'ownerApproval'], ['state', 'consent'], ['choice', 'permission'], ['change', 'skipHooks'], ['recovery', 'override']]) {
    const e = chosen();
    (where ? e[where] : e)[key] = true;
    assert.match(problems(e).join('\n'), /references existing authority; it never carries approval, consent or a hook skip/, key);
  }
  // Authority is a reference to existing authority, never an approval kind.
  const granted = chosen(); granted.authority.push({ kind: 'owner-approval', ref: 'the owner said yes' });
  assert.match(problems(granted).join('\n'), /authority\[2\]: \{ kind: plan-item \| autonomy-policy \| decision-record/);
  // Unknown authority cannot back a choice; nor can authority that skips the plan item.
  assert.match(problems({ ...chosen(), authority: unknown('no reply overnight') }).join('\n'), /unknown authority cannot back a chosen option; park it/);
  assert.match(problems({ ...chosen(), authority: [{ kind: 'autonomy-policy', ref: '.plates/autonomy.json' }] }).join('\n'), /a chosen option names its plan item/);
  // A settled choice is not overridden by an overnight one, and willNotTouch holds.
  const settled = [{ kind: 'decision-fence', ref: 'docs/decisions/anvils.md#colour', decision: 'accepted' }];
  const overriding = chosen(); overriding.choice.affects = ['docs/decisions/anvils.md#colour'];
  assert.match(contextProblems(overriding, { plan: acmePlan(), decisions: settled }).join('\n'), /is a settled decision; an overnight choice cannot override it/);
  const touching = chosen(); touching.change.configuration = ['.github/workflows/night.yml', 'anvil.config.json'];
  const touched = contextProblems(touching, { plan: acmePlan() });
  assert.equal(touched.filter(p => /willNotTouch/.test(p)).length, 2);
  // The module only validates and reads: it exports no verb that runs, writes or routes.
  const mod = await import('../lib/night-decisions.mjs');
  assert.deepEqual(Object.keys(mod).filter(k => typeof mod[k] === 'function' && !/^[A-Z]/.test(k)).sort(), ['assertEnvelope', 'contextProblems', 'isUnknown', 'readEnvelope', 'unknown', 'validateEnvelope']);
});

// ---- the journal (increment 2) -------------------------------------------------

const AT = '2026-11-04T08:00:00Z';
const withPlan = t => acme(t, { '.plates/night/plan.json': `${JSON.stringify(acmePlan(), null, 2)}\n` });
// The anvil build as the runner saw it: dispatched, then its outcome unknown.
const dispatched = action => {
  const e = chosen();
  e.state = { ...e.state, action, receipts: ['receipt:op-acme-0001-a1'] };
  if (action !== 'completed') e.change = { ...e.change, effects: [] };
  return e;
};

test('the journal appends beside the working plan, reads old shapes and keeps gaps', async t => {
  const root = await withPlan(t);
  assert.equal((await readJournal({ root, night: '2026-11-04' })).state, 'absent', 'no journal is absent, not empty coverage');
  const w = await appendEnvelope({ root, envelope: parked(), at: AT });
  assert.deepEqual([w.written, w.key], [true, 'decision:acme-anvil-colour'], 'nothing dispatched: keyed by the decision');
  assert.equal(w.path, join(root, journalOf('2026-11-04')));
  assert.equal(await readFile(join(root, '.plates/night/.gitignore'), 'utf8'), '*\n', 'the night directory ignores itself: never committed');
  assert.equal((run('git', ['init', '-q'], { cwd: root })).status, 0);
  assert.equal((run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })).stdout.includes('decisions'), false);

  // Bound to the plan and to phase 150's current records.
  await assert.rejects(appendEnvelope({ root, envelope: { ...chosen(), planItem: 'anvil-polish' }, at: AT }), /not an item of the 2026-11-04 plan/);
  await assert.rejects(appendEnvelope({ root, envelope: { ...chosen(), night: '2026-11-05' }, at: AT }), /no working plan for the night of 2026-11-05/);
  const settled = chosen(); settled.choice.affects = ['docs/decisions/anvils.md#colour'];
  await assert.rejects(appendEnvelope({ root, envelope: settled, at: AT, decisions: [{ ref: 'docs/decisions/anvils.md#colour', decision: 'accepted' }] }), /cannot override it/);
  await assert.rejects(appendEnvelope({ root, envelope: { ...chosen(), approvedBy: 'owner' }, at: AT }), /never carries approval/);

  // An older line (no schema, fields missing) reads with its unknowns; a torn line is a gap, not "no decision".
  const old = { id: 'acme-old', night: '2026-11-04', planItem: 'anvil-drops', choice: { question: 'Retry?', selected: null }, state: { decision: 'parked', parked: { missing: ['evidence'], dependents: [], next: 'measure first' }, action: 'not-started', receipts: [] } };
  await appendFile(join(root, journalOf('2026-11-04')), `${JSON.stringify({ journal: 1, key: 'decision:acme-old', at: AT, envelope: old })}\n`);
  let j = await readJournal({ root, night: '2026-11-04' });
  assert.deepEqual([j.state, j.decisions.map(d => d.id), j.gaps], ['read', ['acme-anvil-colour', 'acme-old'], []]);
  assert.ok(j.decisions[1].unknowns.includes('sourceRevision') && isUnknown(j.decisions[1].latest.change.effects));
  await appendFile(join(root, journalOf('2026-11-04')), '{"journal":1,"key":"op');
  j = await readJournal({ root, night: '2026-11-04' });
  assert.deepEqual(j.gaps, [{ at: 'line 3', reason: 'not JSON (a torn or foreign line)' }]);
  assert.equal(j.decisions.length, 2, 'the readable lines stay read');
  await assert.rejects(appendEnvelope({ root, envelope: chosen(), at: AT }), /unreadable lines \(line 3\); inspect them/, 'never appends past a gap');

  // Destinations: a committed path inside the checkout is refused; a link is refused.
  await assert.rejects(appendEnvelope({ root, envelope: chosen(), at: AT, dir: join(root, 'docs/night') }), /lives only in the self-ignoring \.plates\/night\//);
  const other = await withPlan(t);
  const elsewhere = await realpath(await mkdtemp(join(tmpdir(), 'acme-private-')));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  await symlink(elsewhere, join(other, '.plates/night/decisions'));
  await assert.rejects(appendEnvelope({ root: other, envelope: chosen(), at: AT }), /not a plain directory/);
  const priv = await appendEnvelope({ root: other, envelope: chosen(), at: AT, dir: join(elsewhere, 'state') });
  assert.equal(priv.path, join(elsewhere, 'state', '2026-11-04.jsonl'), 'an approved private destination outside the checkout');
});

test('resume inspects the original uncertain operation without redispatch', async t => {
  const root = await withPlan(t);
  const night = '2026-11-04';
  const running = dispatched('running');
  assert.equal((await appendEnvelope({ root, envelope: running, at: AT })).written, true);
  // A retry of the same write is one fact, not two.
  assert.deepEqual((await appendEnvelope({ root, envelope: dispatched('running'), at: '2026-11-04T08:01:00Z' })).why, 'duplicate');
  const uncertain = dispatched('uncertain');
  await appendEnvelope({ root, envelope: uncertain, at: '2026-11-04T08:30:00Z' });

  // The resume reads the journal and is told to inspect the original operation, never to dispatch.
  let j = await readJournal({ root, night });
  const latest = j.decisions.find(d => d.id === 'acme-retry-limit');
  assert.equal(latest.revisions, 2);
  assert.equal(latest.latest.state.action, 'uncertain', 'uncertain is not completed and not failed');
  const step = resumeStep(latest.latest);
  assert.deepEqual([step.step, step.operation, step.attempts, step.receipts], ['inspect', 'op-acme-0001', ['op-acme-0001-a1'], ['receipt:op-acme-0001-a1']]);
  assert.match(step.why, /never redispatch/);

  // A redispatch is refused: a new attempt, or a new operation id, while the outcome is unknown.
  const again = dispatched('running'); again.operation = { id: 'op-acme-0001', attempts: ['op-acme-0001-a1', 'op-acme-0001-a2'] };
  await assert.rejects(appendEnvelope({ root, envelope: again, at: AT }), /is uncertain: inspect its original receipt \(receipt:op-acme-0001-a1\); never dispatch another attempt/);
  const fresh = dispatched('running'); fresh.operation = { id: 'op-acme-0002', attempts: ['op-acme-0002-a1'] };
  await assert.rejects(appendEnvelope({ root, envelope: fresh, at: AT }), /operation op-acme-0001 is the original identity; a resume inspects it/);
  const backToRunning = dispatched('running');
  await assert.rejects(appendEnvelope({ root, envelope: backToRunning, at: AT }), /an uncertain operation resolves to completed or failed/);
  // Nor may the choice be rewritten in place, or a receipt dropped.
  const rewritten = dispatched('completed'); rewritten.choice = { ...rewritten.choice, selected: 'retry once' };
  await assert.rejects(appendEnvelope({ root, envelope: rewritten, at: AT }), /choice cannot change in place/);
  const dropped = dispatched('completed'); dropped.state.receipts = ['receipt:other'];
  await assert.rejects(appendEnvelope({ root, envelope: dropped, at: AT }), /receipts are append-only/);
  // Another decision cannot claim the same operation.
  const twin = dispatched('running'); twin.id = 'acme-twin';
  await assert.rejects(appendEnvelope({ root, envelope: twin, at: AT }), /operation:op-acme-0001 is already the operation of acme-retry-limit/);

  // Inspection resolves it from the original receipt: completed, with its effect; earlier lines stay.
  await appendEnvelope({ root, envelope: dispatched('completed'), at: '2026-11-04T09:00:00Z' });
  j = await readJournal({ root, night });
  const done = j.decisions.find(d => d.id === 'acme-retry-limit');
  assert.deepEqual([done.revisions, done.history, done.latest.state.action, resumeStep(done.latest).step], [3, [1, 2, 3], 'completed', 'done']);
  assert.equal(j.entries.length, 3, 'append-only, and a duplicate write adds no line');
  const twiceLine = `${JSON.stringify({ journal: 1, key: 'operation:op-acme-0001', at: AT, envelope: dispatched('running') })}\n`;
  assert.equal(parseJournal(twiceLine + twiceLine).decisions[0].revisions, 1, 'a line repeated by a torn retry is one fact');
  const text = await readFile(join(root, journalOf(night)), 'utf8');
  assert.deepEqual(parseJournal(text, { night }).decisions.map(d => d.latest.state.action), ['completed']);
  await assert.rejects(appendEnvelope({ root, envelope: { ...dispatched('completed'), operation: { id: 'op-acme-0001', attempts: ['op-acme-0001-a1', 'op-acme-0001-a2'] } }, at: AT }), /a completed action is final/);

  // A known failure may be retried as exactly one new attempt of the same operation; a parked choice is not resumable.
  const failed = dispatched('failed');
  assert.equal(revisionProblem(dispatched('running'), failed), null);
  const retry = dispatched('running'); retry.operation = { id: 'op-acme-0001', attempts: ['op-acme-0001-a1', 'op-acme-0001-a2'] };
  assert.equal(revisionProblem(failed, retry), null);
  const twice = dispatched('running'); twice.operation = { id: 'op-acme-0001', attempts: ['op-acme-0001-a1', 'op-acme-0001-a2', 'op-acme-0001-a3'] };
  assert.match(revisionProblem(failed, twice), /exactly one new attempt/);
  assert.equal(resumeStep(failed).step, 'retry-allowed');
  assert.equal(resumeStep(parked()).step, 'parked');
  assert.equal(keyOf(parked()), 'decision:acme-anvil-colour');
  // Concurrency: a held lock is reported, never broken.
  await writeFile(join(root, `${journalOf(night)}.lock`), '');
  await assert.rejects(appendEnvelope({ root, envelope: parked(), at: AT }), JournalError);
});
