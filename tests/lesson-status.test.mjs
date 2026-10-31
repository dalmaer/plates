// Phase 148: every agent attempt says whether it taught something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionTrials } from '../lib/session-trials.mjs';
import { attemptProblem, attemptOutcome, lessonStatusProblem, checkLessonStatuses, readAttempts, captureByWeek, captureReading, isoWeek, LESSON_STATUS_SINCE } from '../lib/lesson-status.mjs';
import { measure, MEASURES, proposalText, readBounds } from '../lib/improve.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const spec = { version: 1, id: 'acme', provider: 'Acme', model: 'Acme-1', cohort: 'Acme-small', baseline: { contextTokens: null, atBoundary: true, maxHandoffs: 2 }, candidate: { contextTokens: 40000, atBoundary: true, maxHandoffs: 2 }, minPairs: 3, minImprovement: 0.1, maxRuns: 10, budgetMinutes: 200, reserveMinutes: 20, automatic: false };
const descriptor = id => ({ id, provider: 'Acme', model: 'Acme-1', cohort: 'Acme-small', task: `Acme task ${id}`, taskClass: 'Acme-test', sourceRevision: 'acme-rev', evidence: ['evidence/acme-admission'] });
const finish = (runId, extra = {}) => ({ runId, totalMinutes: 10, costUsd: null, costSource: null, accepted: true, verified: true, policyApplied: true, lostDecisions: 0, duplicateActions: 0, regressions: 0, rework: 0, contextPeakTokens: null, sourceRevision: 'acme-result', acceptanceEvidence: 'evidence/acme-acceptance', evidence: ['evidence/acme-full-workflow'], ...extra });

async function world(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-lesson-status-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates')); await writeFile(join(root, '.plates', 'plates.json'), '{"name":"Acme"}');
  const call = (action, record, extra = {}) => sessionTrials({ root, action, record, experiment: 'acme', yes: true, ...extra });
  await call('start', spec);
  return { root, call, state: join(root, '.plates/session-trials/acme/state.json') };
}

test('a failed attempt says what it taught', async t => {
  // The rule, alone.
  assert.equal(attemptOutcome(finish('a', { accepted: false })), 'failed');
  assert.equal(attemptOutcome(finish('a', { verified: false })), 'failed');
  assert.equal(attemptOutcome(finish('a', { rework: 2 })), 'reworked');
  assert.equal(attemptOutcome(finish('a')), 'ok');
  assert.equal(attemptProblem(finish('a')), null, 'an attempt that went well owes no status');
  assert.match(attemptProblem(finish('a', { accepted: false })), /failed attempt needs lessonStatus/);
  assert.match(attemptProblem(finish('a', { rework: 1 })), /reworked attempt needs lessonStatus/);
  assert.match(lessonStatusProblem({ status: 'captured' }), /captured needs a link/);
  for (const link of ['', 'docs/../secrets.md', '/etc/passwd', 'http://acme.test/x', 'lesson 38', 'C:\\acme']) assert.match(lessonStatusProblem({ status: 'captured', link }), /captured needs a link/, link);
  for (const link of ['docs/lessons.md#lesson-38', 'docs/inbox/2026-10-30-acme.md', '.plates/climb/lessons/acme.md', 'acme/storefront#12', 'https://github.com/acme/storefront/issues/12']) assert.equal(lessonStatusProblem({ status: 'captured', link }), null, link);
  assert.match(lessonStatusProblem({ status: 'known' }), /known needs the lesson/);
  assert.equal(lessonStatusProblem({ status: 'known', lesson: 'plates lesson 5: builders test by file' }), null);
  assert.equal(lessonStatusProblem({ status: 'none' }), null);
  assert.match(lessonStatusProblem({ status: 'none', link: 'docs/lessons.md' }), /none takes status only/);
  assert.match(lessonStatusProblem({ status: 'learned' }), /lessonStatus must be/);

  // The writer: refused before anything is stored.
  const w = await world(t);
  await w.call('begin', descriptor('r0'));
  const before = await readFile(w.state, 'utf8');
  await assert.rejects(w.call('finish', finish('r0', { accepted: false })), /failed attempt needs lessonStatus/);
  await assert.rejects(w.call('finish', finish('r0', { accepted: false, lessonStatus: { status: 'captured' } })), /captured needs a link/);
  await assert.rejects(w.call('finish', finish('r0', { rework: 1, lessonStatus: { status: 'known', lesson: '' } })), /known needs the lesson/);
  await assert.rejects(w.call('finish', finish('r0', { accepted: false }), { yes: false }), /failed attempt needs lessonStatus/, 'a preview says so too');
  assert.equal(await readFile(w.state, 'utf8'), before, 'a refused finish writes nothing');
  const done = await w.call('finish', finish('r0', { accepted: false, lessonStatus: { status: 'captured', link: 'docs/inbox/2026-10-30-acme.md' } }));
  assert.deepEqual(done.runs[0].finish.lessonStatus, { status: 'captured', link: 'docs/inbox/2026-10-30-acme.md' });
  await w.call('begin', descriptor('r1'));
  await w.call('finish', finish('r1'));
  assert.deepEqual((await checkLessonStatuses(w.root)).findings, []);

  // A ledger from before the rule replays and passes; a finish after it without a status fails the gate.
  const ledger = JSON.parse(await readFile(w.state, 'utf8'));
  const old = new Date(Date.parse(LESSON_STATUS_SINCE) - DAY).toISOString();
  ledger.events.push({ action: 'begin', record: descriptor('r2'), at: old }, { action: 'finish', record: finish('r2', { verified: false }), at: old });
  await writeFile(w.state, JSON.stringify(ledger));
  assert.equal((await w.call('status')).runs.length, 3, 'an earlier record without the field still replays');
  assert.deepEqual((await checkLessonStatuses(w.root)).findings, [], 'the rule applies to new records only');
  const late = new Date(Date.parse(LESSON_STATUS_SINCE) + DAY).toISOString();
  ledger.events.push({ action: 'begin', record: descriptor('r3'), at: late }, { action: 'finish', record: finish('r3', { rework: 1 }), at: late });
  ledger.events.push({ action: 'begin', record: descriptor('r4'), at: late }, { action: 'finish', record: finish('r4', { accepted: false, lessonStatus: { status: 'captured', link: '' } }), at: late });
  await writeFile(w.state, JSON.stringify(ledger));
  const gate = await checkLessonStatuses(w.root);
  assert.deepEqual(gate.findings.map(f => [f.id, f.outcome]), [['acme/r3', 'reworked'], ['acme/r4', 'failed']]);
  assert.match(gate.findings[0].problem, /needs lessonStatus/);
  assert.match(gate.findings[1].problem, /captured needs a link/);
  await assert.rejects(w.call('status'), /captured needs a link/, 'the replay refuses a malformed status too');

  // An unreadable ledger is a gap, never an empty pass.
  await mkdir(join(w.root, '.plates/session-trials/broken'));
  await writeFile(join(w.root, '.plates/session-trials/broken/state.json'), '{not json');
  assert.deepEqual((await checkLessonStatuses(w.root)).gaps, [{ source: 'broken', reason: 'unreadable ledger' }]);

  // The gate runs it on this repository's own records.
  assert.deepEqual(await checkLessonStatuses(REPO), { findings: [], gaps: [] });
});

test('health measures capture', async t => {
  assert.equal(isoWeek(Date.parse('2026-10-30T12:00:00Z')), '2026-W44');
  assert.equal(isoWeek(Date.parse('2021-01-03T12:00:00Z')), '2020-W53');
  assert.equal(isoWeek(Date.parse('2024-12-30T12:00:00Z')), '2025-W01');

  // Counts by week, over a month: a week where most failures taught nothing is flagged.
  const now = Date.parse('2026-10-30T12:00:00Z');
  const at = days => new Date(now - days * DAY).toISOString();
  const attempts = [
    { id: 'acme/a', at: at(0), outcome: 'failed', status: 'none' },
    { id: 'acme/b', at: at(1), outcome: 'reworked', status: 'none' },
    { id: 'acme/c', at: at(1), outcome: 'failed', status: 'captured' },
    { id: 'acme/d', at: at(2), outcome: 'ok', status: null },
    { id: 'acme/e', at: at(8), outcome: 'failed', status: 'known' },
    { id: 'acme/f', at: at(8), outcome: 'failed', status: 'none' },
    { id: 'acme/g', at: at(15), outcome: 'failed', status: null },
    { id: 'acme/h', at: at(40), outcome: 'failed', status: 'none' },
  ];
  const weeks = captureByWeek(attempts, { now });
  assert.deepEqual(weeks.map(w => [w.week, w.failed, w.captured, w.known, w.none, w.missing, w.share]), [
    ['2026-W41', 0, 0, 0, 0, 0, null], ['2026-W42', 1, 0, 0, 0, 1, null], ['2026-W43', 2, 0, 1, 1, 0, 50], ['2026-W44', 3, 1, 0, 2, 0, 67],
  ], 'an ok attempt and one older than four weeks are not counted; a missing status is not a share');
  const reading = captureReading(attempts, { now, bound: 50 });
  assert.equal(reading.value, 67);
  assert.deepEqual(reading.facts.flagged, ['2026-W44']);
  assert.equal(reading.facts.worst, '2026-W44');
  assert.match(reading.detail, /1 without a status/);
  assert.match(captureReading(attempts.slice(3, 4), { now }).na, /no failed or reworked agent attempt with a lesson status/);

  // The measure, through plates improve's instrument, on real ledgers.
  const one = MEASURES.filter(m => m.id === 'failures_untaught');
  assert.equal(one.length, 1);
  assert.equal(one[0].bound, 50);
  assert.equal((await readBounds(REPO)).failures_untaught, 50, '.plates/bounds.json carries the bound');
  const w = await world(t);
  await w.call('begin', descriptor('r0')); await w.call('finish', finish('r0', { accepted: false, lessonStatus: { status: 'none' } }));
  await w.call('begin', descriptor('r1')); await w.call('finish', finish('r1', { rework: 1, lessonStatus: { status: 'none' } }));
  await w.call('begin', descriptor('r2')); await w.call('finish', finish('r2', { verified: false, lessonStatus: { status: 'known', lesson: 'plates lesson 29' } }));
  const written = (await readAttempts(w.root)).attempts;
  assert.equal(written.length, 3);
  const week = isoWeek(Date.parse(written[0].at)); // the records' own week, never the clock's at assertion time
  const [out] = await measure({ root: w.root, config: {}, env: {}, measures: one, bounds: { failures_untaught: 50 } });
  assert.equal(out.state, 'outside', out.detail);
  assert.equal(out.value, 67);
  assert.equal(out.unit, '%');
  const proposal = proposalText(out);
  assert.equal(out.facts.worst, week);
  assert.match(proposal, new RegExp(week));
  assert.match(proposal, /acme\/r0, acme\/r1/);
  assert.match(proposal, /67% against 50%/);
  await w.call('begin', descriptor('r3')); await w.call('finish', finish('r3', { accepted: false, lessonStatus: { status: 'captured', link: 'docs/lessons.md#lesson-60' } }));
  const [held] = await measure({ root: w.root, config: {}, env: {}, measures: one, bounds: { failures_untaught: 50 } });
  assert.equal(held.state, 'ok', 'half taught nothing: not most');
  assert.equal(held.value, 50);

  // No records is n/a, never a zero; the shipped script without plates says it reads plates-side.
  const empty = await realpath(await mkdtemp(join(tmpdir(), 'acme-lesson-empty-')));
  t.after(() => rm(empty, { recursive: true, force: true }));
  const [none] = await measure({ root: empty, config: {}, env: {}, measures: one });
  assert.equal(none.state, 'n/a'); assert.match(none.detail, /no agent attempt records/);
  const shipped = await import('../practices/night/files/scripts/plates/improve.mjs');
  const [away] = await shipped.measure({ root: empty, config: {}, env: {}, measures: shipped.MEASURES.filter(m => m.id === 'failures_untaught') });
  assert.equal(away.state, 'n/a'); assert.match(away.detail, /plates-side/);
});
