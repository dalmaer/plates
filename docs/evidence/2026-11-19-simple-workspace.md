---
attempt: {"accepted":true,"verified":true,"rework":2,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 196 — the workspace is work, agents and decisions

- Date: 2026-11-19
- Phase: 196
- Revision: main after #497 (Home), the project page integration, #500 (one-step answers), #501 (chat) and #502 (one look, vocabulary, markdown)
- Deployed: production serves a2a6675b (each increment was promoted from `green` after its merge; #502's deploy was the last of the four).
- Claim being checked: Acceptance boxes 1, 2, 5, 6 and the owner's walk as narrowed (decide in place, see Deploy and Assign on their cards, "simpler").

Built by builders (Claude for Home, Codex for the project page, chat and cleanup), verified by the conductor. Rework: Home's answer flow went back twice for review findings (preview before hold, attempt-bound previews, uncertain answers across refresh), and #502 needed its base retargeted from the merged chat branch to main.

## Automated checks (conductor, on main, 2026-11-19)

- `node --import ./tests/helpers/hermetic.mjs --test tests/web-simple-home.test.mjs`: exit 0, pass 21 (boxes 1 and 2).
- `node --import ./tests/helpers/hermetic.mjs --test tests/channel.test.mjs`: exit 0, pass 10 (box 5: chat and CLI lines).
- `node --import ./tests/helpers/hermetic.mjs --test tests/web-simple-copy.test.mjs`: exit 0, pass 6 (box 6).
- `node --import ./tests/helpers/hermetic.mjs --test tests/web-simple-project.test.mjs`: exit 0, pass 12.
- Gate: `npm run check` ran on each PR's CI and passed before merge.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| The owner used the new Home and project pages | "simpler" or "still too much" | The owner, 2026-11-19: "phase 196: simpler" (after Home: "The new home is so much cleaner!") | The simplification works for its user |
| Answered a decision on Home | in place, without leaving the card | answered herdingcats phase 5 on the card (recorded in that repo); the one-step flow (#500) followed | Decisions are answered in place |
| Deploy from a card | the checked promote only | the card shows the exact `plates promote <sha>` command with Copy: promote runs from the owner's checkout, so the site never deploys (a recorded decision) | Deploy stays checked; it is a copy, not a site button |
| Assign from an item | attach | shows the attach preview and command; hosted dispatch waits on phase 181's activation | Assign reaches attach; it does not yet start an agent from the site |

## Gaps and decision

- Box 4 (Assign recommends the agent with the most room by the quota snapshot) is not built: hosted quota delivery is phase 192's next increment. The phase stays partial for it.
- Hosted Assign dispatch is phase 181's activation; the box for assigning from the site so an agent starts stays open for it. Deploy stays a copyable command by decision, and box 2 now says so.
