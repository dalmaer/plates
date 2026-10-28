---
status: built
since: 2026-10-27
goal: G0
spec: 2
depends: []
note: "Low/Medium/High project intent is explicit in CLI, briefs and Home; host permission control remains unavailable."
evidence: ["evidence/2026-10-27-scoped-risk-tolerance.md"]
---

# Select project risk tolerance without inventing permission

## Done when

An owner can inspect and explicitly select Low, Medium or High project risk tolerance, see its exact action scope in supported briefs and Project Home, and understand which authority still needs verification.

## Scope

One repository-bound collaboration preference. Low preserves existing behavior;
Medium covers routine authorized edits/tests; High adds selected push branches
or bounded task namespaces and independently selected exact merge bases.
Existing stored default/local/delivery modes retain their meaning. Host consent,
platform configuration, budgets and deployment/security authority are outside
this slice. The bounded diagnostics integration preserves existing climb admission.

## Acceptance

- [x] Level aliases preserve policy digests, reject ambiguous input, and require current preview confirmation: `tests/autonomy.test.mjs`.
- [x] Missing or forged provenance, stale digests, unknown/denied gates, repository/branch mismatches and unavailable protection evidence cannot grant authority: `tests/autonomy.test.mjs`.
- [x] Project Home distinguishes source declarations from host permission, validates cached scopes and presents all levels; generic startup and decision briefs carry only unverified intent: `tests/web-autonomy.test.mjs`, `tests/decision-context.test.mjs`, `tests/cli.test.mjs`.
- [x] The explicitly authorized Plates-only High selection is written through normal preview/digest confirmation and read back; no global or managed-project preference is selected: `node bin/plates.mjs autonomy --json`.
- [x] Failed gate diagnostics are bounded and redacted, malformed redaction configuration withholds text without losing exit status, and new code cannot acquire hosted retry authority by repinning: `tests/gate-diagnostics.test.mjs`, `tests/web-night-retry.test.mjs`.

- [x] One versioned renderer supplies interactive, Climb/Tend, Robot resume/review, cross-review and mention contexts with role limits and source identity: `tests/autonomy-context.test.mjs`, `tests/robot-runtime.test.mjs`, `tests/cross-review.test.mjs`.

## Real surfaces

- owner's machine: preview, apply and inspect the actual Plates setting; confirm repository, namespace and exact merge scope. Inspect Project Home through an approved localhost browser with synthetic source records; labels and unavailable host controls are visible. Run the required full gate and typecheck on the final integrated candidate.
- GitHub API: verify repository identity, current protection evidence, remote source setting and authorized merge readback; inspect the installed source setting locally after publication. Publication is not implied by this built record.

## Proof

`npm run check:focused -- tests/autonomy.test.mjs tests/autonomy-context.test.mjs tests/robot-runtime.test.mjs tests/cross-review.test.mjs tests/web-autonomy.test.mjs tests/web-projects.test.mjs tests/gate-diagnostics.test.mjs tests/web-night-retry.test.mjs tests/decision-context.test.mjs`

`npm run check`; `npm run typecheck`; `node bin/plates.mjs autonomy --json`.

The final full gate runs after the evidence record is written, before publication;
its exact revision and result belong in the validation/commit evidence, not an
invented result here.

## Deliberately open

No connected provider API supplies trusted current action permissions and scoped
host consent. This implementation cannot promise fewer Codex/Claude host dialogs.
Shared guidance reaches interactive and scheduled model briefs; deterministic hosted web workers retain their existing gates. No measured approval
reduction, cost reduction, reusable timing result or lived-in claim is made.
Evaluation outcomes remain governed by their own phase records; this feature
does not implement or relabel that separate work.

## Next action

None for this bounded setting slice. Obtain separate evidence before claiming
host integration or repeated real-world benefit.
