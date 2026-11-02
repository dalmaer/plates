# Evidence: phase 153 — decisions read as plain English

Conductor's checks, 2026-10-31, branch `claude/phase-153`. The builder's
commit is `351d9430`.

## What the owner hit

Deciding the 25 October health proposal in the hosted workspace: the
question was raw markdown naming a measure id and a failed command; it did
not say what Accept or Decline would do; it was already out of date (the
check read ok from 26 October); and every report from 26 October was over the
workspace's 256 KiB per-file limit, answered as "a required connection is
unavailable".

## Automated

| Did | Expected | Observed |
| --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/plain-decisions.test.mjs` (conductor) | 5 pass | 5 of 5 |
| Builder's mutations, one at a time: raw error leaks into the plain block; Decline override removed; markdown shown raw; full reconciliation set put back inline; too-large mapping removed | each fails its own test | each failed (the Decline removal also failed the page test) |
| Conductor mutation: HTML escaping dropped from the page's markdown | the page test fails | failed 1 of 5, restored clean |
| Builder: 31 related test files (1,193 tests), `npm run typecheck`, `npm run render:check` | pass | exit 0 each |
| Report regenerated from real data | under 128 KiB | 30 Oct: 267,424 → 21,811 bytes (sidecar 246,365); 25 Oct: 238,306 → 21,272 |
| `npm run check` through `plates integrate` | pass | in the integrate log |

## The 25 October proposal, as the page now shows it

- What's wrong: the nightly check for "working records contradict
  references or delivery facts" could not run on 25 October 2026: a GitHub
  read failed. A check that cannot run is not a pass.
- What you're deciding: whether to plan work (a phase) to get this check
  running again, or to set it aside.
- If you accept / decline / do nothing: what each writes on the report and
  what follows, as the code does it.
- Freshness: until a readable newer report exists, the page says it could
  not check; with one, "This fixed itself on <date>" and Decline is
  recommended.

## Decisions

- The night now writes the full reconciliation observations to
  `<health>/<date>.reconciliation.json` beside the page; the night workflow
  stages it and the drain counts it as night data, or night PRs would stop
  merging. Older pages with the set inline are still read.
- Hygiene and time proposals keep their own writers and get no plain block.
- "Fixed itself on <date>" is the earliest date in the run of ok reports the
  page could read (up to 7, within 1 MiB), so it can be later than the true
  fix.

## Not yet walked

- ⚑ The owner opens a current proposal in the hosted workspace, after the
  hosted build moves forward (phase 151).

Supports **partial** (walk owed).
