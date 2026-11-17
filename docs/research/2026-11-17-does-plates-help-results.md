# Does plates help? The results, against the 2 October pre-registration

**Computed 17 November 2026.** This page answers the questions fixed in
[the pre-registration](2026-10-02-does-plates-help-measures.md) (written when
plates was still called keel), with the measures, windows and comparison it
names. Where a measure could not be computed as written, this page says so and
marks any substitute as a substitute.

## Verdict

**This comparison does not show that plates makes projects better.** It does
not show harm either. Mostly it cannot tell.

- One of the six measures moved the expected way with nothing against it,
  on one project, with n of 20 and 9 and no reference (lesson to guard).
- One moved the expected way but the reference moved the same way, so by the
  pre-registered rule it is not counted as plates's (red streak).
- Three did not do what was expected: the evidence-backed share of built
  phases stayed at zero, practice drift did not fall, and builders' whole-check
  runs did not stay at zero.
- One was above zero as expected (lessons came home), but as a three-day
  burst, not a loop that kept running.

The comparison itself was weaker than planned. Only one project has a before
and after, and the reference project, "never adopted", was adopted two days
into the after window. The pre-registration said nothing here is a statistical
test, and nothing here is.

## Were the conditions for a results page met?

Yes. Three projects were adopted on 3 October 2026 (local time), so "at least
two adopted by 15 November" holds. Four weeks after the second adoption is
31 October; this page is dated after that and after 1 November.

| Project | Adopted (UTC) | History before | Use here |
| --- | --- | --- | --- |
| ledger | 2026-10-03 15:37 | 18.0 days | before and after, 17 days each |
| duo | 2026-10-04 00:45 | 3.4 days | after only, 28 days |
| cajones | 2026-10-04 00:45 | 4.2 days | after only, 28 days |
| isocan | 2026-10-05 21:20 | 51.2 days | reference, read over ledger's two windows |

Adoption is the commit that first added `.keel/keel.json`. The windows are
half-open, `from <= t < to`:

- ledger before: 2026-09-16T15:37:55Z to 2026-10-03T15:37:55Z
- ledger after: 2026-10-03T15:37:55Z to 2026-10-20T15:37:55Z
- duo after: 2026-10-04T00:45:39Z to 2026-11-01T00:45:39Z
- cajones after: 2026-10-04T00:45:34Z to 2026-11-01T00:45:34Z

## Was the pre-registration left alone?

Yes. The file was renamed with the project on 21 October and its text is
byte-for-byte what was committed on 2 October:

```sh
git diff 45a52ee:docs/research/2026-10-02-does-keel-help-measures.md HEAD:docs/research/2026-10-02-does-plates-help-measures.md   # prints nothing
```

This is not the first time the after-adoption data was read. A draft results
page was written on 4 November on a branch that never merged. This page was
computed afresh, with its own script, without reading that draft first. Where
the two overlap they agree on measure 1's run counts and longest streaks, on
measure 3's evidence counts and on measure 6's label counts. They differ where
a definition was chosen differently. The draft counted a Guard cell that
matches the tail of a path (75% before, where this page's exact-path rule gives
70%). It read phase moves along the first parent only (15 after, where this
page counts 17). And for measure 5 it counted only transcripts briefed as
builders (168 whole runs at the project root through 2 November, where this
page counts every subagent and finds 193 through 22 October). Neither choice
changes a reading below.

## What went differently from the plan

1. **The reference was adopted.** isocan came under plates on 5 October,
   2.2 days into ledger's 17-day after window. For 14.8 of those 17 days it
   was not an unadopted project. "A change in ledger only counts as plates's if
   isocan didn't move the same way" can still be applied, and is, but isocan
   moving the same way no longer rules plates out as the cause in both.
2. **isocan has no `docs/lessons.md` and no `docs/phases/`.** It keeps phases
   under `docs/projects/`. Measures 2 and 3 cannot be computed for it as
   written, so ledger has no reference on those two.
3. **Measure 4 was not read weekly.** No one recorded doctor's counts each
   week. The series below is rebuilt from git history afterwards. It is a
   substitute and is marked as one.
4. **Measure 5 cannot be given per committed phase.** Transcripts do not name
   the phase they built. Totals are given; a per-phase figure uses a substitute
   denominator and is marked.
5. **Measure 6's issues are not on plates.** Lesson issues go to a private
   inbox repository, `dalmaer/plates-inbox`. Plates's own repository has no
   issue labelled `lesson`. The counts are read from the inbox's labels.
6. **The gate workflow had to be chosen per project.** ledger `test.yml`,
   cajones `pages.yml`, isocan `release.yml`. duo's `test.yml` runs only on pull
   requests; its default-branch gate is `deploy.yml`, which runs the same
   checks before it builds, so that is the one read.

## Setup the commands below assume

`$DATA` is an empty directory. `$S` is `scripts/research/does-plates-help.mjs`
in a plates checkout. ledger and cajones are private; the commands work for
anyone who can read them.

```sh
gh repo clone dalmaer/ledger  $DATA/ledger
gh repo clone dalmaer/duo     $DATA/duo
gh repo clone dalmaer/cajones $DATA/cajones
gh repo clone dglazkov/isocan $DATA/isocan
gh repo clone dalmaer/plates  $DATA/plates
node $S windows --repo $DATA/ledger    # adoption time and the windows; same for the others
```

The script prints counts and durations only. Its definitions are pinned by
`tests/research-does-plates-help.test.mjs`.

## 1. Red streak

**Expected:** lower after adoption.

`gh run list` returns at most 1,000 runs for one query, and ledger's gate ran
more often than that, so ledger is fetched in two date ranges and joined.

```sh
gh run list --repo dalmaer/ledger --branch main --workflow test.yml --created 2026-09-15..2026-09-19 --json conclusion,createdAt --limit 1000 > $DATA/ledger-a.json
gh run list --repo dalmaer/ledger --branch main --workflow test.yml --created 2026-09-20..2026-10-21 --json conclusion,createdAt --limit 1000 > $DATA/ledger-b.json
jq -s add $DATA/ledger-a.json $DATA/ledger-b.json > $DATA/ledger-runs.json
gh run list --repo dglazkov/isocan --branch main --workflow release.yml --created 2026-09-15..2026-10-21 --json conclusion,createdAt --limit 1000 > $DATA/isocan-runs.json
gh run list --repo dalmaer/duo     --branch main --workflow deploy.yml --json conclusion,createdAt --limit 1000 > $DATA/duo-runs.json
gh run list --repo dalmaer/cajones --branch main --workflow pages.yml  --json conclusion,createdAt --limit 1000 > $DATA/cajones-runs.json
node $S red-streak --runs $DATA/ledger-runs.json --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S red-streak --runs $DATA/ledger-runs.json --from 2026-10-03T15:37:55Z --to 2026-10-20T15:37:55Z
node $S red-streak --runs $DATA/isocan-runs.json --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S red-streak --runs $DATA/isocan-runs.json --from 2026-10-03T15:37:55Z --to 2026-10-20T15:37:55Z
node $S red-streak --runs $DATA/duo-runs.json     --from 2026-10-04T00:45:39Z --to 2026-11-01T00:45:39Z
node $S red-streak --runs $DATA/cajones-runs.json --from 2026-10-04T00:45:34Z --to 2026-11-01T00:45:34Z
```

How it is counted: a run is red when its conclusion is `failure`, `timed_out`
or `startup_failure`, and green when it is `success`. Cancelled runs are left
out of the sequence; they neither break a streak nor extend it. A "first red"
is a red that follows a green. Its time to green runs to the next green, even
one after the window. Every first red below was followed by a green.

| Project, window | Runs | Green | Red | Cancelled | Longest red streak | First reds | Median hours, first red to green |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ledger, before | 789 | 381 | 64 | 344 | **39** | 11 | **0.39** |
| ledger, after | 220 | 141 | 10 | 69 | **4** | 5 | **0.14** |
| isocan, same days as ledger before | 220 | 161 | 52 | 7 | **12** | 17 | **1.43** |
| isocan, same days as ledger after | 216 | 151 | 65 | 0 | **9** | 36 | **0.87** |
| duo, 28 days after | 53 | 53 | 0 | 0 | 0 | 0 | none to measure |
| cajones, 28 days after | 48 | 47 | 0 | 1 | 0 | 0 | none to measure |

**Read as pre-registered:** ledger's longest red streak fell from 39 to 4 and
its median time to green from 0.39 to 0.14 hours. isocan moved the same way on
both, 12 to 9 and 1.43 to 0.87 hours. So the change in ledger is **not counted
as plates's**.

What weakens that either way:

- isocan was itself adopted two days into the second window (deviation 1).
- ledger's gate ran 789 times before and 220 times after. A project that pushes
  a quarter as often has less chance to stack failures. The 39-run streak was
  one stretch of about eight hours on 18 and 19 September.
- duo and cajones had no red run at all, and no before to compare with.

## 2. Lesson to guard

**Expected:** higher after adoption.

```sh
node $S lessons --repo $DATA/ledger  --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S lessons --repo $DATA/ledger  --from 2026-10-03T15:37:55Z --to 2026-10-20T15:37:55Z
node $S lessons --repo $DATA/isocan  --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S lessons --repo $DATA/duo     --from 2026-10-04T00:45:39Z --to 2026-11-01T00:45:39Z
node $S lessons --repo $DATA/cajones --from 2026-10-04T00:45:34Z --to 2026-11-01T00:45:34Z
```

How it is counted: a row is added when `git log -p docs/lessons.md` shows it
added in the window and its first cell was not in the table when the window
opened, so an edited row is not a new one. Its Guard cell names a file when a
path-shaped word in it is a file in `git ls-tree -r` at the window's last
commit. A directory does not count.

| Project, window | Rows added | Guard names a file that exists | Share |
| --- | --- | --- | --- |
| ledger, before | 20 | 14 | **70%** |
| ledger, after | 9 | 8 | **89%** |
| isocan | not computable: no `docs/lessons.md` has ever existed | | |
| duo, 28 days after | 0 | 0 | undefined |
| cajones, 28 days after | 0 | 0 | undefined |

**Read as pre-registered:** ledger's share rose from 70% to 89%, the expected
direction. It rests on 20 rows and 9 rows in one project, with no reference.
ledger wrote lessons at less than half the rate after adoption.

duo and cajones added no lesson row in their first four weeks under plates.
Neither project's `docs/lessons.md` changed after adoption.

## 3. Phases moved per week

**Expected:** the evidence-backed share of moves to `built` rises. The raw
count is reported and not interpreted.

```sh
node $S phases --repo $DATA/ledger  --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S phases --repo $DATA/ledger  --from 2026-10-03T15:37:55Z --to 2026-10-20T15:37:55Z
node $S phases --repo $DATA/isocan  --from 2026-09-16T15:37:55Z --to 2026-10-03T15:37:55Z
node $S phases --repo $DATA/duo     --from 2026-10-04T00:45:39Z --to 2026-11-01T00:45:39Z
node $S phases --repo $DATA/cajones --from 2026-10-04T00:45:34Z --to 2026-11-01T00:45:34Z
```

How it is counted: for each non-merge commit in the window that touches a file
in `docs/phases/`, the front-matter `status:` before and after. A new file is
not a status change. A move to `built` carries evidence when the same front
matter has a non-empty `evidence:` value.

| Project, window | Status changes | Per week | Moves to `built` | Of those, with an evidence path |
| --- | --- | --- | --- | --- |
| ledger, before | 17 | 7.0 | 8 | **0** |
| ledger, after | 17 | 7.0 | 3 | **0** |
| isocan | not computable: no `docs/phases/` has ever existed | | | |
| duo, 28 days after | 0 | 0 | 0 | none |
| cajones, 28 days after | 0 | 0 | 0 | none |

**Read as pre-registered:** the evidence-backed share **did not rise**. It was
0 of 8 before and 0 of 3 after. ledger keeps evidence pages, but its phase
files did not name them in front matter in either window; doctor reports this
as one of ledger's local variants (measure 4).

duo made no commit to `docs/phases/` in its 28 days. cajones made 9, none of
which changed a status.

## 4. Practice drift across the fleet

**Expected:** falls over time.

**Substituted.** The pre-registration asked for doctor's counts "read on the
same day each week". Nobody read them. The series is rebuilt: for each Sunday
at 12:00 UTC, each project's tree at that moment, read by the doctor that
plates's `main` carried at that moment.

```sh
node $S drift --plates $DATA/plates --project $DATA/ledger --at 2026-10-04T12:00:00Z
# the same for each managed project, for 10-04, 10-11, 10-18, 10-25, 11-01, 11-08 and 11-15
```

The value is doctor's `edited` + `both` + the number of local variants. The
fleet grew from 4 managed projects (plates and the three above) to 17, so the
sum is given beside the three projects the pre-registration named.

| Sunday | Managed projects | Fleet sum | Of it, `edited` + `both` | ledger | duo | cajones | The three |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-04 | 4 | 12 | 0 | 4 | 5 | 3 | **12** |
| 2026-10-11 | 6 | 14 | 0 | 4 | 4 | 2 | **10** |
| 2026-10-18 | 6 | 14 | 0 | 4 | 4 | 2 | **10** |
| 2026-10-25 | 8 | 14 | 0 | 4 | 4 | 2 | **10** |
| 2026-11-01 | 10 | 14 | 0 | 4 | 4 | 2 | **10** |
| 2026-11-08 | 11 | 14 | 0 | 4 | 4 | 2 | **10** |
| 2026-11-15 | 17 | 22 | 8 | 5 | 6 | 4 | **15** |

isocan read 4 from 11 October to 8 November and 7 on 15 November. Plates
itself and the other twelve managed projects read 0 at every reading.

**Read as pre-registered:** drift **did not fall**. The three named projects
went from 12 to 10 in the first week, when duo and cajones each lost one local
variant, stayed at 10 for five weeks, and read 15 on 15 November. The fleet
sum went 12, 14, 22. No local variant converged after the first week: ledger
4, duo 4, cajones 2 and isocan 4 held through all later readings. On
15 November managed files appear as changed for the first time (8 across four
projects).

The twelve projects that read 0 all joined on or after 5 October. Whether they
read 0 because plates kept them aligned, or because they began with nothing of
their own to differ, this measure cannot say.

## 5. Conduct cost per phase

**Expected:** builders' whole-check runs stay at 0, the 2 October baseline
(0 runs across 10 transcripts).

```sh
node $S conduct --transcripts ~/.claude/projects/<project>/<session>/subagents --root <the project's checkout> [--check "<its check command>"]
```

This calls `conductCost`, the function behind `plates improve --transcripts`,
on one session's subagent transcripts. It counts a whole check or whole test
suite only where it ran in `--root`. Leaving `--root` out counts one run in any
directory. Transcripts live on one machine and are not in any repository, so
only that machine's owner can reproduce these.

| Project, sessions | Transcripts | Whole runs at the project root | Transcripts with one | Bash wall minutes |
| --- | --- | --- | --- | --- |
| plates, baseline 2 Oct | 10 | 0 | 0 | not recorded |
| plates, 3 to 22 Oct | 135 | **193** | 46 | 1,256 |
| plates, 2 to 17 Nov | 46 | **0** (44 counting any directory) | 0 (17) | 469 |
| ledger, 3 Oct to 9 Nov | 8 | 0 (2 counting any directory) | 0 (1) | 72 |
| isocan, 25 to 28 Sep, before adoption | 16 | 26 | 16 | 281 |
| isocan, 7 Oct to 16 Nov | 35 | 0 | 0 | 529 |
| duo | only transcripts from before adoption (13, with 25 whole runs) | | | |
| cajones | none on this machine | | | |

**Read as pre-registered:** it **did not stay at 0**. In plates's own October
session, subagents ran the whole check or suite at the project root 193 times
in 46 of 135 transcripts: 169 finished whole-check calls taking 454 minutes
and 24 whole-suite calls taking 15. In November the count at the project root
is 0. But builders now work in separate worktrees, where the measure as shipped
does not look; counting any directory finds 44 whole runs in 17 of 46
transcripts, 47 minutes in all.

**Per committed phase: not computable as written.** A transcript does not name
its phase. *Substitute, marked as one:* divide by the phase files in plates
that moved to `built` over the same dates (46 for 3 to 22 October, 10 for 2 to
17 November; `node $S phases --repo $DATA/plates --from … --to …`). That gives
about 4.2 whole runs and 27 Bash minutes per built phase in October, and 0
whole runs at the root (4.4 counting any directory) and 47 Bash minutes per
built phase in November.

Limits: the directory holds every subagent of a session, reviewers as well as
builders, and the measure cannot tell them apart. "Bash wall minutes" is time
inside Bash calls only, not the whole life of a subagent. The November session
was still running when this was read. isocan's fall from 26 to 0 is a before
and after, but its before is four days and one session.

## 6. Lessons that came home

**Expected:** above zero.

```sh
gh issue list --repo dalmaer/plates --label lesson --state all --limit 1000 --json number | jq length
gh issue list --repo dalmaer/plates-inbox --state all --limit 2000 --json state,labels,createdAt,closedAt \
  | jq '{filed: length, closed: (map(select(.state=="CLOSED"))|length), labels: ([.[].labels[].name]|group_by(.)|map({(.[0]): length})|add)}'
git -C $DATA/plates show v0.8.0:docs/lessons.md | grep -c '^| [0-9]'
```

| Count | Value |
| --- | --- |
| `lesson` issues on plates itself | 0 |
| Lesson issues filed on the private inbox | **176** |
| Decided by a person (a `decided:` label, closed) | **172** |
| Decided as declined | 64 |
| Decided as a link to an existing lesson | 74 |
| Accepted as a lesson | 32 |
| Accepted as a practice change | 2 |
| Open and undecided | 4 |

**Read as pre-registered:** above zero. 176 filed, 172 decided, 34 accepted.

**How many accepted ones shipped in a release: not computable per issue.** The
inbox is private and a lessons row does not carry its issue number.
*Substitute, marked as one:* plates's `docs/lessons.md`, which ships in every
release, had 18 rows before the first issue arrived and 56 in `v0.8.0`, tagged
about six hours after the last acceptance. That is 38 more rows against 34
acceptances. It fits "all accepted lessons shipped" and does not prove it for
any one.

What the dates say: 172 of the 176 issues were filed on 4, 5 and 6 October,
and all 172 decisions were made on those three days. The other 4 were filed on
29 October and were still undecided 19 days later. The loop was used hard for
three days and has been close to idle since.

## Confounds and gaps

- **One project carries the comparison.** Only ledger has a before and after.
  Every "rose" or "fell" above is one project, one 17-day window each side.
- **No clean reference.** isocan was adopted during the after window, and it
  has no lessons or phase files in the shape measures 2 and 3 read.
- **Activity changed.** ledger's gate ran 3.6 times as often before adoption
  as after. Several measures follow
  activity.
- **The same person and the same models worked on everything**, and the models
  and tools changed over these weeks. The pre-registration relied on isocan to
  absorb that, and isocan cannot.
- **duo and cajones show almost nothing on measures 2 and 3.** No lesson row,
  no status move, in four weeks under plates. Their gates stayed green on 53
  and 48 runs. Being after-only, they cannot say whether plates changed
  either fact.
- **Measure 1 reads only the default branch.** In duo, the pull-request
  `Tests` workflow failed on all 38 night-shift branches it ran on in the 28
  days (47 of 47 through 9 November). The default-branch gate never saw them.
  (`gh run list --repo dalmaer/duo -a --limit 1000 --json conclusion,createdAt,workflowName,headBranch`.)
- **Measures 4 and 5 are partly reconstructed or substituted**, as marked.
- **Golden tasks** with and without plates's skills were not run. They are
  still waiting on the owner's yes on the cost, as the phase says.

## What would make the next comparison able to tell

These are observations, not decisions.

- A project adopted later, with weeks of history before it, while another
  comparable project stays unadopted for the whole window.
- Doctor's counts written down each week when they are read, instead of
  rebuilt.
- A conduct-cost measure that sees worktrees and names the phase a transcript
  built.
