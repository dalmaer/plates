---
status: partial
owes: walk
since: 2026-11-02
goal: G7
spec: 2
depends: [167]
note: "Built and proven by test: porcelain and cobalt over a drawn wash, glass with three solid fallbacks, every text pair at contrast, and a no-flash system/light/dark toggle. The owner's look beside Ledger remains."
evidence: ["evidence/2026-11-02-blue-and-white-glass.md"]
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

- [x] No text pair is short of contrast over the drawn wash, and phase 167's known list is empty: `tests/web-design.test.mjs: "tokens meet contrast over the wash in both themes"`
- [x] No page carries an inline script or style, and the theme script loads before the stylesheet: `tests/web-design.test.mjs: "the theme applies before paint without inline code"`
- [x] Each fallback (no blur, reduced transparency, forced colours) yields opaque, readable surfaces: `tests/web-design.test.mjs: "glass falls back to solid surfaces"`
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
- **Settled 2026-11-02 (build): where the theme script goes.** It is injected where the server decorates every HTML response (`lib/web/pwa.mjs`), right before the first stylesheet. That covers every template at once, instead of each view's `page()`.

## Next action

Walk it: deploy, then the owner compares plates beside Ledger on a phone and a laptop, in light and dark (activation step family-look).

## Trajectory

- **2026-11-02** — Owner walk, first look from the installed app on a phone: "The header is a lil weird. Use the top row to save vertical space. And the widget for dark / light mode on the bottom." Fixed in this phase: brand and pills share one row (the header went from 120px to 57px at 390px), and the theme toggle and Sign out moved to a quiet page footer. Evidence: tests/web-design.test.mjs "the phone header is one row and the theme toggle sits in the footer". The family-look answer is still owed.
- **2026-11-02** — Surfaces are derived tokens (from glass tints), so each fallback (no blur, reduced transparency, forced colours) is one `:root` rule. Evidence: tests/web-design.test.mjs "glass falls back to solid surfaces".
- **2026-11-02** — The theme script is injected at response decoration, not per view, so every template gets it; the CSP needed no change. Evidence: "the theme applies before paint without inline code".
