---
status: partial
since: 2026-11-04
goal: G7
spec: 2
depends: [151, 156]
note: "Owner, 2026-11-02: 'When I login I find it hard to know what to do.' Home should say what needs attention, what happened recently, and let the owner ask for work next. Builds on phase 156's one read model."
evidence: ["evidence/2026-11-04-home-four-sections.md"]
---

# Home says what needs you, what happened and what is next

## Done when

The hosted home and `plates home` show the same four sections, in this order, with the same items and counts:

1. **Needs you.** One ranked list of everything waiting on the owner. Each row has one verb:
   - **Decide**: decisions and health proposals.
   - **Try it**: walks that are ready.
   - **Fix**: a failed night, a red default branch, a PR stopped at its review-round limit, and a plate whose source the owner must repair.

   Items waiting on time or on agents leave the home page and move to the project's page.
2. **Since you last looked.** What happened across the fleet since the owner's last visit, in plain sentences grouped by plate: merges, releases, phases built, night results, fleet updates installed.
3. **What should happen next?** Pick a plate, write the ask, and send it to tonight's plan (the default) or to an agent issue now. Both go through the existing previews and approvals. What is already queued is listed.
4. **Your plates.** A compact strip, one status each: "N for you", "broken" or "all clear". Problems reading sources collapse into one line with the details behind it.

## Scope

- **The read model.** The four sections are one model, `lib/work-items.mjs` from phase 156. The web view renders HTML from it, and `plates home --json` gives the shape of `/api/home`.
- **"Last looked"** is a per-user timestamp the hosted service stores on each home visit. The CLI uses the time of its own last run. Neither stores any project content.
- **The ask box** reuses two existing write paths: the night-plan publication behind `plates goodnight add --title`, and the agent-issue preview behind `plates issue new --agent`. Each keeps its preview, digest and explicit approval. Nothing is queued without the owner's confirmation.
- **The copy pass:**
  - The headings are the four above.
  - Hedges ("At least", "in this source read", "Inspection only") move to one footer line, and each count says "known" only when coverage is partial.
  - Source problems never sit above "Needs you".
- Out of scope: new write actions, notifications (phase 152), and any change to what a source means.

## Integration increments

1. After phase 156's model move: the four-section model and `plates home --json`, with the web still on the old layout.
2. The web renders the four sections, and the old sections are removed.
3. The ask box, with both write paths behind their existing approvals.
4. "Last looked", with its store migration applied on the hosted instance (the owner's ⚑ step).

## Acceptance

- [x] `plates home --json` and `/api/home` return the same four sections, items and counts for the same fixture sources: `tests/home-isomorphism.test.mjs: "the four home sections are one model"`
- [x] "Needs you" ranks fix, decide and try items, and holds no item waiting on time or agents: `tests/work-items.test.mjs: "needs you holds only the owner's turn"`
- [ ] "Since you last looked" lists only what happened after the stored visit: `tests/web-home.test.mjs: "since you last looked starts at the last visit"`
- [ ] The ask box previews both paths and writes nothing without the reviewed digest: `tests/web-home.test.mjs: "an ask is queued only after its preview is approved"`
- [ ] ⚑ by hand: the owner opens home on the phone and says whether it is clear what to do next.

## Your part

- **Ask:** Open the workspace on your phone and say whether it is obvious what needs you, what happened and how to ask for something.
- **Why:** Clarity is the whole point of this phase, and only you can judge it.
- **Look at:** The top of the home page, before scrolling.
- **Choices:** Clear | Still confusing (say where)
- **Takes:** 5 minutes.
- **Then:** Clear: the phase is built. Still confusing: the named spot is fixed in this phase.
- **Ready when:** phases 156 and 163 are built, and this phase is deployed.

## Real surfaces

- owner's machine: the deployed workspace on the owner's phone, and `plates home` in a terminal beside it.

## Proof

Automated: `node --test tests/home-isomorphism.test.mjs tests/work-items.test.mjs tests/web-home.test.mjs`; `npm run check`.
By hand: the owner's look on the phone.

## Deliberately open

- **Ranking inside "Needs you."** The proposed order is fix, then decide, then try, oldest first. It is settled by the owner's walk.
- **2026-11-02, settled:** phase 156's plan merged (#316), and `depends:` now names it.

## Next action

Increment 3: the ask box, with both write paths behind their existing previews and approvals.

## Trajectory

- **2026-11-04** — A plate that could not be read is "not read", a fourth status beside broken, N for you and all clear: calling it either of the others would be false. tests/home-isomorphism.test.mjs "the four home sections are one model".
- **2026-11-04** — On the owner's fleet, Needs you holds 35 items and no fix: every item is a decision or a walk, so the ranking's first tier is empty today. docs/evidence/2026-11-04-home-four-sections.md.
- **2026-11-04** — On the web, an item's answers open the review session rather than becoming buttons on Home, so there is one answer flow; and the Start panel counts what Needs you counts, since a row with no answers made the two disagree. tests/web-home.test.mjs.
