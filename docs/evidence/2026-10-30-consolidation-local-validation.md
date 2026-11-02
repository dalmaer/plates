# Evidence: consolidated local candidate validation

- Date: 2026-10-30
- Phases: 137 and 138, local implementation only
- Tested code revision: `10076b5b15dfbfea079b52309a350d5fb5023f97`
- Branch: `codex/switchboard-consolidation`
- Tree was clean before and after the integrated gate. This later record changes documentation only; it does not claim a second full gate on the record commit.

## Results

| Command or check | Observed result |
| --- | --- |
| `npm_config_cache=/tmp/plates-consolidation-npm-cache npm run check` | Exit 0; 3,836 tests, 3,832 passed, zero failed, four explicitly opt-in Docker trials skipped; roadmap, render and inbox guards passed |
| `npm run typecheck` | Exit 0 on the same exact revision; repository-selected production JSDoc scope |
| Combined `npm run check:focused` selection recorded in the companion evidence | Exit 0; 350 passed, zero failed; source conventions and roadmap/render/inbox/whitespace guards passed |
| Changed Markdown local-link check | 21 files, 554 local links, no missing targets |
| Exact-revision packed/offline-installed Acme consumer | Exit 0; actual routine inspection, source-byte preservation, sanitized JSON, help, legacy executable, canonical ledger loading and recommendation command worked; local claims stayed unavailable and forged authority was refused |

The full test runner reported 389,145.52675 ms on 30 October 2026. Its hygiene
block named no flaky or slower test across three retained runs, with two busy
runs omitted and zero unavailable load contexts. Seeded stall-injection tests
passed; these are exercised test conditions, not ignored failures. No unchanged
full gate was rerun.

## Retained local evidence

Logs and the installed-walk script are in the task directory one level above the
checkout. They are local artifacts, not uploaded evidence.

| Artifact | SHA-256 |
| --- | --- |
| `../consolidation-full-10076b5b.log` | `61db29ad28fe1b4070e7f5ba30ab1dc8215356ae848ea9adff5078846468d996` |
| `../consolidation-typecheck-10076b5b.log` | `b562ea4eacf3b29ea4e160213f8b2fc984bf8aeefceaf8bbd5b760be0999b6d8` |
| `../consolidation-final-focused.log` | `5ced26a734b858d8dfd4af940d794edf0a9164a6c6d27abcbbea792246d8b00b` |
| `../packed-final-walk.mjs` | `093b7987055ea8beaf5655bb963fa0c58d0a7ed5536d92b08d887ded66bec850` |
| `../packed-final-walk.log` | `1ba964bc5351b7b141eacad269b9bcff8709a2859a053e685e970fd0952a63ce` |

The installed walk archives the exact commit, packs it, installs offline with
scripts disabled in a temporary Acme consumer, and invokes that installed
executable. It uses synthetic source records and a synthetic private ledger;
it makes no live provider calls. This establishes package behavior, not public
publication or real provider-format agreement.

## Review and preservation

Independent reader, usage and surface review finished with no remaining findings
in their reviewed scope. Negative controls cover native SQLite deadlines and
argument privacy, bounded records, stable identities, contributor privacy,
conservation of overlapping consumption, filtered observations, safe PR context,
quota reset cycles and expiry during both adapter reads and final authorization.
Detailed iterations are retained in the [observation/usage evidence](2026-10-30-consolidated-observations-usage.md)
and [personal recommendation evidence](2026-10-30-personal-agent-recommendations.md).

Readback on 30 October 2026 found original Plates main at
`0165c2902784073ba89dd717256ad233faf4865f` with its 48 pre-existing untracked
paths preserved; Switchboard main remained clean at
`a6651db5ff570eada8b04b2c4ffb993d8e67fbe9`; the separate agent-quality branch
remained clean at `9f8c17adb12e4291c4a9a4c11870c3755f3d762e`.

## Retrospective

`plates retro --worksheet --since f04f523c6b4471c3bf98d6527072b6ab555d1d5a --json`
returned exit 0: real work, 72 changed paths, 60 outside docs, and no linked
session transcript. These counts describe that exact range on 30 October 2026.

- Navigation: reallocated unpublished consolidation drafts to 137–141 while preserving the existing AQ identities.
- Automatable checks: adverse identity, allocation, deadline and asynchronous-expiry cases became focused regression controls.
- Missing standards: real provider formats and authenticated adapter activation still require separately scoped observations.
- AGENTS.md health: source conventions and independent conductor verification were useful; local-only authorization governed remote steps.
- Tool economy: builders used focused files; the conductor ran one full gate on the combined frozen candidate.
- No-op instructions: remote claim, push, merge and deployment steps were outside the authorized scope.
- Information gaps: synthetic attestations cannot prove live quota, collaborator grants, billing or cutover. No new unpicked practice or lesson change was applied.

## Remaining work

Phases 137 and 138 remain partial. Authenticated observation/quota adapters and
enrollment, real selected-source and multi-person walks, the remaining navigation
and terminology migration, collaborator funding/reservations and reviewed lesson
sharing are not complete. Phases 139–141 still describe policy/import, accountable
execution and safe ownership replacement. Switchboard continues operating.

No publication, merge, deployment, paid agent run, credential/access change,
routine retirement or destructive cutover occurred. No local implementation
action is awaiting approval or has an uncertain outcome. Live activation and
publication require their separately scoped approval.
