import { digest, runtimeBinding } from './runtime.mjs';
import { validateConfig } from './bridge.mjs';
const permits = new WeakMap();
// An explicit deployment choice. API conversation workers are not agent sessions.
export const hostPolicy = Object.freeze({ mode: 'dedicated-agent-runtimes', isolation: 'separate-containers',
  tools: 'conversation', budget: 'admission-estimates' });
const keys = (value, expected) => value && typeof value === 'object' && Object.keys(value).sort().join() === [...expected].sort().join();
const reference = value => typeof value === 'string' && /^(keychain|secret):[A-Za-z0-9._/-]{1,150}$/.test(value);

// Pure validation: no filesystem, credentials, SDK imports, processes or network.
export function inspectDeployment(manifest) {
  if (!keys(manifest, ['version', 'enabled', 'policy', 'stateDirectory', 'discordSecrets', 'authSecrets', 'runtimes', 'hostPolicy'])
    || manifest.version !== 1 || typeof manifest.enabled !== 'boolean'
    || !keys(manifest.runtimes, ['codex', 'claude']) || !keys(manifest.discordSecrets, ['codex', 'claude'])
    || !keys(manifest.authSecrets, ['codex', 'claude'])) throw new Error('deployment_schema');
  const blockers = [], bindings = {};
  if (manifest.policy?.trial?.threadId === null) blockers.push('trial_thread_required');
  try { validateConfig(manifest.policy); if (!manifest.policy.trial) blockers.push('one_run_trial_required'); }
  catch { blockers.push('invalid_trial_policy'); }
  if (!keys(manifest.hostPolicy, Object.keys(hostPolicy)) || Object.entries(hostPolicy).some(([key, value]) => manifest.hostPolicy[key] !== value)) blockers.push('unsupported_host_policy');
  if (!manifest.enabled) blockers.push('live_disabled');
  if (typeof manifest.stateDirectory !== 'string' || !manifest.stateDirectory.startsWith('/') || manifest.stateDirectory.includes('/../')) blockers.push('private_state_directory_required');
  for (const runtime of ['codex', 'claude']) {
    const policy = manifest.runtimes[runtime];
    if (!keys(policy, ['model', 'accountScope', 'authMode', 'version', 'cwd', 'microUsdPerToken'])) throw new Error('deployment_runtime_schema');
    try { bindings[runtime] = runtimeBinding(runtime, policy); } catch { blockers.push(`${runtime}_policy_unselected`); }
    if (typeof policy.cwd !== 'string' || !manifest.stateDirectory || !policy.cwd.startsWith(`${manifest.stateDirectory}/runtimes/${runtime}/`)) blockers.push(`${runtime}_dedicated_directory_required`);
    if (!reference(manifest.discordSecrets[runtime])) blockers.push(`${runtime}_discord_secret_reference_required`);
    if (policy.authMode === 'api-key' ? !reference(manifest.authSecrets[runtime]) : manifest.authSecrets[runtime] !== null) blockers.push(`${runtime}_auth_reference_mismatch`);
  }
  if (manifest.discordSecrets.codex === manifest.discordSecrets.claude) blockers.push('distinct_discord_credentials_required');
  return { mode: 'dry-run', digest: digest(manifest), readyForHostValidation: blockers.length === 0, blockers, bindings,
    hostPolicy: { ...hostPolicy }, providerBillHardCap: false, liveStarted: false, credentialReads: 0 };
}
export function issueLivePermit(policy, deploymentDigest) {
  const permit = Object.freeze({}); permits.set(permit, { digest: digest(policy), deploymentDigest }); return permit;
}
export function livePermitBinding(permit, policy) {
  const record = permits.get(permit);
  if (!record || record.digest !== digest(policy)) throw new Error('live_authorization_required');
  return record.deploymentDigest;
}
