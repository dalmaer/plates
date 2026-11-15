// Main vs production for one plate: the default branch's head beside the commit
// production serves, from the deploy records `plates promote` writes
// (deploys.jsonl on the verify branch). One model, two renderers: the hosted
// reader (lib/web/projects.mjs) and the CLI's checkout reader (lib/home.mjs)
// both hand their reads to releaseOf, and Your plates draws releaseView's line.
import { deployResults } from '../practices/night/files/scripts/plates/morning.mjs';
import { readNames } from '../practices/night/files/scripts/plates/names.mjs';

const SHA = /^[a-f0-9]{40}$/;
/** The branches whose deploys.jsonl is read, the current name first. */
export const releaseBranches = () => readNames('git ref:keel-verify');
export const RELEASE_FILE = 'deploys.jsonl';

/** The commit production serves after one deploy record, or null when the record cannot say. */
export function servingOf(r) {
  if (SHA.test(r?.serving?.commit ?? '')) return r.serving.commit;
  if (r?.ok === true && SHA.test(r.commit ?? '')) return r.commit;
  if (r?.rolledBack === true && SHA.test(r?.target?.commit ?? '')) return r.target.commit;
  return null;
}

/**
 * One plate's release: { state, main, production, ahead, why }.
 *   state: 'current' (production serves main's head), 'behind' (it serves another commit),
 *          'none' (no deploy recorded) or 'unknown' (the records could not be read, or do not say).
 *   production: { sha, at, deployment } or null. ahead: main's commits production lacks, or null.
 * texts: each verify branch's deploys.jsonl text, null where the branch or file is absent; or deploys, already
 * parsed (morning.mjs readVerify's).
 * An unread source is never "no deploy": it is unknown, with why.
 */
export function releaseOf({ main, texts = [], deploys: parsed = null, unread = null }) {
  const head = SHA.test(main ?? '') ? main : null;
  const unknown = why => ({ state: 'unknown', main: head, production: null, ahead: null, why });
  if (!head) return unknown('the default branch head was not read');
  if (unread) return unknown(String(unread).split('\n')[0].slice(0, 200));
  let deploys;
  try { deploys = (parsed ? [...parsed] : texts.filter(t => typeof t === 'string').flatMap(t => deployResults(t))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); }
  catch (error) { return unknown(`the deploy records could not be read: ${String(error?.message ?? error).slice(0, 160)}`); }
  const latest = deploys[0];
  if (!latest) return { state: 'none', main: head, production: null, ahead: null, why: 'no production deploy recorded' };
  const sha = servingOf(latest);
  if (!sha) return unknown(latest.rolledBack === 'failed' ? `the rollback after ${latest.commit.slice(0, 7)} failed; what production serves is not recorded` : 'the latest deploy record names no serving commit');
  const production = { sha, at: latest.at, deployment: latest.serving?.id ?? latest.deployment?.id ?? null };
  return sha === head ? { state: 'current', main: head, production, ahead: 0, why: null } : { state: 'behind', main: head, production, ahead: null, why: null };
}

/** The release with main's lead counted (a read of the commits production lacks); unchanged when the count is not one. */
export const withAhead = (release, ahead) => (release?.state === 'behind' && Number.isSafeInteger(ahead) && ahead > 0 ? { ...release, ahead } : release);

/** A valid release value (the hosted cache keeps one), or false. */
export function validRelease(r) {
  const nullableSha = s => s === null || SHA.test(s ?? '');
  return !!(r && ['current', 'behind', 'none', 'unknown'].includes(r.state) && nullableSha(r.main)
    && (r.production === null || (r.production && SHA.test(r.production.sha ?? '') && typeof r.production.at === 'string' && (r.production.deployment === null || typeof r.production.deployment === 'string')))
    && (r.ahead === null || (Number.isSafeInteger(r.ahead) && r.ahead >= 0)) && (r.why === null || typeof r.why === 'string'));
}

/**
 * Your plates' main-vs-production row, the same for the web card and the CLI:
 * { state, main, production, ahead, at, line }, or null where nothing was read.
 */
export function releaseView(release) {
  if (!validRelease(release)) return null;
  const short = s => s.slice(0, 7), main = release.main ? short(release.main) : null, prod = release.production ? short(release.production.sha) : null;
  const day = release.production?.at?.slice(0, 10) ?? null;
  const line = release.state === 'current' ? `production is main (${main}), deployed ${day}`
    : release.state === 'behind' ? `production ${prod} is ${release.ahead ? `${release.ahead} commit${release.ahead === 1 ? '' : 's'} behind` : 'behind'} main ${main} (deployed ${day})`
    : release.state === 'none' ? `main ${main}; no production deploy recorded`
    : `${main ? `main ${main}; ` : ''}production unknown: ${release.why}`;
  return { state: release.state, main, production: prod, ahead: release.ahead, at: day, line };
}
