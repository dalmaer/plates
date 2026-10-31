---
status: partial
since: 2026-10-31
goal: G9
spec: 2
depends: [143, 146, 148]
note: "Decisions carry evidence, an expectation and a check date; due checks reach the board, the morning brief (plates morning) and health. A month of real checks remains."
evidence: ["evidence/2026-10-31-decision-loop.md"]
---

# Every decision says what evidence it used, and comes back to be checked

## Done when

Each decision Plates records (an accepted decision fence, a health proposal
accepted or declined, a lesson decided, a walk's choice, a phase's
Deliberately open settled) cites the evidence it was made on, states the
effect it expects and a date to check it; on that date the board and the
morning brief raise it with the evidence gathered since, and the owner or the
conductor records whether it held, needs a change, or is reversed — and that
outcome is itself evidence for the next decision.

## The loop this completes

| Step | Evidence | Where it comes from |
| --- | --- | --- |
| Observe | runs, cost, failures, production errors | telemetry (143), CI, production errors (88) |
| Attempt | each agent attempt's result and lesson status | attempt records (146's contract, 148) |
| Judge | acceptance, proof, evaluator scores | phase evidence, `plates prove`, the frozen evaluator (146) |
| Decide | what to do next, with the evidence cited | **this phase** |
| Act within limits | what the decision may change | autonomy levels (144) and door classes (145) |
| Learn | what the outcome taught | lessons home (G3), lesson status (148) |
| Check | did the decision do what it expected | **this phase**, then G5 across the fleet |

## Scope

- A decision record gains three fields: `evidence` (paths, runs, measures it
  relied on), `expects` (one checkable sentence, with a measure when there is
  one), and `checkBy` (a date). Existing records without them stay valid and
  are listed as "no check".
- A due check appears on the board and in the morning brief, with the
  evidence that has arrived since the decision (measures, attempts, lessons).
- Recording the outcome (`held`, `adjust`, `reverse`) needs a cited
  observation; `reverse` on an irreversible door (145) is refused and says
  what can still be done.
- Health measures the share of decisions checked on time, and of checked
  decisions that held.
- Not in scope: a model deciding; a model may draft the check, a person or the
  conductor records it.

## Acceptance

- [x] A decision recorded with evidence, an expectation and a check date is raised when the date passes, with the evidence that arrived since; one without them is listed as "no check": `tests/decision-loop.test.mjs: "a decision comes back to be checked"`.
- [x] An outcome without a cited observation is refused, and reversing an irreversible decision is refused with what can still be done: `tests/decision-loop.test.mjs: "an outcome needs evidence"`.
- [x] Health reports decisions checked on time and decisions that held, by month: `tests/decision-loop.test.mjs: "health measures the decisions"`.
- [x] The morning brief raises each due check with a link to it: `tests/decision-loop.test.mjs: "the morning brief raises due checks"`.
- [ ] A month in which at least three real decisions on Plates were checked and their outcomes recorded: ⚑ by hand: the owner and the conductor.

## Your part

- **Ask:** For a month, when the morning brief raises a decision to check, say whether it held, needs a change, or should be reversed.
- **Why:** It is the step that turns the evidence Plates gathers into better next decisions.
- **Look at:** the decision the brief links, and the evidence listed beside it.
- **Choices:** It held | It needs a change | Reverse it
- **Takes:** A minute or two per decision.
- **Then:** The outcome is recorded with the evidence and feeds the next decision on that subject.
- **Ready when:** the three decision-loop tests pass.

## Real surfaces

- owner's machine: the morning brief and board raising due checks on Plates over a month.

## Proof

Automated: `node --test tests/decision-loop.test.mjs`; `npm run check`.
By hand: a month of real checks.

## Deliberately open

Due checks reach the brief that `plates morning` renders on the owner's machine. The brief a project's CI sends (`plates-morning.yml`) runs the project's own checkout script, which cannot read Plates-side decision records, so it carries no checks; feeding them would need a workflow change. There is no web route for a decision record, so the link is the record itself.

- **Which records count as decisions** across fences, proposals, lessons and
  walks; settled by listing them first and adding the fields where each
  already lives, not a new store.
- **Default check dates** per kind (a week for a health proposal, a month for
  a practice change); set from the first month's use.

## Next action

A month of real checks: the owner and the conductor record outcomes as
checks come due.
