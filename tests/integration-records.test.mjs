// Read-only delivery timing summaries, using only synthetic Acme records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationRuns, integrationSummary } from '../lib/integration-records.mjs';

const run = extra => ({ schema: 1, kind: 'integrate', startedAt: '2026-11-13T00:00:00Z', outcome: 'nothing-ready', ...extra });
const summary = runs => integrationSummary({ runs, skipped: 0 }).measurements;
const absent = { samples: 0, missing: 0, totalMs: null, p50Ms: null, p90Ms: null };

test('empty and unavailable observations are not measured zero', () => {
  assert.deepEqual(summary([]), { runMs: absent, gateMs: absent, recordCheckMs: absent,
    gates: { unavailableRuns: 0, notRun: 0, unknownMode: 0 } });
  assert.deepEqual(summary([run({})]), { runMs: { ...absent, missing: 1 }, gateMs: absent, recordCheckMs: absent,
    gates: { unavailableRuns: 1, notRun: 0, unknownMode: 0 } });
  assert.deepEqual(summary([run({ ms: 0, gates: [] })]).runMs,
    { samples: 1, missing: 0, totalMs: 0, p50Ms: 0, p90Ms: 0 });
});

test('timings separate full gates, record checks, not-run and unknown modes', () => {
  const actual = summary([run({ ms: 300, gates: [
    { mode: 'gate', ms: 100 }, { mode: 'record-checks', ms: 2 },
    { mode: 'not-run', ms: 0 }, { mode: 'future-mode', ms: 1 }, null,
  ] }), run({ ms: 100, gates: [{ mode: 'gate', ms: 200 }, { mode: 'gate' }] })]);
  assert.deepEqual(actual.runMs, { samples: 2, missing: 0, totalMs: 400, p50Ms: 100, p90Ms: 300 });
  assert.deepEqual(actual.gateMs, { samples: 2, missing: 1, totalMs: 300, p50Ms: 100, p90Ms: 200 });
  assert.deepEqual(actual.recordCheckMs, { samples: 1, missing: 0, totalMs: 2, p50Ms: 2, p90Ms: 2 });
  assert.deepEqual(actual.gates, { unavailableRuns: 0, notRun: 1, unknownMode: 2 });
});

test('invalid durations remain missing and nearest-rank percentiles use observed samples only', () => {
  const values = [9, 1, 10, 2, 8, 3, 7, 4, 6, 5, -1, null, undefined, '20', NaN, Infinity];
  const runs = values.map(ms => run({ ms, gates: [{ mode: 'gate', ms }] }));
  const before = structuredClone(runs);
  const actual = summary(runs);
  const expected = { samples: 10, missing: 6, totalMs: 55, p50Ms: 5, p90Ms: 9 };
  assert.deepEqual(actual.runMs, expected);
  assert.deepEqual(actual.gateMs, expected);
  assert.deepEqual(runs, before, 'summarizing must not mutate original receipts');
});

test('retention gaps and legacy summary fields survive additive measurements', () => {
  const records = integrationRuns([JSON.stringify(run({ ms: 4, gates: [] })), 'not json', '{}'].join('\n'));
  const actual = integrationSummary(records);
  assert.equal(actual.runs, 1);
  assert.equal(actual.skipped, 2);
  assert.equal(actual.landedNothing, 1);
  assert.equal(actual.outcomes['nothing-ready'], 1);
  assert.equal(actual.recent[0].ms, 4);
  assert.equal(actual.measurements.runMs.samples, 1);
  assert.equal(actual.measurements.gates.unavailableRuns, 0);
});
