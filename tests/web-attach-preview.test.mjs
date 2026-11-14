// Phase 181: real hosted routes over synthetic Acme sources. No live grants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectHarness, phaseFile } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { attachPreview, canonical } from '../lib/attach.mjs';
import { claimMessage } from '../lib/claim.mjs';
import { describeRoute } from '../lib/web/navigation-routes.mjs';
import { renderBacklog } from '../lib/web/backlog-views.mjs';

const query = '?key=studio:phase:1&route=session&provider=codex';
const api = '/api/projects/studio/attach', page = '/projects/studio/attach';
async function hosted() {
  const h = projectHarness();
  h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', agents: { codex: {}, claude: {} } });
  h.source.files['docs/phases/01-first.md'] = phaseFile(1).replace('status: planned', 'status: planned\nspec: 2');
  const state = { claims: [], claimsUnavailable: false, pulls: { totalCount: 0, nodes: [] }, pullsPermission: true, beforeSource: null, afterClaims: null, calls: [] };
  const fetcher = async (url, options) => {
    state.calls.push({ url, options });
    if (new URL(url).pathname === '/user/installations') {
      const response = await h.fetcher(url, options), body = await response.json();
      if (state.pullsPermission) body.installations[0].permissions.pull_requests = 'read';
      return Response.json(body);
    }
    if (new URL(url).pathname === '/repositories/102') state.beforeSource?.(options.signal);
    if (new URL(url).pathname === '/graphql' && JSON.parse(options.body).query.includes('PlatesClaims')) {
      state.afterClaims?.();
      return state.claimsUnavailable ? Response.json({ errors: [{ message: 'fake-private-detail' }] }) : Response.json({ data: { repository: { refs: Object.hasOwn(state, 'refs') ? state.refs : { totalCount: state.claims.length, nodes: state.claims }, ...(JSON.parse(options.body).query.includes('pullRequests(') ? { pullRequests: state.pulls } : {}) } } });
    }
    return h.fetcher(url, options);
  };
  const web = createWebService(h.config, { fetcher, now: () => h.state.now }), signed = await h.login();
  const get = path => web(h.request(path, { cookie: signed.cookie }));
  return { h, state, web, signed, get };
}

function noAttachWrites(calls) {
  for (const { url, options } of calls) {
    const path = new URL(url).pathname;
    if (new URL(url).hostname === 'api.github.com') {
      assert.ok(!options.method || options.method === 'GET' || path === '/graphql', path);
      if (path === '/graphql') assert.doesNotMatch(JSON.parse(options.body).query, /\bmutation\b/);
    }
    if (path.endsWith('/plates_web_rpc')) assert.ok(['session', 'auth'].includes(JSON.parse(options.body).p_kind), 'no attach persistence');
    if (path.includes('/rpc/')) assert.match(path, /(?:web|home_quota)_rpc$/, `only existing auth and quota bookkeeping: ${path}`);
  }
}

test('hosted attach preview shows exact source and brief without claiming or running', async () => {
  const s = await hosted(), response = await s.get(api + query);
  assert.equal(response.status, 200, await response.clone().text());
  const model = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(model.preview, attachPreview({ projectId: 'studio', phase: 1, title: 'Acme phase 1', route: 'session', provider: 'codex' }));
  assert.deepEqual(model.source, { workspaceRevision: 'a'.repeat(40), repoId: 102, repo: 'acme/studio', revision: 'b'.repeat(40), path: 'docs/phases/01-first.md' });
  assert.equal(model.digest, createHash('sha256').update(canonical({ source: model.source, key: model.key, preview: model.preview })).digest('hex'));
  assert.deepEqual([model.claimed, model.running, model.capabilities], [false, false, { apply: false, dispatch: false }]);
  const html = await (await s.get(page + query)).text();
  for (const value of [model.source.revision, model.source.workspaceRevision, model.preview.digest, model.digest, model.preview.effect.brief.sha256]) assert.ok(html.includes(value));
  assert.match(html, /Nothing is claimed or started/);
  assert.match(html, /does not run an agent/);
  assert.match(html, /Prospective brief/);
  assert.doesNotMatch(/<main[\s\S]*?<\/main>/.exec(html)[0], /method="post"|data-[^= ]*apply/);
  const choice = await (await s.get(api + '?key=studio:phase:1&route=session')).json();
  assert.equal(choice.state, 'choose-provider'); assert.equal(choice.preview, null);
  assert.deepEqual(choice.providers, ['codex', 'claude']);
  noAttachWrites(s.state.calls);
});

test('hosted attach preview refreshes source and binds its revision', async () => {
  const s = await hosted(), first = await (await s.get(api + query)).json();
  s.h.source.revision = 'd'.repeat(40);
  s.h.source.files['docs/phases/01-first.md'] = s.h.source.files['docs/phases/01-first.md'].replace('Acme phase 1', 'Acme revised phase');
  const next = await (await s.get(api + query)).json();
  assert.equal(next.source.revision, 'd'.repeat(40));
  assert.equal(next.preview.effect.title, 'Acme revised phase');
  assert.notEqual(next.digest, first.digest); assert.notEqual(next.preview.effect.brief.sha256, first.preview.effect.brief.sha256);
  s.h.source.revision = 'e'.repeat(40);
  const revisionOnly = await (await s.get(api + query)).json();
  assert.equal(revisionOnly.preview.digest, next.preview.digest); assert.notEqual(revisionOnly.digest, next.digest);
});

test('hosted attach preview refuses held and ineligible phases', async () => {
  const s = await hosted();
  const at = new Date(s.h.state.now).toISOString();
  s.state.claims = [{ name: 'phase-1', target: { oid: 'c'.repeat(40), message: claimMessage({ phase: 1, provider: 'claude', machine: 'acme-host', at, token: 'synthetic' }), committedDate: at } }];
  for (const route of [api, page]) assert.equal((await s.get(route + query)).status, 409);
  s.state.claims = [];
  for (const phase of [2, 3, 4, 999]) assert.equal((await s.get(api + query.replace('phase:1', `phase:${phase}`))).status, 409);
  s.h.source.files['docs/phases/01-first.md'] = phaseFile(1);
  assert.equal((await s.get(api + query)).status, 409, 'unshaped phase is not agent-ready');
  noAttachWrites(s.state.calls);
});

test('hosted attach preview rejects invalid keys providers routes and writes', async () => {
  const s = await hosted();
  for (const route of [api, page]) for (const q of [
    '?key=other:phase:1&route=session', '?key=studio:phase:01&route=session', '?key=studio:phase:1',
    query + '&yes=1', query + '&provider=claude', query.replace('codex', '__proto__'), query.replace('codex', 'unknown'),
    ...['local-host', 'tonight', 'robot', 'worker'].map(r => query.replace('route=session', `route=${r}`)),
  ]) assert.equal((await s.get(route + q)).status, 400, route + q);
  for (const route of [api, page, api + '/apply', api + '/dispatch']) {
    assert.notEqual((await s.web(s.h.request(route + query, { cookie: s.signed.cookie, body: { yes: 'true' } }))).status, 200);
  }
  s.h.source.files['.plates/plates.json'] = JSON.stringify({ name: 'Acme Studio', backlog: { routes: ['local-host'] } });
  assert.equal((await s.get(api + query)).status, 409);
  noAttachWrites(s.state.calls);
});

test('hosted attach preview rechecks authorization and rejects other owners', async () => {
  for (const route of [api, page]) {
    const s = await hosted();
    assert.equal((await s.web(s.h.request(route + query))).status, 401);
    assert.equal(s.h.source.requests.length, 0);
    assert.equal((await s.get(route.replace('/studio/', '/other/') + query)).status, 404);
    assert.equal(s.h.source.requests.length, 0);
    s.state.afterClaims = () => { s.h.state.members = []; };
    const denied = await s.get(route + query);
    assert.notEqual(denied.status, 200); assert.doesNotMatch(await denied.text(), /Acme phase 1|fake-private-detail/);
  }
});

test('hosted attach preview fails closed on unread claims and bounded source', async () => {
  const s = await hosted();
  s.state.claimsUnavailable = true;
  assert.equal((await s.get(api + query)).status, 503);
  s.state.claimsUnavailable = false; s.h.source.treeTruncated = true;
  assert.equal((await s.get(api + query)).status, 503);
  s.h.source.treeTruncated = false; s.h.source.denied = true;
  assert.equal((await s.get(api + query)).status, 401);
});

test('eligible backlog row links to the read-only attach preview', () => {
  const item = { key: 'studio:phase:1', projectId: 'studio', kind: 'phase', ref: '1', title: 'Acme phase' };
  const html = renderBacklog({ lanes: [{ lane: 'agent-ready', title: 'Agent-ready', items: [item] }] });
  assert.match(html, /href="\/projects\/studio\/attach\?key=studio%3Aphase%3A1&amp;route=session">Preview attach<\/a>/);
  assert.ok(describeRoute(page + query));
  assert.equal(describeRoute(page + query + '&yes=1'), null);
  assert.equal(describeRoute(page + '?key=other:phase:1&route=session'), null);
});


test('hosted attach preview requires complete PR ownership coverage', async () => {
  for (const route of [api, page]) {
    const s = await hosted();
    s.state.pulls = { totalCount: 1, nodes: [{ number: 7, headRefName: 'codex/phase-1', createdAt: new Date(s.h.state.now).toISOString(), author: { login: 'acme-builder' } }] };
    s.state.pullsPermission = false;
    assert.equal((await s.get(route + query)).status, 503, 'no PR visibility is unknown ownership');
    s.state.pullsPermission = true;
    assert.equal((await s.get(route + query)).status, 409, 'a PR owns the phase without a claim branch');
    for (const incomplete of [null, { totalCount: 1, nodes: [] }, { nodes: [] }, { totalCount: 1, nodes: [null] }]) {
      s.state.pulls = incomplete;
      assert.equal((await s.get(route + query)).status, 503, 'incomplete PR query cannot establish an unowned phase');
    }
    noAttachWrites(s.state.calls);
  }
});

test('hosted attach preview refuses PR permission revoked during its read', async () => {
  const s = await hosted();
  s.state.afterClaims = () => { s.state.pullsPermission = false; };
  assert.equal((await s.get(api + query)).status, 404);
});

test('hosted attach preview propagates request abort into source reads', async () => {
  for (const route of [api, page]) {
    const s = await hosted(), controller = new AbortController();
    let sourceSignal;
    s.state.beforeSource = signal => {
      sourceSignal = signal;
      controller.abort();
      signal.throwIfAborted();
    };
    const request = new Request(s.h.request(route + query, { cookie: s.signed.cookie }), { signal: controller.signal });
    const response = await s.web(request);
    assert.ok(sourceSignal, 'abort occurs after the source read begins');
    assert.equal(sourceSignal.aborted, true, 'the source fetch receives the request cancellation');
    assert.equal(response.status, 503);
    assert.equal(s.state.calls.filter(c => new URL(c.url).pathname.startsWith('/repos/acme/studio/')).length, 0, 'no further source read after cancellation');
  }
});


test('hosted attach preview rejects unknown claim totals but accepts a complete empty read', async () => {
  const s = await hosted();
  for (const route of [api, page]) {
    for (const refs of [null, { nodes: [] }, ...[null, -1, 0.5, '0', 1].map(totalCount => ({ totalCount, nodes: [] }))]) {
      s.state.refs = refs;
      assert.equal((await s.get(route + query)).status, 503, JSON.stringify(refs));
    }
    s.state.refs = { totalCount: 0, nodes: [] };
    assert.equal((await s.get(route + query)).status, 200, 'zero with a complete empty list is known empty');
  }
});

test('hosted attach preview rejects malformed claim records instead of dropping them', async () => {
  const s = await hosted();
  const valid = { name: 'phase-1', target: { oid: 'c'.repeat(40), message: 'Unrecognized holder metadata', committedDate: new Date(s.h.state.now).toISOString() } };
  for (const route of [api, page]) {
    for (const nodes of [[null], [{}], [{ ...valid, name: 'phase-unknown' }], [{ ...valid, name: 'phase-9007199254740992' }],
      [{ ...valid, target: null }], [{ ...valid, target: {} }], [{ ...valid, target: { ...valid.target, oid: null } }],
      [{ ...valid, target: { ...valid.target, message: null } }], [{ ...valid, target: { ...valid.target, committedDate: null } }], [valid, valid]]) {
      s.state.refs = { totalCount: nodes.length, nodes };
      assert.equal((await s.get(route + query)).status, 503, JSON.stringify(nodes));
    }
    s.state.refs = { totalCount: 1, nodes: [valid] };
    assert.equal((await s.get(route + query)).status, 409, 'unknown holder metadata still means a held phase');
  }
});

test('hosted attach preview distinguishes the integration lock from phase ownership', async () => {
  const s = await hosted();
  const lock = { name: 'integrate', target: { oid: 'c'.repeat(40), message: 'Acme integration lock', committedDate: new Date(s.h.state.now).toISOString() } };
  for (const route of [api, page]) {
    s.state.refs = { totalCount: 1, nodes: [lock] };
    assert.equal((await s.get(route + query)).status, 200, 'integration lock does not own the available phase');
    s.state.refs = { totalCount: 2, nodes: [lock, { ...lock, name: 'phase-1' }] };
    assert.equal((await s.get(route + query)).status, 409, 'phase claim still blocks while integration is locked');
    for (const name of ['phase-unknown', 'phase-1-extra', 'integrate-unknown']) {
      s.state.refs = { totalCount: 2, nodes: [lock, { ...lock, name }] };
      assert.equal((await s.get(route + query)).status, 503, 'ambiguous refs are never silently ignored');
    }
    s.state.refs = { totalCount: 2, nodes: [lock] };
    assert.equal((await s.get(route + query)).status, 503, 'complete listing remains required with a recognized lock');
  }
});
