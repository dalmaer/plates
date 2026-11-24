# Planning in Unison as a tree of outcomes

*2026-11-24. For the owner's workspaces, and for the Unison agent. It sits beside
[the runbook](2026-11-21-plates-to-unison-runbook.md) and
[the spec for plans with proof](2026-11-21-unison-spec-for-plans-with-proof.md).*

Plates has gone. Every project now plans in its Unison workspace. This page says how
work is planned there with nothing but the kernel Unison has today, what that costs,
and the one kernel change that would remove most of the cost.

## The way of working

- **An item is an outcome.** Its body opens with `Done when:` (one or two sentences
  someone else could check) and `Check:` (a test by file and name, or a link to
  evidence).
- **Plan before building.** An item with no `Done when` is unplanned. An agent
  proposes a done-when, a check and a split as a comment, then asks the owner in chat
  with `--action`: accept, change it, or split differently. Nothing is built until
  the owner answers.
- **Split into children that each land on their own:** scaffold, enable, roll out.
  The parent keeps the outcome. It is never worked directly, and it closes only when
  every child is closed and its own check holds.
- **Claim only leaves whose needs are closed.**
- **Close on proof:** the merged PR and its green CI run.
- **Checks only a person can do are child items for the owner** ("Try it on the
  phone"). "Something's off" becomes a new child.
- **Found work is a new item, never a fix in passing.**

### A worked example

> **#120 Reminders work on the iPhone.** Done when: a reminder set in the app fires at
> the time set on the owner's phone. Check: `tests/reminders.test.ts "fires at the time set"`.

Split:
- #121 Schedule reminders locally.
- #122 Ask for notification permission (needs #121).
- #123 Fire and open the right screen (needs #121, #122; its check is the parent's).
- #124 Try it on the phone (the owner's).

Agents take #121 first, and #122 and #123 unlock in turn. #120 closes when #124 is
answered "works" and #123's test is green on main.

## With today's kernel: conventions

Unison has a flat backlog, claims with a 12-hour lease, comments, linked PRs, chat
with `--action`, Recurring tasks and webhooks. It has no workspace-level instructions;
agents read the repo's `AGENTS.md`. The conventions live in each project's `AGENTS.md`
and in the owner's global agent guide:

| Native | Convention |
|---|---|
| Done when and check | The first lines of the item body |
| Parent and child | `Parent: #id` in the child; a `- [ ] #child` checklist in the parent |
| Needs | `Needs: #a, #b` in the body, with backlog order putting children above their parent in the order they can be done |
| Only leaves are claimed | The parent is assigned to the owner, so `claim` skips it; a claimed item with open needs is `stop`ped and the next one claimed |
| Plan this | A comment, plus `chat send "@owner …" --item <id> --action`; the owner replies in the thread |
| Close on proof | The close note links the PR and the CI run; whoever closes the last child closes the parent |
| Keeping it honest | A weekly "Backlog tidy" Recurring task |

What conventions cannot give:
- **Enforcement.** An agent can still claim a blocked item or close a parent early.
  The weekly tidy finds these after the fact.
- **A tree view.** The plan is read from checklists.
- **Verified proof.** A link in a close note is taken on trust.
- **Answers as events.** The owner's "accept" is a chat reply that an agent reads,
  not an answer that something can wait on.

## The one kernel change worth asking for

**`Needs`, honoured by `claim`.**

```
unison backlog add <title> --needs <id>[,<id>…]
unison backlog edit <id> --needs <id>[,<id>…]|none
```

`backlog claim` skips an item while any item it needs is still open. `backlog show`
lists what it needs and what needs it. This is M3's Needs, alone, without M3's claim
numbers or lease settings.

Done when:
- with #2 needing #1, a `claim` while #1 is open takes #3, not #2;
- after #1 closes, the next `claim` takes #2;
- an item cannot need itself, and a cycle is refused.

This change alone would retire most of the conventions above: the ordering trick,
assigning parents to the owner, and claim-then-stop. A parent (`--parent <id>`, which
`claim` also skips while the item has open children) is the next step. Done when,
checks, Plan this and proof can stay conventions for as long as they work.

## Rolled out (2026-11-24)

- The owner's global agent guide has a section, "Plan work in Unison as a tree of
  outcomes".
- Each project's `AGENTS.md` has a short "How we plan" block under "Where the work is
  planned".
- Each owner workspace has a weekly "Backlog tidy" Recurring task (Sunday).
- isocan is dglazkov's workspace: it keeps its own `phases.md` plan and has no
  Recurring tasks from us.
