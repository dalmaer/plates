---
status: built
since: 2026-11-21
goal: G0
spec: 2
depends: [44]
note: "Built: walks are ⚑ try: and never hold a phase back; decisions, approvals and setup steps kept; PRs carry a Try it; Home at main (83f65c47) lists phase 65 as an optional Try it outside the docket, with 59 and 193 waiting on their reasons."
evidence: ["evidence/2026-11-21-try-it-not-a-gate.md"]
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
- **Existing records.** The owner decided on 2026-11-21 to remove walks from every
  existing plates phase, not leave them open: each `⚑ by hand` walk box is deleted, and
  each `## Your part` that asked only for a walk is deleted (a Your part asking for a
  decision or a ⚑ setup step stays). A phase that was partial only for walks becomes
  built. Evidence files are history and are not edited. `plates phase new` and the README
  stop suggesting walks. Adopted projects' records are moved separately, once this lands.
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

- [x] A phase whose only unchecked boxes are `⚑ by hand` walks passes the roadmap check as built, and one with an unchecked buildable box still does not: `tests/roadmap.test.mjs: "a by-hand walk never holds a phase back from built"`.
- [x] No plates phase has a `⚑ by hand` walk box or a walk-only Your part, and every phase that was partial only for walks is built: `node scripts/roadmap.mjs --check`.
- [x] Home lists an open walk as an optional Try it in both forms, answerable Works, Something's off or Skip, outside the docket count and push notifications; a ⚑ setup step or decision still waits on the owner: `tests/home-try-it.test.mjs: "a walk is an optional Try it on Home, never waiting on the owner"`.
- [x] The conduct and spin skills, AGENTS.md and the agent guide ask for a Try it on each phase PR: `tests/guides.test.mjs: "phase PRs carry a Try it"`.

- [x] On the owner's machine, after merge, Home lists a ready Try it (phase 65) with its three answers and leaves it out of the docket, and keeps not-ready ones (59: its Ready when; 193: waits on 192) waiting with their reason: `plates home --project plates --json`.

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

None for this phase. Moving adopted projects' walk records waits on the owner. Installed runtimes older than this phase (0.9.1) report `⚑ try:` phase files as unreadable until the next release is installed.

## Trajectory

- **2026-11-21** — A Try it still honours its phase's Ready when: phase 65's "Ready when: this is built", written when the walk was the last step, could never be met once the walk became optional, so it became Ready: yes. Other walks' Ready when lines deserve the same look when they come up.

- **2026-11-21** — Not every `⚑ by hand` box is a walk: a fleet rehearsal found decisions, approvals and setup steps written the same way, so only boxes now written `⚑ try:` are optional, and the check never guesses from prose. 61 kept and unsure boxes stay; the blanket removal was reworked.
- **2026-11-21** — Home builds an owner's walk card only for a phase marked `owes: walk`, so phases whose remaining owner boxes are decisions keep `owes: walk` until the walk machinery is simplified.
- **2026-11-21** — The installed plates 0.9.1 predates this phase, so its Home skipped phases 59 and 65 as "could not be read or validated" while main's own CLI read them. A record format change reaches the owner's Home only with a release; walk such boxes with the checkout's CLI until then.
