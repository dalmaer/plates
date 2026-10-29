# Climb and tend

## When you'd reach for this

The night tells you what is wrong. These two passes send an agent to do
something about it while you sleep, and leave one PR for you to read:

- **Climb** when a number should be better and nobody has time to push it:
  the suite has grown slow, a test is flaky, the build crawls, the project's
  own benchmark slipped, the lessons table has grown faster than anyone has
  distilled it, Loop's findings wait untriaged.
- **Tend** when the records have drifted from the truth: a stale roadmap,
  lost proofs, stuck phases, placeholder evidence, lints, drift, loose ends.
  The night reports these every night; tend resolves them once a week.

Both are opt-in, because both spend model tokens.

The existing preflight verifies runner scratch capabilities only. Its success
state is `runner-ready`, with `runnerReady: true` and `agentPermissions:
"unverified"`; this is not agent readiness or permission to retry a denial.
Agent readiness before baseline remains incomplete: the workflow still has its
existing runner gate. Do not activate a universal denial or relabel declared
settings as effective permission evidence to fill that gap. No permissions,
allowlists or provider settings are changed by these diagnostics.

Retained denial receipts contain at most eight fixed-vocabulary command-prefix
and target-path classifications. They omit raw commands, arguments, paths,
messages and session text. `detailsAvailable` means a command or target
classification was retained; tool names alone do not satisfy it. Missing,
withheld and omitted details remain explicit. A prefix classification is not
a reconstruction of a compound shell command and grants no retry authority.


## Proposed agent-readiness boundary (not activated)

Investigation on 27 October 2026 found no pre-execution effective-policy receipt
in the current action interfaces. Claude's `--allowedTools` is a declared input;
managed rules, ask/deny rules and runtime hooks can change a tool decision.
Codex's action selects its sandbox/profile, prepares configuration and launches
`codex exec`; its output is the final message, not a pre-baseline effective-policy
snapshot. Reading local configuration from a developer machine cannot establish
policy on the future Actions runner. No denied operation was probed and no model
session was started to infer authority.

Sources inspected: [Claude action inputs and outputs](https://github.com/anthropics/claude-code-action/blob/v1/action.yml)
(blob `05af91981d60c8909a55842376d5ab57fbcda4aa`),
[Claude permission precedence](https://code.claude.com/docs/en/permissions#precedence-among-rules-hooks-and-mods),
[Codex action](https://github.com/openai/codex-action/blob/v1/action.yml)
(blob `ff7088b97498db5cacab3c72b96c406f03f92fa5`), and its
[execution adapter](https://github.com/openai/codex-action/blob/v1/src/runCodexExec.ts)
(blob `1590349248daa5488e4a301e6414db6fdd9479e4`). These are observations of
mutable provider refs, not new source pins or changes to the action versions.

The proposed shared interface for an autonomy-policy adapter is a versioned
receipt bound to provider, resolved action/runtime revision, repository source
head, run ID, attempt, workspace identity, policy digest and a versioned required
operations digest. Per-operation results are `allow`, `deny`, `ask` or `unknown`,
with policy-source provenance and coverage. Keep the runner's observation separate.
The trusted adapter must collect the actual effective sources for that invocation;
a caller-supplied `verified` boolean, a config checksum or an owner preference is
not authentication or proof that the action applies that policy. Revalidate the
binding immediately before the baseline and again before launching the agent.

Readiness requires complete matching evidence that every required operation is
allowed without interactive approval. Missing sources, unsupported rules, hooks
whose result depends on execution, stale bindings and conflicting requirements
remain unknown or denied. Evaluate no shell commands, edits or hooks as probes;
do not change settings, widen scope, retry a denial or infer authority from a
successful runner test. The provider's actual enforcement always remains in place.

Coordination with the proposed `evaluateAutonomy` interface (local autonomy
candidate `d8a6174dd606da10740b04bf10ace121bcc773d3`): readiness evidence would
supply the independent `context.platform` result only after the adapter validates
its provenance and scope. User intent and `selectionVerified` remain separate;
`proceed` from the preference evaluator cannot produce a platform grant. Required
project and command gates must be checked independently. An `inherit` decision
means existing behavior, not verified readiness. No evaluator integration is
activated here because the effective-policy producer is still missing.

Missing signal: a trusted, non-mutating adapter that resolves effective
permissions and restrictions for the *same future action invocation*, with a
complete required-operation inventory and freshness binding. Neither a receipt
schema alone nor synthetic allow cases supply this producer. Coordinate that
adapter with the autonomy-setting work before implementing or activating the
baseline gate. Until then the permission-readiness fix is incomplete; the
existing execution-denial check stays fail-closed after the agent runs.

## What it does, and why it works that way

**Two kinds of night, kept apart.** The measuring night is free,
deterministic and on everywhere; its data PRs may merge themselves. A climb
or tend pass is a choice with a price, and its PR is code or records, so a
person always merges it. The second reads the first: the health page says
which number is worst.

**Climb: an agent climbs one number, a script judges it.** On 6 October an
agent took plates's own suite from 48 seconds to 23 in eight kept changes, by
hand, each measured against noise. Climb makes that
hour repeatable, under one protocol (`.agents/climb/PROTOCOL.md`):

- **Every number comes from the script**, `scripts/plates/climb.mjs`, never
  from the agent. An agent's "it's faster now" with no number behind it is
  the failure this prevents.
- **Measured against noise.** Base and candidate run alternately, in
  worktrees, for two rounds or more; a change is kept only when it beats the
  base by the margin in every round. Anything else is reverted.
- **Behaviour unchanged.** The gate passes after every kept change, and the
  test ledger checks every test the base ran still ran: none dropped, none
  skipped. A speed-up that deletes a test is not a speed-up.
- **Bounded.** One job a night, an attempt limit, three misses in a row
  stops it, and a budget in minutes.
- **Chosen by the health page.** The job tied to the worst measure goes
  first (a flaky test before anything else), else the jobs rotate. A job
  with an open PR waits for you to read it. A job whose last three PRs were
  closed unmerged proposes its own retirement: if you keep declining its
  work, it stops asking.
- **Or chosen by tonight's plan.** When the plan branch `keel-night-plan`
  holds a plan dated today (UTC), climb runs its first `climb:<job>` build
  item whose job may run (one `"climb".jobs` names, with no open PR, not
  retiring), and nothing else; a plan with no climb item means no climb
  tonight, a green run that says so. The plan never adds a job, and its
  item's minutes may lower the budget, never raise it. Anything its
  `willNotTouch` lists (a path: that file, or everything under it) is refused
  like `.github/`, on the head that is pushed as well as the agent's: listing
  `.plates/climb.json` stops climb's own rotation commit, and the next night
  reads the rotation from this night's record alone. The publish job ticks
  the item on the plan branch: running, then done with the PR or failed with
  why. A plan that is refused
  or for another night is no plan: climb chooses as above.

The jobs (`test-time`, `hygiene`, `build-time`, `perf`, `lessons`, `loop`)
and what each climbs and is judged by are in the climb practice's README.
Two are proposals nights: `lessons` and `loop` propose, and deciding stays
yours.

**Tend: the records reach zero, fixed or decided.** Weekly, an agent works
through the night's record findings under `.agents/climb/TEND.md`. It may
repair a reference, refresh a next action already done, bring a doc back in
line with the code, apply a reconciliation correction. What only you can
choose (step a phase back, keep or restore a drifted file, close a branch)
it writes down as a proposal for you.

## The commands

Switch a pass on in `.plates/plates.json` (and `--with climb` when adopting or
initialising). No `climb` key, no climb night; no `tend` key, no pass:

```json
"climb": { "jobs": ["test-time"], "budget": { "minutes": 45 }, "schedule": "nightly" },
"tend": { "schedule": "weekly", "budget": { "minutes": 30 } }
```

Why you'd set each:

- `jobs`: start with one. `test-time` is the safest first job: its judge is
  a timer and the test ledger.
- `budget.minutes`: the most a night may spend. This is the price you are
  agreeing to, so it is yours to set.
- `schedule`: `weekly` when you want to read one climb PR a week rather
  than one a day.
- `margin`, `attempts`, `testCommand`: only when the defaults don't fit
  your suite; `build`, `buildOutput` for `build-time`; `perf` for your own
  benchmark.
- `agent`: which agent runs the pass: Claude (`"claude"`, the default) or
  Codex (`"codex"`). A project that names an agent lists it in `"agents"`
  (`"agents": { "claude": {}, "codex": {} }`). See *Choosing Codex* below.

Check what a project will actually run, with the defaults filled in:

```bash
node scripts/plates/climb.mjs config
node scripts/plates/climb.mjs pick       # which job tonight, and why
node scripts/plates/climb.mjs tend-pick  # whether a tend pass would run
```

Then set the secret, a ⚑ step: `CLAUDE_CODE_OAUTH_TOKEN` (or
`ANTHROPIC_API_KEY`) for Claude, `OPENAI_API_KEY` for Codex. Until the
pass's agent has its secret, each run ends green with a notice.

### Choosing Codex

Set `"agent": "codex"` on `climb`, on `tend`, or both, list `codex` in
`"agents"`, and set `OPENAI_API_KEY`. Two things differ from a Claude night:

- **What it costs.** Codex bills the OpenAI API account per token; there is
  no subscription path. `budget.minutes` still bounds the run, and the
  Budget line still counts minutes, not dollars, so watch the API account
  for the first few nights.
- **Where its commits live.** Codex runs in a sandbox that may write the
  checkout but keeps `.git` read-only, so it cannot commit there, and plates
  never gives it the sandbox that could (`danger-full-access`). So a plates
  step gives it a second git dir, `.plates/agent-git`, holding the night's
  branch, and its brief tells it to commit there. The protocol is
  unchanged: one change per commit, measured, kept or reset. Because Codex
  can write that git dir (its config and hooks too), plates never runs git
  on it afterwards: a plates step copies out only the objects and the one
  branch, into a repo plates makes, and hands those on. From there the
  judge and the PR are exactly as for Claude, and a branch that carries
  `.plates/agent-git` is refused like one that changes `scripts/plates/`.
  Codex's sandbox may also write its temp folder, so plates pins that to
  `/tmp/plates-codex`, never the runner's own temp, where the files that set
  later steps' environment live.

One thing a Codex climb night cannot do: `compare` builds its worktrees in
the OS temp, not beside the checkout, since the checkout's parent is outside
Codex's sandbox. A gate that reads a sibling folder (`../data`) fails its
base there; keep such a project's climb on Claude.

The rest of `climb.mjs` (`measure`, `compare`, `guard`, `prove-steady`,
`report`, the tend verbs) is what the workflows and the agent run; the
reference is `plates --agent-help climb`. You don't need to run them yourself.

## What you'll see

- **A climb PR** on `keel-climb/<job>/<date>`: a before-and-after table,
  each kept change as its own commit with its numbers, what was tried and
  reverted, the gate's line, and the merge danger (a two-way door).
- **A proposals night's PR** lists each proposal or proposed rank; you
  decide each.
- **A tend PR** on `keel-tend/<date>`: each finding and what was done
  (resolved only when the measures, run again, no longer report it), the
  record count before and after, and a checklist of what only you can
  choose, also committed as `docs/tend/<date>.md`. A pass that only
  proposed still opens one.
- **Nothing**, when a night kept nothing. Its one line is on the run's
  summary and the next health page. That is a result, not a failure.
- **A red run** only when the agent failed before its budget ran out (a
  refused secret, a bad model), with that error's text. A budget timeout is
  not red: what was kept is still judged.
- **A Budget line** on the health page, to tell whether a budget you set by
  guess was right:

  ```
  Budget: tend 2, 3, 30⏱ of 30 min (last 3 runs; too few to say) · climb 41⏱, 45⏱, 44⏱, 45⏱ of 45 min (last 4: 4 ran out; extend)
  ```

  Each number is the minutes the agent step itself took in one run, newest
  first, from GitHub's own record of the run (not the agent's report, and
  not setup or the PR, which are plates's time). ⏱ means it ran out: cut off
  by its timeout, or within a minute of the budget. Over the last 4 to 8
  runs, *extend* means the agent is often cut off mid-work; *shorten to N*
  means no run used half its budget; *hold* means the budget fits. It never
  changes `budget.minutes` itself: that is money, and you set it. A run that
  never reached the agent (no secret, nothing picked, or the agent never
  started) is not counted, and nor is a run from before you last changed
  the budget: after a change the entry says `since <date>`, and counts
  again from there.

## What it never does

- It never pushes to `main` and never merges. The workflows push only their
  own branch prefix, and a pass with tonight's plan adds one commit of ticks
  on top of `keel-night-plan`, with a lease, from its publish job.
- With a plan, it never builds what the plan does not name.
- The agent cannot write to the repo even if a brief or a finding talks it
  into trying: it runs in a job whose token only reads (Codex with no
  GitHub token at all, sudo dropped), and its commits are
  judged in a second read-only job and pushed by a third that runs none of
  the branch's code. A branch that changes `.github/`, `scripts/plates/`,
  `.plates/plates.json`, a lockfile, `.npmrc` or a `package.json` beyond its
  scripts is refused before anything runs. The judge installs (with your
  `setupToken`) on the run's own commit before it takes the agent's
  commits, so none of their code ever runs with that token, and it guards
  from the run's commit, never from the base the agent's record names.
- Tend never writes or edits evidence, never sets a status to built,
  lived-in or accepted, never ticks an acceptance box, never deletes a
  file and never changes anything but records and agent-facing text
  (Markdown under `docs/`, a README, `AGENTS.md`, `CLAUDE.md`, `.agents/`);
  its guard refuses each, naming the line.
- A lessons night never edits the lessons table; a loop night never
  decides a finding.
- Neither runs a retro: an unattended retro finds false positives and keeps
  fixing them.

## See also

- [The night shift](the-night-shift.md): the measures both passes read.
- [Reviews and PRs](reviews-and-prs.md): reading the PR they leave.
- [`practices/climb/README.md`](../../practices/climb/README.md): the jobs
  table, the full config and the protocol.
