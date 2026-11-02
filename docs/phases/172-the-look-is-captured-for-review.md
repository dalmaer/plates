---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [171]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# The look is captured for review

## Done when

A local script captures each workspace page type in light and dark at phone and laptop widths. A visual change can then be reviewed from pictures instead of words.

## Scope

- The script runs locally against fixture data ("Acme"), never against the hosted instance or real projects.
- Images stay out of git. The script writes them to a temporary folder and prints their paths.
- It does not compare pixels automatically. A person or reviewer looks at the images.

## Acceptance

- [ ] The script produces one image per page type, theme and width from fixture data: `tests/web-design.test.mjs: "captures cover every page type"`
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

Build it after phase 171.
