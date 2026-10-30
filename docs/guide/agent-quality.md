# Observe agent quality by stage and project

> Source: existing Plates agent-quality branch `9f8c17ad`, selectively integrated.
> This consolidation CLI exposes passive quality workflows only. The execution
> adapter and `retro quality run` examples below remain dormant source capabilities;
> they are not exposed by this CLI and have not been activated here.


`plates retro quality` is a local, metadata-only extension of the existing private
evaluation workspace. It separates planning, coding, review, iteration and
proportionality. It produces no universal leaderboard and never changes routing.

## Start with a bounded baseline

```sh
node bin/plates.mjs retro quality baseline --repository /absolute/project-a --repository /absolute/project-b --limit 20 --json
```

The total limit is shared evenly across at most ten explicitly selected local
repositories. Without `--repository`, the command inspects the current directory.
Each repository's GitHub origin must match `.plates/plates.json`. It reads commit
hashes, parents and timestamps, never commit messages, file contents or transcripts.
An unavailable repository remains an explicit coverage gap and exits 1. Invalid
arguments exit 2. No files or network requests are made by baseline.

For a previously authorized GitHub metadata export, supply one
`--pr-metadata /absolute/prs.json` for each repository, in the same order. Each
file is an array with only `number`, `state`, `createdAt`, `closedAt`, `mergedAt`,
`headRefOid`, `baseRefOid` and `url`; at most 200 records. The URL must name that
repository's PR. The adapter retains hashes and PR references, and reports counts
of open/closed/merged snapshots. Merge is never converted to accepted. Candidate identity hashes only the selected immutable project, PR number and creation
time. Mutable head/state remains in the baseline projection, so a later push or merge
cannot create an extra candidate. Human reconciliation still establishes task mapping.

Baseline output contains a `bundle` ready for collection. Every imported record
is an **unreconciled candidate**, not a verified task episode: several commits or
PRs can implement one task, and aborted/uncommitted work may be absent. Agent
identity, difficulty, initial patch, human effort and acceptance remain unknown.
The full report distinguishes candidates from assigned episodes. A baseline
cannot demonstrate Claude or Codex superiority.

## Collect private observations

Use the existing `plates workspace init` flow with an external manifest that
lists only permitted project repositories. State must be outside Git, the app and
the manifest directory. Keep authored inputs in a private directory and set
`umask 077` before saving output. Do not put evidence or reports in Git.

```sh
node bin/plates.mjs retro quality collect --manifest /absolute/inputs/workspace.json --state /absolute/private-state --bundle /absolute/inputs/quality.json --json
node bin/plates.mjs retro quality collect --manifest /absolute/inputs/workspace.json --state /absolute/private-state --bundle /absolute/inputs/quality.json --yes --digest EXACT_PREVIEW_DIGEST --json
node bin/plates.mjs retro quality inspect --manifest /absolute/inputs/workspace.json --state /absolute/private-state --json
```

Save the baseline's `bundle` object, rather than its whole wrapper, to the input
file. Collection preview exits 3; exact approved collection exits 0. Unknown,
repeated or inapplicable options refuse. Repeated collection retains the original
receipt. The existing session ledger owns locking, workspace binding and frozen
experiment joins; observations live under its private `.quality` extension.

`lib/agent-quality-records.mjs` defines the strict schema and `qualityEpisode`
constructs an unknown historical record. `tests/helpers/agent-quality.mjs` is a
complete synthetic example, not measured evidence. Prospective task passports
must precede assignment and retain their original classification. Append new
source events with the previous episode digest for updates; preserve previous
attempts, judgments and follow-up. A review or revision references the exact
earlier checkpoint. Experiment references must resolve to existing frozen slots
and attempts; collection never starts them.

The default retention is 90 days, 1,000 source events and 4 MiB. Expired records
leave active reports but their receipts remain; expiry does not silently delete
evidence or free a budget. Capacity exhaustion refuses further collection.
Review/deletion is a separate owner action. Strict fields permit hashes and
restricted references, not raw transcripts or unrestricted URLs. Source-project
access is checked against the manifest. Local declarations and content hashes
are provenance, not authentication of a human evaluator or proof of correctness.

## Read the scorecards

Use the [lifecycle and adjudication workflow](agent-quality-lifecycle.md) to enroll
ordinary work, capture stage boundaries and append independent judgments.
The [local observer guide](agent-quality-adapters.md) gives the private binding,
ordinary command wrapper and existing-review hook configuration.
`retro quality pending --manifest ... --state ... --json` shows actionable
annotations, waiting follow-up and historical gaps separately. Current app
sessions are not discovered automatically; capture requires the explicit local
binding and supported command/review hooks or conductor instrumentation.

```sh
node bin/plates.mjs retro quality report --manifest /absolute/inputs/workspace.json --state /absolute/private-state --json
node bin/plates.mjs retro quality report --manifest /absolute/inputs/workspace.json --state /absolute/private-state --previous /absolute/reports/previous.json --reference-mix /absolute/inputs/mix.json --json
```

Report is read-only. JSON carries source and report digests, project/specialty/
difficulty strata, exact agent cohorts, separate stage scores, costs, review
findings and 7/30-day follow-up. Unknown charges and human effort remain null;
failed attempts stay in accounting. Acceptance requires attributed independent
human evidence. Model judges alone cannot establish correctness. Serious security,
privacy and data-loss safeguards are quality requirements, not complexity penalties.

An optional reference mix is `{id,createdAt,strata:[{project,specialty,family,
difficultyBand,risk,weight}]}`. Weights must total one and the mix must be frozen
before assignment. Missing strata remain unknown without redistributed weights.
The separately labelled workload view reflects the actual changing workload.
Exact provenance retains task-specific prompts and context hashes. Descriptive
configuration cohorts group stable agent settings across those different tasks;
project/specialty/family/difficulty/risk views remain separate. Unknown model
versions are not guessed, and aggregated associations do not establish a winner.
Paired summaries reuse existing frozen comparison inventory, including missing
slots and failures. Observational matching does not create causal evidence.

`--previous` must be a prior report from this command for the same workspace and
intended source population. Its digest checks retained bytes; it does not prove
that two independently supplied reports sampled the same population. Coverage, cohort and
critical-regression changes are review signals, not automatic routing decisions.
Statistical changes remain watch signals without prespecified practical thresholds
and repeated-check controls. Preserve the source reports for investigation.

## Collect and retain a weekly report

```sh
node bin/plates.mjs retro quality weekly --manifest /absolute/inputs/workspace.json --state /absolute/private-state --json
node bin/plates.mjs retro quality weekly --manifest /absolute/inputs/workspace.json --state /absolute/private-state --yes --digest EXACT_PREVIEW_DIGEST --json
```

Preview exits 3. Exact application ingests an optional `--bundle` of eligible
local observations and reports on all retained lifecycle events. Explicit
`--repository`, `--pr-metadata` and `--limit` add a bounded metadata baseline;
without these flags weekly does not scan repositories. Duplicate episode IDs
between an added baseline and bundle refuse rather than guess a reconciliation.
Use `--previous` and `--reference-mix` as on report; their contents are bound to
the reviewed operation.

The command saves an immutable receipt under private
`session-trials/.quality/reports/<approved-digest>.json`. Its `result.report`
contains the report and its own content digest. Repeating that exact approved
operation returns the original report, including its original observation time.
If report retention fails after collection, collection remains committed and the
failure is explicit; inspect the retained evidence before recovery. Reports and
observations share the existing storage byte ceiling. Nothing silently expires
or deletes report files to make room. The observation-event limit includes command
source receipts; saved report files have a separate count bound of the same size,
while all three share the single byte ceiling.

An authorized local weekly routine can invoke preview then apply and summarize
coverage, failures, changed cohorts and pending judgments. This command neither
creates a scheduler nor changes an existing routine. Scheduling requires its
separate approval. Keep private quality evidence out of unrelated publication
destinations. A weekly report without new adjudicated episodes says unknown,
not tied. Ongoing operation is verified by subsequent real runs, not unit tests.

## Prepare replay without spending

```sh
node bin/plates.mjs retro quality replay-plan --manifest /absolute/inputs/workspace.json --state /absolute/private-state --json
```

This read-only proposal binds the evidence digest and describes Claude → Codex →
Claude versus the reverse, balanced AB/BA order, identical frozen inputs, blinded
reviewer crossover and an equal-budget self-revision control. Currency caps and
practical thresholds are unset. It cannot reserve budget or dispatch agents.
Existing `retro evaluations plan|freeze|compare` remains the record authority;
a separately reviewed live provider adapter, explicit budget and human adjudicators
are required before paid replay. No current output is permission to run it.
