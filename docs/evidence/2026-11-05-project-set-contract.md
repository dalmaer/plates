# Project-set contract increment — 5 November 2026

Split from the preserved consolidation PR324, following its independent review's request for independently safe increments. The shared pure model is byte-identical to `ccc42c5990b9366075eef3e82f405468997ee859:lib/web/project-sets.mjs`. Configuration gains only optional registry validation and nonsecret owner readback. No Home/history route consumes it yet.

Focused configuration and contract tests ran against synthetic Acme bindings. They cover hidden/revoked membership, pinned repository IDs, version changes, malformed/duplicate members, absence by default and detached configuration snapshots. Required hosted integration and independent review are separate; no full-gate pass or real-use acceptance is claimed here.

No database migration, feature activation, provider enrollment, credential grant, schedule or deployment was performed. Reverting the source increment restores the prior config schema; an instance that later opts into the optional field must remove it before reverting.
