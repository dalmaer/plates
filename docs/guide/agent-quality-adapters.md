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
  "sources": ["review"]
}
```

Select only the sources intended for this task. A binding to an absent episode,
different repository or unpermitted project refuses. Keep one episode per task;
multiple commands, retries and reviews become attempts within it.

## Local execution remains deferred

The retained command-wrapper prototype and its fixtures are historical source,
not an installed execution interface. `plates retro quality run` refuses before
reading a descriptor or dispatching a process. A separate execution-boundary
review must decide how an adopted executor supplies observations and authority;
a private quality binding grants neither command execution nor model spend.

Use explicit lifecycle events for stage boundaries actually observed by the
conductor. Record unavailable checkpoints, usage and process results as unknown.
Do not infer observations from a command name, elapsed time or a Git author.
The prototype's checkpoint helpers support exact review joins, but retaining
those helpers does not expose its process wrapper.

## Capture an existing PR review

The episode must explicitly include `Acme/widget#12` in its `links`. Identical
content in another PR is insufficient. A coding/iteration checkpoint must already
exist, and the exact reviewed commit must be available locally. The checkpoint
covers tracked files plus the untracked paths a command record lists in
`checkpointPaths`. Any other untracked, non-ignored file (or a non-file entry
such as a socket) makes it unknown: `digest` is null and `coverage` is
`incomplete`. In a working tree with stray untracked files, every later review
capture then reports `reviewed-checkpoint-not-recorded`; list those paths, ignore
them or remove them before the coding attempt finishes. If the task began
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
model identity remain unknown. The captured review attempt keeps the reviewed tree
in `inputCheckpointDigest` and the metadata hash in `metadataDigest`; its
`checkpointDigest` is null, because metadata is not a repository artifact.
Repeated reads retain one observation per review.
The default text and JSON report whether capture succeeded or why evidence could
not join. A capture gap does not block the original review command.

The hook covers ordinary PR reads, not push reviews, review gates or independent
GUI activity. Spin's conductor instructions describe explicit stage observations;
they are not an automatic GUI harness hook. Cloud climb/cross-review runners and
consumer installations without a private local binding remain unsupported.
No adapter installs a scheduler, sends evidence externally or starts paid replays.
