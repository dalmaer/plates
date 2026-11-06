---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: the owner's questions on plates, rewritten to be answerable

- Date: 2026-11-06
- Phases: 34, 51, 64, 84, 125, 126, 143, 144, 151, 155, 165
- Revision: base origin/main and working tree; this record's commit.
- Claim being checked: every item in plates's Yours lane asks one plain question, gives a recommendation where one can be given, and is answerable from a phone. An item an agent can check, or one that is out of date, leaves the owner's lane.

## What was observed

The owner asked what "Settle what is waiting on you from this board for a week…" (phase 51) meant, and whether plates's open decisions are actionable. `plates home --backlog --project plates --json` listed 15 items in Yours: 7 in flight, 14 agent-ready, 78 waiting (66 of them walks held behind a Ready when).

| Item | Before | After |
| --- | --- | --- |
| 51 board | A week-long trial of a board the Backlog replaced | "Retire the board?" Recommended: retire |
| 64 rules | Read every AGENTS.md rule for 15 minutes | An agent shortlists rules whose cause is gone; the owner judges the list |
| 84 mutation | "Read the survivors" before any existed (a ⚑ next action) | The conductor prepares them; the question waits until they exist |
| 125, 126 rename | Approve a workflow barrier for an install that had already happened | Observed and built (below); the fleet is phase 129's |
| 155 climb | Observe a climb run (agent work) | Agent work; every scheduled climb failed 1–5 November |
| 34 rigour rules | A judgement from a table | Plain question and a recommendation: keep both |
| 151 activation | "Book a 1–2 hour session" | One step: migration 005, about 15 minutes |
| 165 cache | Open a network panel (not possible on a phone; the box named the conductor) | "Does Home appear at once when you reopen it?" |
| 143 telemetry | A pick without advice | Recommended: Langfuse Cloud free tier |
| 144 ruleset | Approve a preview not yet posted | The preview comes first; the question waits until it is posted |

Left as they were: the stale claims on phases 129 and 134 (Release or Keep, already plain). Review #352 and the two health proposals are rendered from generated records; their card text needs a code change (follow-up).

## The rename, observed on plates itself (phases 125 and 126)

- `git ls-remote --heads origin 'plates-*'`: 21 `plates-night/*` branches, `plates-night-plan`, `plates-verify`, `plates-integrations`. `git ls-remote --heads origin 'keel-*' 'keel/*'`: `keel-night-plan` only (readers accept both names), plus two unrelated `claude/keel-*` work branches.
- `gh api repos/dalmaer/plates/actions/artifacts`: 30 artifacts, all named `plates-*`.
- `gh label list`: 3 `plates:` labels, 0 `keel:` labels.
- The open night PR #348 has head `plates-night/2026-11-05-final`.

## The climb (phase 155)

`gh run list --workflow plates-climb.yml --limit 5`: scheduled runs on 1, 2, 3, 4 and 5 November all concluded failure (latest 42010228882).

## Checks

`npm run roadmap:check` and `node --test tests/roadmap.test.mjs`; their results are in the commit body.

## Gaps and decision

The rewrites change wording and who acts, not what any phase proves, except 125 and 126: their owner box (an install barrier) is replaced by what was observed on plates itself. Not done here: a real Recommend field in Your part (recommendations sit in Why for now), the card text for reviews and health proposals, and a check that refuses an owner item with no question.
