---
status: partial
owes: walk
since: 2026-11-03
goal: G6
spec: 2
depends: [82]
note: "Built and proven by test against a fake Vercel: a Vercel target reads its rollback target first, deploys the tested commit, checks revision, smoke and errors, and rolls itself back; --back alone returns to the last good deploy; the owner's grant opens exactly plates promote. Owes plates adopting delivery, a real pass and a real rollback, and the owner's grant."
evidence: ["evidence/2026-11-03-deploy-checks-itself.md"]
---

# A deploy checks itself and rolls itself back

## Done when

`plates promote --yes` on a project whose `"delivery".promote` is a Vercel project records the deployment serving production, deploys the tested commit, checks the new one (revision, smoke paths, a short error watch), and rolls back to the recorded deployment on any failure without being asked. `plates promote --back` returns to the last good deployment in one command. An owner grant for one named target lets an agent run exactly that command after each landing without a fresh typed approval, and nothing else in production.

## Why

The owner, 2026-11-03: "you do the deploy, and most of the time it all just works and is good. If something happens such as: there is an error, you see it and roll back; I see an issue, I tell you to roll back." Phase 82 made promotion a guarded gesture for tag and branch targets, and a failed verify there suggests `--back` and moves nothing. Plates' own workspace deploys from a clean checkout with the Vercel CLI, so production has already moved when a check fails: the rollback has to be automatic. And the gesture is so routine that a typed approval per deploy is friction, not judgment, as long as the door stays windowed.

## Scope

- **A Vercel target:** `"delivery".promote` accepts `vercel:<project>` with `"delivery".vercel: { scope, checkout }`, where `checkout` is a directory outside every fleet checkout. The deploy runs from a clean checkout of exactly the tested commit, and passes the commit to the build so the deployment can report it (a CLI deploy has no `VERCEL_GIT_COMMIT_SHA`).
- **The rollback target:** before deploying, the deployment serving production is read and written into the deploy record. A refusal names why when it cannot be read: nothing deploys without a way back.
- **The checks, in order:**
  1. the revision: production reports the deployed commit, exactly (`verify.mjs --exact`), through a version path that answers without signing in and says only the commit;
  2. the smoke paths, as phase 81 has them (plates: `/` and `/api/deployment` answer 401 signed out, never 5xx);
  3. an error watch: the project's production error logs for a bounded window (default 120 seconds) show nothing new.
- **Automatic rollback:** any failed check moves production back to the recorded deployment, then verifies that one is serving, and exits non-zero naming the failed check, the deployment that failed and the one serving now. A rollback that itself fails is the owner's item on `plates home`, at the top.
- **`plates promote --back`** with no commit means the last deployment that passed its checks, from the deploy records. With a commit, it stays phase 82's rule.
- **The deploy record:** one JSON line per deploy on the `keel-verify` branch (beside phase 81's verify record): commit, deployment, rollback target, each check's result, and whether it rolled back. The morning brief and the docket read it: a rollback is a line in the brief and an owner item until the next good deploy.
- **The grant:** `"delivery".grant: { "agentPromote": true, "since": "<date>" }`, set only by the owner. With it, the autonomy host renderer (phase 144) emits a Claude Code permission rule allowing exactly `plates promote --yes` and `plates promote --back` in that project, and denies every other deployment command as now. Without it, deployment stays closed at every level, as today. The grant is the owner's to add to settings; plates previews the rule (⚑).
- **Refusals that stay:** a deploy whose commit needs a hosted migration not yet applied is refused with the migration's name (the activation plan knows which step a commit's phase waits on). A target outside the grant, a dirty checkout, or a commit not on the tested ref is refused as phase 82 refuses.
- **Plates on itself:** plates adopts the delivery practice with `vercel:plates`, so its own workspace is the first real surface.
- Out of scope: environment changes (a later `plates promote --config` that backs up, validates and restores), Preview deployments, and any target that is not Vercel, tag or branch.

## Integration increments

1. The Vercel target, the rollback target read, the deploy record, and the revision and smoke checks, with the automatic rollback, against an injected Vercel client.
2. The error watch and `--back` with no commit.
3. The grant and its rendered permission rule, and the brief and docket lines for a rollback.
4. Plates adopts delivery with `vercel:plates`; one real deploy that passes and one deliberate failure (a smoke path that cannot pass, on a throwaway commit) that rolls back.

## Acceptance

- [x] Nothing deploys when the serving deployment cannot be read: `tests/promote-vercel.test.mjs: "no rollback target, no deploy"`
- [x] A failed revision, smoke or error-watch check rolls back to the recorded deployment and verifies it: `tests/promote-vercel.test.mjs: "each failed check rolls back to the recorded deployment"`
- [x] A failed rollback reaches the top of the owner's docket: `tests/work-items.test.mjs: "a failed rollback is the first thing the owner sees"`
- [x] `plates promote --back` with no commit returns to the last deployment that passed: `tests/promote-vercel.test.mjs: "back means the last good deployment"`
- [x] The grant renders a rule allowing exactly the two commands, and without it deployment stays closed at every level: `tests/autonomy-hosts.test.mjs: "a promote grant opens exactly plates promote"`
- [x] A commit waiting on an unapplied migration is refused with its name: `tests/promote-vercel.test.mjs: "a deploy waits for its migration"`
- [ ] ⚑ by hand: on plates' own workspace, one deploy passes its checks, and one deliberate failure rolls itself back.

## Your part

- **Ask:** Approve the promote grant for plates' workspace, then watch one deploy pass and one deliberate failure roll itself back.
- **Why:** This settles whether deploys can go out after every landing without asking you each time.
- **Look at:** The rollback's report and the morning brief's line: do you know what broke, and that you are back on the old version?
- **Choices:** Trust it to deploy | Trust it, but tell me more | Keep asking me
- **Takes:** About 5 minutes.
- **Then:** Trust it: built, and the grant stays. Otherwise the report changes here, and deploys keep asking.
- **Ready when:** increment 3 is built.

## Real surfaces

- adopted project: plates itself, with the delivery practice and `vercel:plates`; real deploys and a real rollback of its workspace.
- owner's machine: the rendered permission rule in the owner's Claude Code settings, and the deploy watched from the phone.

## Proof

Automated: `node --test tests/promote-vercel.test.mjs tests/autonomy-hosts.test.mjs tests/work-items.test.mjs`; `npm run check`.
By hand: the passing deploy and the deliberate rollback on plates' workspace, with both deploy records.
⚑ The grant, added by the owner to `.plates/plates.json` and their Claude Code settings. No cost.

## Deliberately open

- **The version path.** Settled 2026-11-03 by the build: `/api/version`, public and no-store, returns only `{ commit }`, from `PLATES_DEPLOY_REVISION` when a CLI deploy has no `VERCEL_GIT_COMMIT_SHA`.
- **How the error watch reads logs.** Settled 2026-11-03 by the build: `vercel logs --deployment <id> --level error --since <ready> --json`, read every 10 seconds across the window; unreadable logs fail the watch.
- **The tested ref on plates.** Proposed: `green`, published by the delivery practice's publisher after `check.yml` passes on main, as the practice is designed; not main itself.

## Next action

Increment 4: plates adopts delivery with `vercel:plates`; its first deploy passes `--migrations-from`, since production reports no commit yet. Then a real pass and a deliberate rollback, and the owner's grant and walk.

## Trajectory

- **2026-11-03** — A CLI deploy has no `VERCEL_GIT_COMMIT_SHA`, so production could not say what it serves; the deploy now passes `PLATES_DEPLOY_REVISION` per deployment, and `/api/version` reports it. tests/web-deployment.test.mjs.
- **2026-11-03** — The deploy uses `--skip-domain` and then `vercel promote`, because after a `vercel rollback` Vercel stops assigning production to new deploys; promoting explicitly keeps later deploys from stranding. practices/delivery/files/scripts/plates/vercel.mjs.
- **2026-11-03** — `--back` with no commit acts without `--yes` and steps one passing deploy further back each time: "roll back" is one word for the owner. tests/promote-vercel.test.mjs "back means the last good deployment".
- **2026-11-03** — Every Vercel CLI flag the client uses was checked against `vercel --help` (CLI 59.23.2); the JSON field names of `inspect` and `logs --json` are not yet checked against real output, which increment 4 does.
