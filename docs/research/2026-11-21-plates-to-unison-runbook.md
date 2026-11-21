# Moving projects from plates to Unison, step by step

This is the order of work for moving every plates project onto Unison, until plates can
be turned off. Each step says who does it, what to ask for, and how to know it's done.
Hand each **Unison** step to the Unison agent. Hand each **plates** step to a plates
agent. **Owner** steps are yours.

The companion spec, [docs/research/2026-11-21-unison-spec-for-plans-with-proof.md](2026-11-21-unison-spec-for-plans-with-proof.md), says exactly what each Unison
milestone (M1 to M6) contains. This runbook says when to ask for each one, and what plates
does in between. The design behind it is plates's
`docs/research/2026-11-21-just-unison.md`; the rehearsal on one project is
`docs/research/2026-11-21-migration-rehearsal.md`.

## Where things stand (2026-11-21)

- **Stage 0 is done for the whole fleet.** Each of the 17 projects has a Unison workspace,
  found by its GitHub repo. Its open phases are Unison items, each linking back to its phase
  file. The workspace id and URL are committed in the project's `.plates/plates.json`.
  isocan and ledger are the two exceptions; their mapping PRs are still waiting.
- **Walks are now optional Try its in plates** (phase 204): a hand check never holds work back.
- **The GitHub repo (`owner/repo`) is the shared key** between plates, Unison and isocan.
- **Plates stays installed until the last step**, so every step before it can be undone.

## The pilot project

**study** goes first. It's small and uses plates's standard practices, and it's already
rehearsed: workspace `ws_736abfe8`, three open phases. Every stage runs on study before
it's repeated on the rest of the fleet.

---

## Step 1 · Unison · Integration plumbing (spec M1)

**Ask the Unison agent:** "Build M1 from the spec. That's find a workspace by repo, a
workspace integration token, `activity --after`, external keys on items (including
setting a key on an existing item), typed links with an icon per kind, and a message
reference on replies."

**Done when:** every M1 "Done when" in the spec holds on unison.cloud.run, and
`unison --version` reports a CLI that has the new commands.

**Plates can start in parallel.** These need nothing from Unison:
- the dry run of the import (phase 205, increment 1);
- the dry run of eject (phase 206, increment 1), both on study.

## Step 2 · Plates · Sync on its own (phase 200, increment 3)

**Ask a plates agent:** "Unison M1 has shipped. Move `plates unison sync` onto it:
- find workspaces by repo;
- run as an integration token named `plates`;
- give each item an external key `phase:<owner/repo>:<n>` and a `plan` link to its phase
  file;
- catch up from `activity --after`.

Before the first keyed sync, backfill a key onto every existing item from the private
map, with `unison backlog key`. Every project already has synced items created without
keys. Then confirm that the first keyed sync keeps every mapped item's id. Only then retire
the private map's duplicate guard. Run it unattended on study, then across the fleet."

**Done when:**
- every item on study that was mapped before has its key, and the first keyed sync left
  each item's id unchanged and created no new item;
- a phase change on main reaches its Unison item without anyone running a command;
- sending the same sync twice still makes one item;
- revoking the token stops the sync.

**Undo:** turn the sync off. The items stay in Unison as they were.

## Step 3 · Unison · Claims and Needs (spec M3)

**Ask the Unison agent:** "Build M3: claim numbers that refuse a stale close, a lease length
per workspace, and Needs, with `backlog claim` skipping items that wait on another."

**Done when:**
- the spec's M3 "Done when" lines hold;
- an item that needs an open one can't be claimed.

## Step 4 · Plates · One claim, in Unison (phase 201)

**Ask a plates agent:** "Unison M3 has shipped. Build phase 201:
- `plates phase claim` takes the Unison claim and keeps its claim number;
- renewing and landing pass `--claim`;
- `depends:` sync to Needs;
- for projects with a workspace, the `claims/phase-N` branches stop.

Run it on study first."

**Done when:**
- two agents asking for the same phase on study get one claim between them;
- a worker whose lease lapsed can't land over the next holder;
- `plates next` and Unison's order agree.

**Undo:** set the project back to branch claims in `.plates/plates.json`.

## Step 5 · Unison · Sections and choices (spec M2)

**Ask the Unison agent:** "Build M2: sections (audience, claimable, default assignee,
notify) and choices with answers. Agents must not close or answer items in a humans
section."

**Done when:** an integration can:
- create a "For you" section;
- add an item with three choices;
- have it answered from the phone;
- hear `item.answered`.

An agent's attempt to close that item gets a 403.

## Step 6 · Plates · Questions, decisions and Try its in Unison (phase 202)

**Ask a plates agent:** "Unison M2 has shipped. Build phase 202:
- `plates ask` posts a question to the phase's item, with a message reference, and the
  answer comes back through `unison wait`;
- the plates sync creates a For you section in each workspace;
- each open decision, approval or setup step becomes a For you card with its choices;
- each ready Try it becomes a light card with Works, Something's off and Skip;
- Home links to those cards instead of listing them itself."

**Done when, on study:**
- an agent's question shows in Unison, and your answer reaches the agent;
- a decision answered in Unison is recorded in the phase file;
- a Try it answered "Something's off" opens a follow-up item.

## Step 7 · Owner · Stage 1 check: drive study from Unison for a week

For one week, run study only from Unison:
- add work;
- order the work;
- answer the For you cards;
- read claims.

Plates still runs the checks, the night shift and the deploys underneath.

**Move on when:** a week passes in which you never had to open plates for study. If you
did, write down why. Each reason is a gap for step 2, 4 or 6 to close before going on.

Then repeat steps 2, 4 and 6 across the fleet. Each one is a config switch per project.

## Step 8 · Unison · Planned items (spec M4)

**Ask the Unison agent:** "Build M4 as a workspace setting, 'Plan work with proof'. It covers:
- Done when, checks (`test:` and `link:`), labels;
- close only with verified proof, and stale proof after an edit;
- Plan this, which gives a For you proposal with Accept, Change it and Split differently;
- Try it on PRs."

**Done when:** the spec's M4 "Done when" holds. Turn the setting on in study's workspace only.

## Step 9 · Plates · Import study's plan (phase 205)

**Ask a plates agent:** "Unison M4 has shipped. Build phase 205, increment 2:
- run `plates unison import --dry-run` on study and show me the plan;
- after my yes, import it and freeze the phase files."

**Owner:** read the dry run. Expect:
- phases 1 and 2 to come across with their checks;
- phase 3 to be flagged, because it has no check left once its walk becomes a Try it.

Add a real check to phase 3 (or let Plan this propose one), then say yes.

**Done when:**
- each open study phase is a planned item with checks and Needs;
- each phase file says `plan: unison` and links to its item;
- a second import changes nothing;
- new study work starts with Plan this in Unison.

**Undo:** unfreeze the phase files (remove `plan: unison`). The phase files are never
deleted.

## Step 10 · Unison · Proof from CI (spec M5)

**Ask the Unison agent:** "Build M5 and publish the proof-report Action, versioned. It
should tick `test:` checks from the merge commit's check runs, matching both file and test
name."

**Done when:** the spec's M5 "Done when" holds.

## Step 11 · Plates · Prove one study item end to end

**Ask a plates agent:**
- "Add the proof-report Action to study's `check.yml`, after the tests.
- Take one study item with a `test:` check through a PR.
- Confirm the check ticks itself on merge and the item closes."

**Done when:**
- one item closed in Unison on CI proof alone, with no evidence file written, even though
  the proof report finished after the merge;
- a run without that test ticked nothing.

## Step 12 · Plates and owner · Turn plates off for study (phase 206)

**Ask a plates agent:** "Build phase 206:
- show me `plates eject --dry-run` on study;
- after my yes, open the eject PR."

**Owner:** in the dry run, check:
- each managed file's fate;
- the rewrites of `check.yml`'s three plates script calls;
- the list of night-shift jobs.

For each night-shift job you want to keep, say so. **Ask the Unison agent** to create it
as a Recurring item in study's workspace.

**Before merging the eject PR, check that:**
- every open phase is a planned item with checks;
- the proof Action has ticked at least one check;
- claims happen in Unison;
- no workflow calls a plates script, and study's own `npm run check` passes in a clean
  clone;
- Recurring holds the jobs you kept.

**Done when:**
- the eject PR is merged and study is out of plates's fleet;
- its Unison workspace carries on alone for a week.

**Undo:** revert the eject PR. Plates installs back over it.

## Step 13 · Everyone · The rest of the fleet, in batches

For each remaining project, run steps 9, 11 and 12. Steps 2, 4 and 6 are already on.

Go in batches of three or four:
- first, projects with standard practices;
- then those with their own phase layouts (local variants, the projects shape), which the
  sync already reads.

After each batch, the owner confirms that nothing needed plates for a week.

## Step 14 · Unison, then plates · plates itself goes last (spec M6)

**Ask the Unison agent:** "Build M6's export to git, so a workspace can keep its plan in
`docs/plans/` by PR."

**Ask a plates agent:**
- "Import plates's own phases with export on.
- Prove one item through CI.
- Eject plates's practices from its own repo, keeping its own CI gate, review and deploy as
  owned workflows."

**Done when:**
- plates is driven from Unison like every other project;
- its plan stays readable in git through Unison's export.

---

## At a glance

| # | Who | What | Waits on |
| --- | --- | --- | --- |
| 1 | Unison | M1 plumbing | — |
| 2 | plates | Sync on its own (200.3) | 1 |
| 3 | Unison | M3 claims and Needs | — |
| 4 | plates | One claim in Unison (201) | 2, 3 |
| 5 | Unison | M2 sections and choices | — |
| 6 | plates | Questions, decisions and Try its in Unison (202) | 2, 5 |
| 7 | Owner | A week driving study from Unison | 4, 6 |
| 8 | Unison | M4 planned items | — |
| 9 | plates + owner | Import study's plan (205) | 7, 8 |
| 10 | Unison | M5 proof Action | — |
| 11 | plates | One item proven by CI | 9, 10 |
| 12 | plates + owner + Unison | Eject study (206), Recurring | 11 |
| 13 | all | The fleet, in batches | 12 |
| 14 | Unison, then plates | Export, then plates itself | 13 |

Unison's milestones (steps 1, 3, 5, 8 and 10) don't depend on each other's order much. The
Unison agent can build them back to back, while plates follows one step behind each one.

## Rules on both sides

- **Nothing in Unison is named for plates.** Use sections, choices, planned items, checks
  and Needs, never phases or walks.
- **Proof stays in GitHub.** Unison reads it and never holds the only copy.
- **Every step runs on study before the fleet.** Every step before eject can be undone.
- **Money, logins and production deploys still wait for the owner.** No agent on either
  side does them unasked.
