// Ready pull requests (plates phase 176). An open PR on an authorized plate
// that passes the merge rule (mergeRule in the night practice's lib.mjs: every
// finding answered, its head reviewed by someone other than its author and by
// each named reviewer; plates review --gate and plates release apply the same
// rule), whose checks pass on its head and which is not a draft, is one card in
// the docket: Merge, Request changes, or Not now. A PR at its review-round
// limit stays a review item, the owner's choice, and never reaches here.
//
// Both forms read it the same way: the repo-wide review read names the
// candidates (unansweredPrs `ready`), then one GraphQL read
// (readyChecksQuery) gives each one's state, draft flag, head, size and the
// head commit's check rollup. A candidate whose head moved between the two
// reads is left out until the next read.
//
// The write is bound to the head the card showed: `gh pr merge
// --match-head-commit` in the terminal, the merge endpoint's `sha` through
// the App (lib/web/pr-merges.mjs), so a push after the card refuses the merge.
import { execFile } from 'node:child_process';
import { environmentValue } from './names.mjs';

/** At most this many candidates a repo are checked in one read. */
export const READY_PER_REPO = 10;
const SHA = /^[0-9a-f]{40}$/;
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 160) => { const t = oneLine(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const gh = env => environmentValue('variable:KEEL_GH', env) ?? 'gh';

/** The one read of the candidates' checks and drafts: an alias per PR number. */
export function readyChecksQuery(numbers) {
  const list = numbers.filter(n => Number.isSafeInteger(n) && n > 0).slice(0, READY_PER_REPO);
  return `query PlatesReadyChecks($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${list.map(n => `p${n}: pullRequest(number: ${n}) { number state isDraft headRefOid additions deletions changedFiles commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } } }`).join(' ')} } }`;
}

/** The read's answer, checked: { [number]: { open, draft, head, checks, additions, deletions, files } }. Throws on a malformed read. */
export function readyChecksOf(repository, numbers) {
  if (!repository || typeof repository !== 'object') throw new Error('the checks read came back without the repository');
  const out = {};
  for (const n of numbers.slice(0, READY_PER_REPO)) {
    const pr = repository[`p${n}`];
    if (pr === null || pr === undefined) continue;
    const commit = pr.commits?.nodes?.[0]?.commit;
    if (pr.number !== n || typeof pr.isDraft !== 'boolean' || !SHA.test(pr.headRefOid ?? '')) throw new Error(`the checks read of #${n} is malformed`);
    out[n] = { open: pr.state === 'OPEN', draft: pr.isDraft, head: pr.headRefOid, checks: commit?.oid === pr.headRefOid ? commit.statusCheckRollup?.state ?? null : null,
      additions: Number.isSafeInteger(pr.additions) ? pr.additions : null, deletions: Number.isSafeInteger(pr.deletions) ? pr.deletions : null, files: Number.isSafeInteger(pr.changedFiles) ? pr.changedFiles : null };
  }
  return out;
}

/** Why a candidate is not ready on this read, or null when it is: checks green on its head, not a draft, still open. */
export function notReady(candidate, checked) {
  if (!checked) return 'its checks were not read';
  if (!checked.open) return 'it is no longer open';
  if (checked.draft) return 'it is a draft';
  if (checked.head !== candidate.head) return 'its head moved since its reviews were read';
  if (checked.checks !== 'SUCCESS') return checked.checks ? `its checks are ${checked.checks.toLowerCase()}` : 'its head has no checks reported';
  return null;
}

/**
 * The docket's merge items for one repo (reviewItems' shape): each candidate
 * that is ready, one item per PR. candidates: unansweredPrs' `ready`;
 * checked: readyChecksOf's answer.
 */
export function mergeItems(repo, candidates, checked) {
  const items = [];
  for (const pr of candidates) {
    const c = checked[pr.number];
    if (notReady(pr, c)) continue;
    const size = c.files === null ? null : `${plural(c.files, 'file')}${c.additions !== null && c.deletions !== null ? ` (+${c.additions} −${c.deletions})` : ''}`;
    const findings = pr.findings ? `every one of its ${plural(pr.findings, 'review finding')} answered` : 'no review findings';
    const by = pr.reviewedBy.slice(0, 3).join(', ');
    items.push({ kind: 'merge', waits: 'owner', source: 'reviews', actions: [], title: `${repo}#${pr.number}: ${clip(pr.title, 140)}`,
      why: `Ready to merge: checks pass on ${pr.head.slice(0, 7)}, ${findings}, reviewed by ${by}.${size ? ` It changes ${size}.` : ''}`,
      read: `plates review ${repo}#${pr.number}`, link: `${pr.url}/files`,
      merge: { number: pr.number, head: pr.head, checks: 'passing', findings: pr.findings, reviewedBy: pr.reviewedBy.slice(0, 5), files: c.files, additions: c.additions, deletions: c.deletions, url: pr.url } });
  }
  return items;
}

/**
 * The repo's merge method, from its settings (allow_squash_merge,
 * allow_merge_commit, allow_rebase_merge): the only one it allows, else
 * squash, then merge, then rebase. null when the settings were not readable.
 */
export function mergeMethodOf(repo) {
  const allowed = { squash: repo?.allow_squash_merge, merge: repo?.allow_merge_commit, rebase: repo?.allow_rebase_merge };
  if (Object.values(allowed).some(v => typeof v !== 'boolean')) return null;
  return ['squash', 'merge', 'rebase'].find(m => allowed[m]) ?? null;
}

const run = (env, args, timeout = 30_000) => new Promise(done => execFile(gh(env), args, { env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 },
  (error, stdout, stderr) => done(error ? { ok: false, why: clip(String(stderr || error.message).trim().split('\n').filter(Boolean).pop() ?? 'failed', 200) } : { ok: true, stdout })));

/** The candidates' checks through gh (the terminal's read): readyChecksOf's answer. */
export async function readReadyChecks(repo, numbers, { env = process.env } = {}) {
  const [owner, name] = String(repo).split('/');
  const r = await run(env, ['api', 'graphql', '-f', `query=${readyChecksQuery(numbers)}`, '-f', `owner=${owner}`, '-f', `name=${name}`], 15_000);
  if (!r.ok) throw new Error(r.why);
  let out; try { out = JSON.parse(r.stdout); } catch { throw new Error('gh did not print JSON'); }
  if (Array.isArray(out?.errors) && out.errors.length) throw new Error(clip(out.errors[0]?.message ?? 'the checks read failed', 160));
  return readyChecksOf(out?.data?.repository, numbers);
}

/**
 * plates home --answer <pr-key> merge, in the terminal: the preview says what
 * would be merged, at which head and how; with yes, gh merges it only if its
 * head is still the card's (--match-head-commit). { state, text, url?, method }.
 */
export async function cliMerge({ repo, number, head, title, yes = false }, { env = process.env } = {}) {
  if (!SHA.test(head ?? '')) throw new Error(`${repo}#${number} has no head to bind the merge to; read plates home again`);
  const settings = await run(env, ['api', `repos/${repo}`]);
  let method = null;
  if (settings.ok) { try { method = mergeMethodOf(JSON.parse(settings.stdout)); } catch { method = null; } }
  if (!method) return { state: 'refused', text: `${repo}#${number}: its repository's merge settings could not be read${settings.ok ? '' : ` (${settings.why})`}, so no merge method is chosen. Nothing merged.` };
  const what = `${repo}#${number} (${clip(title, 100)}) at head ${head.slice(0, 7)}, by ${method}`;
  if (!yes) return { state: 'preview', method, text: `Would merge ${what}, only if its head is still ${head.slice(0, 7)}. --yes merges it.` };
  const r = await run(env, ['pr', 'merge', String(number), '-R', repo, `--${method}`, '--match-head-commit', head], 120_000);
  if (!r.ok) return { state: 'refused', method, text: `${repo}#${number} was not merged: ${r.why}` };
  return { state: 'written', method, url: `https://github.com/${repo}/pull/${number}`, text: `Merged ${what}.` };
}

/** Request changes, in the terminal: the why posted as a comment review (so plates review counts it), bound to the card's head. */
export async function cliRequestChanges({ repo, number, head, why, yes = false }, { env = process.env } = {}) {
  const body = `Changes requested from plates home: ${oneLine(why)}`;
  if (!yes) return { state: 'preview', text: `Would post a comment review on ${repo}#${number} (head ${String(head).slice(0, 7)}): "${body}". --yes posts it.` };
  const r = await run(env, ['api', '-X', 'POST', `repos/${repo}/pulls/${number}/reviews`, '-f', `event=COMMENT`, '-f', `body=${body}`, ...(SHA.test(head ?? '') ? ['-f', `commit_id=${head}`] : [])]);
  if (!r.ok) return { state: 'refused', text: `${repo}#${number}: the review was not posted: ${r.why}` };
  let url = `https://github.com/${repo}/pull/${number}`;
  try { url = JSON.parse(r.stdout).html_url ?? url; } catch { /* the PR's link stands */ }
  return { state: 'written', url, text: `Posted on ${repo}#${number}: "${body}".` };
}
