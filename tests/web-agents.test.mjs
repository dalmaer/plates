// The hosted Agents and Pending review (plates phase 186): /agents and
// /api/agents, read only, behind Home's auth; pending review through the App's
// Pull requests read, with the installation token. Synthetic Acme sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { claimMessage } from '../lib/claim.mjs';

/** The real service; the App lists one claim (codex on phase 1) and two open PRs, one set to auto-merge. pulls: the installation's Pull requests permission. */
async function hosted({ pulls = 'read' } = {}) {
  const h = projectHarness(), graphql = [];
  h.source.files['.plates/plates.json'] = JSON.stringify({ ...JSON.parse(h.source.files['.plates/plates.json']), agents: { claude: {}, codex: {} } });
  const fetcher = async (url, options) => {
    const u = new URL(url);
    if (u.pathname === '/user/installations') { const value = await (await h.fetcher(url, options)).json(); for (const i of value.installations) i.permissions.pull_requests = pulls; return Response.json(value); }
    const query = u.pathname === '/graphql' ? JSON.parse(options.body).query : '';
    if (query.includes('PlatesClaims')) {
      graphql.push('claims');
      const at = new Date(h.state.now - 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return Response.json({ data: { repository: { refs: { totalCount: 1, nodes: [{ name: 'phase-1', target: { oid: 'c'.repeat(40), message: claimMessage({ phase: 1, provider: 'codex', machine: 'acme-mac', at, token: 't' }), committedDate: at } }] }, pullRequests: { totalCount: 0, nodes: [] } } } });
    }
    if (query.includes('PlatesPending')) {
      graphql.push('pending');
      return Response.json({ data: { repository: { pullRequests: { totalCount: 2, nodes: [
        { number: 5, title: 'Acme anvils', url: 'https://github.com/acme/studio/pull/5', createdAt: '2026-10-01T00:00:00Z', isDraft: false, reviewDecision: 'APPROVED', autoMergeRequest: null, author: { login: 'acme' } },
        { number: 6, title: 'Acme bump', url: 'https://github.com/acme/studio/pull/6', createdAt: '2026-09-01T00:00:00Z', isDraft: false, reviewDecision: null, autoMergeRequest: { enabledAt: '2026-09-01T01:00:00Z' }, author: { login: 'renovate' } }] } } } });
    }
    return h.fetcher(url, options);
  };
  const web = createWebService({ ...h.config }, { now: () => h.state.now, fetcher });
  const signed = await h.login();
  return { h, web, graphql, get: path => web(h.request(path, { cookie: signed.cookie })) };
}

test('/agents lists who works on what, and what waits for review, behind Home\'s auth', async () => {
  const s = await hosted();
  const api = await s.get('/api/agents');
  assert.equal(api.status, 200);
  const model = await api.json();
  assert.deepEqual(model.agents.providers.map(p => [p.id, p.state, p.holds.map(h => h.phase)]), [['claude', 'idle', []], ['codex', 'working', [1]]]);
  assert.deepEqual(model.pending.items.map(i => i.number), [5], 'the auto-merge PR is not listed');
  assert.deepEqual(model.sidebar.counts, { agents: 1, pending: 1 });
  const html = await (await s.get('/agents')).text();
  assert.match(html, /data-backlog-root data-view="agents" data-endpoint="\/api\/agents"/);
  assert.match(html, /<a href="\/agents" aria-current="page">Agents <span class="p-badge">1<\/span><\/a><a href="\/agents#pending">Pending review <span class="p-badge">1<\/span><\/a>/);
  assert.match(html, /data-route="worker" data-off><p><strong>Worker<\/strong> · off: durable workers are disabled until activated \(phase 104\) \(<code>worker<\/code>: studio\)/);
  assert.match(html, /data-pending="studio:review:5"[^]*?<span class="p-badge">approved<\/span>/);
  // The other pages' sidebars carry the same counts.
  for (const path of ['/backlog', '/recurring']) assert.match(await (await s.get(path)).text(), /<a href="\/agents">Agents <span class="p-badge">1<\/span><\/a><a href="\/agents#pending">Pending review <span class="p-badge">1<\/span><\/a>/, path);
  assert.equal((await s.get('/agents?x=1')).status, 400);
});

test('without the Pull requests read, pending review is not read, and says why', async () => {
  const s = await hosted({ pulls: null });
  const model = await (await s.get('/api/agents')).json();
  assert.deepEqual(model.pending.items, []);
  assert.deepEqual(model.pending.plates.map(p => [p.state, p.reason]), [['not read', 'the Plates GitHub App has no Pull requests read on this plate']]);
  assert.ok(!s.graphql.includes('pending'), 'nothing is asked without the permission');
  assert.equal(model.sidebar.counts.pending, null);
  assert.match(await (await s.get('/agents')).text(), /Pending review <span class="meta">0 \(at least\)<\/span>[^]*?Acme Studio: not read — the Plates GitHub App has no Pull requests read on this plate/);
});

test('signed out, Agents is refused', async () => {
  const s = await hosted();
  const page = await s.web(s.h.request('/agents'));
  assert.notEqual(page.status, 200); assert.match(await page.text(), /returnTo=%2Fagents/);
  const api = await s.web(s.h.request('/api/agents'));
  assert.equal(api.status, 401); assert.deepEqual(await api.json(), { error: 'sign_in_required' });
  assert.equal(s.graphql.length, 0);
});
