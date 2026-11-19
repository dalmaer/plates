# Evidence: phase 134 passive follow-through

- Date: 2026-11-18
- Phase: [134](../phases/134-agent-quality-is-measured-by-stage-and-project.md)
- Source: `f4ce7300c639d09365e30789faf64fd2bdb53d5c`.
- Claim: merged passive quality mechanisms work on current source; acceptance
  and complete observation remain separate.

## Source and validation

`gh pr view 323 --repo dalmaer/plates --json state,mergedAt,mergeCommit,url`
confirmed [PR #323](https://github.com/dalmaer/plates/pull/323) merged at
2026-11-13T00:49:09Z as `f4c58ea4d26cc63257584f42e09f0e88ad22beaa`.
This corrects the current next action, not the historical refresh evidence.

On 2026-11-18, clean-main source `f4ce7300` has successful
[check](https://github.com/dalmaer/plates/actions/runs/44414618026) and
[typecheck](https://github.com/dalmaer/plates/actions/runs/44414618069).
These are remote source results, not a local gate or acceptance observation.

`npm run check:focused -- tests/agent-quality-records.test.mjs tests/agent-quality-lifecycle.test.mjs tests/agent-quality-report.test.mjs tests/agent-quality.test.mjs tests/agent-quality-execution.test.mjs tests/review.test.mjs`
exited 0 on 2026-11-18: 301 tests passed, zero failed. Mandatory conventions,
roadmap, render, inbox and whitespace checks passed. `npm run typecheck` exited 0.
The integration checkpoint for this records update remains separately required.

## Actual use and limits

On 2026-11-18, `retro quality inspect`, `pending` and `report` read the existing
private workspace without dispatching work. Before the audit observation, the
report retained 16 retrospective candidates, nine attempts across six task
records, zero assigned episodes and zero comparison-eligible episodes. No human
adjudications or mature follow-up were present. All 16 candidates required task
mapping. Unknown charges and acceptance remained unknown. Reports remain private;
these aggregate counts do not claim complete project coverage.

A bounded AGY audit used four read-only tool calls. Its Git read failed on a
sandboxed Git configuration; three file reads completed instead. Consequently
the audit's working-copy reading did not independently prove the pinned revision.
The conductor verified merge facts and current source separately. The audit's
suggestion to remove `review: wait` was rejected: prior merge does not remove
this phase's review contract. Historical evidence was preserved.

The installed door observer produced zero live receipts during that audit.
The existing independent monitor showed matching workspace metadata and valid
pre/post payloads. A separate local replay recorded successfully; this is
adapter evidence, not live capture proof. Native permissions were unchanged,
and the denied Git operation was not retried. Live capture remains incomplete.

## Remaining acceptance

Retain explicit stage observations, reconcile task mapping, and obtain real
independent human judgments before recommendations. Subsequent weekly reporting
and mature 7/30-day use remain unverified. Deferred execution is still disabled;
no schedule, budget, routing or permission changed. Phase 134 remains partial.

## Same-day live observer correction

On 2026-11-18 (America/Denver), the installed AGY hook contract established that
commands run from the configuration directory. The private wrapper's project-CWD
check returned before invoking the observer. Removing only that redundant guard
retained the pinned adapter's canonical-root and payload-workspace checks.
Six offline checks from the configuration directory passed: matching, empty and
different workspaces for both events. Only matching inputs produced receipts;
Pre returned native delegation and Post returned an empty object. Other hooks
and native approval settings were preserved.

After a graceful resume of the same conversation, one actual documentation read
produced a matching PreToolUse/PostToolUse pair with observed completion and
`authorizesExecution: false`. No raw arguments or transcript were retained by
the observer. A read-file tool name alone remains unknown door classification;
this verifies live passive capture, not automatic approval or broad tool coverage.
The original missing receipts and denied Git read above remain historical failures.

The retrospective audit was enrolled with its actual observed provider/model and
unknown original timing, charges and human acceptance. `retro quality weekly`
preview and exact-digest application retained an immutable private report on
2026-11-18: 17 episodes, 16 metadata candidates, one assigned episode, ten attempts
and zero comparison-eligible episodes. This was one reporting operation, not a new
schedule. The report's provenance remains declarations and incomplete history;
completed audit work is not independently adjudicated product acceptance.
