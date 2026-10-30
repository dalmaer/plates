# Observe ordinary local tasks and reviews

First enroll an episode using the [lifecycle workflow](agent-quality-lifecycle.md).
The adapters use that existing private ledger. They collect metadata only and
leave task acceptance, hidden model versions, billing and human judgments unknown.
They do not discover app sessions or grant command, network or model-spend authority.

## Bind one repository and episode

Create a mode-0600 JSON file outside Git. Both the manifest and state must already
belong to the initialized evaluation workspace; the manifest must permit the
project. Use the canonical absolute repository root. Its GitHub origin and
`.plates/plates.json` repository identity must match `project`.

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "manifest": "/absolute/private-inputs/workspace.json",
  "state": "/absolute/private-state",
  "project": "Acme/widget",
  "episodeId": "acme-task",
  "repository": "/absolute/widget",
  "sources": ["command", "review"]
}
```

Select only the sources intended for this task. A binding to an absent episode,
different repository or unpermitted project refuses. Keep one episode per task;
multiple commands, retries and reviews become attempts within it.

## Wrap an authorized local command

The command wrapper requires a POSIX host (such as macOS or Linux). Windows is
refused before preview or dispatch because process-group termination is unsupported.

Create another mode-0600 JSON file outside Git. The executable is an absolute
path, arguments are explicit, and the timeout is an integer from 1 to 3,600
seconds. The example runs an existing Node script in the bound repository.
Use the actual executable path on the machine.

```json
{
  "schemaVersion": 1,
  "id": "acme-coding-1",
  "binding": "/absolute/private-inputs/binding.json",
  "command": {
    "executable": "/absolute/node",
    "args": ["scripts/already-authorized-task.mjs"],
    "timeoutSeconds": 300
  },
  "stage": "coding",
  "agent": null,
  "parentId": null,
  "inputCheckpointDigest": null,
  "checkpointPaths": []
}
```

Run from the bound repository with the Plates CLI installed, or substitute an
absolute path to the source checkout's `bin/plates.mjs` using Node:

```sh
plates retro quality run --record /absolute/private-inputs/command.json --json
plates retro quality run --record /absolute/private-inputs/command.json --yes --digest DIGEST_FROM_PREVIEW --json
```

Preview exits 3 and launches nothing. Read the exact private descriptor before
approving: the preview identifies its path and byte digest, executable, argument
count and bounds. Argument contents remain in the authored input file. The
wrapper launches without a shell, discards stdout/stderr, and records start,
observed process result, measured duration and checkpoint. Choose the stage of
the actual work; running an offline scoring script is not agent coding evidence.
Agent declarations are optional and are not inferred from Git authors or command
names. Known usage can be recorded through the lifecycle API; it is not inferred
from elapsed time.

Failed, denied, timed-out and interrupted executions remain attempts. Descendant
processes in the command's process group are terminated at completion/timeout;
unconfirmed termination is unknown. This is a process wrapper, not a sandbox.
An exact retry recovers its immutable receipt without dispatching again. Missing
terminal receipts stay uncertain and cannot authorize redispatch. If a terminal
receipt exists but lifecycle recording failed, an approved exact retry reconciles
the original result, end time and duration without rerunning the command.
Receipts share the ledger lock and retention capacity; exhaustion refuses writes.

The checkpoint hashes tracked Git content plus explicitly listed untracked
`checkpointPaths`, without retaining those contents. It does not read arbitrary
untracked or ignored files. Unlisted untracked files, unsupported index entries
(including submodules/conflicts), or unavailable bounded evidence produce a gap.
Changed files are bounded to 1 MiB each and 8 MiB total; tracked inventory is
bounded to 20,000 entries. The same content has the same checkpoint before and
after a conductor commits it. Review and iteration commands require a prior
`inputCheckpointDigest` that exactly matches the complete current checkpoint;
stale or incomplete inputs refuse before dispatch. Changed inputs after preview
also invalidate approval.

## Capture an existing PR review

The episode must explicitly include `Acme/widget#12` in its `links`. Identical
content in another PR is insufficient. A coding/iteration checkpoint must already
exist, and the exact reviewed commit must be available locally. If the task began
with only an issue reference, append a lifecycle event with `action: "link"`
and `payload: {"links": ["Acme/widget#12"]}` when the PR is created, using the
same preview/apply workflow. This adds the source reference without rewriting
the original passport or history. Enable the binding
for the ordinary review read:

```sh
PLATES_QUALITY_BINDING=/absolute/private-inputs/binding.json plates review Acme/widget#12
```

This uses only review metadata that `plates review` already fetched. It makes no
additional provider requests and stores no review bodies. Captured metadata
includes hashes of the reviewer identifier and exact review facts; provider and
model identity remain unknown. Repeated reads retain one observation per review.
The default text and JSON report whether capture succeeded or why evidence could
not join. A capture gap does not block the original review command.

The hook covers ordinary PR reads, not push reviews, review gates or independent
GUI activity. Spin's conductor instructions describe explicit stage observations;
they are not an automatic GUI harness hook. Cloud climb/cross-review runners and
consumer installations without a private local binding remain unsupported.
No adapter installs a scheduler, sends evidence externally or starts paid replays.
