# Evidence: phase 142 — Plates says what it owns, and its surface stops growing by accident

Conductor's checks, 2026-10-31, worktree on `claude/phase-142` from main
98d2f968. Real surfaces: none.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/surface-budget.test.mjs` | 3 pass | exit 0; "new surface needs the boundary", "the boundary owns every verb", "surface removed must lower the budget" pass | The budget in `.plates/surface.json` (49 verbs, 185 flags) matches `lib/cli.mjs`, and every verb is named once under "What Plates owns, verb by verb". |
| Same, after adding a fake verb `plates frobnicate` to the registry in `lib/cli.mjs` (then restored; `git diff --quiet lib/cli.mjs`) | all three fail | exit 1; 0 pass, 3 fail; the message names `plates frobnicate`, `.plates/surface.json` and the boundary section | A verb added without raising the budget and naming it in the boundary fails the gate. |
| Builder's wider run: surface-budget, docs, guides, cli, helpers, improve-records, reconciliation, reconciliation-integration, rename, web-model-routing, web-walks | pass | exit 0, 260 of 260 | The new design section breaks no test that reads `docs/design.md`. |
| `npm run check` on the committed tree, through `plates integrate` | pass | in the integrate log | The full gate. |

## Decisions

- Flags count per verb (each distinct `--flag` in a verb's usage counts once
  for that verb); `--json`, `--yes` and `--help` count once for the whole CLI
  when named; the two top-level flags once each: 181 + 2 + 2 = 185. The rule
  is written into the budget file and the test fails if file and code
  disagree. The research's "133 flags" used a different count.
- The budget file lists each verb's flags as well as the totals, so a message
  can name the new flag and a swapped flag is caught.

Supports **built**.
