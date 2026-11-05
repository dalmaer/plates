---
status: partial
owes: walk
since: 2026-11-03
goal: G7
spec: 2
depends: [96]
review: wait
note: "Built and proven by test: one item model in lib/work-items.mjs behind plates home and the hosted home, equal output from both readers, unreadable sources named in both, plates board retired, and every phase file read newest first. The owner's side-by-side walk remains."
evidence: ["evidence/2026-11-03-one-home-model.md"]
---

# The CLI and the web show the same work: plates board retires into the hosted home

## Done when

The owner's open work comes from one model and is shown in two isomorphic forms. `plates home [--project <id>] [--json]` in the CLI and the hosted home on the web show the same items, sections and counts for the same sources. `plates board` and its 127.0.0.1 page no longer exist. Every item the board showed now has a place in both forms, or is named as local-only in both.

## Scope

**The principle (owner, 2026-11-01): the CLI and the web are isomorphic.** Each view is one read model with two renderers, terminal or JSON and HTML. Neither form has an item, a section or a count that the other lacks. A source one form cannot read is shown in both as unavailable, with the reason and the command that reads it. It is never silently missing from one of them.

`lib/board.mjs` (about 1,570 lines) is two things today:
- The model. `lib/web/projects.mjs`, `decisions.mjs` and `walks.mjs` import `roadmapItems`, `proposalOf`, `decideLegacyProposal`, `openBoxes`, `yourPartIn`, `partsByBox` and `walkWritePlan`. `goodnight` reads its sources, and the morning brief reads its checks due.
- The `plates board` command and its local HTML server.

This phase keeps the first and retires the second:

1. **One model.** Move the shared item functions to `lib/work-items.mjs`, named for what they are. The web, goodnight, the morning brief and the CLI all import from it, and nothing changes behaviour. This lands as a PR on its own.
2. **Sources the web lacks get a place there.**
   - **Lessons waiting (inbox):** a "Lessons waiting" section on the hosted home, per project and fleet-wide, read through the GitHub App like the other sources.
   - **Reviews waiting on you:** PRs at their round limit, and PRs with unanswered findings, with phase 133's verdict ("stopped: repeating", "extended: progress") and the merge-rule counts (fix first, track, unsorted).
   - **Fleet, health, verify, robot, milestones and feedback:** check each against the home model. Anything the board showed and the home does not gets a home section.
3. **`plates home`** in the CLI renders the hosted home's read model from the local checkout and `gh`: the fleet lens, or one project with `--project`. It produces the same sections and counts, and `--json` gives the same shape as `/api/home`. `plates board` is removed. For one release it prints the command that replaced it, then exits 2.
4. **Local-only sources.** Loose ends (chats, worktrees, sessions on the owner's machine) cannot be read by a hosted service, and should not be. The CLI shows them in `plates home`. The web shows a "Local work" row, unavailable, with the reason "on your machine" and the command `plates loose-ends`. This is the principle's stated exception, and the same row appears in both forms.
5. **Cleanup.**
   - Delete `docs/guide/the-board.md` and its links.
   - Delete the board's server and HTML, its CLI help and capability rows, and its board-only tests.
   - Update the README, agent guide, delivery, phases and fleet guides, and the comment in `verify.mjs`.
   - In `names-verify` and `names-observation`, the observed consumer `board` becomes `home`, and phase 129's retained evidence stays as recorded.

Out of scope: write actions not already on the web, which keep their own phases and approvals. Changing what any source means or counts.

## Acceptance

- [x] The web, goodnight and the morning brief import the item model from `lib/work-items.mjs`, and a source file that still imports `lib/board.mjs` fails a test: `tests/work-items.test.mjs: "one item model: no module imports the retired board"`
- [x] For the same fixture sources, `plates home --json` and `/api/home` return the same sections, items and counts: `tests/home-isomorphism.test.mjs: "the CLI and the web render one read model"`
- [x] A source one form cannot read appears in both as unavailable, with the reason and the command that reads it: `tests/home-isomorphism.test.mjs: "a local-only source is named in both forms, never missing from one"`
- [x] The hosted home shows lessons waiting, and reviews waiting on the owner with the round verdict and merge-rule counts, per project and fleet-wide: `tests/web-home.test.mjs: "lessons waiting and reviews at their limit have a home section"`
- [x] `plates board` names its replacement and exits 2. No server is started: `tests/cli.test.mjs: "plates board is retired and names plates home"`
- [ ] ⚑ by hand: the owner opens the hosted home with the fleet authorized, and plates home in a terminal. Each section and count matches, and nothing the board used to show is missing.

## Your part

- **Ask:** Open plates.dionisaledge.com and run `plates home` side by side, and say whether anything you used to see on `plates board` is missing or different.
- **Why:** This is the check that retiring the board lost nothing, and that the two views are really the same.
- **Look at:** The "Reviews waiting on you" and "Lessons waiting" sections, and the "Local work" row.
- **Choices:** Nothing missing | Something is missing (say what)
- **Takes:** About 10 minutes.
- **Then:** If nothing is missing, the phase is done. Anything missing becomes a section in both forms before it closes.
- **Ready when:** the fleet is authorized on the hosted home (PLATES_WEB_CONFIG pins and App installation; plates-data#1 is merged).

## Real surfaces

- GitHub API: the hosted home reads the inbox and review state through the GitHub App installation for each authorized project.
- owner's machine: `plates home` and the local-only row for loose ends.
- published package: `plates board` is removed from the CLI, and the deprecation message ships for one release.

## Proof

Automated:
- `node --test tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/web-home.test.mjs tests/cli.test.mjs` proves one model, equal output from both forms, the new sections and the retirement.
- `npm run check` runs the full gate.

By hand: the owner's side-by-side walk above. A missing item would change the design: it means a source was dropped, not retired.

## Deliberately open

- **How the inbox reads on the web.** The inbox lives in the private `plates-inbox` repo, so the hosted home needs read access to it through the App installation. Until that access is approved, the section shows as unavailable in both forms, with the reason.
- **How long the deprecation lasts.** One release is proposed. Agents and scripts that call `plates board --json` must move to `plates home --json` first, and a search across the fleet settles this.

## Next action

The owner opens the hosted home and `plates home` side by side and says whether anything the board showed is missing.

## Trajectory

- **2026-11-03** — The web reader read only the first 160 phase files, oldest first, so on plates itself (166 files) every walk from phase 161 on was invisible in both forms. It now reads up to 1,000, newest first, in GraphQL batches: a 166-phase plate costs 6 requests instead of about 171. Evidence: tests/home-isomorphism.test.mjs "a plate past 160 phase files shows its newest phase's walk in both forms".
- **2026-11-03** — Retiring the board changed the bytes of scripts/plates/names-observation.mjs, which the hosted night retry pins at release 0.8.34; the test helper now carries those bytes, and the deployed retry may refuse until its closure is reviewed again. Evidence: tests/web-night-retry.test.mjs.
