---
status: planned
since: 2026-11-02
goal: G7
spec: 2
depends: [152]
note: "From the 2026-11-02 PWA audit: a new shell worker reloads every open page, even one with unsaved private edits; navigations wait on worker start-up with no timeout; an installed app left open never checks for a new version; a rotated push subscription silently stops notifications."
evidence: []
---

# An app update never costs unsaved work

## Done when

A deploy that changes the shell never reloads a page that has unsaved edits. That page shows "A new version is ready. Reload when you have saved." and reloads only when the owner chooses. A page with nothing unsaved refreshes as before.

Navigations start their network request while the worker boots (navigation preload). On a stalled connection, the offline page appears after a bounded wait.

An installed app returning to the foreground checks for a new worker. A push subscription the browser rotates is re-registered, so notifications keep arriving.

## Scope

- `lib/web/pwa-client.mjs`:
  - **Unsaved edits.** The shell refresh asks whether any editor on the page is dirty, through `safety-client`'s registered guards. If one is, it shows the notice instead of reloading.
  - **Foreground check.** A `visibilitychange` to visible calls `registration.update()` and asks the worker for its version, as the `online` handler does.
- `lib/web/safety-client.mjs`: expose one read-only `hasUnsavedEdits(document)` over its existing guards. Nothing else changes.
- `lib/web/pwa.mjs` `shellWorker`:
  - **Preload.** `activate` enables navigation preload when supported, and navigation uses `event.preloadResponse` when present.
  - **Timeout.** Navigation falls back to the offline page after 8 seconds with no response. An aborted or late network response is never stored.
  - **Rotated subscriptions.** A `pushsubscriptionchange` handler re-subscribes with the old options and posts the new subscription to a narrow endpoint. Without a page there is no CSRF form value, so it is authorized by the old subscription's endpoint, which the private store already holds.
- `lib/web/push-routes.mjs`: that endpoint replaces a known subscription by its old endpoint, for the same user. It refuses an unknown old endpoint.
- Out of scope: hashed assets (phase 165), offline mutations, and the push events themselves.

## Integration increments

One merge. It's compatible: the worker version changes, so installed clients pick it up through the existing upgrade path, and that path is itself what this phase makes safe. Exposure happens on the owner's deploy. Recovery is a revert: a new worker replaces this one the same way.

## Acceptance

- [ ] A new shell with unsaved edits shows the notice and does not reload; with none, the page reloads: `tests/web-pwa.test.mjs: "a new shell never reloads over unsaved edits"`
- [ ] Navigation uses the preload response, and falls back to the offline page after the timeout without storing anything: `tests/web-pwa.test.mjs: "navigation preloads and gives up on a stalled network"`
- [ ] Returning to the foreground checks for a new worker: `tests/web-pwa.test.mjs: "a returning app checks for a new shell"`
- [ ] A rotated subscription replaces only its own record; an unknown old endpoint is refused: `tests/web-pwa.test.mjs: "a rotated push subscription keeps notifications coming"`
- [ ] ⚑ by hand: the owner, with the app installed, leaves a draft unsaved across a deploy and finds it still there.

## Your part

- **Ask:** With Plates installed on your phone, start a draft, don't save it, wait for the next deploy, then come back to the app.
- **Why:** It confirms an update no longer throws away unsaved text on the device that matters.
- **Look at:** The draft, and a "new version is ready" notice.
- **Choices:** Draft kept, notice shown | Draft lost
- **Takes:** 5 minutes across one deploy.
- **Then:** Draft kept: the phase is built. Draft lost: the phase goes back with what you saw.
- **Ready when:** this phase is merged and deployed.

## Real surfaces

- owner's machine: the installed app on the owner's phone across a real deploy.

## Proof

Automated: `node --test tests/web-pwa.test.mjs`; `npm run check`.
By hand: the owner's draft across a deploy.

## Deliberately open

- iOS may evict a backgrounded app's page regardless; this phase cannot keep text the operating system discards. The guide already says so.

## Next action

Build the client, worker and route changes with their four tests.
