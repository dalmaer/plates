---
status: partial
owes: walk
since: 2026-11-03
goal: G7
spec: 2
depends: [156]
note: "Built and proven by test: every item in Needs you carries answers with one writer, the same in plates home and the hosted home; Not now; a decline needs a why; stale claims released with who and why; walks answered on the web write what plates walk done writes. Waits on deploy and migration 017 on the hosted store."
evidence: ["evidence/2026-11-03-every-item-answerable.md"]
---

# Every item waiting on me can be answered where I see it

## Done when

Every item in "Needs you" (phase 156's item model, `lib/work-items.mjs`) carries a list of answers, and each answer has one writer behind it, the same in `plates home` and the hosted workspace. No item's only answer is "go and do this somewhere else".

## Scope

On 2026-11-03 the owner had 27 items waiting: 10 walks (6 with listed choices), 6 health proposals, 4 repos, 2 sessions, 2 phases, 1 step, 1 stale claim and 1 lessons inbox. This phase gives every kind its answers:

| Kind | Answers | Writer |
|---|---|---|
| Walk with choices | its listed choices, plus a note | `plates walk done` (exists; web through phase 98) |
| Walk without choices | Done (with what you saw) / Not yet | `plates walk done --note` (exists) |
| Health proposal | Accept / Decline, why required to decline | `plates walk decide` (exists; web through phase 97) |
| Stale claim | Release / Keep | `plates phase claim --release` on the owner's behalf, recorded with who and why |
| Step (a ⚑ next action on a plate's roadmap) | Done (why required: what you did) / Hand to an agent (why required) | Done: `plates loose-ends mark <id> drop --reason` (its loose end `phase:<n>`, which plates loose-ends lists for a partial phase; home stops listing the step once the mark is on the default branch); Hand: `plates issue new --agent`'s preview, then `--yes` |
| Phase (a ⚑ step in another plate, from loose ends) | Done / Hand to an agent, as a step | `plates loose-ends mark` drop / `plates issue new --agent` |
| Session that ended on a question | Done (why required: what you answered) / Hand to an agent | `plates loose-ends mark` drop / `plates issue new --agent` |
| Repo made but not in plates.json | Not a plate (why required) / Add it to plates.json / Delete it | `plates loose-ends mark` drop / an agent issue to add it / unavailable in both forms: deleting a repo is the owner's own act (`gh repo delete`) |
| Lessons not yet sent home | Send them home / Don't send (why required) | `plates lessons` (`--dry-run`, then `--yes`) / `plates loose-ends mark` drop |
| Review at its round limit, or findings unanswered | Hand to an agent / Merge | `plates issue new --agent` / unavailable: merging from home is phase 176 |
| Health page or inbox from loose ends; decision check; failed production verify | Done (loose ends) / Hand to an agent | `plates loose-ends mark` drop / `plates issue new --agent` |
| Lesson in the inbox | Accept / Decline, why required to decline | `plates learn decide` (exists) |
| Private feedback | Resolve | unavailable from home in both forms: a resolution needs an authored record and its digest (`plates feedback resolve <id> --record <file>`); Not now is the answer home gives |
| Any item | Not now (until a date, with an optional reason) | a per-owner snooze record, never written into the project |

- **The answers belong to the model**, not the view: `lib/work-items.mjs` names each item's answers with id, label, whether a reason is required, and the writer. `plates home --json` and `/api/home` both carry them.
- **Not now** is stored per owner (the hosted store on the web, a file under the plates state directory in the CLI), and a snoozed item leaves "Needs you" until its date, then returns. Snoozed items are counted, never silently gone.
- **Writes keep their existing rules.** An answer that writes to a project goes through the same writer, preview and permission as today (`decisionWrites`, `workspaceWrites`). This phase adds no new kind of write to GitHub except releasing a claim branch.
- **Terminal:** `plates home --answer <item> <answer> [--why "<line>"]` settles one item, so the CLI can do everything the web can.
- Out of scope: the session screen (phase 174), ordering and estimates (phase 175) and merging PRs (phase 176).

## Integration increments

1. The answers in the model, read-only, in `plates home --json` and `/api/home`. Nothing writes yet. Safe: an additive field.
2. Not now: the snooze store on both sides, and the filter in "Needs you".
3. The writers already present (walk done, walk decide) wired to `--answer` and to the web routes they already have.
4. Release a stale claim, and Hand to an agent, each with its test and its failure path.

## Acceptance

- [x] Every item kind waiting on the owner has at least one answer with a writer, and a new kind without one fails a test: `tests/work-items.test.mjs: "every owner item can be answered"`
- [x] `plates home --json` and `/api/home` carry the same answers for the same fixture sources: `tests/home-isomorphism.test.mjs: "answers are one model"`
- [x] Not now hides an item until its date, counts it, and brings it back: `tests/work-items.test.mjs: "not now hides an item until its date and counts it"`
- [x] Declining a health proposal without a reason is refused in both forms: `tests/work-items.test.mjs: "a decline needs a why"`
- [x] Releasing a stale claim records who released it and why, and a claim that is not stale cannot be released this way: `tests/claims.test.mjs: "the owner releases a stale claim from home"`
- [x] `plates home --answer` settles a walk, a proposal and a claim on fixture sources: `tests/cli.test.mjs: "plates home --answer settles one item"`
- [ ] ⚑ by hand: the owner: after the deploy with migration 017 applied, one walk and one health proposal answered from Home on the phone each land as a commit on GitHub matching what plates home --answer writes, and one Not now holds until its date.

## Your part

- **Ask:** On your phone, answer one walk and one proposal from Home, and put one item off with Not now.
- **Why:** This proves answers written from the web land on GitHub the same way the terminal writes them.
- **Look at:** The commit each answer links to.
- **Choices:** Both landed | Something went wrong (say what)
- **Takes:** About 5 minutes.
- **Then:** Both landed: built. Otherwise the writer is fixed here.
- **Ready when:** this phase is deployed with migration 017 applied on the hosted store.

## Real surfaces

- owner's machine: `plates home --answer` on the owner's real plates checkout.
- GitHub API: a claim branch released, and an agent issue filed, through the App on the hosted workspace.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/claims.test.mjs tests/cli.test.mjs`; `npm run check`.
By hand: none in this phase; the owner's walk is phase 174's.

## Deliberately open

- **The answers for repo, session, phase and lessons items.** Each needs a look at what the item really asks; settled while building increment 4, written into the table above.
  Settled 2026-11-03: read from the owner's real home that day (24 ⚑ phase steps, 4 new repos, 2 sessions on a question, 1 lessons row, from `plates home --json` and the board sample), the rows above. Every answer names an existing writer; the web lists the ones it cannot run (walk done, loose-ends marks, lessons, claims, agent issues: no App Issues write) with the reason and the `plates home --answer` command.
- **Where Not now lives in the CLI.** Proposed: the plates state directory, outside every project. Settled with increment 2.
  Settled 2026-11-03: plates kept no per-user state outside projects (only its cache, `$XDG_CACHE_HOME/plates`, which may be cleared), so Not now is `$XDG_STATE_HOME/plates/snoozed.json`, else `~/.local/state/plates/snoozed.json`; on the web, the `plates_home.not_now` store (migration 017), sealed per owner.

## Next action

Deploy with migration 017 applied (the owner's ⚑), then answer one walk and one proposal on the deployed workspace and record the commits here.

## Trajectory

- **2026-11-03** — Guided walks (phase 98) refuse to record a result without authored steps, and no plate has any, so web walk answers needed their own writer. It runs the CLI's walkWritePlan and records only the owner's choice and note. Evidence: tests/web-home-answers.test.mjs "a walk answered on the web writes what plates home --answer writes in the CLI".
- **2026-11-03** — The answers for each kind were read from the owner's real home on 2026-11-03 (36 items, all answerable). Evidence: docs/evidence/2026-11-03-every-item-answerable.md.
