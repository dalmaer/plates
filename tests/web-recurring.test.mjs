// The hosted Recurring (plates phase 185): /recurring and /api/recurring, read
// only, behind Home's auth, with the sidebar's Humans and Links. Synthetic Acme
// sources over the fake App API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHarness } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';

async function hosted() {
  const h = projectHarness();
  Object.assign(h.source.files, {
    '.github/workflows/plates-night.yml': 'name: plates-night\non:\n  schedule:\n    - cron: "23 7 * * *"\njobs: {}\n',
    '.github/workflows/plates-tend.yml': 'name: plates-tend\non:\n  schedule:\n    - cron: "18 10 * * 1"\njobs: {}\n',
  });
  h.source.files['.plates/plates.json'] = JSON.stringify({ ...JSON.parse(h.source.files['.plates/plates.json']), tend: { schedule: 'weekly', budget: { minutes: 20 } }, canvas: { home: 'https://canvas.acme.example' }, delivery: { site: 'https://studio.acme.example' } });
  const web = createWebService({ ...h.config }, { now: () => h.state.now, fetcher: h.fetcher });
  const signed = await h.login();
  return { h, web, signed, get: path => web(h.request(path, { cookie: signed.cookie })) };
}

test('/recurring lists each plate\'s routines, with Humans and Links, behind Home\'s auth', async () => {
  const s = await hosted();
  const api = await s.get('/api/recurring');
  assert.equal(api.status, 200);
  const model = await api.json();
  const plate = model.plates.find(p => p.projectId === 'studio');
  assert.deepEqual(plate.routines.map(r => r.id), ['night', 'tend']);
  const tend = plate.routines.find(r => r.id === 'tend');
  assert.deepEqual([tend.budget, tend.config, tend.disagrees], [{ minutes: 20, key: 'tend.budget.minutes' }, { key: 'tend.schedule', value: 'weekly' }, false]);
  assert.match(tend.nextRun, /T10:18:00\.000Z$/); assert.equal(new Date(tend.nextRun).getUTCDay(), 1);
  // Without the App's Actions read, the last run is not read, and says why; nothing is guessed.
  assert.equal(tend.last.none, 'last run not read: the Plates GitHub App has no Actions read on this plate');
  assert.deepEqual(model.links.find(l => l.projectId === 'studio'), { projectId: 'studio', projectName: 'Acme Studio', repo: 'https://github.com/acme/studio', canvas: 'https://canvas.acme.example', production: 'https://studio.acme.example' });
  assert.ok(Array.isArray(model.sidebar.humans));
  // The page: the same shell and sidebar as the backlog, Recurring current, times in UTC for the client to say locally.
  const html = await (await s.get('/recurring')).text();
  assert.match(html, /data-backlog-root data-view="recurring" data-endpoint="\/api\/recurring"/);
  assert.match(html, /<a href="\/recurring" aria-current="page">Recurring <span class="p-badge">2<\/span><\/a>/);
  assert.match(html, /<a href="\/backlog">Backlog<\/a>/);
  assert.match(html, /data-routine="tend"[^]*?weekly on <time datetime="[^"]+T10:18:00\.000Z" data-local="weekday-time">Mon, 10:18 UTC<\/time>/);
  assert.match(html, /<ul data-sidebar-links><li>Acme Studio: <a href="https:\/\/github.com\/acme\/studio"[^>]*>repo ↗<\/a> · <a href="https:\/\/canvas.acme.example"[^>]*>canvas ↗<\/a> · <a href="https:\/\/studio.acme.example"[^>]*>production ↗<\/a><\/li><\/ul>/);
  assert.match(html, /\/assets\/backlog-client\.[0-9a-f]{12}\.mjs/);
  // The backlog's sidebar carries the same Humans and Links, and links to Recurring.
  const backlog = await (await s.get('/backlog')).text();
  assert.match(backlog, /<a href="\/recurring">Recurring<\/a>/); assert.match(backlog, /data-sidebar-links><li>Acme Studio: /);
  assert.equal((await s.get('/recurring?x=1')).status, 400);
  assert.equal((await s.web(s.h.request('/assets/recurring-model.mjs'))).status, 200);
});

test('signed out, Recurring is refused', async () => {
  const s = await hosted();
  const page = await s.web(s.h.request('/recurring'));
  assert.notEqual(page.status, 200);
  assert.match(await page.text(), /returnTo=%2Frecurring/);
  const api = await s.web(s.h.request('/api/recurring'));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'sign_in_required' });
});
