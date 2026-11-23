---
status: partial
since: 2026-11-23
goal: G9
spec: 2
depends: [200]
note: "Increment 1 built: plates eject --dry-run plans every managed file's fate and every plates reference, read-only; rehearsed on study. Next: apply it and open the eject PR."
evidence: []
---

# plates eject hands a project everything plates manages

## Done when

`plates eject` on a project shows its plan first, then opens one PR. The PR:
- makes every file plates manages either the project's own (plates markers removed) or
  removed, by practice;
- rewrites every reference to `scripts/plates/` in files the project owns, or reports it;
- removes `.plates/`;
- takes the project out of plates's fleet.

The project's own `npm run check` passes on that PR in a clean clone. No workflow is left
calling a script that no longer exists. Before that PR, nothing changes.

## Scope

Stage 4 of the migration (docs/research/2026-11-21-just-unison.md; the per-practice table
in docs/research/2026-11-21-migration-rehearsal.md). Plates already lets a project own
single files (`.plates/plates.json` `"ejected"`); eject applies that to all of them, by
practice:

- **Dropped:** night (the night and morning workflows and their scripts), phases (the
  roadmap script, README and templates; only after the plan is in Unison, phase 205),
  conduct, evidence, lessons, ci.
- **Kept, owned:** agents-md (CLAUDE.md and AGENTS.md, without plates sections), renovate.
- **Owned files that call plates.** The rehearsal found `check.yml` (owned since an early
  eject) calling three plates scripts, and `package.json`'s `test` using plates's test
  reporter. Eject sweeps every owned file for `scripts/plates/` references and plates
  reporters. Each one is rewritten to a plain equivalent (`npm test`, the default reporter)
  or vendored as a single standalone script, and every change is listed in the PR. When
  a reference can't be rewritten safely, eject stops and names it.
- **Recurring.** For each night job the owner wants to keep, eject proposes a Unison
  Recurring item. It creates none without a yes.
- **Refusals.** Eject refuses while a phase is open and not imported (phase 205), unless
  the owner passes `--keep-phases`, which keeps the phases practice as owned files.

Out of scope: Unison's Recurring and planned items (Unison work), and deleting history.
Evidence and phase files stay.

## Integration increments

1. **The plan, read-only.** `plates eject --dry-run` lists every managed file with its
   fate, every reference to plates in owned files with its rewrite, and the refusals.
   Proof: tests/eject.test.mjs on a synthetic project. Recovery: revert.
2. **The PR.** Eject applies the plan on a branch, runs the project's `npm run check` in a
   clean clone, and opens the PR only if it passes.

## Acceptance

- [x] The dry run gives every managed file a fate by practice and finds each reference to plates in owned files, including a workflow and a `package.json` test reporter: `tests/eject.test.mjs: "the plan finds every managed file and every reference to plates"`.
- [ ] After eject, no file references `scripts/plates/` or `.plates/`, and the project's own check passes in a clean clone: `tests/eject.test.mjs: "an ejected project's own check passes without plates"`.
- [ ] Eject refuses while a phase is open and not imported, unless told to keep the phases: `tests/eject.test.mjs: "eject refuses to strand open phases"`.

## Real surfaces

- Owner's machine: `plates eject --dry-run` on study lists its 60 managed files with their fates and the three plates script references in its `check.yml`.

## Proof

Automated: `npm run check:focused -- tests/eject.test.mjs`, then `npm run check`.
By hand: none.

## Deliberately open

- Whether cross-review and deploy-with-rollback survive eject as owned workflows, or are
  dropped by default. The rehearsal project has neither. Settled on the first project that
  does.

## Next action

Increment 2: apply the plan on a branch, run the project's own `npm run check` in a clean clone, and open the eject PR only if it passes; build the open-phase refusal with `--keep-phases` (box 3). First on study, with `--keep-phases`.

## Trajectory
- **2026-11-23** The owner chose to eject study before Unison has planned items with proof (spec M4/M5): its open phases stay as Unison backlog items and the phase files stay as history, so study ejects with `--keep-phases`. Weekly Recurring tasks (dependency and health, performance, test and build time) replace the night's agent work there.
- **2026-11-23** A real dependency outranks the practice's default fate, but a plates call with a plain fallback is not a dependency: study keeps no plates script, because keeping `gate.mjs` would have kept about eight scripts that read the `.plates/` eject removes.
