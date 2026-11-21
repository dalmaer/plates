---
status: planned
since: 2026-11-20
goal: G9
spec: 2
depends: [200]
note: "Filed: for a plate with a Unison workspace, a phase's claim is its item's assignee and lease, renewed by working and fenced so a lapsed holder cannot land."
evidence: []
---

# One claim, held in Unison, with a lease

## Done when

For a plate with a Unison workspace, claiming a phase in plates and starting its item in Unison
are one act with one holder, shown live in Unison and on Home; the claim lapses after a lease
unless its holder keeps working; and a holder whose lease lapsed cannot integrate or merge over
the next holder.

## Scope

- **One claim.** `plates phase claim <n>` starts the phase's item (`unison backlog start`, which
  Unison does atomically) as the worker's Unison participant; `--release` releases it; `plates
  next` reads holders from Unison. Starting the item in Unison is the same claim, read by plates.
  No `claims/phase-<n>` branch is written for such a plate. A Unison that cannot be read means no
  one can claim: unknown is never free.
- **Leases.** A claim lasts a lease (Unison's, 12 hours today) and is renewed by working: plates
  commands, pushes and the review gate renew it. A lapsed claim returns the phase to the queue and
  Home shows "claim lapsed" with the holder's branch and last commit, so the next worker continues
  it rather than starting over.
- **Fencing.** Each claim carries a number that rises with every new holder. `plates integrate`
  and merge check that the worker's number is the current one, so a worker whose lease lapsed
  mid-work cannot land.
- **One identity.** Each plates worker joins the workspace as its own participant, with a pass
  plates mints; the holder's name is the same in Unison, on Home, in the Rex tab label and in the
  claim. Plates links each phase PR to its item (`backlog pr`).
- **Plates without Unison** keep branch claims, which gain the same lease and fencing rules, so
  the two behave alike.

## Integration increments

1. **Leases and fencing for branch claims**, so every plate has one claim model. Proof:
   tests/claim-lease.test.mjs. Recovery: revert; old claims without a lease read as unexpired.
2. **Unison holds the claim** for plates with a workspace. Proof: tests/unison-claim.test.mjs
   against a stub `unison`. Recovery: revert; the plate falls back to branch claims.
3. **One identity**: plates mints passes and joins each worker; PRs are linked to items.

## Acceptance

- [ ] A branch claim lapses after its lease unless renewed, and a lapsed claim shows its holder's branch and last commit: `tests/claim-lease.test.mjs: "a claim lapses unless its holder works"`.
- [ ] A worker whose claim number is not the current one cannot integrate or merge: `tests/claim-lease.test.mjs: "a lapsed holder cannot land"`.
- [ ] Claiming in plates and starting in Unison are one claim; a second claimer is refused either way; an unreadable Unison refuses every claim: `tests/unison-claim.test.mjs: "one claim, wherever it is made"`.
- [ ] ⚑ by hand: owner. Two agents asked for the same phase, one in plates and one in Unison: one holds it, and both Unison and Home name the same holder.

## Your part

- **Ask:** Ask two agents to start the same phase, one through plates and one in Unison, and check that only one gets it and both places name the same one.
- **Why:** It proves the claim is one claim against the real Unison.
- **Look at:** The phase's item in Unison, and Home.
- **Choices:** One holder | Both started
- **Takes:** About 10 minutes.
- **Then:** One holder: the phase is built. Both started: the conductor reads both logs.
- **Ready when:** increment 3 is merged and installed on the Mac.

## Real surfaces

- Owner's machine: `plates phase claim` starts the real item, and `plates next` names the holder Unison names.

## Proof

Automated: `npm run check:focused -- tests/claim-lease.test.mjs tests/unison-claim.test.mjs`,
then `npm run check`.
By hand: the owner's walk above.

## Deliberately open

- Where the fencing number lives until Unison returns one from `start`: plates can keep it in the
  item's comments, which is weaker. Settled when upstream answers.
- Whether the lease length is per workspace. Unison's is fixed at 12 hours today.

## Next action

Increment 1: leases and fencing for branch claims.
