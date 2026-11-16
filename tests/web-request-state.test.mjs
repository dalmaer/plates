import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './helpers/web-http.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createStore } from '../lib/web/store.mjs';
import { createGitHub } from '../lib/web/github.mjs';
import { hash } from '../lib/web/common.mjs';

const operations = h => h.state.requests.filter(r => r.url.includes('/rpc/')).map(r => JSON.parse(r.options.body).p_operation);

test('one service coalesces expired-token renewal without CAS losers or cached authorization', async () => {
  const h = harness(); h.state.refreshMode = 'ok';
  const signed = await h.login(); h.state.now += 28801000;
  const before = h.state.requests.length;
  const replies = await Promise.all(Array.from({ length: 5 }, () => h.service(h.request('/api/session', { cookie: signed.cookie }))));
  assert.deepEqual(replies.map(r => r.status), [200, 200, 200, 200, 200]);
  const calls = h.state.requests.slice(before);
  assert.equal(calls.filter(r => r.url.includes('/rpc/') && JSON.parse(r.options.body).p_operation === 'cas').length, 2, 'only the claim and token rotation use CAS');
  assert.equal(h.state.refreshCalls.length, 1);
  assert.equal(calls.filter(r => new URL(r.url).pathname === '/user').length, 5, 'each request checks current access');
  h.state.members = [];
  assert.equal((await h.service(h.request('/api/session', { cookie: signed.cookie }))).status, 404);
  h.state.members = [1];
  assert.equal((await h.service(h.request('/api/session', { cookie: signed.cookie }))).status, 401);
});

test('reused service isolates users, sessions and alias cookies and refuses expiry and rotated encryption keys', async () => {
  const h = harness(); h.config.ownerIds = [1, 2]; h.state.members = [1, 2];
  const scope = hash(JSON.stringify([{ id: 'studio', repoId: 102, repo: 'acme/studio' }]));
  const store = createStore(h.config, h.fetcher);
  for (const userId of [1, 2]) {
    const token = `fake-user-token-${userId}`; h.state.tokens.set(token, Infinity);
    await store.create('session', hash(String(userId).repeat(43)), { userId, token, csrf: String(userId).repeat(43), scope, absoluteExpiry: h.state.now + 60000 }, 60);
  }
  const fetcher = (url, options) => new URL(url).pathname === '/user'
    ? Promise.resolve(Response.json({ id: Number(options.headers.Authorization.slice(-1)) })) : h.fetcher(url, options);
  const service = createWebService(h.config, { fetcher, now: () => h.state.now });
  const requests = [1, 2].map(id => h.request('/api/session', { cookie: `__Host-keel-session=${String(id).repeat(43)}` }));
  const replies = await Promise.all(requests.map(request => service(request)));
  for (const [i, reply] of replies.entries()) {
    assert.equal(reply.status, 200);
    const body = await reply.json(); assert.equal(body.userId, i + 1); assert.equal(body.csrf, String(i + 1).repeat(43));
    assert.doesNotMatch(JSON.stringify(body), /fake-user-token|refreshToken|absoluteExpiry/);
    assert.ok(reply.headers.getSetCookie().some(c => c.startsWith(`__Host-plates-session=${String(i + 1).repeat(43)};`)));
  }
  assert.deepEqual((await service(h.request('/api/version'))).headers.getSetCookie(), []);
  assert.deepEqual((await service(h.request('/api/session'))).headers.getSetCookie(), []);
  const rotated = createWebService({ ...h.config, encryptionKey: Buffer.alloc(32, 8) }, { fetcher, now: () => h.state.now });
  assert.equal((await rotated(requests[0])).status, 503);
  await store.revoke(hash('1'.repeat(43)));
  assert.equal((await service(requests[0])).status, 401);
  assert.equal((await service(requests[1])).status, 200);
  h.state.now += 61000;
  assert.equal((await service(requests[1])).status, 401);
});

test('independent GitHub checks overlap and each refusal still denies before reading source', async () => {
  const paths = ['/user', '/user/installations', '/user/installations/21/repositories', '/repositories/101'];
  for (const failed of [null, ...paths]) {
    const h = harness(), started = [];
    let release; const gate = new Promise(resolve => { release = resolve; });
    const github = createGitHub(h.config, async (url, options) => {
      const path = new URL(url).pathname;
      if (paths.includes(path)) {
        started.push(path);
        await gate;
        if (path === failed) return Response.json({}, { status: 404 });
      }
      return h.fetcher(url, options);
    });
    const pending = github.access('fake-user-access-token-for-tests');
    // Drain microtasks, then unblock even a serial implementation before asserting.
    await new Promise(resolve => setImmediate(resolve));
    const concurrent = started.length;
    release();
    if (failed) {
      await assert.rejects(pending, { code: 'access_denied' });
      assert.equal(h.state.requests.some(r => r.url.includes('/contents/')), false);
    } else assert.equal((await pending).userId, 1);
    assert.equal(concurrent, 4);
  }
});

test('paired route authorization uses the renewed session without a second session read', async () => {
  const h = harness(), signed = await h.login();
  const before = operations(h).length;
  const response = await h.service(h.request('/api/push/subscription', { cookie: signed.cookie, method: 'POST', headers: { origin: h.config.origin, 'content-type': 'application/json' } }));
  assert.equal(response.status, 400, 'the empty body is rejected after authorization');
  assert.deepEqual(operations(h).slice(before), ['read', 'renew']);
});

test('hosted entry reuses JWKS only within the exact environment and still checks every token', async t => {
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'acme-key', alg: 'RS256', use: 'sig' };
  const h = harness(), signed = await h.login();
  const originalEnv = process.env;
  const env = { VERCEL_ENV: 'production', PLATES_WEB_CONFIG: JSON.stringify(h.input),
    PLATES_GITHUB_CLIENT_SECRET: h.secrets.clientSecret, SUPABASE_URL: h.secrets.storageUrl,
    SUPABASE_SERVICE_ROLE_KEY: h.secrets.storageKey, PLATES_SESSION_ENCRYPTION_KEY: h.secrets.encryptionKey };
  process.env = { ...env }; t.after(() => { process.env = originalEnv; });
  let jwksReads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://token.actions.githubusercontent.com/.well-known/jwks') {
      jwksReads++; return Response.json({ keys: [jwk] });
    }
    return h.fetcher(url, options);
  });
  const { default: api } = await import('../api/index.mjs?request-state');
  const jwt = (origin = h.config.origin, expired = false) => {
    const at = Math.floor(Date.now() / 1000);
    const payload = { iss: 'https://token.actions.githubusercontent.com', aud: origin,
      sub: 'repo:Acme/widget:ref:refs/heads/main', iat: at - 1, nbf: at - 1, exp: expired ? at - 1 : at + 300,
      repository: 'Acme/widget', repository_id: '123', repository_owner_id: '456', actor_id: '789',
      workflow_ref: 'Acme/widget/.github/workflows/typecheck.yml@refs/heads/main',
      workflow_sha: 'a'.repeat(40), sha: 'a'.repeat(40), ref: 'refs/heads/main',
      event_name: 'workflow_dispatch', run_id: '900', run_attempt: '1', check_run_id: '901' };
    const data = [{ alg: 'RS256', kid: jwk.kid }, payload].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  };
  const worker = (origin = h.config.origin, bearer = jwt(origin)) => api.fetch(new Request(origin + '/api/workers/heartbeat', {
    method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: 'invalid json',
  }));
  for (let i = 0; i < 3; i++) assert.deepEqual(await (await worker()).json(), { error: 'invalid_json' });
  assert.equal(jwksReads, 1, 'warm hosted requests retain parsed signing keys');
  assert.equal((await worker(h.config.origin, jwt(h.config.origin, true))).status, 401);
  assert.equal((await worker(h.config.origin, jwt('https://other.acme.test'))).status, 401);
  // Every raw binding that configFromEnv consumes participates in invalidation.
  for (const [name, value] of Object.entries({
    PLATES_WEB_CONFIG: JSON.stringify({ ...h.input, workspace: { ...h.input.workspace, id: 'other' } }),
    PLATES_GITHUB_CLIENT_SECRET: 'fake-rotated-client-secret', SUPABASE_URL: 'https://other.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-rotated-storage-key', PLATES_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
    PLATES_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40),
    PLATES_DEPLOY_REVISION: 'c'.repeat(40),
  })) {
    process.env = { ...env, [name]: value };
    const before = jwksReads;
    assert.equal((await worker()).status, 400, name);
    assert.equal(jwksReads, before + 1, name);
  }
  process.env = { ...env };
  assert.equal((await api.fetch(h.request('/api/session', { cookie: signed.cookie }))).status, 200);
  process.env.PLATES_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
  assert.equal((await api.fetch(h.request('/api/session', { cookie: signed.cookie }))).status, 503);
  process.env = { ...env, PLATES_WEB_CONFIG: JSON.stringify({ ...h.input, origin: 'https://other.acme.test' }) };
  assert.equal((await worker()).status, 403);
  assert.equal((await worker('https://other.acme.test', jwt())).status, 401);
  for (const invalid of [{ VERCEL_ENV: 'preview' }, { PLATES_WEB_CONFIG: '{}' }, { KEEL_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }]) {
    process.env = { ...env, ...invalid };
    assert.equal((await api.fetch(h.request('/api/version'))).status, 503);
  }
  process.env = { ...env };
  assert.equal((await api.fetch(h.request('/api/version'))).status, 200);
});

test('authorization pins source reads to a bounded exact commit ref, never a commit diff', async () => {
  for (const invalid of [null, [], { ref: 'refs/heads/other', object: { type: 'commit', sha: 'a'.repeat(40) } },
    { ref: 'refs/heads/main', object: { type: 'tag', sha: 'a'.repeat(40) } }, { ref: 'refs/heads/main', object: { type: 'commit', sha: 'invalid' } }]) {
    const h = harness(); let refs = 0;
    const github = createGitHub(h.config, (url, options) => {
      assert.equal(url.includes('/commits/'), false, 'full diff must not be downloaded');
      if (url.includes('/git/ref/heads/')) {
        refs++;
        if (invalid) return Promise.resolve(Response.json(invalid));
      }
      return h.fetcher(url, options);
    });
    if (invalid) await assert.rejects(github.access('fake-user-access-token-for-tests'), { code: 'access_denied' });
    else assert.equal((await github.access('fake-user-access-token-for-tests')).sourceRevision, 'a'.repeat(40));
    assert.equal(refs, 1);
  }
});

test('revocation and expiry during a shared renewal refuse every waiting request', async () => {
  for (const change of ['revoke', 'expire']) {
    const h = harness(); h.state.refreshMode = 'ok';
    const signed = await h.login(); h.state.now += 28801000;
    let release, started;
    const blocked = new Promise(resolve => { release = resolve; });
    const refreshing = new Promise(resolve => { started = resolve; });
    const service = createWebService(h.config, { now: () => h.state.now, fetcher: async (url, options) => {
      if (url.includes('/access_token')) { started(); await blocked; }
      return h.fetcher(url, options);
    } });
    const pending = Promise.all([1, 2].map(() => service(h.request('/api/session', { cookie: signed.cookie }))));
    await refreshing;
    await new Promise(resolve => setImmediate(resolve));
    if (change === 'revoke') await createStore(h.config, h.fetcher).revoke(hash(signed.cookie.split('=')[1]));
    else h.state.now += 366 * 86400000;
    release();
    const replies = await pending;
    assert.deepEqual(replies.map(r => r.status), [401, 401], change);
    assert.ok(replies.every(r => r.headers.getSetCookie().length === 0));
  }
});

test('overlapping checks preserve serial failure precedence regardless of completion order', async () => {
  for (const status of [401, 404, 500]) {
    const h = harness();
    const github = createGitHub(h.config, async (url, options) => {
      const path = new URL(url).pathname;
      if (path === '/user') {
        await new Promise(resolve => setImmediate(resolve));
        return Response.json({}, { status });
      }
      if (path === '/repositories/101') return Response.json({}, { status: status === 401 ? 404 : 401 });
      return h.fetcher(url, options);
    });
    await assert.rejects(github.access('fake-user-access-token-for-tests'), {
      code: status === 401 ? 'sign_in_required' : status === 404 ? 'access_denied' : 'upstream_unavailable',
    });
    assert.equal(h.state.requests.some(r => r.url.includes('/contents/')), false);
  }
});

test('renewal singleflight is scoped to the session and actor even if refresh credentials coincide', async () => {
  const h = harness(); h.config.ownerIds = [1, 2]; h.state.members = [1, 2];
  const store = createStore(h.config, h.fetcher), scope = hash(JSON.stringify([{ id: 'studio', repoId: 102, repo: 'acme/studio' }]));
  for (const id of [1, 2]) {
    h.state.tokens.set(`fake-new-token-${id}`, Infinity);
    await store.create('session', hash(String(id).repeat(43)), { userId: id, csrf: String(id).repeat(43), scope,
      token: `fake-old-token-${id}`, tokenExpiry: h.state.now - 1, absoluteExpiry: h.state.now + 60000,
      refreshToken: 'fake-coincident-refresh-token', refreshExpiry: h.state.now + 60000 }, 60);
  }
  let refreshes = 0, release, started;
  const gate = new Promise(resolve => { release = resolve; }), first = new Promise(resolve => { started = resolve; });
  const service = createWebService(h.config, { now: () => h.state.now, fetcher: async (url, options) => {
    if (url.includes('/access_token')) {
      const id = ++refreshes; started(); await gate;
      return Response.json({ access_token: `fake-new-token-${id}`, token_type: 'bearer', expires_in: 28800,
        refresh_token: `fake-new-refresh-${id}`, refresh_token_expires_in: 86400 });
    }
    if (new URL(url).pathname === '/user') return Response.json({ id: Number(options.headers.Authorization.slice(-1)) });
    return h.fetcher(url, options);
  } });
  const send = id => service(h.request('/api/session', { cookie: `__Host-keel-session=${String(id).repeat(43)}` }));
  const a = send(1); await first; const b = send(2);
  await new Promise(resolve => setImmediate(resolve)); release();
  const replies = await Promise.all([a, b]);
  assert.equal(refreshes, 2);
  for (const [i, reply] of replies.entries()) {
    assert.equal(reply.status, 200);
    const body = await reply.json(); assert.equal(body.userId, i + 1); assert.equal(body.csrf, String(i + 1).repeat(43));
    assert.ok(reply.headers.getSetCookie().some(c => c.startsWith(`__Host-plates-session=${String(i + 1).repeat(43)};`)));
  }
});
