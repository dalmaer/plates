# Unison: what to build so a project can be run entirely from Unison

This is everything Unison needs so a project can be planned, built, proven and talked
about entirely in Unison. Plates (a tool that runs project phases, reviews and deploys)
is the first integration that will use it, but nothing here is specific to plates.

## Principles

1. **Optional and off by default.** A workspace that never turns any of this on looks
   exactly like Unison today. Every feature below is either always-on plumbing with no
   visible change, or appears only once a workspace turns it on.
2. **Generic, not plates-shaped.** Use general names: sections, choices, planned items,
   checks, Needs. Never phases, walks or goals.
3. **The GitHub repo is the shared key.** A project's `owner/repo` joins Unison, plates and
   isocan. Unison should be able to find a workspace by its repo.
4. **Proof stays in GitHub.** Unison reads proof (merged PRs, CI runs, test results). It
   never becomes the only copy of it.
5. **Same operation, same granularity.** As today, every feature is in the web UI, the CLI
   and the HTTP API alike, and each emits an activity event.

## Build order

| Milestone | What it unlocks |
| --- | --- |
| **M1. Integration plumbing** | An outside tool can find, watch and safely write to a workspace |
| **M2. Sections and choices** | Work only a person can do lives outside the Backlog, answered with buttons |
| **M3. Claims and dependencies** | One trustworthy claim per item; items wait for what they need |
| **M4. Planned items** | "Plan this": Done when, Checks, close only with proof, Try it |
| **M5. Proof from CI** | Checks tick themselves from real test runs |
| **M6. Later** | Export to git, a Home view across workspaces, status cards, templates |

Each milestone is useful on its own. M1 and M2 matter most.

---

## M1. Integration plumbing

### 1.1 Find a workspace by repo
- `unison workspace find --repo <owner/repo>`, and `GET /api/workspaces?repo=<owner/repo>`.
  These return the workspaces the caller can see whose repos include that repo.
- Compare repos after normalizing: http or https, case, `www.`, a trailing `.git` or `/`.
- Optional: refuse to add a repo that another of the caller's workspaces already lists, or
  warn about it.
- `workspace create --json` returns a stable `id` and `url`, which never change.

**Done when:** a workspace that lists `http://github.com/Acme/Tools` is found by `acme/tools`.

### 1.2 A workspace integration token
- A token that belongs to one workspace, not to a person. It doesn't lapse when idle, can
  be revoked, and appears in the roster as the integration's name (for example "plates").
- Created by a member: `unison integration add <name>`, which shows the token once.
- It can do everything an agent can, and can also mint agent passes for the workers it
  starts.

**Done when:** a sync can run for a week unattended without its token lapsing, and
revoking the token stops it at once.

### 1.3 Change events
- `unison activity --after <seq>` (only `--before` exists today), so a tool can catch up
  from where it last looked.
- And/or outbound webhooks: Unison POSTs a signed event to a URL for chosen event types.
- New event types are listed in each milestone below.

**Done when:** a tool that was offline for an hour catches up on every change in order,
with nothing missed.

### 1.4 External keys on items
- `external_key` on an item: a string that is unique per workspace and set by the tool
  that created the item. A second create with the same key is refused with 409.
- `unison backlog add --key <k>`, and lookup with `backlog show --key <k>`.
- **Keys on existing items.** `unison backlog key <id> <k>` sets the key on an item created
  before keys existed. It's refused with 409 if another item holds that key, and it never
  changes the item's id. An integration uses it to backfill keys from its own records
  before it starts creating by key.

**Done when:**
- sending the same create twice, with the same key, makes one item;
- an item created without a key, then given one, is found by `backlog show --key` and
  keeps its id.

### 1.5 Typed links on items
- `links: [{kind, url}]`, where kind is `issue`, `pr`, `plan`, `doc`, or any short string.
  Existing PR links fit as kind `pr`.
- Each kind gets its own small icon on the card, which opens the link.
- `unison backlog link <id> <kind> <url>` and `--remove`; a `link.added` / `link.removed` event.

**Done when:** an item shows a GitHub-issue icon linking to its issue.

### 1.6 Stable deep links
- Item and thread URLs that never change (today `/w/<ws>?item=<id>` works for items).
- A message reference an integration can set (`--ref <id>`), returned on replies, so a
  reply can be matched to the question it answers.

---

## M2. Sections and choices

### 2.1 Sections
A section is a named list beside the Backlog, like Ideas and Recurring. A workspace has
none of these until someone, or an integration, creates one.

| Field | Meaning |
| --- | --- |
| `name`, `emoji`, `position` | How it shows in the sidebar |
| `audience` | `everyone` (like the Backlog), `humans` or `agents` |
| `claimable` | Whether `backlog claim` may pick items from it |
| `default_assignee` | Who new items go to (for example the owner) |
| `notify` | Whether new items assigned to a person go to their Actions list and phone |

- Items gain `section_id` (empty means the Backlog), and can move between sections.
- **Agents can't start, close or answer items in a `humans` section.** They get a clear 403.
- `backlog claim` skips sections that aren't claimable.
- CLI: `unison section list | add <name> --audience humans --assignee <name> [--notify] | edit | remove`,
  plus `backlog add --section <id>` and `backlog --section <id>`.
- Events: `section.added|edited|removed`, `item.moved`.

**Done when:** an integration creates a "For you" section (humans, not claimable,
notify), adds an item to it, and an agent trying to close that item is refused.

### 2.2 Choices and answers
- `choices: [{id, label, recommended?}]` on any item. The card shows them as buttons, with
  the recommended one marked.
- Tapping one records `answer: {choice, by, at, note?}`. An item can be set to close on
  answer.
- `unison item answer <id> <choice> [--note …]`; an `item.answered` event.
- Only people can answer an item in a `humans` section.

**Done when:** "Accept / Change it / Split differently" on an item can be answered from
the phone, and the integration hears `item.answered` with the choice.

---

## M3. Claims and dependencies

### 3.1 Claims with a claim number
- `backlog start` and `backlog claim` return a `claim` number that rises every time
  someone new takes the item.
- `backlog close`, `backlog start` (to renew) and `backlog pr` accept `--claim <n>`, and are
  refused if the number has moved on. A worker whose lease lapsed then can't land work over
  the next holder.
- Lease length can be set per workspace (12 hours stays the default).

**Done when:** worker A's lease lapses, worker B claims the item, and A's close is refused.

### 3.2 Needs (dependencies)
- `needs: [item ids]`. The item stays in its place in the list, dimmed, until those are done.
- `backlog claim` skips items whose needs aren't done.
- `hidden_until` / `ready_at` (optional): an item stays out of view until it's ready.

**Done when:** an item that needs another can't be claimed until that one closes.

---

## M4. Planned items (an optional workspace mode)

Turned on per workspace: **Settings → "Plan work with proof"**. Even then, it applies
only to items someone chooses to plan. Plain items stay plain.

### 4.1 Planned-item fields
- **Done when:** one paragraph saying what will be true.
- **Checks:** a list. Each check is a sentence, plus what proves it:
  - `test: <repo-relative file> › <test name>`, proven by a CI run (M5);
  - `link: <url>`, proven by a person accepting it (for example a recording, a dashboard,
    or an owner's recorded answer to a decision).
- **Needs** (3.2) and **labels** (free tags with a filter, such as goals).
- They show as real fields on the card, not as markdown in the body.

### 4.2 Close only with proof
- A planned item closes when every check has **verified** proof:
  - a test seen passing in the proof report (M5); or
  - a link a person accepted.
- A link an agent added stays on the item as evidence, but never closes it.
- Closing with any check unverified needs a person's explicit **"close without proof"**,
  and the item shows it.
- **Proof goes stale:** each proof records the version of the Done when and of its check it
  proved. Editing either one marks that proof stale, and the check needs fresh proof.

### 4.3 Plan this
- A "Plan this" action on any item posts a plan request. Any agent can pick it up, with
  instructions served in the agent guide when the mode is on.
- The agent proposes the Done when, the checks, and, for big items, a split into two or
  three planned items with Needs.
- The proposal arrives as a For you item with the choices Accept, Change it and Split
  differently.
  - Accepting writes the fields, or creates the split items.
  - Change it: the person replies in the thread, and the agent revises.
- Events: `plan.requested`, `plan.proposed`, `plan.accepted`.

### 4.4 Try it (optional hand testing, never a gate)
- When an agent's PR for an item is ready, it attaches a **Try it**:
  - what changed, in one line;
  - where to try it (a preview URL, the site, or a build);
  - three to five steps;
  - what working looks like, and what broken looks like.
- The agent tries the steps itself first where it can, and attaches screenshots or a
  recording.
- It shows on the item and as a light, dismissable entry in For you, grouped. It never
  blocks closing, and it expires when a newer change to the same item lands.
- Answers:
  - **Works** is recorded on the item;
  - **Something's off** opens a linked follow-up item with the note;
  - **Skip**, or doing nothing, is fine.

**Done when (M4):** a person presses Plan this on "Add dark mode", accepts the proposal
from the phone, an agent builds it, and the item can't close until each check is
verified or a person closes it without proof. The Try it appears and is optional.

---

## M5. Proof from CI

- **A proof-report GitHub Action** (published by Unison, versioned) runs after the tests.
  It publishes each passing test as `{file (repo-relative), name}` in the check run's
  output.
- When a PR linked to a planned item merges, Unison reads the check runs on the merge
  commit (it already reads open PRs for its reviews page) and ticks each `test:` check
  whose file **and** name both appear as passing. The tick links to the run.
- **The report often finishes after the merge.** Unison reconciles again when the merge
  commit's proof-report run completes, through a `check_run` completed event or by
  retrying while that run is queued or in progress. It gives up only once the run has
  finished. Until then the item shows "proof pending", never "unproven".
- Without the Action, an agent can link a run as evidence. The check then shows as
  vouched for, not verified.

**Done when:**
- a merged PR whose CI ran `tests/theme.test.ts › dark mode toggles` ticks that check
  automatically, including when Unison learns of the merge before the report has
  finished;
- a run without that test ticks nothing.

---

## M6. Later and optional

- **Export to git:** for workspaces that want their plans in the repo, Unison writes each
  planned item to `docs/plans/<n>-<slug>.md` by PR when it's accepted and when it changes.
  It's one way, and off by default.
- **A Home view across workspaces:** what's moving in each workspace and what's waiting on
  me, built on the per-workspace `activity_seq` that already exists.
- **Status cards:** deploys, CI on main and health, posted by GitHub Actions through an
  integration token, shown on the workspace.
- **Templates:** a workspace template that installs files into the repo by PR (for example
  the proof Action), creates its sections and recurring tasks, and later opens update PRs.

---

## How plates will use each piece

| Unison feature | Plates' use |
| --- | --- |
| Find by repo, stable ids | `plates unison connect` finds or creates each project's workspace |
| Integration token, change events | Plates' sync and worker run unattended and react to changes |
| External keys, typed links | One item per phase, with a link back to it, and never a duplicate |
| Sections, choices | A "For you" section for decisions, approvals, setup steps and Try its |
| Claims with a number, Needs | A claim in Unison is plates' phase claim; Unison's order drives what's next |
| Planned items, Plan this | Plates' phases are imported as planned items; new work is planned in Unison |
| Proof from CI | Replaces plates' evidence files |
| Export | Plates' own repo keeps its plan in git |

## Out of scope

- Anything named for plates in Unison's UI or data model.
- Unison running agents, or deciding whether code is correct. It records claims, checks
  and proof; agents and CI do the work.
- Gating merges. Branch protection and the repo's CI keep doing that.
