---
status: partial
owes: walk
since: 2026-11-02
goal: G7
spec: 2
depends: [168]
note: "Built and proven by test: views.mjs takes every colour from a token, Home cards, labels and fields use the shared components, and long lists stay solid. The owner's look on a phone remains."
evidence: ["evidence/2026-11-02-home-design-layer.md"]
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

- [x] `lib/web/views.mjs` holds no hex, rgb or oklch literal: `tests/web-design.test.mjs: "home uses only tokens"`
- [x] Home's existing behaviour tests pass unchanged: `tests/web-home.test.mjs`
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

- **Settled 2026-11-02 (build): which lists stay solid.** All of them. `.p-card` is solid, only the header and panels blur, and `.p-card.p-glass` is the opt-in. The owner's phone walk can still ask for more glass.

## Next action

Walk it: the owner reads Home on a phone after the deploy (activation step home-calmer).

## Trajectory

- **2026-11-02** — Home needed four state tokens (warn, warn-tint, ok-tint, sunken), each with contrast pairs in both themes. Dark tints moved from olive and brown into the blue family. Evidence: tests/web-design.test.mjs.
