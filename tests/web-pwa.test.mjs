import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { inflateSync, crc32 } from 'node:zlib';
import { createECDH, createDecipheriv, hkdfSync, verify } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { harness } from './helpers/web-http.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createPwa, shellWorker, SHELL } from '../lib/web/pwa.mjs';
import { shellRefresh, startPwa } from '../lib/web/pwa-client.mjs';
import { encryptPayload, vapidAuthorization, vapidKeys, publicKeyObject, validSubscription } from '../lib/web/push.mjs';
import { createPushStore } from '../lib/web/push-store.mjs';
import { notificationsFor, createPushNotifier } from '../lib/web/push-notify.mjs';

// ---- fakes: a browser cache, a worker global, a push database and a push service

function fakeCaches() {
  const stores = new Map(), writes = [];
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name), scope = fetcherFor.current;
    return {
      async addAll(requests) {
        for (const request of requests) {
          const response = await scope(request);
          if (!response.ok) throw new Error(`precache failed ${request.url}`);
          entries.set(new URL(request.url).pathname, response); writes.push(new URL(request.url).pathname);
        }
      },
      async put(request, response) { writes.push(typeof request === 'string' ? request : request.url); entries.set(String(request), response); },
      async add(request) { writes.push(String(request)); },
      async match(key) { const hit = entries.get(typeof key === 'string' ? key : new URL(key.url).pathname); return hit ? hit.clone() : undefined; },
    };
  };
  const fetcherFor = { current: null };
  return { stores, writes, fetcherFor, api: { open, keys: async () => [...stores.keys()], delete: async name => stores.delete(name) } };
}

function workerScope({ origin, caches, fetch }) {
  const listeners = {}, posted = [], opened = [], shown = [];
  const scope = { location: { origin }, caches: caches.api, fetch, skipWaiting: async () => {},
    addEventListener: (name, handler) => { listeners[name] = handler; },
    clients: { claim: async () => {}, matchAll: async () => [{ url: `${origin}/daily`, postMessage: message => posted.push(JSON.parse(JSON.stringify(message))), focus: async () => {} }], openWindow: async url => { opened.push(url); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } } };
  caches.fetcherFor.current = fetch;
  const dispatch = async (name, extra = {}) => {
    let waited = null, responded = null;
    listeners[name]({ ...extra, waitUntil: promise => { waited = promise; }, respondWith: promise => { responded = promise; } });
    await waited;
    return responded;
  };
  return { scope, listeners, posted, opened, shown, dispatch };
}

// Run the exact /sw.js bytes the server sends, in a fresh context.
const runWorker = (source, scope) => vm.runInNewContext(source, { self: scope, Request, Response, URL });

async function pushDatabase(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/015-push.sql', import.meta.url), 'utf8'));
  const handle = async (url, options) => {
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/plates_push_rpc');
    const p = JSON.parse(options.body), entries = Object.entries(p);
    const result = await db.query(`SELECT public.plates_push_rpc(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) value`, entries.map(([, value]) => value));
    return Response.json(result.rows[0].value);
  };
  return { db, handle };
}

function device(endpoint) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 7 + endpoint.length));
  return { ecdh, auth, subscription: { endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}

// The receiving side of RFC 8291, written independently of the sender.
function decrypt(body, { ecdh, auth }) {
  const salt = body.subarray(0, 16), recordSize = body.readUInt32BE(16), idLength = body[20];
  const sender = body.subarray(21, 21 + idLength), sealed = body.subarray(21 + idLength);
  assert.equal(recordSize, 4096); assert.equal(idLength, 65);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(sender), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), sender]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length - 1; while (padded[end] === 0) end--;
  assert.equal(padded[end], 2, 'last-record delimiter');
  return padded.subarray(0, end).toString('utf8');
}

function readVapid(header, keys) {
  const match = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(header);
  assert.ok(match, header);
  const [, head, claims, signature, k] = match;
  assert.equal(k, keys.publicKey);
  assert.ok(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKeyObject(k), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), 'ES256 signature verifies');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  return JSON.parse(Buffer.from(claims, 'base64url'));
}

function parsePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let at = 8; const chunks = {};
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at), type = bytes.subarray(at + 4, at + 8).toString('latin1');
    const data = bytes.subarray(at + 8, at + 8 + length);
    assert.equal(bytes.readUInt32BE(at + 8 + length), crc32(bytes.subarray(at + 4, at + 8 + length)), `${type} crc`);
    chunks[type] = Buffer.concat([chunks[type] ?? Buffer.alloc(0), data]); at += 12 + length;
  }
  const width = chunks.IHDR.readUInt32BE(0), height = chunks.IHDR.readUInt32BE(4);
  assert.equal(inflateSync(chunks.IDAT).length, height * (1 + width * 4));
  assert.ok(chunks.IEND);
  return { width, height };
}

const PRIVATE = /Acme secret|merger|launch checklist|fake-user|fake-service|csrf|token/i;

test('the app installs and caches only its shell', async () => {
  const h = harness(), signed = await h.login(), origin = h.config.origin;
  // Manifest and icons: public, no session, nothing private.
  const manifestResponse = await h.service(h.request('/manifest.webmanifest'));
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get('content-type'), /^application\/manifest\+json/);
  assert.deepEqual(manifestResponse.headers.getSetCookie(), []);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, 'Plates'); assert.equal(manifest.short_name, 'Plates');
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#245c48'); assert.equal(manifest.background_color, '#f5f5ef');
  assert.ok(manifest.icons.some(icon => icon.type === 'image/svg+xml' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const response = await h.service(h.request(icon.src));
    assert.equal(response.status, 200, icon.src); assert.equal(response.headers.get('content-type'), icon.type);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (icon.type === 'image/png') assert.deepEqual(parsePng(bytes), { width: Number(icon.sizes.split('x')[0]), height: Number(icon.sizes.split('x')[0]) });
    else assert.match(bytes.toString(), /^<svg [^>]*viewBox="0 0 512 512"/);
  }
  assert.deepEqual(parsePng(Buffer.from(await (await h.service(h.request('/assets/apple-touch-icon.png'))).arrayBuffer())), { width: 180, height: 180 });

  // The worker and offline page are public; CSP allows exactly the worker and manifest from self.
  const sw = await h.service(h.request('/sw.js')), source = await sw.text();
  assert.equal(sw.status, 200); assert.match(sw.headers.get('content-type'), /^text\/javascript/);
  assert.match(sw.headers.get('content-security-policy'), /worker-src 'self'; manifest-src 'self';/);
  assert.equal(sw.headers.get('cache-control'), 'private, no-store');
  const version = /"version":"([a-f0-9]{32})"/.exec(source)[1];
  const offline = await (await h.service(h.request('/offline'))).text();
  assert.match(offline, /You are offline/); assert.match(offline, /data-offline/);
  assert.doesNotMatch(offline, /data-navigation|name="csrf"|Acme workspace|studio/);
  assert.equal((await h.service(h.request('/sw.js?v=1'))).status, 400);

  // Every HTML shell links the manifest and the shell client at the worker's version.
  for (const [path, cookie] of [['/signin', undefined], ['/', signed.cookie], ['/projects/studio', signed.cookie]]) {
    const html = await (await h.service(h.request(path, { cookie }))).text();
    assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest">/, path);
    assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/apple-touch-icon.png">/, path);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/, path);
    assert.ok(html.includes(`<meta name="plates-shell" content="${version}">`), path);
    if (cookie) assert.match(html, /<script type="module" src="\/assets\/pwa-client.mjs"><\/script><\/body>/, path);
    else assert.doesNotMatch(html, /<script/, 'a script-free page stays script-free');
    assert.equal((html.match(/rel="manifest"/g) || []).length, 1, path);
  }

  // Install the served worker: it precaches exactly the shell, fetched without credentials.
  const caches = fakeCaches(), seen = [];
  const network = { up: true };
  const fetch = async request => {
    seen.push({ url: request.url, credentials: request.credentials });
    if (!network.up) throw new TypeError('offline');
    return h.service(new Request(request.url));
  };
  const worker = workerScope({ origin, caches, fetch });
  runWorker(source, worker.scope);
  await worker.dispatch('install');
  assert.deepEqual([...caches.stores.keys()], [`plates-shell-${version}`]);
  assert.deepEqual([...caches.stores.get(`plates-shell-${version}`).keys()].sort(), [...SHELL].sort());
  assert.ok(seen.every(entry => entry.credentials === 'omit'), 'the shell is fetched without the session cookie');
  await worker.dispatch('activate');
  assert.deepEqual(worker.posted, [{ type: 'plates-shell', version }]);

  // Navigations are network first; offline they get the cached offline page.
  const navigate = path => ({ url: `${origin}${path}`, method: 'GET', mode: 'navigate' });
  network.up = false;
  const fallback = await worker.dispatch('fetch', { request: navigate('/projects/studio') });
  assert.match(await fallback.text(), /You are offline/);
  const css = await worker.dispatch('fetch', { request: { url: `${origin}/assets/plates.css`, method: 'GET', mode: 'no-cors' } });
  assert.equal(css.status, 200, 'shell assets come from the cache while offline');
  assert.equal(caches.writes.length, SHELL.length, 'nothing was written after install');

  // A changed shell is a new version: the new worker deletes the old cache and
  // tells open pages, which refresh only once they are online again.
  const next = createPwa({ css: 'body{color:#245c48}' });
  assert.notEqual(next.version, version);
  network.up = true;
  const upgraded = workerScope({ origin, caches, fetch });
  runWorker(next.worker, upgraded.scope);
  await upgraded.dispatch('install'); await upgraded.dispatch('activate');
  assert.deepEqual([...caches.stores.keys()], [`plates-shell-${next.version}`]);
  assert.deepEqual(upgraded.posted, [{ type: 'plates-shell', version: next.version }]);
  assert.equal(shellRefresh({ pageVersion: version, workerVersion: next.version, online: true }), true);
  assert.equal(shellRefresh({ pageVersion: version, workerVersion: next.version, online: false }), false);
  assert.equal(shellRefresh({ pageVersion: next.version, workerVersion: next.version, online: true }), false);

  // The page client: offline it waits; on reconnect it checks for a new worker and reloads once.
  const windowListeners = {}, workerListeners = {}, sent = [];
  let reloads = 0, updates = 0;
  const navigator = { onLine: false, serviceWorker: { addEventListener: (name, handler) => { workerListeners[name] = handler; },
    register: async (path, options) => { assert.deepEqual([path, options], ['/sw.js', { scope: '/' }]); return { update: async () => { updates++; } }; },
    controller: { postMessage: message => sent.push(message) } } };
  const document = { querySelector: selector => selector === 'meta[name="plates-shell"]' ? { getAttribute: () => version } : null, body: { hasAttribute: () => false } };
  const client = startPwa({ window: { addEventListener: (name, handler) => { windowListeners[name] = handler; }, location: { reload: () => { reloads++; } } }, document, navigator });
  await client.ready;
  workerListeners.message({ data: { type: 'plates-shell', version: next.version } });
  assert.equal(reloads, 0, 'no refresh while offline');
  navigator.onLine = true; windowListeners.online();
  await client.ready; await new Promise(resolve => setImmediate(resolve));
  assert.equal(updates, 1);
  assert.deepEqual(sent.at(-1), { type: 'plates-shell?' });
  workerListeners.message({ data: { type: 'plates-shell', version: next.version } });
  workerListeners.message({ data: { type: 'plates-shell', version: next.version } });
  assert.equal(reloads, 1);
});

test("the worker's fetch handler never caches a private route", async () => {
  const h = harness(), signed = await h.login(), origin = h.config.origin, pwa = createPwa({ css: 'body{}' });
  const caches = fakeCaches();
  const fetch = async request => h.service(new Request(request.url, { headers: request.credentials === 'omit' ? {} : { cookie: signed.cookie } }));
  const { scope, dispatch } = workerScope({ origin, caches, fetch });
  const { route } = shellWorker(scope, { version: pwa.version, shell: SHELL, offline: '/offline' });
  await dispatch('install');
  const before = caches.writes.length;
  const privateRequests = [
    { url: `${origin}/`, method: 'GET', mode: 'navigate' },
    { url: `${origin}/projects/studio`, method: 'GET', mode: 'navigate' },
    { url: `${origin}/api/home`, method: 'GET', mode: 'cors' },
    { url: `${origin}/api/session`, method: 'GET', mode: 'cors' },
    { url: `${origin}/api/projects/studio/decisions/preview`, method: 'POST', mode: 'cors' },
    { url: `${origin}/assets/plates.css?private=1`, method: 'GET', mode: 'no-cors' },
    { url: `${origin}/assets/decision-client.mjs`, method: 'GET', mode: 'cors' },
    { url: 'https://api.github.com/user', method: 'GET', mode: 'cors' },
  ];
  for (const request of privateRequests) {
    const handled = route(request);
    if (request.mode === 'navigate') {
      const response = await handled;
      assert.equal(response.status, 200, request.url);
      assert.match(await response.text(), /data-navigation/, 'the signed-in page came from the network');
    } else assert.equal(handled, null, `${request.url} is not the worker's to answer`);
  }
  assert.equal(caches.writes.length, before, 'no private response was written to the cache');
  const stored = await Promise.all([...caches.stores.get(`plates-shell-${pwa.version}`).values()].map(response => response.clone().text()));
  for (const text of stored) {
    assert.ok(!text.includes(signed.session.csrf), 'no session CSRF value');
    assert.doesNotMatch(text, /Sign out|Acme workspace|acme\/studio|fake-user|fake-service/);
  }
});

test('VAPID JWT and aes128gcm encryption round-trip', async () => {
  // RFC 8291 Appendix A, byte for byte.
  const vector = encryptPayload('When I grow up, I want to be a watermelon', { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'), serverKey: Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url') });
  assert.equal(vector.toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  // And a fresh encryption decrypts on the receiving side.
  const phone = device('https://web.push.apple.com/QAcme');
  const message = JSON.stringify({ title: 'Plates', body: 'A decision is due for a check.', url: '/projects/studio', tag: 'plates-0' });
  assert.equal(decrypt(encryptPayload(message, phone.subscription.keys), phone), message);
  assert.throws(() => encryptPayload('x'.repeat(4096), phone.subscription.keys), /push_payload_limit/);

  const keys = vapidKeys(Buffer.alloc(32, 7));
  assert.equal(vapidKeys(Buffer.alloc(32, 7)).publicKey, keys.publicKey, 'derived, not stored');
  assert.notEqual(vapidKeys(Buffer.alloc(32, 8)).publicKey, keys.publicKey);
  assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
  const now = Date.UTC(2026, 9, 30, 12);
  const claims = readVapid(vapidAuthorization({ endpoint: 'https://fcm.googleapis.com/fcm/send/acme', subject: 'https://plates.acme.test', keys, now }), keys);
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://plates.acme.test' });

  for (const endpoint of ['https://evil.test/push', 'http://fcm.googleapis.com/fcm/send/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://push.apple.com.evil.test/x'])
    assert.equal(validSubscription({ ...phone.subscription, endpoint }), null, endpoint);
  assert.equal(validSubscription({ ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: Buffer.alloc(65, 1).toString('base64url') } }), null, 'not a curve point');
});

test('subscriptions are the owner\'s, behind the session, origin and CSRF', async t => {
  const h = harness(), database = await pushDatabase(t), signed = await h.login();
  const fetcher = async (url, options) => new URL(url).pathname === '/rest/v1/rpc/plates_push_rpc' ? database.handle(url, options) : h.fetcher(url, options);
  const service = createWebService(h.config, { fetcher, now: () => h.state.now });
  const phone = device('https://web.push.apple.com/QAcmePhone');
  const call = (method, body, { cookie = signed.cookie, origin = h.config.origin } = {}) => service(new Request(`${h.config.origin}/api/push/subscription`, { method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json', origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  assert.equal((await call('GET', null, { cookie: null })).status, 401);
  const status = await call('GET');
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { publicKey: vapidKeys(h.config.encryptionKey).publicKey });
  const csrf = signed.session.csrf;
  assert.equal((await call('POST', { subscription: phone.subscription })).status, 403, 'CSRF required');
  assert.equal((await call('POST', { csrf: 'x'.repeat(43), subscription: phone.subscription })).status, 403);
  assert.equal((await call('POST', { csrf, subscription: phone.subscription }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('POST', { csrf, subscription: { ...phone.subscription, endpoint: 'https://evil.test/push' } })).status, 400);
  assert.equal((await call('POST', { csrf, subscription: phone.subscription, extra: true })).status, 400);
  const subscribed = await call('POST', { csrf, subscription: phone.subscription });
  assert.equal(subscribed.status, 200, await subscribed.clone().text());
  assert.deepEqual(await subscribed.json(), { subscribed: true, devices: 1 });
  const rows = (await database.db.query('SELECT scope, key, value FROM plates_push.subscriptions')).rows;
  assert.equal(rows.length, 1);
  assert.doesNotMatch(rows[0].value, /apple|QAcmePhone/, 'the endpoint is sealed at rest');
  assert.equal((await call('PUT', { csrf })).status, 405);
  assert.equal((await service(new Request(`${h.config.origin}/api/home`, { method: 'DELETE', headers: { cookie: signed.cookie } }))).status, 405);
  assert.equal((await call('DELETE', { endpoint: phone.subscription.endpoint })).status, 403);
  const removed = await call('DELETE', { csrf, endpoint: phone.subscription.endpoint });
  assert.deepEqual(await removed.json(), { removed: true, devices: 0 });
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_push.subscriptions')).rows[0].n, 0);
  const roles = (await database.db.query("SELECT has_function_privilege('anon','public.plates_push_rpc(text,text,text,text)','execute') anon, has_function_privilege('service_role','public.plates_push_rpc(text,text,text,text)','execute') service")).rows[0];
  assert.deepEqual(roles, { anon: false, service: true });
});

test('one push per item, no private text', async t => {
  const h = harness(), database = await pushDatabase(t), config = h.config;
  const phone = device('https://web.push.apple.com/QAcmePhone'), tablet = device('https://fcm.googleapis.com/fcm/send/acme-tablet');
  const devices = new Map([[phone.subscription.endpoint, phone], [tablet.subscription.endpoint, tablet]]);
  const delivered = [], status = new Map();
  const keys = vapidKeys(config.encryptionKey), now = Date.UTC(2026, 9, 30, 6);
  // The fake push service decrypts what it receives with the device's own keys.
  const fetcher = async (url, options) => {
    if (url.startsWith(config.storageUrl)) return database.handle(url, options);
    const target = devices.get(url);
    assert.ok(target, `only subscribed endpoints are contacted: ${url}`);
    const claims = readVapid(options.headers.Authorization, keys);
    assert.equal(claims.aud, new URL(url).origin); assert.equal(claims.sub, config.origin);
    assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
    delivered.push({ url, topic: options.headers.Topic, payload: JSON.parse(decrypt(options.body, target)) });
    return new Response(null, { status: status.get(url) ?? 201 });
  };
  const store = createPushStore(config, fetcher);
  for (const { subscription } of devices.values()) await store.subscribe(1, subscription);
  const notifier = createPushNotifier(config, { store, fetcher, now: () => now });
  const operation = 'c'.repeat(64);
  const events = [
    { waits: 'owner', kind: 'check', source: 'decisions', title: 'check decision: Acme secret merger', why: 'due 2026-10-30; expected: Acme secret merger closes', ref: 'docs/phases/150-acme.md#3', checkBy: '2026-10-30', project: 'studio' },
    { waits: 'owner', kind: 'check', title: 'check decision: Acme secret merger', ref: 'docs/phases/150-acme.md#3', checkBy: '2026-10-30', project: 'studio' },
    { waits: 'broken', kind: 'check', title: 'decision record breaks the check rule', ref: 'docs/phases/150-acme.md#4' },
    { kind: 'walk', project: 'studio', walkId: 'acme-launch', title: 'Acme launch checklist', ready: true },
    { kind: 'walk', project: 'studio', walkId: 'acme-later', title: 'Acme launch checklist', ready: false },
    { kind: 'door', door: 'irreversible', project: 'studio', operationId: operation, title: 'Delete the Acme secret merger branch' },
    { kind: 'door', door: 'two-way', project: 'studio', operationId: 'd'.repeat(64) },
    { kind: 'night', state: 'red', project: 'studio', date: '2026-10-30', why: 'Acme secret merger failed' },
    { kind: 'night', state: 'green', project: 'studio', date: '2026-10-29' },
  ];
  const planned = notificationsFor(events);
  assert.deepEqual(notificationsFor(events), planned, 'pure and deterministic');
  assert.deepEqual(planned.map(n => [n.kind, n.url]), [
    ['check', '/projects/studio'],
    ['walk', '/projects/studio/walks/acme-launch'],
    ['door', `/projects/studio/operations/${operation}`],
    ['night', '/projects/studio/activity?routine=night'],
  ]);
  for (const n of planned) { assert.match(n.tag, /^plates-[a-f0-9]{32}$/); assert.doesNotMatch(`${n.title} ${n.body}`, PRIVATE); }
  assert.equal(planned[0].body, 'A decision is due for a check.');

  const first = await notifier.notify(1, events);
  assert.deepEqual(first, { sent: planned.map(n => n.tag), skipped: [], failed: [] });
  assert.equal(delivered.length, planned.length * 2, 'each item reaches each device once');
  for (const { payload, topic } of delivered) {
    const expected = planned.find(n => n.tag === payload.tag);
    assert.deepEqual(payload, { title: expected.title, body: expected.body, url: expected.url, tag: expected.tag });
    assert.equal(topic, expected.key.slice(0, 32));
    assert.doesNotMatch(JSON.stringify(payload), PRIVATE);
  }

  // The same events again, in a later run: nothing is sent.
  const again = await createPushNotifier(config, { store, fetcher, now: () => now + 3600000 }).notify(1, events);
  assert.deepEqual(again, { sent: [], skipped: planned.map(n => n.tag), failed: [] });
  assert.equal(delivered.length, planned.length * 2);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_push.ledger')).rows[0].n, planned.length);

  // The worker shows exactly the fixed words, and opening it only opens the item.
  const worker = workerScope({ origin: config.origin, caches: fakeCaches(), fetch: async () => new Response('') });
  shellWorker(worker.scope, { version: 'a'.repeat(32), shell: [], offline: '/offline' });
  const door = delivered.find(entry => entry.payload.url.includes('/operations/')).payload;
  await worker.dispatch('push', { data: { json: () => door } });
  assert.deepEqual(worker.shown, [{ title: door.title, options: { body: door.body, data: { url: door.url }, icon: '/assets/plates-icon-192.png', badge: '/assets/plates-icon-192.png', tag: door.tag } }]);
  await worker.dispatch('notificationclick', { notification: { close() {}, data: worker.shown[0].options.data } });
  await worker.dispatch('notificationclick', { notification: { close() {}, data: { url: 'https://evil.test/approve' } } });
  assert.deepEqual(worker.opened, [`${config.origin}${door.url}`, `${config.origin}/`]);

  // A re-dated check is a new item; a device the push service says is gone is dropped.
  status.set(tablet.subscription.endpoint, 410);
  const redated = await notifier.notify(1, [{ ...events[0], checkBy: '2026-11-30' }]);
  assert.equal(redated.sent.length, 1);
  assert.deepEqual((await store.list(1)).map(s => s.endpoint), [phone.subscription.endpoint]);
  assert.equal((await notifier.notify(1, [{ ...events[0], checkBy: '2026-11-30' }])).sent.length, 0);
});

test('a signed-in page offers notifications and subscribes with the session CSRF', async () => {
  const keys = vapidKeys(Buffer.alloc(32, 7)), phone = device('https://web.push.apple.com/QAcmePhone');
  const element = () => { const node = { attributes: {}, listeners: {}, textContent: '', disabled: false,
    setAttribute(name, value) { node.attributes[name] = value; }, addEventListener(name, handler) { node.listeners[name] = handler; } }; return node; };
  const nav = { children: [], append(...nodes) { nav.children.push(...nodes); } };
  const document = { body: { hasAttribute: () => false }, createElement: element,
    querySelector: selector => ({ 'meta[name="plates-shell"]': { getAttribute: () => 'a'.repeat(32) }, '[data-navigation] nav': nav,
      '[data-navigation] input[name="csrf"]': { value: 'Acme-csrf' } })[selector] ?? null };
  let subscribed = null, permissionAsked = 0;
  const subscription = { endpoint: phone.subscription.endpoint, toJSON: () => phone.subscription, unsubscribe: async () => true };
  const registration = { update: async () => {}, pushManager: { getSubscription: async () => subscribed,
    subscribe: async options => { assert.equal(options.userVisibleOnly, true); assert.deepEqual(Buffer.from(options.applicationServerKey).toString('base64url'), keys.publicKey); subscribed = subscription; return subscription; } } };
  const requests = [];
  const window = { PushManager: function () {}, Notification: { permission: 'default', requestPermission: async () => { permissionAsked++; return 'granted'; } },
    addEventListener() {}, location: { reload() {} },
    fetch: async (path, options = {}) => { requests.push({ path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null });
      return Response.json(options.method ? { subscribed: true, devices: 1 } : { publicKey: keys.publicKey }); } };
  const navigator = { onLine: true, serviceWorker: { addEventListener() {}, register: async () => registration, controller: null } };
  const client = startPwa({ window, document, navigator });
  await client.ready; await new Promise(resolve => setImmediate(resolve));
  const [button, status] = nav.children;
  assert.equal(button.textContent, 'Turn on notifications');
  await button.listeners.click();
  assert.equal(permissionAsked, 1);
  assert.deepEqual(requests, [{ path: '/api/push/subscription', method: 'GET', body: null },
    { path: '/api/push/subscription', method: 'POST', body: { csrf: 'Acme-csrf', subscription: phone.subscription } }]);
  assert.equal(button.textContent, 'Turn off notifications');
  assert.match(status.textContent, /Notifications are on/);
  await button.listeners.click();
  assert.equal(permissionAsked, 1, 'turning off asks nothing');
  assert.deepEqual(requests.at(-1), { path: '/api/push/subscription', method: 'DELETE', body: { csrf: 'Acme-csrf', endpoint: phone.subscription.endpoint } });
  assert.equal(button.textContent, 'Turn on notifications');
});
