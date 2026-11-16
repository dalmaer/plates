// Independent Home stores overlap, but every result and failure remains owner-scoped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebError } from '../lib/web/common.mjs';
import { createHomeReader } from '../lib/web/home.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createProjectReader } from '../lib/web/projects.mjs';
import { projectHarness } from './helpers/web-projects.mjs';

const independent = new Set(['plates_home_quota_rpc', 'plates_not_now_rpc', 'plates_last_looked_rpc', 'plates_waiting_rpc']);
test('Home overlaps its independent reads with quota, records a visit only after quota, and preserves gaps', async () => {
  const h = projectHarness(), started = []; let active = 0, peak = 0;
  const fetcher = async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), p = JSON.parse(options.body ?? '{}');
    if (independent.has(name) && ['read', 'list', 'visit'].includes(p.p_operation)) {
      started.push([name, p.p_operation]); peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 10)); active--;
      if (name === 'plates_last_looked_rpc') return Response.json({ seen: null, previous: null });
      if (name === 'plates_not_now_rpc') return Response.json({ error: 'unavailable' }, { status: 503 });
    }
    return h.fetcher(url, options);
  };
  const read = createHomeReader(h.config, { fetcher, now: () => h.state.now });
  const model = await read(h.access, 'fake-token', { cacheOnly: true, visit: true });
  assert.equal(peak, 3, 'quota, Not now and waiting overlap; the visit write waits for quota');
  assert.equal(started.length, 4); assert.deepEqual(started.at(-1), ['plates_last_looked_rpc', 'visit']);
  assert.ok(JSON.stringify(model).includes('Not now records could not be read'));
});

test('a failed quota read records no visit', async () => {
  const h = projectHarness(), seen = [];
  const fetcher = async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), p = JSON.parse(options.body ?? '{}');
    if (independent.has(name)) seen.push([name, p.p_operation]);
    if (name === 'plates_home_quota_rpc') return Response.json({ error: 'unavailable' }, { status: 503 });
    return h.fetcher(url, options);
  };
  const read = createHomeReader(h.config, { fetcher, now: () => h.state.now });
  await assert.rejects(read(h.access, 'fake-token', { cacheOnly: true, visit: true }));
  assert.ok(!seen.some(([name, op]) => name === 'plates_last_looked_rpc' && op === 'visit'), 'no visit is written');
});

test('each independent store refusal still fails the Home read', async () => {
  for (const refused of independent) {
    const h = projectHarness();
    const read = createHomeReader(h.config, { now: () => h.state.now, fetcher: async (url, options) => {
      if (new URL(url).pathname.endsWith(`/${refused}`)) throw new WebError('sign_in_required', 401);
      return h.fetcher(url, options);
    } });
    await assert.rejects(read(h.access, 'fake-token', { cacheOnly: true }), { status: 401 }, refused);
  }
});

test('Home reads remain scoped to each owner and workspace on every pass', async () => {
  const h = projectHarness(), seen = [];
  const fetcher = async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), p = JSON.parse(options.body ?? '{}');
    if (independent.has(name)) seen.push({ name, scope: p.p_scope ?? p.p_key });
    return h.fetcher(url, options);
  };
  const read = createHomeReader(h.config, { fetcher });
  for (const userId of [1, 2, 1]) await read({ ...h.access, userId }, 'fake-token', { cacheOnly: true });
  const other = createHomeReader({ ...h.config, workspace: { ...h.config.workspace, id: 'acme-other' } }, { fetcher });
  await other(h.access, 'fake-token', { cacheOnly: true });
  for (const name of independent) {
    const scopes = seen.filter(r => r.name === name).map(r => r.scope);
    assert.equal(scopes.length, 4); assert.equal(scopes[0], scopes[2]);
    assert.notEqual(scopes[0], scopes[1]); assert.notEqual(scopes[0], scopes[3]);
  }
});

test('warm Home still refuses expired, revoked and rotated-key sessions before data reads', async () => {
  for (const changed of ['expired', 'revoked', 'rotated-key']) {
    const h = projectHarness(), signed = await h.login();
    assert.equal((await h.service(h.request('/api/home', { cookie: signed.cookie }))).status, 200);
    let config = h.config;
    if (changed === 'expired') for (const [key, row] of h.state.records) { if (key.startsWith('session:')) row.expires = h.state.now - 1; }
    if (changed === 'revoked') for (const key of h.state.records.keys()) { if (key.startsWith('session:')) h.state.records.delete(key); }
    if (changed === 'rotated-key') config = { ...config, encryptionKey: Buffer.alloc(32, 8) };
    let reads = 0;
    const service = createWebService(config, { now: () => h.state.now, fetcher: async (url, options) => {
      if (independent.has(new URL(url).pathname.split('/').at(-1))) reads++;
      return h.fetcher(url, options);
    } });
    assert.equal((await service(h.request('/api/home', { cookie: signed.cookie }))).status, changed === 'rotated-key' ? 503 : 401, changed);
    assert.equal(reads, 0, changed);
  }
});

test('combined claims and PR reads retain bounds, permissions and authentication failures', async () => {
  const project = { id: 'studio', repo: 'acme/studio', repoId: 102 };
  for (const failure of ['errors', 'claims', 'prs', '401', '403', '429', 'reserve']) {
    let calls = 0, deferred = 0;
    const reader = createProjectReader({ userId: 1, token: 'fake-token', store: {
      reserve: async () => ({ allowed: failure !== 'reserve' }), observe: async () => {}, defer: async () => deferred++,
    }, fetcher: async () => {
      calls++;
      if (/^\d+$/.test(failure)) return Response.json({}, { status: Number(failure) });
      return Response.json({ ...(failure === 'errors' ? { errors: [{ message: 'refused' }] } : {}), data: { repository: {
        refs: { totalCount: failure === 'claims' ? 101 : 0, nodes: [] }, pullRequests: { totalCount: failure === 'prs' ? 101 : 0, nodes: [] },
      } } });
    } });
    if (failure === '401') await assert.rejects(reader.activity(project, { pulls: true }), { status: 401 });
    else {
      const result = await reader.activity(project, { pulls: true });
      if (failure !== 'prs') assert.equal(result.claims.state, 'unavailable', failure);
      if (failure !== 'claims') assert.equal(result.prs.state, 'unavailable', failure);
    }
    assert.equal(calls, failure === 'reserve' ? 0 : 1);
    assert.equal(deferred, ['403', '429'].includes(failure) ? 1 : 0);
  }
});

test('combined reads do not reuse a response across owners, tokens or passes', async () => {
  const calls = [], reservations = [], project = { id: 'studio', repo: 'acme/studio', repoId: 102 };
  const make = (userId, token) => createProjectReader({ userId, token, store: {
    reserve: async owner => { reservations.push(owner); return { allowed: true }; }, observe: async () => {},
  }, fetcher: async (url, options) => {
    const auth = options.headers.Authorization; calls.push(auth);
    return Response.json({ data: { repository: { refs: { totalCount: 0, nodes: [] }, pullRequests: { totalCount: 1, nodes: [
      { number: 1, title: `Acme ${auth}`, headRefName: 'acme-work', url: 'https://github.com/acme/studio/pull/1', createdAt: '2026-11-01T00:00:00Z', isDraft: false, autoMergeRequest: null },
    ] } } } });
  } });
  const first = make(1, 'fake-one'), second = make(2, 'fake-two'), rotated = make(1, 'fake-rotated');
  const results = await Promise.all([first.activity(project, { pulls: true }), second.activity(project, { pulls: true }), rotated.activity(project, { pulls: true })]);
  assert.deepEqual(results.map(r => r.prs.items[0].title), ['Acme Bearer fake-one', 'Acme Bearer fake-two', 'Acme Bearer fake-rotated']);
  await first.activity(project, { pulls: true });
  assert.deepEqual(calls, ['Bearer fake-one', 'Bearer fake-two', 'Bearer fake-rotated', 'Bearer fake-one']);
  assert.deepEqual(reservations, [1, 2, 1, 1]);
});
