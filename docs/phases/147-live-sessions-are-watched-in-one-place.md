---
status: planned
since: 2026-10-30
goal: G9
spec: 2
depends: [142]
note: "Trial herdr for watching live agent sessions across projects; Plates builds nothing for this unless the trial says so."
evidence: []
---

# The owner sees every live agent session in one place

## Done when

For two weeks the owner watches live Claude, Codex and other agent sessions
across projects in one adopted tool (herdr first), and the decision to keep
it, try another, or drop it is recorded with what it showed that the board
did not.

## Scope

- Adopt, don't build: herdr's sidebar, spaces per repo and SSH machines.
- Plates' part is at most a link from a phase's board entry to its live
  session, and only if the trial keeps herdr.
- Not in scope: cost, approvals or telemetry in the monitor (phases 143–145
  own those).

## Acceptance

- [ ] Two weeks of use and the decision, with what it changed in the owner's day: ⚑ by hand: the owner.

## Your part

- **Ask:** Use herdr for two weeks to watch your agent sessions, then say whether to keep it.
- **Why:** Watching live sessions is a solved problem elsewhere; Plates should not build it.
- **Look at:** [herdr.dev](https://herdr.dev/).
- **Choices:** Keep herdr | Try another | Drop it
- **Takes:** 15 minutes to install; two weeks of use.
- **Then:** Keep herdr: the conductor considers the board link. Try another: cmux or Conductor next. Drop it: the phase is superseded.
- **Ready:** yes

## Real surfaces

- owner's machine: herdr watching real sessions.

## Proof

By hand: the owner's two weeks and decision.

## Deliberately open

- **Single maintainer and API churn.** herdr is mostly one person's, and its
  API changed between 0.7 and 0.8 (found by the Gas City trial, which
  excluded it for that reason). Watching needs no API; keeping it means
  being ready to switch.

## Next action

The owner installs herdr and opens two projects' sessions in it.
