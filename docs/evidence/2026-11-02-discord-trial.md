# Bounded Discord trial preparation

On 2 November 2026, added exact thread binding, owner-only trial authorization,
bounded input/output, durable single-run admission and automatic service shutdown.
No credentials were read, no providers authenticated, and no Discord connections
or messages were sent during this change. Provider file checks used metadata only.

Verification: the hermetic focused unit/contract run passed all 67 tests across
`discord-trial`, `discord-adapters`, `discord-host` and `discord-pilot` suites.
New cases cover wrong-thread rejection before REST work, thread creator ID, owner identity/spoofed
stop, stop before initial work, active cancellation and queued followup removal,
three-turn/two-handoff limits, distinct session histories, output bounds, one-run
reuse refusal before secret loading, shutdown on idle/deadline/failure/stop and
uncertain remote cleanup. Provider and Discord calls use synthetic mocks.

The required `npm run check:focused -- tests/discord-trial.test.mjs
tests/discord-adapters.test.mjs tests/discord-host.test.mjs
tests/discord-pilot.test.mjs` also passed, including source conventions, roadmap,
render, inbox and whitespace checks. Its localhost capability probe required the
reviewed sandbox escalation; it made no external provider/Discord connection.

The local pending deployment remains disabled, with an unresolved public thread
ID and no approved deployment digest. The owner ID was obtained read-only from
the signed-in Discord profile and existing self-authored message. Account scopes
are explicitly user-reported names, not authenticated provider identities.
See the [current proposal and limitations](../development/discord-host.md#current-bounded-acceptance-proposal-2-november-2026).

Real provider entitlement, no-tool runtime behavior, persistent-host probe and
end-to-end delivery remain unrun. The existing credential-free image probes do
not establish those properties. Full integrated/typecheck gates are not run;
there is no publication or deployment in this task.

## Run-3 readiness and terminal result, 2 November 2026

This later observation supersedes the preparation status above. The owner approved
one replacement test with a five-minute Discord-only wait followed by three minutes
of execution. The exact verified thread and owner remained unchanged. Fresh run-3
state, volumes and network preserved the consumed earlier runs; the credential-free
persistent worker probe passed before connecting. No permissions changed.

Readiness was verified at 14:57:26.559 UTC; the waiting deadline was
15:02:26.559 UTC. Session 65517 exited zero with `wait_timeout` and confirmed
cleanup. At 15:02:49 UTC, independent successful Docker queries by deployment and
both volumes found no containers. The dedicated network was empty; bridge and
host locks/leases were absent. The consumed state recorded zero tasks, turns,
replies, handoffs, tokens and admission reservations. No provider inference was
requested. No restart or extension occurred. Evidence is retained in
`../runtime-setup/run3-readiness.json` and `run3-outcome.json`.

The user reported a message at 15:02:58 UTC. Read-only native Discord inspection
showed an owner message at local 08:02: `@Dion (Codex) Make another test greeting...
and ask our Dion (CC) friend ?`. It lacked the required `start` command. The UI
only exposed minute precision, and rejected ingress is not persisted, so its
exact arrival relative to the deadline cannot be established. It was not admitted;
do not claim a logged rejection or a precisely observed late-send timestamp.

The timing implementation defers provider credentials and workers until admission,
starts execution timing exactly once, prevents extensions, and preserves owner
stop priority. Tests cover five-minute expiry, three-minute execution, invalid
triggers, no provider reads during waiting, stop while waiting, and legacy timing.
After the live window, an additional offline regression found that a startup abort
listener would otherwise kill the persistent Codex worker when the first turn
finished. It now detaches when the worker becomes ready; runtime cancellation
continues through the adapter and host shutdown. The before-fix test failed as
expected in `/tmp/ajaxian-run3-startup-cancellation-before-fix.log`.

Verification before live connection passed 201 tests and all required source
conventions. The post-run offline cancellation fix passed 202 tests plus roadmap,
render, inbox and whitespace stages using:

```sh
npm run check:focused -- tests/discord-trial.test.mjs tests/discord-adapters.test.mjs tests/discord-host.test.mjs tests/discord-initialization.test.mjs tests/discord-pilot.test.mjs tests/discord-recovery.test.mjs
```

Logs: `/tmp/ajaxian-run3-preflight.log` and `/tmp/ajaxian-run3-final-check.log`.
All test transport/provider calls were mocked. Full integrated/typecheck gates
remain unrun. Real model generation and bot handoffs remain unverified. A further
live attempt requires fresh approval; no autostart was configured.

## Run-4 execution and offline diagnosis, 2 November 2026

The owner approved one further attempt after adding credits. Execution was available;
no run-4 attempt/artifacts existed before preparation. Prior cleanup was independently
rechecked. The same pinned images and limits were used with fresh isolated run-4
state, volumes and network. Credential-free worker probes passed. No model/account,
permission, deadline, tool policy or autostart change occurred.

Both Discord connections were ready at 15:18:20.453 UTC, with a 15:23:20.453 UTC
waiting deadline. The valid owner trigger was admitted at 15:19:29.322 UTC. One
Codex turn was reserved; a real provider session ID was durably bound. The first
turn reached its 45-second timeout with no reply. Cancellation was confirmed.
The service exited zero with task outcome `uncertain` and cleanup `confirmed`.
Independent queries at 15:20:44 UTC found no deployment/volume containers, an
empty network, and no bridge or host locks. No retry was made.

Result: one attempted Codex turn, zero bot replies and handoffs; Claude was not
invoked. The 16,000-token/$0.25 admission reservation remains. Actual provider usage
and billing are unknown, not zero. Evidence is in `../runtime-setup/run4-readiness.json`
and `run4-outcome.json`. A later read-only process check found no live launcher PID.

Offline diagnostics mounted only the Codex session volume read-only in a nonroot,
read-only diagnostic container with `--network none`. The script read only bounded
session JSONL files, never auth files, and emitted timestamps, known event/role
names and numeric usage fields; no prompts, raw errors, credentials or transcripts
were exposed. The diagnostic container was removed after each inspection. Pinned
CLI schema generation used a separate empty temporary Codex home and no network.

The retained session records `task_started` at 15:19:37.134 UTC and `turn_aborted`
at 15:20:14.375 UTC. There was no assistant response item, token-count event or
provider-error event in that session file. Startup/session creation therefore
succeeded; about eight seconds elapsed before the generation task started, leaving
about 37 seconds before cancellation. The evidence does not establish missing
credits, authentication failure, model access, network failure or slow generation
as the underlying cause. The original live stream was not retained.

The pinned schema confirms structured `error` notifications with `willRetry`,
`codexErrorInfo` and optional numeric HTTP status. The bridge previously ignored
those events and recorded usage only on successful completion. A failing mock
reproduced this diagnostic gap before the fix. It now retains only allowlisted
provider-error codes, bounded progress events and numeric status/timing fields,
never raw messages/additional details. Streamed usage is persisted as received,
even if the turn later cancels. Turn-deadline failures are explicitly labeled
`turn_timeout`, distinct from owner interruption. These changes improve diagnosis;
they do not establish or fix an unobserved provider-side cause, change limits,
or authorize another attempt.

Sanitized artifacts: `../runtime-setup/run4-offline-session-diagnostics.json` and
`run4-offline-session-details.json`. Before-fix failure:
`/tmp/ajaxian-run4-diagnostics-before-fix.log`. Full integration/typecheck gates
remain unrun. A possible next separately approved diagnostic is one Codex-only
hello reply with the same model, isolation and 45-second turn limit, no handoff,
and $0.25 admission allowance; no such run has been prepared or started.

Final verification on 2 November 2026: the same six-file `check:focused` command
listed above passed all 205 tests plus roadmap/render/inbox/whitespace stages.
Output is retained in `/tmp/ajaxian-run4-final-check.log`. No further live calls
were made during diagnosis or verification.
