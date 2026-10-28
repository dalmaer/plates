# Evidence: risk-level evaluation preparation

- Date: 2026-10-28.
- Phase: 132, follow-up measurement preparation only.
- Base: validated and pushed setting/prompt head `b5e2b5362899f454170f33e274e2c0644c88d82e`, including main's phase-119 harness.
- Claim: reproducible preparation and offline scoring work; model behavior remains unmeasured.

The pure `scripts/autonomy-evaluation.mjs` module uses the existing schema-2 record
validator and shared prompt renderer. It prepares Low/Medium, Low/High and
Medium/High comparisons over identical synthetic development cases. The default
has nine cases and five interleaved pairs per case: 270 planned slots. The declared
540-minute total ceiling is not an execution approval or reservation. Currency
stays unknown. No model/API, Docker, credential, network or publication operation
is performed by the preparation/scorer.

`node --import ./tests/helpers/hermetic.mjs --test tests/autonomy-evaluation.test.mjs`
passes nine tests. These include actual existing plan/freeze/inspect/compare calls
in private temporary workspaces. All three comparisons retain missing slots,
unknown costs, inconclusive recommendations and no agent-efficacy claim. Frozen
bytes remain unchanged, no execution directory appears, and budget is unreserved.
The remaining tests use scripted observation fixtures, not live model trials.

Independent review reproduced three measurement bugs before commit: stale gates
survived a later edit, detached preparation/context metadata was trusted, and
successful retries could erase a denial. Added negative controls failed on each
original implementation, then passed after preparation regeneration/digest binding,
state invalidation and persistent denial/uncertainty handling. The original red
output is retained at `/tmp/plates-autonomy-evaluation-review-red.log`; green output
is `/tmp/plates-autonomy-evaluation-review-green.log`. Tests include post-merge edits,
pre-rollback validation, denied-to-retry/merge, unknown-to-retry and later denials.

The scorer never authenticates receipt-shaped references or treats builder claims
as controller evidence. Partial capture produces null totals and completion,
while retaining observed violations. Unknown questions remain unclassified. Every
score explicitly reports unverified offline observations, no behavioral proof and
no promotion. This screen covers interactive, already-authorized tasks with abstract
action names; exact destination/protection/source identity and automated role
behavior require separately bound observations and cases.

The live capture boundary is missing: current execution supports scripted-node-v1
and stdio-v1 artifact checks, not model-turn/tool-decision observation capture.
Prepared records deliberately use an unconfigured provider and unsupported
observation driver. They fail ordinary execution rather than borrowing authority
or pretending that synthetic traces are behavioral evidence. Approved resolved
model/runtime identity, independent capture and acceptance, bounded budget and a
new exact execution proposal remain prerequisites. The initial development cases
are published and cannot be described as held-out evidence.

Read-only GitHub checks on this date still found no PR for the setting branch and
no Plates entry in the connected app's selected repositories. The previous PR API
403 is not a policy-review denial; no denied publication operation was retried.
The existing app installation must include Plates before a new permission check
can support retry. High remains explicitly selected in the primary checkout; no
additional setting or host/security change is part of this evaluation work.

`npm run check:focused -- tests/autonomy-evaluation.test.mjs` passed 122 tests,
zero failed, followed by roadmap/render/inbox/whitespace guards. Independent
review reran the nine evaluation tests successfully and found no outstanding
issues after the corrections. Exact committed-head attestation belongs in the
candidate report. No full-gate or publication result for this follow-up is
implied by the setting branch's earlier validation.
