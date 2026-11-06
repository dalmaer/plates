// Not now with a reason (plates phases 173, 180): the owner's reason for putting
// an item off is kept with its date, in both stores, and read back after a
// reload. The CLI's file (lib/not-now.mjs) and the hosted store (SQL017, where
// the reason travels inside the sealed record, never as a plain column).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { putOff, readNotNow, notNowFile } from '../lib/not-now.mjs';
import { createNotNowStore } from '../lib/web/not-now-store.mjs';
import { projectHarness } from './helpers/web-projects.mjs';

const TODAY = '2026-11-05', REASON = 'Waiting for the Acme anvil delivery';

test('a reason is kept', async t => {
  // The CLI's store: a file in the plates state directory. Written, then read by a fresh read, as a new run would.
  const dir = await mkdtemp(join(tmpdir(), 'plates-not-now-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { XDG_STATE_HOME: dir, HOME: dir };
  await putOff(env, 'anvils:walk:3', { until: '2026-11-12', reason: REASON, today: TODAY });
  await putOff(env, 'anvils:step:4', { until: '2026-11-12', today: TODAY });
  assert.deepEqual(Object.fromEntries(Object.entries(await readNotNow(env)).map(([k, { at, ...v }]) => [k, v])), { 'anvils:walk:3': { until: '2026-11-12', reason: REASON }, 'anvils:step:4': { until: '2026-11-12' } });
  assert.match(await readFile(notNowFile(env), 'utf8'), new RegExp(REASON), 'kept in the file, beside its date');
  // A reason is one line of at most 300 characters; a longer one is refused, never cut.
  await assert.rejects(putOff(env, 'anvils:walk:5', { until: '2026-11-12', reason: 'x'.repeat(301), today: TODAY }), /at most 300 characters/);

  // The hosted store: SQL017 on PGlite, through the service's own sealing. The table holds ciphertext, digests and the date only.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../lib/web/migrations/017-not-now.sql', import.meta.url), 'utf8'));
  const fetcher = async (url, options) => {
    const p = JSON.parse(options.body), entries = Object.entries(p);
    await db.exec('SET ROLE service_role');
    try {
      const result = await db.query(`SELECT public.plates_not_now_rpc(${entries.map(([key], i) => `${key} => $${i + 1}${key === 'p_until' ? '::date' : ''}`).join(',')}) value`, entries.map(([, value]) => value));
      return Response.json(result.rows[0].value);
    } finally { await db.exec('RESET ROLE'); }
  };
  const { config } = projectHarness();
  const today = new Date().toISOString().slice(0, 10), until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const written = await createNotNowStore(config, fetcher).put(1, 'anvils:walk:3', { until, reason: REASON, today });
  assert.equal(written.reason, REASON);
  // A reload: a new store over the same database reads the reason back.
  assert.deepEqual(await createNotNowStore(config, fetcher).list(1), { 'anvils:walk:3': { until, reason: REASON } });
  const rows = (await db.query('SELECT * FROM plates_home.not_now')).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).toSorted(), ['key', 'scope', 'until', 'updated_at', 'value'], 'no plain reason column');
  assert.ok(!JSON.stringify(rows).includes('Acme anvil'), 'the reason is sealed, never stored as plain text');
  await assert.rejects(createNotNowStore(config, fetcher).put(1, 'anvils:walk:6', { until, reason: 'x'.repeat(301), today }), e => e.code === 'invalid_not_now');
});
