// Phase 151: each migration still to be applied to the hosted database (006–016)
// has a hosted proof SQL ready to paste into the Supabase SQL editor. Here each
// proof runs on a fresh PGlite with migrations 001..N applied, exactly as the
// owner would run it after step N: the single-connection part must pass and leave
// no rows, the two-connection race (a comment in the file) must run and clean up
// when its statements are replayed serially, and one wrong fact per migration must
// make its proof fail. PGlite stands in for Supabase: anon, authenticated and
// service_role are plain roles created here (no BYPASSRLS, no Supabase grants),
// and one connection cannot show real lock waits. Nothing here contacts Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ROOT = new URL('../', import.meta.url);
const MIGRATIONS = new URL('lib/web/migrations/', ROOT);
const EVIDENCE = new URL('docs/evidence/', ROOT);

// One wrong fact per migration: a grant the migration revokes, a missing object,
// or a changed body. Each must be named by the proof's exception.
const PROOFS = [
  { migration: '006-private-media.sql', proof: '2026-10-31-web-media-hosted-proof.sql',
    wrong: 'grant execute on function public.keel_media_rpc(text,text,text,bigint,text,bigint,text,bigint,text,text,text,integer,text,bigint) to authenticated',
    refused: /a browser role can execute public\.keel_media_rpc/ },
  { migration: '007-run-history.sql', proof: '2026-10-31-web-run-history-hosted-proof.sql',
    wrong: 'drop index keel_private.decision_history_scope',
    refused: /missing index keel_private\.decision_history_scope/ },
  { migration: '008-connections.sql', proof: '2026-10-31-web-connections-hosted-proof.sql',
    wrong: 'grant select on keel_private.connection_credentials to service_role',
    refused: /service_role holds a privilege on keel_private\.connection_credentials/ },
  { migration: '009-jobs.sql', proof: '2026-10-31-web-jobs-hosted-proof.sql',
    wrong: 'alter table keel_private.jobs disable row level security',
    refused: /row level security off on keel_private\.jobs/ },
  { migration: '010-fleet-updates.sql', proof: '2026-10-31-web-fleet-updates-hosted-proof.sql',
    wrong: 'drop function public.keel_fleet_rpc(text,text,text,bigint,jsonb)',
    refused: /missing function public\.keel_fleet_rpc/ },
  { migration: '011-model-routing.sql', proof: '2026-10-31-web-model-routing-hosted-proof.sql',
    wrong: 'grant execute on function public.keel_model_credential_read(text,text,text,bigint) to anon',
    refused: /a browser role can execute public\.keel_model_credential_read/ },
  { migration: '012-editor-drafts.sql', proof: '2026-10-31-web-editor-drafts-hosted-proof.sql',
    wrong: 'grant usage on sequence keel_private.editor_draft_generation to service_role',
    refused: /service_role holds a privilege on keel_private\.editor_draft_generation/ },
  { migration: '013-night-retries.sql', proof: '2026-10-31-web-night-retries-hosted-proof.sql',
    wrong: 'grant execute on function keel_private.job_rpc_before_night(text,text,text,jsonb) to service_role',
    refused: /service_role can execute the saved admission delegate/ },
  { migration: '014-plates-names.sql', proof: '2026-10-31-web-plates-names-hosted-proof.sql',
    wrong: 'grant execute on function public.plates_job_rpc(text,text,text,jsonb) to authenticated',
    refused: /a browser role can execute plates_job_rpc/ },
  { migration: '015-push.sql', proof: '2026-10-31-web-push-hosted-proof.sql',
    wrong: 'grant usage on schema plates_push to anon',
    refused: /a browser role can use schema plates_push/ },
  { migration: '016-long-sessions.sql', proof: '2026-10-31-web-long-sessions-hosted-proof.sql',
    wrong: 'grant execute on function public.plates_web_rpc(text,text,text,text,text,text,integer,bigint) to authenticated',
    refused: /a browser role can execute plates_web_rpc/ },
];

const RACE = '/* TWO-CONNECTION RACE';

/** The pasteable part is the whole file (the race is a block comment); the race
 * statements are the numbered `-- [n] tab X` sections inside that comment. */
function parts(text) {
  const start = text.indexOf(RACE);
  if (start < 0) return { race: [] };
  const end = text.lastIndexOf('*/');
  assert.ok(end > start, 'race comment is closed');
  const body = text.slice(start, end);
  const race = [];
  for (const chunk of body.split(/^(?=-- \[\d+\] tab [AB]\b)/m).slice(1)) {
    const [, n, tab] = chunk.match(/^-- \[(\d+)\] tab ([AB])\b/);
    race.push({ n: Number(n), tab, sql: chunk });
  }
  assert.deepEqual(race.map(s => s.n), race.map((_, i) => i + 1), 'race statements are numbered 1..n in order');
  assert.ok(race.some(s => s.tab === 'A') && race.some(s => s.tab === 'B'), 'race uses both tabs');
  return { race };
}

async function database(upTo) {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.includes(upTo), upTo);
  for (const file of files.slice(0, files.indexOf(upTo) + 1)) await db.exec(await readFile(new URL(file, MIGRATIONS), 'utf8'));
  return db;
}

/** Row counts of every private table: a proof must leave each unchanged. */
async function rows(db) {
  const tables = (await db.query(`SELECT format('%I.%I', schemaname, tablename) AS t FROM pg_tables
    WHERE schemaname IN ('keel_private','plates_push') ORDER BY 1`)).rows.map(r => r.t);
  const out = {};
  for (const t of tables) out[t] = (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  return out;
}

const result = results => results.at(-1)?.rows?.[0]?.result;

test('every hosted proof runs clean on its migration', async t => {
  const migrations = (await readdir(MIGRATIONS)).filter(f => /^0(0[6-9]|1\d)-/.test(f)).sort();
  assert.deepEqual(PROOFS.map(p => p.migration), migrations, 'one hosted proof per migration 006 onward');
  const plan = JSON.parse(await readFile(new URL('docs/specs/web-activation-plan.json', ROOT), 'utf8'));
  for (const p of PROOFS) {
    await t.test(p.proof, async () => {
      const text = await readFile(new URL(p.proof, EVIDENCE), 'utf8');
      const passed = `PASS ${p.migration.replace(/\.sql$/, '')} hosted proof`;
      assert.ok(text.startsWith(`-- Hosted proof for lib/web/migrations/${p.migration}`), 'header names its migration');
      for (const said of ['Leaves behind:', 'Expected result:', 'SHA-256']) assert.ok(text.includes(said), said);
      assert.doesNotMatch(text, /supabase\.co|https?:\/\/(?!github\.com\/acme\/)|@[a-z0-9-]+\.[a-z]/i, 'no private identifiers');
      const step = plan.steps.find(s => s.migration === p.migration);
      assert.ok(step?.proof.includes(`docs/evidence/${p.proof}`), 'its plan step names the proof');
      const { race } = parts(text);
      assert.equal(race.length > 0, /race/i.test(step.proof), 'a race exactly where the plan names one');

      const db = await database(p.migration);
      try {
        const before = await rows(db);
        assert.equal(result(await db.exec(text)), passed);
        assert.deepEqual(await rows(db), before, 'the single-connection part leaves no rows');
        // One connection replays the race serially (no lock wait): its SQL must
        // run, its check must hold for the serial order, and cleanup must work.
        for (const s of race) await db.exec(s.sql.replaceAll('pg_sleep(8)', 'pg_sleep(0)'));
        assert.deepEqual(await rows(db), before, 'the race cleans up after itself');
        // Nothing is left behind, so the proof can be run again.
        assert.equal(result(await db.exec(text)), passed);
      } finally { await db.close(); }
    });
  }
});

test('a hosted proof notices a wrong fact', async t => {
  for (const p of PROOFS) {
    await t.test(p.proof, async () => {
      const text = await readFile(new URL(p.proof, EVIDENCE), 'utf8');
      const db = await database(p.migration);
      try {
        await db.exec(p.wrong);
        await assert.rejects(db.exec(text), p.refused);
      } finally { await db.close(); }
    });
  }
});
