# Install a reviewed practice update

## When you'd reach for this

An update PR has passed its checks and review, and you want to install it without
waiting for a climb, a complete nightly report or old-name retirement.

## What it does, and why it works that way

Preparation stays in `plates fleet update`. Installation is a separate, explicit
operation against one reviewed PR. Plates reads the actual diff, managed ownership,
source identity, checks and review; a green badge or version number alone does not
prove a compatible update. Unsupported changes are refused with their reason.

The initial contract accepts exact shipped managed files with unchanged project
policy and migration configuration. General additions/deletions, managed blocks,
job-level concurrency and unproven replacement mappings are unsupported. Workflow
replacements use the existing explicit rename map. A previously disabled workflow
whose replacement is not registered yet is refused because its disabled state
cannot be preserved safely. This is deliberately narrower than all update PRs.

```bash
plates fleet update --install acme/studio#42 --json
plates fleet update --install acme/studio#42 --yes --digest <preview-digest> --json
plates fleet update --recover <operation-id> --json
```

Inspect the first preview and approve its exact candidate and mutations before
using `--yes`. Existing approval remains valid only for its unchanged scope.
Changed code requires current checks and review; an exact-head approval never
covers another commit. A continuation summary points to the original authority
and evidence. It does not grant authority by itself.

Publication prepares an exact two-parent merge locally without checking out or
running project code. Its retained commit is pushed with an exact base-ref lease,
as in `plates integrate`: a concurrent advance refuses the write atomically.
Repository branch protections still apply. If they prohibit this direct
publication, installation refuses; there is no API-merge or force-only fallback.

When concurrency identities change, the preview names the affected workflows and
prior states. Plates pauses only those workflows, confirms that their runs have
drained, merges the reviewed change, reads back the installed bytes and restores
the previous active states. Review happens before the pause. Ordinary updates with
unchanged concurrency groups do not need a barrier. This operation does not cancel
runs, launch models, change schedules or retire aliases.

Keep the original operation ID after an interrupted or uncertain request. Recover
that operation instead of repeating the merge or preparing a replacement. A merge
with unfinished restoration is not a completed installation.

The original local receipt lives under `.plates/update/operations/`. Keep that
directory when handing off. Recovery may finish prepared actions within the
original approval, but observes rather than repeats attempted writes. A newly
registered replacement ID is retained only after its approved path and installed
bytes are verified. Missing registration remains restoration-pending.

If installation cannot continue **before any merge attempt**, preview
`plates fleet update --recover <operation-id> --restore-only --json`. Applying
that preview with `--yes --digest <preview-digest>` restores only old workflows
this operation paused, after verifying their current bytes against the approved
preimage. It ends the installation without claiming installation succeeded.
An attempted or uncertain merge cannot use this escape path; inspect the original
publication instead. Changed old workflow bytes also refuse automatic restoration.

## Read the result

- **Installation** describes the actual installed version and source, with any
  outstanding restoration obligation.
- **Verification** describes separately observed operational checks. Missing or
  failed nightly observations remain visible after installation.
- **Retirement** describes remaining legacy names and their evidence. Installation
  does not delete history or authorize retirement.

The source phase still owns acceptance and remaining work. None of these results
proves production usefulness or lived-in success. Continue the project's existing
approved care schedule; do not start optimization merely to unblock installation.

The read-only fleet view separately reports the version declared by the lock at
the current default revision. That declaration alone leaves installation unknown:
it does not verify every managed byte or the installation operation's restoration.
Retirement stays unavailable until separately inspected.

For an early read of the night, use `plates morning --observation --json`. It shows
pending work without completing it or sending a final issue. `--send` and `--card`
are incompatible with this read-only observation. Ordinary final readiness and
once-per-night sending remain unchanged.

## Further reading

[The night shift](the-night-shift.md) describes ongoing care.
[Source validation](../development/validation-preflight.md) describes the separate
Plates-only record-check policy; this does not waive a consumer's configured gate.
