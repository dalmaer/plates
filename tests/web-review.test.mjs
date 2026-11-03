// The review session (plates phase 174): the docket in Needs you, one card at
// a time. An answer is held for its Undo window and then written through the
// routes Home's answers use (POST /api/home/answer; a preview through its
// apply route); a failed write comes back as a card at the end with its
// reason; the session ends on what it settled. Synthetic Acme sources: the
// real web service over the fake App API and the Not now store (SQL017) on
// PGlite, or a recording fetch where the apply route's outcomes are chosen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createReviewSession, createWebSender, HOLD_MS } from '../lib/web/review-client.mjs';
import { docketItems, renderReviewCard, renderReviewEnd, reviewView } from '../lib/web/review-views.mjs';
import { reviewSnapshot } from './helpers/review-fixture.mjs';

/** Timers the test runs by hand: nothing fires until tick(). */
function clock() {
  let id = 0; const due = new Map();
  return { timers: { setTimeout: (fn, ms) => { due.set(++id, { fn, ms }); return id; }, clearTimeout: t => due.delete(t) },
    pending: () => [...due.values()].map(t => t.ms),
    async tick() { const fns = [...due.values()].map(t => t.fn); due.clear(); for (const fn of fns) fn(); for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); } };
}
/** The session's settle point: every held answer sent and its result routed. */
const settledOf = async session => { for (let i = 0; i < 50 && session.sending; i++) await new Promise(r => setImmediate(r)); };

async function notNowDatabase(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/017-not-now.sql', import.meta.url), 'utf8'));
  return async (url, options) => {
    const p = JSON.parse(options.body), entries = Object.entries(p);
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query(`SELECT public.plates_not_now_rpc(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_until' ? '::date' : ''}`).join(',')}) value`, entries.map(([, value]) => value));
      return Response.json(result.rows[0].value);
    } finally { await db.exec('RESET ROLE'); }
  };
}

/** The real service, and a browser fetch into it carrying the session cookie and the page's origin. */
async function hosted(t) {
  const h = projectHarness(), notNow = await notNowDatabase(t);
  const web = createWebService({ ...h.config }, { now: () => h.state.now, fetcher: (url, options) => new URL(url).pathname === '/rest/v1/rpc/plates_not_now_rpc' ? notNow(url, options) : h.fetcher(url, options) });
  const signed = await h.login();
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return web(new Request(`${h.config.origin}${url}`, { method: options.method ?? 'GET', headers: { cookie: signed.cookie, origin: h.config.origin, 'content-type': 'application/json', accept: 'application/json' }, body: options.body }));
  };
  const home = async () => (await fetch('/api/home')).json();
  // The token the page carries, read from /review as the client reads it.
  const page = await (await web(h.request('/review', { cookie: signed.cookie }))).text();
  const csrf = /data-review-csrf value="([^"]+)"/.exec(page)?.[1];
  assert.equal(csrf, signed.session.csrf, 'the page carries the session\'s CSRF token');
  return { h, web, signed, fetch, calls, home, csrf };
}

test('an answer is sent after its undo window, and a failure comes back', async t => {
  const s = await hosted(t), first = await s.home();
  const items = docketItems(first);
  assert.deepEqual(items.map(e => e.key), first.docket.map(e => e.key), 'the session holds every item in Needs you, in the docket\'s order');
  assert.ok(items.length >= 2, 'the fixture has two items waiting');
  assert.equal(first.putOff.count, 0);
  const c = clock(), sender = createWebSender({ fetch: s.fetch, csrf: s.csrf });
  // The second item's write fails on the network; the first goes to the real Not now store.
  const send = hold => hold.entry.key === items[1].key ? Promise.reject(new TypeError('network down')) : sender.send(hold);
  const session = createReviewSession({ items, send, prepare: sender.prepare, timers: c.timers });

  // A tap shows the next card at once; Undo inside the window writes nothing and brings the card back.
  assert.ok(session.choose('not-now').held);
  assert.equal(session.current().entry.key, items[1].key, 'the next card shows at once');
  assert.deepEqual(c.pending(), [HOLD_MS], 'held for the undo window');
  assert.ok(session.undo());
  assert.equal(session.current().entry.key, items[0].key, 'Undo brings the card back');
  await c.tick();
  assert.equal(s.calls.filter(x => x.url === '/api/home/answer').length, 0, 'Undo inside the window sends nothing');
  assert.equal((await s.home()).putOff.count, 0, 'and writes nothing');

  // Answered and left: after the window it is written through POST /api/home/answer.
  const later = new Date(s.h.state.now + 30 * 86_400_000).toISOString().slice(0, 10);
  session.choose('not-now', { until: later });
  session.choose('not-now');
  assert.equal(s.calls.filter(x => x.url === '/api/home/answer').length, 0, 'nothing is sent inside the window');
  await c.tick(); await settledOf(session);
  const answers = s.calls.filter(x => x.url === '/api/home/answer');
  assert.deepEqual(answers.map(x => [x.body.key, x.body.answer, x.body.until]), [[items[0].key, 'not-now', later]]);
  const after = await s.home();
  assert.equal(after.putOff.count, 1, 'the store holds it'); assert.equal(after.putOff.items[0].key, items[0].key);
  assert.deepEqual(session.putOff.map(p => [p.key, p.until]), [[items[0].key, later]]);

  // The failed write comes back as a card at the end of the session, with its reason; nothing is lost.
  const back = session.current();
  assert.equal(back?.entry.key, items[1].key, 'the failed answer returns as a card');
  assert.match(back.reason, /network/i);
  const html = renderReviewCard(back.entry, { index: session.index, total: session.total, reason: back.reason });
  assert.match(html, /Needs another look\.<\/strong> The network was unavailable/);
  assert.equal(session.done(), false, 'the session waits on it');
});

test('a held preview is applied through its route, and an uncertain apply is never sent again', async () => {
  const snapshot = reviewSnapshot(), walk = snapshot.walks[0], proposal = snapshot.decisions[0];
  const items = docketItems(snapshot).filter(e => [walk.key, proposal.key].includes(e.key));
  const calls = [], outcome = { apply: [] };
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    if (url === '/api/home/answer') return Response.json({ schema: 1, state: 'preview', key: body.key, answer: body.answer, preview: { id: 'b'.repeat(64), digest: 'c'.repeat(64), operationUrl: `/projects/studio/operations/${'d'.repeat(64)}`, consequence: 'Record this proposal as accepted.', canSubmit: true } });
    const next = outcome.apply.shift();
    if (next === 'network') throw new TypeError('offline');
    return Response.json(next);
  };
  const c = clock(), sender = createWebSender({ fetch, csrf: 'acme-csrf' });
  const session = createReviewSession({ items, send: sender.send, prepare: sender.prepare, timers: c.timers });
  // The tap asks for the preview (it writes nothing) so the toast can say what will be written.
  const held = session.choose('accept').held;
  assert.equal((await held.prepared).summary, 'Record this proposal as accepted.');
  session.undo(); await c.tick();
  assert.equal(calls.filter(x => x.url.endsWith('/decisions/apply')).length, 0, 'Undo: no apply');
  outcome.apply.push({ schema: 1, id: 'd'.repeat(64), state: 'committed', receipt: { url: 'https://github.com/acme/studio/commit/abc123' } }, 'network');
  session.choose('accept');
  session.choose('choice-verified');
  await c.tick(); await settledOf(session);
  const applies = calls.filter(x => x.url === '/api/projects/studio/decisions/apply');
  assert.deepEqual(applies.map(x => x.body), [{ csrf: 'acme-csrf', previewId: 'b'.repeat(64), publicAcknowledgement: 'c'.repeat(64) }, { csrf: 'acme-csrf', previewId: 'b'.repeat(64), publicAcknowledgement: 'c'.repeat(64) }], 'the exact previews, with their digests');
  assert.deepEqual(session.settled.map(x => [x.key, x.link]), [[proposal.key, 'https://github.com/acme/studio/commit/abc123']]);
  // An apply whose answer never came back may have written: listed with its operation, not shown again as a card.
  assert.equal(session.current(), null); assert.equal(session.done(), true);
  assert.deepEqual(session.again.map(x => [x.key, x.retry, x.link]), [[walk.key, false, `/projects/studio/operations/${'d'.repeat(64)}`]]);
  // A refused apply is a failure with its reason, and comes back.
  const again = createReviewSession({ items: items.slice(0, 1), send: sender.send, prepare: sender.prepare, timers: c.timers });
  outcome.apply.push({ schema: 1, state: 'refused', reason: 'stale_preview' });
  again.choose('accept'); await c.tick(); await settledOf(again);
  assert.match(again.current()?.reason ?? '', /source changed since the preview/);
});

test('an answer that needs a why waits for it', async () => {
  const items = docketItems(reviewSnapshot()), c = clock(), sent = [];
  const session = createReviewSession({ items, send: async hold => { sent.push(hold); return { state: 'settled' }; }, timers: c.timers });
  const proposal = session.current().entry.item;
  assert.equal(proposal.answers.find(a => a.id === 'decline').needsWhy, 'decline');
  const refused = session.choose('decline');
  assert.equal(refused.error, 'why_required', 'a decline without a why is not held');
  assert.equal(session.current().entry.key, proposal.key, 'the card stays'); assert.deepEqual(c.pending(), []);
  assert.equal(session.choose('decline', { why: '   ' }).error, 'why_required', 'blank is not a why');
  const held = session.choose('decline', { why: ' Not  this quarter ' }).held;
  assert.equal(held.why, 'Not this quarter');
  await c.tick(); await settledOf(session);
  assert.deepEqual(sent.map(h => [h.answer.id, h.why]), [['decline', 'Not this quarter']]);
  // The sender carries the why to the route, which refuses one without it in both forms (phase 173).
  const bodies = [];
  const sender = createWebSender({ fetch: async (url, o) => { bodies.push(JSON.parse(o.body)); return Response.json({ error: 'why_required' }, { status: 400 }); }, csrf: 'x' });
  const result = await sender.send({ ...held, answer: { ...held.answer, writer: 'not now' } });
  assert.equal(bodies[0].why, 'Not this quarter'); assert.equal(result.state, 'failed'); assert.match(result.reason, /needs a why/);
  // A walk choice that asks for words ("Close, but (say what)") needs one too; an unavailable answer explains itself.
  const step = items.find(e => e.kind === 'step');
  while (session.current() && session.current().entry.key !== step.key) session.choose('not-now');
  const off = session.choose('done', { why: 'did it' });
  assert.equal(off.error, 'unavailable'); assert.match(off.answer.unavailable.command, /^plates home --answer studio:step:5 done/);
  assert.match(renderReviewCard(step), /data-answer="done" aria-disabled="true"/, 'shown as off, never disabled');
  assert.doesNotMatch(renderReviewCard(step), /\sdisabled[\s>]/);
});

test('the session ends on what it settled', async () => {
  const items = docketItems(reviewSnapshot()), c = clock();
  const results = { 0: { state: 'settled', link: 'https://github.com/acme/studio/commit/abc123' }, 1: { state: 'put-off', until: '2026-11-10' }, 2: { state: 'failed', reason: 'The source changed since the preview, so nothing was written.' }, 3: { state: 'put-off', until: '2026-11-10' } };
  let n = 0;
  const session = createReviewSession({ items, send: async () => results[n++], timers: c.timers });
  session.choose('accept'); session.choose('not-now'); session.choose('choice-verified'); assert.equal(session.choose('release', { why: 'the branch is abandoned' }).error, 'unavailable', 'a claim is released from the checkout'); session.choose('not-now');
  await c.tick(); await settledOf(session);
  // The failed walk comes back once; closing ends the session with it listed, its reason kept.
  assert.equal(session.current()?.entry.kind, 'walk'); session.close();
  assert.equal(session.done(), true);
  const html = renderReviewEnd({ settled: session.settled, putOff: session.putOff, again: session.again, home: '/' });
  assert.match(html, /1 settled · 2 put off · 1 needs another look/);
  assert.match(html, /<h2>Settled<\/h2><ul><li>Update the Acme anvil library: Accept <a href="https:\/\/github.com\/acme\/studio\/commit\/abc123" target="_blank" rel="noreferrer">the commit ↗<\/a><\/li><\/ul>/);
  assert.match(html, /<h2>Put off<\/h2><ul><li>Phase 5: approve the night lane: put off until 2026-11-10<\/li><li>Stale claim: phase 7: put off until 2026-11-10<\/li>/);
  assert.match(html, /<h2>Needs another look<\/h2><ul><li><strong>On your phone, open the Acme studio preview[^<]*<strong>missing<\/strong>[^<]*<\/strong>: The source changed since the preview/);
  assert.ok(html.indexOf('Needs another look</h2>') < html.indexOf('Settled</h2>'), 'what needs another look comes first');
  // What an answer set moving is phase 175's: the model does not know it yet, so the end says nothing it cannot back.
  assert.doesNotMatch(html, /set moving|unblock/i);
  assert.match(html, /href="\/" data-review-home>Back to Home/);
});

test('/review renders the first card before any script, behind Home\'s auth, with no header or footer', async t => {
  const s = await hosted(t);
  await s.home(); // Home's read fills the cache the page renders from.
  for (const [path, first] of [['/review', 'studio:step:1'], ['/projects/studio/review', 'studio:step:1']]) {
    const r = await s.web(s.h.request(path, { cookie: s.signed.cookie })); assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.match(html, new RegExp(`data-review-card="${first}"`), `${path}: the first card is server-rendered`);
    assert.match(html, /<progress class="p-progress" max="2" value="1"/); assert.match(html, />1 of 2</);
    assert.doesNotMatch(html, /data-navigation|data-page-footer/, 'its own layout: no nav header, no page footer');
    assert.match(html, /\/assets\/review-client\.[0-9a-f]{12}\.mjs/); assert.match(html, /\/assets\/review\.[0-9a-f]{12}\.css/);
    assert.match(html, /data-review-csrf value="[^"]+"/);
  }
  assert.equal((await s.web(s.h.request('/projects/other/review', { cookie: s.signed.cookie }))).status, 404);
  assert.equal((await s.web(s.h.request('/review?fresh=1', { cookie: s.signed.cookie }))).status, 400);
  const out = await s.web(s.h.request('/review')); assert.notEqual(out.status, 200, 'signed out: no docket');
  assert.match(await out.text(), /returnTo=%2Freview/, 'and signing in comes back to the session');
  for (const asset of ['review-client.mjs', 'review-views.mjs', 'source-links.mjs', 'review.css']) assert.equal((await s.web(s.h.request(`/assets/${asset}`))).status, 200, asset);
  // Nothing waiting: said plainly, with the way back.
  const empty = reviewView({ workspace: { name: 'Acme' }, csrf: 'x' }, { ...reviewSnapshot(), docket: [] });
  assert.match(empty, /Nothing needs you/); assert.doesNotMatch(empty, /data-answer/);
});

test('Home starts the session from one panel at its top, or says nothing needs you', async () => {
  const { homeView, renderReviewStart } = await import('../lib/web/views.mjs');
  const access = { workspace: { id: 'acme', name: 'Acme' }, userId: 1, projects: [{ id: 'studio', repo: 'acme/studio', name: 'Acme Studio' }], sourceRevision: 'a'.repeat(40), csrf: 'x' };
  const html = homeView(access, reviewSnapshot());
  assert.match(html, /<p class="review-start p-card"><strong>4 for you<\/strong><a class="button" href="\/review"[^>]*>Start review<\/a><\/p>/);
  assert.ok(html.indexOf('review-start') < html.indexOf('home-toolbar'), 'before the toolbar: the first thing under the heading');
  assert.match(renderReviewStart(reviewSnapshot(), { projectId: 'studio' }), /href="\/projects\/studio\/review"/);
  const none = renderReviewStart({ ...reviewSnapshot(), docket: [] });
  assert.match(none, /Nothing needs you/); assert.doesNotMatch(none, /<a |<button/, 'no button when nothing waits');
  assert.match(renderReviewStart({ ...reviewSnapshot(), coverage: { state: 'partial', gaps: [] } }), /At least 4 for you/, 'an incomplete read says at least');
});
