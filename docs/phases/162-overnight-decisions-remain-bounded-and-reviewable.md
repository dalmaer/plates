---
status: partial
since: 2026-11-04
goal: G4
spec: 2
depends: [157, 73, 90]
note: "Increment 1 built: a versioned, validate-only decision envelope binding a choice to its plan item, source and existing authority; nothing writes, routes or shows envelopes yet."
evidence: ["evidence/2026-11-04-night-decisions.md"]
---

# Overnight decisions stay within bounds and can be corrected in the morning

## Done when

Within the existing night plan, an authorized builder resolves reversible choices, parks permission-dependent actions while continuing independent work, and gives the morning an evidence-linked ranked account of decisions, effects and safe corrections.

## Scope

Implement the [dated Nightwatch extension](../research/2026-10-14-nightwatch.md#extension-bounded-overnight-decisions-2026-11-02-designed-not-implemented), preserving plan/build/morning phases
73–78, current decision context (90) and the implemented decision loop (150).
Keep phase 150's unfinished real-use observation separate. Use the existing plan,
records and delivery channels; the plan still chooses only existing authorized
lanes. Deterministic measurement never starts a model to make optional choices.

Preserve budgets, `willNotTouch`, settled choices, measured build admission,
five-build limit, `readyBy`, source privacy and existing merge/review authority.
Non-goals: a replacement night scheduler, automatic merges, blanket suppression of
questions, disabled approval/tool hooks, a new authority store, or permission to
run a paid or externally mutating overnight trial.

## Integration increments

1. First safe merge: a backward-compatible decision envelope contract and synthetic
   examples binding a choice to its plan item, source and existing authority.
   No execution or new plan fields become active merely because a record exists.
2. Add structured journal writes/reads using current decision records and original
   operation identities. Old records remain readable; missing fields stay unknown.
3. Add opt-in harness routing for ordinary optional questions: choose only a scoped
   reversible default; park required permission and dependent actions, then continue
   independent work. Preserve every tool refusal and required approval hook.
4. Add a ranked morning decision section alongside existing completed-work outcomes,
   using the actual configured CLI/workflow destination and unchanged deduplication.
5. Link keep/adjust/revert feedback to the original choice and a new safe increment;
   validate current source and authority before effects. Disable the routing if
   faulty while retaining receipts and read access; do not erase previous actions.

## Acceptance

- [x] The decision envelope records scope/plan item, alternatives and rationale, evidence and confidence/uncertainty, expected versus measured consequences, affected commit/flag/configuration, validation, actual effects and recovery limits. Check: `tests/night-decisions.test.mjs: "envelope preserves scope, evidence, effects and unknowns"` and `"legacy plans and decision records remain readable"`.
- [ ] Routine ambiguity can select a reversible default within the existing budget and scope; missing permission parks only dependent actions and independent authorized work continues. Check: proposed `tests/night-decisions.test.mjs: "a reversible optional choice continues within scope"` and `"permission-bound dependencies park while independent work continues"`.
- [ ] Required approval/tool hooks, refusals, protected paths, settled choices, budget and merge restrictions cannot be bypassed by an overnight label, missing reply or model-written approval. Check: proposed `tests/night-decisions.test.mjs: "overnight mode cannot manufacture authority or bypass a hook"`.
- [ ] Resume/uncertain outcomes inspect original receipts without repeating external effects; chosen, blocked, completed, failed and uncertain states cannot be conflated. Check: proposed `tests/night-decisions.test.mjs: "resume inspects the original uncertain operation without redispatch"`.
- [ ] The morning separates issue-linked completed work from decisions worth revisiting, ranks impact/uncertainty/reversal cost, exposes missing coverage and compares expected with measured consequences, including interacting choices. Check: proposed `tests/morning.test.mjs: "ranked calls remain separate from completed work"` and `tests/night-decisions.test.mjs: "interacting choices keep predictions separate from measured consequences"`.
- [ ] Keep/adjust/revert feedback preserves the original decision, revalidates source/authority, records the next safe increment and checks its outcome; irreversible effects are not falsely presented as undone. Check: proposed `tests/decision-loop.test.mjs: "morning correction binds the original decision and current authority"` plus the existing irreversible-outcome guard.
- [ ] One already-authorized night demonstrates a bounded choice, a parked dependent action, independent progress and a useful morning correction through the configured real report path. Check: ⚑ by hand: owner reviews the recorded night and one correction, with no new spend or channel inferred from this phase.

## Your part

- **Ask:** Review the completed work and ranked decisions from the prepared night, then keep, adjust or reverse one choice within its safe recovery boundary.
- **Why:** It proves that autonomy saves interruptions without hiding consequences or losing your ability to steer.
- **Look at:** The plan, original decision/effect receipts, morning report and exact correction preview.
- **Choices:** Keep the choice | Adjust it | Revert within its documented limits | Defer
- **Keeps it open:** Defer
- **Takes:** Set from the prepared report and correction; no unapproved run is required.
- **Then:** Keep records the observation; adjust/revert prepares the next safe increment under existing authority; defer leaves the review outstanding.
- **Ready when:** The envelope, local negative cases, configured report path and exact bounded night/correction scope are prepared and authorized.

## Real surfaces

- workflow shell: the existing authorized night runner preserves budget, admission, original receipts and required hooks while exercising the routing.
- owner's machine: the actual morning report separates completed effects from revisitable decisions and supports a source-bound correction.

## Proof

The tests named above are implementation targets, not tests claimed to exist yet.
Build the pure envelope/validation slice first, following the design's private
receipt and reviewed-summary boundary. Once those tests exist, run
`npm run check:focused -- tests/night-decisions.test.mjs tests/night-plan.test.mjs tests/morning.test.mjs tests/decision-loop.test.mjs`, then `npm run check` and
`npm run typecheck`. Negative cases include spoofed approval, denied tool calls,
insufficient budget, protected/settled work, missing evidence, interacting choices,
uncertain effects, resume and irreversible reversal. Use synthetic side effects.

The real walk uses an already authorized plan and its configured morning delivery;
prepare any new scope, destination or spend for the existing separate approval.
Observe actual decision-to-effect links and one correction. Synthetic fixtures
and an owner's morning read cannot retroactively authorize overnight actions.

## Deliberately open

The envelope, receipt linkage, privacy boundary, ranking and correction rules are
specified in the dated design extension. Harness adapters may have different
optional-question capabilities; identify them explicitly while implementing the
routing slice, and park unsupported interactions. No choice here authorizes a
provider or host permission change. The existing runner's exact private storage
adapter and real-night target are selected from current configuration before
activation; unavailable approved storage blocks execution. Phase 150's outstanding
month of use remains its own proof, not a prerequisite manufactured for the pure
contract slice or acceptance supplied by this phase.

## Next action

Increment 2: structured journal writes and reads of envelopes, using current decision records and original operation identities; old records stay readable and missing fields stay unknown.

## Trajectory
- **2026-11-04** — An unknown is an object (`{ "unknown": "<why>" }`), not null, so null keeps meaning "none"; and an envelope names its authority by reference only, rejecting any approval, consent or override key at any depth. tests/night-decisions.test.mjs.
