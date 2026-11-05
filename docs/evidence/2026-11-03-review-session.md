# Evidence: phase 174 — a review session takes me through my docket

- Date: 2026-11-03
- Phase: 174, A review session takes me through my docket, one item at a time
- Revision: branch claude/phase-174 (396d1c78, ea66827e, 4b021482) on claude/phase-173, and this record
- Claim being checked: `/review` shows every Needs-you item as one full-screen card with big answers, Undo, Add why and Not now; writes go through phase 173's writers after a 5-second hold; failures come back; the session ends on what it settled; Home has a Start panel; `plates home --review` walks the same docket.

## Automated checks

- `node --test tests/web-review.test.mjs tests/home-isomorphism.test.mjs tests/web-responsive.test.mjs` — exit 0, 20 pass, 0 fail (conductor).
- `tests/web-review.test.mjs` runs the real service with a PGlite Not now store: an answer is sent only after its Undo window, Undo writes nothing, a refused or failed write returns as a card at the end with its reason, a held preview is applied through its route with its digest, an answer that needs a why waits for one, and the end screen lists each write with its link.
- `tests/home-isomorphism.test.mjs` "a review session walks one docket in both forms": the web and terminal sessions show the same items in the same order; the terminal writes only after a yes.
- `tests/web-responsive.test.mjs` "the review card fits a phone" checks the stylesheet rules statically (bottom bar, 44px controls, no overflow at 390px).
- Builder: focused checks over 10 files, exit 0; `npm run typecheck`, exit 0.
- The whole gate, `npm run check`, runs after this file is written, through `plates integrate`.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Conductor looked at the previews (walk light 390px, proposal dark 390px) from fixtures with the real CSS | answers in a thumb-zone bottom bar, readable in both themes, toast with Undo, why prompt on decline | as expected; four-choice card fits; the decline shows "A decline says why" | The layout, not the live writes |
| Builder drove the client in Chrome with a stubbed fetch | keys, Undo, ←, why prompt, Esc | worked | The client logic, not GitHub |
| Owner runs a real session on the phone | — | Not run | The ⚑ walk |

Previews: `scratchpad/preview174/{walk,proposal,step,end,home}-{light,dark}-{390,1280}.png` (session scratchpad, not committed).

## Gaps and decision

- Partial, owes the owner's walk; ready once phases 173 and 174 are deployed with migration 017.
- "If you do nothing" is not in the item model, so the card leaves it out until a Your part carries it.
- "What it set moving" is phase 175's; the end screen lists what was settled and put off.
- Fixed beside the phase (396d1c78): the shell's link colour made the label of any `<a class="button">` the colour of its fill, so error pages' "Sign in" and "Back to your workspace" were unreadable.
