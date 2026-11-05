// The waits' reads (plates phase 158, increment 2): lib/integration-observations.mjs
// builds delays()'s observations from a synthetic Acme repository's REST answers
// (tests/helpers/waits.mjs), a fixed clock and an in-process api. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readObservations, waitsModel, waitsSourceOf, projectWaits, WAITS_REQUESTS } from '../lib/integration-observations.mjs';
import { homeSnapshot, waitsFixes } from '../lib/work-items.mjs';
import { waitsFixture, fakeApi, SHAS } from './helpers/waits.mjs';

const NOW = Date.parse('2026-11-04T18:30:00Z');
const REPO = 'acme/anvils';
const SOURCE = waitsSourceOf({ practices: ['delivery'], delivery: { tested: 'green', promote: 'vercel:anvils' } });
const ALL = { pulls: true, checks: true, activity: true };
const read = async ({ answers = waitsFixture(REPO, NOW), can = ALL, fail } = {}) => {
  const f = fakeApi(answers, { fail });
  const got = await readObservations({ repo: REPO, api: f.api, now: NOW, source: SOURCE, can });
  return { ...got, model: waitsModel(got.observations, got.gaps, { now: NOW }), asked: f.asked };
};
const item = (model, branch) => model.items.find(i => i.branch === branch);

test('the switch: waits are read on a plate with the delivery practice, and off without it', () => {
  assert.deepEqual(waitsSourceOf({ practices: ['delivery'] }), { on: true, reason: null, tested: 'green', deploys: false });
  assert.equal(SOURCE.deploys, true, 'a Vercel target records deploys');
  const off = waitsSourceOf({ practices: ['phases'] });
  assert.equal(off.on, false);
  assert.match(off.reason, /delivery practice is off/);
});

test('refs, activity, PRs, check runs, compares and deploy records become each change\'s wait', async () => {
  const { model, observations } = await read();
  assert.equal(observations.source.revision, SHAS.main);
  assert.equal(observations.source.window.from, new Date(NOW - 300 * 60_000).toISOString(), 'the activity window is recorded');
  // A ready change behind a lock held past its target: integration, the owner's to look at.
  const seven = item(model, 'claude/phase-7');
  assert.equal(seven.state, 'integration');
  assert.equal(seven.stale, true);
  assert.equal(seven.builder, 'claude');
  assert.match(seven.next, /held by codex on acme-2 for 1.5 h: if that run died, the lock is the owner's to delete/);
  // An open PR whose checks run: CI.
  assert.equal(item(model, 'codex/phase-9').state, 'ci');
  // Landed, main red: CI, restore main. Its ready time came back from repository activity.
  const five = item(model, 'claude/phase-5');
  assert.equal(five.state, 'ci');
  assert.match(five.next, /^main is red at aaaaaaa/);
  assert.equal(observations.work.find(w => w.branch === 'claude/phase-5').ready.at, new Date(NOW - 45 * 60_000).toISOString());
  // Tested, not deployed since the last deploy that passed: deploy.
  assert.equal(item(model, 'claude/phase-4').state, 'deploy');
  assert.equal(model.tested.state, 'behind');
  assert.equal(model.tested.behindBy, 2);
  assert.equal(model.tested.lagMs, 30 * 60_000, 'green trails main from the landing push');
  assert.ok(!model.items.some(i => i.branch === 'renovate/anvil-1'), 'a branch with no PR, claim or ready mark is not in flight');
});

test('an unreadable claim and lost history stay gaps, never zero', async () => {
  const { model } = await read();
  const nine = item(model, 'codex/phase-9');
  assert.ok(nine.gaps >= 1, 'claims/phase-9 has no At: line');
  assert.ok(model.gaps.items.some(g => g.branch === 'codex/phase-9' && g.kind === 'unreadable' && g.source === 'claims'));
  assert.ok(model.gaps.items.some(g => g.branch === 'claude/phase-4' && g.kind === 'history'), 'the ready mark before the activity window is gone');
});

test('every read is a GET of a named path, within the request bound', async () => {
  const { asked } = await read();
  assert.ok(asked.length <= WAITS_REQUESTS);
  for (const path of asked) assert.match(path, /^\/repos\/acme\/anvils(\/(git\/matching-refs\/heads\/|activity\?per_page=100|git\/commits\/[0-9a-f]{40}|pulls\?state=open&per_page=50|compare\/\S+\.\.\.\S+|commits\/[0-9a-f]{40}\/check-runs\?per_page=50|git\/trees\/[0-9a-f]{40}|git\/blobs\/[0-9a-f]{40}))?$/, path);
  // Many ready marks: past the bound the rest are a gap, and no read is made past it.
  const answers = waitsFixture(REPO, NOW), heads = `/repos/${REPO}/git/matching-refs/heads/`;
  for (let n = 0; n < 40; n++) answers[heads].push({ ref: `refs/heads/ready/work/acme-${n}`, object: { sha: SHAS.ready7 } }, { ref: `refs/heads/work/acme-${n}`, object: { sha: SHAS.branch7 } });
  const big = await read({ answers });
  assert.ok(big.asked.length <= WAITS_REQUESTS, `${big.asked.length} reads`);
  assert.ok(big.model.gaps.items.some(g => /changes not on main; the first 12 are read/.test(g.why)));
});

test('a read this form is not permitted is a named gap with its reason', async () => {
  const { model } = await read({ can: { pulls: false, pullsWhy: 'The Acme App has no Pull requests read', checks: false, checksWhy: 'The Acme App has no Checks read', activity: false, activityWhy: 'activity is not read by the Acme App' } });
  assert.equal(model.coverage.prs.state, 'unavailable');
  assert.equal(model.coverage.prs.why, 'The Acme App has no Pull requests read');
  assert.equal(model.coverage.checks.why, 'The Acme App has no Checks read');
  assert.ok(model.gaps.items.some(g => g.why === 'activity is not read by the Acme App'));
  // Without activity a landing has no time, and without checks main's state is not known: unknown, not done.
  assert.equal(item(model, 'claude/phase-5').state, 'unknown');
  assert.equal(item(model, 'codex/phase-9').state, 'unknown', 'with PRs unread, review vs active cannot be said');
});

test('a failed read is a gap, not an empty list', async () => {
  const { model } = await read({ fail: { [`/repos/${REPO}/pulls?state=open&per_page=50`]: 500 } });
  assert.equal(model.coverage.prs.state, 'unavailable');
  assert.match(model.coverage.prs.why, /HTTP 500/);
  const none = await read({ fail: { [`/repos/${REPO}/git/matching-refs/heads/`]: 502 } });
  assert.deepEqual(none.model.items, []);
  for (const s of Object.values(none.model.coverage)) assert.equal(s.state, 'unavailable');
  assert.equal(none.model.tested.state, 'unknown');
});

test('a superseded (cancelled) run on main is not red: the change waits on the later push\'s run', async () => {
  const answers = waitsFixture(REPO, NOW);
  answers[`/repos/${REPO}/commits/${SHAS.main}/check-runs?per_page=50`] = { check_runs: [{ name: 'check', status: 'completed', started_at: new Date(NOW - 29 * 60_000).toISOString(), completed_at: new Date(NOW - 20 * 60_000).toISOString(), conclusion: 'cancelled' }] };
  const { model } = await read({ answers });
  assert.equal(item(model, 'claude/phase-5').state, 'ci');
  assert.match(item(model, 'claude/phase-5').next, /^wait for main's checks/);
});

test('a plate\'s value carries its waits: off, unavailable or read; a refusal is the waits\' gap, a sign-out is thrown', async () => {
  const plate = { id: 'anvils', name: 'Acme Anvils', repo: REPO, state: 'complete', gaps: [], waitsSource: SOURCE };
  assert.deepEqual((await projectWaits({ ...plate, waitsSource: waitsSourceOf({}) })).waits.state, 'off');
  assert.equal((await projectWaits(plate)).waits.state, 'unavailable');
  const saving = await projectWaits(plate, { read: async () => { throw Object.assign(new Error('x'), { code: 'quota_saving' }); }, now: () => NOW });
  assert.deepEqual(saving.waits, { state: 'unavailable', reason: 'Saving GitHub quota; waits are not read.' });
  await assert.rejects(projectWaits(plate, { read: async () => { throw Object.assign(new Error('signed out'), { status: 401 }); } }), /signed out/);
  const f = fakeApi(waitsFixture(REPO, NOW));
  const got = await projectWaits(plate, { read: (repo, source) => readObservations({ repo, api: f.api, now: NOW, source, can: ALL }), now: () => NOW });
  assert.equal(got.waits.state, 'read');
  assert.deepEqual(got.gaps, [], 'the waits\' own gaps are not the plate\'s');
});

test('home: a stale lock and a red main are Fixes in Needs you; the rest stays on the plate\'s page', async () => {
  const f = fakeApi(waitsFixture(REPO, NOW));
  const plate = await projectWaits({ id: 'anvils', name: 'Acme Anvils', repo: REPO, state: 'complete', gaps: [], waitsSource: SOURCE, decisions: [], walks: [], reviews: [], waiting: [], changes: [] },
    { read: (repo, source) => readObservations({ repo, api: f.api, now: NOW, source, can: ALL }), now: () => NOW });
  assert.deepEqual(waitsFixes(plate).map(x => x.key), ['anvils:waits:lock', 'anvils:waits:main']);
  const snap = homeSnapshot([plate], { today: '2026-11-04' });
  const needs = snap.home.sections.find(s => s.id === 'needs-you').items;
  assert.deepEqual(needs.map(n => [n.verb, n.key]), [['fix', 'anvils:waits:lock'], ['fix', 'anvils:waits:main']]);
  const strip = snap.home.sections.find(s => s.id === 'plates').items[0];
  assert.equal(strip.status, 'broken');
  assert.equal(strip.inFlight, 4);
  assert.deepEqual(strip.waits.rows.map(r => [r.branch, r.state]), [['claude/phase-7', 'integration'], ['claude/phase-4', 'deploy'], ['claude/phase-5', 'ci'], ['codex/phase-9', 'ci']]);
  assert.ok(strip.waits.notes.some(n => /^green trails main by 2 commits, for 30 min$/.test(n)));
  assert.ok(strip.waits.notes.some(n => /targets are advisory/.test(n)));
  // Healthy: no lock, main green. Nothing in Needs you; the changes are still on the plate's page.
  const g = fakeApi(waitsFixture(REPO, NOW, { mainRed: false, lockMinutes: null }));
  const calm = await projectWaits({ ...plate, waits: undefined }, { read: (repo, source) => readObservations({ repo, api: g.api, now: NOW, source, can: ALL }), now: () => NOW });
  const quiet = homeSnapshot([calm], { today: '2026-11-04' });
  assert.deepEqual(quiet.home.sections.find(s => s.id === 'needs-you').items, []);
  assert.match(item(calm.waits, 'claude/phase-7').next, /^run plates integrate/);
  // Unread waits make Needs you's count "known".
  const unread = homeSnapshot([{ ...plate, waits: { state: 'unavailable', reason: 'gh is offline' } }], { today: '2026-11-04' });
  assert.equal(unread.home.sections.find(s => s.id === 'needs-you').known, true);
  assert.equal(unread.home.sections.find(s => s.id === 'plates').items[0].waits.line, 'gh is offline');
});

// The hosted reader (lib/web/projects.mjs get): a 403 that refuses a permission is not a rate limit. The waits'
// read turns it into a named gap with the permission needed; budget, deferral and every other source are untouched.
test('hosted: a permission 403 on a waits read is a named gap; a rate-limit 403 still saves quota', async () => {
  const { createProjectReader, waitsPermission } = await import('../lib/web/projects.mjs');
  const { projectHarness } = await import('./helpers/web-projects.mjs');
  const run = async (refusal) => {
    const h = projectHarness();
    h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', practice: '0.8.32', stack: ['node'], phases: { shape: 'files' }, practices: ['phases', 'delivery'], delivery: { promote: 'vercel:studio' } });
    const answers = waitsFixture('acme/studio', Date.now());
    const headers = extra => ({ 'content-type': 'application/json', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600), ...extra });
    const fetcher = async (url, options) => {
      const u = new URL(url), key = `${u.pathname}${u.search}`;
      if (key === '/repos/acme/studio/activity?per_page=100') return new Response(JSON.stringify({ message: refusal.message }), { status: 403, headers: headers(refusal.headers) });
      if (Object.hasOwn(answers, key)) return Response.json(answers[key], { headers: headers({ 'x-ratelimit-remaining': '4000' }) });
      return h.fetcher(url, options);
    };
    const deferred = [], budget = { requests: 0 };
    const store = { reserve: async () => ({ allowed: true }), observe: async () => {}, defer: async (_, until) => { deferred.push(until); } };
    const read = createProjectReader({ fetcher, store, userId: 1, token: 't', budget });
    const value = await read({ id: 'studio', repoId: 102, repo: 'acme/studio' }, null, { waits: { pulls: true, checks: true } });
    return { value, deferred, budget };
  };
  const denied = await run({ message: 'Resource not accessible by integration', headers: { 'x-ratelimit-remaining': '4000' } });
  assert.equal(denied.value.waits.state, 'read', 'the waits are still read');
  assert.ok(denied.value.waits.gaps.items.some(g => g.why === 'repository activity could not be read: the App cannot read repository activity: Contents read needed'), JSON.stringify(denied.value.waits.gaps.items));
  assert.deepEqual(denied.deferred, [], 'no deferral');
  assert.equal(denied.budget.blockedUntil, undefined, 'no pause');
  assert.equal(denied.value.waits.coverage.prs.state, 'read', 'every other source still read');
  assert.ok(denied.value.waits.items.some(i => i.branch === 'claude/phase-7' && i.state === 'integration'));
  assert.equal(waitsPermission('/repos/a/b/commits/x/check-runs?per_page=50'), 'check runs: Checks read needed');
  // A real limit: no quota left, or Retry-After, or a secondary limit's message, pauses as before.
  for (const refusal of [{ message: 'API rate limit exceeded', headers: { 'x-ratelimit-remaining': '0' } }, { message: 'Slow down', headers: { 'x-ratelimit-remaining': '4000', 'retry-after': '60' } },
    { message: 'You have exceeded a secondary rate limit', headers: { 'x-ratelimit-remaining': '4000' } }]) {
    const limited = await run(refusal);
    assert.equal(limited.value.waits.state, 'unavailable', refusal.message);
    assert.equal(limited.value.waits.reason, 'Saving GitHub quota; waits are not read.');
    assert.equal(limited.deferred.length, 1, `${refusal.message}: deferred as before`);
    assert.ok(limited.budget.blockedUntil > Date.now(), `${refusal.message}: paused`);
  }
});
