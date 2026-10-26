---
status: partial
since: 2026-10-25
goal: G2
spec: 2
depends: [128]
note: "Release v0.8.34 and Plates label receipt are published. PR #271 merged; private Ledger reads and real artifact restore passed. The first dispatched night failed its local gate with inherited observation context in test fixtures. Six consumer PRs remain prepared, not installed; current-night and durable legacy refs are retained."
evidence: ["evidence/2026-10-25-name-rollout-preparation.md"]
issue: 245
---

# Plates, then the fleet, move tonight, each proven by a night run dispatched by hand

## Done when

In one evening, plates and then ledger, duo, cajones, isocan and dtv each run on the transitioned release. Each passes a checklist on a night run dispatched by hand (`workflow_dispatch`):
- a full night and morning ran;
- fresh names written by the enumerated Plates-managed producers use plates names, while required old-prefix continuations retain their original identity;
- every old-name PR and plan still in flight was read and drained;
- `plates names` for that project shows nothing left except what the owner chose to keep.

## Scope

The design is [Name transition](../specs/name-transition.md), "The rule". The owner chose, 2026-10-23, to do it in one evening rather than one project per night.

- **Release** with phases 124–128 (`plates release`, the fleet rehearsal included).
- **Plates first.**
  1. With explicit owner approval, disable affected workflows and keep them disabled through installation, then re-enable only the installed new definitions. Prove the concurrency preflight: no old-group run is queued, waiting, pending or running, with complete run coverage. The owner drains runs or confirms cancellation before proceeding. Then update plates itself.
  2. Run `plates names --yes`, plus the owner's secret commands.
  3. Preview and approve evidence-enabled dispatches with the exact reviewed observer `names_source_sha` matching the installed managed-source revision. Dispatch `plates-night.yml`, then `plates-morning.yml` with that same SHA and the exact originating `night_run_id` and `night_run_attempt`. Provisioning uses the fixed source repository and existing access only, as specified in the phase-128 contract.
  4. Check the plates checklist below.

  Only then does the fleet start.
- **Then each project in order:** ledger, duo, cajones, isocan, dtv.
  1. Establish the same owner-approved disable/install/re-enable barrier and pass the old-run concurrency preflight before installing changed workflows. `plates fleet update` opens the PR, and the owner merges it (isocan's merge is Dimitri's or the owner's).
  2. `plates names --yes` for that project.
  3. Approve the same exact source-bound evidence inputs for this project; dispatch its night, then its morning linked to that exact night attempt.
  4. Check its checklist.

  A project that fails stops the rollout. It's fixed, or set aside by the owner, before the next one starts.
- **Project files plates doesn't manage**, inventoried before rollout for separate owner approval. Fresh inspection on 2026-10-25 supersedes the initial examples: Ledger already uploads `plates-test-runs`, retains both artifact readers, and its 14 CI-alert display-name watchers match actual workflows. No executable project-owned rename was identified in the inspected coverage. Two optional patches update Ledger operating descriptions and Isocan operator instructions; the owner approved both PRs after the managed updates; they remain unapplied and still require their gates. Isocan merge remains the owner’s or Dimitri’s. Duo, Cajones and DTV need no project-owned patch in that inspected coverage. Historical records and legacy-reader assertions stay unchanged; sensitive, binary and untraversed paths remain gaps.
- **dtv** is already adopted. Included in `plates.json` as managed on 2026-10-25 under the owner’s request to finish the stated six-project rollout. This inventory change does not install, dispatch or accept its migration; its turn remains after isocan.
- **The checklist**, scripted as `plates names --verify <repo>`:
  - the dispatched night's run is green;
  - its PR is on `plates-night/<date>`;
  - the morning's final is on the night's own prefix;
  - no fresh managed marker, fence, label or artifact uses a keel name; project-owned setup/gate effects remain separately disclosed, not certified by this observation;
  - drain left no keel-prefixed PR that still merges;
  - the board and the morning brief read the verify and plan history.

## Acceptance

- [x] `plates names --verify` checks one project's last dispatched night against the checklist and names each failure. `tests/names-verify.test.mjs`: "verify names each failed check without converting historical continuation into fresh-write failure". This is source verification, not the real dispatched walk.
- [ ] Plates passes the checklist on its dispatched night. ⚑ by hand: the owner <!-- acceptance: plates-dispatched-rollout -->
- [ ] Ledger, duo, cajones, isocan and dtv each pass it, in order, the same evening. <!-- acceptance: fleet-dispatched-rollout --> The evidence holds each one's run links and `plates names` before and after. ⚑ by hand: the owner

## Your part

- **Ask:** This evening, merge each project's update PR when asked, run the listed secret commands, and say go before each next project.
- **Why:** The merges, secrets and label moves are yours. Doing it in one sitting is your call (2026-10-23).
- **Look at:** `plates names --verify <repo>` after each dispatched night.
- **Choices:** All six clean | Stopped at a project
- **Takes:** About an evening: roughly 20 minutes per project, most of it the night's own run.
- **Then:** If it stopped at a project, that project's failure becomes the next fix. The ones already moved stay moved; phase 125 means they work either way.
- **Ready when:** phase 128 has shipped and the release is cut.

## Real surfaces

- fleet over time: six repositories, each with a night and morning dispatched under the new names.
- workflow shell: each project's night, morning, climb and impact workflows.
- GitHub API: label renames, branch prefixes and PR bodies across the fleet.
- adopted project: dtv, the first project adopted after the rename.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/names-cli.test.mjs tests/names-verify.test.mjs`; `npm run check`.
By hand: ⚑ the evening's rollout. Each project's dispatched run links and `plates names --verify` output go in the evidence.

## Deliberately open

- **A dispatched night isn't a scheduled one.** It runs from the default branch with `workflow_dispatch`, not the cron, so the first scheduled night after the rollout is the last check. The morning after, the brief should show every project on plates names; if one isn't, it reopens this phase.
- **isocan** is Dimitri's. Its update is a PR, and plates never merges it on its own.

## Next action

Correct the dispatched night's test-context isolation failure, preserving run 40251515967 and its health PR #272, then verify Plates' source-bound night/morning before installing each consumer update. PR #271's isolated credential read is live-verified; that does not accept the rollout. The owner approved the 17 original consumer workflow barriers and Papa Tapes' additional two-workflow barrier; these approvals do not establish installation or acceptance. Isocan merge remains the owner's or Dimitri's. Continue Ledger, Duo, Cajones, Isocan and DTV in order, then Papa Tapes. Preserve the earlier Isocan watchdog failure alongside the passing current-candidate checks. Keep current-night and durable legacy refs until their work drains or their state is transferred and verified; hosted and machine retirement remains separately unverified.

## Reconciliation

```plates-reconciliation
{"version":1,"prs":["dalmaer/plates#265","dalmaer/plates#267","dalmaer/plates#270","dalmaer/ledger#169"],"decisions":[],"implementation":[],"production":[],"use":[],"next":{"kind":"acceptance","ref":"plates-dispatched-rollout"}}
```

The current acceptance blocker is the Plates dispatched rollout. Release and
review are prerequisites described above. These references enable existing PR,
main-push and nightly reconciliation; they assert no new proof or acceptance.
