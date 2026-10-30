# Project-set lens — local implementation evidence

Date: 2026-10-30. Phase: [132](../phases/132-a-project-set-shows-its-routines.md).
Base: Plates `0165c2902784073ba89dd717256ad233faf4865f`.
Local branch: `codex/switchboard-consolidation`; documentation parent `de3ab696`.

## Outcome and limits

A bounded optional service registry groups existing authorized plates in the
existing Home/Routines/Activity UI. Reads intersect access and numeric repository
pins before collection. Full authorization stays intact for operations. Set
selection survives filters and Home polling; history continuation binds the set's
visible membership and workspace source. Original project/attempt URLs are stable.
Unattributed workspace migration receipts are omitted with a coverage gap.

This is source implementation using synthetic Acme transports, not production
activation, a browser usability walk, Switchboard ingestion, personal quota,
historical token accounting or routine migration. No personal runtime, permissions,
credentials, workers or active routine changed. The agent-quality branch remains
read-only; its ledger integration and draft phase-ID collisions remain open.

## Verification

The required integrated gate is pending at this source checkpoint; its result
will be recorded separately against the exact committed candidate. Early direct tests caught an overly broad test regex
(`lab` also matched `label`); it was narrowed to a project label. Inspection caught
an unintended versions-pagination edit, which was removed before the targeted
suite, and an attempt link carrying a set filter into a project route, now covered
by following rendered attempt links through the authenticated service.

Direct set-security tests passed 6/6, including in-flight access revocation and
client refresh. These use adapters and a DOM scheduler harness; they do not claim
real browser layout, provider activation or PostgreSQL integration evidence.

Independent read-only review found no blocking authorization, source-read,
continuation or receipt-identity issue. Its two UI findings were fixed: All plates
no longer appears selected alongside a set, and applying a renamed-set snapshot
updates its heading and navigation labels. The reviewer rechecked both changes
and reported no further findings. Direct set/events/responsive tests then passed
25/25. The full focused gate is recorded separately below.

The initial focused gate failed 3 CLI/packaging checks while phase front matter
had an invalid evidence path. The path now uses the required `evidence/...`
format, the phase retains supported schema `spec: 2`, and the roadmap was
regenerated. This was a changed-input correction, not a flaky retry; the original
failure is retained in `set-focused.log` outside Git.

`npm ci --ignore-scripts --offline` installed the pinned development dependencies;
`npm run typecheck` passed. Typecheck covers the repository's selected production
JSDoc contracts, not every web module. A read-only link check resolved all 22
local document links/anchors in the changed guide/spec/phase/evidence.

Focused preflight passed 185/185 tests, zero failures/skips, with mandatory helper,
README, guide, CLI, adoption, managed-skill and package capability conventions.
Command: `npm run check:focused -- tests/web-project-sets.test.mjs tests/web-home.test.mjs tests/web-events.test.mjs tests/web-runs-ui.test.mjs tests/web-responsive.test.mjs tests/web-recovery.test.mjs tests/web-operation-coverage.test.mjs tests/web-fleet-updates-ui.test.mjs`.
Roadmap/render/inbox/whitespace stages also passed. The log is
`/Users/dionalmaer/Documents/Codex/2026-10-30/task-2/set-focused-final.log`.
This is focused evidence, not a full-gate or live-use claim.

## First integrated checkpoint and release-test correction

On clean `81f5bc38b1220413346d7db966f117f1a7050b37`, `npm run check`
ran 3,694 tests: 3,689 passed, one failed, four opt-in Docker tests skipped.
The gate stopped before roadmap/render/inbox. Typecheck passed on that revision.
Full log: `/Users/dionalmaer/Documents/Codex/2026-10-30/task-2/set-full-gate.log`.
The ledger reported no flaky or slower test, with one busy run excluded from
comparison; that is not evidence of quiet-host performance.

The sole failure was the existing release self-test assuming the next patch tag
is unused. The package is 0.8.35 while shared repository tags include v0.8.36–38.
The explicit read-only `release 0.8.36 ... --dry-run --json` returned
`tag v0.8.36 already exists`. The production refusal is correct. The test now
chooses the first unused patch across tags and release notes, retaining all
practice-plan assertions and printing JSON errors when present. It changes no
tag, version, release implementation or remote state. Independent review accepted
the correction; an inaccurate coverage comment was removed. The focused release
file passed 21/21. A second integrated gate is required on the corrected checkpoint;
the first gate remains failed, not superseded by a passing subset.
