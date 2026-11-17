---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 112 — Ledger's consumer acceptance, run on its current main

- Date: 2026-11-16
- Phase: 112
- Revision: plates base 17261aa1 and working tree; Ledger `138ff9871d99b404fcd4d2f6a75ccca634470ff7` (its main), a fresh clone
- Claim being checked: the first three Acceptance boxes: the workflow contract's negative controls, the required consumer validation (local `check:all`, separate `test:later`, and the complete hosted `scope`/`test`/`later`/`web` union), and the exact-head review of dalmaer/ledger#162.

Proof only: dalmaer/ledger#162 merged on 2026-10-23, so nothing was built. Run by the conductor (small phase).

## Automated checks

All in the fresh Ledger clone after `npm ci` (exit 0) and `npm --prefix web ci` (exit 0). Local Node was v26.13.0; Ledger's `.nvmrc` names 24.22.2, so the local runs are not on Ledger's pinned version. Hosted CI is.

- `node --test cli/ci-workflows.test.ts`: exit 0, `tests 9`, `pass 9`, `fail 0`. Its contract test is "CI contracts reject graph, coverage, clock, install, data and failure mutations".
- `npm run check:all`: two runs, because its last two steps measure the owner's real ledger data and a fresh clone has none.
  - First run, no data: every step through `agents:workflows -- --check` passed, including `npm test` (1377 pass, 0 fail), the voice diagnostic, both typechecks, web tests (685 pass, 0 fail) and the web build. `perf -- --check` then exited 1 with "couldn't find a ledger" because no data root was set.
  - The remaining two steps, `npm run perf -- --check` (exit 0) and `node cli/ledge.ts check` (exit 0), were run with `LEDGER_ROOT` set to a throwaway local copy of the owner's data checkout, with the owner's yes. `LEDGER_AUTOSYNC=0` was set and the copy had no git remote. The copy was clean afterwards and was then deleted.
    - All five perf budgets passed, at 0–31% of their ceilings.
    - `ledge check` reported 0 errors and 3 warnings. The warnings are stale folder display paths in the data, not code.
- `npm run test:later` (clock shifted 400 days): exit 0, core 1377 pass and web 685 pass, 0 fail.
- Hosted union on the same Ledger commit, run [43884838043](https://github.com/dalmaer/ledger/actions/runs/43884838043): `scope`, `test`, `later` and `web` all succeeded. In `.github/workflows/test.yml`, `test`, `later` and `web` each have `needs: scope` and nothing else.
- `node bin/plates.mjs review dalmaer/ledger#162 --gate --json`: exit 0, `"gate": true`. The merged head is `b5d077b92ed0ee8f4d4344124a1f074d6cfffb7a`. The plates cross-review ran on both `f28e422` and `b5d077b` (the exact merged head), and the owner's review also commented at `b5d077b9`. Its one inline finding, a P3, is answered and resolved.
- Gate: `npm run check` and `npm run typecheck` in plates cover this source record; their results are in the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read Ledger's `test.yml` at `138ff987` | an independent graph after scope | `test`, `later` and `web` need only `scope` | The dalmaer/ledger#162 graph is preserved on current main. It does not prove speed. |
| Read dalmaer/ledger#162's review list | a review at the merged head | reviews at `b5d077b9` by the cross-review and the owner | The exact head was reviewed. |
| ⚑ parent reviews this evidence before broader rollout | the owner's decision | The owner reviewed it on 2026-11-16: "looks good. Complete." | The stage is accepted; it does not prove speed or equivalence. |

## Gaps and decision

- **Equivalence and savings:** this shows the current candidate passing every required lane. It shows no equivalence between local and hosted runs and no speed saving. Speed savings stay unknown until matched trials (Deliberately open), and reuse waits for phase 114.
- **Node version:** the local runs used Node 26, not Ledger's pinned 24.
- **Status:** built. The owner's review (⚑) was given on 2026-11-16, after this file was first written.
