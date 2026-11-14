import test from 'node:test';
import assert from 'node:assert/strict';
import { runsUiHarness } from './helpers/web-runs-ui.mjs';
import { runProjectSet } from '../lib/web/runs.mjs';
import { navigation } from '../lib/web/navigation.mjs';
import { describeRoute } from '../lib/web/navigation-routes.mjs';

const set = projects => ({ id: 'research', name: 'Acme research', projects });
async function fixture() {
  const h = await runsUiHarness();
  h.config.projectSets = [set(h.projects.map(p => p.id))];
  const login = await h.login();
  return { ...h, get: path => h.service(h.request(path, { cookie: login.cookie })) };
}

test('history set selection reads only authorized members using existing bounded sources and exposes GET selection', async () => {
  const h = await fixture();
  h.config.projectRepoIds.hidden = 999;
  h.config.projectSets = [set(['studio', 'project-4', 'hidden'])];
  h.visited.length = 0;
  const response = await h.get('/api/activity?projectSet=research&days=7');
  assert.equal(response.status, 200, await response.clone().text());
  const model = await response.json();
  assert.deepEqual(model.projects.map(p => p.project.id), ['studio', 'project-4']);
  assert.deepEqual([...new Set(h.visited)].sort(), ['project-4', 'studio']);
  assert.ok(model.items.length > 0);
  assert.ok(model.items.every(item => ['studio', 'project-4'].includes(item.projectId)));
  assert.ok(model.coverage.gaps.some(g => g.code === 'project-set-scope'));
  assert.equal(model.pagination.migrationAfter, null);
  assert.doesNotMatch(JSON.stringify(model), /hidden/);
  const html = await (await h.get('/routines?projectSet=research&days=7')).text();
  assert.match(html, /<select name="projectSet">/);
  assert.match(html, /value="research" selected/);
  assert.match(html, /name="setVersion"/);
  assert.match(html, /\/activity\?days=7&amp;projectSet=research&amp;setVersion=/);
  assert.ok(h.providers.every(p => p.source.writes.length === 0));
  assert.ok(h.providers.every(p => p.actions.requests.every(r => !r.options.method || r.options.method === 'GET')));
});

test('set batch links bind the source and reject stale, missing and revoked continuations before reads', async () => {
  const h = await fixture();
  const first = await (await h.get('/api/activity?projectSet=research')).json();
  assert.equal(first.pagination.nextProjectPage, 2);
  const query = `projectSet=research&projectPage=2&setVersion=${first.projectSet.version}`;
  const html = await (await h.get('/activity?projectSet=research')).text();
  assert.match(html, new RegExp(`setVersion=${first.projectSet.version}&amp;projectPage=2`));
  assert.ok(describeRoute(`/activity?${query}`));
  h.visited.length = 0;
  assert.equal((await h.get(`/api/activity?${query}`)).status, 200);
  assert.deepEqual([...new Set(h.visited)], ['project-4']);
  for (const invalid of ['projectSet=research&projectPage=2', 'projectSet=research&page=2', 'setVersion=' + first.projectSet.version,
    'projectSet=research&projectSet=research', 'projectSet=research&migrationAfter=abc', 'projectSet=research&project=studio']) {
    h.visited.length = 0;
    assert.ok([400, 409].includes((await h.get('/api/activity?' + invalid)).status), invalid);
    assert.deepEqual(h.visited, []);
  }
  h.config.projectSets[0].projects.pop();
  h.visited.length = 0;
  assert.equal((await h.get(`/api/activity?${query}`)).status, 409);
  assert.deepEqual(h.visited, []);
  h.config.projectSets = [];
  assert.equal((await h.get(`/api/activity?${query}`)).status, 404);
  assert.equal((await h.get('/api/projects/studio/activity?projectSet=research')).status, 400);
});

test('set continuation invalidates authorization, pins, source, and even hidden membership changes', () => {
  const config = { projectRepoIds: { studio: 102, lab: 103, hidden: 104 }, projectSets: [set(['studio', 'lab'])] };
  const access = { workspace: { id: 'acme' }, sourceRevision: 'a'.repeat(40), projects: [
    { id: 'studio', repoId: 102, repo: 'acme/studio' }, { id: 'lab', repoId: 103, repo: 'acme/lab' }] };
  const first = runProjectSet(config, access, { projectSet: 'research' });
  const query = { projectSet: 'research', page: 2, setVersion: first.projectSet.version };
  for (const changed of [{ ...access, sourceRevision: 'b'.repeat(40) }, { ...access, projects: access.projects.slice(1) },
    { ...access, projects: access.projects.map(p => p.id === 'studio' ? { ...p, repoId: 999 } : p) },
    { ...access, projects: access.projects.map(p => ({ ...p, repo: p.repo + '-renamed' })) }]) {
    assert.throws(() => runProjectSet(config, changed, query), { code: 'stale_run_cursor' });
  }
  assert.throws(() => runProjectSet(config, { ...access, projects: [] }, query), { code: 'project_set_unavailable' });
  config.projectSets[0].projects.push('hidden');
  assert.throws(() => runProjectSet(config, access, query), { code: 'stale_run_cursor' });
  assert.deepEqual(runProjectSet(config, access).projects, access.projects);
});

test('history discards results if the selected set changes or disappears during source reads', async () => {
  for (const revoke of [false, true]) {
    const h = await fixture();
    h.providers[0].actions.onRequest = () => {
      if (revoke) h.config.projectSets = [];
      else h.config.projectSets[0].name = 'Acme changed';
    };
    const response = await h.get('/api/activity?projectSet=research');
    assert.equal(response.status, revoke ? 404 : 409);
    assert.doesNotMatch(await response.text(), /Check Acme changes/);
  }
});


test('shared history header keeps the selected set and filters but resets pagination, with truthful scope', async () => {
  const h = await fixture();
  const first = await (await h.get('/api/activity?projectSet=research')).json();
  for (const destination of ['activity', 'routines']) {
    const response = await h.get(`/${destination}?projectSet=research&setVersion=${first.projectSet.version}&projectPage=2&days=7&status=failed`);
    assert.equal(response.status, 200);
    const html = await response.text(), header = html.match(/<header class="plates-navigation"[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.match(header, /<summary class="nav-project">Project set: research<\/summary>/);
    assert.match(header, /Home shows all authorized plates/);
    assert.match(header, /data-nav-destination="home" href="\/"/);
    assert.doesNotMatch(header, /data-project-lens=""[^>]*aria-current/);
    for (const target of ['activity', 'routines']) {
      const href = header.match(new RegExp(`data-nav-destination="${target}" href="([^"]+)"`))[1].replaceAll('&amp;', '&');
      const url = new URL(href, 'https://acme.test');
      assert.equal(url.pathname, '/' + target);
      assert.deepEqual(Object.fromEntries(url.searchParams), { days: '7', status: 'failed', projectSet: 'research', setVersion: first.projectSet.version });
      assert.equal((await h.get(href)).status, 200);
    }
  }
  const access = { projects: h.projects };
  const header = navigation(access, { path: '/activity?projectSet=research&page=2&projectPage=2&migrationAfter=abc&routine=night' });
  assert.doesNotMatch(header.match(/data-nav-destination="routines" href="([^"]+)"/)[1], /page=|projectPage=|migrationAfter=/);
  assert.match(header, /routines\?routine=night&amp;projectSet=research/);
  assert.match(navigation(access, { path: '/activity' }), /<summary class="nav-project">All plates<\/summary>/);
  assert.match(navigation(access, { path: '/projects/studio/activity' }), /data-nav-destination="routines" href="\/projects\/studio\/routines"/);
  assert.doesNotMatch(navigation(access, { path: '/' }), /Project set:/);
});
