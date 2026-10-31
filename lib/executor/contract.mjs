// The qualification contract a session executor must pass before it runs a
// real Plates task (phase 146). An adapter supplies a plain capability
// declaration; this module only reads it. No executor is imported, launched or
// contacted here, and nothing here grants authority.
//
// Each refusal reason is one finding of the stopped OpenHands (SDK 1.59.0) and
// Gas City trials, 2026-10-30 (unpublished branches codex/openhands-evaluation
// and codex/gas-city-evaluation; summary in
// docs/research/2026-10-30-own-judgment-rent-the-rest.md). Undeclared or
// unrecognised values are refused under the same reason: missing evidence is
// never a pass.

/**
 * @typedef {object} ExecutorCapabilities
 * @property {1} schema
 * @property {string} executor                 name of the adapter, for the record
 * @property {{ perCaller: boolean }} identity  each caller is a distinct principal (no shared admin key)
 * @property {{ approval: 'ask'|'deny'|'auto', defaultAccess: 'none'|'workspace'|'full' }} permissions
 * @property {Array<{ name: string, bypassesApprovals: boolean, bypassesSandbox: boolean }>} presets  every bundled preset or profile
 * @property {{ create: 'durable'|'memory'|'none', inbound: 'durable'|'memory'|'none' }} dedupe  survives a restart only when 'durable'
 * @property {{ idempotencyKey: boolean }} posts  every mutating post carries a caller-chosen key
 * @property {{ reported: 'per-step'|'per-run'|'none' }} usage
 * @property {{ check: 'before-step'|'after-step'|'none' }} budget
 * @property {{ enforced: boolean }} deadline   a wall deadline stops the work
 * @property {{ inherits: boolean }} environment  child processes inherit the caller's environment
 * @property {{ level: boolean, doorClasses: boolean }} autonomy  honours phase 132's level and the two-way/one-way door classes
 */

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const at = (x, ...keys) => keys.reduce((v, k) => (object(v) ? v[k] : undefined), x);

/** Refusal reasons, in the order they are reported, with the finding each one keeps. */
export const REFUSALS = Object.freeze({
  'permissions-auto-approved': {
    requires: 'permissions.approval is "ask" or "deny"; an executor never approves its own permission requests',
    finding: 'OpenHands: the ACP path auto-approves permissions.',
  },
  'full-access-by-default': {
    requires: 'permissions.defaultAccess is "none" or "workspace"',
    finding: 'OpenHands: the ACP path defaults to full access.',
  },
  'preset-bypasses-policy': {
    requires: 'presets is a list and no preset bypasses approvals or the sandbox',
    finding: 'Gas City: the bundled Codex preset bypasses approvals and the sandbox.',
  },
  'callers-share-one-identity': {
    requires: 'identity.perCaller is true',
    finding: 'OpenHands: shared-key auth maps every caller to one admin.',
  },
  'dedupe-lost-on-restart': {
    requires: 'dedupe.create and dedupe.inbound are "durable"',
    finding: 'Gas City: create and webhook dedupe live in memory and are lost on restart; an inbound retry can notify an agent twice.',
  },
  'posts-not-idempotent': {
    requires: 'posts.idempotencyKey is true',
    finding: 'OpenHands: posts carry no idempotency key.',
  },
  'usage-not-reported': {
    requires: 'usage.reported is "per-step" or "per-run"',
    finding: 'Both trials: Plates keeps usage; an executor that reports none cannot be settled.',
  },
  'budget-checked-after-step': {
    requires: 'budget.check is "before-step"',
    finding: 'OpenHands: the budget check runs after a step.',
  },
  'no-deadline': {
    requires: 'deadline.enforced is true',
    finding: 'Gas City: the subprocess runtime has no deadline.',
  },
  'environment-inherited': {
    requires: 'environment.inherits is false',
    finding: 'Gas City: the subprocess runtime inherits the environment.',
  },
  'autonomy-level-ignored': {
    requires: 'autonomy.level is true',
    finding: 'Both trials: Plates keeps authority; an executor must honour the project autonomy level.',
  },
  'door-classes-ignored': {
    requires: 'autonomy.doorClasses is true',
    finding: 'Both trials: Plates keeps authority; an executor must honour the two-way/one-way door classes.',
  },
});

/** @type {Record<keyof typeof REFUSALS, (x: any) => boolean>} true when the declaration holds the executor to policy. */
const HOLDS = {
  'permissions-auto-approved': x => ['ask', 'deny'].includes(at(x, 'permissions', 'approval')),
  'full-access-by-default': x => ['none', 'workspace'].includes(at(x, 'permissions', 'defaultAccess')),
  'preset-bypasses-policy': x => Array.isArray(x.presets) && x.presets.every(p => object(p) && p.bypassesApprovals === false && p.bypassesSandbox === false),
  'callers-share-one-identity': x => at(x, 'identity', 'perCaller') === true,
  'dedupe-lost-on-restart': x => at(x, 'dedupe', 'create') === 'durable' && at(x, 'dedupe', 'inbound') === 'durable',
  'posts-not-idempotent': x => at(x, 'posts', 'idempotencyKey') === true,
  'usage-not-reported': x => ['per-step', 'per-run'].includes(at(x, 'usage', 'reported')),
  'budget-checked-after-step': x => at(x, 'budget', 'check') === 'before-step',
  'no-deadline': x => at(x, 'deadline', 'enforced') === true,
  'environment-inherited': x => at(x, 'environment', 'inherits') === false,
  'autonomy-level-ignored': x => at(x, 'autonomy', 'level') === true,
  'door-classes-ignored': x => at(x, 'autonomy', 'doorClasses') === true,
};

/**
 * Qualify an executor from its declared capabilities.
 * @param {ExecutorCapabilities | unknown} declaration
 * @returns {{ qualified: boolean, refusals: string[] }}
 */
export function qualifyExecutor(declaration) {
  if (!object(declaration) || /** @type {any} */ (declaration).schema !== 1) return { qualified: false, refusals: ['declaration-invalid'] };
  const refusals = Object.keys(REFUSALS).filter(reason => !HOLDS[/** @type {keyof typeof REFUSALS} */ (reason)](declaration));
  return { qualified: refusals.length === 0, refusals };
}
