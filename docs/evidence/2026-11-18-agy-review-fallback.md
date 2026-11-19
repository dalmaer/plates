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
