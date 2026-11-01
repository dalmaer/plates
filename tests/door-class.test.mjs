// Every change Plates proposes says whether it can be undone (phase 145):
// lib/doors.mjs gives every operation type exactly one door class, the CLI
// verbs and the managed workflows name only classified types, the Merge danger
// line (scripts/plates/pr-body.mjs, phase 39) is derived from the class and
// names it, and an autonomy level holds back the classes it does not allow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verbs } from '../lib/cli.mjs';
import { DOORS, MERGE_DOOR, OPERATIONS, VERB_OPERATIONS, LEVEL_DOORS, LEVEL_SCOPES, unclassified, workflowOperations, doorOf, doorAllowed, doorRule, mergeDanger } from '../lib/doors.mjs';
import { prBody, DOOR_CLASSES, PrBodyError } from '../practices/night/files/scripts/plates/pr-body.mjs';
import { updateBody } from '../lib/update.mjs';
import { renderHostControls } from '../lib/autonomy-hosts.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every managed workflow the practices ship: the night, climb, robot, loop, cross-review, delivery ones. */
async function managedWorkflows() {
  const out = [];
  for (const practice of await readdir(join(PLATES, 'practices'))) {
    const dir = join(PLATES, 'practices', practice, 'files', '.github', 'workflows');
    let names = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names.filter(n => n.endsWith('.yml'))) out.push({ path: `practices/${practice}/files/.github/workflows/${name}`, text: await readFile(join(dir, name), 'utf8') });
  }
  return out;
}

const body = danger => prBody({ summary: { files: ['docs/acme.md'] }, danger });
const dangerLine = text => text.split('\n').find(l => /^(Two|One)-way door/.test(l));

test('every operation has a door', async () => {
  // Exactly one class each, from the three; a window exactly when windowed.
  for (const [name, o] of Object.entries(OPERATIONS)) {
    assert.equal(DOORS.filter(d => d === o.door).length, 1, `${name} has exactly one door`);
    assert.equal(o.door === 'windowed', typeof o.window === 'string' && o.window.length > 0, `${name}: a window exactly when windowed`);
    assert.ok(o.why, `${name} says why`);
  }
  // The types the brief named are all there, with promote --back windowed.
  for (const name of ['merge', 'deploy', 'promote --back', 'publish', 'delete', 'secret change', 'fleet update', 'schedule change', 'ruleset change', 'label or issue edit', 'comment']) assert.ok(Object.hasOwn(OPERATIONS, name), name);
  assert.equal(doorOf('promote --back').door, 'windowed');
  assert.equal(doorOf('secret change').door, 'irreversible');
  assert.equal(doorOf('merge').door, 'reversible');

  // The sources of truth: the dispatcher's verbs and the managed workflows' commands.
  const workflows = await managedWorkflows();
  assert.ok(workflows.some(w => w.path.endsWith('plates-night.yml')) && workflows.some(w => w.path.endsWith('plates-robot.yml')), 'the night and robot workflows are read');
  assert.deepEqual(unclassified({ verbs: [...verbs.keys()], workflows }), []);
  const seen = workflows.flatMap(w => workflowOperations(w.text)).map(w => w.op).filter(Boolean);
  for (const name of ['force push', 'pull request', 'issue', 'comment', 'deploy']) assert.ok(seen.includes(name), `a managed workflow performs ${name}`);

  // Negative controls: a new verb, a new command, a type without a door, a window missing.
  const problems = unclassified({
    verbs: [...verbs.keys(), 'acme ship'],
    workflows: [{ path: 'acme.yml', text: 'run: |\n  gh gist create notes.md\n  # gh gist create in a comment is not a command\n  gh pr view 1\n' }],
    operations: { ...OPERATIONS, 'acme wipe': { why: 'x' }, 'acme rollout': { door: 'windowed', why: 'x' } },
  });
  assert.deepEqual(problems.map(p => `${p.kind}:${p.name}`).sort(), ['operation:acme rollout', 'operation:acme wipe', 'verb:acme ship', 'workflow:acme.yml:2']);
  assert.deepEqual(unclassified({ verbs: ['acme'], verbOperations: { acme: ['acme teleport'] } }).map(p => p.problem), ['names "acme teleport", which has no door']);
  assert.throws(() => doorOf('acme teleport'), /has no door/);
});

test('merge danger says the door', () => {
  // pr-body keeps its own copy of the class words (it ships without lib/); they stay equal.
  assert.deepEqual(DOOR_CLASSES, MERGE_DOOR);
  assert.deepEqual(Object.keys(DOOR_CLASSES), [...DOORS]);

  // The line is derived from the class and names it, for every class.
  assert.equal(dangerLine(body(mergeDanger('merge', { why: 'Acme docs only.' }))), 'Two-way door (reversible): Acme docs only.');
  assert.equal(dangerLine(body(mergeDanger('secret change', { why: 'replaces the Acme token.' }))), 'One-way door (irreversible): replaces the Acme token.');
  assert.equal(dangerLine(body(mergeDanger('deploy', { why: 'Acme moves to v2.' }))), `Two-way door (windowed, ${OPERATIONS.deploy.window}): Acme moves to v2.`);
  for (const name of Object.keys(OPERATIONS)) {
    const line = dangerLine(body(mergeDanger(name, { why: 'Acme.' })));
    assert.ok(line.startsWith(`${MERGE_DOOR[OPERATIONS[name].door] === 'one-way' ? 'One' : 'Two'}-way door (${OPERATIONS[name].door}`), `${name}: ${line}`);
  }
  // The fleet's update PR reads the class: a migration is irreversible, a re-render reversible.
  const base = { from: '0.8.0', to: '0.8.1', check: 'npm run check', files: ['AGENTS.md'] };
  assert.match(updateBody({ ...base, message: 'plates update 0.8.1\n' }), /^Two-way door \(reversible\): re-renders/m);
  assert.match(updateBody({ ...base, message: 'plates update 0.8.1\n\n0099-acme: Acme index\n  rewrites: docs/acme.md\n' }), /^One-way door \(irreversible\): migration 0099-acme rewrote docs\/acme\.md/m);

  // An older caller's door alone still names its class; a contradiction or a windowless window is refused.
  assert.equal(dangerLine(body({ door: 'one-way', why: 'Acme.' })), 'One-way door (irreversible): Acme.');
  assert.equal(dangerLine(body({ door: 'two-way', why: 'Acme.' })), 'Two-way door (reversible): Acme.');
  assert.throws(() => body({ class: 'irreversible', door: 'two-way', why: 'Acme.' }), PrBodyError);
  assert.throws(() => body({ class: 'windowed', why: 'Acme.' }), /window/);
  assert.throws(() => body({ class: 'reversible', window: 'a week', why: 'Acme.' }), /only for a windowed door/);
  assert.throws(() => body({ class: 'sideways', why: 'Acme.' }), /reversible, windowed, irreversible/);
  assert.throws(() => body({ why: 'Acme.' }), /danger\.class is required/);
});

test('an irreversible door waits for the owner', () => {
  // The rule per class: Low none, Medium reversible, High reversible and windowed; irreversible never.
  assert.deepEqual(doorRule('low'), { reversible: false, windowed: false, irreversible: false });
  assert.deepEqual(doorRule('medium'), { reversible: true, windowed: false, irreversible: false });
  assert.deepEqual(doorRule('high'), { reversible: true, windowed: true, irreversible: false });
  for (const level of Object.keys(LEVEL_DOORS)) assert.ok(!LEVEL_DOORS[level].includes('irreversible'), level);

  // High refuses an irreversible operation and says why, and what can still be done.
  for (const name of Object.keys(OPERATIONS).filter(n => OPERATIONS[n].door === 'irreversible')) {
    const r = doorAllowed('high', name);
    assert.equal(r.allowed, false, name);
    assert.equal(r.door, 'irreversible');
    assert.match(r.reason, /irreversible .*waits for the owner at every level, high included/);
    assert.ok(r.canStillDo.some(s => /ask the owner/.test(s)) && r.canStillDo.some(s => /prepare it as a local edit or a pull request/.test(s)), r.canStillDo.join('; '));
  }
  const migration = doorAllowed('high', 'migration');
  assert.match(migration.reason, /^migration is irreversible \(a migration rewrites/);

  // High merges reversible changes; Medium does not (merge is not its scope); Low nothing.
  assert.deepEqual([doorAllowed('high', 'merge').allowed, doorAllowed('medium', 'merge').allowed, doorAllowed('low', 'merge').allowed], [true, false, false]);
  assert.equal(doorAllowed('medium', 'local edit').allowed, true);
  assert.match(doorAllowed('medium', 'merge').reason, /scope \(merge\) is not open at medium/);
  assert.match(doorAllowed('medium', 'deploy').reason, /deploy is windowed \(until the next deploy.*\): medium allows reversible doors without the owner/);
  assert.match(doorAllowed('low', 'local edit').reason, /low allows no doors without the owner/);
  assert.deepEqual(doorAllowed('low', 'local edit').canStillDo[0], 'describe it and show the preview; change nothing');
  // A windowed door High allows still needs its scope: deployment is specific approval at every level (phase 144).
  assert.equal(doorAllowed('high', 'deploy').allowed, false);
  assert.match(doorAllowed('high', 'deploy').reason, /scope \(deployment\) is not open at high/);
  assert.throws(() => doorAllowed('acme', 'merge'), /unknown autonomy level/);

  // Phase 144's host mapping carries the rule, and its scopes match LEVEL_SCOPES.
  const repository = 'acme/app';
  const policies = {
    low: { schema: 1, repository, mode: 'default', push: [], merge: [] },
    medium: { schema: 1, repository, mode: 'local', push: [], merge: [] },
    high: { schema: 1, repository, mode: 'delivery', push: ['acme-release'], merge: ['main'], pushPrefixes: ['claude/'] },
  };
  for (const [level, policy] of Object.entries(policies)) {
    const r = renderHostControls({ policy, repository });
    assert.deepEqual(r.doors, doorRule(level), level);
    assert.deepEqual(Object.entries(r.scopes).filter(([, open]) => open).map(([s]) => s), [...LEVEL_SCOPES[level]], level);
    assert.ok(r.notes.some(n => /irreversible operations always wait for the owner/.test(n)), level);
  }
});
