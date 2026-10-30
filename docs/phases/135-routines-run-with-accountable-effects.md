---
status: designed
since: 2026-10-30
goal: G8
spec: 2
depends: [134, 104, 106]
note: "One bounded execution/effect path specified for manual, scheduled and event work; unsupported cloud/BenOS capabilities and live activation remain gated."
evidence: []
---

# Routines run with accountable effects

## Done when

A selected Plates routine runs through one policy-bound durable operation regardless of trigger, with an explicit outcome and separately reviewed effects, and crashes or uncertain delivery never silently duplicate work or free its allowance.

## Scope

T5–T7 of the [consolidation contract](../specs/switchboard-consolidation.md).
Reuse Plates' operation/reservation/fence, capacity, Connections and schedule
contracts, extending only supported adapter and scope variants. Redesign the
legacy dispatcher, cursor commit and outbox lifecycle for durable recovery; a
successful process and renamed directory do not establish safe effects.

Local runner support, cloud worker support, observation enrollment and execution
authority are distinct capabilities. Maintain explicit placement evidence and
cloud-first advice; BenOS-dependent work remains home-only until remote support
is proved. No existing routine, daemon, permission or credential changes merely
because this phase exists. Automatic reviewer spend remains off unless approved.

## Acceptance

- [ ] Current supported capability, permission, placement, connection, capacity and budget determine selection; unknown/stale evidence waits and unsupported MCP/runner mappings refuse: `npm run check:focused -- tests/routine-execution.test.mjs` (planned file).
- [ ] Manual, scheduled, event and compatibility entrypoints contend for one durable lane; lost spawn/claim responses, stale fences and cancellation uncertainty retain the original operation and allowance: `npm run check:focused -- tests/routine-execution.test.mjs tests/web-jobs.test.mjs` (first file planned).
- [ ] BenOS wake-up and activity catch-up preserve match semantics and coverage; duplicate/concurrent listeners and every intent/start/cursor crash boundary do not redispatch uncertain work: `npm run check:focused -- tests/routine-events.test.mjs` (planned file).
- [ ] Approved effects bind exact bytes, destination, current policy and original operation; changed data, unauthorized records, path escape, duplicate approval and partial/lost delivery refuse or remain uncertain: `npm run check:focused -- tests/routine-effects.test.mjs` (planned file).
- [ ] Schedule changes preserve raw semantics/timezone and use the existing reviewed source operation, while unsupported shapes remain inspectable: `npm run check:focused -- tests/routine-execution.test.mjs tests/web-jobs.test.mjs` (first file planned).
- [ ] Installed adapters pass conformance and package/help tests without ambient credentials or personal config: `npm run check` and `npm run typecheck` on the integrated candidate.
- [ ] A separately approved synthetic local routine and selected cloud adapter demonstrate bounded execution, effect holds and recovery with actual source/host/provider receipts: ⚑ by hand: owner and conductor.

## Your part

- **Ask:** Approve the exact synthetic trial's host, connection, allowed effects and runtime or model allowance.
- **Why:** Implemented adapters do not establish permission to install services, transfer data or spend.
- **Look at:** The trial preview, capability evidence, budget ceiling and recovery plan.
- **Choices:** Run this trial | Keep disabled
- **Keeps it open:** Keep disabled
- **Takes:** About 10 minutes to review; execution bounded by the displayed allowance.
- **Then:** Run this trial: activate only the reviewed synthetic scope and record results. Keep disabled: preserve local implementation proof and explicit activation gaps.
- **Ready when:** Conformance/crash tests pass and every requested capability and price is evidenced or explicitly unavailable.

## Real surfaces

- owner's machine: approved synthetic local runner and BenOS event/effect adapter exercise with private receipts.
- workflow shell: approved registered cloud adapter verifies OIDC/source, budget, begin and recovery; no arbitrary command endpoint.
- GitHub API: approved exact dispatch/readback with no duplicate POST after uncertainty.

## Proof

Run `npm run check:focused -- tests/routine-execution.test.mjs tests/routine-events.test.mjs tests/routine-effects.test.mjs tests/web-jobs.test.mjs`
after the new files exist, then `npm run check` and `npm run typecheck` on the
integrated candidate. Retain original failing crash-case evidence. Live activation
requires a concrete preview naming destination, permissions, ceiling and known
price before execution; unknown charges remain unknown.

## Deliberately open

- BenOS caller-set session and remote MCP/auth were pending in the pinned source.
  Recheck the installed public protocol in T6/T7; no upstream status is asserted.
  Missing support blocks correlation/cloud execution rather than inventing success.
- Current web workers and model routing do not implement general subscription
  runners. T5 must register/prove an adapter and scoped host execution protocol;
  local login credentials never migrate to hosted infrastructure.
- Notification channels may provide no authoritative delivery receipt. T7 retains
  unknown delivery for owner reconciliation, never promises exactly-once delivery.
- Fresh entitlement and enforceable isolation can differ by runner version. T5
  proves current flags and bounds before activation; legacy unknown-as-available
  policy is dropped unless separately and explicitly approved.

## Next action

After phase 134, implement the shared execution conformance suite with fake adapters and failure injection before connecting local processes, event wake-ups or effect delivery.
