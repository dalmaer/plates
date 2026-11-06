---
status: partial
since: 2026-10-16
goal: G0
spec: 2
depends: [62]
note: "Partial 2026-10-17: plates prove --mutate runs the named test against five mechanical mutations of the fix's changed lines, each in a scratch copy, after a passing baseline, and reports caught/total with each survivor. The owner's read of one real fix's survivors waits."
evidence: ["evidence/2026-10-17-mutation-proofs.md"]
issue: 169
---

# A fix's test is shown to catch plausible wrong versions of the fix

## Done when

`plates prove --mutate` applies small mechanical mutations to the lines the fix changed and runs the named test against each; every mutation the test does not catch is reported as a survivor, and the proof's trailer records how many were caught.

## Scope

The design is [Verification: tests that tell right from plausibly wrong](../research/2026-10-16-verification.md), phase 84.

- **Mutations** (on the fix's added or changed lines only, in JavaScript and TypeScript): flip a comparison (`<`/`<=`/`>`/`>=`, `===`/`!==`), negate or drop a condition, swap `&&`/`||`, return early, change a numeric constant by one. Each is applied alone, on a scratch copy.
- **Run**: the named test must first pass on the unmutated fix (the baseline). Then, for each mutation, it runs once and is read the way `plates prove` already reads a run (`readNodeRun`): **caught** only when the selected test itself fails; **survivor** when it passes; **invalid** when the mutant does not parse or import; **inconclusive** when the runner times out or no selected test ran. Invalid and inconclusive mutants are reported separately and never count as caught.
- **Report**: caught/total, and each survivor as file, line and the mutation, so the conductor can strengthen the test. `--trailer` adds `Mutants: <caught>/<total>` beside `Proven-by`.
- **Budget**: at most 40 mutants per proof, chosen evenly across the changed lines; a time limit per run.

Not in scope: mutating code outside the fix, or failing a commit for survivors (the conductor decides).

## Acceptance

- [x] Each of the five mutations is applied to a fixture fix, alone, on a scratch copy; the real tree is never changed. `tests/prove-mutate.test.mjs`
- [x] A strong test catches every mutant; a weak one leaves named survivors. `tests/prove-mutate.test.mjs`
- [x] A failing baseline stops the run; a mutant that breaks parsing, an import, or times out is reported as invalid or inconclusive and never inflates the caught count. `tests/prove-mutate.test.mjs`
- [x] Only the fix's changed lines are mutated, at most 40, and each run is time-limited. `tests/prove-mutate.test.mjs`
- [x] `--trailer` records `Mutants: caught/total`. `tests/prove-mutate.test.mjs`
- [ ] ⚑ by hand: the owner reads the survivors from one real fix and says whether they showed a real gap.

## Your part

- **Ask:** Plates checked a real fix's test by making small wrong changes to the fix. These wrong changes still passed the test. Are they real holes in the test, or harmless?
- **Why:** If the holes are real, this check earns its place in every fix; if they are noise, the check is narrowed. The conductor marks which ones it thinks are real.
- **Look at:** The list of wrong changes the test missed, in the fix's PR and in this phase's evidence.
- **Choices:** Real holes | Harmless
- **Takes:** 5 minutes.
- **Then:** Real holes: the phase is built, and the fix's test is strengthened. Harmless: the mutation set is narrowed so these stop appearing.
- **Ready when:** the conductor has run `plates prove --mutate` on a real fix and posted what survived.

## Real surfaces

- Owner's machine: `plates prove --mutate` in a conductor session.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/prove-mutate.test.mjs`; `npm run check`.
By hand: one real fix's survivors.

## Deliberately open

- **Which mutations**: five to start; widened from real survivors.
- **Known limit**: a mutant that changes behaviour no test can observe (dead code, a log line) survives honestly; the report says so, it does not fail.

## Next action

The conductor runs `plates prove --mutate` on the next real fix commit and posts the surviving wrong changes in its PR and the evidence, marking which look real; then the owner's question opens.

## Trajectory
- **2026-11-06** The survivors are prepared by the conductor before the owner is asked; the question waits until they exist.
