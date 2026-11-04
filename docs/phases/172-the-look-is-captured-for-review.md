---
status: partial
owes: walk
since: 2026-11-04
goal: G7
spec: 2
depends: [171]
note: "Built: npm run look captures every page type in light and dark at phone and laptop widths from fixture data. Owes the owner's review of one design change from its captures."
evidence: ["evidence/2026-11-04-look-captured.md"]
---

# The look is captured for review

## Done when

A local script captures each workspace page type in light and dark at phone and laptop widths. A visual change can then be reviewed from pictures instead of words.

## Scope

- The script runs locally against fixture data ("Acme"), never against the hosted instance or real projects.
- Images stay out of git. The script writes them to a temporary folder and prints their paths.
- It does not compare pixels automatically. A person or reviewer looks at the images.

## Acceptance

- [x] The script produces one image per page type, theme and width from fixture data: `tests/web-design.test.mjs: "captures cover every page type"`
- [ ] ⚑ by hand: the owner uses the captures to review one design change.

## Your part

- **Ask:** Review one design change from its captured images instead of opening the app.
- **Why:** This decides whether captures are worth keeping.
- **Look at:** the printed image folder.
- **Choices:** Useful | Not worth it
- **Takes:** 5 minutes.
- **Then:** Useful: the phase is built. Not worth it: the phase is superseded.
- **Ready when:** the script exists and one design change is pending.

## Real surfaces

- owner's machine: the deployed workspace in the owner's browsers and on their phone.

## Proof

Automated: `node --test tests/web-design.test.mjs`.
By hand: the owner reviews one change from its captures.

## Deliberately open

- **Whether this is worth it.** It is optional, and it waits until phases 167–171 show how often looks regress.

## Next action

The owner's review: run `npm run look`, open the printed folder for one pending design change, and choose Useful or Not worth it.

## Trajectory
- **2026-11-04** — The golden's fixture pages moved into a shared helper the capture also reads, so the two cannot disagree about which pages exist; and the captures showed the Changes page's date filter hiding older changes in a fresh browser. docs/evidence/2026-11-04-look-captured.md.
