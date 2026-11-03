---
status: planned
since: 2026-11-03
goal: G7
spec: 2
depends: [156]
note: "Owner, 2026-11-03: 'I want this to be a dashboard that shows me what to do… launch into a review session… big buttons at the bottom… accept? Add why.' Of the 27 items waiting on the owner that day, only the 6 walks with listed choices could be answered in one step."
evidence: []
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
| Step, phase, session, repo, lessons | per kind, decided while building; at least Done, and Hand to an agent | Hand to an agent files an agent issue through `plates issue new --agent` and its existing preview |
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

- [ ] Every item kind waiting on the owner has at least one answer with a writer, and a new kind without one fails a test: `tests/work-items.test.mjs: "every owner item can be answered"`
- [ ] `plates home --json` and `/api/home` carry the same answers for the same fixture sources: `tests/home-isomorphism.test.mjs: "answers are one model"`
- [ ] Not now hides an item until its date, counts it, and brings it back: `tests/work-items.test.mjs: "not now hides an item until its date and counts it"`
- [ ] Declining a health proposal without a reason is refused in both forms: `tests/work-items.test.mjs: "a decline needs a why"`
- [ ] Releasing a stale claim records who released it and why, and a claim that is not stale cannot be released this way: `tests/claims.test.mjs: "the owner releases a stale claim from home"`
- [ ] `plates home --answer` settles a walk, a proposal and a claim on fixture sources: `tests/cli.test.mjs: "plates home --answer settles one item"`

## Real surfaces

- owner's machine: `plates home --answer` on the owner's real plates checkout.
- GitHub API: a claim branch released, and an agent issue filed, through the App on the hosted workspace.

## Proof

Automated: `node --test tests/work-items.test.mjs tests/home-isomorphism.test.mjs tests/claims.test.mjs tests/cli.test.mjs`; `npm run check`.
By hand: none in this phase; the owner's walk is phase 174's.

## Deliberately open

- **The answers for repo, session, phase and lessons items.** Each needs a look at what the item really asks; settled while building increment 4, written into the table above.
- **Where Not now lives in the CLI.** Proposed: the plates state directory, outside every project. Settled with increment 2.

## Next action

After phase 156's first increment (the model in `lib/work-items.mjs`) lands: add the answers to the model, increment 1.
