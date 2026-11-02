# Evidence: phase 163 — the workspace reads each plate the way its CLI does

- Date: 2026-11-02
- Phase: 163
- Revision: the commit titled "phase 163: The workspace reads each plate the way its CLI does", on base `claude/phases-163-166`
- Claim being checked: a plate without the phases practice is not read as phases, phase failures collapse into one counted line, and a manifest plate the App cannot read is listed as unavailable with its fix instead of being dropped.

Built by the conductor (small phase): three source files and two test files.

## Automated checks

- `node --test tests/web-projects.test.mjs tests/web-access.test.mjs`: exit 0, 26 pass, 0 fail. This includes the three acceptance tests.
- `plates prove` for each acceptance test, with `--fix lib/web/projects.mjs lib/web/github.mjs lib/web/home.mjs --base HEAD`. Each printed `VERIFIED red without the fix, green with it`:
  - `"a plate without the phases practice is not read as phases"`
  - `"phase failures collapse into one counted line"`
  - `"a plate the App cannot read is named, not dropped"`
- `npm run check:focused -- tests/web-projects.test.mjs tests/web-access.test.mjs`: exit 0 (140 pass; whitespace, inbox and patterns preflights current).
- `node --test tests/web-*.test.mjs tests/home*.test.mjs tests/names.test.mjs`: exit 0, 777 pass.
- The whole gate, `npm run check`, runs once after this record, through `plates integrate`. It covers the full suite, the roadmap and the typecheck. Its result goes in the commit history.

The no-practice test compares blob reads against a control with the phases practice. Blobs are fetched by SHA, so a path pattern could not have caught a phase read.

`HOME_MODEL_VERSION` moved from 7 to 8, so cached project models from the old reader (such as Ledger's per-file gaps) are reread, not served.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Open the deployed workspace after deploy | Every dalmaer plate listed; Ledger and duo say they don't use phases | Not run: needs the owner's deploy | The GitHub API surface and the owner's walk |

## Gaps and decision

The GitHub API surface (the reader against the owner's real installation) and the owner's look are not walked. That waits on the owner deploying main. The phase is partial, `owes: walk`.
