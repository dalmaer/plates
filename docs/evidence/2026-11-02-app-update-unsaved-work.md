# Evidence: phase 164 — an app update never costs unsaved work

- Date: 2026-11-02
- Phase: 164
- Revision: the commit titled "phase 164: An app update never costs unsaved work", on `claude/phase-164`. Built by a subagent from `70370c2c`, plus the conductor's test-import and timeout changes.
- Claim being checked: the four behaviours below hold, and each test fails without the change.
  - A new shell never reloads over unsaved edits.
  - Navigations use preload and fall back to the offline page past a bounded wait, storing nothing.
  - A returning app checks for a new worker.
  - A rotated push subscription replaces only its own record.

## Automated checks

- `node --test tests/web-pwa.test.mjs`: exit 0, 11 pass.
- `plates prove tests/web-pwa.test.mjs --name <each> --fix lib/web/pwa.mjs lib/web/pwa-client.mjs lib/web/safety-client.mjs lib/web/push-routes.mjs lib/web/push-store.mjs lib/web/server.mjs --base HEAD~1`. All four printed `VERIFIED red without the fix, green with it`:
  - "a new shell never reloads over unsaved edits"
  - "navigation preloads and gives up on a stalled network"
  - "a returning app checks for a new shell"
  - "a rotated push subscription keeps notifications coming"
- The first `plates prove` run was INCONCLUSIVE. The test file imported the new exports by name, so it could not load without the change. The test now reads `hasUnsavedEdits` at call time and asserts the notice text literally.
- `npm run check:focused -- tests/web-pwa.test.mjs tests/web-editor-drafts.test.mjs tests/web-server.test.mjs`: exit 0, 138 pass.
- `node --test tests/web-*.test.mjs tests/names.test.mjs`: exit 0, 778 pass.
- The rotation test runs against PGlite with migration 015, and a later notification reaches the new endpoint.
- The whole gate, `npm run check`, runs once after this record, through `plates integrate`.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Leave a draft unsaved in the installed app across a deploy | Draft kept, notice shown | Not run: needs the owner's phone and a deploy | The owner's-machine surface |

## Gaps and decision

The owner's walk on the installed app is not done. The phase is partial, `owes: walk`.

Rotation is two store calls (remove, then add), not one transaction. A failure between them leaves the device unsubscribed until the next page visit re-subscribes it. That gap is tracked in the phase's Trajectory.
