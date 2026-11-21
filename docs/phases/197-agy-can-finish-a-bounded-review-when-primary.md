---
status: built
since: 2026-11-21
goal: G2
spec: 2
depends: [45, 46]
review: wait
note: "Owner requested an automated AGY fallback after Claude/Codex unavailability. Initial source merged; first API test stopped before generation on catalog diagnostics. Narrow correction underway; model entitlement and hosted acceptance remain unverified; the walk was removed (phase 204)."
evidence: ["evidence/2026-11-18-agy-review-fallback.md"]
---

# AGY can finish a bounded review when primary providers are unavailable

## Done when

An opted-in cross-review can use an explicitly available Neon, Carbon or Hydrogen model through AGY after primary-provider unavailability, retaining the original deadline, failed attempts, actual reviewer identity and unchanged publication guards.

## Scope

Extend the existing cross-review selection, read-only review and separate publication
jobs. Do not add a scheduler, host service, task authority or general agent runtime.
AGY is a fallback reviewer, not a climb/tend builder. Its first adapter reviews the
frozen prompt and diff without tools; disclose that limited context in the review.
Use a pinned distribution and a private isolated configuration, never the owner's
cached login. No permission bypass flag or enlarged allowance.

## Integration increments

1. Add tested fallback/result contracts and opt-in workflow wiring. Existing projects
   without configuration retain their behavior. Focused tests and the full source
   gate precede the reviewed PR. Reverting the opt-in stops future admission and
   does not erase completed reviews or spend.
2. Provide a manual-only bounded synthetic API check using the same runner,
   with sanitized metadata and no recurring activation.
3. After a dedicated credential and model access are verified within an exact
   approved allowance, observe a hosted fallback and its published review. Keep
   missing credentials and unsupported model access explicit until that walk.

## Acceptance

- [x] Selection reaches AGY only after primary unavailability or absent credentials, preserving denied/uncertain/substantive attempts: `tests/cross-review.test.mjs`.
- [x] Model selection, output validation and retry decisions retain identity, unknown cost and original deadline: `tests/agy-review.test.mjs`.
- [x] The runner uses no tools or repository settings, preserves attempt receipts and refuses ambiguous results: `tests/agy-review-runner.test.mjs`.
- [x] Workflow rendering, separate publication and opt-out compatibility remain checked: `tests/workflows.test.mjs`.
- [x] Integrated source proof passes: `npm run check` and `npm run typecheck`.

## Real surfaces

- workflow shell: verify opt-in admission, deadline, pinned binary and absence of PR-controlled execution or permission bypass.
- GitHub API: read back the exact-head published review and model attribution after the separately approved hosted walk.

## Proof

`npm run check:focused -- tests/agy-review.test.mjs tests/agy-review-runner.test.mjs tests/cross-review.test.mjs tests/workflows.test.mjs`

`npm run check`

`npm run typecheck`

## Deliberately open

GitHub had no Gemini credential at design time; the owner provisioned it on
2026-11-18 and requested the bounded API test. The signed-in local AGY model
catalog does not prove API entitlement. Verify exact available slugs before any
hosted generation; absent models remain unavailable. API charges are unknown and
must not be represented as zero or as covered by a desktop subscription. The
initial tool-free patch review cannot inspect repository context beyond its frozen
input; publish that limitation. A provider timeout or uncertain completion never
starts another model. Any future tool-enabled variant needs its own reviewed
isolation contract. The installed CLI documentation is evidence of a supported
interface, not proof of the hosted route.

## Next action

Land the catalog progress diagnostic correction with its negative controls. Retain
the original failed API test and verify corrected access under the approved bounds. Keep
API model access, publication and activation unverified until observed.

## Trajectory

- **2026-11-18** — External review found that local create-only receipts do not prevent dispatch on a fresh Actions rerun. Refuse later run attempts at the workflow boundary, matching the manual smoke route; a future resumable route needs original-attempt reconciliation. PR 514, round one.
