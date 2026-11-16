// Optional stores can be installed after the public RPC rename. Local PGlite
// only: both callers execute real SQL, with the original role boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const directory = new URL('../lib/web/migrations/', import.meta.url);
const repair = '023-late-rpc-names.sql';
const proof = new URL('../docs/evidence/2026-11-15-web-late-rpc-names-hosted-proof.sql', import.meta.url);
const key = `'${'a'.repeat(64)}'`;
const calls = {
  walk_rpc: `'read',${key},${key},${key}`,
  media_rpc: `'list',${key},${key},1`,
  run_history: `${key},${key}`,
  connection_rpc: `'metadata',${key},${key}`,
  job_rpc: `'read',${key},${key},'{}'::jsonb`,
  fleet_rpc: `'read',${key},${key},1`,
  model_rpc: `'read',${key},${key},1,${key},'{}'::jsonb`,
  model_credential_read: `${key},${key},${key},1`,
  editor_draft_rpc: `'read',${key}`,
  night_retry_rpc: `'read',${key},${key},'{"project":${JSON.stringify('a'.repeat(64))},"actor":1}'::jsonb`,
};
async function setup(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const files = (await readdir(directory)).filter(f => f.endsWith('.sql')).sort();
  const apply = async file => {
    const before = file === repair ? await facts(db) : [];
    const result = await db.exec(await readFile(new URL(file, directory), 'utf8'));
    if (file === repair) {
      const after = await facts(db);
      for (const suffix of Object.keys(calls)) {
        const old = before.find(f => f.proname === `keel_${suffix}`);
        if (!old || old.prosrc.startsWith(`SELECT public.plates_${suffix}(`)) continue;
        const current = after.find(f => f.proname === `plates_${suffix}`);
        assert.ok(current, `repair creates plates_${suffix}`);
        for (const field of ['prosrc', 'proargnames', 'proargtypes', 'proacl', 'proconfig', 'prosecdef', 'proowner', 'args'])
          assert.deepEqual(current[field], old[field], `${suffix}: copies ${field} from the installed implementation`);
      }
    }
    return result;
  };
  const range = async (first, last) => { for (const f of files.filter(f => Number(f.slice(0, 3)) >= first && Number(f.slice(0, 3)) <= last)) await apply(f); };
  return { db, apply, range };
}
async function facts(db) {
  return (await db.query(`SELECT proname, prosrc, proargnames, proargtypes::text, proacl::text,
    proconfig, prosecdef, proowner, pg_get_function_arguments(oid) args
    FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname`)).rows;
}

test('night-retry activation proof follows 010 -> 023 -> 013 -> 023', async t => {
  const { db, apply, range } = await setup(t);
  await range(1, 10);
  const admission = (await db.query(`SELECT prosrc FROM pg_proc WHERE oid='public.keel_job_rpc(text,text,text,jsonb)'::regprocedure`)).rows[0].prosrc;
  await apply(repair);
  await apply('013-night-retries.sql');
  const original = await readFile(new URL('../docs/evidence/2026-10-31-web-night-retries-hosted-proof.sql', import.meta.url), 'utf8');
  await assert.rejects(db.exec(original), /the saved delegate is not 010's admission/);
  await apply(repair);
  await assert.rejects(db.exec(original), /public keel_job_rpc is not the 013 wrapper/);
  assert.equal((await db.query(`SELECT prosrc FROM pg_proc WHERE oid='keel_private.job_rpc_before_night(text,text,text,jsonb)'::regprocedure`)).rows[0].prosrc, admission);

  const plan = JSON.parse(await readFile(new URL('../docs/specs/web-activation-plan.json', import.meta.url), 'utf8'));
  const step = plan.steps.find(s => s.migration === '013-night-retries.sql');
  const path = step.proof.match(/docs\/evidence\/[^\s']+\.sql/)[0];
  assert.equal(path, 'docs/evidence/2026-11-15-web-night-retries-after-rpc-names-proof.sql');
  const sql = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const pass = async () => assert.equal((await db.exec(sql)).at(-1).rows[0].result, 'PASS 013-night-retries after-rpc-names hosted proof');
  const rows = async () => {
    const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='keel_private' ORDER BY tablename`)).rows;
    return Promise.all(tables.map(async ({ tablename }) => (await db.query(`SELECT count(*)::int AS n FROM keel_private.${tablename}`)).rows[0].n));
  };
  const before = await rows();
  await pass();
  assert.deepEqual(await rows(), before, 'the proof rolls back its synthetic rows');
  const race = sql.slice(sql.indexOf('/* TWO-CONNECTION RACE'), sql.lastIndexOf('*/'));
  const steps = race.split(/^(?=-- \[\d+\] tab [AB]\b)/m).slice(1);
  assert.equal(steps.length, 5);
  for (const statement of steps) await db.exec(statement.replaceAll('pg_sleep(8)', 'pg_sleep(0)'));
  assert.deepEqual(await rows(), before, 'serial race rehearsal cleans up');
  await pass();

  const signature = '(text,text,text,jsonb)';
  const definition = (await db.query(`SELECT pg_get_functiondef('public.plates_job_rpc${signature}'::regprocedure) AS sql`)).rows[0].sql;
  const forward = `CREATE OR REPLACE FUNCTION public.plates_job_rpc(p_operation text,p_scope text,p_id text,p_data jsonb DEFAULT '{}'::jsonb)
    RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT public.keel_job_rpc($1, $2, $3, $4)'`;
  await t.test('canonical name may forward to the legacy wrapper', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(definition.replace('FUNCTION public.plates_job_rpc(', 'FUNCTION public.keel_job_rpc('));
      await db.exec(forward);
      await pass();
    } finally { await db.exec('ROLLBACK'); }
  });
  const mutations = [
    ['delegate forwarder', `CREATE OR REPLACE FUNCTION keel_private.job_rpc_before_night(p_operation text,p_scope text,p_id text,p_data jsonb DEFAULT '{}'::jsonb)
      RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT public.plates_job_rpc($1, $2, $3, $4)'`, /saved admission delegate is a forwarder/],
    ['wrong delegate body', `CREATE OR REPLACE FUNCTION keel_private.job_rpc_before_night(p_operation text,p_scope text,p_id text,p_data jsonb DEFAULT '{}'::jsonb)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS 'BEGIN RETURN null; END'`, /saved delegate is not 010's admission/],
    ['wrong wrapper body', definition.replace('keel_private.job_rpc_before_night(', 'public.keel_job_rpc('), /does not resolve to the 013 wrapper/],
    ['forwarding cycle', forward, /does not resolve to the 013 wrapper/],
    ['delegate grant', `GRANT EXECUTE ON FUNCTION keel_private.job_rpc_before_night${signature} TO service_role`, /service_role can execute the saved admission delegate/],
    ['browser grant', `GRANT EXECUTE ON FUNCTION public.plates_job_rpc${signature} TO authenticated`, /a browser role can execute public.plates_job_rpc/],
    ['table grant', 'GRANT SELECT ON keel_private.night_retries TO service_role', /service_role holds a privilege/],
  ];
  for (const [name, mutation, error] of mutations) await t.test(name, async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(mutation);
      await assert.rejects(db.exec(sql), error);
    } finally { await db.exec('ROLLBACK'); }
  });
});
async function verify(db) {
  const all = await facts(db);
  for (const [suffix, args] of Object.entries(calls)) {
    const legacy = all.find(f => f.proname === `keel_${suffix}`), current = all.find(f => f.proname === `plates_${suffix}`);
    assert.ok(current, `plates_${suffix} exists`);
    assert.match(legacy.prosrc, new RegExp(`^SELECT public\\.plates_${suffix}\\(`));
    for (const field of ['proargnames','proargtypes','proacl','proowner','proconfig','prosecdef','args']) assert.deepEqual(current[field], legacy[field], `${suffix}: ${field}`);
    for (const prefix of ['keel', 'plates']) {
      const permissions = (await db.query(`SELECT has_function_privilege('anon',oid,'EXECUTE') anon,
        has_function_privilege('authenticated',oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',oid,'EXECUTE') service
        FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1`, [`${prefix}_${suffix}`])).rows;
      assert.deepEqual(permissions, [{ anon: false, authenticated: false, service: true }]);
    }
    await db.exec('SET ROLE service_role');
    assert.deepEqual((await db.query(`SELECT public.plates_${suffix}(${args}) value`)).rows,
      (await db.query(`SELECT public.keel_${suffix}(${args}) value`)).rows, suffix);
    await db.exec('RESET ROLE');
  }
  // Exercise shared data and revision fencing, not just equal empty reads.
  const id = `'${'b'.repeat(64)}'`;
  await db.exec('SET ROLE service_role');
  const read = async prefix => (await db.query(`SELECT public.${prefix}_walk_rpc('read',${id},${key},${key}) value`)).rows[0].value;
  const revision = (await read('plates'))?.revision ?? 0;
  const save = async (prefix, expected, value) => (await db.query(`SELECT public.${prefix}_walk_rpc('save',${id},${key},${key},$1,${key},$2) value`, [expected, value])).rows[0].value;
  assert.equal((await save('plates', revision, 'Acme current')).revision, revision + 1);
  assert.equal((await read('keel')).value, 'Acme current');
  assert.deepEqual(await save('keel', revision, 'Acme stale'), { conflict: true });
  assert.equal((await save('keel', revision + 1, 'Acme legacy')).revision, revision + 2);
  assert.equal((await read('plates')).value, 'Acme legacy');
  await db.exec('RESET ROLE');
}

for (const incremental of [false, true]) test(`synthetic recorded baseline, then late 005-013 and 023 support both names (${incremental ? 'incremental' : 'batch'})`, async t => {
  const { db, apply, range } = await setup(t);
  await recordedBaseline(db, range);
  // Repair is safe before any optional stores exist, and after just one exists.
  if (incremental) {
    await apply(repair);
    await db.exec(await readFile(proof, 'utf8')); // All optional stores absent.
    await apply('005-walk-drafts.sql'); await apply(repair);
    await db.exec(await readFile(proof, 'utf8')); // Only one store installed.
    await db.exec(`SET ROLE service_role; SELECT public.plates_walk_rpc('read',${key},${key},${key}); RESET ROLE;`);
  }
  // 005 overwrites its legacy forwarder; 010/013 replace the job implementation.
  for (let n = 5; n <= 13; n++) { await range(n, n); if (incremental) await apply(repair); }
  await apply(repair);
  await verify(db);
  await db.exec(await readFile(proof, 'utf8'));
  const before = await facts(db); await apply(repair);
  assert.deepEqual(await facts(db), before, '023 repeats without changing implementations or grants');
});

test('original migration order keeps both names and newer core RPCs unchanged', async t => {
  const { db, apply, range } = await setup(t);
  await range(1, 21);
  const before = await facts(db);
  await apply(repair); await verify(db);
  assert.deepEqual(await facts(db), before, '023 does not downgrade 016, 020 or 021');
  // Supported replay overwrites both legacy forwarders; 023 must restore them.
  await apply('005-walk-drafts.sql'); await apply('013-night-retries.sql');
  await apply(repair); await verify(db);
  assert.deepEqual(await facts(db), before);
});

// The records cannot be replayed literally with shipped 014. Prove the conflict
// separately; do not weaken or patch 014 to make a historical claim pass.
test('unchanged 014 refuses the literal recorded order with 005-013 absent', async t => {
  const { db, range } = await setup(t);
  await range(1, 4);
  const before = await facts(db);
  await assert.rejects(range(14, 14), /missing or overloaded source RPC/);
  await db.exec('ROLLBACK');
  assert.deepEqual(await facts(db), before);
});

async function recordedBaseline(db, range) {
  // Synthetic retained-state fixture, NOT evidence of how production reached it.
  // Use a separate local database to obtain 014's actual core definitions/grants,
  // then discard ALL optional stores. The unmodified historical files run here.
  const donor = new PGlite();
  let core;
  try {
    await donor.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    for (const file of (await readdir(directory)).filter(f => f < '015-').sort())
      await donor.exec(await readFile(new URL(file, directory), 'utf8'));
    core = (await donor.query(`SELECT pg_get_functiondef(oid) definition,
      proname, pg_get_function_identity_arguments(oid) args
      FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname ~ '^(plates|keel)_(web|home_cache|home_quota|home_cursor|decision)_rpc$' ORDER BY proname DESC`)).rows;
  } finally { await donor.close(); }
  await range(1, 4);
  for (const { definition, proname, args } of core) {
    await db.exec(definition);
    await db.exec(`REVOKE ALL ON FUNCTION public.${proname}(${args}) FROM public,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.${proname}(${args}) TO service_role;`);
  }
  await range(17, 19);
  assert.equal((await facts(db)).some(f => f.proname === 'keel_walk_rpc'), false);
}

test('023 refuses overloads and signature drift atomically, including an existing forwarder', async t => {
  const { db, apply, range } = await setup(t);
  await range(1, 13); await apply(repair);
  const signature = 'text,text,text,text,bigint,text,text';
  const before = await facts(db);
  for (const prefix of ['keel', 'plates']) {
    const name = `${prefix}_walk_rpc`;
    const definition = (await db.query(`SELECT pg_get_functiondef('public.${name}(${signature})'::regprocedure) definition`)).rows[0].definition;
    const mutations = [
      ['overload', `CREATE FUNCTION public.${name}(integer) RETURNS jsonb LANGUAGE sql AS 'SELECT null::jsonb'`, /overloaded RPC/],
      ['argument type', definition.replace('p_expected bigint', 'p_expected integer'), /unexpected RPC contract/],
      ['argument name', definition.replaceAll('p_expected', 'acme_expected'), /unexpected RPC contract/],
      ['default', definition.replace('DEFAULT NULL::bigint', 'DEFAULT 3'), /unexpected RPC contract/],
      ['return type', `CREATE FUNCTION public.${name}(p_operation text,p_id text,p_scope text,p_project text,p_expected bigint DEFAULT null,p_digest text DEFAULT null,p_value text DEFAULT null) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT null::text'`, /unexpected RPC contract/],
      ['security', definition.replace('SECURITY DEFINER', 'SECURITY INVOKER'), /unexpected RPC contract/],
    ];
    for (const [kind, sql, error] of mutations) await t.test(`${prefix}: ${kind}`, async () => {
      await db.exec('BEGIN');
      if (kind !== 'overload') await db.exec(`DROP FUNCTION public.${name}(${signature})`);
      await db.exec(sql);
      await assert.rejects(apply(repair), error);
      await db.exec('ROLLBACK');
      assert.deepEqual(await facts(db), before);
    });
  }
  await t.test('a forwarder without its target is refused', async () => {
    await db.exec(`BEGIN; DROP FUNCTION public.plates_walk_rpc(${signature})`);
    await assert.rejects(apply(repair), /missing forwarding target/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await facts(db), before);
  });
  await t.test('a changed source signature is refused even before the target exists', async () => {
    await db.exec(`BEGIN; DROP FUNCTION public.plates_walk_rpc(${signature}); DROP FUNCTION public.keel_walk_rpc(${signature});
      CREATE FUNCTION public.keel_walk_rpc(integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT null::jsonb'`);
    await assert.rejects(apply(repair), /unexpected RPC contract/);
    await db.exec('ROLLBACK');
    assert.deepEqual(await facts(db), before);
  });
});
