---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [168]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# Home is built from the design layer

## Done when

Home's sections, cards, badges and toolbar use the shared components. `views.mjs` has no colour literals left.

## Scope

- Attention, change, project and coverage cards become `.p-card`, and their state labels become `.p-badge`.
- Toolbar fields are `.p-field`.
- Home's dark-mode hex overrides are deleted, because the tokens carry both themes.
- Blur is capped: long card lists use `--surface-solid`, so a phone scrolls smoothly.
- This builds on phase 166's four sections. If 166 has not landed, it styles the current sections, and 166 inherits the result.

## Acceptance

- [ ] `lib/web/views.mjs` holds no hex, rgb or oklch literal: `tests/web-design.test.mjs: "home uses only tokens"`
- [ ] Home's existing behaviour tests pass unchanged: `tests/web-home.test.mjs`
- [ ] ⚑ by hand: the owner reads Home on a phone and says whether it is calmer and still clear.

## Your part

- **Ask:** Read Home on your phone. Is it calmer, and is it still clear what needs you?
- **Why:** The restyle must not cost clarity.
- **Look at:** the top of Home, then one long scroll.
- **Choices:** Better | Worse (say where)
- **Takes:** 5 minutes.
- **Then:** Better: the phase is built. Worse: the named spot is fixed in this phase.
- **Ready when:** this phase is deployed.

## Real surfaces

- owner's machine: the deployed workspace in the owner's browsers and on their phone.

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-home.test.mjs`; `npm run check`.
By hand: the owner's look on a phone.

## Deliberately open

- **Which lists stay solid.** Measured on the owner's phone.

## Next action

Build it after phase 168.
