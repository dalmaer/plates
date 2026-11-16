---
status: partial
since: 2026-11-16
goal: G7
spec: 2
depends: [149]
note: "Increment 1 (the read-only feed) is deployed. Increment 2 (plates say, migration 024) is built and tested on synthetic stores; box 6 waits on migration 024 applied to the hosted database and its hosted proof."
evidence: ["evidence/2026-11-15-channel-feed.md"]
---

# Each project has a channel on the Plates site

## Done when

Each project has one channel on the owner's Plates site (and the same channel
in the CLI) where the owner sees, newest last, what every agent on it is
doing: who joined and left (claims), what they pushed, opened and merged, CI
and deploys, which agent is waiting on the owner, and the short lines agents
post themselves; a **Here now** panel lists the agents holding work with their
last line and what the owner has not read; the owner can address an agent
from the channel and the agent receives it at its next step; and nothing an
agent posts can make another agent act.

## Why

Claims say who owns what, not what they are doing. Today the owner opens each
session to find out, and agents coordinate through direct cross-session
messages nobody else sees (2026-11-15: a peer session sent this one the M1's
Node upgrade privately). One visible channel per project replaces both.

## Where the state lives

Decided 2026-11-15 by the owner: on the Plates site, not GitHub (public repos,
rate limits, notification noise) and not Discord (another account and token,
and it cannot join claims, the waiting banner or Home). Phase 149's envelope is
reused; Discord becomes an optional one-way mirror (increment 4).

| Line | Source | Stored by this phase |
| --- | --- | --- |
| joined | a claim (`claims/phase-<n>`, its commit time) or an open PR naming the phase | no: read live |
| left | the phase's PR merged or closed, or the claim released (seen gone) | no: read live |
| pushed, PR opened/merged, CI on the default branch | GitHub | no: read live |
| deployed, rolled back | `plates-verify:deploys.jsonl` | no: read live |
| waiting on you | waiting sessions (migration 022) and the docket's unblock group | already stored |
| an agent's post | `plates say` | yes, increment 2 |
| the owner's line, a checkpoint | the site, signed in | yes, increment 3 |

## Scope

- **One read model, two renderers.** `lib/channel.mjs` builds lines from the
  readers plates already has (claims, GitHub, deploys, waiting) with no
  imports of its own beyond pure helpers: `{ at, plate, kind, actor, text,
  ref }`, `kind` one of `joined | left | pushed | pr | ci | deploy | waiting |
  say | owner | checkpoint | gap`. `actor` is the phase (`nerd#1405` style:
  plate and phase; a pull request naming no phase is `nerd!42`, so a pull
  request and a phase with the same number never share an identity, and lines carry `phase` and `pr` as numbers
  that Here now matches on). The CLI prints
  it (`plates channel [<project>] [--since <time>] [--json]`); the web renders
  the same model at `/channel` (All, then one chip per project with its line
  count) and as a Channel section on each plate's page.
- **Here now.** The agents holding work on the project (live claims, open
  agent PRs), each with its phase title, its last line's age, and the owner's
  unread count, or "Caught up".
- **Unread.** The owner's read position per project is the newest line seen,
  kept where Home keeps its cursor; unread counts come from it.
- **Gaps are shown, not hidden.** A source that could not be read becomes a
  `gap` line ("claims unread since 4:20 PM"), never an empty, quiet channel.
- **Bounded.** The feed covers 7 days by default; routine joined/left runs of
  more than three in ten minutes fold into one line ("3 agents rotated").

## Integration increments

1. **The feed, read-only** (no storage, no new route that writes). Proof:
   `tests/channel.test.mjs` on synthetic Acme sources; the CLI and web
   isomorphism tests; `npm run check`. Exposure: `plates channel`, `/channel`,
   the plate page section, a footer link. Recovery: revert the merge.
2. **Agents post** (⚑ migration 024 on the hosted database, the owner's yes).
   `plates say "<text>"` posts one line for this session's project with the
   machine's device key (the same key as `plates sessions push`), tagged with
   `PLATES_SESSION`, provider and the phase this checkout claims. A line is at
   most 280 characters, one per session per minute, kept 14 days, at most 500
   per project; sealed like 022 (ciphertext, digests, times). The agent guide
   says when to post: starting a step, blocked, before holding a shared
   resource (cores, a lock, a migration), finishing. `plates channel --since
   <cursor> --json` lets an agent read its own project's new lines cheaply.
3. **The owner addresses agents.** The owner posts from the site (GitHub
   sign-in, the same form protections as Home's answers). A line that
   `@`-names a phase or session is a checkpoint; `plates channel inbox`
   returns the owner's lines addressed to this session since it last asked,
   and the agent guide says to ask at each step. A checkpoint shows answered
   when that session next says something. Only the owner's lines carry
   authority, through phase 149's envelope (`origin.kind: human`,
   authenticated by the site session); every agent line is an observation and
   triggers nothing.
4. **Mirror out** (optional, ⚑ a bot token): lines that need the owner (waiting,
   CI red on the default branch, an unanswered checkpoint) post one way to the
   phase 149 Discord channel. The site stays the record; a dead webhook loses
   nothing.

## Acceptance

- [x] Lines are built from claims, PRs, CI, deploys and waiting sessions in time order, each with plate, kind, actor and a link, and the same input gives the same lines: `tests/channel.test.mjs: "the feed is built from what plates already reads"`.
- [x] A source that cannot be read is a gap line naming it, and an empty source is not mistaken for a quiet one: `tests/channel.test.mjs: "an unread source is a gap, never quiet"`.
- [x] Here now lists each agent holding work with its title, last line age and unread count, and Caught up when nothing is unread: `tests/channel.test.mjs: "here now is the agents holding work"`.
- [x] `plates channel --json` and `/channel` render the same lines and the same Here now for the same sources: `tests/channel.test.mjs: "the CLI and the web show one channel"`.
- [x] Bursts of joined/left fold into one line and the feed stops at its window: `tests/channel.test.mjs: "routine lines fold and the window holds"`.
- [ ] `plates say` posts one sealed line with session, provider and phase; over-long, too-frequent, key-shaped or keyless posts are refused naming why; the hosted proof shows the table holds ciphertext, digests and times only: `tests/channel-say.test.mjs`.
- [ ] The owner's line naming a phase reaches that session's `plates channel inbox` once, an agent's line naming another agent reaches no inbox, and a checkpoint shows answered after that session's next line: `tests/channel-inbox.test.mjs`.
- [ ] ⚑ By hand: the owner opens the channel for plates on the site and sees today's agents, their lines and Here now match what is running.

## Your part

- **Ask:** Open the Channel page for plates after increment 1 deploys and say whether it shows what is going on.
- **Why:** It decides whether agents should start posting (increment 2) or the feed needs to change first.
- **Look at:** `/channel` on your Plates site.
- **Choices:** Agents should post | Change the feed first
- **Takes:** About 5 minutes.
- **Then:** Agents should post: increment 2 asks for migration 024. Change the feed first: the conductor adjusts it.
- **Recommend:** Agents should post
- **Ready when:** increment 1 is deployed.

## Real surfaces

- adopted project: the hosted workspace shows `/channel` and a plate page's Channel section, read from the live claims, GitHub and deploy records.
- owner's machine: `plates channel` and, from increment 2, `plates say` with the device key.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/channel.test.mjs`
(and `channel-say`, `channel-inbox` with their increments); `npm run check`.
By hand: the owner's read of the deployed channel (Your part).
⚑ Migration 024 is the owner's yes, as every hosted migration.

## Deliberately open

- Whether `left` needs its own record. Claims are deleted on release, so a
  released claim with no PR leaves no trace once it is gone; the feed shows
  it while it last saw it. If owners miss those lines, increment 2's table can
  carry claim events too.
- Whether checkpoints come from plates itself ("45m without a push"), as the
  night's stuck rules already decide, or only from the owner. The first
  version is the owner's only.
- How long a project's lines are kept beyond 14 days.

## Next action

Merge increment 2, apply migration 024 to the hosted database (the owner said yes on 2026-11-16), run its hosted proof (`docs/evidence/2026-11-16-web-channel-posts-hosted-proof.sql`), deploy with `plates promote --migrated lib/web/migrations/024-channel-posts.sql`, then check box 6. Increment 3 (the owner addresses agents) follows.

## Trajectory

- **2026-11-15** Increment 1 built: one pure model (`lib/channel.mjs`) fed by Home's existing claim, PR, changes-in-flight, release and waiting reads, rendered by `plates channel` and `/channel`. Unread is a 24-hour window and `left` is listed as not read; both wait for increment 2's write.
- **2026-11-15** On real plates data most claims were weeks idle: Here now orders holders by activity and folds those idle over the window into one row, or the active agents drown.
- **2026-11-16** — The owner chose "Agents should post" after increment 1 deployed, and said yes to migration 024. Increment 2 reads agents' lines for the whole seven-day window so `--since` still narrows only the feed shown; device keys, which could only push before, can now read their owner's lines.
