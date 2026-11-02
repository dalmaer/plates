---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [152]
note: "From the 2026-11-02 PWA audit: every asset (CSS, page modules, icons) is served private, no-store, with no ETag, through the one serverless function, on every page load."
evidence: []
---

# Workspace pages load from cache after the first visit

## Done when

Every public asset the workspace serves (`/assets/*` CSS, browser modules and icons) is referenced by a URL that carries its content digest. That URL is served `public, max-age=31536000, immutable`. After the first visit, a page load fetches only its HTML and its data.

A changed asset gets a new URL, so a page and its assets always come from the same deployment. An old URL still answers with its old bytes when it is the current asset, and with 404 otherwise. HTML, API responses and anything private stay `private, no-store`.

## Scope

- **One asset table** in `lib/web/` mapping each logical asset (`/assets/home-client.mjs`) to its bytes, type and digest. The many per-path `if` branches in `server.mjs` read from it.
- **References in pages.** Every `href`/`src`, and every module's `import('/assets/…')`, uses the digest URL `/assets/<name>.<digest12>.<ext>`.
  - The module-to-module imports inside browser code are rewritten when the table is built, so a module never imports an undigested sibling.
- **Old paths.** Each logical path still answers `private, no-store`, for compatibility with open pages and the service worker's shell.
- **The worker's shell** precaches the digest URLs. Its version stays the hash of everything it caches.
- The CSP is unchanged: everything is still `'self'`.
- Out of scope: a CDN outside Vercel's own edge, and caching any HTML.

## Integration increments

One merge. It's compatible: the logical paths keep working, and digest URLs are additive. Exposure happens on the owner's deploy. Recovery is a revert: the old paths never stopped answering.

## Acceptance

- [ ] Every asset reference in every rendered page, and every dynamic import in served modules, is a digest URL that the server answers with `public, max-age=31536000, immutable` and the right bytes: `tests/web-assets.test.mjs: "every page references immutable digest assets"`
- [ ] A digest URL that is not current answers 404, and a changed asset gets a new URL: `tests/web-assets.test.mjs: "a digest names exactly one asset"`
- [ ] HTML, API and private routes stay `private, no-store`: `tests/web-assets.test.mjs: "nothing private becomes cacheable"`
- [ ] Live: after deploy, `curl -sI` of a digest asset on the workspace shows the immutable header, and a second page load in a browser serves its assets from cache (DevTools network), by the conductor.

## Real surfaces

- owner's machine: the deployed workspace's response headers, read with `curl -sI`, and a second page load in a browser.

## Proof

Automated: `node --test tests/web-assets.test.mjs tests/web-pwa.test.mjs`; `npm run check`.
By hand: `curl -sI` on the deployed digest URL, and a browser reload on the network panel.

## Deliberately open

- Vercel's edge may also cache public responses (`s-maxage`). This phase sets only browser caching; whether the edge should cache function output is settled by measuring cold-start cost after deploy.

## Next action

Build the asset table, the digest references and the three tests.
