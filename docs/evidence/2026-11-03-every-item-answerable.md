# Evidence: phase 173 — every item waiting on the owner can be answered

- Date: 2026-11-03
- Phase: 173, Every item waiting on me can be answered where I see it
- Revision: branch claude/phase-173 (31b8222c … 1f12e1c3) on claude/phase-156 (`5b661c0a`), and this record
- Claim being checked: every "Needs you" item carries answers in `lib/work-items.mjs`, each with one writer; the same answers in `plates home --json` and `/api/home`; Not now; a decline needs a why; stale claims released with who and why; `plates home --answer`; walks answerable on the web.

## Automated checks

- `node --test tests/web-home-answers.test.mjs tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/claims.test.mjs` — exit 0, 16 pass, 0 fail (conductor).
- `plates prove` on "a walk answered on the web writes what plates home --answer writes in the CLI": VERIFIED (trailer on 1f12e1c3). The web answer and the CLI answer produce the same phase and evidence bytes on one fixture; apply is refused when the box text changed after the preview.
- Builder's focused run (19 test files, with 173 temporarily partial for the activation-plan test): exit 0, 309 pass. `npm run typecheck`: exit 0.
- On the owner's real plates checkout, previews only: `plates home --json` listed 36 items in Needs you, all with answers, none answerable only elsewhere; `--answer plates:claim:claims/phase-129 release` previewed (exit 3, codex idle 8 days) and changed nothing.
- The whole gate, `npm run check`, runs after this file is written, through the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Apply migration 017 (`plates_home.not_now`) on the hosted store | table present | Not run | Not now on the web is unproven live until applied (owner's ⚑) |
| Answer one walk and one proposal on the deployed workspace | commit on GitHub matching the CLI's | Not run | The GitHub API surface for the web writers |

## Gaps and decision

- Partial. Built and proven by test; the hosted surfaces wait on deploy and migration 017.
- On the web, releasing a claim and Hand to an agent stay unavailable, with the reason and the command: the hosted home doesn't read claims, and the App has no Issues write.
- A walk with an authored guided walk (`docs/walks/<id>.json`) keeps phase 98's guided flow; none exist today.
- Feedback items have only Not now in both forms (resolving needs an authored record); a deliberate exception.
- A step's Done works only for a partial phase, because loose ends lists only those.
