---
status: partial
since: 2026-11-19
goal: G7
spec: 2
depends: [194]
note: "All four increments are deployed (production a2a6675b) and the owner called it simpler (2026-11-19). Two boxes remain: Assign recommending the agent with the most room by the quota snapshot (phase 192 hosted quota delivery). and assigning from the site so an agent starts (phase 181 hosted dispatch). Deploy stays a copyable promote command by decision."
evidence: ["evidence/2026-11-17-project-backlog.md", "evidence/2026-11-19-simple-workspace.md"]
---

# The workspace is work, agents and decisions

## Done when

The owner opens the Plates site and sees only three things: a **backlog** of
work in order, the **agents** working on it (and what they are saying), and
the **decisions** only the owner can make, each answerable where it is shown.
Everything plates keeps underneath (phases, goals, increments, claims,
evidence, captures, lessons, runs) stays available behind an item, never as a
page of its own. Nothing is shown when nothing is wrong, and every card carries
its own action.

## Why

The owner, 2026-11-17: Decide "always feels hard"; a needs-you item makes them
"jump out all over"; main → production "feels like a waste" when equal and is
misaligned; the channel "looks like a list"; markdown shows raw `**`; phases,
goals and items confuse; Changes, Captures and Plan from project evidence never
show anything. Plates exposes its plumbing. Attach (181), the channel (194)
and the docket already exist underneath; this phase changes what the owner
sees, not the systems.

## Scope

The hosted workspace's Home and project pages, and `plates home`'s matching output. No new storage, routes that write, or migrations: answers go through the docket, Deploy through the checked promote, Assign through attach (181), the channel through 194.

## The model

| The owner sees | Built from |
| --- | --- |
| A backlog item: one piece of work, in order | A phase's next increment, or an issue the backlog already reads. Goals are a filter, not a view. |
| An agent: who is on an item and what it is doing | Claims, attach receipts, Rex state, the channel's Here now |
| A decision: a question only the owner can answer | The docket, ⚑ steps, reviews at their limit, migrations, walks, deploys waiting |

## Rules every screen keeps

1. **Exceptions only.** A project in step (production = main, nothing
   waiting) shows a green chip and nothing else.
2. **Act where you look.** Answer, deploy, assign and cancel happen on the card.
3. **Empty means hidden.** A section with nothing in it is not drawn.
4. **One vocabulary.** On screen: item, agent, decision. Never phase,
   increment, claim, envelope, lane.
5. **Text renders.** Markdown in any shown text renders; no raw `**`.

CLI–web isomorphism holds: `plates home` prints the same model the site
renders. Colours come from design tokens, never page literals.

## Integration increments

1. **Home.** One status chip per project: green chips say nothing; a yellow or
   red chip says why in one line (production behind main, an agent waiting on
   you, main's checks failing, a review at its limit, a decision past its
   check date; the most urgent, then "+N"); trouble sorts first. Below it one
   list, **Needs you**: each decision a card with the question, the
   recommendation marked, a one-line why, its answer buttons and an
   expandable "more" for evidence; answering happens on the card (the docket's
   existing answer path and its protections). A production behind main is a
   card with **Deploy**, which runs the same checked promote as
   `plates promote` (only to a commit on the tested ref whose gate passed;
   rollback kept). The main → production row is removed from Home.
2. **The project page: backlog and needs you.** The project's decisions as the
   same cards; then one ordered **Backlog**: each item one line with its state
   (Ready, Agent working, Needs you, Done), its title, who is on it; a Ready
   item has **Assign** (the routes this plate offers: a Rex harness, a session,
   Codex where configured), which is attach (181) with its preview and claim.
   Assign recommends the agent with the most room by the quota snapshot plates
   already reads (phase 192's room check, phase 106's routing policy) and says
   why in a few words ("Codex: 54% of its week left; Claude's Fable allowance
   resets Wednesday"); an unknown or stale snapshot recommends nothing and
   says so;
   an item opens to its Done when and Next, rendered. No main → production row
   when they match; when they do not, the Deploy card.
3. **The channel is a chat.** Agents with an avatar and grouped bubbles,
   plates's own steps as small grey lines, the owner's lines on the right, a
   composer at the bottom (194's owner lines), @-mentions of an item or agent,
   answered marks.
4. **Remove what the model replaced.** Changes, Captures and Plan from project
   evidence are hidden when empty and folded behind an item otherwise; phases
   and goals pages leave the navigation (reachable from an item); markdown
   renders everywhere text is shown.

Each increment lands and deploys on its own; the pages it replaces stay
reachable by URL until increment 4.

## Acceptance

- [x] Home shows a chip per project; a green one has no text beyond its name; a non-green one names its most urgent reason, and red sorts before yellow before green: `tests/web-simple-home.test.mjs`.
- [x] Every Needs-you card answers in place through the docket's answer path, and a waiting deploy is a card that shows the exact checked `plates promote` command with Copy (the site never deploys, by decision): `tests/web-simple-home.test.mjs`.
- [x] The project page shows one ordered backlog with four states, Assign on ready items through attach, and no main → production row when they match: `tests/web-simple-project.test.mjs`.
- [ ] Assign recommends the agent with the most room by the quota snapshot and explains it; a stale or unknown snapshot recommends nothing: `tests/web-simple-project.test.mjs`.
- [x] The channel renders as a chat with a composer, and the CLI prints the same lines: `tests/channel.test.mjs`.
- [x] No empty section is drawn, no raw markdown is shown, and the screens use only item, agent and decision: `tests/web-simple-copy.test.mjs`.
- [x] `plates home` and the site render one model for Home and a project: the isomorphism tests.
- [x] ⚑ By hand: the owner makes a decision from the site without leaving the card, sees the Deploy command and the Assign preview on their cards, and says it is simpler.
- [ ] ⚑ By hand: the owner assigns an item from the site and an agent starts, without leaving the card (waits on phase 181's hosted dispatch).

## Your part

- **Ask:** Use the new Home and project page after each increment deploys and say what still feels complicated.
- **Why:** The measure is whether you can decide, deploy and assign without hunting.
- **Look at:** your Plates site.
- **Choices:** Simpler | Still too much
- **Takes:** About 5 minutes per increment.
- **Then:** Simpler: the next increment. Still too much: the conductor changes it first.
- **Recommend:** Simpler
- **Ready when:** increment 1 is deployed.

## Real surfaces

- adopted project: the hosted workspace's Home and project pages, read from the live sources.
- owner's machine: `plates home` prints the same model.

## Proof

Automated: the named tests; `npm run check`. By hand: the owner's walk.

## Deliberately open

- Assign on the hosted site dispatches only once phase 181's hosted apply is activated; until then the site's Assign shows the exact `plates home --attach` command to run on the owner's Mac (as Deploy shows `plates promote`), and the CLI attaches directly. The quota recommendation reuses phase 192's built room check, so 196 does not wait on 192's remaining walk.

- **2026-11-17, increment 2:** the four states describe actionable work. Dependency-blocked items stay behind their prerequisite; other waiting work is collapsed with its source reason. Unknown assignment reads retain their gap and offer no Assign command. No source work is relabelled Ready.
- **2026-11-17, increment 2:** the existing provider quota reader is loopback-only. CLI and a locally served site can read it; the hosted site reports unavailable until phase 192 increment 4 supplies hosted quota delivery. Recommendation tests do not establish that hosted delivery.

- Whether goals survive as a backlog filter.
- How Assign maps to the owner's other tool's flow (the owner will point to it).
- Drag to reorder the backlog (needs a stored order; later).

## Next action

Build box 4 when phase 192's hosted quota delivery lands: Assign recommends the agent with the most room by the quota snapshot and says why. Hosted Assign dispatch is phase 181's activation.

## Trajectory

- **2026-11-17** — The owner approved a clickable mock of the three-thing model and asked for non-green projects to say why on their chip.
- **2026-11-17** — The owner asked that quota decide which models do the work. Assign reuses the quota snapshot plates already reads for audits (192) and the routing policy (106) rather than a new mechanism.
- **2026-11-17** — Increment 1 deployed as 3d805c7. Deploy stays a copyable `plates promote` command: promote runs from the owner's checkout, and a hosted deploy would bypass its checks. Increment 2 is attached to Codex in Rex, chosen by quota (Claude 93% of its week used, Codex 48%).

- **2026-11-17** — Increment 2 found that the existing backlog includes non-actionable waiting work and quota is local-only. Waiting records remain in item/source details, while missing hosted quota stays an explicit gap; neither limitation becomes fabricated readiness. See the increment-2 evidence.
- **2026-11-19** — The owner, after using it: "phase 196: simpler". Home, the project page, the chat and the site-wide cleanup are all deployed; the quota recommendation on Assign is the one box left.
