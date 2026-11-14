// Phase 181. Synthetic contracts only: singleton listing is not a live scope-enforcement proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareClaimIntent } from '../lib/web/attach-github.mjs';
import { createAttachCommit } from '../lib/web/attach-commit.mjs';
import { WebError } from '../lib/web/common.mjs';
const start = Date.parse('2026-11-14T12:00:00Z');
const parentToken = 'fake-acme-parent-token', childToken = 'fake-acme-child-token', secret = 'fake-acme-client-secret';
function fixture(options = {}) {
  const config = { appId: 11, clientId: 'acme-client', clientSecret: secret, installationId: 21, actorId: 1, ownerId: 2,
    repoId: 102, repositoryNodeId: 'R_acme_studio', repo: 'acme/studio' };
  const parent = { token: parentToken, tokenExpiry: start + 3600000 };
  const intent = prepareClaimIntent({ operationId: 'a'.repeat(64), repoId: 102, repositoryNodeId: 'R_acme_studio', repo: 'acme/studio', phase: 1,
    provider: 'codex', machine: 'acme-hosted', at: '2026-11-14T12:00:00Z', parent: 'b'.repeat(40), tree: 'c'.repeat(40), identity: { name: 'Acme Builder', email: 'builder@acme.example' } });
  const expected = structuredClone(intent);
  const repository = { id: 102, node_id: 'R_acme_studio', full_name: 'acme/studio', owner: { id: 2 }, permissions: { push: true } };
  const graphRepo = { id: 'R_acme_studio', databaseId: 102, nameWithOwner: 'acme/studio' };
  const install = { id: 21, app_id: 11, account: { id: 2 }, repository_selection: 'selected', suspended_at: null, permissions: { contents: 'write', metadata: 'read', actions: 'write', issues: 'write' } };
  // Authorization scope and installation capabilities are separate provider records.
  const scopedInstallation = { account: { id: 2 }, repository_selection: 'selected',
    permissions: { contents: 'write', metadata: 'read' }, single_file_name: null, has_multiple_single_files: false, single_file_paths: [] };
  const grant = token => ({ token, user: { id: 1 }, app: { client_id: 'acme-client' }, scopes: [], expires_at: new Date(token === parentToken ? start + 3600000 : start + 1800000).toISOString() });
  const commit = { sha: expected.commit, message: expected.payload.message, tree: { sha: expected.tree }, parents: [{ sha: expected.parent }], author: { ...expected.payload.author }, committer: { ...expected.payload.committer } };
  const state = { now: start, calls: [], change: null, intercept: null, published: false };
  const fetcher = async (url, opts) => {
    assert.ok(url.startsWith('https://api.github.com/')); assert.equal(opts.redirect, 'error'); assert.ok(opts.signal);
    const path = new URL(url).pathname, body = opts.body ? JSON.parse(opts.body) : null;
    const token = opts.headers.Authorization.replace(/^Bearer /, '');
    const kind = path.endsWith('/token/scoped') ? 'mint' : path.endsWith('/git/commits') ? 'commit'
      : path.endsWith('/token') ? 'token' : path === '/graphql' ? body.query.includes('HostedClaimInspect') ? 'inspect' : 'graph'
      : path === '/user' ? 'user' : path === '/user/installations' ? 'installations' : path.endsWith('/repositories') ? 'repos' : 'repository';
    const child = token === childToken || body?.access_token === childToken;
    const call = { path, kind, body, child, method: opts.method, signal: opts.signal }; state.calls.push(call);
    if (state.intercept) { const response = await state.intercept(call, opts); if (response) return response; }
    if (['token', 'mint'].includes(kind)) assert.equal(opts.headers.Authorization, `Basic ${Buffer.from(`acme-client:${secret}`).toString('base64')}`);
    else assert.ok([`Bearer ${parentToken}`, `Bearer ${childToken}`].includes(opts.headers.Authorization));
    let data;
    if (kind === 'token') data = { ...grant(body.access_token), installation: structuredClone(child ? scopedInstallation : install) };
    else if (kind === 'mint') data = { ...grant(childToken), installation: structuredClone(scopedInstallation) };
    else if (kind === 'user') data = { id: 1 };
    else if (kind === 'installations') data = { total_count: 1, installations: [structuredClone(install)] };
    else if (kind === 'repos') data = { total_count: 1, repositories: [structuredClone(repository)] };
    else if (kind === 'repository') data = structuredClone(repository);
    else if (kind === 'graph') data = { data: { node: { ...graphRepo, owner: { databaseId: 2 }, viewerPermission: 'WRITE', source: { oid: expected.parent, tree: { oid: expected.tree } } } } };
    else if (kind === 'commit') {
      assert.equal(token, childToken, 'never publish with parent'); assert.deepEqual(body, expected.payload);
      state.published = true; data = structuredClone(commit);
    } else if (kind === 'inspect') {
      assert.equal(token, childToken);
      data = { data: { node: { ...graphRepo, source: { oid: expected.parent, tree: { oid: expected.tree }, repository: graphRepo }, ref: null,
        candidate: state.published ? { oid: expected.commit, message: expected.payload.message, tree: { oid: expected.tree }, parents: { totalCount: 1, nodes: [{ oid: expected.parent }] },
          author: expected.payload.author, committer: expected.payload.committer, repository: graphRepo } : null } } };
    } else throw Error('unexpected synthetic path');
    state.change?.(call, data);
    return Response.json(data, { status: kind === 'commit' ? 201 : 200 });
  };
  const publisher = createAttachCommit(config, intent, parent, { fetcher, now: () => state.now, ...options });
  return { config, intent, parent, state, publisher, fetcher };
}
const effects = s => s.calls.filter(c => ['mint', 'commit'].includes(c.kind)).map(c => c.kind);
const clean = value => { const text = JSON.stringify(value); for (const sensitive of [parentToken, childToken, secret, Buffer.from(`acme-client:${secret}`).toString('base64')]) assert.ok(!text.includes(sensitive)); };

test('exact repository grant publishes prepared bytes once and verifies through immutable node', async () => {
  const { publisher, state, intent } = fixture();
  const result = await publisher.publishCommit();
  assert.deepEqual(effects(state), ['mint', 'commit']); assert.equal(result.state, 'published'); assert.equal(result.commit, intent.commit);
  assert.equal(result.commitObservation, 'verified'); assert.equal(result.retryAuthorized, false); clean(result);
  const mint = state.calls.find(c => c.kind === 'mint');
  assert.deepEqual(mint.body, { access_token: parentToken, target_id: 2, repository_ids: [102], permissions: { contents: 'write', metadata: 'read' } });
  assert.equal(state.calls.at(-1).kind, 'inspect'); assert.equal(state.calls.at(-1).body.variables.repositoryId, 'R_acme_studio');
  assert.equal((await publisher.publishCommit()).reason, 'original_operation_already_attempted'); assert.deepEqual(effects(state), ['mint', 'commit']);
});

test('caller mutation cannot replace frozen intent metadata or parent while awaiting IO', async () => {
  const f = fixture(); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.state.intercept = async call => { if (call.kind === 'token' && !call.child) { entered(); await new Promise(resolve => { release = resolve; }); } };
  const pending = f.publisher.publishCommit(); await waiting;
  f.config.repoId = 999; f.config.ownerId = 999; f.parent.token = 'fake-other-token'; f.intent.payload.message = 'changed'; f.intent.repo = 'acme/other';
  release(); const result = await pending;
  assert.equal(result.state, 'published'); assert.equal(result.repoId, 102); clean(result);
});

test('parent authorization must be observed before minting', async () => {
  for (const [kind, alter] of [
    ['token', d => d.user.id++], ['token', d => d.app.client_id = 'wrong'], ['token', d => d.scopes.push('repo')],
    ['user', d => d.id++], ['installations', d => d.installations[0].app_id++], ['installations', d => d.installations[0].id++],
    ['installations', d => d.installations[0].repository_selection = 'all'], ['installations', d => d.installations[0].account.id++], ['installations', d => d.installations[0].permissions.contents = 'read'],
    ['installations', d => d.installations[0].suspended_at = '2026-11-14T00:00:00Z'], ['repos', d => d.repositories[0].id++],
    ['repos', d => d.total_count++], ['repository', d => d.node_id = 'R_wrong'], ['repository', d => d.permissions.push = false],
    ['repository', d => d.owner.id++], ['graph', d => d.data.node.viewerPermission = 'READ'], ['graph', d => d.data.node.databaseId++],
    ['graph', d => d.data.node.source.tree.oid = 'd'.repeat(40)],
  ]) {
    const f = fixture(); f.state.change = (call, d) => { if (call.kind === kind && !call.child) alter(d); };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, 'unavailable', kind); assert.deepEqual(effects(f.state), []); clean(result);
  }
  const f = fixture(); f.state.now += 3600000;
  assert.equal((await f.publisher.publishCommit()).reason, 'credential_expired'); assert.equal(f.state.calls.length, 0);
});

test('child grant must bind actor client owner selected permissions and finite expiry', async () => {
  for (const alter of [d => d.user.id++, d => d.app.client_id = 'wrong', d => d.token = parentToken, d => d.installation.account.id++,
    d => d.installation.repository_selection = 'all', d => d.installation.permissions.issues = 'write', d => d.installation.permissions.contents = 'read',
    d => d.expires_at = null, d => delete d.expires_at, d => d.expires_at = '2026-11-14T11:59:59Z', d => d.expires_at = '2026-11-15T12:00:00Z',
    d => d.installation.single_file_name = 'file',
  ]) {
    const f = fixture(); f.state.change = (call, d) => { if (call.kind === 'mint') alter(d); };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, 'uncertain'); assert.equal(result.stage, 'mint'); assert.deepEqual(effects(f.state), ['mint']); clean(result);
  }
});

test('child broad incomplete or inconsistent authorization refuses even a schema-valid grant', async () => {
  for (const [kind, alter] of [
    ['token', d => d.user.id++], ['token', d => delete d.installation], ['token', d => d.installation.account.id++],
    ['token', d => d.installation.repository_selection = 'all'], ['token', d => d.installation.permissions.issues = 'write'],
    ['token', d => d.installation.single_file_name = 'restricted'], ['token', d => d.expires_at = '2026-11-14T12:10:00Z'], ['user', d => d.id++],
    ['installations', d => d.installations[0].permissions.contents = 'read'], ['installations', d => d.installations[0].repository_selection = 'all'], ['installations', d => d.installations[0].app_id++],
    ['repos', d => { d.total_count = 2; d.repositories.push({ ...d.repositories[0], id: 103 }); }], ['repos', d => d.total_count = 2],
    ['repos', d => d.repositories = []], ['repos', d => d.repositories[0].node_id = 'R_reused'], ['repos', d => d.repositories[0].owner.id++],
    ['repository', d => d.permissions.push = false], ['graph', d => d.data.node.viewerPermission = 'READ'], ['graph', d => d.data.node.owner.databaseId++],
  ]) {
    const f = fixture(); f.state.change = (call, d) => { if (call.kind === kind && call.child) alter(d); };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, 'unavailable', kind); assert.equal(result.stage, 'child'); assert.deepEqual(effects(f.state), ['mint']); clean(result);
  }
});

test('mint and commit ambiguity never repeat or fall back to the parent', async () => {
  for (const kind of ['mint', 'commit']) {
    const f = fixture(); f.state.intercept = call => { if (call.kind === kind) throw new WebError(childToken); };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, 'uncertain'); assert.equal(result.stage, kind); clean(result);
    const before = f.state.calls.length; await f.publisher.publishCommit(); assert.equal(f.state.calls.length, before);
    assert.deepEqual(effects(f.state), kind === 'mint' ? ['mint'] : ['mint', 'commit']);
  }
});

test('wrong returned SHA bytes and immutable readback preserve commit uncertainty', async () => {
  for (const [kind, alter] of [['commit', d => d.sha = 'd'.repeat(40)], ['commit', d => d.message += 'changed'],
    ['commit', d => d.parents[0].sha = 'd'.repeat(40)], ['commit', d => d.tree.sha = 'd'.repeat(40)],
    ['commit', d => d.committer.date = '2026-11-14T13:00:00Z'], ['inspect', d => d.data.node.databaseId++], ['inspect', d => d.data.node.candidate = null]]) {
    const f = fixture(); f.state.change = (call, d) => { if (call.kind === kind) alter(d); };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, 'uncertain'); assert.equal(result.commitObservation, 'uncertain'); clean(result);
  }
});

const never = () => new Promise(() => {});
test('whole operation bounds stalled fetch body and cancel at every effect boundary', { timeout: 5000 }, async () => {
  for (const kind of ['token', 'mint', 'commit', 'inspect']) for (const mode of ['fetch', 'body', 'cancel']) {
    const f = fixture({ timeoutMs: 20 }); let late, cancellations = 0;
    f.state.intercept = call => {
      if (call.kind !== kind) return;
      if (mode === 'fetch') return new Promise(resolve => { late = resolve; });
      if (mode === 'body') return new Response(new ReadableStream({ cancel() { cancellations++; return never(); } }), { status: kind === 'commit' ? 201 : 200 });
      let read = false;
      return { status: kind === 'commit' ? 201 : 200, body: { getReader: () => ({ read: async () => read ? { done: true } : (read = true, { done: false, value: Buffer.from('{}') }), cancel() { cancellations++; return never(); } }) } };
    };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, kind === 'token' ? 'unavailable' : 'uncertain', kind + mode); clean(result);
    const calls = f.state.calls.length;
    if (late) { late(Response.json({})); await new Promise(resolve => setImmediate(resolve)); }
    assert.equal(f.state.calls.length, calls, 'late response cannot continue to another effect');
    if (mode !== 'fetch') assert.ok(cancellations >= 1);
  }
});

test('aborts expiry and redirects stop before the next effect and never leak provider text', async () => {
  for (const kind of ['token', 'mint', 'commit']) {
    const controller = new AbortController(), f = fixture({ signal: controller.signal });
    f.state.intercept = call => { if (call.kind === kind) { controller.abort(); return never(); } };
    const result = await f.publisher.publishCommit(); assert.equal(result.state, kind === 'token' ? 'unavailable' : 'uncertain'); clean(result);
  }
  const expired = fixture(); expired.state.change = call => { if (call.kind === 'graph' && call.child) expired.state.now += 1800000; };
  assert.equal((await expired.publisher.publishCommit()).state, 'unavailable'); assert.deepEqual(effects(expired.state), ['mint']);
  const redirect = fixture(); redirect.state.intercept = () => new Response(secret, { status: 302, headers: { location: 'https://elsewhere.acme.example' } });
  const result = await redirect.publisher.publishCommit(); assert.equal(result.state, 'unavailable'); assert.equal(redirect.state.calls.length, 1); clean(result);
});

test('invalid configuration and modified intents are rejected without IO', () => {
  const f = fixture();
  for (const edit of [c => c.repoId++, c => c.appId = '11', c => c.ownerId = -1, c => c.fallback = true]) {
    const c = structuredClone(f.config); edit(c); assert.throws(() => createAttachCommit(c, f.intent, f.parent, { fetcher: f.fetcher }), { code: 'invalid_attach_commit' });
  }
  const changed = structuredClone(f.intent); changed.payload.message += 'changed';
  assert.throws(() => createAttachCommit(f.config, changed, f.parent, { fetcher: f.fetcher }), { code: 'invalid_attach_commit' });
  assert.equal(f.state.calls.length, 0);
});

test('provider WebError identity never exposes fetch or body errors', async () => {
  for (const sensitive of [parentToken, childToken, secret, 'raw-provider-error']) {
    for (const kind of ['token', 'mint', 'commit']) for (const mode of ['fetch', 'body']) {
      const f = fixture();
      f.state.intercept = call => {
        if (call.kind !== kind) return;
        if (mode === 'fetch') throw new WebError(sensitive);
        return { status: kind === 'commit' ? 201 : 200, body: { getReader: () => ({
          read() { throw new WebError(sensitive); }, cancel() { throw new WebError(sensitive); },
        }) } };
      };
      const result = await f.publisher.publishCommit();
      assert.equal(result.reason, 'provider_unavailable');
      assert.equal(result.state, kind === 'token' ? 'unavailable' : 'uncertain');
      assert.ok(!JSON.stringify(result).includes(sensitive)); clean(result);
    }
  }
});

test('broader parent and child installation permissions permit a narrow verified child grant', async () => {
  const f = fixture(), observed = [];
  f.state.change = (call, data) => {
    if (call.kind === 'installations') {
      assert.equal(data.installations[0].permissions.actions, 'write');
      assert.equal(data.installations[0].permissions.issues, 'write');
      observed.push(call.child ? 'child-installation' : 'parent-installation');
    }
    if (call.kind === 'mint' || call.kind === 'token' && call.child) {
      assert.deepEqual(data.installation.permissions, { contents: 'write', metadata: 'read' });
      observed.push(call.kind === 'mint' ? 'minted-grant' : 'checked-grant');
    }
  };
  const result = await f.publisher.publishCommit();
  assert.equal(result.state, 'published'); clean(result);
  assert.deepEqual(observed, ['parent-installation', 'minted-grant', 'checked-grant', 'child-installation']);
  assert.deepEqual(effects(f.state), ['mint', 'commit']);
});
