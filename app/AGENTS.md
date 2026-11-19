# Plates on the iPhone

The simple view of the workspace (docs/phases/196: work, agents and decisions) as a native
app, built with [Exact](https://github.com/expo/exact). It is the third renderer of one read
model: `plates home`, the hosted site and this app draw the same values, with the same words
and the same five rules. Read `DESIGN.md` for how it reaches live data and answers safely.

- **Increment 1 reads a bundled sample and sends nothing.** `fixture/acme.json` is synthetic
  (Acme does not exist) and shaped as the hosted workspace answers: `home.glance`
  (lib/work-items.mjs `homeGlance`), each project (lib/web/simple-project-model.mjs) and
  `channel.lines` (lib/channel.mjs). `tests/app-fixture.test.mjs` in the repo root holds the
  sample to those modules, so a change to the model fails there before it drifts here. Never
  put a real project's data in the sample.
- **The screen and its words live in `app.contract`**; `app.ts` only cuts the hosted shapes
  to the screen's. A rule of the simple view changes in all three renderers or in none.
- **Colours are tokens.** `app.forma` mirrors the workspace's chip tones from
  lib/web/design.mjs; everything else is a platform role. No literals in `app.contract`.
- **Exact is pinned** in `exact.json`; moving the pin is its own commit, with
  `npm run exact:check` green on it. The checkout is found at `../../exact` from the app's
  folder in the main working tree (`EXACT` overrides it). Before writing Contract read its
  `docs/start-here.md` and look names up with `./exact.mjs contract vocab <name>`.
- **Gate:** `npm run exact:check` (the contract build, which type-checks `app.ts`, then
  `app.test.contract` on the web host); `npm run verify` to look, in light and dark, at two
  widths and at the largest text size. Both need Rust on the PATH (the scripts add it) and a
  Chromium: Exact's pinned one (`exact setup`), or `CHROME` naming an installed Chrome.
- **Nothing here signs, installs or publishes.** There is no device install, update origin
  or signing configuration yet; each is an owner decision in `DESIGN.md`.
- `tools/icon.sh` redraws `assets/icon.png` from the workspace's own icon
  (lib/web/pwa-icons.mjs).

<!-- exact:begin (exact new writes this block; bun exact.mjs update rewrites it) -->
# app: an Exact app

`app.contract` is the view, `app.ts` the data module, `app.test.contract` the tests, `app.json`
the manifest: set `app.name` and `app.id` before building. The app uses Exact at
`../../exact` by path (`EXACT` overrides it).

This file is already in your instructions. Start from the nearest pattern: `bun exact.mjs
pattern` lists them and `pattern <name>` writes one, tested. ../../exact/docs/start-here-site.md (a site) or
../../exact/docs/start-here.md is the only required reading. `bun exact.mjs contract vocab <name>` answers a
name (none: the card); `bun exact.mjs docs <heading words>` a guide's
section. Run `bun exact.mjs verify` when the features work, and `verify ios|android` at the end for a
phone app. When an iPhone app is ready to try, run `bun exact.mjs share` and send its link;
repeat for each change the person should see. `bun exact.mjs help` lists the verbs, including
app.json's `"commands"`.
`bun exact.mjs update` refreshes files. Native verbs (`ios`, `mac`, `linux`, `android`, `windows`)
name their platform in app.json on first use and build in a generated workspace;
`update --without <platform>` stops shipping it.
`bun ../../exact/scripts/exact.mjs setup --check` names what a native build lacks.

Generated, so don't edit: `exact.mjs` and this block.

## Feedback (required)

When a doc was wrong or missing, a workaround was needed, something took several tries or a
command confused you, record it: `bun exact.mjs feedback note "<what happened>"`. It attaches
exact2's commit and the last exit code, never output or code. `bun exact.mjs feedback status` says
whether notes are sent and whether to keep a diary; under `never`, skip all of this.
<!-- exact:end -->
