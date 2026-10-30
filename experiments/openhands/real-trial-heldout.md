# Evaluator-only Task B: lesson-copy receipt authorization

Prepared 2026-10-30 for the parent-selected Gas City/OpenHands comparison. Keep this file, `real-task-b-sealed.md`, the combined specification and evaluator inaccessible to Task A's worker.

Task B is the existing private lesson-copy operation receipt race: source-project access is removed during the migration receipt read while workspace membership remains. Both API and HTML can disclose the original committed migration receipt. This is the legacy migration receipt route, not the newer private-learning service.

The worker prompt is extracted verbatim from task-3's launch specification into `real-task-b-sealed.md`, SHA-256 `1bbe8952505b1abee7adcb70b933b7fd4ec81c95bee79935ce241bc856f2e857`. Use the same prompt, model and bounds in control/treatment; add only the exact reviewed lesson to treatment. Existing affected tests: `tests/web-migration.test.mjs`. Frozen helper policy is identical to Task A.

Both OpenHands arms start independently from clean consolidation `037e13b4f78c061405cef899b528badb536584ad`: `../openhands-real-trial-prepared/followup-control` and `../openhands-real-trial-prepared/followup-lesson`. Do not transfer Task A's patch, even if a broad fix would improve both routes. Transfer only an independently reviewed lesson with exact digest and scope, or retain explicit rejected/no-useful-lesson status.

```sh
node experiments/openhands/real-receipt-evaluator.mjs /absolute/path/to/followup-control task-b
node experiments/openhands/real-receipt-evaluator.mjs /absolute/path/to/followup-lesson task-b
```

Only run candidate evaluation inside the parent's containment. The untouched-baseline subprocess evaluations each exited 1: 4/7 cases pass, 3 fail. Mid-read access loss discloses the API/HTML receipt; unknown-operation HTML falls back to a receipt-unavailable page instead of refusing authorization. Authorized and pre-read-denied controls pass. Workspace membership remains present and no GET adds fixture writes. Both worktrees were clean before and after. Reports and SHA-256 digests are retained in `real-receipt-baseline-followup-control.json`, `real-receipt-baseline-followup-lesson.json`, and `real-receipt-baseline-manifest.json`.

The exact frozen evaluator covers project-access removal, permitted repeated recovery and the unknown-operation HTML denial distinction. It does not separately exercise mid-read session revocation; the source candidate note proposes that variant, but the frozen evaluator does not implement it. Do not claim coverage that has not run.

Report actual lesson retrieval, authorized/denied behavior, unchanged write counts, patch/review outcomes, wall time and measured usage across both arms. A neutral or harmful lesson remains a valid result. One small pair does not establish general learning efficacy. All model/auth execution remains pending explicit scope and account/budget approval.
