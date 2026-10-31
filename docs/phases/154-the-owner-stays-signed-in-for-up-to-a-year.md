---
status: partial
since: 2026-10-31
goal: G7
spec: 2
depends: [127, 151]
note: "Renewal, migration 016 and the sign-in page are built and tested; applying 016 on the hosted instance and the owner's overnight check remain."
owes: walk
evidence: ["evidence/2026-10-31-long-sessions.md"]
---

# The owner stays signed in for up to a year

## Done when

The owner signs in once on a device and stays signed in on it for up to a
year, as long as they open the workspace at least once every 30 days; when a
sign-in does end, the page says why in plain words and returns them to the page
they were on after signing in again.

## Scope

- **Lifetimes.** A session lasts at most 365 days from sign-in and ends after
  30 days without use. Today's limits are 30 minutes idle and 8 hours in all,
  set by the GitHub user token's lifetime and the discarded refresh token.
- **Renewal.** GitHub App user tokens expire after 8 hours and come with a
  single-use refresh token (valid about six months). The session keeps the
  refresh token inside its existing encrypted record (sealed with the session
  key and the record's associated data, never in a cookie, log or error). When
  the access token is within five minutes of expiry, the request that notices
  renews it: it exchanges the refresh token, re-checks the owner's access
  (owner id, installation, selected projects) and writes the new pair with the
  record's version (CAS). A concurrent request that loses the CAS re-reads and
  uses the winner's token; it never spends the refresh token a second time.
  A refused refresh (revoked App authorization, expired or reused refresh
  token) or changed project access ends the session, as a privilege change
  does today.
- **Database.** The hosted session store refuses lifetimes over 8 hours
  (`p_seconds > 28800` in `plates_web_rpc`). Migration `016` raises the bound
  for `session` records only, to 365 days; attempts and versioned records keep
  8 hours. It keeps `keel_web_rpc` forwarding, runs in one transaction, is
  re-runnable, and has a hosted proof file and an activation-plan step. It is
  applied before the build that uses it is deployed; the deployed build before
  it never asks for more than 8 hours, so 016 is safe under either build.
- **Cookies.** The session cookie's Max-Age is the session's remaining absolute
  lifetime. Phase 127's alias rules hold: a re-issued alias keeps the original
  absolute expiry and adds no renewal.
- **Rollback.** A rollback build reads a long session, renews idle at most 30
  minutes at a time and, once the 8-hour access token lapses, asks for a fresh
  sign-in. Nothing is lost; the owner signs in again.
- **The sign-in page.** A page that needs a session answers in plain words:
  "You're not signed in" when the browser has no session, or "Your sign-in
  ended" with the reason when known (30 days away, a year since signing in,
  GitHub ended it, project access changed). No raw error code on this page.
  Its Sign in button returns to the page that was asked for (a same-origin
  path, through the existing return-path check). API routes keep their JSON.
- Not in scope: remembering more than one device per owner, a device list, or
  changing logout and revoke-all (both still end sessions at once).

## Acceptance

- [x] A session lasts up to a year with use and ends after 30 days without it; its cookie carries the remaining lifetime: `tests/web-auth.test.mjs: "a session lasts a year with use and ends after 30 days away"`.
- [x] An expiring GitHub token is renewed once under CAS: two concurrent requests spend the refresh token once and both succeed; the refresh token never appears in a cookie, response, log or error: `tests/web-auth.test.mjs: "an expiring token is renewed once, however many requests notice"`.
- [x] A refused refresh or changed project access ends the session and the next page says why: `tests/web-auth.test.mjs: "a refused renewal ends the sign-in and says why"`.
- [x] Migration 016 lets sessions live 365 days, keeps attempts and records at 8 hours, keeps `keel_web_rpc` forwarding and re-runs cleanly: `tests/web-migrations.test.mjs: "016 lets sessions live a year and nothing else"`.
- [x] The sign-in page names what happened in plain words, shows no raw code, and returns to the asked-for page after signing in; an unsafe return path is refused: `tests/web-auth.test.mjs: "the sign-in page says what happened and comes back"`.
- [ ] ⚑ By hand: the owner signs in on their phone, comes back after more than 8 hours and is still signed in: the owner.

## Your part

- **Ask:** Sign in on your phone, leave it overnight, and open the workspace the next day.
- **Why:** It shows the year-long sign-in works on the real site, not only in tests.
- **Look at:** https://plates.dionisaledge.com
- **Choices:** Still signed in | Had to sign in again
- **Takes:** A minute, the next day.
- **Then:** Still signed in closes the phase; had to sign in again records what the page said and the renewal is looked at.
- **Ready when:** migration 016 is applied and the build with this phase is deployed.

## Real surfaces

- owner's machine: the owner's phone browser stays signed in across a day on the hosted workspace.
- GitHub API: the real refresh-token exchange for the Plates Workspace App.

## Proof

Automated: `node --import ./tests/helpers/hermetic.mjs --test tests/web-auth.test.mjs tests/web-migrations.test.mjs`, each case also broken on purpose to see it fail; the full gate through `plates integrate`.
By hand: the owner's overnight check above; migration 016 applied with its hosted proof.
⚑ Migration 016 changes the hosted database (owner present). No cost.

## Deliberately open

A stolen session cookie now works for up to 30 days of silence or a year of
use instead of 30 minutes. The cookie stays Secure, HttpOnly, host-only and
SameSite=Lax, logout and revoke-all still end it at once, and GitHub's own App
authorization can be revoked from GitHub's settings, which ends it at the next
renewal (within 8 hours). Settled by the owner's choice on 2026-10-31.

## Next action

Build the renewal, migration 016 and the sign-in page; then apply 016 and deploy with the owner.

## Trajectory

- **2026-10-31** — Built. The conductor's own breaks: 016's session bound back to 8 hours and an unchecked return path were caught; a refresh refused with an HTTP 4xx status treated as an outage was not, so the refused-renewal test gained that case and now catches it.
