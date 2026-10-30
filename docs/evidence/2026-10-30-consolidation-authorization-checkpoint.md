# Consolidation authorization checkpoint

Local implementation after checkpoint `2a40a484`, 30 October 2026. This is an
unpublished branch checkpoint, not deployment, activation, import or cutover proof.
The [comparison inventory](../research/2026-10-30-plates-orchestration-boundary.md)
records the build-versus-adopt boundary. Further general executor and migration
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
checkout in this task directory. The final combined gate and exact revision are
recorded after code freeze; earlier passing gates do not cover these edits.

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
