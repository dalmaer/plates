---
status: partial
owes: walk
since: 2026-11-02
goal: G7
spec: 2
depends: [152]
note: "Built and proven by test: one asset table, digest URLs served immutable, logical paths still private, pages and modules reference only digest URLs, and the worker precaches them. Live headers verified on the deployed workspace on 2026-11-02; the owner's cached reload remains."
evidence: ["evidence/2026-11-02-cached-assets.md"]
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

- [x] Every asset reference in every rendered page, and every dynamic import in served modules, is a digest URL that the server answers with `public, max-age=31536000, immutable` and the right bytes: `tests/web-assets.test.mjs: "every page references immutable digest assets"`
- [x] A digest URL that is not current answers 404, and a changed asset gets a new URL: `tests/web-assets.test.mjs: "a digest names exactly one asset"`
- [x] HTML, API and private routes stay `private, no-store`: `tests/web-assets.test.mjs: "nothing private becomes cacheable"`
- [ ] ⚑ by hand: the conductor, after the owner deploys: a curl -sI of a digest asset on the workspace shows the immutable header, and a second signed-in page load serves its assets from cache (network panel).

## Real surfaces

- owner's machine: the deployed workspace's response headers, read with `curl -sI`, and a second page load in a browser.

## Proof

Automated: `node --test tests/web-assets.test.mjs tests/web-pwa.test.mjs`; `npm run check`.
By hand: `curl -sI` on the deployed digest URL, and a browser reload on the network panel.

## Deliberately open

- Vercel's edge may also cache public responses (`s-maxage`). This phase sets only browser caching; whether the edge should cache function output is settled by measuring cold-start cost after deploy.

## Next action

The owner reloads a signed-in page with the network panel open and sees its assets served from cache.

## Trajectory

- **2026-11-02** — Pages are rewritten to digest URLs at `respond()`, the one place every page passes through, not by a helper in each view. Browser-shared views render no asset references in the browser, so there is no second rendering path. lib/web/server.mjs.
- **2026-11-02** — A digest that is no longer current answers 404, not other bytes. A tab opened before a deploy that lazily imports a module after it now fails that import instead of mixing versions; phase 164's new-version notice is the path back. lib/web/assets.mjs.
