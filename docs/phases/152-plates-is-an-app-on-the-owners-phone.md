---
status: planned
since: 2026-10-31
goal: G7
spec: 2
depends: [151]
note: "The hosted workspace installs on the phone as an app, with push notifications for what waits on the owner; a native app only if this falls short."
evidence: []
---

# Plates is an app on the owner's phone that says when something needs them

## Done when

The hosted workspace installs to the owner's phone home screen as an app
(a progressive web app: manifest, icon, offline shell, safe reconnect) and
sends a push notification when something waits on the owner (a decision to
check, a walk ready, an approval for an irreversible door, a red night), with
a deep link straight to it; the owner uses it for two weeks and says whether
a native app is still needed.

## Scope

- Web app manifest, icons and a service worker that caches only the shell;
  private data never cached in the service worker.
- Web Push (iOS 16.4+ for installed apps, Android): subscribe from the app,
  store the subscription in the private instance, send from the workers on
  the events above, at most one notification per item, no private text in
  the notification body, a deep link to the item.
- Every action the phone can take goes through the same autonomy level and
  door-class checks as the desktop; nothing irreversible from a notification
  without opening the item.
- Not in scope: a native iOS or Android app (decided after the two weeks),
  offline mutations.

## Acceptance

- [ ] The manifest and service worker are served, the worker caches no private route, and a stale shell refreshes on reconnect: `tests/web-pwa.test.mjs: "the app installs and caches only its shell"`.
- [ ] Each waiting-on-owner event sends one notification with a deep link and no private text, and a repeated event sends none: `tests/web-pwa.test.mjs: "one push per item, no private text"`.
- [ ] Installed on the owner's phone, a real notification opens the right item and the owner acts on it: ⚑ by hand: the owner.

## Your part

- **Ask:** Install Plates on your phone from the workspace and use it for two weeks, then say whether you still want a native app.
- **Why:** It decides whether the web app is enough or a native app is worth building.
- **Look at:** the workspace on your phone, "Add to Home Screen".
- **Choices:** The web app is enough | Build a native app
- **Takes:** 2 minutes to install; two weeks of use.
- **Then:** Build a native app: a later phase wraps the same workspace (no second UI) for push and widgets the web can't do.
- **Ready when:** phase 151 is built and the two tests pass.

## Real surfaces

- owner's machine: the installed app and a real notification on the owner's phone.

## Proof

Automated: `node --test tests/web-pwa.test.mjs`; `npm run check`.
By hand: the owner's two weeks.

## Deliberately open

- **iOS web push limits** (installed app only, user permission per device);
  settled on the owner's phone.

## Next action

After 151, add the manifest, shell worker and push subscription behind the
existing sign-in.
