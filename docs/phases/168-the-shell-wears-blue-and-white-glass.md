---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [167]
note: "Owner, 2026-11-02: plates and Ledger 'should feel like they are in the same family'. Ledger's materials (glass surfaces, background wash, radius, motion, theme toggle) with plates's own colour: blue and white, cobalt on porcelain. Owner approved reusing Ledger's token values and a blocking theme script."
evidence: []
---

# The shell wears blue and white glass

## Done when

Every workspace page sits on a porcelain-and-cobalt wash, under a glass header with pill navigation and a light, dark or system toggle. A page never flashes the wrong theme while it loads.

## Scope

- **Palette.**
  - Light is porcelain white paper with cobalt ink and actions.
  - Dark is a deep glazed blue with pale porcelain text.
  - The accent and focus ring are Ledger's amber, the colour shared across the family.
  - `theme-color` and the PWA icons follow each scheme.
- **Wash and glass.**
  - A fixed `body::before` wash of three radial gradients sits behind translucent surfaces with `blur(20px) saturate(1.6)`, a hairline border, an inset highlight and a soft two-step shadow.
  - Without `backdrop-filter`, surfaces are 97% opaque.
  - With `prefers-reduced-transparency: reduce`, surfaces are opaque, there is no blur and the wash is flat.
  - With `forced-colors`, system colours are used and shadows are dropped.
- **Navigation.** A sticky glass header shows the active item as a solid action pill. Under 700px it becomes a scrolling pill strip.
- **Theme.** There are three states. With no `data-theme`, the media query decides; an explicit choice stamps `data-theme` and is remembered per device. A small blocking `/assets/theme.mjs` in the head applies it before paint, since the CSP allows no inline script. The toggle lives in the navigation.
- **Motion.** Press feedback at 120ms and transitions at 150ms, all cut by `prefers-reduced-motion`.

## Acceptance

- [ ] No page carries an inline script or style, and the theme script loads before the stylesheet: `tests/web-design.test.mjs: "the theme applies before paint without inline code"`
- [ ] Each fallback (no blur, reduced transparency, forced colours) yields opaque, readable surfaces: `tests/web-design.test.mjs: "glass falls back to solid surfaces"`
- [ ] ⚑ by hand: the owner opens the workspace on a phone and a laptop, in light and dark, and says whether plates and Ledger feel like one family.

## Your part

- **Ask:** Open the workspace on your phone and laptop, in light and dark, with Ledger beside it. Do they feel like one family, and is plates clearly plates?
- **Why:** Only you can judge the resemblance and how strong the cobalt should be.
- **Look at:** the header, navigation and first screen of Home, in both themes.
- **Choices:** Same family | Too alike | Too different (say where)
- **Takes:** 10 minutes.
- **Then:** Same family: the phase is built. Otherwise the named spot is adjusted in this phase.
- **Ready when:** this phase is deployed.

## Real surfaces

- owner's machine: the deployed workspace in the owner's browsers and on their phone.

## Proof

Automated: `node --test tests/web-design.test.mjs tests/web-pwa.test.mjs`; `npm run check`.
By hand: the owner's look, beside Ledger.

## Deliberately open

- **How strong the cobalt is.** Settled by the owner's look.

## Next action

Build it after phase 167.
