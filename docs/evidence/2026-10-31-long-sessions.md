# Phase 154: the owner stays signed in for up to a year (2026-10-31)

- Phase: [154](../phases/154-the-owner-stays-signed-in-for-up-to-a-year.md).

## What was built

Sessions last at most 365 days from sign-in and end after 30 days without use
(`SESSION_ABSOLUTE_SECONDS`, `SESSION_IDLE_SECONDS` in `lib/web/auth.mjs`). The
GitHub App user token (8 hours) is renewed with its single-use refresh token,
kept only inside the sealed session record. The request that finds the token
within five minutes of expiry CAS-writes a 120-second claim first, then spends
the refresh token, re-checks access and CAS-writes the new pair; any other
request uses the winner's pair or the still-valid old token and never spends
the refresh token. A refused refresh (GitHub's error body or a 4xx) revokes the
session with reason `github`; changed project access revokes it with reason
`access`; a GitHub outage keeps it. Without a refresh token from GitHub the old
limits stay.

Migration `016-long-sessions.sql` changes only `plates_web_rpc`'s lifetime
bound: 365 days for `session` records, 8 hours for attempts and records;
`keel_web_rpc` keeps forwarding. It refuses to run before 014.

The 401 page says "You're not signed in." or "Your sign-in ended." with the
reason, shows no reference code, and its Sign in button carries the checked
return path and a reason from a fixed list.

## Checks (2026-10-31)

Builder: `npm run typecheck` exit 0; focused `web-*`, names, helpers and
surface-budget suites 1,148/1,148; full `npm run check` 3,907 tests, 0 failed
(its roadmap step failed only on the builder's temporary phase front matter).
The builder's own breaks (no claim, 30-minute idle, refusal not revoking, no
reason, 8-hour cookie, refresh token in the cookie, access not re-checked) each
failed their test.

Conductor, `node --import ./tests/helpers/hermetic.mjs --test` on
`tests/web-migrations.test.mjs` and `tests/web-auth.test.mjs`:

| Break | Caught by |
| --- | --- |
| 016's session bound back to 28800 | "016 lets sessions live a year and nothing else" |
| `/signin` return path not checked | "the sign-in page says what happened and comes back" |
| refresh refused with HTTP 400 treated as an outage | not caught at first; after adding the case, "a refused renewal ends the sign-in and says why" |

Hosted: migration 016 and the owner's overnight check remain.

## Known limits

A year limit is rarely named on the page: the store record and the cookie both
expire at it, so the owner usually sees "ended" or "not signed in". Worker
callbacks (`resolveInitiator`) do not renew tokens; a callback arriving after
the 8-hour token lapses answers 401 (jobs are off on the hosted instance).
