# Fleet digest email formatting (source checkout)

The daily “While you were asleep” fleet digest is authored as Markdown by the
owner's reporting task. Its saved HTML previously escaped the Markdown and
converted links only, leaving heading, bold and code markers visible. The
repository now provides a pure formatter and a local preview script. This is
source-checkout tooling for the local reporting task, not an installed practice
command:

```sh
node scripts/render-report-email.mjs /absolute/report.md /absolute/new-preview.html --json
```

The output must be a new file. The script does not collect reports, contact
providers, send mail, change delivery intents, or replace previous editions.
The existing source Markdown, observations, subject, recipients, identity and
delivery recovery remain with the reporting task. After review, that task can
use the rendered HTML bytes in its existing HTML body step; its plain-text
source remains unchanged. This change does not activate or edit the task.

The supported report dialect is headings, paragraphs, top-level bullet and
numbered lists, `**strong**`, `*emphasis*`, backtick code and explicit HTTP(S)
Markdown links (including balanced parentheses in URLs). Raw HTML and unsupported
syntax are escaped as visible text. This is not a general CommonMark renderer:
tables, nested lists, fenced blocks and reference-style links should not be
authored for this email path. Review the HTML before sending.

The visual reference is Ledger's `jobs/morning-brief.ts` at
`eeb975ab0be6f1690606f5821566e77d5d52f409`, plus the owner's screenshot.
An independent email-safe implementation uses the system font stack with
Arial/Helvetica fallbacks, 15px body text, 18px title, 12px uppercase section
labels, .07em tracking, muted 13px metadata, and stronger authored titles.
Only the exact section labels “Needs attention” and “Failures and decisions
needing attention” receive Ledger's deep red. Content is never reclassified.
IDs use muted monospace on pale gray; unlike Ledger's very light IDs, their
contrast is at least 4.5:1. All essential styles are inline; a fluid white layout
is bounded to 640px with an Outlook wrapper. A single 16px content inset matches
Ledger's plain layout, without a gray surround or nested card padding.

Scope: the locally authored fleet digest only. Plates's per-project
`morning.mjs` generates a Markdown GitHub issue; GitHub owns the notification's
HTML. The weekly Loop report is an interactive canvas publication, not this
email. Neither those paths nor inbox alerts are changed.

Synthetic fixtures are in `tests/fixtures/report-email/`. Run:

```sh
node --import ./tests/helpers/hermetic.mjs --test tests/report-email.test.mjs
node scripts/render-report-email.mjs tests/fixtures/report-email/digest.md /tmp/acme-digest.html --json
```

Browser previews establish layout, not Gmail/Outlook/Apple Mail delivery-client
verification. No live email is necessary to review this formatter.
