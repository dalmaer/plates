---
status: partial
owes: walk
since: 2026-10-31
goal: G9
spec: 2
depends: [132, 142]
note: "Each level renders Claude, Codex and ruleset controls and doctor reports drift; applying a ruleset on one project is the walk."
evidence: ["evidence/2026-10-31-autonomy-hosts.md"]
---

# A project's risk level is enforced by the tools, not only written down

## Done when

A project's Low, Medium or High level (phase 132) renders into the controls
its hosts enforce: the Claude Code permission mode and allowed tools, the
Codex sandbox and approval policy, and a GitHub ruleset; `plates doctor`
reports any drift between the level and what the host actually allows.

## Scope

- One mapping table per level, in the practice, from each scope phase 132
  names (local edits, tests, push, merge, deploy, security-sensitive work)
  to: Claude Code `--permission-mode` / allowed tools / hooks; Codex
  `sandbox_mode` and `approval_policy`; GitHub ruleset rules (required
  reviews, protected branches, environments).
- Rendering is a preview by default; applying a ruleset is ⚑ the owner's.
- `doctor` reads the rendered workflows and the repo's rulesets and names
  each place the host allows more than the level.
- Not in scope: enforcing outside GitHub and the two CLIs; a policy engine
  (OPA, Cedar).

## Acceptance

- [x] Each level renders the expected Claude, Codex and ruleset settings, and Low never grants push or merge: `tests/autonomy-hosts.test.mjs: "each level renders its host controls"`.
- [x] A workflow or ruleset that allows more than the level is reported by doctor with the scope it exceeds: `tests/autonomy-hosts.test.mjs: "drift from the level is reported"`.
- [ ] On one fleet project at Medium, the previewed ruleset is applied and a robot push to main is refused by GitHub: ⚑ by hand: the conductor, after the owner's yes.

## Your part

- **Ask:** Turn on GitHub's protection for one project so that only what its risk level allows can reach main (for example, the robot can't push to main directly)?
- **Why:** Today the level is only written down; this makes GitHub enforce it. The conductor shows exactly which rules change before you answer.
- **Look at:** The ruleset preview, posted with this item.
- **Choices:** Apply it | Change the level first | Not yet
- **Recommend:** Apply it
- **Keeps it open:** Not yet
- **Takes:** 5 minutes.
- **Then:** Apply it: the conductor applies it and shows a refused push. Change the level first: you pick the level, and a new preview follows.
- **Ready when:** the conductor has picked a fleet project at Medium and posted its ruleset preview.

## Real surfaces

- GitHub API: the applied ruleset refusing a push.

## Proof

Automated: `node --test tests/autonomy-hosts.test.mjs`; `npm run check`.
By hand: the refused push on one project.

## Deliberately open

- **Headless Claude runs start in Manual mode** and the auto-mode classifier
  is for interactive sessions; the mapping uses explicit allowed tools for
  workflows. Settled per CLI version.
- **Per-door enforcement** waits for phase 145's door classes.

## Next action

The conductor picks a fleet project at Medium and posts its ruleset preview; then the owner's question opens.

