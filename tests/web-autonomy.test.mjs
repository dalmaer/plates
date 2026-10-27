import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHarness } from './helpers/web-projects.mjs';
import { createHomeReader } from '../lib/web/home.mjs';
import { createHomeStore } from '../lib/web/home-store.mjs';
import { validAutonomySnapshot } from '../lib/web/projects.mjs';
import { autonomyPanel, renderHomeSnapshot } from '../lib/web/views.mjs';
const token = 'fake-user-access-token-for-tests';
const read = h => createHomeReader(h.config, { fetcher: h.fetcher, now: () => h.state.now })(h.access, token);
const policy = { schema: 1, repository: 'acme/studio', mode: 'delivery', push: [], merge: [], pushPrefixes: ['work/'] };

test('project Home projects the pinned autonomy declaration without claiming permission or performing writes', async () => {
  const h = projectHarness();
  h.source.files['.plates/autonomy.json'] = JSON.stringify(policy);
  const snapshot = await read(h), project = snapshot.projects[0];
  assert.equal(project.autonomy.status, 'declared');
  assert.equal(project.autonomy.policy.mode, 'delivery');
  assert.equal(project.autonomy.sourceRevision, h.source.revision);
  assert.equal(project.autonomy.selectionVerification, 'unverified');
  assert.equal(project.autonomy.hostControl, 'unavailable');
  assert.match(project.autonomy.sourceUrl, new RegExp(`/blob/${h.source.revision}/.plates/autonomy.json$`));
  const html = renderHomeSnapshot(snapshot, { projectId: project.id });
  assert.match(html, /Autonomy and approvals/);
  assert.match(html, /Source risk tolerance: High/);
  assert.match(html, /namespaces work\//);
  assert.match(html, /Host approval controls unavailable/);
  assert.match(html, /disabled aria-disabled="true"/);
  assert.match(html, /selection provenance unverified/);
  assert.equal(h.source.requests.every(request => !request.options.method || request.options.method === 'GET'), true);
});

test('absent and invalid source settings remain distinct in the UI', async () => {
  const missing = projectHarness(), absent = (await read(missing)).projects[0];
  assert.equal(absent.autonomy.status, 'default');
  assert.equal(absent.autonomy.configured, false);
  for (const content of ['{bad', JSON.stringify({ ...policy, repository: 'acme/other' }), JSON.stringify({ ...policy, pushPrefixes: ['*'] })]) {
    const h = projectHarness(); h.source.files['.plates/autonomy.json'] = content;
    const project = (await read(h)).projects[0];
    assert.equal(project.autonomy.status, 'unavailable');
    assert.ok(project.gaps.some(g => g.source === 'autonomy'));
    for (const key of ['decisions', 'walks', 'waiting']) assert.deepEqual(project[key], absent[key], `${key} unaffected by invalid optional autonomy`);
    assert.equal(project.planning.next, absent.planning.next);
    assert.match(autonomyPanel(project), /Source setting unavailable/);
  }
  const html = autonomyPanel({ autonomy: { status: 'declared', policy: { mode: '<script>bad</script>' }, scopes: [], sourceUrl: 'javascript:alert(1)' } });
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});


test('cached autonomy cannot gain host authority or substitute stale/malformed scope', async () => {
  const h = projectHarness(); h.source.files['.plates/autonomy.json'] = JSON.stringify(policy);
  const project = (await read(h)).projects[0], original = project.autonomy;
  assert.equal(validAutonomySnapshot(original, project, project.revision), true);
  for (const change of [{hostControl:'allowed'}, {selectionVerification:'verified'}, {sourceRevision:'f'.repeat(40)}, {scopes:[]}, {policy:{...policy,pushPrefixes:['other/']}}]) {
    assert.equal(validAutonomySnapshot({...original,...change}, project, project.revision), false);
  }
  assert.equal(validAutonomySnapshot(undefined, project, project.revision), false);
});


test('malformed cached autonomy is not rendered and is reread at the same source revision', async () => {
  const h = projectHarness(); h.source.files['.plates/autonomy.json'] = JSON.stringify(policy);
  const reader = createHomeReader(h.config, { fetcher: h.fetcher, now: () => h.state.now });
  const first = await reader(h.access, token), store = createHomeStore(h.config, h.fetcher);
  const key = [...h.state.homeDatabase.cache.keys()][0];
  h.state.now += 61000;
  const lease = 'a'.repeat(64); await store.claim(key, lease);
  await store.finish(key, lease, { ...first.projects[0], autonomy: { ...first.projects[0].autonomy, scopes: [{ scope: 'push', authority: 'selected', branches: 'main' }] } });
  const cached = await reader(h.access, token, { cacheOnly: true });
  assert.equal(cached.projects[0].state, 'loading');
  assert.doesNotThrow(() => renderHomeSnapshot(cached, { projectId: cached.projects[0].id }));
  h.state.now += 61000;
  const calls = h.source.requests.length, refreshed = await reader(h.access, token);
  assert.ok(h.source.requests.length > calls + 2, 'does not reuse malformed same-revision scope');
  assert.deepEqual(refreshed.projects[0].autonomy.policy, policy);
  assert.equal(refreshed.projects[0].autonomy.selectionVerification, 'unverified');
});
