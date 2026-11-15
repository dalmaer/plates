// Main vs production for one plate: the default branch's head beside the commit
// production serves, from the deploy records `plates promote` writes
// (deploys.jsonl on the verify branch). One model, two renderers: the hosted
// reader (lib/web/projects.mjs) and the CLI's checkout reader (lib/home.mjs)
// both parse their records (morning.mjs deployResults) and hand them to
// releaseOf, and Your plates draws releaseView's line. This module imports
// nothing, so lib/work-items.mjs's closure stays as small as the names
// observation bounds it.

const SHA = /^[a-f0-9]{40}$/;
export const RELEASE_FILE = 'deploys.jsonl';

/**
 * Each deployment id the records tie to a commit: a deploy's own deployment, and any
 * serving or target that names its commit. A rollback's serving names only its id;
 * this is how its commit is known.
 */
function commitsById(deploys) {
  const known = new Map();
  const note = (d, commit) => { if (d?.id && SHA.test(commit ?? '') && !known.has(d.id)) known.set(d.id, commit); };
  for (const r of deploys) {
    note(r.serving, r.serving?.commit); note(r.target, r.target?.commit); note(r.deployment, r.deployment?.commit);
    if (r.action === 'deploy') note(r.deployment, r.commit);
  }
  return known;
}

/** The commit production serves after one deploy record, or null when the records cannot say. */
export function servingOf(r, known = new Map()) {
  if (SHA.test(r?.serving?.commit ?? '')) return r.serving.commit;
  if (r?.serving?.id && known.has(r.serving.id)) return known.get(r.serving.id);
  if (r?.ok === true && r.action !== 'verify' && SHA.test(r.commit ?? '')) return r.commit;
  if (r?.rolledBack === true && SHA.test(r?.target?.commit ?? '')) return r.target.commit;
  return null;
}

/**
 * One plate's release: { state, main, production, ahead, why }.
 *   state: 'current' (production serves main's head), 'behind' (it serves a commit main has moved past),
 *          'none' (no deploy recorded) or 'unknown' (the records could not be read, or do not say).
 *   production: { sha, at, checkedAt, deployment } or null: `at` is when that commit began serving
 *   (null when no record says), `checkedAt` the newest record's time.
 *   ahead: main's commits production lacks, or null.
 * deploys: parsed deploy records (morning.mjs deployResults), any order.
 * Unequal is not yet behind: the caller establishes that main contains production (withLead);
 * until then the release is unknown. An unread source is never "no deploy": it is unknown, with why.
 */
export function releaseOf({ main, deploys = [], unread = null }) {
  const head = SHA.test(main ?? '') ? main : null;
  const unknown = (why, production = null) => ({ state: 'unknown', main: head, production, ahead: null, why });
  if (!head) return unknown('the default branch head was not read');
  if (unread) return unknown(String(unread).split('\n')[0].slice(0, 200));
  const sorted = [...deploys].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), latest = sorted[0];
  if (!latest) return { state: 'none', main: head, production: null, ahead: null, why: 'no production deploy recorded' };
  const known = commitsById(sorted), sha = servingOf(latest, known);
  if (!sha) return unknown(latest.rolledBack === 'failed' ? `the rollback after ${latest.commit.slice(0, 7)} failed; what production serves is not recorded` : 'the latest deploy record names no serving commit');
  // When it began serving: the oldest record of the newest unbroken run serving this commit that moved production
  // (a deploy or a rollback, not a verify or a failed build that left it in place).
  let at = null;
  for (const r of sorted) {
    if (servingOf(r, known) !== sha) break;
    if (r.action !== 'verify' && (r.ok === true || r.rolledBack === true || r.action === 'back')) at = r.at;
  }
  const production = { sha, at, checkedAt: latest.at, deployment: latest.serving?.id ?? latest.deployment?.id ?? null };
  if (sha === head) return { state: 'current', main: head, production, ahead: 0, why: null };
  return unknown('main has not been shown to contain it', production);
}

/**
 * The release once its relation to main is read: `relation` is 'ahead' (main contains production, `ahead` commits on),
 * or anything else (diverged, behind, unreadable), which leaves it unknown with why.
 */
export function withLead(release, { relation, ahead = null, why = null } = {}) {
  if (release?.state !== 'unknown' || !release.production || release.production.sha === release.main) return release;
  if (relation === 'ahead' && Number.isSafeInteger(ahead) && ahead > 0) return { ...release, state: 'behind', ahead, why: null };
  return why ? { ...release, why: String(why).slice(0, 200) } : release;
}

// validRelease and releaseView, the row both forms draw, live in lib/work-items.mjs beside Your plates' other rows.
