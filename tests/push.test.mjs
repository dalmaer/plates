// "N new for you" (plates phase 175): when the count of items in Home's "Needs
// you" rises above what the owner was last told of, phase 152's push sends one
// notification that opens the review session, at most once a day and never in
// the owner's quiet hours. Synthetic Acme sources: the real web service over the
// fake App API, the push store (SQL015) and phase 173's per-owner store (SQL017)
// on PGlite, and a fake push service that decrypts what it receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createECDH, createDecipheriv, hkdfSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { projectHarness, phaseFile } from './helpers/web-projects.mjs';
import { createWebService } from '../lib/web/server.mjs';
import { createPushStore, createDocketState } from '../lib/web/push-store.mjs';
import { docketDecision, inQuietHours, localTime, DOCKET_URL } from '../lib/web/push-notify.mjs';
import { describeRoute } from '../lib/web/navigation-routes.mjs';
import { shellWorker } from '../lib/web/pwa.mjs';
import { webConfig } from '../lib/web/config.mjs';

async function database(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const file of ['015-push.sql', '017-not-now.sql']) await db.exec(await readFile(new URL(`../lib/web/migrations/${file}`, import.meta.url), 'utf8'));
  const handle = async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1), p = JSON.parse(options.body), entries = Object.entries(p);
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query(`SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_until' ? '::date' : ''}`).join(',')}) value`, entries.map(([, value]) => value));
      return Response.json(result.rows[0].value);
    } finally { await db.exec('RESET ROLE'); }
  };
  return { db, handle };
}

function device(endpoint) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = Buffer.from(Array.from({ length: 16 }, (_, i) => i * 5 + 3));
  return { ecdh, auth, subscription: { endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}

// RFC 8291's receiving side, so the test reads exactly what the phone would.
function decrypt(body, { ecdh, auth }) {
  const salt = body.subarray(0, 16), idLength = body[20], sender = body.subarray(21, 21 + idLength), sealed = body.subarray(21 + idLength);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(sender), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), sender]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce); decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length - 1; while (padded[end] === 0) end--;
  return padded.subarray(0, end).toString('utf8');
}

// Los Angeles in November is UTC-8: 17:00 UTC is 09:00 there, 15:00 UTC is 07:00 (quiet).
const at = (day, hourUtc) => Date.UTC(2026, 10, day, hourUtc, 0);
const QUIET = { timeZone: 'America/Los_Angeles', from: '21:00', to: '08:00' };

test('new docket items notify once and open the session', async t => {
  const p = projectHarness(), data = await database(t), phone = device('https://web.push.apple.com/QAcmeDocket');
  p.state.now = at(3, 17);
  const delivered = [];
  let lost = false;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (['/rest/v1/rpc/plates_push_rpc', '/rest/v1/rpc/plates_not_now_rpc'].includes(path)) return data.handle(url, options);
    // A plate with no readable value this read: the cache holds only a failed refresh (as after its value expired).
    if (lost && /home_cache_rpc$/.test(path)) return Response.json({ value: null, version: 1, readAt: null, leaseAcquired: false, refreshing: false, lastError: 'source_unavailable', nextAttempt: null });
    if (url === phone.subscription.endpoint) { delivered.push({ topic: options.headers.Topic, ...JSON.parse(decrypt(options.body, phone)) }); return new Response(null, { status: 201 }); }
    return p.fetcher(url, options);
  };
  const config = { ...p.config, quietHours: QUIET };
  let signed = await p.login(), signedAt = p.state.now;
  const service = createWebService(config, { fetcher, now: () => p.state.now });
  const home = async (path = '/api/home?fresh=1') => {
    p.state.now += 61000; // past the ten-minute cache's one-minute retry
    if (p.state.now - signedAt > 600_000) { signed = await p.login(); signedAt = p.state.now; } // the test's days outlast a session
    const response = await service(new Request(`${config.origin}${path}`, { headers: { cookie: signed.cookie } }));
    assert.equal(response.status, 200, await response.clone().text());
    return path.startsWith('/api/') ? response.json() : null;
  };
  const docket = () => p.source.files;
  const addStep = n => { docket()[`docs/phases/${String(n).padStart(2, '0')}-step.md`] = phaseFile(n, { next: `⚑ Choose policy ${n}.` }); p.source.revision = n.toString(16).padStart(40, 'c'); };

  const ledger = async () => (await data.db.query('SELECT count(*)::int n FROM plates_push.ledger')).rows[0].n;
  // Not subscribed: nothing is sent, and nothing is claimed for the day (phase 152's per-item claim for the ready walk is its own).
  const first = await home(), items = await ledger();
  assert.equal(first.docket.length, 2, 'the fixture docket: a step and a ready walk');
  assert.equal(delivered.length, 0);
  p.state.now += 61000; await home();
  assert.equal(await ledger(), items, 'no day claimed without a device');

  // Subscribed, 09:00 in Los Angeles: the two items are new.
  await createPushStore(config, fetcher).subscribe(1, phone.subscription);
  await home();
  assert.deepEqual(delivered, [{ topic: 'plates-docket', title: 'Plates: new for you', body: '2 new for you', url: '/review', tag: 'plates-docket' }]);
  assert.equal(DOCKET_URL, '/review'); assert.equal(describeRoute(delivered[0].url)?.destination, 'home', 'a workspace route');
  assert.doesNotMatch(JSON.stringify(delivered), /Acme|policy|publish|studio/i, 'only the count, no private text');

  // A new item the same day: at most one a day.
  addStep(5);
  assert.equal((await home()).docket.length, 3);
  assert.equal(delivered.length, 1, 'once a day');
  // The HTML shell and the review page read the cache only: they never notify.
  await home('/'); await home('/review');
  assert.equal(delivered.length, 1);

  // The next morning at 07:00 is quiet hours: nothing. At 09:00 the one new item is announced.
  p.state.now = at(4, 15); await home();
  assert.equal(delivered.length, 1, 'never in quiet hours');
  p.state.now = at(4, 17); await home();
  assert.deepEqual(delivered.slice(1).map(d => [d.body, d.url]), [['1 new for you', '/review']], 'counted from what was last notified');
  p.state.now = at(4, 19); await home();
  assert.equal(delivered.length, 2, 'nothing new: nothing sent');

  // The docket shrinks (answered) the next day, then grows by one: that one is new.
  p.state.now = at(5, 17);
  delete docket()['docs/phases/05-step.md']; p.source.revision = 'e'.repeat(40);
  assert.equal((await home()).docket.length, 2);
  assert.equal(delivered.length, 2, 'fewer items: nothing sent');
  addStep(6); p.state.now = at(5, 18);
  await home();
  assert.deepEqual(delivered.slice(2).map(d => d.body), ['1 new for you'], 'a rise above the lower count is new');
  assert.equal(await ledger(), items + 3, 'one ledger row per day sent');

  // The last count lives in phase 173's per-owner store under its own scope: sealed, and never a Not now record.
  const rows = (await data.db.query('SELECT scope, value FROM plates_home.not_now')).rows;
  assert.equal(rows.length, 1); assert.doesNotMatch(rows[0].value, /count|date|2026/);
  assert.equal(rows[0].scope, createDocketState(config, fetcher).scopeFor(1));
  assert.deepEqual(await createDocketState(config, fetcher).read(1), { count: 3, date: '2026-11-05' });
  assert.deepEqual((await home()).putOff, { count: 0, items: [], unavailable: null }, 'Home puts nothing off because of it');

  // A plate whose refresh fails is not zero items: the lower count is not recorded, so when it recovers nothing is "new".
  p.state.now = at(6, 17); p.source.fail = true; p.source.revision = '9'.repeat(40);
  const failed = await home();
  assert.notEqual(failed.projects.find(x => x.id === 'studio').state, 'complete', 'the refresh failed');
  assert.deepEqual(await createDocketState(config, fetcher).read(1), { count: 3, date: '2026-11-05' }, 'the baseline is kept');
  p.source.fail = false; p.source.revision = '8'.repeat(40); p.state.now = at(6, 18);
  assert.equal((await home()).docket.length, 3, 'recovered');
  assert.equal(delivered.length, 3, 'no false "new for you" after a recovery');
  // The same with no value at all: the plate counts as unavailable, not as zero items.
  p.state.now = at(7, 9); lost = true;
  const gone = await home();
  assert.equal(gone.projects.find(x => x.id === 'studio').state, 'unavailable'); assert.equal(gone.docket.length, 0);
  assert.deepEqual(await createDocketState(config, fetcher).read(1), { count: 3, date: '2026-11-05' }, 'an unreadable plate never lowers the baseline');
  lost = false; p.source.revision = '7'.repeat(40); p.state.now = at(7, 17);
  assert.equal((await home()).docket.length, 3);
  assert.equal(delivered.length, 3, 'its recovery is not "3 new for you"');

  // Without quiet hours set, the workspace never sends it, and its record is untouched.
  const unset = createWebService(p.config, { fetcher, now: () => p.state.now });
  addStep(7); p.state.now = at(8, 17);
  signed = await p.login();
  const response = await unset(new Request(`${config.origin}/api/home?fresh=1`, { headers: { cookie: signed.cookie } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).docket.length, 4);
  assert.equal(delivered.length, 3); assert.deepEqual(await createDocketState(config, fetcher).read(1), { count: 3, date: '2026-11-05' });

  // Tapping it opens the review session: the worker opens the payload's own route.
  const opened = [], shown = [], listeners = {};
  const scope = { location: { origin: config.origin }, caches: { open: async () => ({}), keys: async () => [] }, addEventListener: (name, fn) => { listeners[name] = fn; },
    clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); }, claim: async () => {} }, registration: { showNotification: async (title, options) => { shown.push({ title, options }); } } };
  shellWorker(scope, { version: 'a'.repeat(32), shell: [], offline: '/offline' });
  const dispatch = async (name, event) => { let waited; listeners[name]({ ...event, waitUntil: x => { waited = x; } }); await waited; };
  await dispatch('push', { data: { json: () => delivered[0] } });
  assert.deepEqual(shown.map(s => [s.title, s.options.body, s.options.data.url, s.options.tag]), [['Plates: new for you', '2 new for you', '/review', 'plates-docket']]);
  await dispatch('notificationclick', { notification: { data: shown[0].options.data, close() {} } });
  assert.deepEqual(opened, [`${config.origin}/review`]);
});

test('the docket notification rule, and quiet hours in the owner\'s own time zone', () => {
  const local = { date: '2026-11-03', minutes: 9 * 60 };
  assert.deepEqual(docketDecision({ count: 3, last: null, local, quiet: false }), { action: 'send', n: 3, next: { count: 3, date: '2026-11-03' } });
  assert.deepEqual(docketDecision({ count: 3, last: { count: 3, date: '2026-11-01' }, local, quiet: false }), { action: 'none' });
  assert.deepEqual(docketDecision({ count: 4, last: { count: 3, date: '2026-11-03' }, local, quiet: false }), { action: 'today' });
  assert.deepEqual(docketDecision({ count: 4, last: { count: 3, date: '2026-11-02' }, local, quiet: true }), { action: 'quiet' });
  assert.deepEqual(docketDecision({ count: 1, last: { count: 3, date: '2026-11-02' }, local, quiet: false }), { action: 'lower', next: { count: 1, date: '2026-11-02' } });
  assert.deepEqual(docketDecision({ count: 0, last: null, local, quiet: false }), { action: 'none' });
  // A window across midnight, and one within a day; the end minute is not quiet.
  assert.ok(inQuietHours(23 * 60, QUIET) && inQuietHours(7 * 60 + 59, QUIET) && !inQuietHours(8 * 60, QUIET) && !inQuietHours(12 * 60, QUIET));
  assert.ok(inQuietHours(13 * 60, { from: '12:00', to: '14:00' }) && !inQuietHours(14 * 60, { from: '12:00', to: '14:00' }));
  assert.deepEqual(localTime(at(3, 7), 'America/Los_Angeles'), { date: '2026-11-02', minutes: 23 * 60 }, 'the owner\'s local day, not UTC\'s');
  // The config names them exactly, or the workspace refuses to start.
  const base = { version: 1, origin: 'https://plates.acme.test', ownerIds: [1], appId: 1, clientId: 'acme', installationId: 2, workspace: { id: 'acme', repoId: 3, manifestPath: 'plates.json', membersPath: 'members.json' }, projectRepoIds: { studio: 4 } };
  const secrets = { clientSecret: 'x'.repeat(16), storageKey: 'y'.repeat(16), storageUrl: 'https://acme.supabase.co', encryptionKey: Buffer.alloc(32, 1).toString('base64') };
  assert.deepEqual(webConfig({ ...base, quietHours: QUIET }, secrets).quietHours, QUIET);
  for (const quietHours of [{ ...QUIET, timeZone: 'Mars/Olympus' }, { ...QUIET, from: '25:00' }, { ...QUIET, to: QUIET.from }, { ...QUIET, extra: 1 }, { timeZone: 'UTC', from: '21:00' }])
    assert.throws(() => webConfig({ ...base, quietHours }, secrets), /invalid_service_configuration/, JSON.stringify(quietHours));
});
