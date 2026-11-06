// The hosted backlog (plates phase 178, increment 3): /backlog and /api/backlog,
// read only, behind Home's auth. Each plate's phases come from Home's read and
// its claims from the App's GraphQL. Synthetic Acme sources over the fake App API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { BACKLOG_LANES } from '../lib/work-items.mjs';
import { START_UNAVAILABLE, backlogView } from '../lib/web/backlog-views.mjs';
import { createHomeReader } from '../lib/web/home.mjs';
import { claimMessage } from '../lib/claim.mjs';

/** The real service over the fake App, whose GraphQL lists one claim branch (phase 1) when `claims` is on. */
async function hosted({ claims = true } = {}) {
  const h = projectHarness(), graphql = [];
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/graphql' && JSON.parse(options.body).query.includes('PlatesClaims')) {
      graphql.push(JSON.parse(options.body).query);
      if (!claims) return Response.json({ errors: [{ message: 'Resource not accessible by integration' }] });
      const at = new Date(h.state.now - 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return Response.json({ data: { repository: { refs: { totalCount: 1, nodes: [{ name: 'phase-1', target: { oid: 'c'.repeat(40), message: claimMessage({ phase: 1, provider: 'codex', machine: 'acme-mac', at, token: 't' }), committedDate: at } }] } } } });
    }
    return h.fetcher(url, options);
  };
  const web = createWebService({ ...h.config }, { now: () => h.state.now, fetcher });
  const signed = await h.login();
  const get = path => web(h.request(path, { cookie: signed.cookie }));
  return { h, web, signed, get, graphql };
}

test('/backlog lists every plate\'s work in lanes, behind Home\'s auth', async () => {
  const s = await hosted();
  const api = await s.get('/api/backlog');
  assert.equal(api.status, 200);
  const model = await api.json();
  assert.deepEqual(model.lanes.map(l => l.lane), BACKLOG_LANES.map(l => l.id));
  const keys = Object.fromEntries(model.lanes.map(l => [l.lane, l.items.map(i => i.key)]));
  assert.deepEqual(keys['in-flight'], ['studio:phase:1'], 'the claim branch the App lists puts phase 1 in flight');
  assert.equal(model.lanes[0].items[0].holder.provider, 'codex');
  assert.ok(keys.yours.includes('studio:phase:2'), 'the phase owing a walk is yours');
  assert.deepEqual(model.claims, [{ projectId: 'studio', read: true }]);
  assert.match(s.graphql[0], /refs\(refPrefix: "refs\/heads\/claims\/"/);
  // The page renders from the same read: the sidebar, each lane with its count, a row per item.
  const page = await s.get('/backlog');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<a href="\/backlog" aria-current="page">Backlog <span class="p-badge">\d+<\/span><\/a>/);
  for (const soon of ['recurring', 'agents', 'pending-review']) assert.match(html, new RegExp(`data-sidebar-soon="${soon}"[^>]*>[^<]+<small>coming</small>`));
  for (const l of model.lanes) assert.match(html, new RegExp(`id="lane-${l.lane}">${l.title} <span class="meta">${l.items.length}</span>`));
  for (const item of model.lanes.flatMap(l => l.items)) assert.ok(html.includes(`data-backlog-item="${item.key}"`), item.key);
  assert.match(html, /claim 6d left/); assert.match(html, /<span class="p-badge">codex · claimed<\/span>/);
  if (keys['agent-ready'].length) assert.ok(html.includes(`aria-disabled="true" title="${START_UNAVAILABLE}"`), 'Start is off, with its reason');
  assert.match(html, /\/assets\/backlog\.[0-9a-f]{12}\.css/);
  assert.equal((await s.web(s.h.request('/assets/backlog.css'))).status, 200);
  // Home links to it.
  assert.match(await (await s.get('/')).text(), /<a href="\/backlog" data-backlog-link>/);
  // A query it does not take is refused.
  assert.equal((await s.get('/backlog?lane=yours')).status, 400);
});

test('signed out, the backlog is refused', async () => {
  const s = await hosted();
  const page = await s.web(s.h.request('/backlog'));
  assert.notEqual(page.status, 200, 'signed out: no backlog');
  assert.match(await page.text(), /returnTo=%2Fbacklog/, 'and signing in comes back to it');
  const api = await s.web(s.h.request('/api/backlog'));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'sign_in_required' });
  assert.equal(s.graphql.length, 0, 'nothing was read for it');
});

test('a plate whose claims the App cannot read is not read, never empty', async () => {
  const s = await hosted({ claims: false });
  const model = await (await s.get('/api/backlog')).json();
  assert.deepEqual(model.plates.map(p => [p.projectId, p.state, p.counts]), [['studio', 'not read', null]]);
  assert.match(model.plates[0].reason, /its claims could not be read/);
  assert.ok(model.lanes.every(l => !l.items.some(i => i.kind === 'phase')), 'no phase is listed as free when its claims are unknown');
  assert.match(await (await s.get('/backlog')).text(), /Acme Studio: not read — its claims could not be read/);
});

// The first look after deploy (phase 178): a model version change empties every cached plate. The page renders from
// the cache, so every plate is loading, and says so; /api/backlog fills them, four plates a call, until none is.
test('a cold cache shows every plate loading, and the backlog fills them in', async () => {
  const h = projectHarness(), projects = Array.from({ length: 8 }, (_, i) => ({ id: `app${i}`, repoId: 200 + i, repo: `acme/app${i}` }));
  const fetcher = async (url, options) => {
    const u = new URL(url);
    if (u.pathname === '/graphql' && JSON.parse(options.body).query.includes('PlatesClaims')) return Response.json({ data: { repository: { refs: { totalCount: 0, nodes: [] } } } });
    const id = /^\/repositories\/(2\d\d)$/.exec(u.pathname), repo = /^\/repos\/acme\/app(\d+)\//.exec(u.pathname);
    if (!id && !repo) return h.fetcher(url, options);
    const index = id ? Number(id[1]) - 200 : Number(repo[1]);
    if (index === 7) return new Response('{}', { status: 500 }); // one plate's source is broken: that one is not read
    if (id) return Response.json({ id: 200 + index, full_name: `acme/app${index}`, default_branch: 'main' });
    u.pathname = u.pathname.replace(`/acme/app${index}/`, '/acme/studio/');
    return h.fetcher(u.href, options);
  };
  const read = createHomeReader(h.config, { fetcher, now: () => h.state.now }), access = { ...h.access, projects };
  const token = 'fake-user-access-token-for-tests';
  // The page's read: cache only, nothing read yet. Every plate is loading, none is "not read", and no count is a zero.
  const cold = (await read(access, token, { cacheOnly: true, backlog: true })).backlog;
  assert.deepEqual(cold.plates.map(p => [p.projectId, p.state, p.counts]), projects.map(p => [p.id, 'loading', null]));
  const html = backlogView(access, { schema: 1, generatedAt: new Date(h.state.now).toISOString(), lane: null, ...cold });
  assert.match(html, /data-backlog-root data-loading="true"/);
  for (const p of projects) assert.match(html, new RegExp(`<li>${p.id}: loading</li>`), `${p.id} says loading`);
  assert.doesNotMatch(html, /not read/);
  assert.match(html, /<script type="module" src="\/assets\/backlog-client\.mjs"><\/script>/, 'the page reads the rest itself');
  // /api/backlog's reads: four plates a call, so two calls read all eight.
  let calls = 0, backlog = cold;
  while (backlog.plates.some(p => p.state === 'loading') && calls < 5) { backlog = (await read(access, token, { backlog: true })).backlog; calls++; }
  assert.equal(calls, 2);
  assert.deepEqual(backlog.plates.map(p => p.state), [...Array(7).fill('read'), 'not read']);
  assert.ok(backlog.plates.slice(0, 7).every(p => Number.isSafeInteger(p.counts.yours)));
  assert.equal(backlog.plates[7].counts, null); assert.ok(backlog.plates[7].reason, 'a broken plate says why');
  assert.equal(backlog.lanes.find(l => l.lane === 'yours').items.filter(i => i.key.endsWith(':phase:2')).length, 7, 'each plate read lists its phase owing a walk');
});

test('the hosted page loads like Home: cache first, then the client', async () => {
  const s = await hosted();
  const html = await (await s.get('/backlog')).text();
  assert.match(html, /data-loading="true"/); assert.match(html, /<li>studio: loading<\/li>/); assert.doesNotMatch(html, /not read/);
  assert.match(html, /\/assets\/backlog-client\.[0-9a-f]{12}\.mjs/); assert.match(html, /<noscript>/);
  for (const asset of ['backlog-client.mjs', 'backlog-views.mjs']) assert.equal((await s.web(s.h.request(`/assets/${asset}`))).status, 200, asset);
  await s.get('/api/backlog');
  const after = await (await s.get('/backlog')).text();
  assert.match(after, /data-loading="false"/); assert.doesNotMatch(after, /: loading</);
});
