# From Keel to Plates

Plates keeps projects moving with shared practices, bounded automation, and evidence-backed care. Each project is a **plate**. **All plates** is the view of projects the signed-in person can access; a workspace remains an access and storage boundary. Technical concepts such as projects, repositories, runs, changes, pull requests, and maintenance cycles retain their precise meanings. The existing conductor skill is now `/spin`, with `/conduct` retained as a compatibility alias. Its phase execution, proof, review, claims and permission rules are unchanged; there is no new CLI run type or spin instrumentation.

## Canonical names

| Before | Now |
| --- | --- |
| Keel | Plates |
| `keel` executable/package | `plates` |
| `.keel/keel.json` | `.plates/plates.json` |
| `.keel/` runtime directory | `.plates/` |
| `fleet.json` collection registry | `plates.json` |
| `scripts/keel/` | `scripts/plates/` |
| `.agents/skills/keel/` | `.agents/skills/plates/` |
| `keel-*.yml` managed workflows | `plates-*.yml` |
| `keel:begin` / `keel:end` managed blocks | `plates:begin` / `plates:end` |

The `fleet` CLI verb remains available for collection operations. The underlying project IDs, repository numeric IDs, and workspace memberships do not become new objects when their display names change.

## Migrate an existing checkout

Use the new CLI from outside or inside the old project; the migration does not require an already-renamed config:

```sh
plates migrate /path/to/project --json
plates migrate /path/to/project --yes --digest <digest-from-preview> --json
plates render --check
```

Review the preview's exact paths, changes, and refusals. The digest binds application to that inventory. The migration validates managed-file hashes before changing them, refuses conflicting destinations, and preserves opaque runtime journals byte for byte. Previously ignored runtime targets retain local Git-ignore protection before their bytes move. Its recovery receipt lives in Git metadata, outside the directory being renamed. An interrupted migration resumes the recorded operation; it does not invent a fresh plan over partial state. After migration, render the current practices through the normal reviewed update flow, run the project's own gate, and commit its complete file moves together.

Automatic executable-source and workflow changes require verified product self identity or an exact complete-file managed hash. Affected unowned machine files and filenames require explicit preparation; an apparent module reference may be quoted data. Unaffected consumer bytes remain exact. Unrelated package names and subpaths remain unchanged; a bare product dependency is renamed only when the owning package manifest identifies the supported product source.

Prepare affected consumer package scripts and configured commands explicitly before requesting a new preview. Command arguments, external URLs and embedded code are not scalar filesystem paths. The migration refuses proposed command changes before writing instead of guessing their meaning. Existing schema path fields retain their bounded mapping. Review the actual local integration references, keep unrelated arguments intact, and run the consumer's checks after the complete update.

Original ignore rules remain protective, with supported positive canonical metadata rules added alongside them. Ambiguous ignore negations require preparation. Runtime budget state and other opaque records move with their bytes unchanged.

Release rehearsal can apply this migration inside its disposable clone before testing the candidate practices. It keeps the original commit for a baseline comparison and pushes nothing. Ordinary project updates do not silently migrate a real checkout.

For a project collection, inventory each actual checkout and remote configuration first. Keep scheduled workflows and existing concurrency groups coordinated; changing a filename must not start a second independent schedule or allowance. Preserve the original deployment environment until the new revision and its consumers are verified. Git remotes and hosting project metadata are separate rollout steps from local file migration.

## Compatibility and deliberate old names

- `keel` remains an executable alias for the same `plates` entry point. New instructions use `plates`.
- Only the historical environment bindings listed in the name table have compatibility aliases. Ordinary bindings select the current name by presence, retaining consumer validation; identity bindings refuse conflicting declarations. Invalid current values never silently select a legacy value. Hosted secret readers retain their separate conflict policy without copying or rotating secrets. The Canvas tool-version pin has an explicit mapping because its old variable included Keel twice.
- Remote project/config reads recognize `.keel/keel.json` only when `.plates/plates.json` is absent. Invalid new configuration is an error, not permission to silently use old settings.
- Held rows in the name table remain deliberate exceptions. Canvas ownership properties (`keel.project`, `keel.operation`, `keel.hash`, `keel.key`) and retained operation identities are not rewritten by a source update. Hosted writer activation requires the compatible baseline and rollback conditions in the transition spec; source support is not deployment proof. A migration never rewrites historical operation records.
- Queue and workflow readers combine the exact old and new names as one queue. A night already started under `keel-night/<date>` finishes under that original name. Label writers require committed migration receipts, and workflow installation retains its approved concurrency barrier. Historical provenance fences remain readable alongside current fences; old records are not edited.
- Plan and verification readers accept the table-defined current name first and legacy name second, while preserving the selected original recovery identity. Fresh writers follow the installed table state. Do not delete an old branch as a substitute for updating and verifying its writer; an old installed writer can recreate it.
- Workflow-history readers must include the old and new exact workflow identities. Weekly robot usage survives the rename; unavailable history prevents admission rather than resetting the allowance. Recovery retains the selected original attempt's provenance.
- `lessonProject` optionally pins the stable lesson fingerprint identity across a repository rename. The Plates source retains `dalmaer/keel` for this field so previously sent lessons are not sent again; current source links use the current repository name.
- The source's `feedbackProject: "dalmaer/keel"` records this exact repository rename for private feedback replay. It preserves historical observation IDs, words and digest chains; current proposal destinations use `dalmaer/plates`. It is not a general alias for another project's store. Existing observations retain their original project when revised, while new observations can use the canonical repository.
- Private-inbox proposal readers recognize historical `keel learn: proposed` comments alongside canonical `plates learn: proposed` comments, using the newest matching proposal. Historical comments and issue identities are not rewritten.
- Dated evidence, old release notes, and recorded trajectories keep their original product terminology and claims. Working links may point at renamed files. A historical record is not a current usage example.

These exceptions preserve continuity; they do not retain a second product, scheduler, permission scope, or database. Remove compatibility only after its consumers and recovery horizon have been inventoried and tested.

## Release verification

The rename is ready only when canonical source and templates agree, managed-file rendering is clean, the full repository gate passes, and the consumer migration previews and gates succeed. Verify remote commits after repository renames, the exact deployed revision, sign-in/session continuity, All plates navigation, project reads, and applicable bounded actions. Record any remaining old-name exception with its owner and reason. A green local build alone is not deployment evidence.

Package entry paths follow the verified file and directory mapping, including nested manifests. Public export/import keys, command names and consumer package identities remain stable. Matching root lockfile command metadata follows the same move; mismatches and unsupported affected workspace/local-link graphs refuse before writes. Ambiguous packaging patterns also require an explicit migration. These path fields are described in the [npm package manifest reference](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

## External names and the owner's machine

The checkout migration does not rename GitHub labels, repository settings or
machine paths. Inspect those separately:

```sh
plates names --repo acme/anvils --json
plates names --repo acme/anvils --yes --digest <digest-from-preview> --json
```

Without `--repo`, the preview includes the configured project and managed fleet.
It reports exact names from the transition table, retained aliases, held changes
and unavailable coverage. Approval applies to one repository and the exact preview.
Existing labels are renamed in place with their IDs retained. Absent labels are
created only for known enabled writers or an explicitly selected table row. Use
`--only` to select exact actionable rows; conflicting or unproven names refuse.
Variables are copied with their old aliases retained. Secret metadata produces
owner commands; no secret value is read or printed. Vercel settings remain owner
commands with an explicitly selected project and environment.

A confirmed local result returns public label-receipt bytes for a separately
reviewed repository change. They must reach the workflow's source revision before
writers can use the new labels. The command does not commit, publish receipts,
dispatch workflows, merge changes or retire old aliases.

After interruption, retain the original private journal:

```sh
plates names --recover <original-operation-id> --json
```

Recovery reads back that operation without resending. Repeating its original
approved apply may continue only actions never attempted, after reconciling prior
outcomes and revalidating the original source and scope. An uncertain create whose
returned ID was lost remains unresolved; a same-name object is not proof it was
ours. Do not remove journals to force a new operation.

Machine changes have their own preview and approval:

```sh
plates names --machine --json
plates names --machine --yes --digest <machine-preview-digest> --json
plates names --machine --recover <original-machine-operation> --json
```

The supported job shape is a portable script with an exact XML launchd definition
in the current user's GUI domain. The preview names paths, modes, hashes and job
changes. It preserves unrelated plist fields and script bytes, confirms the old
job stopped before starting the new one, and never moves other worktrees. Embedded
legacy script paths, unsupported jobs, collisions or unknown state need manual
attention. A partial filesystem move can require explicit manual reconciliation;
recovery never silently repeats startup or deletes partial state.

## Verify the rollout

```sh
plates names --verify acme/anvils --run 123 --json
```

Verification is read-only. A green night is only one check. The rollout needs
source-bound observations linking the night attempt, its actual PR, the morning's
final result, fresh managed writes, queue state, and actual plan/verification
history consumption. Evidence-enabled manual night and morning runs retain
immutable attempt artifacts; missing or expired evidence stays unknown. The manual inputs include `names_evidence: true` and an exact reviewed `names_source_sha: <commit>`; morning also names the originating `night_run_id: <id>` and `night_run_attempt: <attempt>`. The workflows use a separate source checkout at that SHA with existing access, without an npm install or latest-version fallback. Project-owned setup/gate effects remain outside the enumerated managed-writer observation and are disclosed separately. A legacy
night already in flight retains its original prefix. Neither a merge nor a
successful verifier establishes production acceptance or retires retained aliases.
See the [name-transition contract](../specs/name-transition.md) and phase 129's
owner-approved rollout checklist before activating changes in a project.
