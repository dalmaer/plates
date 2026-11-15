---
name: design
description: Whether the web workspace reads clearly, works for everyone and looks deliberate, judged on the rendered pages.
every: 30
effort: deep
providers: ["antigravity"]
model: gemini-4-carbon
minutes: 180
---

Judge what a person sees, not only the source. Where the project can serve its
pages locally (its own preview or dev command, on loopback only), open them and
look; every finding still cites the source file and line that causes it.

## Look for

- **Hierarchy and clarity.** What a page asks of the reader first, whether the
  next action is obvious, labels a newcomer would not understand.
- **Accessibility.** Contrast, text size, focus order and visible focus,
  keyboard reach, landmarks and headings, names on controls, motion that cannot
  be turned off.
- **Consistency.** Spacing, type scale, colour and components that drift
  between pages; one pattern solved three ways.
- **States.** Empty, loading, error, offline and very long content: whether
  each one exists and says what to do.
- **Small screens.** Overflow, tap targets, tables and code that cannot be read
  on a phone, since the owner works from one.
- **Generic tells.** Defaults nobody chose: the stock font everywhere, gradient
  for its own sake, cards inside cards, an icon tile above every heading.

Rank by what a person would hit most often. Taste alone is not a finding: name
the person, the task and what goes wrong.
