---
status: planned
since: 2026-11-06
goal: G7
spec: 2
depends: [173, 174]
note: "The owner pressed Done on a step on the web and was told to run a command. Done and Hand to an agent get hosted writers."
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

- [ ] A step's Done on the web previews and writes a `drop` mark to `.plates/loose-ends.json`, and the step leaves Home: `tests/web-home-answers.test.mjs`
- [ ] A Done whose step changed since its preview writes nothing: `tests/web-home-answers.test.mjs`
- [ ] Hand to an agent files the CLI's issue when `issueWrites` is on, and says which permission is missing when it is off: `tests/web-home-answers.test.mjs`
- [ ] No web view renders an answer's command: `tests/web-review.test.mjs`
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

Build increment 1, then 2.
