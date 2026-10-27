// A user-selected collaboration preference, never a harness permission grant.
import { createHash } from 'node:crypto';

export const AUTONOMY_MODES = Object.freeze(['default', 'local', 'delivery']);
export const AUTONOMY_SCOPES = Object.freeze(['local-edits', 'tests', 'push', 'merge', 'deployment', 'security']);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const repoOK = x => typeof x === 'string' && /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(x) && !x.endsWith('/.') && !x.endsWith('/..');
// Exact short branch names only. No refspecs, wildcards, revision expressions or options.
const branchOK = x => typeof x === 'string' && x.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(x)
  && !x.includes('..') && !x.includes('//') && !x.endsWith('.') && !x.endsWith('/')
  && x.split('/').every(p => !p.startsWith('.') && !p.endsWith('.lock')) && x !== 'HEAD' && !x.startsWith('refs/');
export const autonomyDigest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class AutonomyError extends Error {
  constructor(message) { super(message); this.exitCode = 2; }
}
const refuse = message => { throw new AutonomyError(message); };

/** No inheritance from a global preference or approval history. Missing means legacy behavior. */
export function validateAutonomy(value, repository) {
  if (!repoOK(repository)) refuse('Autonomy requires an explicit owner/repository in .plates/plates.json.');
  if (value === undefined) return { schema: 1, repository: repository.toLowerCase(), mode: 'default', push: [], merge: [] };
  if (!record(value) || Object.keys(value).sort().join(',') !== 'merge,mode,push,repository,schema'
    || value.schema !== 1 || !AUTONOMY_MODES.includes(value.mode) || !repoOK(value.repository)
    || value.repository.toLowerCase() !== repository.toLowerCase()) refuse('Invalid or differently bound autonomy setting; no authority inferred.');
  for (const scope of ['push', 'merge']) {
    if (!Array.isArray(value[scope]) || value[scope].length > 20 || !value[scope].every(branchOK)
      || new Set(value[scope]).size !== value[scope].length || value.mode !== 'delivery' && value[scope].length) {
      refuse('Delivery destinations must be distinct exact branch names, only in delivery mode.');
    }
  }
  return { schema: 1, repository: repository.toLowerCase(), mode: value.mode, push: [...value.push].sort(), merge: [...value.merge].sort() };
}

export function autonomyReport(value, repository) {
  const policy = validateAutonomy(value, repository);
  const scopes = AUTONOMY_SCOPES.map(scope => {
    let authority = 'specific-approval';
    if (policy.mode === 'default') authority = 'existing-policy';
    else if (scope === 'local-edits' || scope === 'tests') authority = 'within-authorized-task';
    else if (policy.mode === 'delivery' && policy[scope]?.length) authority = 'selected-destinations';
    return { scope, authority, ...(['push', 'merge'].includes(scope) ? { branches: policy[scope] } : {}) };
  });
  return {
    schema: 1, policy, policyDigest: autonomyDigest(policy), configured: value !== undefined,
    scopes, effectiveAuthority: 'requires-current-context',
    boundaries: [
      'Only the current authorized task; no new work, budget or recurring work.',
      'Platform permissions, project rules and command-specific approval and proof gates still apply.',
      'Delivery requires the verified repository and exact destination; force pushes, deletion and bypasses are excluded.',
      'Deployment, credentials, security, CI permissions, policy and assistant-rule changes need specific approval.',
      'A saved setting or approval pattern is not proof of human consent. Verify the current selection and its provenance.',
    ],
  };
}

/**
 * Integration seam for permission preflight. Callers supply independently verified
 * current facts; unknown facts never become permission. This function performs no action.
 * classification must reflect effects, including scripts invoked by tests, not a command name.
 */
export function evaluateAutonomy({ policy: value, repository, action, context = {} }) {
  const report = autonomyReport(value, repository);
  const result = (decision, reason) => ({ decision, reason, policyDigest: report.policyDigest, scope: action?.scope ?? null });
  if (!record(action) || !AUTONOMY_SCOPES.includes(action.scope)) return result('unavailable', 'unknown-action-scope');
  if (Object.keys(action).some(key => !['scope', 'repository', 'target'].includes(key))) return result('unavailable', 'unsupported-action-details');
  // These ceilings also apply when the preference is missing/default.
  for (const key of ['platform', 'project', 'commandGates']) {
    if (context[key] === 'denied') return result('blocked', `${key}-denied`);
  }
  if (report.policy.mode === 'default') return result('inherit', 'existing-behavior');
  if (context.taskAuthorized !== true) return result('ask', 'task-not-authorized');
  if (context.selectionVerified !== report.policyDigest) return result('ask', 'current-selection-not-verified');
  if (typeof action.repository !== 'string' || action.repository.toLowerCase() !== report.policy.repository) return result('ask', 'repository-outside-selection');
  if (['deployment', 'security'].includes(action.scope) || ['sensitive', 'destructive'].includes(context.classification)) {
    return result('ask', 'specific-approval-required');
  }
  if (context.classification !== 'routine') return result('unavailable', 'action-effects-not-verified');
  if (['push', 'merge'].includes(action.scope) && !report.policy[action.scope].includes(action.target)) return result('ask', 'destination-outside-selection');
  for (const key of ['platform', 'project', 'commandGates']) {
    if (context[key] !== 'allowed') return result('unavailable', `${key}-not-verified`);
  }
  return result('proceed', 'within-selected-authority');
}

/** Optional UX hint from explicit aggregate input; never reads logs or saves a policy. */
export function suggestAutonomy({ approved, declined } = {}) {
  if (![approved, declined].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  if (approved < 5 || declined !== 0) return null;
  return { mode: 'local', authority: 'suggestion-only', requiresExplicitSelection: true,
    message: 'Consider local mode for routine edits and tests within authorized tasks. Review its scope and confirm explicitly; past approvals grant no new authority.' };
}
