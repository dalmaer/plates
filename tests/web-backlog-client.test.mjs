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
  lanes: [{ lane: 'yours', title: 'Yours', count: 0, items: [] }], plates: states.map((state, i) => ({ projectId: `app${i}`, projectName: `Acme ${i}`, state, counts: state === 'read' ? { 'in-flight': 0, yours: 0, 'agent-ready': 0, waiting: 0, done: 0 } : null })) });

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
