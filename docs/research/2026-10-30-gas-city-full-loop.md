# Gas City two-project full-loop demonstration — 2026-10-30

The bounded demonstration completed: a human work request led to a real Gas City
subprocess worker, injected death, one recovery attempt, a human-reviewed repair,
a real coordinator SIGKILL, durable pending learning, reviewed promotion through
Plates' real private-learning service/SQL, exact shared-lesson application in a
second project, a harmful candidate, withdrawal and corrective rollback.

This is deterministic orchestration and lesson plumbing, **not model intelligence
or general learning-effectiveness evidence**. Human turns, worker selection,
provider capacity and GitHub/auth responses are synthetic. The real worker reads
a mailbox, applies one of two finite interpreted rules, checks fixture assertions
and writes an exclusive local effect receipt. There are no model calls.

[Complete measured trace](2026-10-30-gas-city-full-loop-evidence.json),
[source and UI manifest](2026-10-30-gas-city-full-loop-manifest.json), and
[screenshot](2026-10-30-gas-city-full-loop.jpg) preserve final-code evidence.
The generated offline Mission Control view is retained at
`/Users/dionalmaer/Documents/Codex/2026-10-30/task-3/gas-city-full-loop-2/index.html`.
It shows 51 events with project filters, both conversation directions, exact
approval digests, process recovery, outcome/capture links, lesson lineage and
revocation. It cannot execute or replay an action. The browser displayed the page;
the shared filter showed exactly one recovery event and All restored 51. Its
short-lived loopback verification server was stopped and joined.

## What actually ran

| Stage | Evidence in trace | Actual result |
| --- | --- | --- |
| Human request / authorized selection | Events 1–4 | Acme account 1 selected for Canvas; external effect refused |
| Worker failure / bounded recovery | 5–14 | Original worker exited before effects; one retry; second retry refused |
| Human intervention | 15–18 | Repair refused without exact task approval; recorded worker/human turns and approved trim-only task |
| Durable outcome / coordinator crash | 19–21 | Two assertions passed; pending capture survived confirmed SIGKILL and fresh coordinator process; no redispatch |
| Evidence-backed project capture | 22–23 | Non-reviewer refused; reviewer 2 captured outcome-linked text via real service and SQL |
| Exact reviewed promotion | 24–25 | Changed approval digest refused; committed copy targets Garden and recipient 2 |
| Independent project baseline | 26–30 | One of two assertions failed |
| Retrieve and apply exact copy | 31–37 | Worker verified full copy digest and interpreted its exact guard; zero failed assertions |
| Harmful candidate | 38–44 | Explicit sandbox negative control lowercased case-sensitive identifiers; one failure |
| Withdrawal / corrective rollback | 45–51 | Real revocation hid harmful copy from future catalogue reads; original good copy reapplied; zero failures |

The native driver measured **seven starts**, each with a unique run ID and matched
PID/kernel identity/fence; all seven were confirmed exited. Six unique effect
files were read back and their result/output digests matched the durable outcome
records. The injected worker failed before its first effect. Funding reservations
remain held; worker termination does not fabricate a refund. Seven local usage
receipts preserve unknown token/cost totals. This is not whole-PR usage coverage.

The first full-loop attempt completed but review found that a detached mode flag
could choose behavior independently of shared text, weakening the causal claim.
It remains retained at `task-3/gas-city-full-loop-1`. The final version derives its
finite rule from the hash-checked copy's exact guard; unrecognized text or a
conflicting mode is refused. Negative tests cover text, hash and mode changes.
Review also required native measured counts/incarnation checks and nonzero-child
exit rejection. Final run `gas-city-full-loop-2` passed after all changes.

## Production seams and storage

Execution retains the earlier experimental SQLite journal because production job
operations are specialized for GitHub Actions/OIDC, grants and reservation RPCs.
This prototype does not fabricate those authorities. `bridge.mjs` still supplies
funding-binding validation, immutable launch intent, session fences, separate
execution/capacity holds, outcome state and usage records. Its outcome row and
stable derived capture request ID survive the selected coordinator crash window.

Learning now calls actual `createPrivateLearning` in
`lib/web/private-learning.mjs`, its encrypted store, and unchanged migration
`016-private-lessons.sql`. An isolated persistent PGlite database executes the
real `plates_private_lesson_rpc`, rather than an experiment lesson-table emulator.
This second database is the production learning schema instantiated locally;
SQLite holds only operation/outcome/capture references. Exact `preview` / `apply`
/ `recover` / `catalogue` / `revoke` envelopes preserve source revision, reviewer,
source digest, destination and recipients. Authentication and the exhaustive
GitHub read transport remain local fixtures with no network fallback.

The local lesson encryption key and synthetic bearer sessions live only in the
private retained run root `/tmp/plates-loop-OOihWj`, not in exported trace/Git.
The root also contains two actual synthetic Git repositories, effect receipts,
the execution journal and the persistent learning database. It is deliberately
retained for inspection. Revocation stops future catalogue delivery; it cannot
recall already delivered content or reverse previous effects. Rollback performs
a new bounded corrective run with the earlier good copy.

## Dependencies and replay

Gas City stays pinned at `3f3224faaeff2da774417293e4a847aa421365a5`. The Go driver
links the unchanged subprocess/runtime/proctable components and uses the same
inspected `golang.org/x/sys v0.49.0` cache as the preceding runtime trial. Build
was offline with existing Go 1.27.3, `GOENV=off`, `GOWORK=off`,
`GOTOOLCHAIN=local`, `CGO_ENABLED=0`, `GOPROXY=off`, `GOSUMDB=off` and explicit
task-local `GOPATH`, `GOMODCACHE` and `GOCACHE`. No upstream source changed.

The only additional package exercised is the already-declared/reused development
dependency `@electric-sql/pglite 0.5.11` (Apache-2.0), a WASM PostgreSQL build
running inside Node. It starts no network server and requires no new privilege,
credential or install here. Its existing files were temporarily linked from the
consolidation worktree. Node 24.22.1 runs the coordinator/worker and zero-dependency
static viewer. No global configuration changed.

Copy `experiments/gas-city/loop-driver/main.go` to
`cmd/plates-loop-driver/main.go` in an isolated archive of the pinned upstream.
Using the explicit isolated Go environment described above:

```sh
go build -mod=readonly -o ../bin/plates-loop-driver ./cmd/plates-loop-driver
```

Replay from this Plates branch with its declared development dependencies
available, passing a **new** output directory:

```sh
node experiments/gas-city/full-loop.mjs \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/gas-city-runtime-trial/bin/plates-loop-driver \
  /Users/dionalmaer/Documents/Codex/2026-10-30/task-3/gas-city-full-loop-replay
```

The runner creates an owned short private root, sanitized child environments,
loopback-only runtime endpoint and bounded workers. Every owned child is signaled
before cleanup waits; native termination proof is checked. Failed runs and
uncertain cleanup retain their directories and exit nonzero. Even successful
runs retain journals/repos for inspection. No `gc init`, full supervisor, model
provider, real GitHub/chat endpoint or deployment is started.

## Qualification and checks

The final local scenario exited 0. Six focused regression tests passed, using the
hermetic preloader and test ledger (no flaky/slower test reported). They cover
exact content interpretation, task approvals, synthetic session refusal,
immutable event identities, HTML escaping, actual SQL persistence, discarded-ack
recovery, scope checks and revocation. Independent final source review found no
remaining blocker for this bounded demonstration. Required focused repository
preflight exited 0: 140 passed, zero failed/skipped, plus conventions and
roadmap/render/inbox/whitespace. Exact command and log digest are in the manifest.
Documentation results were added afterward and whitespace rechecked. The old
full suite was not repeated; no production source changed.

This is a **component-and-production-contract loop pass**, not full Gas City
adoption. The crash was deliberately after outcome/termination/usage persistence
and before capture; other coordinator crash windows and provider/supervisor
restart are unqualified. PGlite does not validate deployed PostgreSQL role/RLS
configuration, OAuth, live GitHub snapshots or production key custody. The
finite interpreter accepts only known fixture rules. No general agent reasoning,
autonomous selection, project lesson effectiveness, conversational extmsg,
provider cost enforcement or real PR collaboration has been established.

The next stage is a separately frozen, actual Plates repository dogfood task:
an agent-produced patch, real tests and review, interrupted recovery, measured
lesson use and a held-out comparison. Preparation does not authorize paid calls
or unspecified accounts/budgets, and no real-repository improvement is claimed
by this synthetic result.
