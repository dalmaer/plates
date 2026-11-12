---
status: partial
since: 2026-11-06
goal: G7
spec: 2
depends: [173, 174]
note: "Built: hosted walk previews read eight blobs at a time (the 503), no web view shows a command, Done on a step writes its mark from the card, and Merge from Review completes. Hand to an agent stays unavailable on the web (increment 3). Owes the owner's phone walk after deploy."
evidence: ["evidence/2026-11-06-hosted-answers.md"]
---

# Every answer on a card is a button that works

## Done when

On the hosted workspace, a step's **Done** and **Hand to an agent** write from the card, through the same preview-then-confirm flow as a walk's answer. No web surface tells the owner to run a terminal command to answer. An answer the web still cannot write says what is missing (a permission, a setting) in plain words, never as a command. The CLI writes the same records as before.

## Scope

- **Done on a step** (`loose-ends mark`): on the web, a preview of the change to the plate's `.plates/loose-ends.json` (a `drop` mark, fingerprint `phase:<n>`, the owner's why as its reason), applied through `/api/projects/<id>/decisions/apply` under `decisionWrites`, re-checked against the default branch at apply as walk answers are. Home already stops listing a step once its mark is on the default branch.
- **Hand to an agent** (`agent issue`): on the web, a preview of the agent issue the CLI would file (`agentIssueFor`), filed through the App when the plate grants it Issues write (`issueWrites`, as `mergeWrites` gates a merge). Without the grant the answer says so: the permission and where to grant it.
- **The review session and Home cards** show an unavailable answer's reason, not its command. The CLI keeps its commands.
- **The question heading** in the review session takes focus for screen readers without drawing a focus ring.
- Out of scope: the other CLI-only writers (`learn decide`, `lessons send`, `claim release`, `pr comment`), which keep their reasons; a later phase can take them.

## Real surfaces

- adopted project: the hosted workspace writes a step's mark to a fleet repo through the GitHub App, and Home stops listing it.
- GitHub API: an agent issue filed through the App on a plate that grants Issues write.

## Integration increments

1. The focus ring and the web wording: unavailable answers state the reason only. Safe alone.
2. The hosted `loose-ends mark` writer for steps, behind `decisionWrites`. Recovery: unset `decisionWrites` or revert.
3. The hosted `agent issue` writer, behind `issueWrites`. Off until the owner grants Issues write.

## Acceptance

- [x] A step's Done on the web previews and writes a `drop` mark to `.plates/loose-ends.json`, and the step leaves Home: `tests/web-home-answers.test.mjs`
- [x] A Done whose step changed since its preview writes nothing: `tests/web-home-answers.test.mjs`
- [ ] Hand to an agent files the CLI's issue when `issueWrites` is on, and says which permission is missing when it is off: `tests/web-home-answers.test.mjs`
- [x] No web view renders an answer's command: `tests/web-review.test.mjs`
- [ ] ⚑ by hand: the owner presses Done on a step from their phone, and it leaves Home.

## Your part

- **Ask:** On your phone, open Review, press Done on a step, type a one-line why, and confirm. Does the step leave Home?
- **Why:** It is the case that failed: a button that told you to open a terminal.
- **Look at:** The step's card in Review, then Home after the write.
- **Choices:** It worked | It wrote but the step is still listed | It asked me to run something
- **Recommend:** It worked
- **Takes:** 2 minutes
- **Ready when:** this phase is deployed.

## Proof

`npm run check:focused -- tests/web-home-answers.test.mjs tests/web-review.test.mjs`

## Deliberately open

- Whether a Done on the web also records a line in the phase's Trajectory. The CLI does not, so neither does the web here.

## Next action

The owner walks Done on a step from their phone after deploy. Then increment 3: a hosted agent issue (the intent and lock in the operation store, an App-token adapter for lookup and recovery, a label decision without a checkout, an issues permission in access and `issueWrites`).

## Trajectory

- **2026-11-06** — Hosted walk answers returned 503 upstream_unavailable: the preview read all 180 phase files one blob at a time under a 25s deadline. Reads now run eight at a time and the inventory limit is 400, so a long-lived plate keeps working.
- **2026-11-06** — Hand to an agent cannot simply move to the web: `ensureRobotIssue` keeps its intents and locks as files in a checkout and labels through it. It needs its own increment, not a wrapper.
- **2026-11-06** — Merge from the Review session never completed: its preview reply was counted as a failure because `pr merge` was missing from the client's previewed writers. Found while building this phase; fixed with a test.
