---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [151]
note: "Owner, 2026-11-02: after the fleet was authorized, the hosted home showed one plate, then a wall of 'source could not be read or validated' rows for Ledger. Ledger does not use the phases practice; the hosted reader parsed its docs/phases anyway."
evidence: []
---

# The workspace reads each plate the way its CLI does

## Done when

Every plate in the workspace manifest appears on the hosted home, readable or not. A project's `docs/phases/` is read as plates phases only when its `.plates/plates.json` lists the `phases` practice, as the CLI does. Phase files that do fail are reported as one line per project, not one row per file. A project the GitHub App cannot read appears as unavailable, with the reason and where to fix it, instead of being silently dropped.

## Scope

- `lib/web/projects.mjs`:
  - **No phases practice.** Planning is `source: 'none'`, with one gap: "This project does not use the phases practice; its plan is not tracked here." Nothing under `docs/phases/` is parsed.
  - **Phases practice.** Per-file failures collapse into one gap, "N of M phase files could not be validated", and the first few paths are kept for the details.
- `lib/web/github.mjs` `access()`: a manifest project whose pinned repo is missing from the installation's repositories (or whose name no longer matches) is returned in `unavailable` with its reason. Access to readable projects is unchanged, and no unreadable project gains any access.
- The home model and its views:
  - Unavailable projects render through the existing `unavailableProject` shape.
  - The reason names the fix: "The Plates GitHub App cannot read owner/repo. Add it to the installation."
  - The repo pin is listed in `PLATES_WEB_CONFIG` and is never shown to the viewer.
- Out of scope: reading a second installation (isocan on another account), and the home redesign (phase 166).

## Integration increments

One merge. It's compatible: the snapshot gains no new required field; `unavailable` is additive and empty by default. Focused proof is the tests below. Exposure happens on the owner's next deploy. Recovery is a revert.

## Acceptance

- [ ] A project without the phases practice reports no per-phase gaps, and one planning line that says so: `tests/web-projects.test.mjs: "a plate without the phases practice is not read as phases"`
- [ ] Failing phase files in a phases project collapse to one counted gap: `tests/web-projects.test.mjs: "phase failures collapse into one counted line"`
- [ ] A manifest project the installation cannot read is listed as unavailable with its reason, and gains no access: `tests/web-access.test.mjs: "a plate the App cannot read is named, not dropped"`
- [ ] ⚑ by hand: the owner opens the hosted home after deploy and sees the six dalmaer plates, with Ledger and duo saying they don't use phases instead of listing errors.

## Your part

- **Ask:** After deploying main, open the workspace and check every plate is listed, with no wall of errors.
- **Why:** It confirms the hosted reader treats each project the way the CLI does.
- **Look at:** The home page's plates, and the source line at the top.
- **Choices:** All listed, readable | Something is missing or wrong (say what)
- **Takes:** 2 minutes.
- **Then:** All listed: the phase is built. Otherwise the miss becomes a fix in this phase.
- **Ready when:** this phase is merged and the owner has deployed main.

## Real surfaces

- GitHub API: the hosted reader against the owner's installation, read after deploy.

## Proof

Automated: `node --test tests/web-projects.test.mjs tests/web-access.test.mjs`; `npm run check`.
By hand: the owner's look after deploy.

## Deliberately open

- A plate on a second installation (isocan) stays unavailable with the reason "not in this installation" until a later phase decides how one workspace reads two installations.

## Next action

Build the reader change and its three tests.
