// Guard for shared PGlite migration snapshots: SQL migrations run once per schema
// target via dumpDataDir/loadDataDir, while restored instances stay isolated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const TARGET_TESTS = [
  'tests/web-attach-operations.test.mjs',
  'tests/web-hosted-proofs.test.mjs',
  'tests/web-attach-operation-store.test.mjs',
  'tests/web-attach-controller.test.mjs',
];

test('shared PGlite helper builds migration snapshots in one pass and isolates restored instances', async t => {
  const helper = await import('./helpers/web-pglite.mjs');
  const files = await helper.listMigrationFiles();
  assert.ok(files.includes('013-night-retries.sql'));
  const latest = files.at(-1);

  await helper.primeMigratedSnapshots(['013-night-retries.sql', latest]);
  const afterPrime = helper.pgliteSnapshotStats();
  assert.equal(afterPrime.donorBoots, 1, 'multiple schema targets share one incremental donor pass');
  assert.equal(afterPrime.sqlFilesExecuted, files.length, 'each migration SQL file executes at most once');
  assert.equal(afterPrime.snapshotsCaptured, 2);

  const pre14 = await helper.restoreMigratedPGlite({ upTo: '013-night-retries.sql' });
  t.after(() => pre14.closed ? null : pre14.close());
  assert.equal((await pre14.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'plates_job_rpc'")).rows[0].n, 0);

  const first = await helper.restoreMigratedPGlite();
  t.after(() => first.closed ? null : first.close());
  const roles = (await first.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY 1")).rows.map(r => r.rolname);
  assert.deepEqual(roles, ['anon', 'authenticated', 'service_role']);
  assert.equal((await first.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'plates_job_rpc'")).rows[0].n, 1);
  await first.exec('CREATE TABLE public.acme_snapshot_probe (id integer PRIMARY KEY); INSERT INTO public.acme_snapshot_probe VALUES (1);');

  const second = await helper.restoreMigratedPGlite();
  t.after(() => second.closed ? null : second.close());
  assert.equal((await second.query("SELECT to_regclass('public.acme_snapshot_probe') AS rel")).rows[0].rel, null, 'DDL and rows in one instance never leak to another');

  const afterRestores = helper.pgliteSnapshotStats();
  assert.equal(afterRestores.donorBoots, 1);
  assert.equal(afterRestores.sqlFilesExecuted, files.length);
  assert.equal(afterRestores.restores, afterPrime.restores + 3);

  await assert.rejects(helper.restoreMigratedPGlite({ upTo: '999-acme-missing.sql' }), /unknown migration target/);
});

test('sharedMigratedPGlite reuses one migrated instance per target until closed', async t => {
  const helper = await import('./helpers/web-pglite.mjs');
  t.after(() => helper.closeSharedMigratedPGlites());
  const a = await helper.sharedMigratedPGlite({ upTo: '021-attach-outcomes.sql' });
  const b = await helper.sharedMigratedPGlite({ upTo: '021-attach-outcomes.sql' });
  assert.equal(a, b);
  await helper.closeSharedMigratedPGlites();
  assert.equal(a.closed, true);
  const c = await helper.sharedMigratedPGlite({ upTo: '021-attach-outcomes.sql' });
  assert.notEqual(c, a);
  assert.equal(c.closed, false);
});

test('web PGlite suites restore migrated snapshots instead of replaying SQL migrations per test', async () => {
  for (const rel of TARGET_TESTS) {
    const source = await readFile(new URL(rel, ROOT), 'utf8');
    assert.match(source, /from ['"]\.\/helpers\/web-pglite\.mjs['"]/, `${rel} uses shared PGlite snapshot helper`);
    assert.doesNotMatch(source, /\bnew PGlite\s*\(/, `${rel} does not cold-boot raw PGlite instances per test`);
  }
});
