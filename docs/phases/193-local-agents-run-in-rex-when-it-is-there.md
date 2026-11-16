---
status: partial
since: 2026-11-15
goal: G7
spec: 2
depends: [183,192]
note: "Increment 1 built: harness config, Rex detection, the runner, find-or-create tabs and state from Rex, checked against real Rex 0.1.0-preview.18. The owner's walk remains."
evidence: []
---

# Local agents run in Rex when it is there

## Done when

When Rex answers on the owner's machine and a local host names a harness, `plates audit run` and
`plates home --attach` (the `local-host` route) start that harness in a labelled Rex tab for the
plate and provider, the owner can watch and step in, and plates reads the run's state from Rex;
without Rex, or without a harness, every local host behaves exactly as phase 183 built it.

## Scope

- **Detect.** Rex is usable when a `rex` executable is on the host environment's PATH and
  `rex ls --json` answers within a short bound. Anything else is "no Rex", silently: today's
  start/state commands run unchanged.
- **Configure.** A host in `$XDG_CONFIG_HOME/plates/local-hosts.json` may add
  `"harness": ["/abs/path/agent", "arg"...]`, the agent command to run with the brief on stdin and
  the checkout as its working directory. `start`/`state` stay the fallback; a host may have only a
  harness, in which case no Rex means the route says why it cannot start.
- **Find before spawning.** The Rex session for a plate and provider is labelled
  `<plate>-<provider>` (the plate's `name`, lowercased, hyphenated, plus the provider key). Plates
  reuses a session with exactly that label and opens a new tab in it for each run; it creates the
  session when none exists. It never types into, resizes, closes or relabels an existing tab or a
  session it did not create, and never drives a shell it finds idle: a person may be using it, and
  a typed brief would land in scrollback.
- **Run.** Each run is one tab, opened with `--keep-open` and `--focus=false`, labelled with what it
  runs (`audit-<lens>`, or `phase-<n>`). The tab runs `lib/rex-run.mjs`, a small runner plates
  ships and starts by path (not a CLI command: the CLI's import closure is capped), which reads the brief from a private file (mode 600, under plates's state directory),
  deletes it, and starts the harness with the brief on stdin; the brief never appears in argv, the
  environment or the terminal. The harness's own output is the tab's output.
- **Contract unchanged.** The receipt is the Rex session id and block id (`rex:<session>/<block>`),
  printed within the existing 60 s bound; the harness runs with `hostEnv` only. State comes from
  Rex: a running program is `running`; an exit is `finished` only when it is 0 and, for an audit,
  the findings file exists (a harness can exit 0 having written nothing), otherwise `failed`; a tab
  Rex no longer knows is `failed`. Plates never stops a run.
- **Remote hosts.** Off in this phase: `rex -S <host>` is not used. A later increment may allow a
  host only where its route is verified.
- **Out of scope.** The night and other GitHub Actions jobs (no Rex there); hosted dispatch to a
  local machine; Rex's own presence beyond reading a tab's state. Rex reports terminal sessions
  and presence; plates does not own Rex, its sessions or its app.

## Lessons this design keeps

From driving three fix lanes through Rex by hand on 2026-11-15:

- One session per lane and one tab per run made it easy to see each lane and step in; reusing a
  shell tab would have mixed runs.
- `rex capture` returns the whole scrollback, so anything printed is kept: the brief must never be
  echoed, and the runner must not print its file path's contents.
- A wait timeout says nothing about success; the tab's `last_exit` does, and even exit 0 needs the
  run's own artifact checked (a headless agent that hits a denied action exits 0 with no output).
- An unrelated session with a similar name existed; matching only exact labels plates creates kept
  it untouched.
- Quota waits and agent progress were readable live in the tab, which is the point.
- Rex 0.1.0-preview.18's real answers, checked before review: `ls --json` is `{sessions:[{session_id,label}]}`;
  `new --json` gives `session_id`; `run --json` gives `block_ids`; `wait --for 1s --json` prints
  `{"exit_code":N}` once the program exits, and while it runs exits 1 with "wait timed out" on
  stderr (not stdout); an unknown block exits 3, "not found". A dispatch through real Rex reused the
  session, gave the harness the brief on stdin only, left no brief file and kept it out of scrollback.

## Integration increments

1. **Detection, configuration and the runner** (this change set): `harness` read and validated,
   Rex detection, `lib/rex-run.mjs`, the find-or-create and tab-opening adapter with a stubbed
   `rex`, state from Rex. Compatibility: a host without `harness` is untouched; no Rex is
   untouched. Exposure: only owners who add `harness`. Proof: the tests below, `npm run check`.
   Recovery: remove `harness`, or revert.
2. **Owner's walk** with a real harness in Rex (the ⚑ box).
3. **Remote hosts**, later, only for verified routes.

## Acceptance

- [x] No Rex, or a host without `harness`, runs today's start/state commands unchanged: `tests/rex-host.test.mjs: "without rex or a harness the local host runs as before"`
- [x] With Rex and a harness, a run opens a new keep-open, unfocused tab in the `<plate>-<provider>` session, creating the session only when absent: `tests/rex-host.test.mjs: "a run opens a labelled tab in the plate's provider session"`
- [x] An existing tab or an unrelated session is never driven, closed or relabelled: `tests/rex-host.test.mjs: "plates never drives a tab it did not open"`
- [x] The brief reaches the harness on stdin and never appears in argv, environment or captured output, and its file is gone after the run starts: `tests/rex-host.test.mjs: "the brief reaches the harness only on stdin"`
- [x] State maps from Rex, and exit 0 without the expected findings file is failed: `tests/rex-host.test.mjs: "state comes from the rex tab and the run's own artifact"`
- [x] `plates audit run` and the `local-host` attach route both go through it: `tests/rex-host.test.mjs: "audit run and local-host attach use rex when configured"`
- [ ] A real harness started this way in Rex, watched and finished: ⚑ by hand: the owner.

## Your part

- **Ask:** Add a harness to one local host, run one audit or attach one phase, and watch it in Rex.
- **Why:** Only you have Rex and the agents signed in on your machine; it settles whether runs in Rex are the default for local agents.
- **Look at:** The new tab in the plate's Rex session while the agent works.
- **Choices:** It ran in Rex and finished | It started but plates misread its state (say how) | It did not start (say why)
- **Recommend:** It ran in Rex and finished
- **Keeps it open:** It did not start (say why)
- **Takes:** About 10 minutes plus the agent's time.
- **Then:** Ran: built. Misread or did not start: the adapter changes here.
- **Ready when:** the automated boxes are built and merged, and the owner's global plates is updated.

## Real surfaces

- owner's machine: a harness started by `plates audit run` or `plates home --attach` in a labelled Rex tab, watched, and its state read back.

## Proof

Automated: `node --test tests/rex-host.test.mjs`; `npm run check`; `npm run typecheck`.
By hand: the owner's run in Rex (Your part).
⚑ None from Plates; agent use is the owner's own.

## Deliberately open

Which plate name the session label uses when two checkouts of one plate run at once: both share
the session, each in its own tab, which is the intended view; settled by the owner's walk.
Rex's CLI is a preview: its JSON shapes may change. The adapter reads only `session_id`, `label`,
`block_ids`, a wait's `exit_code`, and its "wait timed out" on stderr, and treats anything unexpected as no Rex
or failed; a Rex release that changes these shows as the fallback, never as a wrong state.

## Next action

The owner's walk (Your part): add a harness to one local host and watch one run in Rex.
