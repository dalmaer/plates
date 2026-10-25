# Finite environment compatibility gap audit — 2026-10-24

Historical source `47f3043948260d764b83bc5ff83d8bef6f5e308f`; rename `a9e6600bb222040ac71f55c4873f8de9e3e3d7d3`. Names/source locations only; no live values.

| Group | Exact historical suffixes (KEEL_ → PLATES_) | Recommendation |
|---|---|---|
| Ordinary additions | `MILESTONES_OFFLINE`, `CANVAS_PERSISTENCE`, `CANVAS_RECOVERY`, `CANVAS_OUTPUT`, `ISOCAN`, `CI_OFFLINE`, `FLEET_PRACTICE`, `NPM`, `GIT`, `CLAUDE_DIR`, `PROVE_MUTANT_MS`, `PROVE_IGNORED_BYTES`, `REVIEW_POLL_MS`, `CACHE`, `PREVIOUS_PRACTICES`, `SELF_UPDATED`, `CLIMB_CLOCK`, `CLI`, `NOW`, `STITCH`, `DRAIN_WAIT_MS`, `QUOTA_FLOOR`, `STALLS_SHAPE` | 23 explicit variable rows; current presence wins, retain consumer validation |
| Claim identity | `PROVIDER`, `SESSION`, `MACHINE` | 3 explicit identity rows; conflict refusal, preserve owner/token/session semantics |
| Gate/ledger identity | `RUN_START`, `GATE_INVOCATION`, `USUAL`, `GATE_ACTIVE`, `SUITE_PLAN` | 5 explicit internal rows; validate original invocation, scrub both families before forwarding |
| Publisher source pin | `PUBLISHER` | 1 explicit identity row; keep source digest validation, no generic alias copying |
| Already mapped ordinary | `GH`, `AGENT_GIT`, `CANVAS_ISOCAN_HOME`, `CANVAS_ISOCAN_VERSION`, `CANVAS_KEEL_VERSION` | retain five existing rows (CANVAS_KEEL_VERSION maps to CANVAS_PLATES_VERSION) |
| Hosted config/auth | `WEB_CONFIG`, `GITHUB_CLIENT_SECRET`, `SESSION_ENCRYPTION_KEY` | retain existing phase127 conflict readers; no ordinary helper |
| Internal transport auth | `ROBOT_FETCH_AUTH` | internally generated/consumed header; no external compatibility row |
| Non-env matches | `MADE`, `ONLY`, `ANSWER`, `LOOP_YML`, `BODY`, `EOF_` | constants/heredoc delimiters; exclude |

## Ordinary rows settled for phase 128

- `variable:KEEL_MILESTONES_OFFLINE`
- `variable:KEEL_CANVAS_PERSISTENCE`
- `variable:KEEL_CANVAS_RECOVERY`
- `variable:KEEL_CANVAS_OUTPUT`
- `variable:KEEL_ISOCAN`
- `variable:KEEL_CI_OFFLINE`
- `variable:KEEL_FLEET_PRACTICE`
- `variable:KEEL_NPM`
- `variable:KEEL_GIT`
- `variable:KEEL_CLAUDE_DIR`
- `variable:KEEL_PROVE_MUTANT_MS`
- `variable:KEEL_PROVE_IGNORED_BYTES`
- `variable:KEEL_REVIEW_POLL_MS`
- `variable:KEEL_CACHE`
- `variable:KEEL_PREVIOUS_PRACTICES`
- `variable:KEEL_SELF_UPDATED`
- `variable:KEEL_CLIMB_CLOCK`
- `variable:KEEL_CLI`
- `variable:KEEL_NOW`
- `variable:KEEL_STITCH`
- `variable:KEEL_DRAIN_WAIT_MS`
- `variable:KEEL_QUOTA_FLOOR`
- `variable:KEEL_STALLS_SHAPE`

## Current names absent from historical inventory

- `PLATES_CLIMB_AGENT_SECONDS`: new-post-rename-control-no-invented-alias
- `PLATES_CLIMB_BASELINE_ENDED`: new-post-rename-control-no-invented-alias
- `PLATES_CLIMB_BASELINE_STARTED`: new-post-rename-control-no-invented-alias
- `PLATES_CLIMB_JUDGE_STARTED`: new-post-rename-control-no-invented-alias
- `PLATES_CLIMB_STARTED`: new-post-rename-control-no-invented-alias
- `PLATES_HOSTED_RUNTIME_EXCEPTION`: new-post-rename-control-no-invented-alias
- `PLATES_NAMES_EVIDENCE_REPOSITORY_ID`: new-post-rename-control-no-invented-alias
- `PLATES_NIGHT_CANONICAL`: not-environment-binding
- `PLATES_NIGHT_RECOVERY`: new-post-rename-control-no-invented-alias
- `PLATES_PR_DIFF`: not-environment-binding
- `PLATES_PR_PROMPT`: not-environment-binding
- `PLATES_WEB_OPERATION`: new-post-rename-control-no-invented-alias
- `PLATES_WEB_ORIGIN`: later source-backed hosted/provider binding with explicit `KEEL_WEB_ORIGIN` compatibility; not an inferred ordinary alias

## Limits and behavior

- Ordinary selector must use current presence, not truthiness; invalid/empty current never falls through to legacy. Validate existing consumer type/path/range before use.
- Cache override compatibility is distinct from the default cache directory changing from keel to plates; no implicit cache relocation proposed.
- Canvas recovery selection must preserve original journal/output identities, not infer a new operation from a selected alias.
- Claim provider/session/machine require explicit conflict policy; hosted web alias conflict semantics remain unchanged.
- Do not treat publisher SHA pin as a secret or generic ordinary override.
- Dynamic/indirect bindings beyond named inventory and selected YAML are not claimed covered.
- All original proof coverage is for mapped rows only; these additions require new literal both-direction consumer tests.

The conductor settled the source policies in the final finite-environment section of [the name-transition spec](../specs/name-transition.md). This audit is provenance and scope, not a second runtime alias table. Implementation and new two-direction consumer proofs remain phase-128 work. The original detailed location inventory is retained with the private phase evidence; no live environment values were inspected for this audit.

## Provider scope

Process aliases do not establish GitHub repository-variable or secret migration scope. Each JSON row now lists exact static provider references, if any. No reference means scope is not established, not that custom settings cannot exist. Dynamic/custom bindings remain a gap.

- `variable:PLATES_WEB_ORIGIN` — `.github/workflows/typecheck.yml:55`
- `variable:KEEL_WEB_ORIGIN` — `.github/workflows/typecheck.yml:55`
- `variable:KEEL_WEB_ORIGIN` — `.github/workflows/web-update.yml:42`
- `variable:KEEL_WEB_ORIGIN` — `lib/web/job-workflow.mjs:3`
- `variable:PLATES_WEB_ORIGIN` — `lib/web/job-workflow.mjs:7`
- `variable:KEEL_WEB_ORIGIN` — `lib/web/job-workflow.mjs:7`
- `variable:KEEL_WEB_ORIGIN` — `lib/web/update-workflow.mjs:47`

Only source-backed provider names may enter a provider-specific preview; process rows never expand it automatically. No values read and no settings changed.
