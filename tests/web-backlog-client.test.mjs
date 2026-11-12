// The backlog page's client (phase 178): while a plate is loading it reads
// /api/backlog with backoff and renders the list and sidebar again, then stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBacklogClient, nextDelay, BACKLOG_DELAYS, MAX_READS } from '../lib/web/backlog-client.mjs';
import { renderBacklog, renderSidebar } from '../lib/web/backlog-views.mjs';

/** A page with the backlog's three hooks, and a clock run by hand. */
function page(loading = 'true') {
  const list = { innerHTML: 'cold' }, side = { outerHTML: 'cold side' }, status = { textContent: '' };
  const root = { dataset: { loading }, querySelector: s => ({ '[data-backlog-list]': list, '[data-backlog-side]': side })[s] ?? null };
  const timers = [];
  const document = { querySelector: s => ({ '[data-backlog-root]': root, '[data-backlog-status]': status })[s] ?? null };
  const window = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
  const run = async () => { const t = timers.shift(); await t.fn(); return t.ms; };
  return { root, list, side, status, document, window, timers, run };
}
const model = states => ({ schema: 1, generatedAt: '2026-11-05T12:00:00.000Z', lane: null, needsShaping: 0, claims: [],
  lanes: [{ lane: 'yours', title: 'Yours', count: 0, items: [] }], plates: states.map((state, i) => ({ projectId: `app${i}`, projectName: `Acme ${i}`, state, readAt: '2026-11-05T11:49:00.000Z', counts: ['read', 'stale'].includes(state) ? { 'in-flight': 0, yours: 0, 'agent-ready': 0, waiting: 0, done: 0 } : null })) });

test('the page reads until no plate is loading, then stops', async () => {
  const p = page(), answers = [{ status: 200, body: model(['read', 'loading']) }, { status: 503 }, { status: 200, body: model(['read', 'read']) }], asked = [];
  const fetch = async (url, options) => { asked.push([url, options.headers.accept]); const a = answers.shift(); return { status: a.status, json: async () => a.body }; };
  const client = startBacklogClient({ document: p.document, window: p.window, fetch, renderBacklog, renderSidebar });
  assert.equal(await p.run(), 0, 'the first read starts at once');
  assert.match(p.list.innerHTML, /data-backlog-lane="yours"/); assert.match(p.side.outerHTML, /<li>Acme 1: loading<\/li>/);
  assert.equal(p.timers[0].ms, BACKLOG_DELAYS[0], 'a plate still loading: read again soon');
  await p.run();
  assert.equal(p.timers[0].ms, nextDelay(1), 'a failed read backs off');
  await p.run();
  assert.equal(p.timers.length, 0, 'every plate read: no more reads');
  assert.equal(p.root.dataset.loading, 'false'); assert.equal(p.status.textContent, 'Every plate is read.');
  assert.match(p.side.outerHTML, /<li>Acme 1: 0 yours/);
  assert.deepEqual(asked.map(a => a[0]), ['/api/backlog', '/api/backlog', '/api/backlog']);
  await client.done;
});

test('a page with nothing loading reads nothing; a lost session or too many reads stop it', async () => {
  assert.equal(startBacklogClient({ document: page('false').document, window: page().window, fetch: () => assert.fail('no read'), renderBacklog, renderSidebar }), null);
  const denied = page();
  startBacklogClient({ document: denied.document, window: denied.window, fetch: async () => ({ status: 401, json: async () => null }), renderBacklog, renderSidebar });
  await denied.run();
  assert.equal(denied.timers.length, 0); assert.match(denied.status.textContent, /Sign in again/);
  const slow = page(); let n = 0;
  startBacklogClient({ document: slow.document, window: slow.window, fetch: async () => { n++; return { status: 200, json: async () => model(['loading']) }; }, renderBacklog, renderSidebar });
  while (slow.timers.length) await slow.run();
  assert.equal(n, MAX_READS); assert.match(slow.status.textContent, /Reload this page/);
  assert.ok(BACKLOG_DELAYS.every((d, i) => i === 0 || d > BACKLOG_DELAYS[i - 1]) && nextDelay(99) === BACKLOG_DELAYS.at(-1));
});

test('the page keeps reading while a plate is stale', async () => {
  const p = page(), answers = [model(['stale', 'read']), model(['stale', 'read']), model(['read', 'read'])];
  const fetch = async () => ({ status: 200, json: async () => answers.shift() });
  startBacklogClient({ document: p.document, window: p.window, fetch, renderBacklog, renderSidebar });
  await p.run();
  assert.equal(p.timers.length, 1, 'stale: read again'); assert.match(p.side.outerHTML, /<li>Acme 0: stale, /);
  await p.run(); assert.equal(p.timers.length, 1);
  await p.run(); assert.equal(p.timers.length, 0, 'fresh: stop');
  assert.equal(p.root.dataset.loading, 'false');
});

// Phase 185: the same client serves Recurring, reading its own endpoint, and says every time in the viewer's zone.
test('Recurring reads its own endpoint, and times are said in the viewer\'s zone', async () => {
  const { renderRecurring } = await import('../lib/web/backlog-views.mjs');
  const { localTime } = await import('../lib/web/backlog-client.mjs');
  const p = page(), asked = [];
  p.root.dataset.view = 'recurring';
  const times = [{ attrs: { datetime: '2026-11-06T07:23:00.000Z' }, dataset: { local: 'time' }, textContent: '07:23 UTC', getAttribute(k) { return this.attrs[k]; } }];
  p.root.querySelectorAll = sel => sel === 'time[data-local]' ? times : [];
  const plate = state => ({ projectId: 'studio', projectName: 'Acme Studio', state, routines: state === 'loading' ? null : [], gaps: [] });
  const answers = [{ schema: 1, generatedAt: '2026-11-05T12:00:00Z', plates: [plate('read')] }];
  startBacklogClient({ document: p.document, window: p.window, fetch: async url => { asked.push(url); return { status: 200, json: async () => answers.shift() }; }, renderBacklog, renderSidebar, renderRecurring, timeZone: 'America/Los_Angeles' });
  assert.equal(times[0].textContent, '23:23 PST', 'said in the viewer\'s zone before any read');
  await p.run();
  assert.deepEqual(asked, ['/api/recurring']);
  assert.match(p.list.innerHTML, /data-recurring-plate="studio"/); assert.match(p.side.outerHTML, /<a href="\/recurring" aria-current="page">Recurring/);
  assert.equal(p.timers.length, 0, 'every plate read: done');
  assert.equal(localTime('2026-11-09T10:18:00.000Z', 'weekday-time', 'Europe/London'), 'Mon, 10:18 GMT');
  assert.equal(localTime('nope', 'time'), null);
});

// Phase 186: the same client serves Agents, reading /api/agents while a plate loads.
test('Agents reads its own endpoint', async () => {
  const { renderAgents } = await import('../lib/web/backlog-views.mjs');
  const p = page(), asked = [];
  p.root.dataset.view = 'agents';
  const model = state => ({ schema: 1, generatedAt: '2026-11-05T12:00:00Z', agents: { providers: [], routes: [], plates: [{ projectId: 'studio', projectName: 'Acme Studio', state }] }, pending: { items: [], plates: [] } });
  const answers = [model('loading'), model('read')];
  startBacklogClient({ document: p.document, window: p.window, fetch: async url => { asked.push(url); return { status: 200, json: async () => answers.shift() }; }, renderBacklog, renderSidebar, renderAgents });
  await p.run(); assert.equal(p.timers.length, 1, 'still loading: read again');
  await p.run(); assert.equal(p.timers.length, 0);
  assert.deepEqual(asked, ['/api/agents', '/api/agents']);
  assert.match(p.list.innerHTML, /Pending review/); assert.match(p.side.outerHTML, /<a href="\/agents" aria-current="page">Agents <span class="p-badge">0<\/span>/);
});

// Phase 179: By goal reads the backlog's endpoint and renders its own arrangement, with the backlog's sidebar.
test('By goal reads the backlog and arranges it', async () => {
  const { renderByGoal } = await import('../lib/web/backlog-views.mjs');
  const p = page(), asked = [];
  p.root.dataset.view = 'goals';
  const answers = [{ ...model(['read']), goals: [], lanes: [{ lane: 'yours', title: 'Yours', count: 1, items: [{ key: 'app0:phase:3', projectId: 'app0', projectName: 'Acme 0', kind: 'phase', ref: '3', phase: '3', title: 'Acme phase 3', goal: null, why: [], children: [], nested: [], answers: [], since: null, lane: 'yours' }] }] }];
  startBacklogClient({ document: p.document, window: p.window, fetch: async url => { asked.push(url); return { status: 200, json: async () => answers.shift() }; }, renderBacklog, renderSidebar, renderByGoal });
  await p.run();
  assert.deepEqual(asked, ['/api/backlog']);
  assert.match(p.list.innerHTML, /data-goal="app0:goal:none"/); assert.match(p.side.outerHTML, /<a href="\/backlog" aria-current="page">Backlog/);
});
