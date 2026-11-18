import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers/run.mjs';
import { assessDoor, formatDoorCard } from '../lib/night-door-policy.mjs';

const acme = () => ({
  intent: 'Edit Acme anvil colour locally', effectsComplete: true, asOf: '2026-11-18',
  effects: [{ kind: 'local-change', description: 'Change Acme config', paths: ['config/acme.json'], bounded: true,
    recovery: { door: 'reversible', preconditions: ['No writer'], knownGood: 'Acme preimage', steps: ['Restore retained Acme preimage'], limits: ['Local bytes only'], expires: null,
      evidence: ['receipt:acme-preimage'], reliable: true, boundedCost: true, cost: 'One minute within current allowance', preconditionsMet: true } }],
  context: { trust: 'verified', authority: 'allowed', scope: 'allowed', budget: 'allowed', hooks: 'allowed', authorityRef: 'receipt:acme-authority', protectedPaths: ['protected/'] },
  operation: { id: 'acme-operation', state: 'not-started', receipts: [] },
});
const assess = edit => { const input = acme(); edit(input); return assessDoor(input); };

test('bounded local description recommends continue but never verifies or authorizes', () => {
  const input = acme(), before = structuredClone(input);
  const r = assessDoor(input);
  assert.equal(r.door, 'two-way');
  assert.equal(r.recommendation, 'continue-within-existing-authority');
  assert.equal(r.authorizesExecution, false);
  assert.equal(r.evidenceBasis, 'declared-not-verified');
  assert.deepEqual(r, assessDoor(input));
  r.effects[0].recovery.steps.push('changed output');
  assert.deepEqual(input, before);
  assert.match(formatDoorCard(assessDoor(input)), /scope: config\/acme.json.*recovery: Restore.*evidence: receipt:acme-preimage.*cost: One minute/);
});

test('every irreversible effect survives a Git revert and uses existing exact approval review', () => {
  for (const kind of ['disclosure', 'message', 'spend', 'data-loss']) {
    const r = assess(i => { i.effects.push({ ...structuredClone(i.effects[0]), kind }); });
    assert.equal(r.door, 'one-way', kind);
    assert.equal(r.effects.length, 2);
    assert.equal(r.recommendation, 'review-existing-exact-approval');
    assert.equal(r.authorizesExecution, false);
    assert.match(r.nextAction, /existing exact approval path/);
  }
  const mixed = assess(i => { i.effects.push({ kind: 'unknown', description: 'Unknown Acme operation' }, { kind: 'spend', description: 'Consume allowance' }); });
  assert.equal(mixed.effects.length, 3);
  assert.equal(mixed.door, 'one-way');
  assert.equal(mixed.recommendation, 'ask-or-park');
});

test('missing recovery and incomplete or unknown operations never continue', () => {
  for (const key of ['knownGood', 'evidence', 'steps', 'preconditions', 'limits', 'reliable', 'boundedCost', 'cost', 'preconditionsMet', 'door', 'expires']) {
    const r = assess(i => { delete i.effects[0].recovery[key]; });
    assert.equal(r.door, 'unknown', key);
    assert.equal(r.recommendation, 'ask-or-park');
  }
  for (const edit of [i => { delete i.effects[0].recovery; }, i => { i.effectsComplete = false; }, i => { i.effects = []; }, i => { i.effects[0].kind = 'unknown'; }, i => { i.effects[0].bounded = false; }]) {
    assert.equal(assess(edit).door, 'unknown');
  }
  assert.equal(assessDoor({}).recommendation, 'inspect-receipt');
  assert.equal(assess(i => { i.effects[0].recovery = { unknown: 'No Acme snapshot' }; }).door, 'unknown');
});

test('windowed recovery uses explicit assessment date and expires conservatively', () => {
  for (const [expiry, asOf, expected] of [['2026-11-19', '2026-11-18', 'two-way'], ['2026-11-18', '2026-11-18', 'unknown'], ['2026-11-17', '2026-11-18', 'unknown'], [null, '2026-11-18', 'unknown'], ['2026-11-19', undefined, 'unknown']]) {
    assert.equal(assess(i => { i.effects[0].recovery.door = 'windowed'; i.effects[0].recovery.expires = expiry; i.asOf = asOf; }).door, expected);
  }
});

test('authority scope budget and hooks remain separate from reversibility', () => {
  for (const key of ['authority', 'scope', 'budget', 'hooks']) {
    for (const [state, expected] of [['denied', 'block'], ['unknown', 'ask-or-park']]) {
      const r = assess(i => { i.context[key] = state; });
      assert.equal(r.door, 'two-way');
      assert.equal(r.recommendation, expected);
      assert.equal(r.authorizesExecution, false);
    }
  }
  assert.equal(assess(i => { i.context.trust = 'untrusted'; }).recommendation, 'ask-or-park');
  assert.equal(assess(i => { delete i.context.protectedPaths; }).recommendation, 'ask-or-park');
  for (const p of ['protected', 'protected/acme.json']) {
    assert.equal(assess(i => { i.effects[0].paths = [p]; }).recommendation, 'block');
  }
});

test('uncertain originals are inspected without retry, including missing identity and receipts', () => {
  for (const state of ['running', 'uncertain', 'unknown', 'failed', 'completed', undefined]) {
    const r = assess(i => { i.operation.state = state; i.operation.receipts = ['receipt:acme-original']; });
    assert.equal(r.recommendation, 'inspect-receipt');
    assert.match(r.nextAction, /do not retry/);
    assert.deepEqual(r.operation.receipts, ['receipt:acme-original']);
  }
  const denied = assess(i => { i.operation.state = 'uncertain'; i.context.hooks = 'denied'; });
  assert.equal(denied.recommendation, 'block');
  assert.match(denied.nextAction, /Inspect the original/);
});

test('missing decision identity never recommends continue', () => {
  for (const edit of [i => { delete i.intent; }, i => { delete i.effects[0].description; }, i => { delete i.operation.id; }]) {
    assert.equal(assess(edit).recommendation, 'ask-or-park');
  }
});

test('malformed booleans arrays enums and spoofed approvals are rejected', () => {
  const edits = [i => { i.effectsComplete = 'true'; }, i => { i.effects = {}; }, i => { i.effects = Array(2); },
    i => { i.effects[0].kind = 'npm test'; }, i => { i.context.hooks = true; }, i => { i.context.budget = 'yes'; },
    i => { i.effects[0].recovery.reliable = 1; }, i => { i.effects[0].paths = 'config/acme.json'; },
    i => { i.effects[0].paths = ['protected/../config/acme.json']; }, i => { i.effects[0].recovery.steps = Array(1); },
    i => { i.operation.receipts = false; }, i => { i.effects[0].recovery.expires = '2026-02-30'; }];
  for (const edit of edits) assert.throws(() => assess(edit), TypeError);
  for (const key of ['approved', 'cachedYes', 'skipHooks', 'authorizesExecution']) {
    for (const target of [i => i, i => i.context, i => i.effects[0], i => i.effects[0].recovery]) {
      assert.throws(() => assess(i => { target(i)[key] = true; }), TypeError);
    }
  }
});

test('inherited and accessor facts cannot count as required evidence', () => {
  for (const target of [i => i, i => i.context, i => i.effects[0], i => i.effects[0].recovery, i => i.operation]) {
    assert.throws(() => assess(i => { Object.setPrototypeOf(target(i), { approved: true }); }), TypeError);
  }
  assert.throws(() => assess(i => { Object.defineProperty(i.context, 'authority', { get() { throw new Error('getter must not run'); } }); }), TypeError);
  Object.defineProperty(Object.prototype, 'effectsComplete', { value: true, configurable: true });
  try { assert.throws(() => assessDoor({}), TypeError); }
  finally { delete Object.prototype.effectsComplete; }
});

test('source CLI prints a card or JSON and sanitizes malformed input failures', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'acme-door-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'input.json');
  await writeFile(file, JSON.stringify(acme()));
  let r = run(process.execPath, ['scripts/assess-door.mjs', file, '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).authorizesExecution, false);
  r = run(process.execPath, ['scripts/assess-door.mjs', file]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Door: two-way/);
  for (const body of ['{"Acme-private-example": invalid}', '{"Acme-private-example":true}']) {
    await writeFile(file, body);
    r = run(process.execPath, ['scripts/assess-door.mjs', file, '--json']);
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).authorizesExecution, false);
    assert.doesNotMatch(r.stdout + r.stderr, /Acme-private-example/);
  }
});
