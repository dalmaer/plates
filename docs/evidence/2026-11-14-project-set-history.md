---
attempt: {"accepted":false,"verified":false,"rework":2,"lessonStatus":{"status":"known","lesson":"Plates lesson 59: sibling callers share a boundary"}}
---

# Phase 137: bounded project-set history

Source: `730ddcb58dac780a88701d689d573a0fe9d405f9` plus working tree,
14 November 2026. Implements Routines/Activity selection through the existing
registry, authorization intersection, bounded history readers and route model.
No new executor, scheduler, task authority, permission or provider spend.

## Proof and limits

Builder ran 33 tests across project-set contract, history selection, runs and runs
UI: exit 0. Negative controls cover unauthorized members, revoked sets, changed
membership, repository pins and source, absent/stale continuation binding,
conflicting query scopes and changes during collection. Provider fixtures assert
GET-only reads and no source writes. These are synthetic tests, not hosted proof.

Conductor `npm run typecheck`: exit 0. Focused preflight initially refused before
execution because sandbox loopback binding returned EPERM; the same checks are
run with host loopback access. Required integrated checkpoint is `npm run check`
through `plates integrate`, including installed CLI tests and generated-record
guards. Its result belongs to the retained integration record, not an advance
claim in this evidence. Independent review found that shared header navigation discarded the set while local tabs retained it. The correction preserves the set in both header destinations and clears pagination. A second review found client initialization overwrote the explanatory notice; client initialization and menu-open tests now cover both destinations. The initial host preflight ran 161 tests (all passing), then refused because the evidence file was not yet written. A later preflight caught a missing named check in the new Home acceptance line (161/162 tests passed); the line now explicitly names the owner desktop/mobile walk. Both failures are retained rather than relabeled as passing.

Home selection, a real desktop/mobile walk, deployment, enabled configuration,
actual child/provider execution, reconnect and provider-start recovery remain
unverified by this increment. The phase stays partial. Workspace-wide receipts
without project attribution are explicitly excluded, not silently assigned.

Conductor corrected preflight: 162/162 tests passed, roadmap/render/inbox/whitespace checks exit 0. After the client correction, the two affected browser/navigation files passed 13/13 tests; typecheck exit 0. Source tests do not replace the outstanding real browser walk.

## Reconciliation and ownership

The archived `codex/accepted-outcomes-proposal-2026-11-10` research proposal was
read against fresh main. Its FR01 maps to existing delegation 181, local-host 183
and worker 104, not new phase numbers or an implemented hosted path. Phase 181
has another session's live claim. Phase 104 refuses a new claim while its record
is partial owing only a walk; no ownership was assumed or runtime changed.
Phase 137 is the independently claimed history-support increment. It does not
satisfy the whole task-to-reviewed-result or private acceptance-cycle direction.
The phase decision context is `not-configured`, digest
`c565b181479b32dab61bae56ac2eae14d03db25f09a1e0af9e3df138dda89ee6`;
this is not accepted decision coverage. PR324's broader source remains preserved.

Existing passive quality collection was used in private external state: ten
historical candidate episodes, zero verified episodes and zero comparable
outcomes. The existing replay planner is disabled with unknown/unapproved budget;
no paid trial ran. Historical commits do not establish acceptance or agent quality.
The exact-version correction path and real coding-agent paired evaluation remain
separate work under their existing owners and authority.

## Recovery

Known-good base is the source revision above. Reverting this source increment
restores prior history behavior; no remote data or execution was created by the
feature. Stop deployment if selected views reveal an unauthorized project or
accept stale continuations. Existing unfiltered reads remain available. No
production health or owner acceptance is claimed by a source merge.

The first integrated gate retained one failure: the end-of-attempt lesson status used `reference` instead of the required `lesson` field (4,675 passed, one failed, twelve skipped). The record was corrected; no code or acceptance boundary was weakened.
