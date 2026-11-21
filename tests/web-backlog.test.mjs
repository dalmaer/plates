// The hosted backlog (plates phase 178, increment 3): /backlog and /api/backlog,
// read only, behind Home's auth. Each plate's phases come from Home's read and
// its claims from the App's GraphQL. Synthetic Acme sources over the fake App API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { BACKLOG_LANES } from '../lib/work-items.mjs';
import { backlogView, renderBacklog, renderSidebar, START_UNAVAILABLE, attachCommand } from '../lib/web/backlog-views.mjs';
import { startBacklogClient } from '../lib/web/backlog-client.mjs';
import { createHomeReader } from '../lib/web/home.mjs';
import { claimMessage } from '../lib/claim.mjs';

/** The real service over the fake App, whose GraphQL lists one claim branch (phase 1) when `claims` is on. */
async function hosted({ claims = true, events = null } = {}) {
  const h = projectHarness(), graphql = [];
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/graphql' && JSON.parse(options.body).query.includes('PlatesClaims')) {
      graphql.push(JSON.parse(options.body).query);
      if (!claims) return Response.json({ errors: [{ message: 'Resource not accessible by integration' }] });
      const at = new Date(h.state.now - 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return Response.json({ data: { repository: { refs: { totalCount: 1, nodes: [{ name: 'phase-1', target: { oid: 'c'.repeat(40), message: claimMessage({ phase: 1, provider: 'codex', machine: 'acme-mac', at, token: 't' }), committedDate: at } }] } } } });
    }
    // Backlog events (phase 184): SQL019's RPC answers only when the test applies it.
    if (new URL(url).pathname === '/rest/v1/rpc/plates_backlog_events_rpc') return events ? events(JSON.parse(options.body)) : new Response('{"message":"Could not find the function public.plates_backlog_events_rpc"}', { status: 404 });
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
  assert.match(html, /<a href="\/backlog" aria-current="true">Backlog <span class="p-badge">\d+<\/span><\/a>/);
  assert.doesNotMatch(html, /data-sidebar-soon/, 'nothing still to come (phase 186)');
  assert.match(html, /<a href="\/agents">Agents <span class="p-badge">1<\/span><\/a><a href="\/agents#pending">Pending review<\/a>/, 'Agents counts what is at work; Pending review has no count without the Pull requests read');
  assert.match(html, /<a href="\/recurring">Recurring<\/a>/, 'Recurring is live (phase 185)');
  for (const l of model.lanes.filter(l => l.items.length)) assert.match(html, new RegExp(`id="lane-${l.lane}">${l.title} <span class="meta">${l.items.length}</span>`));
  for (const item of model.lanes.flatMap(l => l.items)) assert.ok(html.includes(`data-backlog-item="${item.key}"`), item.key);
  assert.match(html, /assignment 6d left/); assert.match(html, /<span class="p-badge">codex · claimed<\/span>/);
  if (keys['agent-ready'].length) assert.ok(html.includes(`/attach?key=${encodeURIComponent(keys['agent-ready'][0])}&amp;route=session">Preview attach</a>`), 'the phase opens a read-only preview');
  assert.match(html, /\/assets\/backlog\.[0-9a-f]{12}\.css/);
  assert.equal((await s.web(s.h.request('/assets/backlog.css'))).status, 200);
  // Home's navigation links to it (phase 196: Home itself is the projects' chips and Needs you).
  assert.match(await (await s.get('/')).text(), /<a data-nav-destination="backlog" href="\/backlog">Backlog<\/a>/);
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
  assert.match(html, /data-backlog-root data-view="backlog" data-endpoint="\/api\/backlog" data-loading="true"/);
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

// Ten minutes after a read, Home calls a cached plate stale (GH_TTL). The backlog keeps listing it, with its claims
// read now, says it is stale and counts "at least", and the page reads again until it is fresh.
test('a stale plate keeps its items, is never "not read", and its claims are read', async () => {
  const s = await hosted();
  const fresh = await (await s.get('/api/backlog')).json();
  const items = fresh.lanes.flatMap(l => l.items.map(i => i.key));
  assert.ok(items.length > 2);
  s.h.state.now += 11 * 60_000;
  const before = s.graphql.length;
  const html = await (await s.get('/backlog')).text();
  assert.equal(s.graphql.length, before + 1, 'the stale plate\'s claims are read');
  for (const key of items) assert.ok(html.includes(`data-backlog-item="${key}"`), `${key} is still listed`);
  assert.doesNotMatch(html, /not read/);
  assert.match(html, /<li>Acme Studio: stale, read 11 min ago · \d+ yours · \d+ agent-ready · 1 in flight \(at least\)<\/li>/);
  assert.match(html, /Acme Studio: stale, read 11 min ago, so its counts are at least these/);
  assert.match(html, /data-backlog-root data-view="backlog" data-endpoint="\/api\/backlog" data-loading="true"/, 'the page reads again until the plate is fresh');
  assert.match(html, /assignment 6d left/, 'the claim read now still puts phase 1 in flight');
  // Its model: stale, partial coverage, counts kept.
  const { createHomeReader } = await import('../lib/web/home.mjs');
  const signedAccess = { ...s.h.access, login: 'acme-owner' };
  const reader = createHomeReader(s.h.config, { fetcher: async (url, options) => new URL(url).pathname === '/graphql' && JSON.parse(options.body).query.includes('PlatesClaims')
    ? Response.json({ data: { repository: { refs: { totalCount: 0, nodes: [] } } } }) : s.h.fetcher(url, options), now: () => s.h.state.now });
  await reader(signedAccess, 'fake-user-access-token-for-tests', { backlog: true });
  s.h.state.now += 11 * 60_000;
  const plate = (await reader(signedAccess, 'fake-user-access-token-for-tests', { cacheOnly: true, backlog: true })).backlog.plates[0];
  assert.deepEqual([plate.state, plate.coverage, typeof plate.readAt, Number.isSafeInteger(plate.counts.yours)], ['stale', 'partial', 'string', true]);
});

// Phase 179: By goal is its own path (the routes take no query), beside the List, the default.
test('/backlog/goals arranges the backlog by goal, one card per phase', async () => {
  const s = await hosted();
  await s.get('/api/backlog');
  const html = await (await s.get('/backlog/goals')).text();
  assert.match(html, /data-backlog-root data-view="goals" data-endpoint="\/api\/backlog"/);
  assert.doesNotMatch(html, /<a href="\/backlog\/goals"/);
  assert.match(html, /data-goal="studio:goal:G1"[^>]*><h2 id="goal-studio:goal:G1">Acme Studio · G1 — A dependable studio <span class="meta">/);
  assert.match(html, /data-member="studio:phase:2:box [^"]+">walk \(box \d+\)/, 'the walk is nested under its phase');
  const list = await (await s.get('/backlog')).text();
  assert.doesNotMatch(list, /<a href="\/backlog\/goals"/);
  assert.equal((await s.get('/backlog/goals?x=1')).status, 400);
  assert.equal((await s.web(s.h.request('/assets/backlog-grouping.mjs'))).status, 200);
});

// Phase 184: History is its own path beside List and By goal (a date in the path, never a query): what happened since,
// from the hosted events and the readout plates home --backlog --since prints, and each card's history.
test('/backlog/history reads back what happened, and says so before 019', async () => {
  const before = await hosted();
  await before.get('/api/backlog');
  const html = await (await before.get('/backlog/history')).text();
  assert.match(html, /data-view="history"/);
  assert.match(html, /<a href="\/backlog\/history" aria-current="true">History<\/a>/);
  assert.equal(html.match(/Events are not stored yet/g)?.length, 1, 'said once');
  assert.doesNotMatch(html, /\b0 events?\b|nothing recorded|data-backlog-history>/, 'never a zero');
  const unstored = await (await before.get('/api/backlog/history')).json();
  assert.deepEqual([unstored.events, unstored.eventsNote], [null, 'Events are not stored yet, so what happened is not shown.']);
  assert.equal((await before.get('/backlog/history?since=2026-01-01')).status, 400);
  assert.equal((await before.get('/backlog/history/2026-13-45')).status, 404);
  const sent = [];
  const after = await hosted({ events: body => { sent.push(body); return Response.json({ events: [
    { id: 1, at: '2026-10-20T09:00:00.000Z', actor: 'agent:claude', key: 'studio:phase:1', action: 'attach', reason: null, route: 'session', lane: 'agent-ready', position: null, takes: null, outcome: 'attached', receipt: null },
    { id: 2, at: '2026-10-20T10:00:00.000Z', actor: 'owner', key: 'studio:phase:2', action: 'answer', reason: null, route: null, lane: null, position: null, takes: 5, outcome: 'choice-1', receipt: null }] }); } });
  await after.get('/api/backlog');
  const page = await (await after.get('/backlog/history/2026-10-01')).text();
  assert.equal(sent.at(-1).p_operation, 'list');
  assert.equal(sent.at(-1).p_since, '2026-10-01T00:00:00.000Z');
  assert.match(page, /What happened since 2026-10-01 \(2 events\)/);
  assert.match(page, /route session: 1 attached, 0 landed/);
  assert.match(page, /data-backlog-item="studio:phase:1"[\s\S]*?<span class="p-badge" data-backlog-history>1 event · last attach 2026-10-20<\/span>/);
});


test('a single plate home carries its backlog and claims with a source-bound cursor', async () => {
  const s = await hosted();
  const first = await (await s.get('/api/projects/studio/home')).json();
  assert.equal(first.backlog.lanes[0].items[0].holder.provider, 'codex');
  assert.ok(first.backlog.lanes.flatMap(l=>l.items).every(i=>i.projectId==='studio'));
  const html = await (await s.get('/projects/studio')).text();
  assert.match(html,/class="home-section simple-backlog"/);
  assert.match(html,/data-item="studio:phase:1"/);
  assert.equal(first.projectWorkspace.items[0].state,'Agent working');
  assert.equal((await s.get('/api/projects/missing/home')).status,404);
  assert.equal((await s.web(s.h.request('/api/projects/studio/home'))).status,401);
  const prior = first.cursor;
  s.h.state.now += 24 * 60 * 60_000;
  const next = await (await s.get('/api/projects/studio/home')).json();
  assert.notEqual(next.cursor, prior, 'claim observation changes are part of the cursor');
});

function cssRules(css, context = '') {
  const out = [], re = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  for (const [, head, body] of css.matchAll(re)) {
    const selector = head.trim();
    if (selector.startsWith('@')) out.push(...cssRules(body, context + selector));
    else out.push({ context, selector, declarations: Object.fromEntries([...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:([^;]*)/g)].map(([, k, v]) => [k, v.trim()])) });
  }
  return out;
}

function parseBacklogDom(html) {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const unescape = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
  const toCamel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const element = (tag, attributes = {}, parent = null) => {
    const dataset = {};
    for (const [k, v] of Object.entries(attributes)) if (k.startsWith('data-')) dataset[toCamel(k.slice(5))] = v;
    const node = {
      tag, attributes, dataset, parent, children: [], listeners: {}, textParts: [],
      hidden: Object.hasOwn(attributes, 'hidden'),
      get textContent() { return node.textParts.join('') + node.children.map(c => c.textContent).join(''); },
      set textContent(v) { node.textParts = [String(v)]; node.children = []; },
      get innerHTML() { return node._html ?? ''; },
      set innerHTML(fragment) {
        node._html = fragment;
        const parsed = parseFragment(fragment, node);
        node.children = parsed.children; node.textParts = parsed.textParts;
      },
      setAttribute(name, val) {
        const s = String(val); node.attributes[name] = s;
        if (name === 'hidden') node.hidden = true;
        if (name.startsWith('data-')) node.dataset[toCamel(name.slice(5))] = s;
      },
      getAttribute: name => Object.hasOwn(node.attributes, name) ? node.attributes[name] : null,
      hasAttribute: name => Object.hasOwn(node.attributes, name),
      matches: selector => matchesSimple(node, selector),
      closest(selector) { let cur = node; while (cur && cur.tag !== '#document') { if (matchesSimple(cur, selector)) return cur; cur = cur.parent; } return null; },
      querySelector: selector => findAll(node, selector)[0] ?? null,
      querySelectorAll: selector => findAll(node, selector),
      addEventListener(name, fn) { (node.listeners[name] ??= []).push(fn); },
      removeEventListener(name, fn) { node.listeners[name] = (node.listeners[name] ?? []).filter(h => h !== fn); },
    };
    return node;
  };
  const matchesSimple = (node, selector) => selector.split(',').some(part => {
    let rest = part.trim(); if (!rest) return false;
    const t = /^([a-z0-9-]+)/i.exec(rest);
    if (t) { if (node.tag !== t[1].toLowerCase()) return false; rest = rest.slice(t[0].length); }
    while (rest.length) {
      const cls = /^\.([a-z0-9_-]+)/i.exec(rest);
      if (cls) { if (!(node.attributes.class ?? '').split(/\s+/).includes(cls[1])) return false; rest = rest.slice(cls[0].length); continue; }
      const attr = /^\[([a-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/i.exec(rest);
      if (!attr) return false;
      const [, name, dq, sq, raw] = attr, wanted = dq ?? sq ?? raw;
      if (!node.hasAttribute(name)) return false;
      if (wanted !== undefined && node.getAttribute(name) !== wanted) return false;
      rest = rest.slice(attr[0].length);
    }
    return true;
  });
  const findAll = (root, selector) => {
    const out = [], walk = cur => { for (const child of cur.children) { if (matchesSimple(child, selector)) out.push(child); walk(child); } };
    walk(root); return out;
  };
  const parseFragment = (src, container) => {
    const holder = { tag: container.tag, children: [], textParts: [], parent: container.parent }, stack = [holder];
    let last = 0;
    for (const m of src.matchAll(/<(\/)?([a-z0-9-]+)([^>]*)>/gi)) {
      const text = unescape(src.slice(last, m.index));
      if (text) stack.at(-1).textParts.push(text);
      last = m.index + m[0].length;
      const [, close, rawTag, rawAttrs] = m, tag = rawTag.toLowerCase();
      if (close) { while (stack.length > 1 && stack.pop().tag !== tag); continue; }
      const attrs = {};
      for (const [, name, dq, sq, bare] of rawAttrs.matchAll(/([a-z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi)) attrs[name] = unescape(dq ?? sq ?? bare ?? '');
      const parent = stack.at(-1) === holder ? container : stack.at(-1);
      const child = element(tag, attrs, parent);
      stack.at(-1).children.push(child);
      if (!VOID.has(tag) && !rawAttrs.trimEnd().endsWith('/')) stack.push(child);
    }
    const tail = unescape(src.slice(last));
    if (tail) stack.at(-1).textParts.push(tail);
    return holder;
  };
  const doc = element('#document');
  const parsed = parseFragment(html, doc);
  doc.children = parsed.children;
  return {
    querySelector: selector => findAll(doc, selector)[0] ?? null,
    querySelectorAll: selector => findAll(doc, selector),
    dispatch(target, type, extra = {}) {
      let prevented = false;
      const event = { type, target, preventDefault() { prevented = true; }, get defaultPrevented() { return prevented; }, ...extra };
      for (let cur = target; cur; cur = cur.parent) for (const fn of cur.listeners?.[type] ?? []) fn(event);
      return event;
    },
  };
}

test('backlog row actions stay in tab order, render inline without hover, and include Start disabled disclosure markup', async () => {
  const s = await hosted();
  const css = await (await s.web(s.h.request('/assets/backlog.css'))).text();
  const parsed = cssRules(css);

  // Every row action stays focusable: never display:none or visibility:hidden in any media context.
  for (const rule of parsed.filter(r => r.selector.includes('.backlog-act') && !r.selector.includes('.backlog-time'))) {
    assert.notEqual(rule.declarations.display, 'none', `${rule.context}|${rule.selector} never removes .backlog-act from tab order`);
    assert.notEqual(rule.declarations.visibility, 'hidden', `${rule.context}|${rule.selector} never hides .backlog-act from focus`);
  }
  // Base / (hover: none) / narrow viewports: .backlog-act is inline-flex, not opacity:0 or clipped.
  const baseAct = parsed.find(r => r.context === '' && r.selector === '.backlog-act');
  assert.ok(baseAct, '.backlog-act has an inline base rule for (hover: none) and narrow viewports');
  assert.equal(baseAct.declarations.display, 'inline-flex');
  assert.equal(baseAct.declarations.opacity, undefined);
  assert.equal(baseAct.declarations['clip-path'], undefined);
  assert.equal(parsed.some(r => r.context === '' && r.selector.includes('.backlog-time') && r.declarations.display === 'none'), false, 'time stays visible inline where hover is absent');
  const narrowEdge = parsed.filter(r => r.context === '@media(max-width:600px)' && r.selector.split(',').some(p => p.trim() === '.backlog-edge'));
  assert.ok(narrowEdge.some(r => r.declarations['grid-column'] === '3/-1'), 'narrow viewports place .backlog-edge inline under the row title');

  // Pointer-fine wide screens: visually hidden with opacity + clip-path until :hover or :focus-within, then swaps with .backlog-time.
  const fineRest = parsed.find(r => r.context.includes('(hover:hover)') && r.context.includes('(pointer:fine)') && r.selector.includes(':not(:hover,:focus-within)') && r.selector.endsWith('.backlog-act'));
  assert.ok(fineRest, 'pointer-fine wide screens hide resting .backlog-act visually');
  assert.equal(fineRest.declarations.opacity, '0');
  assert.match(fineRest.declarations['clip-path'] ?? '', /^inset\(/);
  const fineTime = parsed.find(r => r.context.includes('(hover:hover)') && r.context.includes('(pointer:fine)') && r.selector.includes('.backlog-act+.backlog-time'));
  assert.equal(fineTime?.declarations.display, 'none');

  // All five row action shapes render focusable controls, and disabled Start renders its reason in DOM markup.
  const backlog = {
    generatedAt: '2026-11-05T12:00:00.000Z',
    plates: [{ projectId: 'studio', projectName: 'Acme Studio', state: 'read', coverage: 'complete', counts: { 'in-flight': 0, yours: 3, 'agent-ready': 2, waiting: 0, done: 0 } }],
    lanes: [
      { lane: 'yours', title: 'Yours', items: [
        { key: 'studio:phase:2', projectId: 'studio', projectName: 'Acme Studio', kind: 'phase', ref: '2', title: 'Acme walk phase', since: '2026-11-01', children: ['studio:walk:2'], why: ['G1'], answers: [] },
        { key: 'studio:review:7', projectId: 'studio', projectName: 'Acme Studio', kind: 'review', ref: '7', title: 'Acme PR review', since: '2026-11-01', source: { url: 'https://github.com/acme/studio/pull/7' }, why: [], answers: [] },
        { key: 'studio:decision:3', projectId: 'studio', projectName: 'Acme Studio', kind: 'decision', ref: '3', title: 'Acme decision', since: '2026-11-01', why: [], answers: [{ id: 'yes', label: 'Approve' }] },
      ] },
      { lane: 'agent-ready', title: 'Agent-ready', items: [
        { key: 'studio:phase:1', projectId: 'studio', projectName: 'Acme Studio', kind: 'phase', ref: '1', title: 'Acme ready phase', since: '2026-11-01', why: ['G1'], answers: [] },
        { key: 'studio:phase:0', projectId: 'studio', projectName: 'Acme Studio', kind: 'phase', ref: '0', title: 'Acme bootstrap phase', since: '2026-11-01', why: ['G1'], answers: [] },
      ] },
    ],
  };
  const dom = parseBacklogDom(renderBacklog(backlog));
  const acts = dom.querySelectorAll('.backlog-act');
  assert.deepEqual(acts.map(el => [el.tag, el.textContent.trim(), el.hasAttribute('disabled'), el.getAttribute('tabindex')]), [
    ['a', 'Open walk', false, null],
    ['a', 'Open PR ↗', false, null],
    ['a', 'Answer', false, null],
    ['a', 'Preview attach', false, null],
    ['button', 'Start', false, null],
  ]);
  const startButton = dom.querySelector('[data-backlog-start]');
  const startNote = dom.querySelector('[data-backlog-start-note]');
  assert.ok(startButton && startNote, 'disabled Start renders a disclosure note in the row');
  assert.equal(startButton.getAttribute('aria-disabled'), 'true');
  assert.equal(startButton.getAttribute('aria-expanded'), 'false');
  assert.equal(startButton.getAttribute('aria-controls'), startNote.getAttribute('id'));
  assert.equal(startButton.getAttribute('aria-describedby'), startNote.getAttribute('id'));
  assert.equal(startNote.hidden, true);
  assert.equal(startNote.textContent, `${START_UNAVAILABLE}: ${attachCommand('studio:phase:0')}`);
});

test('clicking or pressing Enter on Start discloses its disabled reason without hover, across refreshes', async () => {
  const makeModel = state => ({
    schema: 1, generatedAt: '2026-11-05T12:00:00.000Z', lane: null, needsShaping: 0, claims: [],
    plates: [{ projectId: 'studio', projectName: 'Acme Studio', state, readAt: '2026-11-05T11:55:00.000Z', counts: { 'in-flight': 0, yours: 0, 'agent-ready': 1, waiting: 0, done: 0 } }],
    lanes: [{ lane: 'agent-ready', title: 'Agent-ready', count: 1, items: [
      { key: 'studio:phase:0', projectId: 'studio', projectName: 'Acme Studio', kind: 'phase', ref: '0', title: 'Acme bootstrap phase', since: '2026-11-01', why: ['G1'], answers: [] },
    ] }],
  });
  // Warm page (data-loading="false"): startBacklogClient returns null, and click / Enter still disclose the reason.
  const warmHtml = backlogView({ workspace: { name: 'Acme' }, csrf: 'acme-csrf', projects: [] }, makeModel('read'));
  const warmDom = parseBacklogDom(warmHtml);
  assert.equal(startBacklogClient({ document: warmDom, window: { setTimeout() {}, clearTimeout() {} }, fetch: () => assert.fail('no poll on warm page'), renderBacklog, renderSidebar }), null);
  const button = warmDom.querySelector('[data-backlog-start]'), note = warmDom.querySelector('[data-backlog-start-note]');
  assert.ok(button && note);
  assert.equal(note.hidden, true);
  warmDom.dispatch(button, 'click');
  assert.equal(note.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.match(note.textContent, /Attaching from the web is not on yet.*plates home --attach studio:phase:0 --route session/);
  const enterClose = warmDom.dispatch(button, 'keydown', { key: 'Enter' });
  assert.equal(enterClose.defaultPrevented, true);
  assert.equal(note.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  warmDom.dispatch(button, 'keydown', { key: 'Enter' });
  assert.equal(note.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  // Polling page (data-loading="true"): an open disclosure survives list re-rendering.
  const timers = [];
  const staleDom = parseBacklogDom(backlogView({ workspace: { name: 'Acme' }, csrf: 'acme-csrf', projects: [] }, makeModel('stale')));
  // Replace outerHTML setter on sidebar for minimal fake DOM.
  const side = staleDom.querySelector('[data-backlog-side]');
  side.outerHTML = '';
  const client = startBacklogClient({
    document: staleDom,
    window: { setTimeout: (fn, ms) => { timers.push(fn); return timers.length; }, clearTimeout() {} },
    fetch: async () => ({ status: 200, json: async () => makeModel('read') }),
    renderBacklog, renderSidebar,
  });
  staleDom.dispatch(staleDom.querySelector('[data-backlog-start]'), 'click');
  assert.equal(staleDom.querySelector('[data-backlog-start-note]').hidden, false);
  await timers.shift()();
  await client.done;
  const refreshedNote = staleDom.querySelector('[data-backlog-start-note]');
  const refreshedButton = staleDom.querySelector('[data-backlog-start]');
  assert.equal(refreshedNote.hidden, false, 'open Start reason stays visible after poll re-render');
  assert.equal(refreshedButton.getAttribute('aria-expanded'), 'true');
});
