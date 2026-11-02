# Freeze harness evaluation records

`plates retro evaluations plan|freeze|inspect|run|resume|reconcile|cancel|compare` is the available CLI surface.
Plan/freeze/inspect preserve private records. Run supports the existing approved
offline Docker trial and the explicit one-slot live policy described below, with
separate count, generation and original-response GET approvals. Synthetic proof
does not activate a paid cohort or authorize production promotion. Schema-1
`retro sessions` is unchanged.

From this source checkout, create a synthetic Acme bundle in an external input
directory. Bundles contain private acceptance material: use a directory with mode
0700 outside Git, and set `umask 077` before redirecting any output. The helper
returns a fresh object and performs no I/O:

```sh
umask 077
mkdir -m 700 /absolute/inputs
node --input-type=module -e 'import { acmeEvaluationPlan } from "./tests/helpers/evaluation-plan.mjs"; console.log(JSON.stringify(acmeEvaluationPlan(), null, 2))' > /absolute/inputs/acme-plan.json
```

Use an external manifest with version 1, id `acme-workspace`, name `Acme`, repo
`Acme/private`, and projects `[{"id":"acme","repo":"Acme/widget"}]`.
Initialize storage separately; its parent must exist and it must not overlap the
manifest directory, application or any Git working tree:

```sh
node bin/plates.mjs workspace init --manifest /absolute/inputs/workspace.json --state /absolute/private-state --yes --json
node bin/plates.mjs retro evaluations plan --manifest /absolute/inputs/workspace.json --state /absolute/private-state --bundle /absolute/inputs/acme-plan.json --json
node bin/plates.mjs retro evaluations freeze --manifest /absolute/inputs/workspace.json --state /absolute/private-state --bundle /absolute/inputs/acme-plan.json --json
node bin/plates.mjs retro evaluations freeze --manifest /absolute/inputs/workspace.json --state /absolute/private-state --bundle /absolute/inputs/acme-plan.json --yes --digest DIGEST_FROM_FREEZE_PREVIEW --json
node bin/plates.mjs retro evaluations inspect --manifest /absolute/inputs/workspace.json --state /absolute/private-state --experiment acme-comparison --json
```

Preview freeze exits 3; plan and inspect exit 0; refusals exit 2. Plan creates
nothing. The preview digest binds exact bundle and manifest bytes, canonical
record hashes, workspace ownership and exact destination. The manifest must
list the comparison repository as its own repository or an authorized project.
Identical freeze retries return the original receipt only with the same canonical
bundle path, bytes, manifest and destination. Moving or copying identical bytes to
a different path changes the approval identity: the old digest is stale and a
new preview cannot replace the existing experiment. Inspect the original receipt;
restore the original input path for retry, or deliberately author a new comparison
ID for a new plan. Merely spelling the same canonical path relative to another
working directory does not change its identity. Changed inputs under the same
identity refuse. Interrupted, locked or corrupt storage requires inspection;
it is never reset automatically.

The helper is the complete small bundle example. Each record has schemaVersion,
kind, id, createdAt and digest. `sealRecord` hashes canonical JSON excluding only
its own digest; references contain kind/id/digest. Materials embed bounded UTF-8
bytes and have content-addressed immutable attachments. Case acceptance refers
to a material, separate from public brief. Context and overlays use ordered
`{path, material}` entries; inherited context must be listed in context. Paths
are normalized relative file paths. Exclusions match across arms. All nested
fields are strict. Image, dependency, installer, tool configuration and source
identities are declared hashes; unresolved model aliases require an explicit reason.
The synthetic fixture declares unknown currency as null, never zero. Its hashes
and placeholder checks establish record mechanics only, not executable images,
private held-out coverage or acceptance. Updating records requires resealing
references and their enclosing comparison. The record-only example cannot execute; use the offline contract below.

Use canonical absolute paths: on macOS, resolve `/tmp` and `/var` aliases
with `realpath` first. Input and managed storage paths reject symlink components.
Declared image and tool hashes are not executable availability verification.

Each case needs at least one public requirement and provenance entry. Comparison
`authority` is `{kind:"phase",ref:"117"}` or
`{kind:"issue",ref:"Acme/widget#12"}`; the issue repository must match the
comparison, and numbers are positive (at most nine digits). Runtime/tool versions
are declared numeric version labels (optional `v`, dotted components and
prerelease/build suffix); moving labels such as `latest`, `main` and `HEAD` refuse.
Neither version labels nor hashes verify availability or reproducibility.

The acceptance/context guard detects byte-identical material, including copies
under different material IDs. It does not detect reserialized JSON, whitespace
changes, excerpts or semantic equivalents. Do not infer confidentiality from a
passing record check: the curator must keep private answers out of delivered
context, and phase 118 must independently enforce the builder/evaluator boundary.


## One offline trial

`run --experiment ID --execution /absolute/request.json --json` previews and exits
3. Approve that exact preview with `--yes --digest HASH`. Terminal runs exit 0,
including rejected submissions; read `verdict.acceptance`, `failureCategory` and
`result.status`. Errors before a terminal receipt exit 2. Inspect retains the
original frozen receipt and adds execution records. Missing, empty or truncated
execution reservations and interrupted slot records appear as explicit uncertain
metadata; inspect never repairs or deletes their bytes. Run refuses these states
before preflight/admission. Recovery remains deferred. Identical approved retries
return the original record; uncertain or partial operations never start again.
Resume, reconcile, cancel and compare extend the same frozen experiment. Rescore remains unavailable.

The strict execution descriptor is:

```json
{
  "schemaVersion": 1,
  "pairId": "acme-pair-0",
  "arm": "baseline",
  "repository": "/absolute/acme-repository",
  "sourcePaths": ["answer.mjs"],
  "builderArgv": ["node", "/work/build.mjs"],
  "admission": {
    "stateDir": "/absolute/host-coordinator",
    "manifest": "/absolute/inputs/managed.json",
    "capacity": 1,
    "weight": 1,
    "repo": "Acme/widget"
  }
}
```

The managed manifest is `[{"repo":"Acme/widget","role":"managed"}]`. The
repository's origin and `.plates/plates.json` must match. Use the same coordinator
path as other host validation workloads; different paths do not coordinate.
The coordinator path is absent initially, under an existing canonical parent;
never precreate an empty coordinator or delete an existing one to reset capacity.
The preview binds the managed manifest, inspected target, request bytes/path,
source export, delivered context, image metadata and limits. The preview and
verdict also bind actual controller source hashes and `process.version`, separate
from the configuration's declared `harnessCommit` (which is not verification).
The fixed source list is `CONTROLLER_SOURCES` in `lib/evaluation-provenance.mjs`:
CLI dispatch, all evaluation modules, session ledger I/O, validation budget,
reused update-container plumbing and workspace validation. It excludes private
files and unrelated working-tree content. Changed source bytes or Node invalidate
an old approval/retry; inspect can still read the original receipt. Dirty working files
are not exported. Each source is a regular Git blob from the frozen starting
commit; symlinks and submodules refuse. Source export paths are explicitly reviewed
in the request, not inferred from an arbitrary working directory.

Both frozen configurations use `provider:"offline"`, runtime name
`"scripted-node-v1"`, matching case environment and no currency ceiling. Cases
use `allowlist.tools:["pinned-image-tools"]`, empty network and prerequisites.
This authorizes every executable inside the approved image, not just Node.
Narrow executable allowlists refuse. Node argv must name an absolute delivered
file under `/work`. The local pinned Node image must be available; no pull occurs.
Image environment keys are restricted, runtime Node is checked, and PATH is fixed.

Frozen context/overlay files and `requirements.json` are protected public inputs.
Private acceptance and provenance are not delivered. Curators must exclude private
answers and historical solutions from public source/context: byte-equality guards
cannot detect semantic disclosures. A builder emits exactly this JSON on stdout:

```json
{"schemaVersion":1,"files":[{"path":"answer.mjs","mode":"100644","base64":"ZXhwb3J0IGRlZmF1bHQgIkFjbWUiOwo="}]}
```

Each listed file replaces or adds a regular file to the delivered base; omitted
files remain unchanged. Deletion is unsupported. Only modes `100644` and `100755`
are accepted. Changed paths must be exactly allowlisted; public probes and all
context/overlays remain protected even when listed. No field can declare a pass.
This is a submission of chosen bytes, not a snapshot of the builder filesystem.

Private acceptance material is JSON:

```json
{"schemaVersion":1,"driver":"stdio-v1","checks":[{"id":"acme-behavior","argv":["node","/work/probe.mjs"],"stdin":"","stdout":"Acme\n","exitCode":0}]}
```

The probe is public frozen code; expected stdout and exit status stay in the host
controller. Each check gets a fresh container reconstructed from the same base
plus validated submission. Builder termination must be confirmed first. Failed
setup, task execution, submission validation and acceptance remain distinct.
Evaluator failures are unknown. The original operation names precede dispatch;
uncertain termination retains host capacity even after its client exits.

Limits: 128 regular files and 256 KiB decoded total; paths at most 100 UTF-8 bytes;
384 KiB submission stdout and 16 KiB stderr (400 KiB combined transport bound);
evaluator output at most 16 KiB combined; eight checks; 600-second execution
maximum. Containers use one CPU, 512 MiB memory, 64 processes, a read-only root,
16 MiB `/work` and 32 MiB `/tmp` tmpfs, no network, no host mounts, dropped
capabilities. PID 1 runs as UID 1001 with an absolute deadline and a bounded
fallback lifetime, independent of the host client. Population and task/check
processes run as UID 1000 and cannot signal that supervisor. Before delivering
source, the controller checks the VM clock against a host request interval with
a 1-second tolerance; it does not claim exact clock synchronization. Each cleanup has ten seconds reserved within the case's
minute ceiling. Each slot reserves 1.5 MiB retention capacity; no old evidence is
truncated to admit another slot. Each immutable write also checks actual retained
bytes, including JSON encoding overhead. Wall time covers dispatch, execution,
evaluation and cleanup; preflight/preview and admission are excluded. Stopped containers retain original names for
inspection; removing those containers is explicit owner cleanup. No private state
is mounted, and no paid inference is performed. Currency and CPU usage stay null.

For a synthetic executable example, `tests/helpers/evaluation-execution.mjs`
creates pinned Acme source and frozen scripts. Run only the explicit integration
checks when local Docker and the helper's pinned image are available:

```sh
PLATES_EVALUATION_DOCKER=1 node --import ./tests/helpers/hermetic.mjs --test tests/evaluation-isolation.test.mjs
```

Normal focused tests leave Docker tests skipped. This opt-in validates machinery
and adversarial boundaries; it is not a paid agent evaluation or phase acceptance.


A capacity refusal after recording an intent has its own immutable
`admission-refusal.json`. Only the coordinator's proven pre-insertion refusal
can produce this record. The slot remains consumed under the frozen
zero-replacement policy, with no execution or acceptance claim; a later resume
can prepare other missing slots. Inspect host capacity first. A missing, partial,
misbound or contradictory refusal record remains uncertain and cannot release
capacity or authorize redispatch.

## Paired comparison and recovery

Comparison JSON includes read-only `recovery` diagnostics: observed execution
status, known admission closure, uncertain slots and original operation identities,
known settlement release, and a next action. Markdown includes the same diagnostics
and record-level evidence gaps. Unknown closure or settlement stays null. These
fields never authorize mutation: obtain a fresh recovery preview before acting,
and never infer retry or capacity release from a missing record.

`compare --experiment <id> --json` returns `{action, preview:false, report, markdown}`;
omit JSON for Markdown. Every planned slot remains in the report, including
failed, invalid, cancelled and missing work. Only an explicit `taskClass: control`
provides control coverage. Offline scripted results are machinery observations.

`resume --experiment <id> --execution <absolute-json>` previews a descriptor with
`schemaVersion: 1` and `executions`, an array of the existing single-slot request
objects for **every missing slot**, ordered by the frozen pairs and their AB/BA
arm order. Approve its returned digest with `--yes --digest`. Completed or failed
slots are never repeated. Inputs, controller bytes and retained evidence are bound
to the preview. New plans can explicitly retain up to 64 MiB total; individual
input/record caps remain 1/4 MiB. Resume reserves conservative storage for all
remaining trials and recovery, plus 20 seconds per planned slot for recovery.
Frozen ceilings never grow; insufficient old plans remain inspectable.

`reconcile --experiment <id>` previews original-operation recovery. New harness
locks record host, UID, PID, random identity and durable bytes. Recovery requires
the exact previewed inode/bytes and a same-host, same-UID ESRCH observation, under
an exclusive lock-mutation fence. Active/PID-reused, legacy empty, partial and
foreign locks refuse. A crash in the short mutation fence remains blocked for
owner resolution; it is never automatically stolen. Old lock bytes are archived.

New stage authorization receipts are durable before Docker create. Recovery
validates their ordered chain; missing Docker objects for an authorized stage
remain unknown. Future stages without authorization can be classified not-dispatched
only through this versioned protocol, never from container absence. A malformed
receipt blocks terminal recovery. Original artifacts, verdicts and partial bytes
remain unchanged; validated reconciliation receipts carry derived result evidence.
A verified original verdict survives result recovery. Otherwise acceptance is
unknown even after termination is confirmed.

`cancel --experiment <id>` previews admission closure and bounded stop requests.
Requested cancellation is not confirmed termination. Each comparison permits one
reconcile and one cancel attempt, reserved durably before effects; each operation
has a one-second total Docker deadline. An interrupted reservation consumes its
worst-case allowance. Repeat the original approved digest only to inspect its
receipt; it does not repeat effects. Uncertain termination blocks further dispatch
and retains the host lease. Rescore remains unsupported. The explicit live policy below has separate provider approvals; offline descriptors never enable it.


### Minute coverage

Each frozen trial minute ceiling includes its measured input preparation and
admitted execution. Host Git inspection/export and Docker image inspection share
a preparation deadline. Before each new slot, the controller rechecks the current
admission manifest hash and repository authorization/identity under the remaining
slot deadline; capacity is reserved atomically by the existing coordinator.
The approved invocation reuses the captured source and image;
resume does not repeat image preflight or source export for each slot after
approval. Preparation time and controller admission time reduce the remaining
slot deadline. Builder/evaluator deadlines reserve cleanup time and cleanup is
also capped by that slot's total deadline. An exhausted deadline refuses new
dispatch; a started or uncertain attempt retains its full reservation.

Receipts retain `approvedExecution` timing bounds. `resources.wallMs` keeps the
older dispatch-through-cleanup measurement; `approvedWallMs` and `preparationMs`
name the broader measured coverage. Earlier read-only preview calls, human review
waiting, and arbitrary stalls in host filesystem/kernel I/O are not billed agent
work or claimed hard wall-time coverage. No provider currency entitlement is
implemented. Whole-plan reservation is conservative; unknown usage is not refunded.


### Historical development corpus

`plates retro evaluations corpus inspect --json` lists six pinned historical
cases; all six are development cases and held-out inventory is zero. The shipped
catalog and protected probes work from an installed package. Export requires a
local repository containing the pinned historical objects; it never fetches.

```sh
plates retro evaluations corpus export --case package-entry --repository /absolute/source-repository --destination /absolute/private-parent/package-entry --json
plates retro evaluations corpus export --case package-entry --repository /absolute/source-repository --destination /absolute/private-parent/package-entry --yes --digest DIGEST_FROM_PREVIEW --json
```

The parent must already be canonical, private and owned by the caller, outside
Git. Preview is read-only and exits 3. Approval binds deterministic case/material
bytes, exact curated source hashes, every output hash, and destination parent
identity. Exclusive destination creation refuses concurrent, existing or partial
exports. Preserve partial output for inspection; it is never reset or overwritten.

`inventory.json` names the only files eligible for builder delivery, their hashes,
writable paths, protected probes and configuration overlays. `builder/` contains
those files, `evaluator/` contains schema-2 case/material records, and `curator/`
contains historical corrected-witness provenance. Directory separation is not
isolation: use only the explicit delivery inventory with the existing container
adapter. Do not pass curator data or acceptance material as configuration context.
Export neither creates a comparison nor dispatches work. The caller must author
and approve its configuration/comparison through the existing harness workflow.

Canvas recovery uses the actual supplied-card `canvasLive`/`canvasSync` surface;
snapshot/history collection, rendering and recovery export are excluded. Coordinator
guidance is a procedure task: existing empty state must remain refused. Historical
corrected witnesses demonstrate scripted machinery only, not agent improvement,
live provider activation, unseen generalization or production acceptance.

For future live preparation, `prepareCorpusInputPartition` in
`lib/evaluation-corpus.mjs` exposes a local library boundary for the reviewed
compatibility/control inventories. It produces public builder inputs separately
from immutable evaluator dependencies; reconstruction accepts edits only to the
case's public writable paths. Unclassified context and unsupported cases refuse.
See the [input partition contract](../specs/harness-input-partition.md).
This API neither freezes a plan nor executes a trial. A future live caller must
revalidate the existing frozen ledger and obtain its separate transfer approval;
there is no new live CLI operation in this component.

`preparePublicPacket` and `convertPublicResult` in
`lib/evaluation-public-packet.mjs` accept only the partition's branded public view.
They construct a fixed text-only request and convert bounded UTF-8 replacements to
the existing base64 artifact envelope. They do not call a provider or execute code.
The original partition handle must still reconstruct and bound private evaluator
inputs. See the [packet contract](../specs/harness-public-packet.md); private receipt
bindings stay local and are not part of the public request.

Current comparison JSON includes `recovery.operations`, one diagnostic for each
retained operation or missing slot. Each names its slot/operation identity,
original evidence paths and digests, observed reason, `nextAction`,
`missingPrerequisites`, and `requiredChecks`. The text view shows the same steps.
Every diagnostic has `authorizesMutation: false`; a suggested preview still needs
fresh workspace, source, ownership, retention and budget checks and its separate
approval. Missing evidence is not permission to retry or remove state.

Guidance distinguishes original-response GET from local-only recovery, consumed
reconciliation allowance, proven admission refusal, closed admission and missing
live count/generation versus offline work. A refused slot stays consumed; local
termination never proves remote completion, refunds unknown spend or accepts an
artifact. When inspection does not expose a required control or ownership fact,
the diagnostic retains it as a prerequisite rather than assuming it absent.
Historical V1/V2 report projections retain their original bytes; these current
inspection diagnostics are not new durable receipts or acceptance evidence.

## One-slot live controller

New schema3 configurations may explicitly select `host-gateway-v1` in both arms,
with runtime `single-generation-container-v1` version `1.0.0`, provider `openai`,
resolved model, null temperature and positive case/comparison currency ceilings.
The frozen outer plan remains schema2. Mixed live/offline arms refuse.

Use the closed schema2 descriptors in
[the live integration contract](../specs/harness-live-integration.md#appendix-a-closed-live-descriptors-and-pricing).
`run --execution /absolute/count.json` previews the exact public packet, fixed
request price quote, source and workspace binding. Preview exits3, writes nothing
and never consumes a credential FD. Approve count separately with
`--yes --digest <preview-digest> --credential-fd 50`. After its retained count and
local accounting complete, preview a `stage: "generation"` descriptor referencing
that count operation/result. Approve its separate quote/digest with a new pipe.
Generation uses one builder lease, then independent private acceptance checks;
provider completion alone cannot accept the artifact.

The pipe must be an inherited FIFO at an integer FD at least3, containing exactly
one UTF-8 JSON envelope followed by EOF:
`{"schemaVersion":1,"ref":"reviewed-key-reference","generation":1,"key":"<key>"}`.
Credential metadata must match the descriptor. This channel is currently supported
on macOS only. Never put keys in descriptors, command arguments, environment
variables or files. There is no key lookup or subscription-credential fallback.

`reconcile --execution /absolute/recovery.json` previews one explicit original-ID
GET or `mode: "local-only"`. GET needs its own fixed-request quote, approval and
pipe. Local-only forbids `--credential-fd`, makes no provider request or financial
settlement, and may release host capacity only from verified original ownership
or container termination. Both consume the same one-reconcile allowance and
10-second aggregate budget; cancellation's separate10 seconds are not borrowed.
Unknown money stays held. Repeating an original approval only inspects retained
receipts; it cannot POST/GET again or restart a builder. Live aggregate `resume`
is unavailable.

Preparation requires exact reviewed input classification. The current historical
manifest's empty `publicMaterials` is a real-cohort preparation gap: curate the
current harness context and narrow candidate explicitly before a cohort. The fixed
packet template is not a claim to represent the current harness. Synthetic
controller proof establishes machinery only, not paid activation or efficacy.
