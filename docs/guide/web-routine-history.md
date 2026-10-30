# Routines and observed activity

Open **Routines** or **Activity** from Home. The All plates / plate selector keeps the
current destination and applicable time-window and outcome filters in the URL.
A routine's workflow path is project-local, so changing projects clears that
selector and any source-bound pagination. All controls are read-only: refreshing
history does not run, retry, cancel or reconcile work.

## Inspect a project set

When the service has configured project sets, choose **Project sets** in Home,
Routines or Activity. Home shows the selected plates' existing work and reviews;
Routines and Activity retain the set when changing the visible window or outcome.
Opening a plate or an original attempt leaves the set filter and keeps that
record's project identity. **All plates** clears the filter. Other destinations
currently use their existing project or workspace scope; set-wide Learning and
personal capacity are subsequent work, not implied by this selector.

Sets group existing authorized plates. They do not add repository access, share
personal accounts or pool allowances. A set with no accessible members is
unavailable, and its hidden member names are not listed. History visits at most
three selected members per request. Its continuation is bound to visible
membership, repository pins and workspace source; if those change, restart the
read. Home retains the set while polling and labels missing source coverage.
Workspace-wide migration receipts are excluded with an explicit coverage gap
because their complete project attribution is unavailable; inspect All plates
for those original receipts. Existing project receipt links remain unchanged.
The GitHub request allowance on Home is API-read capacity, not model quota or
historical token usage.

For a local/test instance, the optional `projectSets` field in the existing web
service configuration is a bounded, read-only registry. Version 1 configurations
without it behave as before. It is not a new workspace manifest or an editable
set service. For example, alongside existing `projectRepoIds` pins:

```json
{
  "projectSets": [
    { "id": "active", "name": "Acme active", "projects": ["studio", "api"] }
  ]
}
```

Every member must already have a numeric repository pin in `projectRepoIds`.
There are at most 50 unique set IDs, each with 1–100 unique member IDs and a
nonempty display name of at most 120 characters. IDs follow the existing project
slug format. Live configuration and deployment remain separately approved;
this source change neither creates a set in production nor reads Switchboard.
This first slice is tracked in the
[project-set phase](../phases/132-a-project-set-shows-its-routines.md).

## Inspect a routine

Routines show the observed workflow definition and provider enabled state beside
its immutable source. Declared triggers, literal schedules and budgets are not
proof that a runner is connected or that the next run will happen. Unsupported
YAML expressions and unresolved permissions, inputs, overlap or timezone remain
unknown. Use the source link to inspect the declaration; no repository script
runs in the web request.

Actions access requires an approved GitHub App Actions-read grant. Without that
grant, the view names the capability gap while retaining definitions that Contents
read can support. There is no token-entry form and no fallback to an owner's CLI
credential. Changing App permissions remains a separate owner-approved action.

## Inspect an attempt

Activity keeps the original provider status and conclusion, interpreted outcome,
project, read time and source identity. A retry has its own attempt identity and
retains its logical-run parent and preceding-attempt identity. Open an attempt
for its jobs, steps, elapsed time and retained artifact metadata. An execution
success or committed web operation is not project acceptance.

Usage estimates, partial job subtotals and actual charges remain distinct. Weighted
minutes use existing runner weights; they are not invoices, token counts, dollar
costs or a remaining quota. Missing evidence keeps the estimate or charge unknown.
Queue time is not inferred from a logical run's creation date.

Artifacts can belong only to the logical run when no checked provenance assigns
them to an attempt. The view labels that assignment and retains expired metadata.
Provider links open the authoritative viewer. This phase downloads no archives,
raw logs or signed URLs.

## Read coverage alongside results

The default visible window is thirty days, with explicit windows from one to
ninety days. Filtering happens over bounded observations. Old logical runs can
have recent retries, so reading only a recent creation-date range would miss work.
Continue through provider pages and explicit attempt details when older history
is needed. Inserts between requests can shift provider pages; a complete page is
not a complete immutable history.

All plates reads visit at most three authorized projects sequentially in one request.
Unvisited projects remain visible with project links and a next-batch control.
Each project's provider and private-receipt continuations keep their own scope.
A cursor is not permission and cannot be moved to another project or filter.
Changed immutable source records require restarting that receipt read.

The source-collection budget is eighty calls, eight MiB and twenty-five seconds.
Bounded, throttled, unavailable, absent and invalid sources remain gaps. All plates
counts describe only deduplicated observed records. No matching results is not
proof that nothing ran. Local-machine CLI history remains disconnected until an
authenticated reporting bridge exists.

## Distinguish authored records and private receipts

Retained validated night items and supported archived CLI summaries are authored
observations, not independently authenticated execution attempts. Original states,
source revisions and declared allocations remain separate from actual usage. A
night observation links to the project's full Daily view. Unsupported archived
formats are explicit gaps; there is no scan of local files or transcript upload.

Private history lists only minimal authorized receipt projections. Decision/walk
operations retain their actor/project scope; private workspace migrations are
listed separately. A missing history migration or unavailable store does not
become an empty-success response. Inferred record time is labeled as inferred;
it is never an execution-start timestamp.

Activity does not recover or reconcile operations. Follow the original receipt
link to inspect that operation separately. Keep its identity after uncertainty;
reading history is never permission for another submission. Preview contents,
private lesson text, raw failure payloads and credentials are not returned here.

## Implementation and activation

This guide describes the source implementation for phase 102. It is separate from
the production deployment; source implementation and hosted activation are
tracked independently in each phase record. Hosted routine history
needs its own deployment, approved Actions-read grant, read-only history database
migration and actual App/API checks. The owner then compares real attempts,
including a failure or skip, from desktop and phone. Synthetic browser and adapter
proof does not replace that exercise.

See the [routine-history contract](../specs/web-routine-history.md),
[phase status](../phases/102-routines-have-a-complete-observed-history.md) and
[collection operating plan](../specs/web-fleet-operations.md). The separate [durable worker controls](web-workers.md) require approved
registration, live activation and budget; these inspection pages do not grant
execution authority.
