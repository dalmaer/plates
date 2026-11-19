---
attempt: {"accepted":false,"verified":false,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 197 — bounded AGY review fallback

- Date: 2026-11-18
- Phase: 197
- Revision: base `f4ce7300c639d09365e30789faf64fd2bdb53d5c` plus working tree
- Claim: opt-in AGY integration extends the existing review path without changing
  primary provider defaults, permissions or the original review deadline.

## Automated checks

- `npm run typecheck`: exit 0 during integration; checked JSDoc scope only.
- Focused checkpoint after audit-binding correction: exit 0, 294 tests passed. Command: `npm run check:focused -- tests/agy-review.test.mjs tests/agy-review-runner.test.mjs tests/cross-review.test.mjs tests/workflows.test.mjs`.
- Required integrated checkpoint: `npm run check`; includes source tests, installed
  tests, roadmap, managed render and inbox checks. Its result belongs in the
  commit body; it is not established by the focused tests.
- Capability preflight initially reported loopback `EPERM` in the restricted
  sandbox. The same read-only validation planner under host execution exited 0.
  No assertions were skipped to accommodate the sandbox.

## By hand

- Downloaded the pinned public Linux CLI archive without executing it. SHA-512
  matched the workflow pin; `tar -tzf` listed only `antigravity`. See the
  [research record](../research/2026-11-18-agy-review-api.md).
- Official documentation establishes direct Gemini API authentication and API
  availability of the three model families. It does not establish this project's
  entitlement or the exact pinned CLI's API mapping.
- Inspected the pinned Codex action's `action.yml`: its exposed final-message
  output does not establish whether a missing response failed before work.
  Such missing evidence blocks AGY rather than starting a duplicate attempt.

## Gaps and decision

No model generation was launched by this increment. API credentials, model access,
Linux execution, real stream shape and the final hosted publication remain
unverified. The feature is opt-in and this checkout's configuration does not
activate it. Source implementation, merge, activation and hosted verification are
separate. Keep phase 197 partial until the exact-head hosted walk succeeds.

The initial reviewer sees frozen metadata and patch text only. It has no tools or
repository context exploration; its published review states that limitation.
Catalog listing is not successful inference. Cost remains unknown. No automatic
second generation follows a timeout, denial, failure or uncertain completion.

## Integration findings retained

The first focused preflight ran 294 tests: 291 passed and three source capability
coverage checks failed. They identified changed reviewed parser bytes and the two
new installed scripts; this was not a provider execution failure. Their audit
bindings must be reconciled explicitly before the integrated checkpoint.

Internal review found a denial beyond the display formatter's diagnostic limits
could be misclassified as a credit-only startup failure. Admission now scans all
bounded original evidence. Its negative regression failed before the fix and
passed after it; truncation remains display-only.

The owner subsequently provisioned `GEMINI_API_KEY` and explicitly requested the
live test. Secret-name inspection confirmed presence only; no value was read.
The manual smoke route remains unexecuted until reviewed source is available.

The manual-only source smoke workflow is bounded to three singleton model checks,
a per-model three-minute ceiling and a 15-minute overall job. Its rerun guard
refuses Actions run attempts after the first; failed attempts are retained and
there is no automatic retry. It uses only a synthetic Acme patch.

The smoke builder retained an initial test-helper invocation failure, corrected
the test harness, then observed 7/7 smoke tests passing. Its earlier combined
run observed 76 workflow tests passing. The full gate below checks the integrated
source; no model calls were used by these synthetic tests.

## First committed checkpoint and PR review

Commit `aa9ffa88e1df2982cd099ccb1339d80b2653c222` retained the first full gate:
5,255 source tests passed, 12 skipped; 45 installed tests passed; typecheck passed.
The ledger reported no flaky or slower tests. These results apply to that commit,
not automatically to later corrections.

[PR 514](https://github.com/dalmaer/plates/pull/514) received two valid round-one
findings from the separate Codex GitHub reviewer: Actions reruns could lose the
local attempt receipt/deadline and dispatch AGY again, and independently decoded
stdout chunks could corrupt multibyte characters. Correct the shared workflow
admission boundary and both output streams; retain negative controls and rerun
the integrated checkpoint before pushing the corrected candidate.

The ordinary Actions review job failed before a judged result and skipped
publication: its Claude fallback reported exhausted quota. That failure is not
an acceptance result. The separate GitHub Codex review is actual review evidence;
local synthetic tests and pending API verification remain separate.

## Round-one correction proof

`plates prove tests/workflows.test.mjs --name "AGY admission refuses workflow reruns"
--fix practices/cross-review/files/.github/workflows/plates-cross-review.yml
--base aa9ffa88 --trailer --json` returned VERIFIED. The test retains first-attempt
admission and rejects later/unknown attempts for direct, Claude and Codex paths;
removing the guard makes the refusal assertion fail. The manual smoke sibling
already refuses reruns.

`plates prove tests/agy-review-runner.test.mjs --name "preserves split UTF-8"
--fix scripts/plates/agy-review.mjs --base aa9ffa88 --trailer --json` returned
VERIFIED. A real child emits one acknowledged byte at a time on each pipe; the
old reader corrupts multibyte text, while streaming decoders preserve it. Additional
checks cover incomplete final bytes and the shared raw-byte output cap.

The runner's source audit binding and managed receipt are refreshed for the
changed bytes. Unrelated managed receipts are preserved. These correction proofs
are local tests, not API entitlement or hosted publication evidence.

## First hosted API verification: pre-generation blocker

PR 514 merged as `4d6539f6a984f49f2a01cc352303f3974525cec6` after the
corrected source gate passed (5,259 source tests, 12 skipped; 45 installed tests),
305 focused tests, typecheck and a no-findings exact-head Codex review.
The [original API run](https://github.com/dalmaer/plates/actions/runs/44458635027)
used that revision, attempt 1. Its pinned installation passed; all three exact
model checks ended `configured-models-unavailable`, with unknown catalogs and
no generation intent. Usage and cost remain unknown. This is not verified model
entitlement or a successful review, and the run was not retried.

A separate local diagnostic used an isolated temporary HOME, the installed
AGY 1.5.10 `models` command, and a deliberately invalid synthetic credential.
It returned exit 0 with catalog rows and stderr exactly
`Fetching available models...\n`. No generation was requested. This local
observation explains a concrete adapter defect; it is not proof of the pinned
Linux 1.5.12 output or this project's API access.

The narrow correction accepts that exact progress line only for a successful
catalog command. Empty stderr remains valid; altered, additional or denial
diagnostics and nonzero exits remain unavailable. Generation diagnostics are
unchanged. Catalog receipts preserve diagnostic presence and a fixed category;
the smoke artifact reports category and outcome without raw output.
