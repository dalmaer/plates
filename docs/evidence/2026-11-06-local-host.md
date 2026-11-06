---
attempt: {"accepted":true,"verified":true,"rework":0,"lessonStatus":{"status":"none"}}
---

# Evidence: phase 183 — a local agent host can take a phase

- Date: 2026-11-06
- Phase: 183
- Revision: "the local-host route" (87dd7cc5) and this record's commit
- Claim being checked: the `local-host` route claims with the host's provider, hands it a brief byte-identical to the preview, runs it once with a scrubbed environment, and shows only the state the host reports.

## Automated checks

- The builder ran `node --test tests/backlog-attach.test.mjs tests/work-items.test.mjs`: exit 0, 25 of 25. It also ran `npm run check:focused` over backlog-attach, backlog-assist, backlog-agents, work-items, home-isomorphism, web-backlog, surface-budget, record-validation, names-verify, names-observation, web-design, web-home, web-home-answers and roadmap: exit 0.
- Acceptance tests in tests/backlog-attach.test.mjs, all using a fake host script in the test's temp dir (no agent started):
  - "local host brief matches its preview": stdin equals the preview byte for byte, and GH_TOKEN and PLATES_* are absent from the host's environment.
  - "a silent host is never running".
  - "local host needs the policy".

## Gaps and decision

Partial; owes the owner's walk with a real host. The host config is private, in `~/.config/plates/local-hosts.json`, and a copy inside the checkout is refused. Presence "active" (from pushes) is not computed yet.
