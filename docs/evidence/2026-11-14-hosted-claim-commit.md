---
attempt: {"accepted":false,"verified":false,"rework":2,"lessonStatus":{"status":"known","lesson":"Plates lesson 44: bound the stuck attempt itself"}}
---

# Phase 181: dormant repository-scoped commit publisher

Date: 2026-11-14. Base: `ce4ddf4466908b2769449572f12c16033d56bb77`
plus working tree. The conductor revalidated its existing phase claim and refreshed
decision context (`not-configured`, not accepted decision coverage).

## Scope

The internal adapter freezes the exact original claim intent and observes parent
and child authority before a single commit publication. It requests a derivative
of the existing App user token for one numeric repository and existing Contents
write plus Metadata read only. It returns sanitized stage observations, never a
credential or a general fetch capability. Repeated calls refuse; minted-token and
commit uncertainty remain separate. Immutable-node readback verifies exact bytes.

The adapter is dormant. No controller imports it; no token was read or minted,
claim created, grant expanded, database changed, provider started or paid trial run.
The existing operation journal still needs durable stage fences before activation.

## Provider contract and limitations

The [scoped-token contract](https://docs.github.com/en/rest/apps/apps#create-a-scoped-access-token)
and [installation repository listing](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)
were inspected on 2026-11-14. The exact numeric scoping request and validated
response provide the documented grant basis. A singleton listing is consistency
evidence only: the listing does not explicitly promise intersection with child
scope. Broad or incomplete results refuse without filtering or parent fallback.

GitHub permits nullable `expires_at`; this adapter deliberately requires finite
expiry and can refuse a valid provider grant. A local timeout does not revoke or
expire an issued token. No synthetic result establishes real provider enforcement.
Activation requires a separately authorized controlled provider check.

## Review and proof

Conductor review found that returning a provider-thrown WebError code could expose
arbitrary text. The builder changed this to a private local refusal marker and
added injected fetch/body error controls. Parent installation metadata is not
misrepresented as proof of whether a token is already scoped.

Required source proof: `npm run check:focused -- tests/web-attach-commit.test.mjs tests/web-attach-github.test.mjs tests/web-attach-preview.test.mjs`; `npm run typecheck`.
The serialized integrator runs `npm run check` once for the final candidate.
Observed conductor results and independent review follow when available; full-gate
results are retained separately after this record.

## Recovery and remaining work

Revert this source increment if its checks regress; it has no activated external
effects. A future controller must durably fence original mint and commit stages,
retain uncertain outcomes and recover without another publication. Claim creation,
dispatch, actual child/job state, reconnect, provider-start recovery and the owner
walk remain distinct acceptance. Phase 181 stays partial.

Independent review found installation permissions were being treated as narrowed
child-token permissions. This would reject a valid scoped child under a broader
installation grant. The correction keeps parent installation identity/access
separate from the exact child grant. Selected-repository installation mode remains
the existing Plates policy; this change does not add all-repository support.

The first conductor preflight passed 165 tests and all convention/render/inbox/
roadmap/whitespace stages, exit 0; typecheck exited 0. Six isolated controls
(parent write, exclusive listing, verified grant, secret errors, commit uncertainty
and frozen input) each failed at their intended assertion; driver exit 0. This
proof preceded the installation-metadata review correction and is not claimed as
proof of the corrected candidate.

## Corrected source proof (2026-11-14)

Conductor repeated the named focused preflight on the corrected candidate: exit 0,
166 tests passed, zero failed, including all mandatory conventions and generated
record checks. Typecheck exited 0. The conductor ran nine isolated negative
controls; each exited 1 at its intended assertion, driver exit 0. Three additional
controls cover installation/token permission separation, the retained selected
policy and exact child permissions. Independent final review closed the finding
and reported no remaining actionable blockers in this dormant increment.

## Integrated result (2026-11-14)

Source `dcebbebd2e121fc0c74bf2ea8610aa034dd6e898` landed on main at
`5e16d19174e2680dcb8661f1ba276e36078349a4`. The serialized integrator ran
`npm run check` once, exit 0: 4,714 passed, 12 skipped, zero failed; installed
package checks: 45 passed, zero failed. Integration record:
`a2d12968b2bb200a478555b7adb467cecfe56061` on `plates-integrations`.
This establishes source integration, not provider enforcement or activation.
