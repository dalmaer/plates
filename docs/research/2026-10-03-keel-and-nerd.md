# Keel and Nerd: one working system, two independently useful tools

Research date: 3 October 2026. Recommendation: **join forces through a small,
optional integration; keep the repositories and release cycles separate for
now.** Keel should own the project's working practice. Nerd should own its
machine operations, test execution and deployment. Nerd's board is the natural
place to bring those views together for a person.

This is a recommendation, not an implemented integration or an agreement with
Nerd's maintainer.

## What was examined

- Keel **0.5.1**, local checkout and GitHub HEAD both
  [`d6c0b6a`](https://github.com/dalmaer/keel/tree/d6c0b6a6df436c987e7e61597f04276fdb009730).
- Nerd GitHub HEAD, cloned for source inspection:
  [`bb93080`](https://github.com/dglazkov/nerd/tree/bb930807921f13396d20e2efae78f79dcafc568d).
- Both READMEs, Keel's design, CLI guide, adoption, practices, update and health
  code; Nerd's guide, working principles, scaffold, manifest, test selection and
  record, deployment, status, timing, machine configuration and board code.
- Two local, synthetic probes against Keel, described below. No real project
  was adopted, deployed or changed. No cloud resources or sessions were started.
- Nerd's tests were inspected, not executed: Go is unavailable on this machine.
  Cloud Run, systemd, device access and a combined live workflow remain untested.

The earlier conversation's v0.2.0 description is no longer current. In
particular, Keel now ships its nightly runtime into each project; projects do
not fetch the mothership or require a Keel token to run their nightly checks.
Updates go out from the mothership through `keel fleet update`.
See [Keel's current design](https://github.com/dalmaer/keel/blob/d6c0b6a6df436c987e7e61597f04276fdb009730/docs/design.md).

## Overlap and differences

| Concern | Keel today | Nerd today | Combined ownership |
| --- | --- | --- | --- |
| Starting a project | Local/GitHub init; adopt existing work; install practice | GitHub/local repo, `nerd.toml`, Claude instructions, optional cloud placeholder and domain reservation | One creator per request; the other attaches |
| Working instructions | Versioned practices, AGENTS blocks, thin skill doorway, shipped CLI guide | Embedded `practices.md` and `nerd guide`; scaffold tells Claude to read it | Keel distributes workflow rules; Nerd documents operational commands and its owner's engineering principles |
| Planning and completion | Goals, phases, dependencies, evidence, generated roadmap, conductor | Idea document; no corresponding phase/evidence lifecycle in the inspected tree | Keel |
| Tests | Names and runs the project's gate; independent conductor verification | Changed-file selection, declared coverage, cached passes, limits, process cleanup, per-part results and timing | Nerd executes; Keel defines what proof is sufficient to close work |
| Diagnosis | Practice drift, document lints, health measures, proposed improvements | Host setup, cloud prerequisites, running services/sessions, devices | Keep both; aggregate their different findings |
| Portfolio view | GitHub fleet: adoption/version, CI, health, lessons | Local board: projects, sessions, deployed revision, device availability | Board joins the views without becoming a second state store |
| Learning and rollout | Lessons upstream, central triage, source pins, releases, migrations, fleet update PRs | Working principles embedded in the binary; operational feedback and test history | Keel owns cross-project practice learning and rollout |
| Runtime operations | GitHub Actions night shift, PR queues, optional Loop/Claude/Renovate practices | Cloud Run, domain mapping, secrets, graduation, Firebase, Android and Claude remote-control management | Nerd |
| Portability | Node ≥24, zero runtime dependencies; currently npm-oriented scaffolding and gates | Go 1.26; any application language with a manifest/Dockerfile, but full host setup assumes systemd/tmux and Google Cloud | Preserve both deployment envelopes |

Evidence: [Keel CLI](https://github.com/dalmaer/keel/blob/d6c0b6a6df436c987e7e61597f04276fdb009730/lib/agent-guide.md),
[Nerd guide](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/nerd/guide.md),
[Nerd architecture](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/README.md).

There is substantial philosophical agreement: ask the authoritative system
instead of maintaining a duplicate, give agents machine-readable commands,
ship instructions with the tool, measure slow work, and keep human decisions
explicit. Nerd's working principles explicitly say Nerd does not enforce
them. Keel supplies enforcement and distribution mechanisms that could help
carry selected principles across projects. That does not authorize changing
Nerd's owner-controlled principles automatically.

## Concrete incompatibilities to solve

### 1. Initialization cannot simply run both init commands

`nerd new` refuses an existing directory; `keel init` is for an empty project.
Nerd defaults to creating a private GitHub repository and reserving a cloud
address. Even `--local` does not disable address reservation: `--no-reserve`
is a separate flag. A wrapper must distinguish local preparation, repo creation
and cloud provisioning, and resume after partial success without creating a
second repo or service.

The starting route for a Nerd-hosted experiment should be Nerd creation followed
by Keel attachment, with a profile that seeds the missing planning files. Plain
`keel adopt` alone does not currently provide that complete experience.
For an existing Keel project, an attachment operation should add Nerd's
manifest/instructions without recreating its repo. This operation is proposed,
not a current Nerd command.

Source: [Nerd new and scaffold](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/nerd/new.go).

### 2. Instructions need one owner per file

Nerd seeds substantive `CLAUDE.md`; Keel manages that file as a pointer to
`AGENTS.md`. A local probe with a synthetic Acme repo containing `nerd.toml`,
a Nerd-style `CLAUDE.md` and `.gitignore` ran:

```sh
node bin/keel.mjs adopt <temporary-acme-repo> --dry-run --json
```

Observed: exit 0, `written: []`, `agents-md` local because CLAUDE.md differs,
lessons local because AGENTS.md is absent, phases/conduct off, base off because
there is no package.json, and night off through its dependency on base. This
was a manually constructed minimal scaffold, not an executed `nerd new`.

Resolution: preserve the project's instructions, move the Nerd doorway into a
bounded AGENTS section, and make CLAUDE.md the shared pointer. Keep the wording
of Nerd commands in Nerd's guide. Do not copy its whole guide into Keel templates.

Sources: [Keel adoption](https://github.com/dalmaer/keel/blob/d6c0b6a6df436c987e7e61597f04276fdb009730/lib/adopt.mjs),
[agents-md ownership](https://github.com/dalmaer/keel/blob/d6c0b6a6df436c987e7e61597f04276fdb009730/practices/agents-md/practice.json).

### 3. Test selection is not completion evidence

Nerd's default test command selects tests for changes since HEAD and reuses
eligible passes for up to a day. Named tests and `nerd test all` run afresh.
Deploy selects tests against the live revision and runs deploy-marked tests;
on a first/uncomparable deploy it runs all tests. Uncovered changes are reported,
not automatically failed by `Tests.Passed()`.

This is useful for builders. A conductor closing a phase needs an uncached full
verification on the integrated tree, plus the phase's particular proof. Use
`nerd test all --json` for that role, with explicit expected suites and coverage
policy. Do not substitute `nerd test --check`, a cached pass, or default
changed-file selection for the full gate.

There is also a result-format gap. Keel's health gate counts Node/TAP summary
lines. An exit-zero command that emitted synthetic JSON
`{"tests":[],"uncovered":["src/new.js"]}` was classified by the actual Keel
gate measure as `value: 0`, `tests: null`, `empty: false`, with detail
"no node test summary". This demonstrates a Keel parser limitation; it is
not a claim that Nerd's no-tests configuration itself exits zero.

Add a structured gate adapter that distinguishes executed, cached, skipped,
failed, timed-out and unknown results; rejects missing expected suites; and
records revision, dirty-tree state, command, duration and evidence. Include
lockfiles, test runners and generated inputs in coverage declarations. Make
uncovered production changes actionable according to project policy.

Avoid recursion: if Keel's gate invokes Nerd, Nerd's test manifest must name
leaf test commands, not a script that invokes Keel's gate again.

Sources: [Nerd test model](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/nerd/test.go),
[pass history](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/nerd/record.go),
[Keel gate measure](https://github.com/dalmaer/keel/blob/d6c0b6a6df436c987e7e61597f04276fdb009730/practices/night/files/scripts/keel/improve.mjs).

### 4. Host configuration must not become a CI requirement

Nerd's CLI opens its machine configuration before `test`, even though executing
project tests need not use cloud credentials. That configuration currently
requires code root, lab project and lab domain. Installing the binary in GitHub
Actions alone is therefore insufficient.

Prefer separating Nerd's test runner configuration from cloud/session setup.
Until then, retain portable leaf test commands in CI and use Nerd on its
configured host; check that both execute the same declared suites. Keep Keel's
nightly independent of an online Nerd host or Keel mothership.

Sources: [Nerd command dispatch](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/main.go),
[machine configuration](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/config/machine.go).

### 5. Permission and completion meanings differ

Both tools use exit 3 for human involvement, but the next action differs.
Keel often accepts `--yes` for an outward action. Nerd reserves server control,
trust prompts, deletion and IAM grants for a person through its supported
interfaces. An adapter must relay the reason, not translate every exit 3 into
an automatic retry with consent flags. The board's authenticated human routes
must not become an agent bypass.

Nerd deploys the working directory, including uncommitted changes, and records
dirty state. Keel completion evidence should identify the actual deployed
revision and dirty flag; a successful deployment is neither proof of a clean
commit nor proof that the phase is lived-in.

Sources: [Nerd deploy](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/nerd/deploy.go),
[board boundary](https://github.com/dglazkov/nerd/blob/bb930807921f13396d20e2efae78f79dcafc568d/internal/web/web.go).

## How one running system would work

1. A person chooses a project and authorizes the resources it needs. One entry
   point creates it once and attaches both configurations.
2. Keel supplies the goal, phase and proof contract. Nerd's board displays that
   next to sessions, live URL/revision and device readiness.
3. The person starts the Claude server through Nerd. Within an authorized
   coding session, Keel's conductor briefs builders. These are different
   responsibilities; installing a conductor does not grant server control.
4. Builders use Nerd's focused tests and timing feedback. The conductor runs
   the full gate once and independently verifies the named journey.
5. When deployment is authorized, Nerd builds, deploys and smoke-tests. A
   portable summary becomes Keel evidence, with its revision and provenance.
6. Repo-local Keel nightlies measure practice health and maintain PR queues.
   Nerd continues supervising the host's sessions and exposing runtime state.
7. Nerd observations can motivate Keel lessons: e.g. repeated test timeouts
   become a lesson with a demonstrated guard. Keep raw transcripts, secrets
   and host-specific paths local; send a reviewed summary.
8. Keel distributes approved practice changes by migration/update PR. Nerd's
   binary releases remain independent; the bridge checks compatible versions.

Keep `.keel/keel.json` for practice policy, `nerd.toml` for execution/deployment,
and Nerd's machine config for host facts. Join records by repository identity
plus checkout/host and revision, not folder name alone. Keel's fleet can include
repos absent from this machine; Nerd can see local projects with no GitHub
remote. The board should show these as partial records, not silently omit them.

For the board, start with read-only Keel JSON summaries and timestamps. It must
not execute `keel improve` on every refresh: that command runs the project's
gate. Read its last health artifact and show age or "unavailable" instead.
Nerd remains authoritative for live operations, Keel files for goals/status,
GitHub for CI and PRs. A timeout is unknown, never healthy.

## Whether to merge

| Option | Assessment |
| --- | --- |
| Keep entirely unrelated | Lowest immediate effort, but preserves competing instructions and loses the useful connection between runtime observations and lessons |
| Separate tools, shared adapter and experience | **Recommended.** Delivers one workflow while retaining Keel without Nerd and Nerd without Keel |
| One repository with separate Go/Node packages | Possible later if most changes become coordinated; little immediate benefit and a larger combined test/release burden |
| One mandatory binary/runtime | Poor fit now: would tie portable repo practice to Nerd's host/cloud stack, or require rewriting useful working code |

Both repositories declare Apache-2.0, which makes source sharing practical with
attribution/license obligations retained. That is not a reason by itself to
combine them. The decisive question is whether users need both for most tasks;
today the implementations answer different questions and can remain useful
independently.

## Smallest convincing pilot

Use one disposable, explicitly authorized Node web project on an existing
Nerd Linux host first. This avoids making Go/Python adoption, platform
portability and cloud bootstrap prerequisites for proving the combination.

1. Implement the instruction/profile attachment and structured test adapter.
   Prove repeated attachment changes nothing, preserves local edits and creates
   no second repo. Prove a failing, missing, cached-only or timed-out suite
   cannot close a phase; avoid recursive gates.
2. Conduct one real phase using focused builder tests and one integrated full
   check. Capture a deployment receipt and the actual human journey outcome.
3. Add the read-only board view. Disconnect either tool/host and confirm the
   other still works, displaying missing information honestly. Preserve all
   human-only operations.
4. Send one reviewed operational lesson home, accept a resulting practice
   change, and deliver it back by an update PR without losing `nerd.toml` or
   project-owned instructions. Verify failed updates leave the project intact.

Measure setup steps, time to first verified deployment, repeated full-suite
work, ambiguous status/approval prompts and whether the lesson round trip
required copying by hand. Expand to a non-Node project next; Keel's current
`base`/npm coupling needs an explicit capability-based adoption design.

Only reconsider a repository merger after this pilot shows that most ongoing
changes require coordinated releases. The immediate opportunity is one
coherent experience, not one codebase.
