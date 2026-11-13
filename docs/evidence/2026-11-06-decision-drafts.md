---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 182 — an agent drafts a decision, never answers it (increment 1)

- Date: 2026-11-06
- Phase: 182
- Revision: "feat: an agent drafts a decision, never answers it (phase 182, increment 1)" (e0a63232) and this record's commit
- Claim being checked: `plates home --assist` records an attributed recommendation with evidence, which shows on the card and is withdrawn when the phase file moves; nothing records an answer.

## Automated checks

- The builder ran `node --test tests/backlog-assist.test.mjs`: exit 0, 2 of 2 ("assists never decide", "a stale recommendation is withdrawn"). `npm run check:focused` over backlog-assist, backlog-attach, home-isomorphism, web-backlog, work-items, surface-budget, record-validation, names-verify, names-observation, web-design, web-home and web-home-answers: exit 0.
- A preview on plates itself (`plates home --assist plates:phase:182 …`) exited 3 and wrote nothing.

## Found while building

No digest-bound write path holds an agent's recommendation: decision writes record the owner's answer. Drafts live locally under the git dir (`.git/plates-assist`), and only the CLI reads them. The hosted backlog needs its own store, for example a drafts branch written through `createCommitOnBranch`. Walk-prep needs a defined "tested revision" first.

## Gaps and decision

Partial. Still to come: walk-prep, shape, and the hosted drafts store. Flags went from 208 to 211.
