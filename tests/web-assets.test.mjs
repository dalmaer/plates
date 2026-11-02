// Phase 165: workspace pages load from cache after the first visit. Every
// public asset is referenced by a digest URL that is immutable; logical paths,
// HTML, API and private routes stay private, no-store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { harness } from './helpers/web-http.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const PRIVATE = 'private, no-store';
const DIGEST = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.([0-9a-f]{12})\.[a-z0-9]+$/;
// Every page the synthetic workspace renders without extra fixtures, signed in
// or not, including error pages.
const PAGES = ['/signin', '/offline', '/recovery', '/', '/projects/studio', '/daily', '/setup', '/capabilities', '/activity', '/routines',
  '/jobs', '/versions', '/learning', '/connections', '/model-policy', '/projects/studio/daily', '/projects/studio/changes',
  '/projects/studio/walks', '/projects/studio/media', '/projects/studio/model-tasks', '/projects/studio/routines',
  '/projects/studio/jobs', '/projects/studio/learning', '/projects/studio/versions', '/projects/studio/connections',
  '/projects/studio/model-policy', '/projects/studio/capabilities', '/projects/studio/activity', '/projects/studio/decisions', '/nope'];
// Every import specifier in a module: static, side-effect and dynamic.
const imports = source => [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\s]+)\1/g)].map(match => match[2]);
const references = html => [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+/g) || [])];
const digestOf = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

test('every page references immutable digest assets', async () => {
  const h = harness(), signed = await h.login();
  const queue = [], seen = new Map();
  const visit = (from, path) => {
    assert.match(path, DIGEST, `${from} references ${path} by digest URL`);
    if (!seen.has(path)) { seen.set(path, from); queue.push(path); }
  };
  let pages = 0;
  for (const path of PAGES) for (const cookie of [signed.cookie, undefined]) {
    const response = await h.service(h.request(path, { cookie }));
    if (!response.headers.get('content-type')?.startsWith('text/html')) continue;
    pages++;
    for (const reference of references(await response.text())) visit(path, reference);
  }
  assert.ok(pages >= 40, `crawled ${pages} rendered pages`);
  const manifest = await (await h.service(h.request('/manifest.webmanifest'))).json();
  for (const icon of manifest.icons) visit('/manifest.webmanifest', icon.src);
  const worker = await (await h.service(h.request('/sw.js'))).text();
  for (const path of JSON.parse(/"shell":(\[[^\]]*\])/.exec(worker)[1])) if (path.startsWith('/assets/')) visit('/sw.js', path);
  // Every module the pages load, and every module those import, statically or dynamically.
  while (queue.length) {
    const path = queue.shift(), response = await h.service(h.request(path, { cookie: signed.cookie }));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), IMMUTABLE, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'/, path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digestOf(bytes), DIGEST.exec(path)[1], `${path} carries the digest of its exact bytes`);
    // The same bytes as the logical path's current answer, under the same type.
    const logical = path.replace(/\.[0-9a-f]{12}(\.[a-z0-9]+)$/, '$1'), plain = await h.service(h.request(logical));
    assert.equal(plain.headers.get('content-type'), response.headers.get('content-type'), logical);
    if (path.endsWith('.mjs')) {
      for (const specifier of imports(bytes.toString('utf8'))) visit(path, specifier);
    } else if (path.endsWith('.css')) assert.doesNotMatch(bytes.toString('utf8'), /url\(\s*['"]?\/assets\/(?![^)]*\.[0-9a-f]{12}\.)/, path);
  }
  // The crawl reached the shell and the dynamic imports: one URL per module.
  const logicalSeen = [...seen.keys()].map(path => path.replace(/\.[0-9a-f]{12}(\.[a-z0-9]+)$/, '$1'));
  for (const path of ['/assets/plates.css', '/assets/pwa-client.mjs', '/assets/safety-client.mjs', '/assets/home-views.mjs', '/assets/navigation-routes.mjs', '/assets/apple-touch-icon.png'])
    assert.ok(logicalSeen.includes(path), `${path} was reached`);
  assert.equal(new Set(logicalSeen).size, logicalSeen.length, 'no asset is reachable under two URLs');

  // Modules no crawled page reaches still import only digest URLs.
  const { assetTable } = await import('../lib/web/assets.mjs');
  for (const entry of assetTable().entries.values()) {
    if (!entry.path.endsWith('.mjs')) continue;
    for (const specifier of imports(String(entry.body))) {
      assert.match(specifier, DIGEST, `${entry.path} imports ${specifier} by digest URL`);
      assert.equal(assetTable().lookup(specifier)?.immutable, true, `${entry.path} imports a current asset`);
    }
  }
});

test('a digest names exactly one asset', async () => {
  const h = harness();
  const signin = await (await h.service(h.request('/signin'))).text();
  const url = references(signin).find(path => path.startsWith('/assets/plates.'));
  assert.match(url ?? '', DIGEST, 'sign-in references the stylesheet by digest URL');
  const current = await h.service(h.request(url));
  assert.equal(current.status, 200); assert.equal(current.headers.get('cache-control'), IMMUTABLE);
  const bytes = await current.text();
  // The logical path still answers the same bytes, private and uncached.
  const logical = await h.service(h.request('/assets/plates.css'));
  assert.equal(logical.status, 200); assert.equal(logical.headers.get('cache-control'), PRIVATE);
  assert.equal(await logical.text(), bytes);
  // A digest that is not current is 404 — never other bytes, never cacheable.
  const digest = DIGEST.exec(url)[1], other = digest.replace(/^./, c => c === '0' ? '1' : '0');
  for (const stale of [url.replace(digest, other), url.replace('/assets/plates.', '/assets/daily.')]) {
    const response = await h.service(h.request(stale));
    assert.equal(response.status, 404, stale);
    assert.equal(response.headers.get('cache-control'), PRIVATE, stale);
    assert.notEqual(await response.text(), bytes, stale);
  }
  assert.equal((await h.service(h.request(`${url}?v=1`))).status, 400, 'a digest URL has exactly one form');
  // A name that is no asset is not an asset route at all.
  const unknown = await h.service(h.request('/assets/nothing.0123456789ab.css'));
  assert.notEqual(unknown.status, 200); assert.equal(unknown.headers.get('cache-control'), PRIVATE);

  // A changed asset gets a new URL, and so does everything that imports it.
  const { buildAssetTable } = await import('../lib/web/assets.mjs');
  const JS = 'text/javascript; charset=utf-8';
  const sources = leaf => [
    { path: '/assets/leaf.mjs', type: JS, body: () => `export const leaf = ${JSON.stringify(leaf)};` },
    { path: '/assets/user.mjs', type: JS, body: () => "import { leaf } from './leaf.mjs';\nexport const later = () => import('/assets/leaf.mjs');" },
    { path: '/assets/alone.css', type: 'text/css; charset=utf-8', body: () => 'body{}' },
  ];
  const before = buildAssetTable(sources('Acme')), after = buildAssetTable(sources('Acme changed'));
  assert.notEqual(after.url('/assets/leaf.mjs'), before.url('/assets/leaf.mjs'));
  assert.notEqual(after.url('/assets/user.mjs'), before.url('/assets/user.mjs'), 'an importer covers its imports');
  assert.equal(after.url('/assets/alone.css'), before.url('/assets/alone.css'), 'an unchanged asset keeps its URL');
  assert.equal(after.entries.get('/assets/user.mjs').body,
    `import { leaf } from '${after.url('/assets/leaf.mjs')}';\nexport const later = () => import('${after.url('/assets/leaf.mjs')}');`);
  assert.equal(after.lookup(before.url('/assets/leaf.mjs')), 'stale');
  assert.equal(after.lookup(after.url('/assets/leaf.mjs')).immutable, true);
  assert.equal(after.lookup('/assets/leaf.mjs').immutable, false);
  // A cycle, or an import of something that is not served, is refused loudly.
  assert.throws(() => buildAssetTable([
    { path: '/assets/a.mjs', type: JS, body: () => "import './b.mjs';" },
    { path: '/assets/b.mjs', type: JS, body: () => "export const a = () => import('/assets/a.mjs');" },
  ]), /import cycle \/assets\/a\.mjs -> \/assets\/b\.mjs -> \/assets\/a\.mjs/);
  assert.throws(() => buildAssetTable([{ path: '/assets/a.mjs', type: JS, body: () => "import '../server.mjs';" }]), /outside \/assets\//);
  assert.throws(() => buildAssetTable([{ path: '/assets/a.mjs', type: JS, body: () => "import './missing.mjs';" }]), /not a served asset/);
});

test('nothing private becomes cacheable', async () => {
  const h = harness(), signed = await h.login();
  const home = await h.service(h.request('/', { cookie: signed.cookie })), html = await home.text();
  const digests = references(html).filter(path => DIGEST.test(path));
  assert.ok(digests.length >= 4, 'the signed-in page loads digest assets');
  // Only digest assets are public: identical for every viewer, no cookie, nothing private.
  for (const path of digests) {
    const withSession = await h.service(h.request(path, { cookie: signed.cookie })), anonymous = await h.service(h.request(path));
    assert.equal(withSession.headers.get('cache-control'), IMMUTABLE, path);
    assert.deepEqual(withSession.headers.getSetCookie(), [], path);
    const text = await withSession.text();
    assert.equal(text, await anonymous.text(), `${path} does not depend on the session`);
    assert.ok(!text.includes(signed.session.csrf), path);
    assert.doesNotMatch(text, /fake-user|fake-service|fake-client-secret|acme\/studio/, path);
  }
  const responses = [];
  const check = async (path, options = {}) => { const response = await h.service(h.request(path, options)); responses.push([path, response]); return response; };
  for (const path of PAGES) await check(path, { cookie: signed.cookie });
  for (const path of ['/signin', '/', '/projects/studio', '/offline']) await check(path);
  for (const path of ['/api/session', '/api/home', '/api/projects/studio', '/api/projects/studio/home', '/api/nope', '/api/projects/studio/capabilities'])
    await check(path, { cookie: signed.cookie });
  await check('/api/auth/logout', { cookie: signed.cookie, body: { csrf: 'wrong' } });
  for (const path of ['/sw.js', '/manifest.webmanifest', '/assets/plates.css', '/assets/home-client.mjs', '/assets/pwa-client.mjs',
    '/assets/plates-icon-192.png', '/assets/plates.000000000000.css', '/projects/studio.0123456789ab.css', '/api/home.0123456789ab.mjs'])
    await check(path, { cookie: signed.cookie });
  for (const [path, response] of responses) {
    assert.equal(response.headers.get('cache-control'), PRIVATE, `${path} (${response.status}) stays private`);
    assert.notEqual(response.headers.get('cache-control'), IMMUTABLE, path);
  }
  assert.ok(responses.some(([path, response]) => path === '/api/home' && response.headers.get('etag')), 'the private ETag stays private');
});
