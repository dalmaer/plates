# Evidence: phase 151 — the activation plan for the hosted workspace

Conductor's checks, 2026-10-31, worktree on `claude/phase-151`. Nothing
contacted Vercel, Supabase or GitHub.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/web-activation-plan.test.mjs tests/surface-budget.test.mjs` | pass | exit 0, 12 of 12 | The 36-step plan in `docs/specs/web-activation-plan.json` covers every G7 phase with a hosted gap, orders prerequisites and migrations, gives every step a rollback and a proof, and starts with the Node 24.22.1 runtime re-check; eight in-memory drifts are each refused. |
| A stale `docs/guide/web-activation.md` (builder) | the test fails | failed | The owner's page can't drift from the plan. |
| `grep` of the plan and guide for hosted URLs, app ids and personal identifiers | none | none | The public repo holds no private instance details. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## Findings for the session

- Hosted proof SQL exists only for migrations 001–005; proofs for 006–014
  are written from the local PGlite proofs before the session.
- Every migration waits for the backup decision (phase 94), step 2.
- Migration 014 belongs to phase 127 (G2); it is the plan's last step so the
  migrations folder is fully accounted for.

## Not yet walked

- ⚑ The owner-attended activation session and a week of use.

Supports **partial** (walk owed).

## Hosted proof SQL for 006–015 (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/web-hosted-proofs.test.mjs tests/web-activation-plan.test.mjs` (conductor) | pass | exit 0, 31 of 31 | Each of the ten `docs/evidence/2026-10-31-web-*-hosted-proof.sql` files runs clean after migrations 001..N on development PGlite, leaves private row counts unchanged, can run twice, and its two-tab race replays and cleans up. |
| Conductor mutation: the jobs proof's row-level-security check replaced with `null` | the wrong-fact test fails | failed (2 of 22), then green restored | A proof that stops checking a fact is caught. |

PGlite stands in plain `anon`, `authenticated` and `service_role` roles. Not
covered: Supabase's real role setup, pooling, real lock waits (races replay
serially) and each migration file's SHA-256, which the step still checks.
The 007 proof runs before 014, whose forwarder for `keel_run_history` is
VOLATILE.

## Session, steps 1 and 2 (2026-10-31)

- **Step 1 stopped before any migration.** The production workspace had
  refused every request since 2026-10-22 22:37 UTC: a same-source redeploy
  set the configured origin to the provider's generated project address,
  which sits behind the provider's own login, while the browser address
  stayed the old one (request logs: last 200 on 2026-10-22, 403
  `invalid_origin` on every request after). With the owner's approval the
  workspace moved to an owner-chosen custom domain: domain added to the
  project, the configured origin changed to it, the same reviewed source
  rebuilt for production. Observed: the sign-in page answers 200, Home and
  `/api/deployment` answer 401 `sign_in_required` signed out. The serving
  Node version is not yet read; that needs the owner signed in, after the
  GitHub App callback is added for the new origin.
- **The database was paused.** The Free plan pauses after a week without
  use, and its host stopped resolving. A workspace that isn't used for a
  week goes dark on Free; step 1 should check the database answers as well
  as the runtime.
- **Step 2 decided by the owner, 2026-10-31:** move the database to the
  provider's Pro plan (from $25 a month: daily backups kept 7 days, no
  inactivity pause) and keep an independent nightly encrypted dump on the
  owner's machine. Snapshot read-back is pending the upgrade.

## Step 1 proof (2026-10-31)

- The owner signed in through the GitHub App at the new origin (callback
  added for it) after the database was resumed; `/api/deployment`, signed
  in, answered: Node `v24.22.2`, Plates CLI `0.8.33`, recovery
  `not-configured`, observed `2026-10-31T06:08:07Z`. Signed out it answers
  401 `sign_in_required`.
- Node 24.22.2 meets the patched 24.22.1 baseline, so the 2026-10-22 runtime
  exception is no longer needed. No exception opt-in is set on the project;
  removing its branch in `lib/web/hosted-runtime.mjs` is a separate reviewed
  change.
- The revision binding reads `unavailable`: it comes from the provider's Git
  commit variable, which a CLI source-archive deployment does not set. The
  provider records the serving deployment's source as `519aa219`; the
  deployment identifiers and the pinned rollback target are in the private
  record.
- Step 2 is decided but not yet proven: the owner resumed the database on
  its current plan for now, and the nightly encrypted copy needs a
  read-only backup login, because the production-only database credentials
  can't be read back from the provider. Migrations wait for it.

## Step 2 proof (2026-10-31)

- A read-only backup login was created in the hosted database with its
  password supplied as a SCRAM verifier (the password exists only in the
  owner's keychain). Read back from the database: it can log in, bypasses row
  security for reading, and holds 4 SELECT grants and no other.
- The first copy, taken through the provider's session pooler and
  age-encrypted on the owner's machine: snapshot `2026-10-31T06:15:02Z`,
  113,408 bytes; decrypted and listed, it holds the 4 private tables with
  their data and 4 functions.
- Open: the nightly schedule and a second copy of the decryption key are the
  owner's to install. The provider upgrade is deferred, so this copy is the
  only backup until then.

## Step 3: migration 004 (2026-10-31)

Run by the conductor in the provider's SQL editor (the owner's session),
the owner attending remotely.

| Did | Expected | Observed |
| --- | --- | --- |
| Precheck: 004's tables and function absent; private tables; role; server | absent, 4, owner | absent, 4, `postgres`, PostgreSQL 17.11 |
| SHA-256 of the editor's text before running | `cfe71228…` (004 at main and at the serving source) | matched, 5,362 bytes |
| Apply `004-decision-operations.sql` unchanged, one transaction | commit | `Success. No rows returned` at about 06:19Z |
| `docs/evidence/2026-10-21-web-decisions-hosted-proof.sql`, text hash checked | no exception; synthetic rows rolled back | `Success` (any failed check raises); role denials for `anon`, `authenticated`, `service_role` included |
| Two-tab reservation race: tab A reserves a project and holds its transaction 8 s; tab B reserves the same project | B waits for A, then conflicts | B started 06:20:42.836, finished 06:20:50.854 (A released 06:20:50.850) with `{"conflict":true}` |
| Race cleanup (fixed synthetic ids) | no rows left | 0 operations, 0 previews |
| Workspace after the migration | unchanged | `/signin` 200, `/` and `/api/deployment` 401 signed out |
| Encrypted backup after the migration | the new tables included | snapshot 06:22:14Z holds both decision tables |

Decision writes stay off (the configuration doesn't enable them), so the
migration enables nothing on its own. Next: step 4, the GitHub App's
Contents write approval.

## Step 4: GitHub App Contents write (2026-10-31)

The conductor changed the App's Contents permission from read-only to read
and write in the owner's browser session, and accepted the request on the
installation ("Read and write access to Contents — Was read-only"; no other
permission changed). Read back from GitHub's installation page: read access
to metadata, read and write access to code, on exactly the two selected
repositories (the public Plates repository and the private workspace
repository). An API read of the installation needs a GitHub App user token;
the owner's CLI token gets 403, the limit recorded on 2026-10-21. Every write
gate stays false.

## Step 5: decision writes (2026-10-31)

- Preview walked with writes off: the owner opened a health proposal's
  decision page and asked for its exact source change. `POST
  /api/projects/<project>/decisions/preview` answered 200; one encrypted
  preview was stored and no operation. The newest reports (26–30 October)
  could not be used: each is over the workspace's 256 KiB per-file limit,
  answered as "a required connection is unavailable" (phase 153 fixes both).
- `decisionWrites: true` was set in the production configuration and the
  same source redeployed; the configuration validates (sign-in page 200,
  signed-out 401). The prior deployment is the rollback target.
- Before this step the workspace's project id moved from its pre-rename
  name to `plates`, in the private manifest and the configuration together.
- The plan now names the capture bucket `plates-captures` and the
  configuration variable `PLATES_WEB_CONFIG`, which is what production reads.
- The owner's real decision (phase 97's walk) followed the same day: the
  25 October proposal declined, commit `f7bf2913`, one committed receipt
  (phase 97 evidence).
