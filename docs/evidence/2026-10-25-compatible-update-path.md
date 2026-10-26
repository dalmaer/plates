# Evidence: phase 131 — compatible updates without unrelated care prerequisites

- Date: 2026-10-25; implementation continued into 2026-10-26 UTC.
- Phase: [131](../phases/131-compatible-updates-have-a-short-installation-path.md).
- Source: base `94248807`, working tree on `codex/phase-131-short-installation`.
- Claim: installation, operational verification and retirement have separate
  evidence; source record checks cannot exempt executable or policy changes.

## Automated checks

Node 24.22.1 was selected explicitly. The conductor independently ran:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/morning.test.mjs tests/night-plan.test.mjs tests/night-plan-preservation.test.mjs
```

Exit 0: 76 passed, zero failed/skipped, 43.820 seconds. Early observations retain
unfinished work; ordinary final readiness and sending remain separate.

The integrated record/workflow/integrator/practice subset initially exited 1.
Its only failure was the practice rule-cause guard: two new conduct rules lacked
their required `why:` rationale. The source block was corrected and rendered;
the targeted practice-rule test then exited 0. This was a code/documentation
correction, not a retry of an unexplained failure. The initial test ledger reported
no flaky or slower test. Builder runs are supplemental, not the integrated gate.

The record-policy builder ran isolated scratch mutations with
`node --import ./tests/helpers/hermetic.mjs --test --test-reporter=spec
--test-name-pattern='<pattern>' tests/record-validation.test.mjs` on Node
24.22.1. Baseline: exit 0, all three selected cases passed. Each mutation failed
at its intended assertion, not import or setup:

| Pattern | Mutation | Exit / observation |
| --- | --- | --- |
| `^semantic allowlist` | Ignore Acceptance body when comparing phases | 1, accepted a changed requirement (`true !== false`) |
| `^mixed policy` | Allow unknown paths in semantic classifier | 1, selected record-checks instead of full-gate |
| `^real reconciliation rejects` | Remove changed-reference contradiction rejection | 1, returned success instead of failure |

Source SHA-256: record classifier
`7ed9d7283ccb27a7247c88bb24671a664093a24e9f0d33c4774eadb0ce668d53`;
record runner `5379e178632b3a1bf88ceb2e71fb78a91df14012cec5cb2a3c94d0532c6af1d6`.
Commands, assertion logs and mutation manifests were retained locally at
`/tmp/plates131-b-negative-pt0f4jr6/`. The conductor inspected these records;
the mutation execution was the builder's. Shared source was not modified.

The reporting builder packed the candidate (`npm pack --ignore-scripts --json
--pack-destination <scratch>`, exit 0) and ran the packed public CLI in a synthetic
Acme consumer. `morning --observation --date 2026-10-26 --json` exited 0 with
pending/failed work retained and readiness false. Each publishing-flag conflict
exited 2; zero GitHub calls and unchanged consumer bytes were observed. That
intermediate package's hash was
`5adaac94a3610af5100e101cac5527f907046566ff00ae66b42903ddba93d0c5`.
It revealed installer help under the wrong topic; the parent moved that paragraph
into `--agent-help fleet`. This intermediate pack is not the final release.

The conductor ran the phase's `npm run check:focused --` proof list, extended with
`tests/record-validation.test.mjs` and `tests/web-operation-coverage.test.mjs`.
Exit 1: 459 tests, 457 passed, two failed. One old fleet assertion prohibited the
new pinned lock observation; it now requires exactly one SHA-bound lock read per
project while still prohibiting migration-source inspection. The second caught
an ambiguous repeated command name in CLI usage, corrected to a single command
with alternative flags. The targeted follow-up
`node --import ./tests/helpers/hermetic.mjs --test
--test-name-pattern='plans only real work|every registered verb and subcommand'
tests/fleet.test.mjs tests/guides.test.mjs` exited 0, both passed. Final full-gate
coverage remains required below; these failures are not erased by that check.

Installer builder proof: 50/50 focused installer/artifact tests passed. Its
scratch-only negative controls removed managed preimage validation, drain checks,
attempted-merge deduplication and exact approval binding in turn. Each selected
test failed at its intended assertion. These are builder-reported mutation results;
the conductor's integrated run independently passed the unmodified installer tests,
including spawned CLI replacement registration after merge and uncertain recovery.

`npm run typecheck` exited 0 on the integrated implementation before the later
usage-only correction. No production or consumer installation was run.

The first full gate exited 1: 3,633 tests, 3,626 passed, three failed, four
skipped; test duration 259.581 seconds. Its seeded stall checks passed and the
ledger reported no flaky/slower tests (one busy run omitted). The failures were
one newly spelled legacy lock path missing from the name guard and two historical
web-retry fixture assertions after the morning script changed. The lock read now
uses the already-selected configuration directory. The historical fixture retains
the original morning bytes from its existing pinned revision; no hosted retry
authority was repinned to current code.

A separate bounded source review then reproduced four installer defects:
receipt read before lock acquisition, inability to refresh proof within an
unchanged intent, a gate run not bound to its candidate/base, and API merge's lack
of an atomic base condition. Earlier happy-path tests did not establish these
boundaries; the affected acceptance boxes were reopened. The replacement merge
transport follows integrate's exact ref lease, retaining a local merge artifact
before publication. Three local bare-Git tests passed, including a concurrent
default-branch advance rejected before publication. This is synthetic transport
evidence, not a live GitHub walk.

After correcting the review findings, the conductor ran the installer, artifact,
conditional-Git, recovery, name guard, retained night-retry, guide and operation
coverage files together with the hermetic Node runner and test-ledger reporter:
exit 0, 148/148 passed in 18.500 seconds, no skipped or failed tests. The ledger
reported no flaky/slower tests. The refreshed-head fixture first needed its new
gate PR binding updated as well as its head/checks; that initial 88/89 result and
the targeted successful correction are retained, rather than treated as a flake.

The publication regression was independently mutation-checked in a scratch copy:
replacing only `--force-with-lease=refs/heads/${plan.defaultBranch}:${plan.base}`
with `--force` made `--test-name-pattern='concurrent base advance'` fail with
`Missing expected rejection`. The unmodified transport and callback tests passed
in the 148-test run. The source owns a durable artifact before publication; the
callback refreshes scope/barrier and records the write intent only after local
Git reads, immediately before the conditional push. Local read failures therefore
remain prepared and can be recovered or explicitly abandoned.

The recovery builder's 39-test proof includes the original concurrent-reader
reproduction, immutable approval plus fresh proof, restoration refusal after an
attempted merge, old-ID/preimage protection, uncertain-enable deduplication and
unrelated default advances. The conductor independently ran those tests in the
integrated 148-test proof. Restoration ends as `aborted-restored`, never installed.
Source or permission changes still preserve a concrete unresolved obligation.

The required final implementation checkpoint is `npm run check` and
`npm run typecheck`. Their results belong to the implementation commit after
these records are written. This phase's new record policy cannot exempt its own
code, workflow, instruction or policy changes from that checkpoint.

## Scope and recovery

The installer retains one original operation in private `.plates/update/operations`
storage. It does not turn a continuation summary into transferable permission.
No scheduled model, climb, improve, retry, dispatch or acceptance transition is
part of installation. Earlier CLI update publication did not provide a durable
installation intent, so this operation family uses the existing private-state
pattern; it is not a claim that the prior CLI already retained these receipts.

The explicit source record policy is narrower than general documentation work.
Free-form next-action edits, new phases, machine-readable proof and changes to
requirements remain broad. Fresh PR reads cover changed references; unchanged
remote history remains a disclosed gap, rather than requiring private fleet
credentials in a pull-request job. Consumers retain their configured gates.

## Historical comparison and real-surface gap

The owner-approved migration retro identified waiting on optimization and final
morning readiness after an update's installation checks as an unnecessary
dependency. The previous migration is historical evidence for that dependency,
not a trial of this new installer. Preparation, review, waiting and installation
durations must remain separate; no total time or cost saving is claimed.

A new real installation through this implementation has not yet been performed.
It requires a concrete compatible update with current source, checks, review and
applicable owner authority. Source tests, a merged implementation or an older
rollout receipt cannot establish that walk, production verification or lived-in
success. The implementation must retain this gap until that evidence exists.
