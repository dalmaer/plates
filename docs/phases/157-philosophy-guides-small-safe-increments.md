---
status: built
since: 2026-11-02
goal: G0
spec: 2
depends: []
note: "Philosophy and context implemented; corrected source passed the full gate and typecheck. Publication and consumer adoption remain separate; future runtime phases are unbuilt."
evidence: ["evidence/2026-11-02-plates-philosophy.md"]
---

# The philosophy guides small safe increments

## Done when

A canonical philosophy preserves Plates' wider mission and guides planning and spin toward small independently safe merges without claiming unbuilt rollout capabilities.

## Scope

Establish canonical project context and change the planning/conductor default
from a whole phase on one branch to independently safe increments. Update the
managed sources and rendered copies together. This phase is documentation and
process instructions only, including the bounded overnight principle and its
follow-up phase. No runtime behavior, permissions, release, deployment, branch
protection or installation changes across the set of plates.

Read [the Plates philosophy](../philosophy.md); preserve existing phase ownership
and evidence. Dependencies name prerequisites, not automatic acceptance of their
outstanding real-surface walks.

## Integration increments

One safe merge: philosophy, concise project pointers, matching shipped planning
and spin instructions, and this linked roadmap. All existing runtime behavior
remains unchanged. Recover by reverting this documentation change; no external
effects are created. Later implementation belongs to phases 158–162.

## Acceptance

- [x] A canonical philosophy preserves Plates' wider mission and guides planning and spin toward small independently safe merges without claiming unbuilt rollout capabilities. Check: `git diff --check` plus review of `docs/philosophy.md`, `AGENTS.md` and the planning/spin guides.
- [x] Managed phase templates and conductor instructions agree with their source; they name the first safe merge and retain unfinished acceptance and existing authority Check: `npm run render:check` and `npm run check:focused -- tests/roadmap.test.mjs`.
- [x] The roadmap contains distinct dependent phases for visibility, integration, one rollout pilot, evidence-based generalization and bounded overnight decision review Check: `npm run roadmap:check`.
- [x] The documentation/process candidate passes required repository checks Check: `npm run check` and `npm run typecheck`.

## Proof

Run `npm run render`, `npm run roadmap`, then
`npm run check:focused -- tests/roadmap.test.mjs`. Review local Markdown links and
confirm no new runtime implementation or permission grant. Run `npm run check`
and `npm run typecheck` on the final candidate. Record actual results and gaps;
source checks do not prove adoption by a running agent or another project.

## Real surfaces

none

## Deliberately open

Consumer adoption still needs the existing reviewed release/update path. Branch
age and queue targets are guidance until later phases add observation/enforcement.
This phase does not decide a flag vendor or deploy target.

## Next action

Review and publish this source change through the existing practice-change path. Consumer propagation must resolve the recorded release-review gap first. Phase 158 is the next implementation increment; it is not authorized by this documentation rollout.
