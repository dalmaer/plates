// Recurring (plates phase 185): every routine a plate runs, read from its
// workflows' crons, its .plates/plates.json, its night record and its latest
// runs. Pure: synthetic Acme inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routinesOf, cronNext, cronShape, parseCron, linksOf, recurringConfig, routineWords, timeText, ROUTINES } from '../lib/web/recurring-model.mjs';

const NOW = '2026-11-05T12:00:00Z'; // a Thursday
const wf = (id, crons, more = {}) => ({ path: `.github/workflows/plates-${id}.yml`, name: `plates-${id}`, crons, triggers: crons.length ? ['schedule', 'workflow_dispatch'] : ['pull_request'], ...more });
const acme = (more = {}) => ({ projectId: 'anvils', projectName: 'Acme Anvils',
  config: { practices: ['night', 'climb', 'cross-review', 'delivery'], climb: { schedule: 'nightly', budget: { minutes: 40 } }, tend: { schedule: 'weekly' }, robot: { on: true, budgetMinutes: 60 }, ...more.config },
  workflows: more.workflows ?? [wf('night', ['23 7 * * *']), wf('climb', ['17 10 * * *']), wf('tend', ['18 10 * * 1']), wf('morning', ['7 17 * * *']), wf('robot', ['37 11 * * 1']),
    wf('cross-review', []), wf('publish', []), { path: '.github/workflows/acme-sweep.yml', name: 'Acme sweep', crons: ['0 */6 * * *'], triggers: ['schedule'] }, { path: '.github/workflows/check.yml', name: 'check', crons: [], triggers: ['push'] }],
  daily: more.daily ?? { state: 'read', date: '2026-11-05', counts: { done: 3, failed: 0 }, allocatedMinutes: 120 },
  runs: more.runs ?? { state: 'read', items: [{ path: '.github/workflows/plates-climb.yml', name: 'plates-climb', status: 'completed', conclusion: 'success', at: '2026-11-05T10:31:00Z', url: 'https://github.com/acme/anvils/actions/runs/1' },
    { path: '.github/workflows/plates-climb.yml', name: 'plates-climb', status: 'completed', conclusion: 'failure', at: '2026-11-04T10:31:00Z', url: 'https://github.com/acme/anvils/actions/runs/0' }] } });

test('each routine once, next run from its cron', () => {
  const { routines, gaps } = routinesOf(acme(), { now: NOW });
  // plates's routines in their order, then any other scheduled workflow; an unscheduled workflow that is not a routine is not listed.
  assert.deepEqual(routines.map(r => r.id), ['night', 'climb', 'tend', 'morning', 'robot', 'cross-review', 'publish', '.github/workflows/acme-sweep.yml']);
  assert.equal(new Set(routines.map(r => r.workflow)).size, routines.length, 'each workflow once');
  const by = Object.fromEntries(routines.map(r => [r.id, r]));
  // The next run, in UTC, from the cron and the time it is read.
  assert.equal(by.night.nextRun, '2026-11-06T07:23:00.000Z');
  assert.equal(by.climb.nextRun, '2026-11-06T10:17:00.000Z', 'today\'s 10:17 has passed');
  assert.equal(by.morning.nextRun, '2026-11-05T17:07:00.000Z', 'later today');
  assert.equal(by.tend.nextRun, '2026-11-09T10:18:00.000Z', 'the next Monday');
  assert.equal(by['.github/workflows/acme-sweep.yml'].nextRun, '2026-11-05T18:00:00.000Z');
  assert.equal(by.publish.nextRun, null, 'an event-driven routine has no next run');
  assert.deepEqual(by.publish.crons, []);
  assert.deepEqual(by.night.shapes, [{ cadence: 'daily', at: '07:23', cron: '23 7 * * *', next: '2026-11-06T07:23:00.000Z' }]);
  assert.deepEqual(by.tend.shapes, [{ cadence: 'weekly', days: ['Mondays'], at: '10:18', cron: '18 10 * * 1', next: '2026-11-09T10:18:00.000Z' }]);
  assert.deepEqual(gaps, []);
  // The last result: the night record for night, the latest run for the rest, and plainly none when nothing was read.
  assert.deepEqual(by.night.last, { result: 'done', at: '2026-11-05', url: null, from: 'night journal' });
  assert.deepEqual(by.climb.last, { result: 'success', at: '2026-11-05T10:31:00Z', url: 'https://github.com/acme/anvils/actions/runs/1', from: 'workflow run' });
  assert.equal(by.tend.last.none, 'no run in the latest runs read');
  const unread = routinesOf(acme({ runs: { state: 'unavailable', why: 'saving GitHub quota' } }), { now: NOW });
  assert.equal(unread.routines.find(r => r.id === 'climb').last.none, 'last run not read: saving GitHub quota');
  assert.equal(unread.routines.find(r => r.id === 'night').last.from, 'night journal', 'the journal needs no Actions read');
  // Budgets, with the key each comes from.
  assert.deepEqual([by.climb.budget, by.tend.budget, by.robot.budget, by.night.budget, by.morning.budget],
    [{ minutes: 40, key: 'climb.budget.minutes' }, { minutes: 30, key: 'tend.budget.minutes (default)' }, { minutes: 60, key: 'robot.budgetMinutes', per: 'week' }, { minutes: 120, key: 'night record 2026-11-05' }, null]);
  // Config and workflow agree: nothing to show twice.
  assert.equal(by.climb.disagrees, false); assert.equal(by.tend.disagrees, false);
  // A config that disagrees with its workflow shows both: climb weekly, its cron daily.
  const weekly = routinesOf(acme({ config: { climb: { schedule: 'weekly' } } }), { now: NOW }).routines.find(r => r.id === 'climb');
  assert.deepEqual([weekly.config, weekly.disagrees, weekly.crons, weekly.nextRun], [{ key: 'climb.schedule', value: 'weekly' }, true, ['17 10 * * *'], '2026-11-06T10:17:00.000Z']);
  // A cron this reader cannot evaluate gets no next run, and a gap says so; nothing is guessed.
  const odd = routinesOf(acme({ workflows: [wf('night', ['@daily'])] }), { now: NOW });
  assert.equal(odd.routines[0].nextRun, null); assert.match(odd.gaps[0].reason, /cannot evaluate/);
  // The cron reader itself.
  assert.equal(cronNext('0 0 1 1 *', NOW), '2027-01-01T00:00:00.000Z');
  assert.equal(cronNext('30 9 * * 1-5', '2026-11-07T00:00:00Z'), '2026-11-09T09:30:00.000Z', 'a weekday cron skips the weekend');
  assert.equal(cronNext('0 12 13 * 5', NOW), '2026-11-06T12:00:00.000Z', 'both day fields restricted: either matches');
  assert.equal(cronNext('0 0 * * 7', NOW), '2026-11-08T00:00:00.000Z', 'Sunday is 0 or 7');
  assert.equal(cronNext('0 0 30 2 *', NOW), null, 'never: no time is invented');
  for (const bad of ['* * * *', '61 * * * *', 'a b c d e', '*/0 * * * *', '5-1 * * * *']) assert.equal(parseCron(bad), null, bad);
  assert.deepEqual(cronShape('*/15 * * * *'), { cadence: 'other', cron: '*/15 * * * *' });
  assert.equal(ROUTINES.length, 7);
  // In words, in a time zone: the schedule in the owner's zone, the next run, the last result and the budget.
  const la = { timeZone: 'America/Los_Angeles' };
  assert.deepEqual(routineWords(by.night, la), { schedule: 'daily at 23:23 PST', config: null, next: 'next Thu, Nov 5, 23:23 PST', last: 'last done (2026-11-05)', budget: 'budget 120 min (night record 2026-11-05)' });
  assert.equal(routineWords(by.tend).schedule, 'weekly on Mon, 10:18 UTC');
  assert.equal(routineWords(by.publish).schedule, 'on pull_request');
  assert.equal(routineWords(weekly).config, 'climb.schedule: weekly (the workflow\'s cron says otherwise; both shown)');
  assert.equal(timeText('nope', 'time'), 'unknown');
});

test('an off routine says why', () => {
  const off = routinesOf(acme({ config: { robot: { on: false, budgetMinutes: 60 }, practices: ['night', 'climb', 'delivery'] } }), { now: NOW });
  const by = Object.fromEntries(off.routines.map(r => [r.id, r]));
  assert.deepEqual([by.robot.state, by.robot.off, by.robot.nextRun], ['off', { key: 'robot.on', why: 'robot.on is false' }, null]);
  assert.deepEqual([by['cross-review'].state, by['cross-review'].off], ['off', { key: 'practices', why: '"practices" does not include cross-review' }]);
  assert.equal(by.night.state, 'on');
  // No robot key at all: off, and the key that turns it on is named.
  const unset = routinesOf(acme({ config: { robot: undefined } }), { now: NOW }).routines.find(r => r.id === 'robot');
  assert.deepEqual(unset.off, { key: 'robot.on', why: 'robot.on is not true (the robot stays off until the owner turns it on)' });
  // An off routine keeps its schedule and its last result: only its next run is withheld.
  assert.deepEqual(by.robot.crons, ['37 11 * * 1']);
});

test('links and the config read are only what Recurring needs', () => {
  const config = { canvas: { home: 'https://acme.example/canvas', projectKey: 'secret-ish' }, delivery: { site: 'https://anvils.acme.example', vercel: { checkout: '/Users/acme' } }, robot: { on: true, budgetMinutes: 5, extra: 1 }, practices: ['night'] };
  assert.deepEqual(linksOf({ id: 'anvils', name: 'Acme Anvils', repo: 'acme/anvils' }, config), { projectId: 'anvils', projectName: 'Acme Anvils', repo: 'https://github.com/acme/anvils', canvas: 'https://acme.example/canvas', production: 'https://anvils.acme.example' });
  assert.equal(linksOf({ id: 'x', repo: 'acme/x' }, { canvas: { home: 'javascript:alert(1)' } }).canvas, null, 'only https links');
  assert.deepEqual(recurringConfig(config), { practices: ['night'], robot: { on: true, budgetMinutes: 5 }, canvas: { home: 'https://acme.example/canvas' }, delivery: { site: 'https://anvils.acme.example' } });
});
