# Evidence: phase 156 — the CLI and the web show the same work

- Date: 2026-11-03
- Phase: 156, The CLI and the web show the same work: plates board retires into the hosted home
- Revision: base origin/main `43b1f009`, branch claude/phase-156 (commits 22c97585 … 78b4564e) and this record
- Claim being checked: one item model (`lib/work-items.mjs`) behind both `plates home` and the hosted home; equal sections, items and counts for the same sources; sources one form cannot read named in both; `plates board` retired.

## Automated checks

- `node --test tests/home-isomorphism.test.mjs tests/work-items.test.mjs tests/web-night-retry.test.mjs` — exit 0, 35 pass, 0 fail (conductor, on the branch head).
- The isomorphism test runs both real readers over one fixture: the web reader through a fake GitHub App API, the CLI reader over a git checkout with a fake `gh`. It compares their decisions, walks, reviews, waiting, changes, projects and coverage with `deepEqual`, and checks the HTML and terminal headings and counts. The builder's mutation (the CLI dropping one phase file) made it fail.
- `plates prove` on "a plate past 160 phase files shows its newest phase's walk in both forms": VERIFIED (trailer on d6572b68). Before the fix, phase files past 160 were not read, which on plates itself (166 phase files) hid every walk from phase 161 on.
- Builder's focused runs, per increment: `npm run check:focused` over 20, 19 and finally 25 files, each exit 0 (512 tests at the end).
- The whole gate, `npm run check` through `plates integrate`/the PR's CI, runs after this file is written.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Owner opens the hosted home and `plates home` side by side | same sections and counts, nothing the board showed missing | Not run | The owner's walk (⚑) is owed |

## Gaps and decision

- Partial, owes the owner's walk. It is ready once this lands and is deployed.
- The hosted "Reviews waiting on you" section needs the App's Pull requests read permission; until then it is a named gap.
- Lessons waiting is unavailable in both forms ("plates-inbox is not readable by the App yet"), as the phase leaves open.
- The CLI cannot read the visual-changes journal (GraphQL identity), so a plate with `docs/changes` shows a gap there in the terminal.
- The hosted night retry pins the release-0.8.34 bytes of `scripts/plates/names-observation.mjs`, which this phase changed; the deployed night retry may refuse until its closure is reviewed again.
