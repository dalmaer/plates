# Risk tolerance: Low, Medium and High

Use `plates autonomy --json` to see the project's selected risk level,
all six action scopes, and the conditions still needed before action. No setting
means the existing behavior. Nothing is enabled by an update or by saying yes to
previous requests. Low, Medium and High are the user-facing names for the existing stored modes
`default`, `local` and `delivery`, respectively. They are one setting, not two
independent controls. `--level` is the primary CLI; `--mode` remains a compatible
alias and cannot be combined with `--level`. Existing files and policy digests
keep their meaning. The feature is a CLI setting, Project Home display and preflight API;
it does not alter hosted workers or the harness's permission configuration.

| Scope | Low (`default`) | Medium (`local`) | High (`delivery`) |
| --- | --- | --- | --- |
| Routine local edits | Existing rules | Within authorized task | Within authorized task |
| Routine tests | Existing rules | Within authorized task | Within authorized task |
| Push | Existing rules | Specific approval | Selected exact branches or bounded push namespaces |
| Merge | Existing rules | Specific approval | Exact selected base branches only |
| Deployment | Existing rules | Specific approval | Specific approval |
| Security-sensitive actions | Existing rules | Specific approval | Specific approval |

Routine means reversible work with reviewed effects. A test that deploys, sends
data, changes credentials or spends money is not routine. Force pushes, deletion,
branch-protection bypass, CI permission changes, security settings, authority
policy (including this setting), custom assistant rules, credentials, and new or
recurring spend are outside the modes' routine authority. A push or merge that
would trigger deployment needs the separate deployment approval. Existing project
rules, budgets, review/proof requirements and exact-command confirmations still
apply. A higher level never removes a platform denial. No level authorizes unrelated external communications, new tasks or new spend.

## Select a level explicitly

Preview the complete scope first. This command exits 3 and writes nothing:

```sh
plates autonomy --level medium --json
```

After the user explicitly selects that scope, apply its returned digest:

```sh
plates autonomy --level medium --yes --digest <reviewed-digest> --json
```

High has no implicit remote destinations: push and merge destinations are independent selections. This preview allows
pushing to feature/acme and merging into main only in this project:

```sh
plates autonomy --level high --push feature/acme --merge main --json
```

For an ongoing project workflow, explicitly select a literal namespace instead
of approving every future branch name:

```sh
plates autonomy --level high --push-prefix work/ --json
```

This can cover work/one and work/next-task under the same approved selection.
It never covers merging. Before each push, the consumer must verify the exact
repository/branch against current branch protection and rulesets (including
rules that apply to a new branch), and verify the default branch. Protected and
default branches are outside namespace authority. Missing evidence is unavailable,
not a new blanket permission. Exact merge branches and all merge gates stay separate.

Repeat those same options with the returned digest and confirmation. Repeat
`--push` or `--merge` for additional exact branches, or `--push-prefix` for another
literal slash-terminated namespace. No wildcards or refspecs are accepted. Every
selection replaces all branch and namespace lists; omitted lists are empty.
Changing any project config bytes, setting bytes, checkout or proposed scope
invalidates the preview. Confirmed selection writes only `.plates/autonomy.json`;
it never edits the project config, assistant rules, CI, credentials or remote
policy. Keep this user-owned file through updates; installing Plates does not
create it. Copying it to another repository is refused.

To remove the additional preference, preview and explicitly confirm Low:

```sh
plates autonomy --level low --json
```

The file is a declaration, not authentication or a signed consent receipt.
An assistant must not select a mode merely because the user approved other work,
provide confirmation on the user's behalf, or trust a setting introduced by an
unreviewed branch. Verify the owner's explicit selection of the current policy
digest from trusted conversation or reviewed policy provenance. An explicit
current task restriction remains decisive even when the mode is broader.

## Effective authority and permission preflight

The inspect result intentionally says `effectiveAuthority: requires-current-context`.
It cannot inspect your current harness grants or determine whether a script has
external effects. `lib/autonomy.mjs` exports `evaluateAutonomy` for the permission
preflight consumer. Supply the validated policy, repository, an action with
scope/repository and (for push/merge) exact target branch, plus current context:

- `taskAuthorized: true` only for the actual authorized task and effects.
- `selectionVerified` equal to the policy digest only after checking explicit
  human provenance for that exact selection; never derive it merely by reading
  the setting or historical approval counts.
- `classification: routine` only after checking actual effects; sensitive and
  destructive actions need specific approval, unknown effects are unavailable.
- For a push matched by a namespace, `branchProtection` must bind `repository`
  and `branch` to this action, supply a valid `defaultBranch` and report the
  current effective `state: unprotected`. A protected/default branch asks for
  separate authority; missing, unknown or mismatched evidence is unavailable.
- For every merge, `branchProtection` must bind the exact selected repository
  and base branch, name a valid current default branch, and report `protected`
  or `unprotected`. Protection is not bypassed: `commandGates` must independently
  verify all branch rules, required checks, reviews and exact-head approvals.
- `platform`, `project` and `commandGates` each independently `allowed`, `denied`
  or `unknown`. Command gates include all required proofs, command-specific
  approval/digests and current restrictions. Never synthesize `allowed` from
  the autonomy mode itself.

The result distinguishes proceed, ask, blocked, unavailable and inherit. A denial
wins even with default mode. A missing/default setting otherwise returns inherit,
so existing behavior remains unchanged. Proceed means the supplied facts fit the
selected scope; the function executes nothing. Verify remote URL/repository,
branch protection, reviewed head, checks and deployment side effects in preflight
before supplying those facts. Keep the policy digest with diagnostics; re-evaluate
when task, destination, bytes, budget, risk or permission evidence changes. Do not
transfer an exact-head approval to new bytes or retry an uncertain mutation.
Existing CLI mutation commands retain all their approval gates in this slice.
Agents can use the report to avoid duplicate conversational questions once the
same authority has already been established.

## What the levels mean in practice

- **Low:** preserve existing rules and approvals. This is the default for an absent setting; it does not add new approval requirements to already-authorized work.
- **Medium:** after verifying the user's selection and current task, continue routine reversible repository edits and tests without asking the same conversational question again. Ask separately for publication, merge, deployment or sensitive effects.
- **High:** Medium plus ordinary task-branch pushes under explicitly selected namespaces or exact branches, and gated merges to separately selected exact bases. Reuse the established approval while scope and evidence are unchanged. Recheck changed head/destination/risk and all required gates; do not treat a new branch under an approved namespace as a new grant when it still meets that namespace's conditions.

For Plates, a bounded High selection is `--level high --push-prefix codex/
--push-prefix claude/ --push-prefix work/ --merge main`. It applies only to
`dalmaer/plates`. It does not cover automated nightly branches, other managed
projects, direct pushes to main, force pushes, destructive deletion, branch-rule
bypasses, deployment, credentials, security, CI permission changes, assistant
rules, new budgets or unrelated communications. A merge with deployment side
effects still requires separate deployment authority. Historical yeses and the
setting file alone never establish consent.

## High favors reversible delivery

High favors shipping a bounded, reversible change with verification and a reliable
rollback over trying to eliminate every hypothetical regression first. Document
non-blocking uncertainty in the change record and continue when the selected task
scope, required evidence and mandatory checks permit it. An unknown required
permission, missing required check or failed gate is not non-blocking uncertainty
and must never be called a pass. High neither removes those gates nor authorizes
unrelated external work.

Before using this path, retain a small rollout record:

| Field | Required meaning |
| --- | --- |
| Scope and effects | Exact project, destinations and affected components; identify data writes, external actions, consumers and compatibility assumptions. |
| Known-good revision | Exact source/artifact identifier with retained passing checks and relevant health observations. A branch name or merely older commit is not proof that it is good. |
| Reversibility | The previous artifact/configuration is still available, rollback permissions and tools are available, compatibility is preserved, and restoring it has bounded cost without losing data or duplicating effects. |
| Rollback procedure | Concrete steps to restore the affected source/artifact and verify it. Name who executes them and retain the original change and any uncertain operation state. |
| Health signals | Before/after checks for the affected behavior, error reports and source/version readback; state which surfaces are unavailable. |
| Stop criteria | Failed mandatory checks, identity/protection mismatch, unsafe side effects, evidence of data loss or secret exposure, unreliable rollback, or an uncertain mutation outcome. Stop dependent work and resolve/escalate the specific gap. |
| Non-blocking uncertainty | The remaining bounded risk, why rollback contains it, what signal will reveal it, and what observation remains outstanding. |

For a source-only Plates change, rollback normally means a new task branch and a
reviewed revert commit through the ordinary checks and merge path, followed by
source/configuration readback. It does not mean force-resetting a shared branch,
bypassing checks or assuming a revert restores every external system. When a
normal deployment is separately authorized, retain its artifact identity and
restoration procedure as well; the risk setting itself grants no deployment
permission. Any reversal must stay inside the same verified project and action
scope, and uncertain writes must be inspected before another mutation.

A Git revert cannot undo a data migration, restore deleted external data, unsend
a message, refund a charge, unexpose a credential, or reverse another external
side effect. Such changes need their own safeguards and explicit authority;
they are outside this reversible fast path unless their actual effects have a
separately verified recovery procedure. If a shipped change breaks a named
health signal, stop further rollout and use the reliable bounded rollback.
Escalate when recovery requires different authority, new data decisions or a
security response. Do not keep shipping into an unexplained failure.

## Approval patterns and limits

The pure `suggestAutonomy` helper accepts explicit aggregate approved/declined
counts. Five or more approvals with no declines can suggest Medium (`local`). Its result
is always suggestion-only and requires explicit selection. It never reads logs,
stores counts, writes a setting or enables High. No automatic suggestion UI
or historical approval collection is included.

Selection uses an exclusive local writer lock, bounded regular-file reads, a
preview digest, atomic replacement and readback. Concurrent Plates selections
refuse the lock; inspect the original writer before removing a stale lock. These
checks are not a security boundary against another process that can rewrite the
checkout. Settings are not synchronized globally or to hosted execution, and this
slice does not supply a permission broker or provider-specific action classifier.


## Where the setting is consulted

The installed generic Plates skill starts with `plates --agent-help`. The cold
start, `plates --agent-help all` and `plates --agent-help autonomy` now read the
nearest project's setting. With a setting present, text output appends its scopes,
policy digest and boundaries; JSON adds an `autonomy` member marked
`source: repository-declaration` and `selectionVerification: unverified`. The
agent is told to avoid repeating conversational approval only after it verifies
explicit selection, task authority and all existing gates. No file bytes or
CLI flag alone establish that verification.

Without a setting, help output is unchanged. Malformed or unreadable settings
produce an unavailable context while leaving the guide accessible. Other help
topics remain static. Inspection and startup write nothing.

The spin/conduct skill already requires `plates decision context --phase <id> --json`
before dispatch and resume. That command now includes a separate unverified
`autonomy` member when configured, preserving its original decision records,
digest and exit status. This carries the scoped preference into the returned
brief without granting authority from it.

One versioned renderer, `plates-autonomy-prompt-v1`, now supplies interactive,
Climb, Tend, Robot build/resume/review, cross-review and mention-driven Claude
briefings. Its canonical implementation lives in the base practice and ships as
managed runtime files; the CLI imports that same implementation. Locally owned
base runtimes are not overwritten: absent briefing helpers produce an explicit
unavailable notice while preserving the existing task and gates. No setting means
no added guidance. Invalid source produces an unavailable notice, not a grant.

| Entry point | Policy source and role |
| --- | --- |
| Generic agent help and decision context | Nearest working-tree setting; interactive role; digest and available Git HEAD identify the snapshot, not consent. |
| Climb and Tend | Exact workflow source commit; builder role; original allocation, paths, tools and budget remain binding. |
| Robot prepare and context/resume | Exact workflow source commit even after switching to a resumed candidate; builder role. |
| Robot review | Exact workflow source commit; reviewer role; no execution of candidate code. |
| Cross-review | Trusted checkout used to construct the review brief; reviewer role. The publisher and execution checks do not load the renderer. |
| Mention-driven Claude | Separate read-only context job checks out the repository default branch and supplies bounded guidance through appended model instructions; builder role. |

Medium encourages routine reversible choices and appropriate tests without
repeated conversational confirmation. High also encourages completing reversible
work after mandatory gates, documenting bounded uncertainty and avoiding repeated
validation without a concrete unresolved concern. Reviewers still report every
material defect; they distinguish those findings from optional improvements.
Scheduled builders cannot push or merge because their role and tools prohibit it;
High does not alter the judge or publisher. `.plates/autonomy.json` is off limits
to automated Climb, Tend and Robot candidates, preventing self-selected authority.

Handoffs carry the renderer version, policy/context digests, source revision,
original approval and task/destination. Refresh before resume and inspect changed
facts rather than asking again merely because work resumed. A source declaration
can guide choices inside existing authority without proving human selection or
host permissions. No caller-supplied boolean authenticates a selection.

The inspected hosted web workers execute bounded commands or update protocols,
not model prompts. Their admission, leases, budgets, approval and digest checks
are unchanged; no host-permission adapter or new model call is added. Prompt
delivery tests establish the exact guidance delivered to providers, not compliance
by a live model. Measured approval reduction requires separately budgeted paired
evaluations, followed by real-world observations; none are claimed here.


## Visible project settings and the host boundary

Project Home shows an **Autonomy and approvals** panel from the same pinned
repository revision as its other source records. It distinguishes an absent
setting (default) from invalid/unreadable source (unavailable), displays the
selected scope and source link, and explains how to preview a local selection.
Local edits that have not reached that repository revision are not displayed.
The panel's host-save control is disabled and says why; it does not silently save
anything or claim that a source declaration is authenticated owner consent.

There is no general settings page today: Connections manages provider credentials
and project access, while Model Policy manages model routing and budgets. Neither
is a permission broker for local agent tools. The inspected Claude and Codex
workflow entry points use their own tool configuration; neither provides Plates
with a trusted, non-mutating effective-policy producer for a future invocation,
a complete required-operation inventory, or an authenticated API for recording
scoped host consent. GitHub access and provider metadata do not supply those facts.

Consequently Plates cannot promise to suppress Codex/Claude host approval dialogs.
The setting expresses project workflow intent at supported agent briefing entry
points, and the evaluator respects it only with independently verified current
facts. Update publication, drain/merge, deployment, budgets and hosted mutation
approval gates remain unchanged. Do not fill `context.platform` from the preference,
runner probes, provider names, API credentials or historical yeses.
