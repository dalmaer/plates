# The backlog: every plate's work in one view, and agents that join it

Authorized for implementation, 5 November 2026. Phases 178–184 implement it.
Baseline: plates
`df0415bd9bc2fce095084d1c252a4ae43a053fde` (CLI 0.8.38). This document specifies
intended behavior; phase evidence will record what is implemented. Examples are
synthetic unless marked *measured*.

## Outcome

The owner opens **Backlog** and sees all work across their plates in one place:
- what waits on them;
- what an agent could pick up now;
- what an agent is doing;
- what is waiting on something else.

Each item says why it sits where it does. From any item, the owner can answer
it, or attach an agent to it through a route the plate already allows. The
agent's progress then shows up on the same card, read from the same records the
CLI reads.

Agents are not just builders. An agent may also:
- draft a recommendation for a decision;
- prepare a walk so the owner's part takes less time;
- shape a planned phase until it is ready to build;
- answer review findings.

Judgment stays with a person: decisions, acceptance and lived-in.

## Why now (measured on plates itself, 5 November 2026)

| Fact | Value | Source |
| --- | --- | --- |
| Phases free to build | 10 | `plates next --json` → `free` |
| Phases claimed by a session | 7 (all `provider: claude`) | `next.claimed[].holder` |
| Partial phases that owe only a walk | 75 of 94 partial | `owes: walk` front matter |
| Items on Home's "Needs you" on 2026-11-04 | 35, fix tier empty | phase 166 evidence |

**The bottleneck is the owner's turn, not agent capacity.** A backlog that only
adds agents makes the queue longer. This one has two jobs:
- make the owner's lane fast: grouped, previewed, one at a time, with prep done
  ahead;
- give agents work that does not need the owner.

## What already exists (reuse, do not replace)

- **Phase records:** `docs/phases/*.md`. Front matter carries `status`, `goal`,
  `depends`, `after`, `owes`, `spec`, `note`. The body carries *Done when*,
  *Acceptance*, *Your part* and *Next action*. `plates next --json` already
  parses them (`practices/phases/files/scripts/roadmap.mjs`: `nextPhase`,
  `owesWalk`, `satisfies`).
- **Claims:** `claims/phase-<n>`, a create-only push with
  `{provider, machine, at, pr, work[]}`. `STALE_DAYS = 7` (`lib/claim.mjs`).
  This is already how an agent joins a phase.
- **One read model** (`lib/work-items.mjs`):
  - `homeSnapshot`, `homeFour`, `docketOf`;
  - `DOCKET_GROUPS` (unblock, decide, walk);
  - `itemKey` (`plate:kind:ref`), `answersFor`, `WRITERS`, `DEFAULT_MINUTES`.
  - Phase 156 made this one model with two renderers;
    `tests/home-isomorphism.test.mjs` holds the CLI and web to the same items.
- **Write paths:**
  - **Decisions** (phase 97): digest-bound preview, then
    `createCommitOnBranch` with `expectedHeadOid`, plus a receipt. Off until
    `decisionWrites`.
  - **Walks** (98): private drafts; works / does not work / cannot test yet;
    repair previews.
  - **Review session** (174): `/review`, one card at a time, keys 1–4/W/N,
    Undo.
  - **Merge from docket** (176, planned).
- **Agent routes:**
  - `/spin` and the conduct skill;
  - `plates goodnight` and the night plan (phase 76: the night builds only
    what the plan names);
  - the robot (`plates issue new --agent`, rubric, `robot.on` +
    `budgetMinutes`);
  - durable workers (phase 104, disabled until activated);
  - `plates decision context --phase` (phase 90);
  - `plates ready` and `plates integrate`;
  - autonomy Low/Medium/High (`plates autonomy`).

The gap is not the records. It is:
- one view that puts phases and owner items in the same lanes;
- one way to attach an agent that ends in a claim and a receipt;
- a defined set of things an agent may do on an item that is not a build.

## Patterns borrowed from ranked attention-card interfaces

Ranked "attention card" interfaces answer the same question: what needs me, why,
and what next. These patterns are described from their design only; no outside
code is a source for this repository.

| Pattern | Backlog use |
| --- | --- |
| Company chips with live counts | Plate chips: *yours · agent-ready · in flight*. Counts say "at least" when coverage is partial |
| Intent grouping (cards grouped by goal, polarity colour) | Group by goal (`docs/goals.json`), one header per goal with lane counts |
| Combined cards (deterministic grouping rules, each item in exactly one card) | One card per phase or PR. Its walk, review findings and decisions nest under it (the spec's dedupe rule, web-ui.md §Ranking) |
| "Why this is prioritized" strip | Why-keys on every card (see Ordering) |
| Recommended-action box | The phase's *Next action*, or the item's `details.then` |
| One at a time with a peek stack and "all caught up" | The owner lane as a session: the next card's header visible, total *Takes* shown up front |
| Dismiss with reason chips and undo | Not now with a reason (existing `not_now`, plus a reason field) |
| Append-only feedback events | `backlog_events`, metadata only (see Events) |
| Debug drawer | "Ordering trace": the rule that placed the item, its dependencies, claim branch, PR, gate |

Plates's no-score rule still holds: those interfaces often rank by a learned
number; the backlog orders by visible rules only.

## The model

### Backlog item

A backlog item is any record that already has an `itemKey`, plus phases that
are not yet built. Phases get the key `plate:phase:<id>`. Owner items keep
their existing kinds: `decision`, `walk`, `review`, `proposal`, `repair`,
`lesson`, `claim`, `step`, `verify`, `rollback`. **No new identity scheme and
no stored status.**

```text
BacklogItem {
  key, projectId, projectName, kind, ref, title,
  goal,                 // phase goal, or the goal of the phase the item belongs to
  lane,                 // derived (below)
  why: [WhyKey],        // ordered reasons it is here
  next,                 // the phase's Next action or the item's details.then
  takes,                // minutes from Takes / DEFAULT_MINUTES; null when unknown
  unblocks: [phaseId],  // phases whose depends: include this one
  holder?,              // claim holder, unchanged from plates next
  presence?,            // see Agent presence
  assists: [Assist],    // what an agent may do here (below)
  answers: [Answer],    // unchanged answersFor() for owner items
  children: [key],      // nested walk / review / decision under a phase card
  source: { file|url, revision, readAt, state }
}
```

### Lanes (derived on every read)

| Lane | Contains | Derived from |
| --- | --- | --- |
| **Yours** | Decisions, walks that are ready, reviews at their round limit, unresolved ⚑ steps, stale claims, proposals | Existing docket items, in `DOCKET_GROUPS` order |
| **Agent-ready** | Phases free to build with no unresolved ⚑ before the build, and `spec: 2`; agent assists on owner items | `free[]`, phase body, assists below |
| **In flight** | Claimed phases; dispatched assists | `claimed[]`, receipts |
| **Waiting** | `depends` unmet, `after:` in the future, walks with **Ready when** unmet, phases that need shaping | roadmap.mjs |
| **Recently done** | Built, accepted or merged in the "since" window | `homeFour` `since` section |

A phase holding a walk shows under **Yours** with the walk as its child. It does
not also appear under **Agent-ready**.

### Ordering: no score

Lanes appear in the order above. Within a lane:

1. **Urgent first:** a failed rollback or an unresolved write, as in the docket
   today.
2. **Unblocks:** how many phases or agents wait on this item. Owner items that
   stop an agent come first (the existing `unblock` group).
3. **Goal:** the order in `docs/goals.json`, or the owner's pinned order (a
   display preference).
4. **Takes:** in Yours, quick items (2 minutes or less) are grouped first only
   when the owner chooses "quick first".
5. **Age:** `since`, oldest first, then `key` as a stable tie-break.

Every card shows its **why-keys** as short phrases, for example "Unblocks 3
phases", "G7 · pinned", "Waiting 9 days", "~2 min". A reader can always
reconstruct the order. Optional summaries must not change it.

## Views

One model, three arrangements. Each is a density or arrangement, not a separate
application:

- **Lanes:** columns on desktop, stacked sections at 360px.
- **By goal:** goal headers with counts per lane, collapsed after 7 items.
- **One at a time:** the owner lane as a session. It extends `/review` (phase
  174) with:
  - the peek stack;
  - a running "N left · ~M min";
  - the existing answer keys.

The plate chip strip sits above all three and filters. Filtering never hides a
source outage: a plate that could not be read shows "not read", never zero.

**Card anatomy, reusing `design.mjs` tokens:**
- a header strip: plate, kind, goal, lane;
- the title;
- why-keys;
- a compact fact row: acceptance ticked/total · tests named · evidence ·
  holder/presence · PR/gate;
- the next action;
- a primary contextual action: *Answer*, *Open walk*, *Attach agent*, *Open PR*;
- an expandable ordering trace.

## Agents join

### Routes

An agent route is a provider plus a way to start. Every route that builds
**starts by creating the claim**: two agents cannot build one phase.

| Route | Start | Exists today | Default |
| --- | --- | --- | --- |
| `session` | Claim with `--provider <p>`, then hand the owner the `/spin <n>` brief to open in Claude Code or Codex | claim + spin | Available |
| `local-host` | Claim with the host's provider name, then hand the spin brief and `decision context` to a local agent host the owner configured privately (a command on the owner's machine that starts an agent session in the plate's checkout) | new adapter | Off until configured |
| `tonight` | Add the item to tonight's plan; the night claims and builds it | goodnight, phase 76 | Night budget |
| `robot` | File an agent issue. Rubric generated from the phase: problem ← *Done when*, acceptance ← *Acceptance*, change ← *Next action*, ownerBlockers ← unresolved ⚑ | `issue new --agent` | Robot OFF |
| `worker` | Dispatch a registered workflow | phase 104 | Disabled |

The attach contract is the same for every route:

1. **Preview.** The exact effect: claim ref, provider, route, brief bytes,
   budget charged. It has a digest. The CLI exits 3 until `--yes`; the web uses
   the existing digest-bound apply.
2. **Claim.** Create-only push. Read back the ref to learn who won. If another
   holder won, show "taken by <holder>". Never retry onto it.
3. **Dispatch.** Start the route. Journal the intent before any outward call,
   following the `robot-issue` pattern.
4. **Receipt.** Record the route, the start time and the claim. An uncertain
   dispatch is recovered, never repeated.
5. **Release.** Releasing the claim ends the route's claim on the item; a stale
   claim returns to the owner as today.

### Assists: what an agent may do on an item that is not a build

| Item kind | Agent may (assist) | Only a person may |
| --- | --- | --- |
| `decision` | Draft a recommendation with linked evidence and the consequence of each choice. It appears as *recommended* in `answers`, attributed to the agent | Choose |
| `walk` | **Walk prep:** bring the real environment up, check the build is the tested revision, capture screenshots and pre-fill steps an agent can check, so the owner only judges | Say works / does not work |
| `phase` (planned or designed) | **Shape:** draft a `spec: 2` body (acceptance with named tests, real surfaces), written through the shaping practice's digest-bound draft | Approve the spec |
| `review` | Answer findings: fix, or reply "not valid" with evidence, through `plates review --close` | Merge; choose at the round limit |
| `repair` (a walk said it does not work) | Build the repair on the original phase's claim | Re-walk |
| `proposal` / `lesson` | Draft the change or the distilled lesson | `learn decide`, `walk decide` |

Assists use the same attach contract. An assist that writes to source goes
through an existing digest-bound path. It never writes directly.

### Agent presence

A claim is not proof that an agent is running (web-ui.md:119). A card shows
**claimed** unless an execution source says more:

| Presence | Source |
| --- | --- |
| claimed | claim branch exists |
| active · last push 14 min | pushes on the claim or work branch |
| running | a route receipt with live state: local agent host session state, night journal, worker run |
| ready / integrating / blocked | `plates ready` / `integrate` records |
| stale | no push for `STALE_DAYS`, which becomes the owner's claim item as today |

Each presence value carries its source and its read time.

### Policy

Routes and assists are switched on per plate in `.plates/plates.json`:

```json
"agents": {
  "routes": ["session", "tonight"],
  "assists": ["walk-prep", "decision-draft", "shape"],
  "providers": ["claude", "codex", "local-host"]
}
```

- The policy is nonsecret and absent by default.
- Absent means **session only**, so today's behavior is unchanged.
- It sits under `plates autonomy`: Low requires a preview for every attach;
  Medium and High may skip the confirm for routes already listed. The platform
  and command approval gates still apply.
- Budgets come from the route's existing allowance (night, robot, worker). The
  backlog never infers or enlarges a budget.

## Events

`backlog_events` is append-only and metadata only. **It holds no source text and
no owner words.** Each record:
- `at`, `actor` (owner or agent provider), `key`, `action`;
- `action` is one of: view, attach, assist, dispatch, release, answer,
  not-now(reason);
- `route`, `lane`, display position, `takes`, outcome, receipt link.

**Storage:**
- **Local:** `.plates/backlog-events/`, with the private file modes used by
  `feedback-store`.
- **Hosted:** migration 019 under row-level security.

**Uses:**
- the owner's own readout: "routes that landed phases", "walk minutes per week";
- G5 evidence.

It never changes ordering without a visible, owner-chosen rule.

## CLI parity

- `plates backlog [--lane <l>] [--goal <g>] [--project <id>] [--json]` prints
  the same items as the web. The isomorphism test extends to it.
- `plates backlog attach <key> --route <r> [--provider <p>] [--yes]`.
- `plates backlog assist <key> <assist> [--yes]`.

Each new verb counts against `.plates/surface.json`. If the budget cannot take a
new verb, use `plates home --backlog` and `plates home --attach` instead (see
Deliberately open).

## Phases (goal G7)

Numbers assume 177 is the latest phase. Each phase is independently mergeable
and read-only until its write increment.

| Phase | Outcome | Depends |
| --- | --- | --- |
| 178 | The backlog shows every plate's work in lanes, with reasons | 166 |
| 179 | The backlog groups by goal and shows one card per phase | 178 |
| 180 | My lane is a session I can finish | 178, 174 |
| 181 | I can attach an agent to a phase, and see it working | 178 |
| 182 | Agents prepare my walks and draft my decisions | 181, 98, 97 |
| 183 | A local agent host can take a phase | 181 |
| 184 | The backlog remembers what happened to each item | 181 |

### 178. The backlog shows every plate's work in lanes, with reasons

- **Done when:** `plates backlog --json` and `/backlog` list the same items in
  the five lanes, each with why-keys, for every authorized plate.
- **Scope:**
  - `backlogOf(snapshot, phases, claims)` in `lib/work-items.mjs`;
  - a Lanes view in `views.mjs`;
  - plate chips;
  - coverage states.
  - No writes. Attach is shown unavailable with its reason.
- **Acceptance:**
  - [ ] A phase owing a walk appears under Yours with the walk as its child,
    and not under Agent-ready: `tests/work-items.test.mjs: "a phase owing a walk is yours, not an agent's"`.
  - [ ] Ordering follows the why-keys, with a stable tie-break:
    `tests/work-items.test.mjs: "backlog order is reproducible from its why-keys"`.
  - [ ] A plate that could not be read shows "not read", never zero:
    `tests/home-isomorphism.test.mjs: "an unread plate is not an empty lane"`.
  - [ ] CLI and web show the same items: `tests/home-isomorphism.test.mjs: "backlog matches in both forms"`.
  - [ ] `npm run look` captures Lanes light and dark at 390 and 1280 px.
- **Your part:**
  - **Ask:** Open Backlog on your phone and laptop, and find the one thing you
    would do first.
  - **Why:** This settles whether the lanes and reasons match how you choose.
  - **Choices:** Found it, the reason was right | Found it, the reason was
    wrong (say why) | Couldn't tell
  - **Takes:** About 5 minutes.
- **Real surfaces:** hosted Home on Vercel with the GitHub App, read-only.

### 179. The backlog groups by goal and shows one card per phase

- **Done when:** By goal shows a header per goal with lane counts, and each
  phase's walk, decisions and review findings nest under its card.
- **Scope:**
  - deterministic grouping rules as a pure, golden-tested module (the
    combined-card pattern);
  - each item joins exactly one card;
  - dedupe uses project + phase + acceptance item.
- **Acceptance:**
  - [ ] Every item appears in exactly one card: `tests/backlog-grouping.test.mjs: "each item has one home"`.
  - [ ] Similar items in different plates are not merged:
    `tests/backlog-grouping.test.mjs: "plates never merge across projects"`.

### 180. My lane is a session I can finish

- **Done when:** Starting from Yours opens `/review` with a peek stack, "N left
  · ~M min", Not now with a reason, and "all caught up" at the end.
- **Scope:** extend phase 174's review client. Add a reason to `not_now`
  (migration, max length, metadata only).
- **Acceptance:**
  - [ ] The running total uses Takes and `DEFAULT_MINUTES`, and says "at least"
    when one is unknown: `tests/web-review.test.mjs: "session time is honest"`.
  - [ ] Not now with a reason survives reload in both stores:
    `tests/not-now.test.mjs: "a reason is kept"`.
- **Your part:**
  - **Ask:** Clear five items from your lane in one sitting.
  - **Choices:** Faster than before | Same | Slower (say where)
  - **Takes:** About 15 minutes.

### 181. I can attach an agent to a phase, and see it working

- **Done when:**
  - *Attach* on an agent-ready phase previews, claims and starts the `session`
    or `tonight` route, with a receipt;
  - the card shows presence from its sources;
  - a lost claim race says who won.
- **Scope:**
  - the attach contract;
  - routes `session` and `tonight`;
  - the `agents` policy with a session-only default;
  - presence;
  - CLI `backlog attach`.
  - Robot after this, through the generated rubric, as an increment gated by
    `robot.on`.
- **Acceptance:**
  - [ ] Two attaches to one phase: one claim wins, the other shows the holder
    and does not dispatch: `tests/backlog-attach.test.mjs: "a lost race never dispatches"`.
  - [ ] An uncertain dispatch is recovered from its journal, not repeated:
    `tests/backlog-attach.test.mjs: "dispatch recovers, never repeats"`.
  - [ ] Without a policy, only `session` is offered:
    `tests/backlog-attach.test.mjs: "absent policy is session only"`.
  - [ ] Presence says "claimed" unless an execution source says running:
    `tests/work-items.test.mjs: "a claim is not a running agent"`.
- **Your part:**
  - **Ask:** Attach an agent to one ready phase from your phone, then watch its
    card move.
  - **Choices:** It moved and I trusted it | It moved but unclear | Didn't
    trust it
  - **Takes:** About 10 minutes, plus the agent's time.
- **Real surfaces:** a real claim on a fleet repo; one real night that builds
  the attached phase.

### 182. Agents prepare my walks and draft my decisions

- **Done when:**
  - **Walk prep** produces a checked environment, the tested revision and
    screenshots on the walk card before the owner opens it;
  - **decision draft** adds an attributed recommendation with evidence;
  - neither records an answer.
- **Scope:** assists `walk-prep`, `decision-draft` and `shape`, through existing
  digest-bound paths.
- **Acceptance:**
  - [ ] An assist never writes an answer, acceptance or lived-in:
    `tests/backlog-assist.test.mjs: "assists never decide"`.
  - [ ] A recommendation links its evidence, and is dropped when its source
    revision moves: `tests/backlog-assist.test.mjs: "a stale recommendation is withdrawn"`.
- **Your part:**
  - **Ask:** Do three prepared walks.
  - **Choices:** Prep saved time | No difference | Prep was wrong (say how)
  - **Takes:** About 20 minutes.

### 183. A local agent host can take a phase

- **Done when:** the `local-host` route claims with the host's provider name and
  hands the spin brief and `decision context` to the local agent host the owner
  configured. The host's session state appears as presence when it reports one.
- **Scope:**
  - an adapter behind the route interface, with a small, documented host
    contract: Plates runs a configured command with the checkout path and the
    brief on stdin; the command returns a session id, and optionally answers a
    state query (`starting`, `running`, `waiting`, `finished`, `failed`);
  - the host command lives in the owner's private local configuration, never
    in a committed file;
  - off unless the plate lists `local-host`;
  - runs on the owner's machine only; no credentials pass through Plates.
- **Acceptance:**
  - [ ] The brief contains *Done when*, *Acceptance* and current decisions,
    byte-identical to the preview: `tests/backlog-attach.test.mjs: "local host brief matches its preview"`.
  - [ ] A host that reports no state shows "claimed" and "active" only:
    `tests/backlog-attach.test.mjs: "a silent host is never running"`.
  - [ ] ⚑ By hand: the owner attaches a local agent host to one phase, and it
    lands through `plates ready` and `integrate`.
- **Real surfaces:** the owner's machine with a configured local agent host.

### 184. The backlog remembers what happened to each item

- **Done when:** `backlog_events` records attach, assist, dispatch, release,
  answer and not-now(reason) locally and hosted. `plates backlog --since`
  reads it back.
- **Acceptance:**
  - [ ] Events hold no source text or owner words:
    `tests/backlog-events.test.mjs: "metadata only"`.
  - [ ] Ordering is identical with and without events:
    `tests/work-items.test.mjs: "events never reorder"`.

## Boundaries

- The backlog projects records. It is **not** a second tracker, status store or
  scheduler. Remove it and nothing about a plate's state changes.
- Owner choices remain a person's: decisions, acceptance, walk results, merges,
  lived-in, `learn decide`.
- Every outward effect follows the same rules as today:
  - preview with an exact digest;
  - CLI exit 3 until `--yes`;
  - web writes off until enabled;
  - journal before the call;
  - recover, never repeat.
- Spend comes only from existing, owner-approved allowances.

## Deliberately open

- **Verb or flag.** `plates backlog` is clearer, but `.plates/surface.json` may
  not take a new verb. Settled by the surface budget check at the start of
  phase 178.
- **Whether Recently done belongs in the backlog or stays on Home.** Settled by
  the owner's walk on phase 178.
- **Agent-ready needs `spec: 2`.** Some useful phases are older specs. Showing
  them as "needs shaping" may hide good agent work. Settled by counting older
  free phases at phase 178.
- **Local host presence depends on what each host can report about its
  session.** A host that reports nothing shows "claimed" and "active" only.
  Settled in phase 183.
- **Walk prep may capture private screen content.** It uses the existing private
  capture storage and receipts (web-changes). Activation needs the same owner
  approval.
