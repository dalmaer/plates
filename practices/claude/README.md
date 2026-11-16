# claude

**The failure it prevents.** An agent with write access that lands work
nobody read: a bot pushing to `main`. And the opposite failure, an issue that
waits for a person to have time to start it.

**The rule.** `.github/workflows/claude.yml` answers `@claude` in an issue,
a comment or a review (or an issue labelled `claude`) with Claude Code,
which reads the selected working guide and makes local edits. Only people with
current write, maintain or admin access may start it; bots are refused and an
unavailable permission lookup stops the run. No model is pinned.

**Containment boundary.** The agent job has only read permissions, no OIDC and
no persisted checkout credentials. It passes the job token explicitly to Claude
in prompt mode and installs with `npm ci --ignore-scripts`. Its tool deny list
matches the local-only ceiling in `lib/autonomy-hosts.mjs`; tool lists alone
do not sandbox the commands invoked by package scripts. Projects needing
lifecycle scripts must arrange their setup separately.

**Replies and patches.** A separate comment-only job returns the final answer
to the triggering issue or PR after the agent succeeds or fails. It runs no
repository code, has only issue and pull-request write permissions, and posts
untrusted answer text using a body file. Comments are capped at 60,000 characters
with a cut notice and a fixed footer linking the run. Missing or unreadable
answers get a short fallback pointing to the Actions log. Refused requesters and
unconfigured runs receive no reply; the missing-secret green notice is unchanged.

Download the `claude-changes` artifact (kept for seven days) to review the patch,
including committed, uncommitted and new files. It is untrusted review material;
it is neither applied nor executed automatically. Branch pushes and PR creation
wait for a person to review and publish the patch. Failed runs retain their
answer and logs, not a success patch. The agent never posts its own comment.

**What it needs (⚑).** One secret: `CLAUDE_CODE_OAUTH_TOKEN` (from
`claude setup-token`, drawn from a Claude subscription) or
`ANTHROPIC_API_KEY` (billed per token). Every mention spends model tokens.
Until one is set the run ends green with a notice.

**Optional: opt in with `--with claude` (owner's decision, 3 Oct 2026).**
`plates init` and `plates adopt` leave it off unless asked (`--with claude`), or
unless `.plates/plates.json` already lists it. It earns its place when the owner is
away: it runs Claude on GitHub, from an issue or a review, with nobody at a
terminal. With the owner at hand, Claude Code does the same work locally, so
the workflow adds a second way to spend, not a second capability; each
mention spends model tokens. Adopt still marks it local where the project
runs its own claude-code-action workflow.

**Its files.** `.github/workflows/claude.yml` (managed). `plates adopt` keeps
the practice local where a project already runs `anthropics/claude-code-action`
in a workflow of its own, so two Claudes never answer one mention.

**Lineage.** Plates phase 10, from duo's `.github/workflows/claude.yml`, with
git narrowed from `git *` to the subcommands that cannot push.

**Ancestors (phase 16, 3 Oct 2026).** What plates decided for the projects this
practice came from, where each keeps a version of its own:

- **isocan**: *stays local*. `changelog.yml` already runs
  `anthropics/claude-code-action`; two Claudes would answer one mention.
- **ledger**: *on*.
