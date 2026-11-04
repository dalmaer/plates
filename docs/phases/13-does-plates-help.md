---
status: built
after: 2026-11-01
since: 2026-11-04
goal: G5
depends: [12]
note: "The results page (docs/research/2026-11-04-does-plates-help-results.md) computes the six pre-registered measures and finds no effect it can attribute to plates: the control, isocan, was adopted two days into the after window."
evidence: ["evidence/2026-10-02-does-plates-help.md", "evidence/2026-11-04-does-plates-help-results.md"]
issue: 31
---

# Plates can show it makes projects better, or find out that it does not

## Done when

A dated research page compares the fleet before and after adoption on measures fixed in advance (red-streak length, time from lesson to guard, phases moved per week, conduct cost per phase) and says plainly what it found.

## Scope

Fix the measures and the comparison before looking. Golden tasks for plates
itself: init a project of each kind, adopt a fixture, carry a migration —
each with machine-checkable outcomes, run with and without plates's skills
(isocan's skill-lift method).

## Acceptance

- [x] Measures and comparison written down, dated, before the data is read.
- [x] The page reports a null or negative result as plainly as a positive one: docs/research/2026-11-04-does-plates-help-results.md, its opening paragraph.

## Proof

The research page, its numbers reproducible from the commands it names.

## Deliberately open

- How long a fleet must run before the comparison means anything. **Settled 2026-10-02, in the pre-registration:** at least 4 weeks after the second adoption, and not before 2026-11-01. If fewer than two projects are adopted by 2026-11-15, that is the finding.
- Golden tasks with and without skills (isocan's skill lift). They spend model tokens, so they wait for the owner's yes on the cost.

## Next action

None. The golden tasks (Deliberately open) wait for the owner's yes on their token cost.

## Trajectory

- **2026-10-02** — Pre-registered before any project was adopted, so the commit date is the proof. Only ledger has enough history for a before and after; duo and cajones are after-only, and isocan is the unadopted reference.
- **2026-11-04** — The control broke: isocan, the unadopted reference, was adopted on 2026-10-05, two days into ledger's after window, so no change in ledger can be told apart from what moved everywhere. The page says so instead of claiming an effect. docs/research/2026-11-04-does-plates-help-results.md.
- **2026-11-04** — Conduct cost was not 0: plates's own builders ran the whole check 168 times, 107 of them in the week of 2026-10-09, when 10 of 19 briefs named `npm run check`. The rule held in the docs and not in the briefs.
- **2026-11-04** — ledger's phases carry no `evidence:` front matter, so measure 3's evidence-backed share cannot move there; the measure fits plates's own phases, not every adopter's.
