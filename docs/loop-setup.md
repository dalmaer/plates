# Loop activation

The Loop practice is prepared locally. Collection has not been activated or
verified. The first successful pull generates `docs/LOOP.md`; the renderer
explicitly permits its absence while no findings exist. `.stitch.json` deliberately has an empty workspace: use the exact
workspace id confirmed by the Loop service; never reuse another project's id.

Before publication and activation:

1. Verify the existing Loop workspace and its repository binding for
   `dalmaer/plates`, or obtain approval to enroll it.
2. Verify the service account, API key scope and applicable usage/billing terms.
   With approval, make the scoped key available as the repository secret
   `STITCH_API_KEY`; no key belongs in this checkout.
3. Set `.stitch.json` to the verified workspace id. Review the workflow diff,
   including its permissions, schedule and findings-only queue drain, before
   publishing and merging.
4. Run the project gate before publication. The local preparation checks are
   limited checks and do not establish a full-gate or production pass.
5. After approval, dispatch `plates-loop.yml` once. Confirm Getting insights
   and Project validation separately, inspect the findings PR and confirm the
   workspace/repository match. A successful pull is not an accepted finding
   or a verified application fix.

The existing managed workflow schedules collection daily at **09:43 UTC** with
a **30-minute job limit** and serialized runs (`cancel-in-progress: false`).
It skips when the key is absent. A configured key with no workspace fails
rather than guessing. It installs the official Stitch CLI and reads insights;
it never mines, decides, pushes triage decisions, or implements findings.
Model proving is explicitly off (`loop.prove: false`).

The workflow requests `contents: write`, `pull-requests: write`, and
`actions: read`. It publishes a findings-only PR and uses the existing queue
drain, which can merge eligible data PRs after validation and close superseded
ones. This is part of the activation review, not evidence of acceptance.

Actual monthly usage and service pricing are unverified. At the job timeout,
30 scheduled runs would permit up to 900 Linux runner minutes per repository
per 30 days; this is a runtime bound, not an estimate or price. Manual runs add
to it. No new model budget or paid service commitment has been approved.

Plates owns `tests/loop.test.mjs` as the practice implementation's test suite.
That path is explicitly ejected from managed installation so those tests are
never overwritten. The source gate separately runs `npm run loop:check` to
validate this repository's actual findings and generated index.
