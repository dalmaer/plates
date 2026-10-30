# Gas City: frozen real-repository trial and containment preparation

Date: 2026-10-30. Branch `codex/gas-city-evaluation`. This extends the
[full-loop demonstration](2026-10-30-gas-city-full-loop.md) and
[real-repo plan](2026-10-30-gas-city-real-repo-plan.md). It does not solve either
selected defect or start a coding model. Evidence and exact external receipt
hashes are in [the retained record](2026-10-30-gas-city-real-trial-containment.json).

## Frozen comparison

The parent selected the receipt-authorization task family. Both backends use
Plates `037e13b4f78c061405cef899b528badb536584ad`. Task A closes the project-operation
receipt's final-authorization window after workspace membership loss. Held-out
Task B closes the analogous lesson-copy receipt window after source-project access
loss while membership remains. API and HTML are in scope; authorized repeat reads
must recover the same receipt and GET must not redispatch writes. Task B includes
an unknown-operation HTML case. Neither production defect has been edited.

The controller-owned files live in
`/Users/dionalmaer/Documents/Codex/2026-10-30/task-3` (called ROOT below), outside
all worker read roots:

| Artifact | File under ROOT | SHA-256 |
| --- | --- | --- |
| Complete handoff | `real-trial-frozen-handoff.json` | `a7535adfd023ec5992a30523c3a56fcdcd8dd7729d3abb9dceedf5e0bc450af8` |
| Task A prompt | `real-trial-frozen-task-a-prompt.md` | `86c73d43adbbe1ea7b7beea42750e6ac1aae210138e5d66608b3214ae4a24866` |
| Task B prompt | `real-trial-frozen-task-b-prompt.md` | `1bbe8952505b1abee7adcb70b933b7fd4ec81c95bee79935ce241bc856f2e857` |
| Final evaluator | `real-trial-evaluator-v3.mjs` | `f1d9281846f47e42eb6bb5f7e7528d7e2d027ad80ab6ad4666f57b56d9305004` |
| Candidate service | `real-trial-candidate-service.mjs` | `cefcca81a558bcce577072bf71c0eb5acdcdac5adbce6183b29bfd7a3367e6e1` |
| Trusted baseline inventory | `gas-city-evaluator-trusted-manifest.json` | `8fabd6ade9045f53a6c9a86b3a0924df03b485d45f61c2fbcf3640fe72d23209` |

The handoff contains the selected spec, exact prompt bytes, remaining artifact
hashes, fixed baseline and `modelExecution: not-authorized`. The trusted fixture
archive is `ROOT/gas-city-evaluator-trusted`: 1,521 regular files and four symlinks
from the baseline. The scorer verifies its inventory before imports. All 59
existing candidate helper modules must match baseline; additions, removal and
aliases refuse evaluation. Worker prompts state this constraint.

`prepare-worker-copy.mjs` now creates an independent, shallow, detached copy with
only that one commit, no refs/remotes/alternates, and no experimental branch
history. Actual copy: `ROOT/gas-city-frozen-worker-a-2`, clean and verified.
The older three-arm preparation uses an independent shared object store and is
suitable for baseline observations only; replace it with separate one-commit
copies before a model gets access. Task B control and treatment both start clean
at the original baseline. Transfer only an authenticated, reviewed lesson with
its exact digest, never A's patch, conversation, hidden acceptance or source tree.
Do not show B to the A worker. Stop and snapshot a worker before evaluation.

## What actually ran

The pinned Gas City subprocess provider launched a fixed offline probe through
`containment-worker-launcher.mjs`; it did not launch Codex. The child had a clean
whitelisted environment and a process-local macOS Seatbelt profile. There were
no global security changes. The policy denies network, arbitrary user-file reads,
external writes and hard links; it permits only the explicit worker/scratch and
runtime paths. Caller-supplied roots are trusted controller policy, never values
from worker/chat content. Inherited descriptors are restricted by the launcher.

`gas-city-containment-3.json` records all 15 required checks: allowed workspace
read/write; denied scorer/held-out/sibling/synthetic-auth reads; denied score
write, symlink read, hard-link creation, parent signaling, and live local
TCP/UDP/Unix connections; inherited containment in a child; stripped credential
and preload environment. Real listeners received independent positive controls.
Gas City recorded one launch and authoritative stop for the same PID/kernel
identity/fence, plus successful final cleanup. The validator rejects missing
checks, non-permission errors and unproved descendant results.

The final evaluator runs candidate production only in a separate contained
service. The trusted parent imports baseline fixtures, owns revocation/store
state, counters and assertions, and accepts only bounded provider/HTTP IPC.
Provider mutation destinations outside the narrow synthetic session/read policy
are refused. The service cannot read scorer or hidden fixtures. The final service
policy additionally denies process-fork. Source hashes use bounded regular-file,
no-follow/nonblocking reads with physical-path and identity checks. A live worker
must be stopped first; this is not a concurrent hostile-filesystem protocol.

The trusted wrapper verifies the externally supplied manifest digest and artifact
bytes, then starts the scorer with an inline clean environment. It owns the
complete process group, kills/observes it on completion or timeout, and waits for
stdio closure before parsing. Reports are outside the canonical candidate root.
The scorer rejects Node options/preload variables as defense in depth; launch-time
preloads must be excluded by the trusted controller, not merely detected after
Node has already loaded them.

| Final baseline acceptance | Passed | Failed | Evidence |
| --- | --- | --- | --- |
| A: authorized/repeated API and HTML, before-read loss, mid-read loss | 4 | 2 | `real-trial-v3-final-drained-task-a.json` |
| B: same, project-only loss and unknown-operation HTML | 4 | 3 | `real-trial-v3-final-drained-task-b.json` |

Both exit 1 as expected, with `infrastructureFailure: false`, unchanged source,
joined candidate services, and wrapper `groupAbsent: true`. The failures are the
unfixed receipt disclosures, not infrastructure passes. There are zero model
calls and no claim of a learned improvement on these real tasks.

Earlier v3 checks observed child built-in monkeypatching could not change parent
scores, protected reads/writes were refused, and forged score IPC was rejected.
Those receipts retain their *earlier* evaluator hash. Independent review then
found descendant-cleanup, candidate-path hashing, canonical report-path and
wrapper stream-drain gaps; these have source fixes and ordinary final baseline
checks. A new adversarial fork/path test batch was rejected by an automated safety
check before execution. It was not retried. New fork/path negative coverage and
forced-timeout descendant proof remain unverified; do not present earlier probes
as proof of those final changes. This is not a formal malware sandbox or proof
against semantic test gaming or hostile memory exhaustion.

## Replay

Run from `ROOT/plates-gas-city`, substituting ROOT with the absolute directory
above and choosing a new output filename each time (existing evidence is refused):

```sh
node experiments/gas-city/containment-trial.mjs ROOT/gas-city-runtime-trial/bin/plates-loop-driver ROOT/new-containment.json
node experiments/gas-city/prepare-worker-copy.mjs /Users/dionalmaer/code/plates ROOT/new-worker ROOT/new-worker.json
node experiments/gas-city/run-frozen-evaluator.mjs ROOT/real-trial-frozen-handoff.json a7535adfd023ec5992a30523c3a56fcdcd8dd7729d3abb9dceedf5e0bc450af8 ROOT/new-worker task-a ROOT/new-score-a.json
```

The same evaluator command with `task-b` checks B. It reveals private acceptance
and must be controller-only. macOS Seatbelt and permission to bind the fixed
loopback canaries are required; there is no unsandboxed fallback. No package
installation was needed for this stage. Existing Node 24.22.1, Go 1.27.3, pinned
upstream binary and system sandbox-exec were used. The binary SHA is
`18094f4291795c850cb835fa718e3ade6f2730932a4d15b477fd9cc7c78443de`.

## CLI, funding and remaining launch boundary

Installed official Codex CLI is 0.164.0 (Apache-2.0). Package metadata, wrapper,
native binary, `--version` and `--help` were inspected without reading account,
config, token, session or model-cache contents. Under the strict offline profile,
both version and the following **help-only** command exited 0:

```sh
codex --no-daemon --ask-for-approval never --sandbox workspace-write exec --ignore-user-config --ephemeral --help
```

`never` denies escalation; it is not autoapproval. Do not use upstream's builtin
Codex command: the pinned provider definition includes
`--dangerously-bypass-approvals-and-sandbox`. A future reviewed explicit provider
command must omit that flag, `--approve-for-me`, `--ignore-rules`, hook-trust
bypass, search and shared-daemon behavior. A future task would add `--json`, an
explicit `-m MODEL`, and a stdin prompt; this document does not execute it.

Actual signed-in account, subscription entitlement and available model IDs remain
unknown. Installed CLI supports explicit model selection; the pinned Gas City
catalog's examples are not account entitlement evidence. Do not choose a payer
from ambient environment or silently switch accounts. Supported options for an
owner decision are:

1. One named existing Codex subscription session, explicit model ID confirmed for
   that account, one A builder attempt (proposed 15-minute wall bound), no automatic
   retry/review/B run. Dollar cost remains unknown, not zero. Review and B/control
   each require their own bounded reservation within the approved total.
2. One explicitly named existing API-funded account with an enforceable spending
   cap and exact model. No keys were sought or configured. CLI help exposes no
   hard dollar-cap flag; a timer/token estimate is not a currency cap. This option
   cannot claim a hard monetary bound until a verified billing/usage gate exists.

The current verified outer sandbox denies both auth-file reads and network.
Therefore an existing-session model run cannot work unchanged. A credential
boundary and restricted model transport that do not expose secrets to repository
commands, full CLI/git/test compatibility, and final containment negative proof
remain prerequisites. No authentication/network broadening is implemented and no
new grants are requested here. User funding approval alone does not resolve those
technical constraints. OpenHands must use equivalent model/account/budget and
acceptance boundaries; otherwise report a confounded comparison.

Concrete future approval wording, once those boundaries are verified:
“May I run one Task A worker per backend using [named existing account] and
[exact model], at most 15 minutes each and [explicit subscription allowance or
verified total currency cap], with no automatic retry or payer switch? Repository
content may be sent only to that model provider; no external tool writes. Review,
learning promotion and held-out B/control remain separately bounded.”

## Validation and retained failures

Three focused regressions cover incomplete/forged probe receipts, cleanup after a
closer fails/stalls, and environment whitelisting. Independent review was performed
by `review_gas_city`; `review_full_loop` built the initial v3 scorer. All findings
have source corrections; unexecuted negative proofs stay gaps as above.

Earlier attempts are retained: initial sandbox profile could not start Node until
required platform bootstrap/sysctl reads were included; containment receipt 1
failed and cleaned up, receipts 2 and 3 passed. The first shallow-copy attempt
refused its own dirty tree because xcrun placed a cache in worker TMPDIR; the second
uses separate owned scratch and is clean. Initial v3 fixture header normalization
failed; corrected runs reproduced the baseline. No failure was erased or labeled
as a pass. Final `npm run check:focused -- tests/gas-city-containment.test.mjs tests/gas-city-real-trial-plan.test.mjs`
passed 120 tests, with zero failures, plus conventions, roadmap, render, inbox and
whitespace guards. The normal sandbox first refused the preflight loopback probe
with EPERM; the approved local-bind run passed. Logs are
`ROOT/gas-city-runtime-trial/logs/containment-preflight{,-2}.log`. No unchanged full
suite was repeated. Final independent source review closed the stream-drain finding
and found no blocking report misclaim.
