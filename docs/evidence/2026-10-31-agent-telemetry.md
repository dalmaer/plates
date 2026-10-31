# Evidence: phase 143 — every plate's agent runs report to one place the owner picked

Conductor's checks, 2026-10-31, worktree on `claude/phase-143`. No secret,
endpoint or backend was created; this is the rendering half.

## Automated (2026-10-31)

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| `node --import ./tests/helpers/hermetic.mjs --test tests/telemetry-render.test.mjs tests/surface-budget.test.mjs tests/workflows.test.mjs` | pass | exit 0, 63 of 63 | With `telemetry` in `.plates/plates.json`, every Claude agent step gets the OTLP export block and the Plates attributes from secrets only; without it, nothing is rendered and each agent job logs "telemetry off"; no verb added. |
| The same with `shapeTelemetry` made a no-op (then restored) | both tests fail | both failed, 0 pass | The render is what the tests check. |
| `npm run render:check` | 0 | 0 | Plates' own workflows match their templates (re-rendered). |
| Builder's run of 59 affected test files and the workflow/guide suites | pass | 1,378 of 1,378 and 89 of 89; both renders parse as YAML | The template change breaks nothing nearby. |
| `npm run check` through `plates integrate` | pass | in the integrate log | The full gate. |

## Limits

- Codex steps carry a marked omission: codex-action's way of passing the
  `[otel]` config wasn't verifiable offline, and passing it on the command
  line would expose the key to the agent's own process.
- Metrics and logs are exported; traces are not yet (no traces exporter set).
- `plates.phase` is never emitted: no current workflow knows its phase.
- At run time the agent's shell can read the headers variable; use a
  write-only ingest key.
- Local launchers aren't covered.

## Not yet walked

- ⚑ The owner picks a backend; a real robot run in one fleet project shows
  in it with its attributes (this also confirms claude-code-action forwards
  step env to Claude Code).

Supports **partial** (walk owed).
