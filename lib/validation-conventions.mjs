// The source conventions every focused preflight runs (scripts/check-focused.mjs) and the
// validation planner selects for source changes (lib/validation-plan.mjs). In lib/ so the
// shipped planner never imports a development script.
export const REQUIRED_CONVENTIONS = Object.freeze([
  'tests/helpers.test.mjs',
  'tests/docs.test.mjs',
  'tests/guides.test.mjs',
  'tests/cli.test.mjs',
  'tests/adopt.test.mjs',
  'tests/skill.test.mjs',
  'tests/guide-consumers.test.mjs',
  'tests/web-operation-coverage.test.mjs',
  // A G7 phase that owes a walk needs an activation step: caught here, not first in the full gate (2026-11-02).
  'tests/web-activation-plan.test.mjs',
  'tests/check-focused.test.mjs',
]);
