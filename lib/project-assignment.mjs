// Phase 196: advice for Assign, using phase 192's existing bounded quota read
// and room eligibility. Advice never attaches, reserves capacity or grants spend.
import {readQuota, roomFor, roomOptions} from '../scripts/plates/audit.mjs';

export async function readAssignmentQuota(options = {}) {
  return readQuota(options);
}
export function assignmentRecommendation(config, observation, {now = Date.now()} = {}) {
  const providers = Object.keys(config?.agents ?? {}).filter(p => /^[a-z][a-z0-9-]{0,39}$/.test(p));
  const none = why => ({provider:null, why, candidates:[]});
  if (!providers.length) return none('No agents are configured for this project.');
  const snapshot = observation?.snapshot;
  if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.providers)) return none('Agent quota is unavailable; no recommendation.');
  if (typeof snapshot.generatedAt !== 'number' || !Number.isFinite(snapshot.generatedAt) || snapshot.generatedAt > now)
    return none('Agent quota has an invalid observation time; no recommendation.');
  let options;
  try { options = {...roomOptions(config), now}; } catch { return none('Agent quota policy is unavailable; no recommendation.'); }
  if (now - snapshot.generatedAt > options.maxAgeMinutes * 60000) return none('Agent quota is stale; no recommendation.');
  const candidates = providers.map(provider => {
    const check = roomFor(snapshot, provider, options);
    const reading = snapshot.providers.find(p => p?.id === provider);
    const windows = Array.isArray(reading?.windows) ? reading.windows.filter(w => w && w.kind !== 'model') : [];
    // Unknown or impossible readings must never win a comparison. Room remains
    // phase 192's decision; rank eligible agents by their least remaining window.
    const valid = windows.length && windows.every(w => Number.isFinite(w.usedPct) && w.usedPct >= 0 && w.usedPct <= 100 &&
      (w.pacePct == null || Number.isFinite(w.pacePct) && w.pacePct >= 0 && w.pacePct <= 100));
    const tightest = valid ? windows.reduce((a,b) => a.usedPct >= b.usedPct ? a : b) : null;
    const remaining = tightest ? Math.round((100 - tightest.usedPct) * 10) / 10 : null;
    const period = tightest?.kind === 'weekly' || tightest?.kind === 'week' ? 'week' : tightest?.kind === 'monthly' || tightest?.kind === 'month' ? 'month' : tightest?.kind === 'session' ? 'session' : 'allowance';
    return {provider, eligible: check.room && !!valid, remaining, why: check.room && valid ? `${provider}: ${remaining}% of its ${period} left` : valid ? check.why : `${provider}: quota is unknown`};
  });
  // A comparison with an unknown/stale candidate cannot establish who has most room.
  if (candidates.some(c => c.remaining === null) || providers.some(provider => { const reading = snapshot.providers.find(p => p?.id === provider); return reading?.fresh !== true || !['green','yellow','red'].includes(reading?.status); }))
    return {...none('Agent quota is incomplete or stale; no recommendation.'), candidates};
  const eligible = candidates.filter(c => c.eligible).sort((a,b) => b.remaining - a.remaining || a.provider.localeCompare(b.provider));
  const best = eligible[0];
  return {provider:best?.provider ?? null, why:best ? `${best.why}; the most room among eligible agents.` : 'No configured agent has room under the quota policy.', candidates};
}
