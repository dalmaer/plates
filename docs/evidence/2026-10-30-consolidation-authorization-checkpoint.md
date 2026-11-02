# Consolidation authorization checkpoint

Local implementation after checkpoint `2a40a484`, 30 October 2026. This is an
unpublished branch checkpoint, not deployment, activation, import or cutover proof.
The [comparison inventory](../research/2026-10-30-plates-orchestration-boundary.md)
records the build-versus-adopt boundary. The [continuous-project evaluation](../research/2026-10-30-continuous-project-evaluation.md)
audits recovery, learning, conversations, Mission Control and multi-person authority
against repository code and gives falsifiable acceptance scenarios. Further general executor and migration
work is paused for that comparison; existing services and routines keep operating.

## Implemented scope

- Observation-only host enrollment and exact apply/revoke, encrypted grant/report
  storage, atomic sequence/digest replay handling and existing Routines/Activity
  projection. Current actor/session/project and restore checks constrain reports
  and final reads. Reports contain typed metadata, not tasks, paths or quota.
- Explicit personal funding records in the existing credential domain and
  reservation/admission path, with unchanged default legacy behavior. This is a
  service/store foundation; HTTP trusted-source wiring and personal funding
  enrollment/choice UI remain unimplemented. No browser
  assertion creates an account binding, grant or trusted capacity source.
- Private Learning originals, exact redacted copies, frozen audiences, durable
  original receipts and revocation of future catalogue reads. Existing owner and
  workspace/project restrictions remain. Already delivered content is not recalled.
- Codex 0.164.0 offline-inspected read protocol, conservative quota normalization
  and trusted recommendation-service composition. Tests start fake processes;
  no actual Codex account or quota is read. Current hosted provider descriptors
  do not support Codex subscriptions. The composition service withholds all
  available-choice attestations until checked policy-selection context is
  implemented; this and eligible descriptor integration remain code work.
- Strict dormant policy and deterministic explicit-snapshot import preview.
  No apply backend, CLI import verb, durable import store or execution was added.

Migrations 015–017 are source files only. Their real SQL is exercised through
synthetic PGlite transports; no migration was applied to a user or hosted database.
The host bridge has a private API/Setup status and pure redaction helper; an actual
host upload client and selected-source walk remain work. General routine execution,
BenOS event/effect adapters, comparison/cutover/rollback and retirement remain
unimplemented, rather than being described as permission blockers.

> **2026-11-02 note:** the three migrations recorded here as 015–017 were renumbered
> after main shipped `015-push.sql` and `016-long-sessions.sql`. They are now
> `017-private-lessons.sql`, `018-host-observations.sql` and `019-personal-funding.sql`
> (personal funding last, because it replaces live public RPCs). The record above
> describes the files under their names at the time.

## Review and focused proof

Builders ran affected files only. The conductor and independent reviewers read
actual service, SQL, process and HTTP paths and retained initial reproductions.

| Scope | Local result before the combined checkpoint |
| --- | --- |
| Private Learning, old Learning/migration and client interactions | 39/39 passed; conductor independently checked the five SQL/service/HTTP tests |
| Personal funding and original-response recovery | Builder 56/56; independent real SQL/service 9/9 and legacy regressions 63/63 passed |
| Policy and read-only import preview | 20/20 passed; conductor independently reran all 20 |
| Host bridge, management/set/restore compatibility | 31/31 passed; independent bridge review ran 11/11 before one additional bound test, with production code unchanged |
| Codex process protocol, recommendation service and existing advice surfaces | Final builder 30/30; independent protocol 9/9 and service/surfaces 21/21 passed |

Review corrected these boundaries before freezing code:

- Funding identity evidence and shorter provider/envelope expiry must survive
  through SQL begin. A known funding refusal releases only its unspent reservation;
  an uncertain response retains the original hold.
- Renewing a same-account grant must not strand the original response, and enabling
  personal funding must not retarget or block an older legacy attempt's recovery.
- Codex authorization callbacks and descendant processes share a bounded deadline;
  a parent exiting while a descendant holds pipes cannot hang the reader.
- Host grant/session revocation or expiry during an asynchronous history read
  suppresses previously read observations at the final disclosure boundary.
- Advisory service eligibility must honor the complete effective model policy,
  not merely a matching candidate name. Unsupported task-policy combinations
  cannot become authorized choices through a trusted profile adapter.

All source examples are synthetic Acme data. Logs are retained outside the
checkout in this task directory. Earlier passing gates do not cover later edits.

The first frozen checkpoint was `8d36146fc38bd0a02ad16cae958deef91629b1d4`:

- Typecheck passed (`authorization-typecheck-8d36146f.log`).
- An offline installed-package walk from that exact Git archive passed
  (`packed-authorization-walk.log`), including observation privacy, unavailable
  local authority, packaged default-off transports and migrations, and dormant
  import policy. This is synthetic package proof, not activation.
- The focused preflight passed 302 of 303 tests. Its guide convention rejected
  two inline error identifiers as undocumented measures. The guide was corrected;
  the six guide tests and roadmap/render/inbox/whitespace guards then passed.
  Both `authorization-focused-final.log` and `authorization-guide-correction.log`
  retain that sequence; the first command is not reported as successful.
- The full gate ran 3,901 tests: 3,895 passed, two failed and four opt-in Docker
  tests were skipped (`authorization-full-8d36146f.log`). The failures identified
  missing canonical private-SQL name inventory and a funding expiry test whose
  wall-clock deadline could elapse before its intended reserve-to-begin boundary.
  Neither failure is hidden by the earlier passing subsets. Corrections and their
  final validation are recorded separately below.

The corrections preserve runtime SQL and authorization behavior. Fourteen new
private database identities are inventoried under the existing held schema, and
two dynamic compatibility prefixes are pinned to exact source lines. The rendered
names table and only its lock entry were refreshed. Funding tests now share a
controlled service/SQL clock and advance it after asserting the reserved state;
the renewal case also proves stale recovery fails before same-account renewal.
Independent review found no weakened assertions or SQL predicates.

Focused correction proof: funding 9/9 and final names 5/5 passed; render and
whitespace checks passed. The initial names/rename batch retained 121 passes and
two failures: an overly broad new negative-control assertion, subsequently
corrected, and an npm-pack test unable to write the sandboxed npm log directory.
The other 117 rename tests passed. Logs are `funding-deterministic-tests.log`,
`names-safeguard-tests.log`, `names-safeguard-final.log` and
`names-render-check.json`. The final integrated checkpoint uses the same approved
execution environment as the initial full gate; no unsuccessful run is erased.

At `7a4c61cdf3ed7b2aa7a9974490210a4060b387ae`, the integrated gate ran
3,901 tests: 3,892 passed, five failed and four opt-in Docker tests were skipped
(`authorization-full-7a4c61cd.log`). All five failures exposed dependent source
pins after the names inventory changed. The historical 0.8.34 retry fixture now
retains the exact original names blob from release `94ae6ac1`; its canonical
production retry closure and authority remain unchanged. The current web coverage
inventory separately records the reviewed names table's new SHA-256. A repository
search found no other stale current-source pins. The 47 night-retry, operation
coverage and names tests passed (`name-closure-correction-tests.log`). Typecheck
and the installed-package walk had passed at `7a4c61cd`. These corrections receive
their own final integrated validation; the second gate is not called successful.

## Final verified checkpoint

Code revision `b48b3a6dcbe700fae789f5a9865e80cfd4059c77`, checked on
30 October 2026 with a clean working tree:

| Command or check | Result |
| --- | --- |
| `npm run check` | Exit 0: 3,901 tests, 3,897 passed, zero failures, four opt-in Docker skips; roadmap, render and inbox guards passed |
| `npm run typecheck` | Exit 0 |
| Offline Git-archive/package/install Acme walk at this exact revision | Passed; existing observation/privacy/usage/recommendation behavior, dormant policy and default-off checkpoint modules packaged |
| Independent review | Clear on funding timing correction, held names inventory, retained historical retry bytes and current capability coverage pin |

Logs: `authorization-full-b48b3a6d.log`,
`authorization-typecheck-b48b3a6d.log`, and
`packed-authorization-walk-b48b3a6d.log`. The gate's hygiene summary reported no
flaky or slower test among eligible observations, with four busy runs omitted.
Only documentation evidence was changed after this verified code revision.
Final documentation checks passed: 44 roadmap/guide tests, roadmap/render/inbox
guards, whitespace checks and all 59 relative links across the three audit records.
The documentation log is `evaluation-doc-final.log` with the three
`evaluation-*-final.log` guard logs.

The original Plates checkout remained at `0165c290` with its 48 pre-existing
untracked paths; Switchboard remained clean at `a6651db5`; the separate
agent-quality checkout remained clean at `9f8c17ad`. This branch is local and
unpublished. No production database migration or runtime activation was tested.

Independent read-only audits covered execution/recovery, learning/identity and
web/collaboration. The evaluation document then received a separate source review;
its reconnect scenario and failed-gate record were corrected and cleared. The
44 roadmap/guide tests passed and 57 relative links resolved before final freeze.
`plates retro --since 2a40a484 --json` completed as a read-only worksheet; no
compatible session transcript was found, so session signal counts are unavailable.
Two review candidates are retained without applying a new rule: include canonical
name inventory in migration preflight, and use deterministic reserve/begin clock
boundaries in SQL expiry tests. No lesson was automatically promoted.

## Completion boundary

The checkpoint completes the listed local code and its recorded checks. It does
not complete phases 137–141 or establish live readiness. No external installation,
account enrollment, permission expansion, paid run, publishing, merge, deployment,
active routine change or destructive migration occurred.

The next decision is whether Plates retains policy, funding, evidence and durable
intent while adopting an external session executor. A pinned read-only API-contract
comparison can answer the design fit before an installation or live trial. Real
activation would separately require an exact host/source, identity, storage/restore
and capability review, with any runtime or model allowance stated concretely.
