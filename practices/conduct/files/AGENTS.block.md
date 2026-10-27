**Spin the next phase.** `/spin` (the skill in `.agents/skills/spin`) briefs
a builder (a phase of a file or two it may build itself: the skill's *Small
phases*), verifies the proof itself, writes the record and commits each phase
to `main`, then runs a retro when the phase changed more than docs (the owner
picks from its candidates). Builders test by file. The conductor runs `{{check}}` once on
the integrated tree — a green subset hides a red suite, and checking at every level costs more than it catches.
(why: Plates lessons 4 and 5: a green subset hides failures, while repeated full gates waste work.)

**A fix is proven by its test failing without it.** A `fix:` commit
carries a `Proven-by:` trailer from `plates prove <test> --fix <files>
--trailer`: VERIFIED, or the reason it is not.
(why: Plates lesson 38: a check can stay green without evaluating its claim.)

**Answer every review.** When a PR has reviews, validate each comment against
the code first, then answer it with one of the three replies: fixed (the
commit), tracked (the issue or version) or not valid (why), with
`plates review <repo>#<n> --close <id> …`; never leave one unanswered. Not a
gate: an open thread never blocks a merge.
(why: An unanswered finding leaves the next reader unable to tell whether it was fixed or rejected.)

**Install separately from ongoing care.** A compatible reviewed update is installed
when its exact source, managed bytes and required workflow restoration are read
back. Pending optimization and incomplete nightly observations remain visible;
they do not accept work or block that installation. Pause/drain/restore only the
affected workflows when concurrency identity actually changes.
(why: The name-transition rollout waited on unrelated optimization after its installation checks had passed.)

**Reuse unchanged authority and proof.** A handoff retains the original operation,
scoped owner approval and evidence. Reinspect changed facts; ask again when the
permitted action, destination, budget or risk changes. An approval for an exact
head never transfers to an edited candidate. Repeated review findings require a
fix to their shared cause and focused negative controls before another integrated
checkpoint; preserve the existing review limit and original failures.
(why: Plates lesson 59: fixing only the reported instance allowed the same failure shape to return in later review rounds.)
