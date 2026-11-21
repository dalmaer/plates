---
status: planned
since: 2026-11-21
goal: G0
spec: 2
depends: [44]
note: "Filed: a by-hand walk no longer holds a phase back from built; agents write a Try it for each PR, and Home shows it as optional."
evidence: []
---

# Trying the work by hand is an invitation, never a gate

## Done when

A phase whose only unchecked Acceptance boxes are by-hand walks can be marked built and
passes the roadmap check. Each PR an agent opens for a phase carries a short Try it that
says where to try the change, its steps, and what working and broken look like. Home in
both forms lists open Try its as optional entries the owner can answer (Works,
Something's off, Skip) or ignore, never as work waiting on the owner and never in its
docket count. A ⚑ step that needs money, a login or an owner's decision still waits for
the owner, as before.

## Scope

Walks made the owner the bottleneck: a phase stayed partial (`owes: walk`) until a person
had tried it by hand, and the walks piled up as chores. The owner decided on 2026-11-21
that trying the work should be optional, written by the agent for each PR (design:
docs/research/2026-11-21-just-unison.md, "Try it").

- **The rule.** A `⚑ by hand: <who>` Acceptance box is a walk. Walks no longer count
  toward built: `built` needs every other box checked, and open walk boxes may stay
  unchecked. `owes: walk` remains readable for older records but is no longer needed or
  suggested; the check stops refusing a built phase over open walk boxes. Other ⚑ steps
  (money, a cloud resource, a login, a named person's decision) are unchanged: they stay
  boxes that must be done, or asks in Proof.
- **Existing records.** Every phase that is `partial` with `owes: walk` (or whose only
  open boxes are walks) moves to `built` in this phase, its walk boxes left unchecked
  and its note saying the walk is now optional. That applies to plates's own phases; the
  phases practice carries the new rule to adopted projects through the normal update,
  without rewriting their records.
- **Try it.** The conduct/spin skill, AGENTS.md and the agent guide ask the builder to add
  a `## Try it` section to each phase PR: one line on what changed, where to try it
  (preview URL, deployed site, or a build), three to five steps, and what working and
  broken look like. Where the agent can, it tries the steps itself first (a browser, a
  simulator, a screenshot) and says what it saw.
- **Home.** "Your part" walk cards become optional Try it entries in both forms: lower in
  the order, dismissable, answered Works / Something's off / Skip, and left out of the
  docket count and push notifications. Something's off opens a follow-up (a GitHub issue
  linked to the PR, with the note). Your part sections that ask for a decision or a ⚑
  setup step stay as they are.

Out of scope: the Unison side (phase 200 onward syncs phases; Try it cards in Unison wait
for Unison sections), and removing `plates walk` (it still records answers).

## Integration increments

1. **The rule and the records.** scripts/roadmap.mjs and docs/phases/README.md accept
   built with open walk boxes; plates's walk-only partial phases move to built.
   Compatibility: projects on older plates keep their own check until they update.
   Proof: tests/roadmap.test.mjs. Recovery: revert.
2. **Try it in PRs.** The skill, AGENTS.md and the agent guide; a PR without a Try it on a
   phase PR is a note, never a refusal.
3. **Home.** Try it entries in both forms, out of the docket and notifications.

## Acceptance

- [ ] A phase whose only unchecked boxes are `⚑ by hand` walks passes the roadmap check as built, and one with an unchecked buildable box still does not: `tests/roadmap.test.mjs: "a by-hand walk never holds a phase back from built"`.
- [ ] Every plates phase that was partial only for a walk is built after this phase, with its walk boxes unchecked: `node scripts/roadmap.mjs --check`.
- [ ] Home lists an open walk as an optional Try it in both forms, answerable Works, Something's off or Skip, outside the docket count and push notifications; a ⚑ setup step or decision still waits on the owner: `tests/home-try-it.test.mjs: "a walk is an optional Try it on Home, never waiting on the owner"`.
- [ ] The conduct and spin skills, AGENTS.md and the agent guide ask for a Try it on each phase PR: `tests/guides.test.mjs: "phase PRs carry a Try it"`.

## Real surfaces

- Owner's machine: `plates home` on this Mac lists the former walks as optional Try its, and the docket count drops by them.

## Proof

Automated: `npm run check:focused -- tests/roadmap.test.mjs tests/home-try-it.test.mjs tests/guides.test.mjs`,
then `npm run check`.
By hand: none required; the owner may try Home on their phone.

## Deliberately open

- Whether a Something's off should reopen the phase rather than open a follow-up. A
  follow-up keeps built honest to what was proven; reopening is simpler to find. Open
  until it has been used.
- Fleet projects keep their walk records as they are until the owner asks to move them.

## Next action

Increment 1: the rule in scripts/roadmap.mjs and the README, and plates's walk-only phases moved to built.
