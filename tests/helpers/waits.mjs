// A synthetic Acme repository's GitHub REST answers for the waits' reads (plates
// phase 158): refs, commits, activity, PRs, check runs, compares and the deploy
// records. One map of path → JSON, so the CLI's fake gh and the web's fake App
// API answer the same read with the same bytes. Times are minutes before `now`.

const sha = c => c.repeat(40);
export const SHAS = Object.freeze({ main: sha('a'), green: sha('b'), verify: sha('c'), claim7: sha('d'), claim9: sha('e'), lock: sha('f'),
  ready7: sha('1'), branch7: sha('2'), branch9: sha('3'), merged5: sha('4'), work5: sha('5'), tested4: sha('6'), deployed: sha('7'), deploysBlob: sha('8'), renovate: sha('9') });

/**
 * The answers for repo at now (ms). Options: mainRed (main's checks failed),
 * lockMinutes (how long claims/integrate has been held; null: not held).
 */
export function waitsFixture(repo, now, { mainRed = true, lockMinutes = 90 } = {}) {
  const at = m => new Date(now - m * 60_000).toISOString();
  const s = SHAS, base = `/repos/${repo}`;
  const head = (name, value) => ({ ref: `refs/heads/${name}`, object: { sha: value, type: 'commit' } });
  const commit = (message, minutes) => ({ message, committer: { date: at(minutes) } });
  const run = (name, started, completed, conclusion) => ({ name, status: completed === null ? 'in_progress' : 'completed', started_at: at(started), completed_at: completed === null ? null : at(completed), conclusion: completed === null ? null : conclusion });
  const deploys = JSON.stringify({ schema: 1, at: at(600), project: 'anvils', commit: s.deployed, action: 'deploy', ok: true, rolledBack: false, checks: [{ check: 'version', ok: true, detail: null }] }) + '\n';
  const answers = {
    [base]: { full_name: repo, default_branch: 'main' },
    [`${base}/git/matching-refs/heads/`]: [
      head('main', s.main), head('green', s.green), head('plates-verify', s.verify), head('claims/phase-7', s.claim7), head('claims/phase-9', s.claim9),
      ...(lockMinutes === null ? [] : [head('claims/integrate', s.lock)]), head('ready/claude/phase-7', s.ready7), head('claude/phase-7', s.branch7),
      head('codex/phase-9', s.branch9), head('renovate/anvil-1', s.renovate)],
    [`${base}/activity?per_page=100`]: [
      { ref: 'refs/heads/main', timestamp: at(30), activity_type: 'push', before: s.green, after: s.main },
      { ref: 'refs/heads/ready/claude/phase-5', timestamp: at(30), activity_type: 'branch_deletion', before: s.work5, after: sha('0') },
      { ref: 'refs/heads/ready/claude/phase-5', timestamp: at(45), activity_type: 'branch_creation', before: sha('0'), after: s.work5 },
      { ref: 'refs/heads/main', timestamp: at(300), activity_type: 'push', before: s.deployed, after: s.green },
    ],
    [`${base}/git/commits/${s.claim7}`]: commit(`claim: phase 7\n\nPhase: 7\nProvider: claude\nMachine: acme-1\nAt: ${at(200)}\nToken: x\n`, 200),
    [`${base}/git/commits/${s.claim9}`]: commit('claim: phase 9\n\nPhase: 9\nProvider: codex\nToken: y\n', 100),
    ...(lockMinutes === null ? {} : { [`${base}/git/commits/${s.lock}`]: commit(`claim: integrate\n\nLock: integrate\nProvider: codex\nMachine: acme-2\nAt: ${at(lockMinutes)}\nToken: z\n`, lockMinutes) }),
    [`${base}/git/commits/${s.ready7}`]: commit(`ready: claude/phase-7\n\nBranch: claude/phase-7\nHead: ${s.branch7}\nStatus: ready\nProvider: claude\nSession: s1\nMachine: acme-1\nAt: ${at(120)}\nCheck: 0 npm test\n`, 120),
    [`${base}/pulls?state=open&per_page=50`]: [{ number: 12, draft: false, created_at: at(80), head: { ref: 'codex/phase-9', sha: s.branch9 } }],
    [`${base}/compare/main...claude/phase-7`]: { ahead_by: 2, total_commits: 2, commits: [{ sha: sha('0'), commit: { committer: { date: at(190) } } }, { sha: s.branch7, commit: { committer: { date: at(125) } } }] },
    [`${base}/compare/main...codex/phase-9`]: { ahead_by: 1, total_commits: 1, commits: [{ sha: s.branch9, commit: { committer: { date: at(85) } } }] },
    [`${base}/commits/${s.branch9}/check-runs?per_page=50`]: { total_count: 1, check_runs: [run('check', 10, null)] },
    [`${base}/compare/green...main`]: { ahead_by: 2, commits: [
      { sha: s.work5, parents: [{ sha: s.green }], commit: { message: 'feat: anvils', committer: { date: at(60) } } },
      { sha: s.main, parents: [{ sha: s.green }, { sha: s.work5 }], commit: { message: 'integrate: claude/phase-5 (5555555)', committer: { date: at(40) } } }] },
    [`${base}/commits/${s.main}/check-runs?per_page=50`]: { total_count: 1, check_runs: [run('check', 29, 10, mainRed ? 'failure' : 'success')] },
    [`${base}/git/trees/${s.verify}`]: { tree: [{ path: 'deploys.jsonl', type: 'blob', sha: s.deploysBlob }] },
    [`${base}/git/blobs/${s.deploysBlob}`]: { encoding: 'base64', content: Buffer.from(deploys).toString('base64') },
    [`${base}/compare/${s.deployed}...green`]: { ahead_by: 1, commits: [
      { sha: s.green, parents: [{ sha: s.deployed }], commit: { message: 'integrate: claude/phase-4 (4444444)', committer: { date: at(310) } } }] },
    [`${base}/commits/${s.green}/check-runs?per_page=50`]: { total_count: 1, check_runs: [run('check', 299, 280, 'success')] },
  };
  return answers;
}

/** An in-process api over the answers: GETs only (it takes a path and nothing to send), each recorded. */
export function fakeApi(answers, { fail = {} } = {}) {
  const asked = [];
  const api = async (path, { missing = false } = {}) => {
    asked.push(path);
    if (Object.hasOwn(fail, path)) throw Object.assign(new Error(`HTTP ${fail[path]}`), { status: fail[path] });
    if (Object.hasOwn(answers, path)) return structuredClone(answers[path]);
    if (missing) return null;
    throw Object.assign(new Error('HTTP 404'), { status: 404 });
  };
  return { api, asked };
}
