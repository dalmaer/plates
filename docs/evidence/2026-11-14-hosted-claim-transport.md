---
attempt: {"accepted":false,"verified":false,"rework":1,"lessonStatus":{"status":"known","lesson":"Plates lesson 44: bound the stuck attempt itself"}}
---

# Phase 181: internal hosted claim transport

Date: 2026-11-14. Base: `c8b8be49ca457182752bd88b04379503fb6852db`
plus working tree. The phase claim was read back as this session's; the preceding
preview increment's GitHub check completed successfully.

## Intended boundary

Reuse the existing Git claim format and original-intent operation design. Keep
commit publication, create-only ref publication and read-only recovery distinct.
The transport is dormant: no public route, claim, agent start, database change,
permission expansion or budget change is activated by importing it.

Required gate: `npm run check` through the serialized integrator, plus
`npm run typecheck`. Focused/native-Git proof and review results are recorded
only after they are observed. Production and owner acceptance remain unverified.

## References

GitHub's REST documentation was inspected on 2026-11-14 for explicit commit
metadata and create-only reference operations. The source adapter retains the
repository's existing API version. No live-provider compatibility is inferred
from those docs or synthetic tests.

- [Git commits](https://docs.github.com/en/rest/git/commits?apiVersion=2022-11-28#create-a-commit)
- [Git references](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28#create-a-reference)

## Recovery and remaining acceptance

Revert this source increment to its base if its source checks regress. There
are no activated external effects to undo. Wiring the existing encrypted
operation journal, conditional apply, reconnect and receipt UI remains work;
transport proof alone cannot establish duplicate-free hosted execution.

## Review direction (2026-11-14)

Conductor and independent review found that numeric repository checks around a
name-addressed REST write cannot prevent a rename/name-reuse race. The smaller
safe increment uses an immutable GraphQL repository node for ref creation and
recovery. Commit-object publication remains unavailable; no undocumented route
or new credential scope is used. Review also required a deadline independent of
fetch/body/cleanup cooperation, preserving uncertainty after a POST starts.

[GitHub GraphQL Git reference](https://docs.github.com/en/graphql/reference/git)
was inspected on 2026-11-14 for repository-bound ref creation. Those documented
capabilities do not establish production verification.

## Observed source proof (2026-11-14)

Conductor preflight `npm run check:focused -- tests/web-attach-github.test.mjs tests/web-attach-preview.test.mjs tests/backlog-attach.test.mjs` completed its convention, roadmap, render, inbox and whitespace stages; 161 tests passed, zero failed. `npm run typecheck` exited 0. The 13 transport tests include native Git commit identity, competing claims, lost replies, uncertain post-write readback and deadlines independent of fetch/body cancellation.

The conductor also ran five isolated negative controls: removing numeric identity, changing the immutable write target, treating post-write absence as pending, removing mutation-start uncertainty, and allowing holder credential reflection. Each exited 1 on its intended assertion; the driver exited 0. The shared checkout was unchanged.

Independent final source review found no blockers after the repository-identity and deadline corrections. Review did not claim live-provider verification. Commit publication remains unsupported with zero I/O, and no hosted route imports this transport. Full integration results are retained by the integrator after this record; actual execution and owner acceptance remain unverified.

## Integrated result (2026-11-14)

Source commit `b3c8cc9c6a027526c6f316a84e000af301d14838` landed on main at `ce4ddf4466908b2769449572f12c16033d56bb77`. The serialized integrator ran `npm run check` once: exit 0, 4,702 passed, 12 skipped, zero failed; installed-package checks: 45 passed, zero failed. Integration receipt: `aa2d619dcaa541e5b02ff2fcd984c1b44efb5bec` on `plates-integrations`. Hosted activation and real-use acceptance remain outstanding.
