# Capture work and adjudicate its outcome

> Source: existing Plates agent-quality branch `9f8c17ad`, selectively integrated.
> This consolidation CLI exposes passive quality workflows only. The execution
> adapter and `retro quality run` examples below remain dormant source capabilities;
> they are not exposed by this CLI and have not been activated here.


Use the existing private evaluation workspace described in the
[agent-quality guide](agent-quality.md). Lifecycle records contain metadata and
evidence hashes, not task text, prompts, command output or transcripts. They do
not run an agent, purchase tokens, change routing or grant access.

From a source checkout, `plates retro quality lifecycle --record <file>` previews
one event. Supply the same private file and its preview digest to apply it:

```sh
node bin/plates.mjs retro quality lifecycle --record /absolute/private-inputs/event.json --manifest /absolute/private-inputs/workspace.json --state /absolute/private-state --json
node bin/plates.mjs retro quality lifecycle --record /absolute/private-inputs/event.json --manifest /absolute/private-inputs/workspace.json --state /absolute/private-state --yes --digest DIGEST_FROM_PREVIEW --json
```

Preview exits 3 and writes nothing. Successful recording exits 0. Preserve the
file and its event ID for an uncertain retry: identical input recovers the
original receipt; changed input under that ID refuses. Each subsequent observation
has a new ID. The collector serializes writes with the existing session ledger.

## Record the passport before assignment

This JavaScript produces a minimal event. Run it from the source checkout,
after creating a private input directory outside Git. Replace the Acme identity
with an explicitly authorized project and a stable task ID. Classify the task
from its brief and starting snapshot before assigning work. Missing labels stay
null; a name or version should never be guessed.

```js
import { writeFileSync } from 'node:fs';
import { emptyQualityPassport } from './lib/agent-quality-lifecycle.mjs';

const event = {
  schemaVersion: 1,
  id: 'acme-task-begin',
  action: 'begin',
  episodeId: 'acme-task',
  project: 'Acme/widget',
  at: new Date().toISOString(),
  payload: {
    links: ['Acme/widget#12'],
    workflow: null,
    passport: emptyQualityPassport(),
    alreadyStarted: false,
  },
};
writeFileSync('/absolute/private-inputs/event.json', JSON.stringify(event, null, 2),
  { mode: 0o600, flag: 'wx' });
```

The passport keys are `family`, `specialty`, `difficulty`, `risk`, `baseCommit`,
`acceptanceDigest`, `contextDigest`, `workflowDigest` and `stratum`.
Difficulty is five integers from 0 to 2: ambiguity, domain novelty, coupling,
setup and verification burden. Risk is separate. The workflow digest identifies
the intended configuration before outcomes, including roles that might never
run after an early failure. Hash real frozen inputs; a hash does not independently
verify their truth. See the [rubric and privacy contract](../specs/agent-quality.md).

For work already underway, use `alreadyStarted: true`. An old begin event also
remains retrospective. Its first actual stage start records when assigned work
was first observed; this does not reconstruct its original start time. Earlier
attempts, costs and human work remain unknown. Retrospective labels cannot become
prospective through annotation, and missing prospective labels cannot be filled
after seeing outcomes. Such episodes can inform observed workload summaries but
remain outside prospective comparisons.

When a PR is created after the task began, append its mapping with a fresh
`link` event. For example, use `action: 'link'` and
`payload: {links: ['Acme/widget#12']}` in the same event envelope. This is allowed
for prospective tasks and leaves their frozen passport and assignment unchanged.
Links are unique restricted issue/PR references or `git:` commit references;
arbitrary URLs and query strings refuse. Existing mappings cannot be removed or
silently replaced. The review observer requires the exact project/PR reference
before attaching review metadata to the episode.

## Start and finish each stage

Every event uses the same envelope shown above, a new ID and a current `at`.
Replace `action` and `payload` with the following shapes. Stages are `planning`,
`coding`, `review` and `iteration`.

```js
// action: 'start'
const payload = {
  attemptId: 'acme-coding-1',
  parentId: null,
  stage: 'coding',
  agent: null,
  inputCheckpointDigest: null,
  experiment: null,
};
```

`agent: null` means identity is unknown. When a provider is observed, a partial
object such as `{provider: 'Acme', model: null}` retains the provider without
inventing a model. The API fills absent agent build, prompt, skill, tool,
permission, runtime, dependency, harness, context and settings hashes with null.

Review and iteration starts require `inputCheckpointDigest` from an earlier
recorded attempt in the same episode. It identifies exactly what was reviewed or
revised. Use `parentId` for retries or subsequent attempts. A failed attempt
remains in the episode when a retry succeeds.

```js
// action: 'finish'; checkpoint is the SHA-256 of the actual frozen artifact,
// or null when artifact evidence is unavailable.
const payload = {
  attemptId: 'acme-coding-1',
  status: 'completed',
  checkpointDigest: checkpoint,
  resources: {},
  interventions: [],
};
```

Finish records the observed result: `completed`, `failed`, `timeout`, `blocked`,
`skipped`, `denied`, `aborted` or `unknown`. Completion of a process is not product
acceptance. Capture the actual frozen artifact before later review or changes.
The local command observer can hash an explicitly selected inventory and record
the process outcome; see the main guide for its separate command preview.

Unknown usage remains null. When known, resources may include `currencyUsd`,
`currencySource` (`actual`, `estimate` or `unknown`), `estimateBasis`, `priceDate`,
`tokens`, `cachedTokens`, `activeHumanMinutes` and `wallMs`. Estimates require a
dated price basis hash; actual currency values are attributed declarations,
not automatic billing verification. Human interventions contain only `type`,
`activeMinutes` and `at`; types are `specification`, `correction`, `rescue`,
`adjudication` or `repair`.

A running observation may become unknown and then terminal. Refinement fills
unknown fields while preserving known identity, order and usage. Terminal records
are immutable; missing terminal provenance or charges remain historical gaps.
An original command receipt can be reconciled later without running the command
again: the observer validates that receipt, keeps `event.at` current, and supplies
its original `payload.endedAt` and measured `resources.wallMs`. End time must lie
between the recorded start and current observation. Reconciliation does not grant
permission to redispatch an uncertain command.

## Work the pending queue

```sh
node bin/plates.mjs retro quality pending --manifest /absolute/private-inputs/workspace.json --state /absolute/private-state --json
```

The queue is the same projection exposed by reports. It distinguishes actionable
human judgments and due follow-up from running work and irrecoverable historical
gaps. Read each item's reason and required evidence. A retrospective `annotate`
event can supply classification fields with payload `{passport: {...}}`; it
cannot rewrite timing into a preassignment observation.

For a completed checkpoint, an evaluator inspects the actual acceptance contract,
artifact and evidence. An `adjudicate` event carries an `evaluation` object:

```js
// checkpointEvidence contains hashes of evidence the evaluator actually read.
const payload = { evaluation: {
  id: 'acme-human-review-1',
  attemptId: 'acme-coding-1',
  stage: 'coding',
  evaluator: 'acme-human-evaluator',
  authority: 'human',
  independent: true,
  blinded: false,
  rubricVersion: 'quality-v1',
  quality: null,
  proportionality: null,
  proportionalityEvidence: null,
  acceptance: 'unknown',
  evidence: checkpointEvidence,
  findings: [],
} };
```

Replace unknowns only with actual judgments. `quality` and `proportionality` use
the documented 0–3 rubric. A proportionality score also requires evidence hashes
for the requirement or risk, simpler alternative, maintenance cost and test
burden, plus booleans indicating serious risk and required safeguards. Rare
security or data-loss controls do not become unnecessary merely through rarity.

Use `authority: 'model'` for model advice. It remains distinct from independent
human adjudication and cannot establish verified acceptance by itself. Evaluator
identity, independence and blinding are recorded declarations, not authentication.
Conflicting human judgments remain disputed and unknown; adding a third vote does
not resolve them. A calibrated dispute-resolution workflow remains pending.

For delayed outcomes, a `followup` event contains `observation` with `days` (7 or
30), `usedAt`, `observedAt`, `exposure`, `regressions`, `repairMinutes` and
`evidence`. Record actual first use and observations, leaving unknown values null.
An immature window or zero observed exposure is not proof of reliability.
