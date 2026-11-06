# Plate overview and message workspace

## Scope and first safe increment

2026-11-06: the owner requested a card overview of all plates leading to a
single-plate message workspace, combining the existing design with the supplied
compact backlog reference. This is a presentation increment over the existing
Home and Backlog readers. No write permission, new data source, schema, merge,
deployment or phase acceptance is introduced. Recovery is reverting the UI and
project-Home backlog projection; no persistent migration is involved.

The isolated branch starts from main `ac62c422` and includes loading PR #367
at `353707b5`. The loading status, explicit update application, review actions,
loose-end records, guided walks, ask previews, source links, and autonomy panel
are retained. Existing overview/actions remain in a disclosure below the new
primary view. The shared checkout and other builders' work were not edited.

## Implemented

- Home has linked plate cards with source status, owner highlights, latest
  recorded change, and known activity. Unavailable activity stays unavailable.
- Each plate has a source-backed message list, type filters, search, reading
  pane, previous/next controls, and arrow-key navigation from the list.
- A narrow screen switches between list and reader, with a return control.
  Focus moves into the reader on touch-sized layouts. Source actions continue
  into their existing reviewed workflows.
- Project Home requests its own Backlog projection, including claims. Its
  cursor includes that projection, so claim-only changes cannot be lost to an
  unchanged Home ETag. Fleet Home does not add a claim read.
- Selection and filters stay in memory across explicit source updates; no
  private records are written to browser storage. Signed-out and inaccessible
  project routes retain their existing refusal behavior.

Issue and bug types use explicit source kinds/labels only. The hosted source
reader does not currently supply a general GitHub issues feed. An empty type
filter means no matching records in the available sources, not that the repository
has no issues. Phases are never relabeled as bugs based on their titles.

## Verification on 2026-11-06

The supplied PNG was materialized and its pixels inspected. It shows a compact
sidebar, rounded list pane, grouped work rows, status circles and quiet metadata.
The implementation uses those interaction cues with Plates' existing light/dark
tokens and source semantics.

`npm run check:focused -- tests/web-plate-workspace.test.mjs tests/web-home.test.mjs tests/web-home-loading.test.mjs tests/web-events.test.mjs tests/web-backlog.test.mjs tests/web-assets.test.mjs tests/web-design.test.mjs`
passed 182 tests and the roadmap, render, inbox and whitespace stages. The final
focus correction was then checked with the design tests and a real Chrome walk.
`npm run typecheck` passed using Node v26.13.0 and npm 11.20.0.

`npm run look -- --json` captured the repository's fixture pages at phone and
laptop sizes in light/dark themes. Home and project captures were inspected.
A task-local Chrome/CDP walk additionally exercised three synthetic Acme plate
cards; type filters and empty results; text search; previous/next; keyboard
arrows; queued refresh and selection retention; phone list/reader/return;
horizontal overflow; and dark theme/reduced motion. These checks use fixture
sources, not production or owner acceptance. The task retains the script,
results and captures outside Git.

`npm run check` passed: 4,546 main-suite tests passed, 12 conditionally skipped,
zero failed; all 45 installed-package tests passed; roadmap, rendered practice
and inbox guards passed. The earlier run was deliberately stopped before
completion to enrich reduced backlog records with their original decision
workflow; its partial results were not counted as a pass. The final full run
includes that correction and its regression test. Test-ledger timing hygiene
omitted the busy run, so this is not a quiet timing baseline.

Publication state is recorded in the PR. A local
browser walk is not a production verification. Phases 166, 174 and 178 retain
their acceptance state; this increment changes their presentation and reuses
their existing models/actions. No accepted architecture decision is superseded.
