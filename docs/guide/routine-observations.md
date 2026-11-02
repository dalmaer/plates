# Routine observations and full lifecycle usage

Use the existing board locally, and Routines / Activity for authorized web history.
Local inspection reads only explicit sources. No host transport is activated by
these commands; hosted local observations remain unavailable until a separately
authenticated transport supplies current project-scoped metadata.

```sh
plates routines inspect --registry /absolute/inputs/routines.json --json
plates routines usage --manifest /absolute/inputs/workspace.json --state /absolute/private-state --project acme/widget --pr 102:7 --json
plates board --observations /absolute/inputs/board-observations.json
```

Inspection never changes source files or starts a routine. The registry is a
regular JSON file, at most 256 KiB, with no symbolic link. All source paths are
absolute and explicitly selected; no home-directory scan occurs. A minimal
declared-source registry looks like:

```json
{"version":1,"workspaceId":"acme","actorId":"alice","sources":[{"id":"acme-declared","kind":"declared","label":"Acme checks","scope":{"projectId":"widget","hostId":"acme-laptop","accountId":"acme-local"},"file":"/absolute/inputs/declared.json"}]}
```

Every source has those common fields. Type-specific fields are:

| Kind | Explicit fields |
| --- | --- |
| `launchd` | `dir`, numeric `uid`, `prefixes` |
| `claude-desktop` | `root`: one account/organization directory containing scheduled-tasks.json |
| `codex` | `dbPath`, `statePath`, `rolloutRoot` |
| `vercel` or `declared` | `file` |
| `switchboard` | `dir`, `runFile` |
| `github-actions` | `project` with `id`, numeric `repoId`, `repo` |

GitHub collection requires an explicitly injected authorized reader and otherwise
reports unavailable. Registry identity is local attribution, never authenticated
account ownership, shared access, or quota eligibility. Unsupported versions,
stale observations and partial reads produce gaps. Configured labels and hashed
identities replace private source titles, prompts, account IDs and paths.

The board binding contains exactly these fields (either registry or usage may be
null; at least one is required):

```json
{"version":1,"registry":"/absolute/inputs/routines.json","usage":{"manifest":"/absolute/inputs/workspace.json","state":"/absolute/private-state","projects":["acme/widget"],"pr":{"repositoryId":102,"number":7},"actorId":null,"shared":true}}
```

Paths and local actor selection are fixed at startup; a browser URL cannot
change them. The board's existing loopback and token protections apply. Its JSON
and HTML both use the same sanitized projection. No new runner controls appear.

Usage reads the existing initialized [agent-quality ledger](agent-quality.md).
The report follows recorded planning, implementation, review, retries, failed
and abandoned attempts across the full task or PR lifecycle. Activity's date
filter and provider pagination do not limit that ledger query. Observed local
attempt rows follow Activity's date/outcome/routine filters, preserving the
existing active-attempt exception. Undated attempts remain visible with a gap
and separate source/display window context. Every usage summary retains its
project, numeric PR identity where selected, and visibility scope. The existing
routine selector lists provider workflows and receipt kinds; selecting one
excludes unrelated local observations. Selecting an individual native local
routine is a future UI capability. Numeric repository
and PR identity, explicit allocation and coverage prevent double-counting. The
local workspace manifest contains repository names only: a local PR-filtered
report therefore marks the numeric binding unverified and leaves totals unknown.
Add `--verify-repository` to the usage command with `--pr` to make one
bounded authenticated GitHub GET through the existing gh adapter (30-second
timeout, 4 MiB response limit). Both repository name and numeric ID must match;
failed or mismatched verification refuses the report. No caller-supplied binding
file or observation can verify itself. A future authenticated hosted adapter can
also supply trusted numeric repository bindings. Project-level associated
usage remains inspectable without making a PR verification claim;
associated shared work is nonadditive. Missing, private, expired or overlapping
observations leave null totals beside known subtotals. Provider cache/reasoning
counts preserve their subset semantics. Currency amounts distinguish observed
claims from estimates; neither is independently verified billing.

By default only project-shared measurements enter usage reports. Local
`--actor <id>` selects that person's permitted observations; it does not grant
hosted access. The display still omits account/funding identifiers. This accounting
does not estimate subscription quota or pool personal allowances.

To capture a sealed metadata observation for an existing episode:

```sh
plates routines record-usage --manifest /absolute/inputs/workspace.json --state /absolute/private-state --project acme/widget --episode acme-task --record /absolute/inputs/usage.json --json
plates routines record-usage --manifest /absolute/inputs/workspace.json --state /absolute/private-state --project acme/widget --episode acme-task --record /absolute/inputs/usage.json --yes --digest EXACT_PREVIEW_DIGEST --json
```

The first command previews without writing and exits 3. The second requires that
exact digest and appends through the same immutable private ledger; repeating it
recovers the original receipt. The strict version-1 measurement schema and
sealing helper live in `lib/agent-quality-usage-records.mjs`; the
`tests/agent-quality-usage.test.mjs` synthetic fixture shows all fields. It records
attempt, person/funding attribution, provider/model version, hashed request and
session identity, token semantics, cost evidence, PR allocation and visibility.
Raw transcript or prompt fields are rejected. Capture invokes no provider and
never turns a supplied provider label into authenticated billing evidence.

The existing `plates retro quality` metadata and lifecycle commands remain
available as described in the imported guides. The branch's execution adapter is
dormant: arbitrary-command quality execution is not exposed by this CLI.

## Personal agent advice

```sh
plates routines recommend --input /absolute/inputs/recommendation.json --manifest /absolute/inputs/workspace.json --state /absolute/private-state --json
```

This is a read-only explanation of choices for the current task. The command loads
quality history from the same initialized AQ ledger, scopes it to the selected
project, and accepts no quality bundle or authorization from the input file.
Local claims cannot establish authenticated availability: they produce an
unverified, unavailable recommendation with no suggested agent. Unavailable
quality under that authority does not assert that no history exists.

The version-1 input has exactly `version`, `actorId`, `workspaceId`, `projectId`
(the existing plate slug), `repositoryId` (positive numeric identity), `project`
(owner/repository), `policyDigest`, `task`, `candidates`, `observations` and
`preferenceOrder`. The task describes stage, family, specialty, difficulty, risk,
required capabilities and optional provider independence. Candidates describe
provider/model and exact stable agent configuration, claimed account/pool and
connection generation, applicable stages/capabilities, required capacity windows
and expiry. Observations follow the existing capacity contract. The
[synthetic example factory](../../tests/helpers/recommendation-surfaces.mjs) and
[pure contract](../../lib/agent-recommendations.mjs) show every field. Source labels
such as authenticated-reporter are claims; they do not authenticate themselves.

A version-2 board binding preserves the old registry and usage fields and adds a
separate personal recommendation binding. Version 1 still behaves as before:

```json
{"version":2,"registry":null,"usage":null,"recommendation":{"input":"/absolute/inputs/recommendation.json","manifest":"/absolute/inputs/workspace.json","state":"/absolute/private-state"}}
```

The existing local board displays this personal panel separately from historical
consumption. Browser URLs cannot change its files or actor. No personal capacity
is aggregated across sets. The hosted Routines/Activity project view supports a
read-only constructor adapter; it is unavailable by default. Set views link to
plates and never invoke that adapter or duplicate personal pools.

An authenticated adapter must separately attest current actor, workspace,
plate, numeric repository, policy, account ownership, connection generation and
canonical quality evidence. Local files and browser requests cannot supply that
authority. Checks and capacity observations expire within five minutes; reset,
exhaustion, stale/conflicting/unknown observations or lost access prevent an
available choice. Expiry during the source read or final authorization also
suppresses availability before response. These checks neither reserve allowance
nor prove enough allowance for an arbitrary task.

Advice keeps applicable windows separate, explains exact model/build/task/stage
quality cohorts with sample counts and uncertainty, and reports historical cost
and latency as separate observations. Sparse quality is not a winner. Preference
may order available choices, but cannot grant access, switch payer, pool personal
accounts or enable organization funding. There are no execution buttons, new
credentials, enrollment, grants, reservations or active routing in this slice.

## Optional local implementation checkpoint

The consolidation branch now contains additional opt-in service code. These
features remain disabled by default and have not been deployed or activated.

- `hostObservations` and migration 018 provide an observation-only enrollment,
  exact apply/revoke and bounded authenticated report endpoint. Current owner,
  workspace, project and restore checks remain required. Wire reports exclude
  task text, paths, personal account details and quota; an enrolled host is not
  proof of provider state. Existing Routines/Activity consumes the projection.
- `personalFunding` and migration 019 bind explicit personal ownership and
  funding choice to the existing encrypted connection store and model admission.
  Legacy rows are not converted. The supported bounded OpenAI API path requires
  a trusted capacity source; personal subscription execution and organization
  allocation remain unsupported. Set membership never creates extra allowance.
- `lessons` and migration 017 add private originals and exact redacted copies to
  existing Learning. Explicit recipients must already pass existing owner and
  workspace rules and current access to every destination project. A changed
  set cannot widen an earlier copy. Revocation stops future catalogue reads;
  it cannot recall delivered content. Original Git lessons remain unchanged.

The trusted recommendation service composes existing policy, private funding and
canonical AQ readers. Its adapters are startup-owned code, never browser claims.
It validates full workspace or project policies, but the descriptive task profile
cannot establish compliance with model evidence, task bounds, reserve/freshness,
cooldowns and reservations. Checked policy-selection integration is unimplemented:
the service refuses because checked selection context is unavailable, and the
existing HTTP projection reports an unavailable authenticated recommendation.
This is a code integration gap, not a
credential or approval blocker. No available-choice attestation leaves the service;
the standalone descriptive recommendation API is unchanged.
A separate bounded Codex app-server reader implements the offline-inspected
0.164.0 quota protocol and requires an exact authorized process launch. It has
only synthetic process proof here. It neither logs in nor starts an agent, and
missing account identity, model coverage or backend permission stays unavailable.
Current hosted connection descriptors do not support Codex subscriptions, so this
reader is not an activated end-to-end subscription recommendation integration.

The internal authored-policy/import preview API validates explicit snapshots and
returns sanitized descriptors, aliases and gaps. It has no CLI verb or apply
backend yet; even a declared frozen snapshot remains unverified and cannot dispatch.
General routine execution, event/effect adapters and cutover remain unimplemented.
See the [implementation boundary](../research/2026-10-30-plates-orchestration-boundary.md)
before choosing further runtime work or an external orchestrator.
