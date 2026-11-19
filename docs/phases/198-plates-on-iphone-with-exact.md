---
status: partial
since: 2026-11-19
goal: G7
spec: 2
depends: [196]
note: "Increment 1 built: the app/ Exact app renders the simple view (Home chips, Needs-you cards, a project's backlog, the channel as a chat) from a synthetic fixture; nothing is sent or installed. The owner chose site sign-in, answering decisions first, push later and cable install (2026-11-19)."
evidence: []
---

# Plates on iPhone with Exact

## Done when

The owner opens a native Plates app on their iPhone and sees the same three
things as the site (backlog, agents, decisions: phase 196's model and rules),
read live from their workspace, and answers a decision from it through the
same preview-then-apply path as the web, without the app holding any power
the web session does not.

## Scope

A native iOS app built with Exact, in `app/` (an Exact app pinned by
`app/exact.json`, kept current by the owner's nightly Exact job). It is a
third renderer of one read model (CLI, web, app); it adds no model of its
own. Phase 152's web app and Web Push stay; this phase does not replace them.

## Decided (owner, 2026-11-19)

- **Sign-in:** the app opens the hosted site's GitHub sign-in in the system
  browser (PKCE) and receives its own app session: an opaque bearer kept in
  the Keychain, server-scoped to reading Home, projects and the channel, the
  answer preview/apply path, and the owner's channel line; listed and
  revocable on the Devices page.
- **First writes:** answering decisions (Needs-you cards) through the
  existing preview-then-apply path, and the owner's channel line. An
  irreversible answer asks for Face ID; merges and other irreversible doors
  are not offered from the phone in this phase.
- **Push:** later (a following increment: APNs alongside Web Push, one
  notifier ledger, fixed non-private text, a deep link).
- **Install:** like the owner's other Exact apps: a cable install from the
  Mac with over-the-air updates. Signing material, team ids and hosts stay
  out of this public repo.

## Integration increments

1. **The simple view from a fixture** (built, PR 519): `app/` renders Home,
   Needs you, a project's backlog and the channel from a synthetic Acme
   fixture; answering shows "Nothing was sent". `npm run exact:check` in
   `app/`; `tests/app-fixture.test.mjs` holds the fixture to the shared model.
2. **Sign-in and live reads:** the hosted app session (route, sealing,
   scope, Devices page listing and revocation; a migration only if the
   session store needs one, with the owner's yes) and the app reading live
   Home, projects and channel with it.
3. **Answering and the channel line:** preview-then-apply from the app,
   Face ID for irreversible answers, the owner's line from the chat.
4. **Install on the owner's iPhone:** the owner's install and update tooling,
   kept outside the repo, as their other apps do.
5. **Push** (later, by decision).

## Acceptance

- [x] The app renders the simple view's states from a fixture, in the shared model's order and vocabulary: `app/app.test.contract` (`npm run exact:check`), `tests/app-fixture.test.mjs`.
- [ ] An app session is issued only through the site's sign-in, is scoped as decided, and is listed and revocable on the Devices page: tests named with increment 2.
- [ ] The app answers a decision only through preview-then-apply, and an irreversible answer requires Face ID: tests named with increment 3.
- [ ] ⚑ By hand: the owner installs the app, signs in, and answers one real decision from it.

## Your part

- **Ask:** Install the app when increment 4 is ready, sign in, and answer one real decision.
- **Why:** It is the only proof the phone path works end to end.
- **Look at:** the Plates app on your iPhone.
- **Choices:** Works | Needs changes
- **Takes:** About 10 minutes.
- **Then:** Works: push is next. Needs changes: the conductor changes it first.
- **Ready when:** increment 4 is built.

## Real surfaces

- owner's machine: the app built and installed from the Mac on the owner's iPhone.
- adopted project: the hosted workspace issuing the app session and serving its reads and answers.

## Proof

Automated: `npm run exact:check` in `app/` (with `CHROME` set to the installed Chrome on a Mac without Playwright's browser), `tests/app-fixture.test.mjs`, and each increment's named tests; `npm run check`. By hand: the owner's walk.

## Deliberately open

- The bundle id (`com.dalmaer.plates` is a placeholder) and the accent (platform blue or plates cobalt).
- Plates's CI does not run the app's tests: Exact is checked out beside plates on the owner's Mac, not in CI.

## Next action

Build increment 2: the hosted app session issued through the site's sign-in, and the app reading live data with it.

## Trajectory

- **2026-11-19** — The owner asked for a native iOS app with Exact once the simple view settled. Exact fits inside plates as `app/`, like Homeroom's app; no separate repo.
