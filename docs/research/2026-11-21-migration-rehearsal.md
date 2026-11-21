# Migration rehearsal: one fleet project from plates to Unison — 2026-11-21

A dry run of the migration in docs/research/2026-11-21-just-unison.md on one fleet
project, **study**. Study has plates's standard nine practices, five phases (three open)
and the usual three workflows. Stages 2–4 need things that don't exist yet: Unison's
planned items, the import (phase 205) and eject (phase 206). So this records what each
stage would do to study's real files. Nothing in study was changed except Stage 0, which
the whole fleet already had.

## Stage 0: connected (real, done)

- Workspace `ws_736abfe8`, found by `dalmaer/study`. The owner joined it as a participant.
- Its three open phases are items (`plates unison sync`), and a second sync does nothing.
- `.plates/plates.json` holds `"unison": {"workspace", "url"}`, merged through a PR in study.

## Stage 1: drive from Unison

Nothing here is specific to study: it arrives with phases 200 step 3, 201, 202 and 204.

**Finding: walks and owner steps are mixed.** Study's `⚑ by hand` boxes aren't all walks:

| Box (paraphrased) | What it really is |
| --- | --- |
| the owner picks the scheduler | a decision |
| the owner merges the other project's PR (a production deploy) | an approval |
| the owner says yes to the key, the hosting project and the domain | a setup step (money and resources) |
| the owner signs in on the web build and sees today's cards | a walk |
| installed on the phone, signed in, an update seen landing | a walk |
| the dashboard's count matches, and Start opens the review | a walk |

So phase 204 cannot treat every `⚑ by hand` box as a walk. Only walks become optional;
decisions, approvals and setup steps still wait on the owner. Going forward, a walk needs
its own marker, so that no check has to guess from the prose. This was fed back to
phase 204 while it was being built.

## Stage 2: the plan moves into Unison (would-be)

What the import would write for each open phase:

| Phase | Done when (to the field) | Checks | Needs | Result |
| --- | --- | --- | --- | --- |
| 1 (partial) | one sentence on signing in, grading and adding cards | 1 `test:` (`tests/grants.test.ts`, checked); 1 approval (the PR merge), open; 1 decision, done; 1 walk becomes a Try it | phase 0 (built) | stays open, waiting on the approval |
| 2 (partial) | the live site, the phone install and over-the-air updates | 2 setup steps, done; 1 walk becomes a Try it | phase 1 | every check proven: it closes once its Needs is done |
| 3 (planned) | the day dashboard shows the review count and Start opens it | 1 walk, which becomes a Try it | phase 1 | **no check left** |

**Finding: a phase whose only acceptance was a walk has nothing left to prove.** Phase 3
needs a real check (for example, a test that the dashboard's count matches the
project's). The import must not create a planned item with no checks. It should flag the
item so a person or the planning agent adds one. The same applies to phase 204's record
migration.

**Finding: decisions and approvals need a home in Unison.** Neither is a test or a link.
In Unison they become "For you" cards with choices, which is the sections spec. Until then,
the import keeps them as `link:` checks, proven by the owner's recorded answer.

## Stage 3: proof moves to CI (would-be)

- `check.yml` already runs `node --test` with plates's test-ledger reporter. Adding the
  proof-report Action means one step after the tests, publishing passing tests as file and
  name.
- `tests/grants.test.ts` would tick phase 1's `test:` check on the next merge.

## Stage 4: turn plates off (would-be)

What plates manages in study (`.plates/lock.json`, practice 0.8.38), and what eject would
do with it:

| Practice | Files | After eject |
| --- | --- | --- |
| night | 37: `plates-night.yml`, `plates-morning.yml` and 35 scripts under `scripts/plates/` | **dropped**: climbs, budgets, health and the morning report go. Any job worth keeping becomes a Unison Recurring item. |
| phases | 7: `scripts/roadmap.mjs`, `docs/phases/README.md`, templates, a generated-files check and its test | **dropped** once the plan is in Unison. `roadmap:check` leaves `npm run check`. |
| conduct | 5: the spin and conduct skills, and an AGENTS.md section | **dropped**: the method moves to Unison's agent guide for planned items |
| agents-md | 4: the plates skill, CLAUDE.md, an AGENTS.md section | **kept, owned**: CLAUDE.md and AGENTS.md stay, without the plates sections |
| evidence | 2: the template and an AGENTS.md section | **dropped**: proof is the PR and the CI run |
| lessons | 2 | **dropped** |
| ci | 2: `scripts/plates/workflows.mjs` and its test | **dropped** |
| renovate | `renovate.json` | **kept, owned** |
| (already ejected) | `.github/workflows/check.yml` | **kept**, but it calls `scripts/plates/gate.mjs`, `reconcile.mjs` and `test-ledger.mjs`. Eject must rewrite those steps to plain `npm test`, or vendor the three scripts. |

**Finding: the CI gate depends on plates scripts even though the project owns it.**
`check.yml` was ejected long ago, but it still calls three plates scripts, and
`package.json`'s `test` uses plates's test-ledger reporter. Eject has to find every
reference to `scripts/plates/` in files the project owns, not only the files plates
manages. It should rewrite each reference or report it, and never leave a broken workflow.

## What this sets for phases 204–206

- **204:** classify `⚑ by hand` boxes; only walks become optional. Give walks their own
  marker. Never leave an open phase with no checks.
- **205 (import):** map each box by class (test, decision or approval, setup, walk); flag
  items with no checks; keep decisions and approvals as owner-answered checks until Unison
  has sections.
- **206 (eject):** handle each practice as in the table above; sweep owned files for
  `scripts/plates/` references and `npm` scripts that use plates reporters; prove the
  project's own `npm run check` passes after eject, in a clean clone, before the eject PR
  merges.
