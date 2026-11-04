# Does plates help? The results

**Written 4 November 2026**, against the measures fixed on 2 October in
[the pre-registration](2026-10-02-does-plates-help-measures.md) (plates was
called keel then; that page is not edited).

**What was found, plainly: the data does not show that plates made the fleet
better.** It does not show the opposite either. On the one real before and
after, ledger, gate red streaks got much shorter (longest 39 → 4) and more of
the new lessons named a guard file that exists (75% → 89%). But the reference
that was meant to rule out "everything got better anyway", isocan, was itself
adopted two days into the after window, so the planned control is broken. Phases
moved per week stayed about the same, and no ledger move to `built` carried an
evidence path in either window. Practice drift was already zero and stayed
there. Conduct cost did **not** stay at zero, as the pre-registration expected:
plates's own builders ran the whole check 168 times. The lesson loop is in use:
176 lessons came home, 172 were decided, and all 34 accepted ones shipped in a
release. These are descriptions with small n, not tests.

## Whether the comparison was due

| Project | Adopted (first `.keel/keel.json` commit, UTC) | Use |
| --- | --- | --- |
| ledger | 2026-10-03 15:37 | before/after |
| cajones | 2026-10-04 00:45 | after-only |
| duo | 2026-10-04 00:45 | after-only |
| isocan | 2026-10-05 21:20 | reference, **but adopted** (isocan#392) |

Four projects were adopted by 5 October, so the "fewer than two by 15 November"
rule is not the finding. Second adoption 2026-10-04, plus 4 weeks, is
2026-11-01, so the earliest results date had passed. plates's fleet record
lists six more managed projects adopted later (white-elephant, dtv, papa-tapes,
family-hub, switchboard, homeroom). They come into measure 4 only.

Windows: ledger and isocan before = 2026-09-16 15:37 → 2026-10-03 15:37 UTC,
after = the next 17 days, to 2026-10-20. duo and cajones = their first 28 days
from adoption. isocan was unadopted for the first 2 of its 17 after-days, and
from then on it ran plates with its own phases, conduct, CI, night, renovate and
loop as local variants. **So a change seen in ledger and not in isocan is not
clean evidence for plates, and a change seen in both is not clean evidence
against.**

## The six measures

### 1. Red streak

The gate's default-branch runs (`gh run list --branch main --workflow <gate>`,
`conclusion` and `createdAt` only). Red = `failure`, `timed_out`,
`startup_failure`. Green = `success`. Cancelled and skipped runs are neither, so
they don't break a streak. Recovery is first red → next green, read past the
window's end if needed. No streak in any window went unrecovered.

| Project (gate) | Window | Runs (counted) | Reds | Streaks | Longest | Median h to green |
| --- | --- | --- | --- | --- | --- | --- |
| ledger (`test.yml`) | before | 789 (445) | 64 | 11 | **39** | 0.4 |
| ledger | after | 220 (151) | 10 | 5 | **4** | 0.1 |
| isocan (`release.yml`) | before | 220 (213) | 52 | 18 | 12 | 1.0 |
| isocan | after | 216 (216) | 65 | 36 | 9 | 0.9 |
| duo (`deploy.yml`) | first 4 weeks | 53 (53) | 0 | 0 | 0 | — |
| cajones (`pages.yml`) | first 4 weeks | 48 (47) | 0 | 0 | 0 | — |

ledger's longest streak and recovery time both fell. isocan's longest streak
fell a little, while its reds and streaks rose. As context, not a
pre-registered measure: the red share went 14% → 7% for ledger and 24% → 30%
for isocan. duo and cajones were never red in their first four weeks. The
gates: ledger and isocan name theirs in config (`gateWorkflow`). duo and
cajones don't, so this uses the workflow `plates fleet` resolves for them.

### 2. Lesson to guard

These are the rows present at the window's end and not at its start, keyed by
the row's first cell. That is the net of `git log -p` over the window, read at
the last default-branch commit before each boundary. A guard "names a file"
when a code span or a bare path in its Guard cell exists in `git ls-tree` at
the window's end, either as that exact path or as the tail of one. A table
split by blank lines counts as one table.

| Project | Window | Rows added | Guard names a file | …that exists | Share |
| --- | --- | --- | --- | --- | --- |
| ledger | before | 20 | 15 | 15 | 0.75 |
| ledger | after | 9 | 8 | 8 | 0.89 |
| isocan *(substituted file)* | before | 0 | — | — | — |
| isocan *(substituted file)* | after | 45 | 40 | 39 | 0.87 |
| duo, cajones | first 4 weeks | 0 | — | — | — |

**Substituted:** isocan has no `docs/lessons.md`. Its table, with the same four
columns, is `docs/reviews/lessons.md`, and that file is read in its place.
isocan added no rows before and 45 after. Some of those 45 may have been moved
into the table from elsewhere in the file, and a row key can't tell a move from
a new lesson. ledger's share rose, but n is 20 and 9.

### 3. Phases moved per week

Front-matter `status:` changes in `docs/phases/`, as they landed on the default
branch (`git log --first-parent -m -- docs/phases`, comparing each file's front
matter with its parent's). A file's creation is not counted as a move.

| Project | Window | Moves | Per week (by week) | Moves/week | To built | …with evidence |
| --- | --- | --- | --- | --- | --- | --- |
| ledger | before | 17 | 15, 1, 1 | 7.0 | 8 | 0 |
| ledger | after | 15 | 13, 1, 1 | 6.2 | 3 | 0 |
| duo | first 4 weeks | 0 | 0, 0, 0, 0 | 0 | 0 | — |
| cajones | first 4 weeks | 0 | 0, 0, 0, 0 | 0 | 0 | — |

The raw count is reported but not interpreted, as pre-registered. The
evidence-backed share was expected to rise, and it did not. It was 0 of 8 and
0 of 3, because ledger's phases don't carry an `evidence:` front-matter field:
one of its 50 phase files has one today. **Not computable for isocan as
written:** it has no `docs/phases/`. Its phases are `**Status:**` lines in
`docs/projects/<p>/phases.md`, which plates reads without writing. No substitute
was made.

### 4. Practice drift across the fleet

These were not read live each week. The weekly readings are rebuilt from each
project's own dated health page: its `drift` row is doctor's `edited` + `both`.
Local variants are the keys of `local` in the project's config as of that day.
The managed set is plates's fleet record as of that day. Readings are on
Mondays.

| Monday | Managed | Pages read | Drift | Local variants | Total |
| --- | --- | --- | --- | --- | --- |
| 2026-10-05 | 5 | 4 | 0 | 18 | 18 |
| 2026-10-12 | 5 | 5 | 0 | 14 | 14 |
| 2026-10-19 | 5 | 5 | 0 | 14 | 14 |
| 2026-10-26 | 8 | 5 | 0 | 14 | 14 |
| 2026-11-02 | 11 | 5 | 0 | 14 | 14 |

Drift was 0 on every page read. Local variants fell once, when isocan's went
from 8 to 4 between 5 and 12 October, and then held. Missing pages are **gaps,
not zeros**: isocan had no page on 5 October, and the six later projects keep no
health pages in their repositories. The expectation that drift falls can't be
met from zero. Only the local variants moved.

### 5. Conduct cost per phase

The transcripts are this machine's Claude Code subagent transcripts
(`~/.claude/projects/<checkout>/<session>/subagents/agent-*.jsonl`). They are
classified by `commandKind` from `scripts/plates/improve.mjs`, the same
classifier `plates improve --transcripts` uses. A cross-check of `conductCost`
on isocan's sessions matched exactly. A builder is a transcript whose brief says
"you are the builder", or whose task is described as a build. "In checkout" is
how the CLI counts a whole check. "Any directory" also counts fixture and
worktree runs after a `cd`. A phase counts as committed when a default-branch
commit after the builder started names it. One session was stored under both of
plates's checkout names (keel and plates), so each agent file is read once.

| Project | Window | Builders | Whole runs, in checkout (any dir) | Builders with one | Committed phases | Median builder min/phase |
| --- | --- | --- | --- | --- | --- | --- |
| plates | week of 2026-10-02 | 88 | 20 (58) | 12 | 42 | 20.3 |
| plates | week of 2026-10-09 | 19 | **107** (111) | 19 | 18 | 91.6 |
| plates | week of 2026-10-16 | 9 | 41 (41) | 9 | 9 | 47.1 |
| plates | week of 2026-10-23 | 0 | — | — | — | — |
| plates | week of 2026-10-30 | 8 | 0 (8) | 0 | 7 | 10.2 |
| plates | all | 133 | 168 (234) | 40 | 80 | 31.3 |
| isocan | before | 14 | 22 (22) | 14 | 6 | 62.2 |
| isocan | after | 9 | 0 (0) | 0 | 4 | 32.5 |

The pre-registered baseline was 0 whole-check runs in plates's first session,
from phase 11's evidence. The transcripts on disk now show 2 in-checkout runs
from 40 builders that first day, 3 October UTC. The expectation that it stays
at 0 **did not hold**. Most of the runs fall in the week of 9 October, when all
19 builders ran it, and 10 of their 19 opening prompts named `npm run check`
themselves. So that week's runs were briefed, not stray. isocan went the other
way, from 22 runs to 0. Minutes are described, not judged.

What could not be read: ledger has 2 subagent transcripts on this machine and
no builders, so its conducted work isn't here. duo's 3 builders all date from 30
September, before adoption. cajones has none. This session's own transcript is
in the last plates week.

### 6. Lessons that came home

| | Count |
| --- | --- |
| `lesson` issues filed (through 2026-11-02) | 176 (isocan 111, ledger 53, cajones 4, duo 4, switchboard 4) |
| decided (a `decided:*` label) | 172: decline 64, link 74, lesson 32, practice 2 |
| accepted (lesson or practice) | 34 |
| accepted and in a release tag | 34. The accepted lesson's row is in `docs/lessons.md` at the first tag after the decision; median 0.3 days |

**Location substituted:** the pre-registration says "filed on keel". The CLI
files lessons on plates's configured `inbox`, the private `dalmaer/plates-inbox`,
and that is what was read. `dalmaer/plates` (formerly `dalmaer/keel`) has 0
`lesson` issues. Every decision label read was applied under the owner's
account, which agents also use, so "a person decided" means the decision step
was taken, not who typed it. The loop is used: the count is above zero.

## Not run

Golden tasks with and without plates's skills (isocan's skill-lift method) were
not run. They spend model tokens, and the owner's yes on the cost has not been
given.

## Reproduce

```bash
node scripts/research/does-plates-help.mjs --fleet <scratch>/fleet --json
```

This clones any missing project into `--fleet` as a full clone, then reads git
history, `gh run list`, `gh issue list` and `gh api` comment GETs. It caches
every gh answer in `<fleet>/cache` and writes nothing else. The defaults are
`--until 2026-11-02`, `--transcripts ~/.claude/projects` and `--checkouts
~/code`. The numbers above come from plates `1786f4ef8` with the cache filled
on 2026-11-04. The windows are dated, so later commits don't move measures 1–3.
Measure 4 reads dated pages from each clone's HEAD, and measure 6's labels can
change, so a run without the cache can differ there.
