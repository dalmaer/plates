---
status: partial
owes: walk
since: 2026-10-31
goal: G9
spec: 2
depends: [142]
note: "Claude steps render the OTLP export from secrets when a project configures telemetry; Codex export, traces and the real run in a backend remain."
evidence: ["evidence/2026-10-31-agent-telemetry.md"]
---

# Every plate's agent runs report to one place the owner picked

## Done when

Agent runs that Plates starts in a project (robot, cross-review, night,
climb) export the agent CLI's own OpenTelemetry metrics and traces, tagged
with project, phase, job and experiment, to the backend the owner chose, and
a run without a configured backend still runs and says telemetry is off.

## Scope

- The rendered workflow templates and local launchers set the CLIs'
  documented export settings (Claude Code `OTEL_*` and
  `OTEL_RESOURCE_ATTRIBUTES`; Codex's `[otel]` config) when the project has
  a telemetry endpoint configured, and nothing otherwise.
- Attributes: `plates.project`, `plates.phase`, `plates.job`,
  `plates.experiment`, the run URL. No prompt or output text unless the
  owner opts in.
- The endpoint and its key are a secret in the project's settings, never in
  source.
- Not in scope: dashboards (the backend's own), production error ingestion
  (phase 88).

## Acceptance

- [x] With an endpoint configured, the rendered workflow passes the export settings and attributes; without one it passes none and logs "telemetry off": `tests/telemetry-render.test.mjs: "telemetry only where configured"`.
- [x] No rendered setting carries prompt text or the endpoint key in plain text: `tests/telemetry-render.test.mjs: "no prompts or keys leak"`.
- [ ] A real robot run in one fleet project appears in the chosen backend with its attributes: ⚑ by hand: the conductor, then the owner opens the backend.

## Your part

- **Ask:** Pick where agent run telemetry goes.
- **Why:** Cost, tokens and failures per project become visible without Plates building dashboards.
- **Look at:** the decision's "Building blocks" line in [the research](../research/2026-10-30-own-judgment-rent-the-rest.md).
- **Choices:** Langfuse Cloud free tier | Self-hosted Langfuse | Grafana with Prometheus | Not yet
- **Keeps it open:** Not yet
- **Takes:** 10 minutes, including making the key.
- **Then:** The conductor adds the endpoint as a secret to one fleet project and runs the walk. Not yet: the phase waits.
- **Ready:** yes

## Real surfaces

- workflow shell: a robot run in one fleet project exporting to the backend.

## Proof

Automated: `node --test tests/telemetry-render.test.mjs`; `npm run check`.
By hand: one real run, read in the backend.
⚑ A hosted backend may cost money past its free tier; adding a secret to a
project needs the owner's yes.

## Deliberately open

- **OTel GenAI conventions are still Development**; attribute names can
  drift. Plates' own attributes are stable; the CLIs' are theirs.
- **Codex's trace exporter keys** differ between guides; settled against
  the installed Codex version.

## Next action

The owner picks the backend; the conductor adds the endpoint secret to one
fleet project and runs the walk. Then Codex export once codex-action's config
input is confirmed.
