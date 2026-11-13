# delivery

**The failure it prevents.** Two changes land a minute apart and both run the
whole expensive path: test, build, deploy, promote, twice, the older one
possibly finishing last and deploying over the newer (the owner, 16 Oct 2026).
Or a deploy follows `main` itself, so a commit reaches production before (or
without) its gate passing.

**The rule.** Verify in parallel, publish one at a time, skip the superseded
(isocan's `scripts/release-order.sh`, plates's
`docs/research/2026-10-16-delivery.md`, items 1, 2 and 6):

- `.github/workflows/plates-publish.yml` starts when the project's gate workflow
  finishes on `main` (`workflow_run`, a push, success) or by hand. It has one
  fixed concurrency group, `publish`, never cancelled. A run that will not
  publish (a failed gate, a pull request's run) has a group of its own, so it
  never displaces a queued publisher.
- GitHub keeps only one *pending* run per group, so a late trigger can
  replace a newer one. `scripts/plates/publish.mjs` therefore never trusts the
  commit that started it: it reads `main`'s first-parent history from the
  tested ref to the tip and each commit's gate result (the night's
  `readCiGate`: the gate workflow's latest attempt on exactly that commit, a
  push to the default branch), and moves the tested ref to the newest commit
  that passed, with a lease on the value it read. Already there, or nothing
  newer passed: nothing. A tested ref that is not an ancestor of `main` has
  diverged: the run is red and nothing moves. The ref is created on first use
  at the newest passing commit. It never writes `main`.
- Least privilege: the job that chooses reads (`contents: read`,
  `actions: read`); only the job that moves the ref has `contents: write`, and
  it calls no API.
- Deploys follow the tested ref, never a push to `main`. A service outside
  GitHub Actions (isocan's Cloud Build) can trigger on a push to it; an
  Actions deploy starts on `workflow_run` of plates-publish completing, never on
  a push to the tested ref, because GitHub starts no workflow for a push made
  with `GITHUB_TOKEN`, which is what the publisher pushes with.
  `docs/guide/delivery.md` in plates says how, for both.
- `plates doctor` holds every workflow of a project with this practice to the
  concurrency rule (`workflow-concurrency`): a test or gate workflow has a
  per-ref group with `cancel-in-progress: true`; a publish or deploy workflow
  has a fixed group with `cancel-in-progress: false`. Only a workflow-level
  block covers a whole test workflow; otherwise every job needs its own. A
  group naming the run (`github.run_id`, `run_number`, `run_attempt`), the
  commit or the ref is not fixed, and one plates cannot establish is named;
  `${{ <condition> && '<name>' || <a per-run skip group> }}` is fixed only
  when every job it covers runs on that condition alone (its `if:`, or a job
  it needs; plates-publish.yml's form, whose choose job's `if:` is the
  condition); on any other job its fallback group could deploy beside it.

**Production is checked by the commit it serves** (phase 81, design items 3,
4 and 8, after ledger's `verify-production.mjs` and live-SHA skip):
`scripts/plates/verify.mjs <sha>` reads `delivery.version` on `delivery.site`
(a JSON `sha` or `commit` field, a JSON string, or the plain hash; a full hash
only) until production serves that commit or a descendant (ancestry read in
the checkout) or `--within` seconds pass, then each `delivery.smoke` path's
status (redirects not followed). It passes only on what it saw, and fails
naming each check. `verify.mjs live <sha>` (one read; exit 0 yes, 1 no) lets
a deploy step skip a commit production already has. `--record` adds the
result to the branch `keel-verify` (`verify.json`, or `--record --failed "<reason>"`
for a failure the project's own checks found); a failed latest verify is
an owner's item on `plates home`, and each failure of the day before a night
is a line in that night's morning brief.

**Promotion is a guarded gesture** (phase 82, design item 5, after isocan's
hand-moved `prod` tag): `plates promote [<commit>]` runs
`scripts/plates/promote.mjs`, which moves `delivery.promote` (`tag:prod` or
`branch:production`) only to a commit on the tested ref whose gate passed
(phase 79's result, `gate.mjs` `ciResult`, at any age). Default: the tested
ref's tip. It previews first (exit 3) and moves with `--yes`, with a lease,
then verifies production with `verify.mjs`. A failed verify suggests `--back`
and moves nothing. `plates promote --back <commit>` rolls back to an earlier
tested commit with the same checks. It passes only when production reports
exactly that commit (`verify.mjs --exact`), since a newer commit still
serving contains the older one. It refuses to run in GitHub Actions; no
workflow plates installs runs it.

**A deploy checks itself and rolls itself back** (phase 177): with
`"delivery".promote: "vercel:<project>"` and `"delivery".vercel: { "scope":
"<team>", "checkout": "<absolute directory outside every checkout>" }`,
`plates promote --yes` runs `scripts/plates/vercel.mjs`. Before anything
deploys it reads the deployment serving production (the rollback target; none
readable, nothing deploys), refuses a commit that adds a file under
`"delivery".migrations` (default `lib/web/migrations`) since the last deploy
that passed unless `--migrated <file>` says the owner applied it, and fills the
checkout with exactly the tested commit (`git archive`). Then `vercel deploy
--prod --skip-domain` with the commit as the deployment's runtime env
`PLATES_DEPLOY_REVISION`, and `vercel promote` points production at it. The
checks, in order: the version path reports exactly the commit, the smoke
paths, and no error in the new deployment's logs for `--watch` seconds (default
120) from its ready time. Any failure runs `vercel rollback` to the recorded
deployment, reads that it serves, and exits 1 naming the failed check, the
deployment that failed and the one serving now; a rollback that does not take
is the first item on the owner's docket. `plates promote --back` with no commit
goes at once to the newest deploy that passed before the one serving. Each
deploy is one JSON line in `deploys.jsonl` on the verify branch, beside
`verify.json`; a rollback is a line in the morning brief and the owner's item
until a later deploy passes. The Vercel CLI is one client; it never reads
environment values or secrets. `"delivery".grant: { "agentPromote": true,
"since": "YYYY-MM-DD" }`, the owner's, lets the autonomy renderer allow an
agent exactly `plates promote --yes` and `plates promote --back`.

**Configuration** (`.plates/plates.json`): `"delivery": { "tested": "green",
"gateWorkflow": "check.yml", "site": "https://anvils.acme.example",
"version": "/api/version", "smoke": ["/", { "path": "/login", "status": 307 }],
"promote": "tag:prod" }`. `tested` is a branch's short name, never the
default branch; `gateWorkflow` is the workflow whose success on `main` starts
the publisher (its file or the name GitHub shows), default the project's gate
workflow (`ci.gateWorkflow`, else `check.yml`, else the one running the
check). `site` is https (http on localhost only) and required with `version`
or `smoke`; `version` and each smoke path start with `/`; a smoke status is a
code or a list of codes (default 200). `promote` is `tag:<name>`,
`branch:<name>` (never the default branch or the tested ref) or `none`, and
needs `site` and `version`. `"workflows"` maps a workflow's file or `name:` to `"test"`, `"publish"`, `"deploy"` or `"none"` when a project overrides `workflow-concurrency`'s step/trigger/name classification. Each error names its key. `"delivery".docsOnly` is the night's gate
(phase 79).

**Its files.** `.github/workflows/plates-publish.yml`, `scripts/plates/publish.mjs`,
`scripts/plates/delivery.mjs`, `scripts/plates/verify.mjs`,
`scripts/plates/promote.mjs` and `scripts/plates/vercel.mjs` (managed). It
requires `night` (the gate result reader, `scripts/plates/ci.mjs` and `lib.mjs`,
and the morning brief, `scripts/plates/morning.mjs`, which reads the verify
record). Optional: `plates adopt --with delivery`; its publisher pushes a branch
on the project's remote, and `verify.mjs --record` pushes `keel-verify`.

**Lineage.** Plates phase 80, from isocan's `release-order.sh` and
`release.yml` publish job (`green`, a queued group, skip the superseded,
refuse the diverged), and isocan's `test/workflows.test.ts` for the
concurrency rule. Plates phase 81, from ledger's `scripts/verify-production.mjs`
(the commit or a descendant, by ancestry, retried for a bounded time),
`.github/workflows/verify-deploy.yml` (smoke checks by status) and its
live-SHA deploy skip. Adapted, no code copied.
