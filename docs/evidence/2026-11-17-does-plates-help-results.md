---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 13 — does plates help, results against the pre-registration

- Date: 2026-11-17
- Phase: 13
- Revision: base `origin/main` and the commits on `claude/phase-13-results` ("research: does plates help — results against the 2 October pre-registration (phase 13)")
- Claim being checked: the results page compares the fleet before and after adoption on the measures fixed on 2026-10-02, and says plainly what it found, including a null result (Acceptance box 2).

Built by a builder subagent (Fable); verified by the conductor.

## Automated checks

- `node --import ./tests/helpers/hermetic.mjs --test tests/research-does-plates-help.test.mjs`: exit 0, pass 5, fail 0 (run by the conductor).
- Builder: `npm run check:focused -- tests/research-does-plates-help.test.mjs tests/docs.test.mjs tests/record-validation.test.mjs` plus the package, validation-plan, roadmap and reconciliation tests: exit 0.
- Gate: `npm run check` runs on the PR; its result is in the PR.

## By hand

| Did | Expected | Observed | Proves / does not prove |
| --- | --- | --- | --- |
| Read the Verdict | a plain statement, null or not | "does not show that plates makes projects better. It does not show harm either. Mostly it cannot tell." | Box 2: the null result is stated as plainly as a positive one would be |
| Checked the pre-registration is unchanged | byte-identical to `45a52ee` apart from its rename | the page says so and names each deviation (isocan adopted 2.2 days into the after window; measure 4 rebuilt from weekly trees; marked substitutes for measures 5 and 6) | The comparison was not redefined after looking |
| Searched the page and script for private details | none | no local paths, emails, private SHAs or names of unlisted private projects; only ledger, duo, cajones, isocan, plates and plates-inbox, already public in plates's docs | Publishing is safe |
| Re-ran the numbers | reproducible from named commands | not re-run by the conductor (API quota); the builder re-ran the page's exact commands and the numbers reproduced | Reproducibility rests on the builder's rerun and the named commands |

## Gaps and decision

Built: the page exists, follows the pre-registration, and reports a null result plainly. The golden tasks with and without skills stay deliberately open (they spend model tokens and wait for the owner's yes on cost). A comparison able to tell needs a project adopted later with weeks of history, while another stays unadopted; the page lists these as observations.
