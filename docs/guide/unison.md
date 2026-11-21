# A plate's work as its Unison backlog

[Unison](https://github.com/digitalex/unison) is a shared workspace where people
and agents keep one ranked backlog. Plates rents it as the place a plate's work
is queued: each open phase (and, when the plate turns them on, each open GitHub
issue) is one backlog item that links back. Plates keeps the judgment: what is
built, its proof and what is safe to land. Unison owns position and assignee.

## The repo is the key

A plate's workspace is the one whose repos include the plate's GitHub repo
(`.plates/plates.json` `"repo": "owner/repo"`). URLs are compared normalized, so
`http://github.com/Owner/Repo` and `https://github.com/owner/repo.git` are one
repo. Two workspaces listing one repo are refused, never guessed between.

```
unison login                 # once per Mac, in the browser
plates unison connect        # find the workspace by repo, or make one
plates unison status         # the plan a sync would carry out; changes nothing
plates unison sync           # carry it out
plates unison                # the local map only; reads nothing remote
```

`connect` creates a workspace (`unison workspace create <plate> --repo
https://github.com/<owner>/<repo>`) only when none lists the repo. Not signed in,
it says so (exit 3, a sign-in card under `--json`) and creates nothing.

`unison` is found on PATH and talks to `UNISON_SERVER`, else the plate's
`"unison": { "server": … }`, else https://unison.cloud.run. Plates never prints a
token.

## What a sync does

- One item per open phase, titled `Phase <n>: <title>`, whose body ends with
  `Phase: https://github.com/<owner>/<repo>/blob/HEAD/docs/phases/<file>` (HEAD is the default branch; a link on any ref matches by repo and file).
  With `"unison": { "sources": ["phases", "issues"] }`, one per open issue too,
  ending `Issue: https://github.com/<owner>/<repo>/issues/<n>`.
- A renamed phase retitles its item. A built or superseded phase, or a closed
  issue, closes its item with a note. Work reopened reopens the item only when
  sync closed it; an item someone closed while its work is open is a suggestion.
- It never moves, assigns or starts an item, and closing an item never builds a phase.

Only a link line at the start of a line, naming one of the workspace's repos,
links an item; any other URL is prose. Copied text that would read as a link
line is escaped (`\Phase:`), so it cannot name a different link.

## The map

`.plates/unison/map.json` is private (0600, git-ignored through
`info/exclude`): the workspace id, and each source's item and whether sync
closed it. A source the map holds is never given a second item, even when its
item's line was removed by hand (that item is reported as unlinked and left
alone). Lines are taken into the map only while every item it holds still
carries its line; otherwise sync stops and names the items that lost theirs.

Phase sources are keyed by repo and number, so another repo's phase 2 in the
same workspace is never this plate's. A close is written to the map as pending
before it is sent, and settled on the next run by the item's status and close
note. `connect` and `sync` hold one writer lock per checkout; a second run while
one holds it is "not run: another sync is running" (exit 1). The map's directory
carries a `.npmignore` of `*`, and privacy is checked on the map's real path, so
neither `npm pack` nor a `.gitignore` negation can expose it.

Unison or GitHub that cannot be read is "Unison not read" (exit 1, `plan: null`),
never an empty backlog.
