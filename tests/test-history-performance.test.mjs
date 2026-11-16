// Operation counts catch quadratic regressions without wall-clock thresholds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slower, failureMemory } from '../practices/night/files/scripts/plates/test-ledger.mjs';
import { evaluateTimeEvidence } from '../practices/night/files/scripts/plates/time-measures.mjs';
import { roadmapOf } from '../lib/work-items.mjs';
import { nextPhase } from '../practices/phases/files/scripts/roadmap.mjs';

const now = Date.parse('2026-11-16T12:00:00Z'), size = 200;
function history(count, observe = () => {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `acme-${i}`, date: new Date(now - (count - i) * 86400000).toISOString(),
    dirty: false, tree: 'acme', commit: 'a'.repeat(40), completed: true,
    dir: '.', config: 'acme', flags: [], commandHash: 'acme',
    machine: { os: 'linux', arch: 'x64', cpus: 4 },
    busy: { start: { load: [0], cores: 4 }, end: { load: [0], cores: 4 } },
    suite: { complete: true, selectionComplete: true, aggregate: { success: true } },
    tests: Array.from({ length: size }, (_, j) => ({
      file: 'tests/acme.test.mjs', get name() { observe(); return `Acme ${j}`; },
      outcome: 'pass', ms: i === count - 1 ? 500 : 100,
    })),
  }));
}

test('slower indexes history once and preserves first duplicates and passing windows', () => {
  let reads = 0;
  const runs = history(5, () => reads++);
  runs[0].tests.unshift({ ...runs[0].tests[0], outcome: 'fail' });
  // A later passing duplicate must not replace the first failed observation.
  assert.equal(slower(runs, { window: 4 }).length, size - 1);
  assert.equal(slower(runs, { window: 3 }).length, size);
  assert.ok(reads < 20 * size * runs.length, `bounded identity reads: ${reads}`);
});

test('failure memory indexes prior outcomes and computes flakiness once', () => {
  let reads = 0;
  const runs = history(4, () => reads++);
  for (const r of [runs[1], runs[3]]) for (const t of r.tests) Object.assign(t, { outcome: 'fail', error: 'Acme failure' });
  const found = failureMemory(runs);
  assert.equal(found.length, size);
  assert.ok(found.every(f => f.repeat && f.runs.length === 4));
  assert.ok(reads < 20 * size * runs.length, `bounded identity reads: ${reads}`);
});

test('time evidence indexes duplicate identities and hashes flags once per run', () => {
  let reads = 0, flags = 0;
  const runs = history(10, () => reads++);
  for (const r of runs) {
    for (const t of r.tests) t.outcome = 'inconclusive';
    r.flags = [Object.defineProperty({}, 'acme', { enumerable: true, get() { flags++; return true; } })];
    r.tests.push({ ...r.tests[0], outcome: 'inconclusive' });
    r.tests.push({ ...r.tests[1], describe: true });
  }
  const result = evaluateTimeEvidence({ measure: 'inconclusive_share', runs, at: now });
  assert.equal(result.state, 'outside');
  assert.equal(result.timeCandidates.length, size); // duplicate omitted, describe remains distinct
  assert.ok(result.timeCandidates.every(c => c.identity.target.name !== 'Acme 0'));
  assert.ok(reads < 20 * size * runs.length, `bounded identity reads: ${reads}`);
  assert.ok(flags <= runs.length * 2, `flags hashed per run: ${flags}`);
});

test('backlog readiness matches nextPhase with one dependency index', () => {
  let reads = 0;
  const phases = Array.from({ length: size }, (_, i) => ({
    get id() { reads++; return i + 1; }, title: `Acme ${i}`, depends: i ? [i] : [],
    status: i % 3 ? 'planned' : 'built', goal: i % 7 ? 'G1' : 'retired',
    ...(i % 11 === 0 ? { after: '2027-01-01' } : {}),
    ...(i % 13 === 0 ? { status: 'partial', owes: 'walk' } : {}),
  }));
  const expected = phases.filter(p => nextPhase(phases, x => x === p && x.goal !== 'retired', '2026-11-16'));
  reads = 0;
  const project = { id: 'acme', state: 'complete', roadmap: { phases, goals: [{ id: 'retired', retired: true }] } };
  const actual = roadmapOf(project, { state: 'read', claims: [], prs: [] }, { now });
  assert.deepEqual(actual.free, expected);
  assert.ok(reads < size * 10, `bounded dependency reads: ${reads}`);
});
