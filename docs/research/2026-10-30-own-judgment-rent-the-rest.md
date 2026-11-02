# Own the judgment layer, rent the rest

Build or adopt, 30 October 2026. A survey of agent fleet platforms against
what the owner asked for: watch over a fleet, manage model capacity, learn
within and across projects, find signal, tie into observability, run
experiments, tell one-way from two-way doors, and set risk per project, all
extensible without breaking. The full report, with its notes, is private to
the owner; this is its public summary. Facts carry a source; **Judgment** is
analysis. Figures are as read on 2026-10-30 (GitHub API unless named).

## Decision

**Judgment:** keep Plates as the base and make it smaller. Plates owns what no
candidate sells: the practice, evidence grades and proof, lessons and
patterns, health measures, and the *policy* for autonomy, doors and capacity.
It adopts mature, narrow, open parts for telemetry, host permission
enforcement, session execution and live monitoring, behind adapters. The
worry about extending Plates is a worry about size (48 verbs, 133 flags, a
26,000-word agent guide), not missing guardrails; a platform that ships
near-daily does not make extension safer. Goal G9 carries this out.

## What each layer is

| Layer | Plates owns | Adopt | Watch |
| --- | --- | --- | --- |
| Practice, evidence, proof, lessons, health | yes | | |
| Risk and door policy | the policy (phase 132's levels, door classes) | host enforcement: Claude Code permission modes and hooks, Codex sandbox and approval policy, GitHub rulesets and environments | OpenHands' per-action risk analyzer |
| Model capacity | the policy (G8, phases 103, 106, 138) | provider-reported limits; ccusage and CodexBar-style readers as cross-checks | vendor quota APIs |
| Telemetry | the attributes (project, phase, job, experiment) | the agent CLIs' own OpenTelemetry export, to a backend the owner picks | OTel GenAI semantic conventions (still Development) |
| Session execution | the contract and its evidence (phase 146) | the Plates robot until an executor qualifies | OpenHands Agent Canvas and SDK, Gas City |
| Live monitoring of sessions | nothing | herdr, on trial | cmux, Conductor |
| Work and memory substrate | lessons and decisions | | Beads |

## Momentum, in brief

- **Gas Town**: last release v1.2.1 on 2026-06-06; monthly commits fell from
  1,580 (March) to about none (August–September). Its author calls it
  "effectively burned down" ([Yegge, Aug 2026](https://yegge.ai/essays/the-shape-of-things-to-come/)).
  Not a base.
- **Gas City** (its successor, an orchestration-builder SDK): v1.5.1 on
  2026-10-24, about 1,000 commits in October, 1,470 stars
  ([gastownhall/gascity](https://github.com/gastownhall/gascity)). Packs run
  as trusted code, unsandboxed. Watch.
- **Beads**: v1.3.2, 28.3k stars, about 513 contributors; storage moved to
  Dolt ([gastownhall/beads](https://github.com/gastownhall/beads)). Healthy.
- **OpenHands**: since July 2026 the main repo is Agent Canvas, a self-hosted
  control centre that drives its own agent, Claude Code, Codex and any ACP
  agent; 92,291 stars; SDK v1.59.0 on 2026-10-28 with about two releases a
  week; budgets, analytics and RBAC are Enterprise
  ([OpenHands](https://github.com/OpenHands/OpenHands)). Bake off, don't base.
- **herdr**: an Apache-2.0 terminal runtime for many agents, 46,947 stars on
  a repo created 2026-03-27, mostly one maintainer; no cost, approval or
  telemetry features ([herdr.dev](https://herdr.dev/)). Trial for watching.
- **Fading**: Google Jules (shuts 2026-12-31), Vibe Kanban (company closed
  April 2026), Roo Code (archived May 2026), Terragon (closed February 2026).
- **Building blocks**: Claude Code and Codex both export OTLP natively;
  Langfuse (MIT, self-hostable) joined ClickHouse in January 2026; LiteLLM had
  a malicious PyPI release in March 2026, so pin anything adopted.

**Judgment:** every candidate is strong at running agents and weak at judging
them. Learning across projects, signal, experiments and per-project risk are
open in every option surveyed; that is the layer Plates keeps.

## What the stopped executor trials found (2026-10-30)

Two same-day trials, OpenHands (SDK 1.59.0) and Gas City, ran on unpublished
branches against one real Plates task pair with fixtures and scripted model
responses; neither made a real model call. The owner stopped both on
2026-10-30 in favour of G9. Both conclude that Plates keeps admission,
authority, payer, effects, usage and learning, and that neither executor
removes that glue.

- **OpenHands**: "feasible for a restricted native-SDK API trial; not ready
  to launch a paid/account-backed trial". Gaps: shared-key auth maps every
  caller to one admin, the budget check runs after a step, the ACP path
  auto-approves permissions and defaults to full access, posts carry no
  idempotency key, and the Python footprint is large.
- **Gas City**: "does not qualify it for adoption". Gaps: create and webhook
  dedupe live in memory and are lost on restart, an inbound retry can
  notify an agent twice, the subprocess runtime inherits the environment
  with no deadline, and the bundled Codex preset bypasses approvals and the
  sandbox.
- **Kept** (phase 146): the frozen handoff and evaluator, the default-deny
  child sandbox, the intent journal with uncertain states, the reviewed
  learning flow, and the qualification checks those gaps imply. **Kept**
  (phase 149): the transport-neutral chat envelope both trials designed.

## What would change the decision

- An executor passes phase 146's qualification contract and stable
  interfaces hold for a quarter: trial it on real tasks, then consider
  handing it execution.
- GitHub exposes cross-provider usage and per-repo policy through an API:
  adopt it for capacity and enforcement.
- Gas City ships capacity and approval features and keeps its pace: revisit
  it as the control plane.
- G5 shows no measured gain from Plates after 60 days of G9: shrink Plates to
  practice, lessons and proof.
