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
import * as safetyClient from '../lib/web/safety-client.mjs';
const { startSafety } = safetyClient;
// Read at call time, so this file loads (and its tests fail) without the export.
const hasUnsavedEdits = document => safetyClient.hasUnsavedEdits(document);
import { encryptPayload, vapidAuthorization, vapidKeys, publicKeyObject, validSubscription } from '../lib/web/push.mjs';
import { createPushStore } from '../lib/web/push-store.mjs';
import { notificationsFor, createPushNotifier, waitingEvents } from '../lib/web/push-notify.mjs';
import { projectHarness } from './helpers/web-projects.mjs';

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
  const scope = { location: { origin }, caches: caches.api, fetch, skipWaiting: async () => {}, setTimeout, clearTimeout,
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

test('waiting-on-owner events reach the notifier', async t => {
  // A ready walk (phase 2), an unready one (phase 3) and a night whose latest record has a failed item.
  const night = date => JSON.stringify({ schema: 1, date, shapedBy: 'owner', readyBy: null, willNotTouch: [], settledToday: [], leftOpen: [], items: [
    { id: 'acme-merger', title: 'Acme secret merger build', kind: 'build', source: 'owner', number: { measure: 'slow_tests', bound: 20, better: 'lower' }, lane: 'climb:test-time', budget: { minutes: 10 }, status: 'failed', result: { note: 'Acme secret merger failed' } },
    { id: 'acme-docs', title: 'Acme launch checklist', kind: 'build', source: 'owner', number: { measure: 'slow_tests', bound: 20, better: 'lower' }, lane: 'climb:test-time', budget: { minutes: 10 }, status: 'done', result: null }] });
  const p = projectHarness(), config = p.config, database = await pushDatabase(t);
  p.source.files['docs/night/2026-10-30.json'] = night('2026-10-30');
  const phone = device('https://web.push.apple.com/QAcmePhone'), delivered = [], rpcs = [];
  let pushStatus = 201, storageDown = false;
  const fetcher = async (url, options) => {
    if (new URL(url).pathname === '/rest/v1/rpc/plates_push_rpc') {
      rpcs.push(JSON.parse(options.body).p_operation);
      if (storageDown) throw new TypeError('fake-service unreachable');
      return database.handle(url, options);
    }
    if (url === phone.subscription.endpoint) { delivered.push(JSON.parse(decrypt(options.body, phone))); return new Response(null, { status: pushStatus }); }
    return p.fetcher(url, options);
  };
  await createPushStore(config, fetcher).subscribe(1, phone.subscription);
  rpcs.length = 0;
  const signed = await p.login(), owner = createWebService(config, { fetcher, now: () => p.state.now });
  const home = async (service, path = '/api/home?fresh=1') => {
    p.state.now += 61000;
    const response = await service(new Request(`${config.origin}${path}`, { headers: { cookie: signed.cookie } }));
    assert.equal(response.status, 200, await response.clone().text());
    return response;
  };

  // The HTML shell reads only the cache: nothing is learned, nothing is sent.
  await home(owner, '/');
  assert.deepEqual([delivered.length, rpcs.length], [0, 0]);

  // The owner's fresh read: the ready walk and the red night reach the phone, once each.
  const snapshot = await (await home(owner)).json();
  const project = snapshot.projects.find(item => item.id === 'studio');
  assert.equal(snapshot.walks.filter(walk => walk.ready).length, 1, 'phase 3 is not ready');
  assert.deepEqual(waitingEvents(project).map(event => event.kind), ['walk', 'night']);
  // An unready walk, or one from another project, never waits on the owner.
  assert.deepEqual(waitingEvents({ ...project, walks: [{ id: 'acme-later', title: 'Acme later walk', ready: false, projectId: project.id },
    { id: 'acme-elsewhere', title: 'Acme other walk', ready: true, projectId: 'acme-other' }], daily: null }), []);
  const planned = notificationsFor(waitingEvents(project));
  assert.deepEqual(delivered, planned.map(n => ({ title: n.title, body: n.body, url: n.url, tag: n.tag })));
  assert.deepEqual(delivered.map(payload => payload.url), ['/projects/studio', '/projects/studio/daily?date=2026-10-30']);
  for (const payload of delivered) assert.doesNotMatch(JSON.stringify(payload), PRIVATE);

  // The same items at a new source revision send nothing; the ledger holds one row per item.
  p.source.revision = 'd'.repeat(40); const rereads = rpcs.length;
  await home(owner);
  assert.ok(rpcs.length > rereads, 'the new revision was read and its items claimed again');
  assert.equal(delivered.length, 2);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_push.ledger')).rows[0].n, 2);

  // A new red night is a new item. A push service that refuses it, or push storage
  // that is down (migration 015 not applied), never fails Home.
  pushStatus = 500; p.source.files['docs/night/2026-10-31.json'] = night('2026-10-31'); p.source.revision = 'e'.repeat(40);
  await home(owner);
  assert.equal(delivered.length, 3); assert.equal(delivered[2].url, '/projects/studio/daily?date=2026-10-31');
  storageDown = true; p.source.files['docs/night/2026-11-01.json'] = night('2026-11-01'); p.source.revision = 'f'.repeat(40);
  const attempts = rpcs.length;
  await home(owner);
  assert.ok(rpcs.length > attempts, 'the new night was tried against push storage');
  assert.equal(delivered.length, 3);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_push.ledger')).rows[0].n, 3);
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

// ---- phase 164: an app update never costs unsaved work

// A small page: elements that hold attributes, children, text and listeners.
function fakePage({ version, safety = true }) {
  const element = tag => {
    const node = { tag, attributes: {}, children: [], listeners: {}, textContent: '', type: '', disabled: false,
      setAttribute(name, value) { node.attributes[name] = value; }, hasAttribute: name => Object.hasOwn(node.attributes, name),
      addEventListener(name, handler) { node.listeners[name] = handler; }, removeEventListener() {},
      append(...nodes) { node.children.push(...nodes); }, prepend(...nodes) { node.children.unshift(...nodes); },
      querySelector: selector => selector === '[data-safety-status]' ? node.children.find(child => child.hasAttribute?.('data-safety-status')) ?? null : null };
    return node;
  };
  const main = element('main'), listeners = {};
  const document = { visibilityState: 'visible', body: element('body'), createElement: element, activeElement: null,
    addEventListener: (name, handler) => { listeners[name] = handler; }, removeEventListener() {},
    querySelector: selector => {
      if (selector === 'meta[name="plates-shell"]') return { getAttribute: () => version };
      if (selector === 'main') return main;
      if (selector === '[data-safety-status]' || selector.includes('/assets/safety-client.mjs')) return safety ? main.querySelector('[data-safety-status]') : null;
      return null;
    } };
  return { document, main, listeners };
}

function fakeClient({ version, online = true }) {
  const windowListeners = {}, workerListeners = {}, sent = [], counts = { reloads: 0, updates: 0 };
  const registration = { update: async () => { counts.updates++; } };
  const navigator = { onLine: online, serviceWorker: { addEventListener: (name, handler) => { workerListeners[name] = handler; },
    register: async () => registration, controller: { postMessage: message => sent.push(message) } } };
  const window = { navigator, addEventListener: (name, handler) => { windowListeners[name] = handler; }, removeEventListener() {},
    location: { pathname: '/projects/studio/daily', search: '', reload: () => { counts.reloads++; }, assign() {} } };
  return { window, navigator, windowListeners, workerListeners, sent, counts };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('a new shell never reloads over unsaved edits', async () => {
  const oldVersion = 'a'.repeat(32), newVersion = 'b'.repeat(32);
  const safety = () => import('../lib/web/safety-client.mjs');
  // A page with an editor holding unsaved text.
  const editing = fakePage({ version: oldVersion }), browser = fakeClient({ version: oldVersion });
  let dirty = true;
  const guard = startSafety({ root: editing.main, document: editing.document, window: browser.window, readDirty: () => dirty });
  assert.equal(hasUnsavedEdits(editing.document), true);
  const client = startPwa({ window: browser.window, document: editing.document, navigator: browser.navigator, safety });
  await client.ready;
  browser.workerListeners.message({ data: { type: 'plates-shell', version: newVersion } });
  browser.workerListeners.message({ data: { type: 'plates-shell', version: newVersion } });
  await tick(); await tick();
  assert.equal(browser.counts.reloads, 0, 'unsaved edits are never reloaded away');
  const notices = editing.main.children.filter(child => child.hasAttribute('data-shell-notice'));
  assert.equal(notices.length, 1, 'one notice, in the page');
  const [notice] = notices;
  assert.equal(notice.attributes.role, 'status');
  assert.equal(notice.textContent.trim(), 'A new version is ready. Reload when you have saved.');
  const [button] = notice.children;
  assert.deepEqual([button.tag, button.type, button.textContent], ['button', 'button', 'Reload']);
  // The owner saves, then chooses to reload.
  dirty = false;
  assert.equal(browser.counts.reloads, 0, 'saving alone does not reload');
  button.listeners.click();
  assert.equal(browser.counts.reloads, 1);

  // A stopped guard no longer counts; a guard that cannot answer counts as unsaved.
  dirty = true; guard.stop();
  assert.equal(hasUnsavedEdits(editing.document), false);
  const unsure = fakePage({ version: oldVersion });
  startSafety({ root: unsure.main, document: unsure.document, window: browser.window, readDirty: () => { throw new Error('unknown'); } });
  assert.equal(hasUnsavedEdits(unsure.document), true);

  // A page whose editor has nothing unsaved refreshes as before.
  const clean = fakePage({ version: oldVersion }), other = fakeClient({ version: oldVersion });
  startSafety({ root: clean.main, document: clean.document, window: other.window, readDirty: () => false });
  await startPwa({ window: other.window, document: clean.document, navigator: other.navigator, safety }).ready;
  other.workerListeners.message({ data: { type: 'plates-shell', version: newVersion } });
  await tick(); await tick();
  assert.equal(other.counts.reloads, 1);
  assert.equal(clean.main.children.some(child => child.hasAttribute('data-shell-notice')), false);

  // A page without editors never loads the safety client and reloads at once.
  const plain = fakePage({ version: oldVersion, safety: false }), third = fakeClient({ version: oldVersion });
  let loaded = 0;
  await startPwa({ window: third.window, document: plain.document, navigator: third.navigator, safety: () => { loaded++; return safety(); } }).ready;
  third.workerListeners.message({ data: { type: 'plates-shell', version: newVersion } });
  assert.deepEqual([third.counts.reloads, loaded], [1, 0]);
});

test('navigation preloads and gives up on a stalled network', async () => {
  const origin = 'https://plates.acme.test', caches = fakeCaches(), calls = [];
  let mode = 'up';
  const pending = [];
  const fetch = async request => {
    calls.push(request.url);
    if (mode === 'stall') return new Promise(resolve => pending.push(() => resolve(new Response('<p>Acme secret merger</p>', { headers: { 'content-type': 'text/html' } }))));
    return new Response(request.url.endsWith('/offline') ? 'You are offline' : 'shell');
  };
  const worker = workerScope({ origin, caches, fetch });
  let enabled = 0;
  worker.scope.registration.navigationPreload = { enable: async () => { enabled++; } };
  const { route } = shellWorker(worker.scope, { version: 'c'.repeat(32), shell: ['/offline'], offline: '/offline', timeout: 30 });
  await worker.dispatch('install'); await worker.dispatch('activate');
  assert.equal(enabled, 1, 'activate turns on navigation preload');
  const writes = caches.writes.length; calls.length = 0;
  const navigate = path => ({ url: `${origin}${path}`, method: 'GET', mode: 'navigate' });

  // The preload response is used; the worker does not fetch the page again.
  const preloaded = await worker.dispatch('fetch', { request: navigate('/projects/studio'), preloadResponse: Promise.resolve(new Response('preloaded page')) });
  assert.equal(await preloaded.text(), 'preloaded page');
  assert.deepEqual(calls, []);
  // No preload (unsupported, or not enabled yet): fetch as before. route() alone still works.
  assert.equal(await (await worker.dispatch('fetch', { request: navigate('/'), preloadResponse: Promise.resolve(undefined) })).text(), 'shell');
  assert.equal(await (await route(navigate('/daily'))).text(), 'shell');
  assert.equal(calls.length, 2);

  // A stalled connection gets the offline page after the bounded wait.
  mode = 'stall';
  const started = Date.now();
  const stalled = await worker.dispatch('fetch', { request: navigate('/projects/studio') });
  assert.match(await stalled.text(), /You are offline/);
  assert.ok(Date.now() - started >= 25, 'it waited for the timeout');
  const stalledPreload = await worker.dispatch('fetch', { request: navigate('/projects/studio'), preloadResponse: new Promise(() => {}) });
  assert.match(await stalledPreload.text(), /You are offline/);
  // The late response arrives and is dropped: nothing is ever stored.
  for (const resolve of pending) resolve();
  await tick(); await tick();
  assert.equal(caches.writes.length, writes, 'no navigation response was written to the cache');
  const stored = await Promise.all([...caches.stores.get(`plates-shell-${'c'.repeat(32)}`).values()].map(response => response.clone().text()));
  assert.ok(stored.every(text => !/Acme secret merger/.test(text)));

  // The served worker carries the 30 second default, above the server's 25 second source reads.
  const served = createPwa({ css: 'body{}' }).worker;
  const real = workerScope({ origin, caches: fakeCaches(), fetch });
  const timers = [];
  real.scope.setTimeout = (handler, ms) => { timers.push(ms); return 0; };
  runWorker(served, real.scope);
  mode = 'up';
  await real.dispatch('fetch', { request: navigate('/') });
  assert.deepEqual(timers, [30000]);
});

test('a returning app checks for a new shell', async () => {
  const version = 'a'.repeat(32), page = fakePage({ version, safety: false }), browser = fakeClient({ version });
  const client = startPwa({ window: browser.window, document: page.document, navigator: browser.navigator });
  await client.ready;
  browser.sent.length = 0;
  page.document.visibilityState = 'hidden';
  page.listeners.visibilitychange();
  await tick(); await tick();
  assert.deepEqual([browser.counts.updates, browser.sent.length], [0, 0], 'going to the background checks nothing');
  page.document.visibilityState = 'visible';
  page.listeners.visibilitychange();
  await tick(); await tick();
  assert.equal(browser.counts.updates, 1, 'the worker registration is updated');
  assert.deepEqual(browser.sent, [{ type: 'plates-shell?' }], 'and the worker is asked for its version');
  // A newer worker answers: the page refreshes as on reconnect.
  browser.workerListeners.message({ data: { type: 'plates-shell', version: 'b'.repeat(32) } });
  assert.equal(browser.counts.reloads, 1);
});

test('a rotated push subscription keeps notifications coming', async t => {
  const h = harness(), database = await pushDatabase(t), origin = h.config.origin;
  const fetcher = async (url, options) => new URL(url).pathname === '/rest/v1/rpc/plates_push_rpc' ? database.handle(url, options) : h.fetcher(url, options);
  const service = createWebService(h.config, { fetcher, now: () => h.state.now });
  const store = createPushStore(h.config, fetcher);
  const phone = device('https://web.push.apple.com/QAcmePhoneOld'), rotated = device('https://web.push.apple.com/QAcmePhoneNew');
  const tablet = device('https://fcm.googleapis.com/fcm/send/acme-tablet');
  await store.subscribe(1, phone.subscription); await store.subscribe(1, tablet.subscription);
  const rotate = (body, { origin: from = origin, cookie } = {}) => service(new Request(`${origin}/api/push/subscription/rotate`, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: from, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

  // The browser rotates the phone's subscription while no page is open. The
  // worker re-subscribes with the old options and posts the new one.
  const posted = [];
  const workerFetch = async (url, options = {}) => {
    posted.push({ url, method: options.method, credentials: options.credentials });
    return service(new Request(url, { method: options.method, headers: { ...options.headers, origin }, body: options.body }));
  };
  const worker = workerScope({ origin, caches: fakeCaches(), fetch: workerFetch });
  const oldOptions = { userVisibleOnly: true, applicationServerKey: new Uint8Array(65).buffer };
  let subscribedWith = null;
  worker.scope.registration.pushManager = { subscribe: async options => { subscribedWith = options; return { endpoint: rotated.subscription.endpoint, toJSON: () => rotated.subscription }; } };
  shellWorker(worker.scope, { version: 'a'.repeat(32), shell: [], offline: '/offline' });
  await worker.dispatch('pushsubscriptionchange', { oldSubscription: { endpoint: phone.subscription.endpoint, options: oldOptions }, newSubscription: null });
  assert.equal(subscribedWith, oldOptions, 're-subscribed with the old options');
  assert.deepEqual(posted, [{ url: `${origin}/api/push/subscription/rotate`, method: 'POST', credentials: 'same-origin' }]);
  // Only the phone's own record changed: the tablet is untouched.
  assert.deepEqual((await store.list(1)).map(s => s.endpoint).sort(), [rotated.subscription.endpoint, tablet.subscription.endpoint].sort());

  // An unknown old endpoint is refused and creates nothing.
  const stranger = device('https://web.push.apple.com/QAcmeStranger'), other = device('https://web.push.apple.com/QAcmeOther');
  const unknown = await rotate({ oldEndpoint: stranger.subscription.endpoint, subscription: other.subscription });
  assert.equal(unknown.status, 404);
  // The old endpoint, once replaced, is no longer an authority either.
  assert.equal((await rotate({ oldEndpoint: phone.subscription.endpoint, subscription: other.subscription })).status, 404);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM plates_push.subscriptions')).rows[0].n, 2);
  // Another origin, a malformed body or an invalid new subscription is refused.
  assert.equal((await rotate({ oldEndpoint: tablet.subscription.endpoint, subscription: other.subscription }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await rotate({ oldEndpoint: tablet.subscription.endpoint, subscription: other.subscription, extra: 1 })).status, 400);
  assert.equal((await rotate({ oldEndpoint: tablet.subscription.endpoint, subscription: { ...other.subscription, endpoint: 'https://evil.test/push' } })).status, 400);
  assert.deepEqual((await store.list(1)).map(s => s.endpoint).sort(), [rotated.subscription.endpoint, tablet.subscription.endpoint].sort());

  // With the owner's session, the owner's own record rotates the same way.
  const signed = await h.login();
  const withSession = await rotate({ oldEndpoint: tablet.subscription.endpoint, subscription: other.subscription }, { cookie: signed.cookie });
  assert.equal(withSession.status, 200, await withSession.clone().text());
  assert.deepEqual(await withSession.json(), { rotated: true, devices: 2 });
  assert.deepEqual((await store.list(1)).map(s => s.endpoint).sort(), [rotated.subscription.endpoint, other.subscription.endpoint].sort());
  // A new notification reaches the rotated device, not the old endpoint.
  const delivered = [];
  const notifier = createPushNotifier(h.config, { store, now: () => Date.UTC(2026, 10, 2), fetcher: async (url, options) => {
    if (url.startsWith(h.config.storageUrl)) return database.handle(url, options);
    delivered.push(url); return new Response(null, { status: 201 });
  } });
  await notifier.notify(1, [{ kind: 'night', state: 'red', project: 'studio', date: '2026-11-01' }]);
  assert.deepEqual(delivered.sort(), [rotated.subscription.endpoint, other.subscription.endpoint].sort());
});
