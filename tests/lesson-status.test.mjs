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

test('robot and conductor attempts say what they taught', async t => {
  const { robotComment, robotLessonStatus } = await import('../scripts/plates/robot.mjs');
  const { markerHeader } = await import('../practices/night/files/scripts/plates/names.mjs');
  const { readEvidenceAttempts, readRobotAttempts, robotAttempts: attemptsOf, evidenceAttempt, lessonCapture } = await import('../lib/lesson-status.mjs');
  const robotAttempts = comments => attemptsOf(comments, markerHeader);
  const late = new Date(Date.parse(LESSON_STATUS_SINCE) + DAY), lateDay = late.toISOString().slice(0, 10);
  const old = new Date(Date.parse(LESSON_STATUS_SINCE) - 3 * DAY), oldDay = old.toISOString().slice(0, 10);

  // The robot: its final report's last `Lesson status:` line, kept as written.
  assert.deepEqual(robotLessonStatus('Done.\nLesson status: {"status":"none"}\n'), { status: 'none' });
  assert.deepEqual(robotLessonStatus('Lesson status: {"status":"none"}\nmore\nLesson status: {"status":"known","lesson":"plates lesson 5"}'), { status: 'known', lesson: 'plates lesson 5' });
  for (const m of ['', 'Done.', 'Lesson status: none', 'Lesson status: {not json}', 'Lesson status: ["none"]', ' Lesson status: {"status":"none"}']) assert.equal(robotLessonStatus(m), undefined, m);

  // Its end-of-attempt record, the robot-state marker, says how the attempt ended and carries the status.
  const bot = { type: 'Bot', login: 'github-actions[bot]' }, posted = [];
  const github = async ({ method, path, body }) => {
    if (method === 'POST') { posted.push({ id: 1000 + posted.length, user: bot, body: body.body, path }); return { status: 201, data: { id: 1000 + posted.length } }; }
    if (path.startsWith('/repos/acme/anvils/issues/comments?')) return { status: 200, data: path.includes('page=1') ? posted : [] };
    return { status: 200, data: [] };
  };
  const plan = n => ({ repo: 'acme/anvils', issueNumber: n, issueHash: 'a'.repeat(64), cursor: 1, instanceId: `issue-${n}`, previousHead: null });
  await robotComment({ plan: plan(1), result: { state: 'failed', reason: 'Agent or trusted judge failed; no PR published.' }, message: 'Tried.\nLesson status: {"status":"known","lesson":"plates lesson 5 --> <b>x</b> & more"}', github, now: late });
  await robotComment({ plan: plan(2), result: { state: 'failed', reason: 'Agent or trusted judge failed; no PR published.' }, message: 'No status.', github, now: late });
  await robotComment({ plan: { ...plan(3), previousHead: 'b'.repeat(40) }, result: { state: 'published', headSha: 'c'.repeat(40), reason: 'Published.' }, message: 'Lesson status: {"status":"captured"}', github, now: late });
  await robotComment({ plan: plan(4), result: { state: 'published', headSha: 'c'.repeat(40), reason: 'Published.' }, message: 'Done.', github, now: late });
  assert.equal(posted.length, 4);
  assert.ok(!posted[0].body.split('\n')[1].slice(4, -4).includes('-->'), "the agent's words cannot close the marker");
  const states = robotAttempts(posted).map(a => a.state);
  assert.deepEqual(states.map(s => [s.issueNumber, s.verified, s.rework, s.lessonStatus]), [
    [1, false, 0, { status: 'known', lesson: 'plates lesson 5 --> <b>x</b> & more' }], [2, false, 0, undefined], [3, true, 1, { status: 'captured' }], [4, true, 0, undefined],
  ]);
  assert.deepEqual(robotAttempts([{ ...posted[0], user: { type: 'User', login: 'acme' } }]), [], "only the robot's own records count");

  // Checked the same way: a failed robot attempt without a status, or a malformed one, is a finding.
  const legacy = { id: 2000, user: bot, body: `<!-- plates:robot-note ${'d'.repeat(64)} -->\n<!-- plates:robot-state ${JSON.stringify({ repo: 'acme/anvils', issueNumber: 5, issueHash: 'a'.repeat(64), cursor: 1, instanceId: 'issue-5', headSha: null, completedAt: late.toISOString(), previousCompletedAt: null })} -->\nDone.` };
  const older = { ...legacy, id: 2001, body: legacy.body.replace(late.toISOString(), old.toISOString()) };
  posted.push(legacy, older);
  const robot = await readRobotAttempts({ repo: 'acme/anvils', github, now: late.getTime() + DAY });
  assert.deepEqual(robot.gaps, []);
  assert.deepEqual(robot.attempts.map(a => [a.id, a.outcome, a.status, Boolean(a.problem)]), [
    ['acme/anvils#1@1000', 'failed', 'known', false],
    ['acme/anvils#2@1001', 'failed', null, true],
    ['acme/anvils#3@1002', 'reworked', 'captured', true],
    ['acme/anvils#4@1003', 'ok', null, false],
    ['acme/anvils#5@2000', 'unknown', null, false],
  ], 'a robot state from before the record says no outcome: listed from the rule on, never judged');
  assert.match(robot.attempts[1].problem, /failed attempt needs lessonStatus/);
  assert.match(robot.attempts[2].problem, /captured needs a link/);
  const unread = await readRobotAttempts({ repo: 'acme/anvils', github: async () => ({ status: 403 }), now: late.getTime() });
  assert.deepEqual(unread.attempts, []); assert.match(unread.gaps[0].reason, /robot attempt records unread/, 'an unread history is a gap, never empty');

  // The conductor: the evidence file's front matter is its end-of-attempt record.
  assert.equal(evidenceAttempt('# Evidence\n'), null);
  assert.equal(evidenceAttempt('---\nother: 1\n---\n# Evidence\n'), null);
  assert.deepEqual(evidenceAttempt('---\nattempt: {"accepted":true,"verified":true,"rework":0}\n---\n'), { record: { accepted: true, verified: true, rework: 0 } });
  for (const bad of ['---\nattempt: {"verified":"yes"}\n---\n', '---\nattempt: {"rework":-1}\n---\n', '---\nattempt: {"shipped":true}\n---\n', '---\nattempt: nope\n---\n', '---\nattempt: {}\n']) assert.ok(evidenceAttempt(bad).problem, bad);
  const w = await world(t), evidence = join(w.root, 'docs', 'evidence');
  await mkdir(evidence, { recursive: true });
  const front = attempt => `---\nattempt: ${JSON.stringify(attempt)}\n---\n# Evidence: acme\n`;
  await writeFile(join(evidence, `${lateDay}-taught.md`), front({ accepted: true, verified: true, rework: 2, lessonStatus: { status: 'known', lesson: 'plates lesson 5' } }));
  await writeFile(join(evidence, `${lateDay}-quiet.md`), front({ accepted: false, verified: true, rework: 0 }));
  await writeFile(join(evidence, `${lateDay}-unlinked.md`), front({ accepted: true, verified: false, lessonStatus: { status: 'captured' } }));
  await writeFile(join(evidence, `${lateDay}-fine.md`), front({ accepted: true, verified: true, rework: 0 }));
  await writeFile(join(evidence, `${lateDay}-legacy.md`), '# Evidence: acme, written without the record\n');
  await writeFile(join(evidence, `${oldDay}-older.md`), '# Evidence: acme, before the rule\n');
  await writeFile(join(evidence, `${oldDay}-older-quiet.md`), front({ accepted: false }));
  const conductor = await readEvidenceAttempts(w.root);
  assert.deepEqual(conductor.attempts.map(a => [a.id, a.outcome, a.status, Boolean(a.problem)]), [
    [`evidence/${oldDay}-older-quiet.md`, 'failed', null, false],
    [`evidence/${lateDay}-fine.md`, 'ok', null, false],
    [`evidence/${lateDay}-legacy.md`, 'unknown', null, false],
    [`evidence/${lateDay}-quiet.md`, 'failed', null, true],
    [`evidence/${lateDay}-taught.md`, 'reworked', 'known', false],
    [`evidence/${lateDay}-unlinked.md`, 'failed', 'captured', true],
  ], 'evidence without the record stays valid and is listed from the rule on; earlier records keep the earlier rule');

  // One gate over all three records.
  const gate = await checkLessonStatuses(w.root, { robot: { repo: 'acme/anvils', github, now: late.getTime() + DAY } });
  assert.deepEqual(gate.findings.map(f => [f.source, f.id]), [
    ['conductor', `evidence/${lateDay}-quiet.md`], ['conductor', `evidence/${lateDay}-unlinked.md`], ['robot', 'acme/anvils#2@1001'], ['robot', 'acme/anvils#3@1002'],
  ]);
  assert.deepEqual((await checkLessonStatuses(w.root)).findings.map(f => f.source), ['conductor', 'conductor'], 'without a repository the robot is not read');

  // failures_untaught counts them, and lists the ones without a status as untaught.
  await writeFile(join(w.root, '.plates', 'plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/anvils', robot: { on: true, budgetMinutes: 60 } }));
  const reading = await lessonCapture({ root: w.root, now: late.getTime() + DAY, github });
  const week = reading.facts.weeks.find(r => r.week === isoWeek(late.getTime()));
  assert.deepEqual([week.failed, week.captured, week.known, week.none, week.missing], [7, 2, 2, 0, 5], 'a failure written before the rule counts as without a status');
  assert.deepEqual(week.unstated.sort(), ['acme/anvils#2@1001', 'acme/anvils#5@2000', `evidence/${lateDay}-legacy.md`, `evidence/${lateDay}-quiet.md`, `evidence/${oldDay}-older-quiet.md`].sort());
  assert.match(reading.detail, /5 without a status, listed as untaught/);
  assert.equal(reading.value, 0);
});
