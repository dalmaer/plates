# Evidence: phase 134 passive increment refresh

- Date: 2026-11-12
- Phase: [134](../phases/134-agent-quality-is-measured-by-stage-and-project.md)
- PR: https://github.com/dalmaer/plates/pull/323
- Inputs: PR head `ec4fe3d334ce5801e9c59011f847f0e28dfd3c4f` and main
  `eb6e98592804b7b3867965c2b36f241f9625b094`.

## Scope and review

This refresh preserves Node 26, provider fallback and project-set registry work
from main. It regenerates roadmap/surface records and keeps main parser inventory
entries, including the package binding. Only changed parser hashes and the eight
quality modules are added. Capability forms change only for `retro`.

Independent local code review verified the retained environment allowlist,
metadata/checkpoint distinction, untracked coverage documentation, public execution
refusal and immutable ledger/report behavior. It found one gate-boundary defect:
`plates review --gate` could capture metadata when privately bound. The new
`review gates never load` regression failed on the original implementation
(`true !== false`); the observer now also requires `!gate`. Re-review found no
remaining findings. This is local code review, not a hosted current-head review.

## Validation

- Runtime: isolated Node v26.13.1; source dependencies installed with
  `npm ci --ignore-scripts`. No consumer installation occurred.
- Initial focused preflight refused the ambient NODE_PATH before tests. After
  inspecting that module search path, execution used a clean Node environment.
- A second preflight refused obsolete test names from the handoff before tests;
  the corrected inventory uses evaluation-records/comparison and names-verify.
- `npm run typecheck`: exit 0.
- `npm run check:focused -- tests/agent-quality-records.test.mjs tests/agent-quality-lifecycle.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality.test.mjs tests/agent-quality-execution.test.mjs tests/review.test.mjs tests/evaluation-records.test.mjs tests/evaluation-comparison.test.mjs tests/names-observation.test.mjs tests/names-verify.test.mjs tests/web-operation-coverage.test.mjs`: exit 0; 457 passed, zero failed, one existing conditional skip. Runtime was Node v26.13.1 with the inspected ambient NODE_PATH/NODE_OPTIONS omitted. The actual-load closure, 129-load rejection and both optional-observer regressions passed; the 128-file bound was unchanged. Render, roadmap, inbox and whitespace stages passed.
- Current-head full CI remains required; results belong to the exact published
  commit and are not inferred from this focused preflight.
- Previous-head full gate: GitHub run 42011381199 completed successfully for
  `ec4fe3d3`; this historical result is not reused for the refreshed candidate.
- The repository review CLI could not authenticate GitHub in this environment.
  PR comments, reviews and threads were read with the authorized GitHub connector.

## Open proof and recovery

Public quality execution and paid replay remain unavailable. No weekly schedule,
model routing, deployment or private report publication was added. Installation,
human calibration, real stage capture and mature weekly/7-day/30-day evidence
remain open. Historical private baselines are retained, not recreated here.

The refresh is isolated from unrelated checkout changes. Before merge, the
original branch head is the recovery point; a later revert can remove the
passive increment, but cannot erase private observations already collected.
Existing phase claim ownership is preserved. Merge requires current-head checks
and review; source fixtures do not establish product acceptance.
