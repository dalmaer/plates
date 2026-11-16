# One findings framework, several lenses

Use **observe → decide → act → verify** for untangling, reviews, audits and
measurements. A lens changes what to look for, not the workflow or authority.
Untangle asks what could be simpler; review examines a change; audits examine a
system; measurements supply deterministic evidence. Keep their provenance.

## Observe once

```
plates findings list
plates findings list --review owner/repo#42 --observations observations.json
```

`list` combines recorded audit JSON with the explicitly selected live PRs and
observation files. It does not run an audit, agent or measurement. Reading a PR
uses the normal review reader and its read receipt. Output includes source,
evidence, source status, stable source-qualified ID and an exact `digest` for
triage. Bad/missing selected sources appear in `gaps` and produce exit 1; this
view is never proof of whole-project health. Conflicting copies of one identity
are excluded with a gap; other sources remain usable. Historical audits are evidence at
their recorded commits, not claims about current code.

An observation file is `{ "findings": [...] }`. Each observation has `source`
(`kind`, `repo`, `record`), `localId`, and `title`; it can also carry `commit`,
`evidence`, `impact`, `fix`, `severity`, `effort`, `confidence` and `risk`.
Use source kind `untangle` or `measure` for these existing producers. Native
audit/review adapters exist; automatic measurement and untangle producer export
is not yet wired. No parallel runner or schedule is introduced.

## Decide with priority and payoff

Priority retains the audit leverage formula: severity / effort × confidence ×
risk, with high/medium/low = 3/2/1, S/M/L = 1/2/4, HIGH/MED/LOW confidence =
1/.6/.3 and LOW/MED/HIGH risk = 1/.8/.6. Unknown factors stay unknown, not zero.
Explicit opening PR priority labels map P0/P1 to high, P2 to medium and P3
to low; unlabelled reviews stay unknown. This is an ordering aid, not measured
ROI or permission to execute.

Copy the finding ID and digest into a decision file:

```json
{
  "findingId": "COPY FROM LIST",
  "findingDigest": "COPY FROM LIST",
  "decision": {
    "action": "explore",
    "rationale": "Check whether removing the duplicate parser is worthwhile",
    "payoff": {
      "verdict": "unknown",
      "benefit": "One fix could serve both callers",
      "cost": "A small compatibility experiment",
      "complexity": "Prefer deleting a parser over adding another abstraction"
    },
    "experiment": {
      "question": "Can both callers use the existing parser?",
      "minutes": 30,
      "success": "Both fixtures pass with one parser",
      "stop": "Stop if caller-specific policy needs a new framework"
    }
  }
}
```

```
plates findings decide --from decision.json
plates findings decide --from decision.json --yes
```

Repeat source selection flags from `list` when deciding. Preview exits 3 and
writes nothing. `--yes` records local triage only. Actions are `keep`, `explore`,
`defer`, `drop`; each explains benefit, cost and complexity with a payoff verdict
`yes`, `no` or `unknown`. Exploration requires a question, time box, success and
stop criteria. Unknown payoff is an invitation to learn, not an automatic veto.
`keep` with uncertain/no payoff carries a warning rather than silently denying it.
An optional `assessment` supplies the four priority factors explicitly.

An optional `duplicateOf` names another observed finding; grouping is explicit,
not a guess from similar prose, and retains every observation. Decisions are
private immutable records outside Git, keyed by canonical checkout. Repeating
the same choice is idempotent. Source changes make decisions stale. Review replies and answered status count as
source changes: prior triage remains in history, not current approval of changed
evidence. The revision is conservatively PR-wide in this increment. Different
choices for the same revision are surfaced as conflicts, not silently resolved
by timestamps. To finish exploration or resolve a conflict, include `supersedes`
with the `decisionId` values being replaced. History is retained; simultaneous
alternatives remain visible. A cross-worktree ledger is future work.

## Act and verify through the existing tools

A triage choice does not close a PR thread, authorize spend, start a model, open
an issue or establish a fix. Follow the existing phase/ready/integrate, review
reply and measurement evidence flows. Verify the proposed benefit and the added
complexity, not just whether code changed. The shared framework is a decision
layer, not a replacement scheduler, generic execution engine or automatic gate.
