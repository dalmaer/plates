// Phase 151: the activation plan for the hosted workspace is complete and
// ordered. The real plan is read against the real phase records and the real
// web SQL folder; each way it can drift is then made in memory and must be
// refused. Nothing here contacts Vercel, Supabase or GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePhase } from '../scripts/roadmap.mjs';
import { checkActivationPlan, hostedGap, phasesNeedingSteps, renderActivationGuide, GUIDE_PATH } from '../lib/web/activation-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = join(ROOT, 'docs/specs/web-activation-plan.json');
const GUIDE = join(ROOT, GUIDE_PATH);

async function facts() {
  const dir = join(ROOT, 'docs/phases');
  const names = (await readdir(dir)).filter(n => /^\d+-[a-z0-9-]+\.md$/.test(n));
  const phases = await Promise.all(names.map(async n => parsePhase(n, await readFile(join(dir, n), 'utf8'))));
  const migrations = (await readdir(join(ROOT, 'lib/web/migrations'))).filter(n => n.endsWith('.sql'));
  return { plan: JSON.parse(await readFile(PLAN, 'utf8')), phases, migrations };
}

const copy = value => structuredClone(value);
const without = (plan, pred) => ({ ...copy(plan), steps: copy(plan.steps).filter(s => !pred(s)) });
const moved = (plan, id, toIndex) => {
  const steps = copy(plan.steps), from = steps.findIndex(s => s.id === id);
  const [step] = steps.splice(from, 1);
  steps.splice(toIndex, 0, step);
  return { ...copy(plan), steps };
};
const edited = (plan, id, change) => ({ ...copy(plan), steps: copy(plan.steps).map(s => s.id === id ? { ...s, ...change } : s) });

test('the activation plan is complete and ordered', async t => {
  const { plan, phases, migrations } = await facts();
  const check = (p, f = { phases, migrations }) => checkActivationPlan(p, f).problems;
  const index = id => plan.steps.findIndex(s => s.id === id);

  await t.test('the real plan passes against the real phases and migrations', () => {
    assert.deepEqual(check(plan), []);
    // Every G7 phase that owes a walk or names a hosted gap is in the plan.
    const owing = phasesNeedingSteps(phases, 'G7', 151);
    assert.deepEqual(owing, [94, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 152]);
    for (const id of owing) assert.ok(plan.steps.some(s => s.phase === id), `phase ${id}`);
    // Every migration not yet applied in the hosted database has its step.
    assert.deepEqual(plan.applied.map(a => a.migration), ['001-auth.sql', '002-home-cache.sql', '003-home-retry.sql']);
    assert.equal(plan.steps.filter(s => s.kind === 'migration').length, migrations.length - plan.applied.length);
    // The record and evidence the plan cites exist.
    for (const path of [plan.record, ...plan.applied.map(a => a.evidence)]) assert.ok(existsSync(join(ROOT, path)), path);
  });

  await t.test('the 2026-10-22 runtime exception re-check (Node 24.22.1+) is the first step', () => {
    assert.equal(plan.runtimeBaseline, '24.22.1');
    assert.equal(plan.steps[0].id, 'runtime-exception-recheck');
    assert.match(plan.steps[0].what, /2026-10-22[\s\S]*Node 24\.22\.1 or later/);
    assert.deepEqual(check(moved(plan, 'runtime-exception-recheck', 1)),
      ['step 1: must be the 2026-10-22 hosted runtime exception re-check (Node 24.22.1 or later)']);
  });

  await t.test('a step whose prerequisite phase is not built or partial is refused', () => {
    // Phases held planned in memory so the test does not depend on how far
    // phases 150 and 147 have got on main.
    const held = phases.map(p => [147, 150].includes(p.id) ? { ...p, status: 'planned', owes: undefined } : p);
    const g9 = { ...copy(plan), steps: [...copy(plan.steps), { id: 'decisions-due', phase: 150, kind: 'env', what: 'Show decisions due for a check.', prerequisites: [150], ownerAttended: true, rollback: 'Hide it.', proof: 'A request.' }] };
    assert.deepEqual(check(g9, { phases: held, migrations }), [`step ${plan.steps.length + 1} (decisions-due): prerequisite phase 150 is planned, not built or partial; refused`]);
    // An existing step that comes to need an unbuilt phase.
    assert.deepEqual(check(edited(plan, 'drafts-gate', { prerequisites: [107, 147] }), { phases: held, migrations }),
      [`step ${index('drafts-gate') + 1} (drafts-gate): prerequisite phase 147 is planned, not built or partial; refused`]);
    // A phase that is no longer built refuses every step that needs it.
    const unbuilt = phases.map(p => p.id === 104 ? { ...p, status: 'planned', owes: undefined } : p);
    const refused = check(plan, { phases: unbuilt, migrations });
    const needing104 = plan.steps.filter(s => s.prerequisites.includes(104)).length;
    assert.equal(refused.filter(p => p.includes('prerequisite phase 104 is planned')).length, needing104);
    assert.ok(needing104 > 5);
    assert.deepEqual(check(edited(plan, 'drafts-gate', { prerequisites: [107, 9999] })),
      [`step ${index('drafts-gate') + 1} (drafts-gate): prerequisite phase 9999 does not exist; refused`]);
  });

  await t.test('prerequisites come first', () => {
    // The jobs gate dates its restore assertion from phase 101's step.
    assert.deepEqual(check(moved(plan, 'jobs-gate', index('restore-scope'))),
      [`step ${index('restore-scope') + 1} (jobs-gate): needs phase 101, but its step restore-scope comes after`]);
    // Every migration waits for the backup decision.
    assert.ok(check(moved(plan, 'backup-destination', index('migration-006'))).some(p => p.includes('(migration-004): needs phase 94, but its step backup-destination comes after')));
    // 013 owns job admission and must follow 010.
    const swapped = moved(plan, 'migration-013', index('migration-010'));
    assert.ok(check(swapped).some(p => p.startsWith('migrations: must run in file order')));
    assert.ok(check(swapped).some(p => p.includes('(migration-013): needs phase 105')));
    assert.deepEqual(check(edited(plan, 'drafts-gate', { prerequisites: [108] })),
      [`step ${index('drafts-gate') + 1} (drafts-gate): its own phase 107 must be among its prerequisites`, `step ${index('drafts-gate') + 1} (drafts-gate): needs phase 108, but its step fleet-trial-scope comes after`]);
  });

  await t.test('every step has a rollback and a proof, and hosted steps are owner-attended', () => {
    assert.deepEqual(check(edited(plan, 'migration-009', { rollback: ' ' })), [`step ${index('migration-009') + 1} (migration-009): has no rollback`]);
    assert.deepEqual(check(edited(plan, 'migration-009', { proof: '' })), [`step ${index('migration-009') + 1} (migration-009): has no proof to record`]);
    const { proof: _proof, ...noProof } = plan.steps[index('jobs-gate')];
    assert.match(check({ ...copy(plan), steps: plan.steps.map(s => s.id === 'jobs-gate' ? noProof : s) })[0], /\(jobs-gate\): needs exactly/);
    assert.deepEqual(check(edited(plan, 'jobs-gate', { ownerAttended: false })),
      [`step ${index('jobs-gate') + 1} (jobs-gate): a env step changes a hosted service, so the owner attends it`]);
    assert.deepEqual(check(edited(plan, 'jobs-gate', { kind: 'deploy' })),
      [`step ${index('jobs-gate') + 1} (jobs-gate): kind "deploy" is not one of migration, env, github-app, worker, schedule, decision`]);
    for (const s of plan.steps.filter(s => s.kind === 'migration')) assert.match(s.proof, /applied version: file name and SHA-256/, s.id);
  });

  await t.test('a phase or migration left out is incomplete', () => {
    assert.deepEqual(check(without(plan, s => s.phase === 99)), ['migration 006-private-media.sql: neither applied nor planned', 'phase 99: owes a walk or names a hosted gap, but has no step']);
    assert.deepEqual(check(without(plan, s => s.phase === 108)), ['phase 108: owes a walk or names a hosted gap, but has no step']);
    assert.deepEqual(check(without(plan, s => s.id === 'migration-011')), ['migration 011-model-routing.sql: neither applied nor planned']);
    assert.deepEqual(check(plan, { phases, migrations: [...migrations, '015-acme-later.sql'] }), ['migration 015-acme-later.sql: neither applied nor planned']);
    assert.deepEqual(check(edited(plan, 'migration-011', { migration: '011-acme.sql' })),
      ['migration 011-acme.sql: no such file in the web SQL folder', 'migration 011-model-routing.sql: neither applied nor planned']);
    const twice = { ...copy(plan), applied: [...copy(plan.applied), { migration: '004-decision-operations.sql', phase: 97, evidence: 'docs/evidence/acme.md' }] };
    assert.deepEqual(check(twice), ['migration 004-decision-operations.sql: listed 2 times']);
    // A newly partial G7 phase with a hosted gap needs a step.
    const more = [...phases, { id: 900, status: 'partial', goal: 'G7', note: 'Acme view implemented; hosted activation remains.' }];
    assert.deepEqual(check(plan, { phases: more, migrations }), ['phase 900: owes a walk or names a hosted gap, but has no step']);
  });

  await t.test('a hosted gap is read from the note, clause by clause', () => {
    const note = id => phases.find(p => p.id === id).note;
    assert.equal(hostedGap(note(95)), false, 'hosted SQL checks pass is not a gap');
    assert.equal(hostedGap(note(93)), false);
    for (const id of [97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107]) assert.equal(hostedGap(note(id)), true, `phase ${id}`);
    assert.equal(hostedGap('Hosted proof passed. Owner walk remains.'), false);
  });

  await t.test('the guide is generated from the plan and stays in sync', async () => {
    const expected = renderActivationGuide(plan);
    if (process.env.PLATES_WRITE_ACTIVATION_GUIDE === '1') await writeFile(GUIDE, expected);
    assert.equal(await readFile(GUIDE, 'utf8'), expected);
    assert.notEqual(renderActivationGuide(edited(plan, 'jobs-gate', { rollback: 'Acme.' })), expected);
    for (const s of plan.steps) assert.ok(expected.includes(`**${s.id}**`), s.id);
  });
});
