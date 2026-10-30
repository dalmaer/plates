# Observe agent quality by stage and project

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
Paired summaries reuse existing frozen comparison inventory, including missing
slots and failures. Observational matching does not create causal evidence.

`--previous` must be a prior report from this command for the same workspace and
intended source population. Its digest checks retained bytes; it does not prove
that two independently supplied reports sampled the same population. Coverage, cohort and
critical-regression changes are review signals, not automatic routing decisions.
Statistical changes remain watch signals without prespecified practical thresholds
and repeated-check controls. Preserve the source reports for investigation.

## Add to an existing weekly workflow

Do not create a second scheduler. A current authorized local weekly workflow can:

1. Run baseline on the explicit repositories and save its output privately.
2. Extract `bundle`, preview collection, then approve that exact digest.
3. Run report with the previous saved report and the frozen reference mix if set.
4. Retain the JSON report under its digest as a new private file; keep prior files.
5. Summarize coverage, failures, critical regressions and changed cohorts to the
   owner. Keep private quality evidence out of any existing external publication.

`retro quality weekly --manifest ... --state ... --repository ... --json` combines
the current stored report with a fresh baseline **preview** for this workflow. It
does not persist candidates, save reports or schedule itself. Run collection and
the subsequent report explicitly as above. This preserves exact preview approval
and makes unfinished collection visible. A weekly report with no new adjudicated
episodes should say unknown, not tied. Continuous real-data collection is verified
only after subsequent workflow runs and manual reconciliation, not by unit tests.

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
