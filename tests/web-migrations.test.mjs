import { nameBaseline, isRpcWriter } from './helpers/web-name-baseline.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { NAMES, writeName } from '../lib/names.mjs';
const directory = new URL('../lib/web/migrations/', import.meta.url);
const rows = NAMES.filter(isRpcWriter);
const storeConfig = { storageUrl: 'https://acme.supabase.co', storageKey: 'fake-key', encryptionKey: Buffer.alloc(32, 7) };

test('renamed functions with forwarders', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const files = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort();
  // 016 replaces plates_web_rpc and refuses before 014; this test applies 014 itself.
  for (const file of files.filter(f => !f.startsWith('014-') && !f.startsWith('016-'))) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  const before = new Map();
  for (const row of rows) before.set(row.id, (await db.query(`SELECT prosrc, proargnames, proargtypes::text, proacl::text, proconfig, prosecdef, pg_get_function_arguments(oid) args FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1`, [row.keel])).rows[0]);
  const key = 'a'.repeat(64);
  // Shipped source writes the migrated names; the rollback baseline keeps the held rows.
  const rollback = await nameBaseline(t, { cookies: false, database: true });
  assert.equal(rows.length, 15);
  for (const row of rows) {
    assert.equal(writeName(row.id), row.plates, `shipped phase127 writer: ${row.id}`);
    assert.equal(rollback.names.writeName(row.id), row.keel, `compatibility baseline: ${row.id}`);
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1", [row.plates])).rows[0].n, 0);
  }
  const { createStore } = await import('../lib/web/store.mjs');
  const urls = [];
  let expectedName = 'keel_web_rpc';
  const adapter = async (url, options) => {
    urls.push(url);
    const name = new URL(url).pathname.split('/').at(-1);
    assert.equal(name, expectedName);
    const p = JSON.parse(options.body), entries = Object.entries(p);
    const result = await db.query(`SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i+1}`).join(',')}) value`, entries.map(([, value]) => value));
    return Response.json(result.rows[0].value);
  };
  const store = rollback.store.createStore(storeConfig, adapter), nextStore = createStore(storeConfig, adapter);
  const oldKey = 'b'.repeat(64);
  await store.create('session', oldKey, { owner: 'Acme' }, 600);
  assert.deepEqual((await store.read('session', oldKey)).value, { owner: 'Acme' });
  await store.revoke(oldKey);
  assert.equal(await store.read('session', oldKey), null);
  assert.equal(urls.length, 4);
  // Shipped source depends on migration 014: before it, the plates RPC does not exist.
  expectedName = 'plates_web_rpc';
  await assert.rejects(nextStore.read('session', oldKey), /upstream_unavailable/);
  expectedName = 'keel_web_rpc';

  await db.query(`SELECT public.keel_web_rpc('create','session',$1,'Acme',null,'1',600)`, [key]);
  const preserved = (await db.query('SELECT * FROM keel_private.web_records')).rows;
  const migration = await readFile(new URL('014-plates-names.sql', directory), 'utf8');
  // A late missing prerequisite must roll back every earlier alias creation.
  await db.exec('ALTER FUNCTION public.keel_run_history(text,text,text,integer) RENAME TO acme_history');
  await assert.rejects(db.exec(migration), /missing or overloaded source RPC/);
  await db.exec('ROLLBACK');
  for (const row of rows) assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1", [row.plates])).rows[0].n, 0);
  await db.exec('ALTER FUNCTION public.acme_history(text,text,text,integer) RENAME TO keel_run_history');
  await db.exec(migration);
  for (const row of rows) {
    const current = (await db.query(`SELECT prosrc, proargnames, proargtypes::text, proacl::text, proconfig, prosecdef, pg_get_function_arguments(oid) args FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1`, [row.plates])).rows[0];
    assert.deepEqual(current, before.get(row.id), row.id);
    const legacy = (await db.query(`SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1`, [row.keel])).rows[0];
    assert.match(legacy.prosrc, new RegExp(`^SELECT public\\.${row.plates}\\(`));
    for (const name of [row.plates, row.keel]) {
      const permissions = (await db.query(`SELECT has_function_privilege('anon',oid,'EXECUTE') anon, has_function_privilege('authenticated',oid,'EXECUTE') authenticated, has_function_privilege('service_role',oid,'EXECUTE') service FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1`, [name])).rows[0];
      assert.deepEqual(permissions, { anon: false, authenticated: false, service: true });
    }
  }
  // After the real migration, the shipped store and the rollback baseline share rows.
  expectedName = 'plates_web_rpc';
  await nextStore.create('session', oldKey, { owner: 'Acme shipped' }, 600);
  assert.deepEqual((await nextStore.read('session', oldKey)).value, { owner: 'Acme shipped' });
  expectedName = 'keel_web_rpc';
  assert.deepEqual((await store.read('session', oldKey)).value, { owner: 'Acme shipped' });
  await store.revoke(oldKey);
  expectedName = 'plates_web_rpc';
  assert.equal(await nextStore.read('session', oldKey), null);
  for (const name of ['keel_web_rpc','plates_web_rpc']) assert.deepEqual((await db.query(`SELECT public.${name}('read','session',$1) value`, [key])).rows, [{ value: { value: 'Acme', version: 1 } }]);
  const k = `'${key}'`;
  const calls = {
    keel_model_credential_read: `${k},${k},${k},1`,
    keel_web_rpc: `'read','session',${k}`,
    keel_home_cache_rpc: `'read',${k}`,
    keel_home_quota_rpc: `'read',${k}`,
    keel_home_cursor_rpc: `${k},${k}`,
    keel_decision_rpc: `'read',${k},${k}`,
    keel_walk_rpc: `'read',${k},${k},${k}`,
    keel_media_rpc: `'list',${k},${k},1`,
    keel_connection_rpc: `'metadata',${k},${k}`,
    keel_job_rpc: `'read',${k},${k},'{}'::jsonb`,
    keel_fleet_rpc: `'read',${k},${k},1`,
    keel_model_rpc: `'read',${k},${k},1,${k},'{}'::jsonb`,
    keel_editor_draft_rpc: `'read',${k}`,
    keel_night_retry_rpc: `'read',${k},${k},'${JSON.stringify({project:key,actor:1})}'::jsonb`,
    keel_run_history: `${k},${k}`,
  };
  assert.equal(Object.keys(calls).length, rows.length);
  await db.exec('SET ROLE service_role');
  for (const row of rows) {
    const oldResult = await db.query(`SELECT public.${row.keel}(${calls[row.keel]}) value`);
    const newResult = await db.query(`SELECT public.${row.plates}(${calls[row.keel]}) value`);
    assert.deepEqual(newResult.rows, oldResult.rows, row.id);
  }
  await db.exec('RESET ROLE');
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT * FROM keel_private.web_records')).rows, preserved);
  await db.exec('SET ROLE service_role');
  await db.query(`SELECT public.plates_web_rpc('revoke','session',$1)`, [key]);
  assert.deepEqual((await db.query(`SELECT public.keel_web_rpc('read','session',$1) value`, [key])).rows, [{ value: null }]);
  await db.exec('RESET ROLE');
  await db.exec('DROP FUNCTION public.plates_web_rpc(text,text,text,text,text,text,integer,bigint)');
  await assert.rejects(db.exec(migration), /missing forwarding target/);
  await db.exec('ROLLBACK');

});


test('neither release retries a failed or ambiguous mutation under another RPC alias', async t => {
  const rollback = await nameBaseline(t, { cookies: false, database: true });
  for (const [{ createStore }, name] of [[await import('../lib/web/store.mjs'), 'plates_web_rpc'], [rollback.store, 'keel_web_rpc']]) for (const status of [404, 503]) {
    const requests = [];
    const store = createStore(storeConfig, async url => {
      requests.push(url); return new Response('{}', { status });
    });
    await assert.rejects(store.create('session', 'a'.repeat(64), { owner: 'Acme' }, 600));
    assert.deepEqual(requests, [`https://acme.supabase.co/rest/v1/rpc/${name}`]);
  }
});

test('016 lets sessions live a year and nothing else', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const files = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort();
  const migration = await readFile(new URL('016-long-sessions.sql', directory), 'utf8');
  const signature = '(text,text,text,text,text,text,integer,bigint)';
  const fact = name => db.query(`SELECT p.prosrc, p.proargnames, p.proargtypes::text, p.proacl::text, p.proconfig, p.prosecdef, p.proowner, l.lanname, pg_get_function_arguments(p.oid) args
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1)`, [`public.${name}${signature}`]).then(r => r.rows[0]);
  const call = (name, operation, kind, key, seconds, version = 0) => db.query(`SELECT public.${name}($1,$2,$3,$4,null,'1',$5,$6) value`, [operation, kind, key, operation === 'renew' ? null : 'Acme', seconds, version]);
  const key = n => String(n).repeat(64);
  // Before 014 there is no plates_web_rpc to change: 016 refuses and leaves nothing.
  for (const file of files.filter(f => f < '014-')) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  await assert.rejects(db.exec(migration), /apply 014-plates-names\.sql first/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regprocedure('public.plates_web_rpc(text,text,text,text,text,text,integer,bigint)') fn")).rows[0].fn, null);
  for (const file of files.filter(f => f >= '014-' && f < '016-')) await db.exec(await readFile(new URL(file, directory), 'utf8'));
  // Before 016 the store refuses any lifetime over eight hours, sessions included.
  await db.exec('SET ROLE service_role');
  await assert.rejects(call('plates_web_rpc', 'create', 'session', key(1), 2592000), /invalid storage operation/);
  await db.exec('RESET ROLE');
  const before = { plates: await fact('plates_web_rpc'), keel: await fact('keel_web_rpc') };
  await db.exec('SET ROLE service_role');
  await call('plates_web_rpc', 'create', 'record', key(9), 600);
  await db.exec('RESET ROLE');
  const kept = (await db.query('SELECT kind, key, value, version FROM keel_private.web_records ORDER BY kind, key')).rows;
  await db.exec(migration);
  const after = { plates: await fact('plates_web_rpc'), keel: await fact('keel_web_rpc') };
  // Only the bound changes; the forwarder, grants, owner and security stay.
  assert.equal(after.plates.prosrc, before.plates.prosrc.replace('p_seconds < 0 or p_seconds > 28800\n',
    "p_seconds < 0\n    or p_seconds > (case when p_kind = 'session' then 31536000 else 28800 end)\n"));
  assert.notEqual(after.plates.prosrc, before.plates.prosrc);
  assert.deepEqual({ ...after.plates, prosrc: null }, { ...before.plates, prosrc: null });
  assert.deepEqual(after.keel, before.keel);
  assert.equal(after.keel.prosrc, 'SELECT public.plates_web_rpc($1, $2, $3, $4, $5, $6, $7, $8)');
  for (const name of ['plates_web_rpc', 'keel_web_rpc']) {
    const permissions = (await db.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') anon, has_function_privilege('authenticated',$1,'EXECUTE') authenticated, has_function_privilege('service_role',$1,'EXECUTE') service`, [`public.${name}${signature}`])).rows[0];
    assert.deepEqual(permissions, { anon: false, authenticated: false, service: true }, name);
  }
  await db.exec('SET ROLE service_role');
  // A session may live a year, through either name, and renew and CAS within it.
  for (const [name, n] of [['plates_web_rpc', 2], ['keel_web_rpc', 3]]) {
    assert.deepEqual((await call(name, 'create', 'session', key(n), 31536000)).rows[0].value, { value: 'Acme', version: 1 });
    assert.deepEqual((await call(name, 'renew', 'session', key(n), 2592000, 1)).rows[0].value, { value: 'Acme', version: 1 });
    assert.deepEqual((await call(name, 'cas', 'session', key(n), 31536000, 1)).rows[0].value, { value: 'Acme', version: 2 });
    await assert.rejects(call(name, 'create', 'session', key(4), 31536001), /invalid storage operation/);
  }
  // Attempts and versioned records keep eight hours.
  for (const kind of ['attempt', 'record']) {
    await assert.rejects(call('plates_web_rpc', 'create', kind, key(5), 28801), /invalid storage operation/, kind);
    await assert.rejects(call('keel_web_rpc', 'create', kind, key(5), 31536000), /invalid storage operation/, kind);
    await assert.rejects(call('plates_web_rpc', 'cas', kind, key(9), 28801, 1), /invalid storage operation/, kind);
  }
  assert.deepEqual((await call('plates_web_rpc', 'create', 'attempt', key(6), 28800)).rows[0].value, { value: 'Acme', version: 1 });
  await db.exec('RESET ROLE');
  const lifetime = (await db.query(`SELECT extract(epoch FROM expires_at - clock_timestamp())::int s FROM keel_private.web_records WHERE kind='session' AND key=$1`, [key(2)])).rows[0].s;
  assert.ok(lifetime > 31535000 && lifetime <= 31536000, String(lifetime));
  await db.exec('SET ROLE anon');
  await assert.rejects(call('plates_web_rpc', 'read', 'session', key(2), 0), /permission denied/);
  await db.exec('RESET ROLE');
  // Re-running changes nothing and keeps every row.
  const rowsBefore = (await db.query('SELECT kind, key, value, version FROM keel_private.web_records ORDER BY kind, key')).rows;
  assert.deepEqual(rowsBefore.filter(r => r.key === key(9)), kept.filter(r => r.key === key(9)));
  await db.exec(migration);
  assert.deepEqual(await fact('plates_web_rpc'), after.plates);
  assert.deepEqual(await fact('keel_web_rpc'), after.keel);
  assert.deepEqual((await db.query('SELECT kind, key, value, version FROM keel_private.web_records ORDER BY kind, key')).rows, rowsBefore);
});
