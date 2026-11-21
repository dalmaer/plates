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

Writing to a workspace needs a participant, not just the account. After finding
or making the workspace, `connect` joins it once as the signed-in account
(`unison join … --account --name <your first name>`), and keeps that session
outside every checkout: `~/.config/plates/unison/<server host>/<workspace>.json`
(or under `$XDG_CONFIG_HOME`), the directory 0700 and the file 0600. A later
connect reuses it. `sync` sends every write with it; without one, or when Unison
says the plate has not joined, sync writes nothing and says to run
`plates unison connect`.

A write Unison refuses outright clears its pending create (or pending
workspace) and reports the error; only an uncertain failure (a timeout, a
dropped connection) holds the 15-minute wait.

`unison` is found on PATH and talks to `UNISON_SERVER`, else the plate's
`"unison": { "server": … }`, else https://unison.cloud.run. Plates never prints a
token.

## The committed workspace, and opening it

`connect` writes the workspace into `.plates/plates.json` as
`"unison": { "workspace": "ws_…", "url": "<server>/w/ws_…" }`, keeping any other
`unison` keys, and leaves the change for you to commit ("Commit
.plates/plates.json"). The repo stays the truth: connect always finds the
workspace by repo and corrects the committed id when it disagrees. `status` and
`sync` start from the committed id, but only after checking that workspace lists
the plate's repo; if it does not, they say "not read" and point at connect.

`plates unison open` opens the workspace (`open` on macOS, `xdg-open` with a
display); `--item <phase>` opens that phase's item (`<server>/w/<ws>?item=<id>`).
Under `--json`, or with nothing to open it with, it prints the URL. `status`
prints the URL too.

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

## Phases in every shape

Sync reads phases as `plates next` and `plates status` do. The phases practice
reads `docs/phases/` strictly; a local variant (or a plate without the practice)
reads it loosely (front matter `status` and the first heading), and a plate
with no `docs/phases/` has zero phases. The projects shape links each phase to
`docs/projects/<project>/phases.md#<heading anchor>`, keyed by project and
number, and it is open while its **Status:** is not CLOSED or RETIRED.

The participant session is refused if its directory is inside a Git checkout
(through symlinks too). A write Unison refuses for the session removes that
session, so the next connect joins again. Only a recognized refusal (a 4xx, or
words such as "not found") clears a pending record; a 500 or anything
unclassified keeps it.

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
