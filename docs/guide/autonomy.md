# Autonomy and risk tolerance

Use `plates autonomy --json` to see the project's selected collaboration mode,
all six action scopes, and the conditions still needed before action. No setting
means the existing behavior. Nothing is enabled by an update or by saying yes to
previous requests. This first version is a CLI setting and a preflight API;
it does not alter hosted workers or the harness's permission configuration.

| Scope | default | local | delivery |
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
apply. More autonomy never removes a platform denial.

## Select a mode explicitly

Preview the complete scope first. This command exits 3 and writes nothing:

```sh
plates autonomy --mode local --json
```

After the user explicitly selects that scope, apply its returned digest:

```sh
plates autonomy --mode local --yes --digest <reviewed-digest> --json
```

Delivery destinations are independent exact branch names. This preview allows
pushing to feature/acme and merging into main only in this project:

```sh
plates autonomy --mode delivery --push feature/acme --merge main --json
```

For an ongoing project workflow, explicitly select a literal namespace instead
of approving every future branch name:

```sh
plates autonomy --mode delivery --push-prefix work/ --json
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

To remove the additional preference, preview and explicitly confirm default:

```sh
plates autonomy --mode default --json
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

## Approval patterns and limits

The pure `suggestAutonomy` helper accepts explicit aggregate approved/declined
counts. Five or more approvals with no declines can suggest local mode. Its result
is always suggestion-only and requires explicit selection. It never reads logs,
stores counts, writes a setting or enables delivery. No automatic suggestion UI
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

Scheduled climb prompts, robot build/review prompts and hosted workers do not
automatically consume this setting. Their
existing authority rules and gates remain unchanged. This implementation makes
configured scope visible at the generic agent startup and through the CLI; it
does not enforce model behavior or prove that a particular agent will ask fewer
questions. Those other entry points need a separately reviewed integration that
preserves their own budgets, exact-operation permissions and platform evidence.


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
