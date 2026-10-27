# Evidence: 132 — explicit project risk tolerance

- Date: 2026-10-27.
- Phase: 132.
- Revision: validated integration `663de66692ff0b67f624972681ef80455491446a`, then merge of published `900b488342a3c7b6ba928456001462c1d8899f79` and the Low/Medium/High working-tree extension.
- Claim: the project preference is selectable, scoped and visible; it does not grant host permission.

## Automated checks

On the level extension, `npm run check:focused -- tests/autonomy.test.mjs tests/web-autonomy.test.mjs tests/web-projects.test.mjs tests/gate-diagnostics.test.mjs tests/web-night-retry.test.mjs tests/decision-context.test.mjs` exited 0: 217 tests passed, zero failed, followed by roadmap/render/inbox/whitespace checks. `npm run typecheck` exited 0. The capability audit passed with 169 reviewed sources, 49 entries and 23 installed entrypoints.

The preceding integrated head `663de666` passed `npm run check`: 3,732 tests passed, zero failed, four opt-in real-Docker trials skipped, plus the roadmap/render/inbox guards. That is historical evidence, not a full-gate claim for the later level extension. The final candidate still requires its own `npm run check` before publication; local heavy validation is coordinated with the Ledger publication task. Record the final exact head and result in commit/PR validation evidence.

Independent review found and resolved malformed optional redaction settings losing a gate outcome. `plates prove tests/gate-diagnostics.test.mjs --name 'malformed redaction config' --fix practices/night/files/scripts/plates/test-ledger.mjs --fix scripts/plates/test-ledger.mjs --base 021cc845 --trailer` returned VERIFIED. Historical retry fixture repair also returned VERIFIED; production authority pins remain unchanged and current ledger repinning is explicitly refused.

## Observed selection and interface

The owner explicitly requested High for Plates. The repository was verified as `dalmaer/plates`, default branch `main`. Read-only GitHub branch/rules inspection observed main at `900b488342a3c7b6ba928456001462c1d8899f79`, protection disabled and no effective rules returned on this date. These observations are not reusable permission evidence for a future action; protections and rules must be checked again.

The actual selection used `node bin/plates.mjs autonomy --level high --push-prefix codex/ --push-prefix claude/ --push-prefix work/ --merge main --json`, followed by the same arguments and the returned `--yes --digest`. Readback confirmed `.plates/autonomy.json` contains only the Plates repository binding, legacy-compatible delivery mode, no exact push branches, those three namespaces, and exact merge base main. Policy digest: `ef9af11932b6ce11ba3cb73f0120900660daf3e8d2f63b07c608bac37af0dead`. Effective authority remains `requires-current-context`.

An approved localhost browser preview with synthetic Acme source records visibly showed High, the six action scopes, Low/Medium/High definitions, expandable CLI examples and unavailable host controls. It establishes appearance of the implemented renderer, not live hosted rollout or authenticated owner provenance.

## Gaps and decision

Built describes the bounded CLI, brief and source-view setting, not publication,
host approval control, provider enforcement or lived-in benefit. Required final
candidate validation and remote/installed readback precede publication completion.
No global policy, credentials, security settings, budgets, unrelated managed
projects or assistant rules were changed by selection. No reusable timing claim
is supported: retained busy observations are not comparable performance evidence.
The distinct evaluation outcomes in phases 119–121 remain designed and untouched.
