// Metadata-only local observation entrypoint. No model, network or routing calls.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkEvaluation as check, fingerprint, fields } from './evaluation-records.mjs';
import { evaluationBytes } from './evaluation-ledger.mjs';
import { qualityEpisode, validateQualityBundle } from './agent-quality-records.mjs';
import { qualityOperation } from './agent-quality-ledger.mjs';
import { qualityReport, renderQualityReport } from './agent-quality-report.mjs';
import { summarizeComparison } from './evaluation-comparison-report.mjs';
import { qualityWeekly } from './agent-quality-weekly.mjs';

const execute = promisify(execFile);
const ISO = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
async function git(root, args) {
  const { stdout } = await execute('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout.trim();
}
async function json(path) {
  try { return JSON.parse(await evaluationBytes(path, 4 * 1024 * 1024)); }
  catch (error) { check(false, `quality input unavailable or invalid: ${error.message}`); }
}
function repositoryName(origin) {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(origin);
  return m?.[1] ?? null;
}

/** Local git records are candidates for reconciliation, never known task episodes. */
export async function qualityBaseline({ repositories, prMetadata = [], cwd = process.cwd(), limit = 20, now = new Date().toISOString() } = {}) {
  check(Number.isInteger(limit) && limit >= 1 && limit <= 200, 'baseline limit must be 1..200');
  check(ISO(now), 'invalid observation time');
  const requested = repositories?.length ? repositories : [cwd];
  check(requested.length <= 10 && requested.length <= limit, 'baseline needs at most ten repositories and at least one slot per repository');
  check(prMetadata.length === 0 || prMetadata.length === requested.length, 'PR metadata files must match repository order');
  const roots = await Promise.all(requested.map(p => realpath(resolve(cwd, p))));
  check(new Set(roots).size === roots.length, 'duplicate baseline repository');
  const projects = [], episodes = [], unavailable = [];
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index], cap = Math.floor(limit / roots.length) + (index < limit % roots.length ? 1 : 0);
    const before = episodes.length;
    try {
      const config = await json(join(root, '.plates/plates.json'));
      const origin = repositoryName(await git(root, ['remote', 'get-url', 'origin']));
      check(typeof config.repo === 'string' && origin && origin.toLowerCase() === config.repo.toLowerCase(), 'project origin does not match Plates configuration');
      check(!projects.some(p => p.project.toLowerCase() === origin.toLowerCase()), 'duplicate project through another checkout');
      const revision = await git(root, ['rev-parse', 'HEAD']);
      if (prMetadata.length) {
        const rows = await json(resolve(cwd, prMetadata[index]));
        check(Array.isArray(rows) && rows.length <= 200, 'bounded PR metadata array required');
        const states = { OPEN: 0, CLOSED: 0, MERGED: 0 };
        for (const row of rows.slice(0, cap)) {
          fields(row, ['number', 'state', 'createdAt', 'closedAt', 'mergedAt', 'headRefOid', 'baseRefOid', 'url']);
          check(Number.isInteger(row.number) && row.number > 0 && row.number < 1e9 && Object.hasOwn(states, row.state)
            && ['headRefOid', 'baseRefOid'].every(k => /^[a-f0-9]{40}$/.test(row[k]))
            && row.url === `https://github.com/${origin}/pull/${row.number}`
            && Number.isFinite(Date.parse(row.createdAt))
            && ['closedAt', 'mergedAt'].every(k => row[k] === null || Number.isFinite(Date.parse(row[k]))), 'invalid PR metadata');
          // Mutable PR state/head stays in the baseline projection. Candidate
          // identity binds only selected immutable metadata, so a merge/push
          // cannot silently become a second task in the observation history.
          const sourceDigest = fingerprint({ project: origin, number: row.number, createdAt: new Date(row.createdAt).toISOString() });
          episodes.push(qualityEpisode({ id: `pr-${sourceDigest.slice(0, 61)}`, project: origin,
            source: { kind: 'github', id: `github:${sourceDigest}`, at: new Date(row.createdAt).toISOString(), digest: sourceDigest },
            createdAt: new Date(row.createdAt).toISOString(), links: [`${origin}#${row.number}`] }));
          states[row.state]++;
        }
        projects.push({ project: origin, revision, observedCandidates: Math.min(rows.length, cap), requestedCandidates: cap,
          evidence: 'supplied-pr-metadata', mapping: 'unverified', states, completeHistory: false });
        continue;
      }
      const rows = await git(root, ['log', '-n', String(cap), '--format=%H%x09%P%x09%cI', '--no-show-signature', revision]);
      const metadata = rows ? rows.split('\n').map(row => {
        const [commit, parents, date] = row.split('\t');
        check(/^[a-f0-9]{40,64}$/.test(commit) && Number.isFinite(Date.parse(date)), 'invalid git metadata');
        return { commit, parents: parents ? parents.split(' ') : [], at: new Date(date).toISOString() };
      }) : [];
      for (const record of metadata) {
        const sourceDigest = fingerprint({ project: origin, ...record });
        episodes.push(qualityEpisode({ id: `git-${sourceDigest.slice(0, 60)}`, project: origin,
          source: { kind: 'git', id: `git:${sourceDigest}`, at: record.at, digest: sourceDigest },
          createdAt: record.at, links: [`git:${record.commit}`] }));
      }
      projects.push({ project: origin, revision, observedCandidates: metadata.length, requestedCandidates: cap,
        evidence: 'git-commit-metadata', mapping: 'unverified', completeHistory: false });
    } catch {
      episodes.splice(before);
      // Do not return command output, local paths or private config values.
      unavailable.push({ repositoryIndex: index, status: 'unavailable', reason: 'repository metadata unavailable or identity mismatch' });
    }
  }
  const bundle = { schemaVersion: 2, kind: 'agent-quality', retention: { days: 90, maxBytes: 4194304, maxEvents: 1000 }, episodes };
  validateQualityBundle(bundle);
  return { schemaVersion: 1, kind: 'agent-quality-baseline', readOnly: true, collectedAt: now, projects, unavailable,
    coverage: { candidates: episodes.length, verifiedEpisodes: 0, comparableEpisodes: 0, requested: limit }, bundle,
    gaps: ['Metadata candidates require human task/PR reconciliation; several commits or PRs may belong to one task.',
      'Uncommitted, abandoned and unrecorded attempts are unavailable in git history.',
      'Agent identity, task difficulty, frozen checkpoints, acceptance, charges and human effort are unknown.'],
    automaticRouting: false, modelRuns: 0 };
}

export function replayProposal({ bundle, report }) {
  const inputDigest = fingerprint(bundle);
  return { schemaVersion: 1, kind: 'agent-quality-replay-proposal', inputDigest,
    enabled: false, budgetReserved: false, dispatchAvailable: false, automaticRouting: false,
    workflows: [
      { arm: 'A', planner: 'claude', implementer: 'claude', reviewer: 'codex', reviser: 'claude' },
      { arm: 'B', planner: 'codex', implementer: 'codex', reviewer: 'claude', reviser: 'codex' },
    ],
    frozenComparison: { command: 'plates retro evaluations plan|freeze', schemaVersion: 2,
      required: ['identical task passport and base commit', 'exact model and harness identities', 'acceptance/context hashes', 'balanced interleaved AB/BA pairs', 'all planned slots and failed attempts', 'per-task and total currency ceiling'] },
    crossover: { enabled: false, reviewers: ['claude', 'codex'], initialPatches: ['claude', 'codex'],
      fixedReviser: null, equalBudgetSelfRevisionControl: true, blindedAdjudication: true },
    budget: { currency: 'USD', total: null, perTask: null, approved: false },
    thresholds: { minimumWorthwhileImprovement: null, nonInferiorityMargin: null },
    readiness: { comparableEpisodes: report.coverage.comparableEpisodes, label: 'not-ready-for-paid-replay' },
    blockers: ['Explicit bounded currency approval', 'Exact model configuration, frozen tasks and independent human adjudicators', 'Prespecified practical thresholds and reference mix', 'A separately reviewed live provider execution adapter'],
  };
}

export async function qualityCommand({ args, appRoot, cwd }) {
  if (args[0] === 'run') return (await import('./agent-quality-execution.mjs')).qualityRunCommand({ args: args.slice(1), appRoot, cwd });
  const [action, ...rest] = args, opts = { repositories: [], prMetadata: [] }, seen = new Set();
  check(['baseline', 'collect', 'inspect', 'report', 'weekly', 'replay-plan', 'lifecycle', 'pending'].includes(action), 'unknown quality operation');
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    check(['--repository', '--pr-metadata', '--limit', '--manifest', '--state', '--bundle', '--record', '--reference-mix', '--previous', '--yes', '--digest', '--json'].includes(flag), 'unknown quality option');
    check(['--repository', '--pr-metadata'].includes(flag) || !seen.has(flag), 'repeated quality option'); seen.add(flag);
    if (['--yes', '--json'].includes(flag)) opts[flag.slice(2)] = true;
    else {
      check(rest[i + 1] && !rest[i + 1].startsWith('--'), 'quality option requires a value');
      const value = rest[++i];
      if (flag === '--repository') opts.repositories.push(resolve(cwd, value));
      else if (flag === '--pr-metadata') opts.prMetadata.push(resolve(cwd, value));
      else opts[flag.slice(2).replace('-mix', 'Mix')] = value;
    }
  }
  if (opts.limit !== undefined) { check(/^\d+$/.test(opts.limit), 'invalid baseline limit'); opts.limit = Number(opts.limit); }
  for (const field of ['bundle', 'record', 'manifest', 'state', 'referenceMix', 'previous']) if (opts[field]) opts[field] = resolve(cwd, opts[field]);
  const operation = { ...opts, action, appRoot, cwd };
  check(action === 'lifecycle' || !opts.record, '--record applies to lifecycle only');
  if (action === 'baseline') {
    check(!opts.yes && !opts.digest && !opts.bundle && !opts.manifest && !opts.state && !opts.previous && !opts.referenceMix, 'baseline accepts repository and limit only');
    const data = await qualityBaseline(operation);
    return { data, text: `Agent quality baseline: ${data.coverage.candidates} metadata candidates; 0 verified episodes.\n${data.gaps.join('\n')}`, exitCode: data.unavailable.length ? 1 : 0 };
  }
  check(action === 'weekly' || (!opts.repositories.length && !opts.prMetadata.length && opts.limit === undefined), 'repository, PR metadata and limit apply to baseline or weekly only');
  if (action === 'lifecycle') {
    check(opts.record && !opts.bundle && !opts.previous && !opts.referenceMix, 'lifecycle requires only a record and workspace');
    const { qualityLifecycle } = await import('./agent-quality-lifecycle.mjs');
    const data = await qualityLifecycle({ ...operation, event: await json(opts.record) });
    return { data, text: JSON.stringify(data, null, 2), exitCode: opts.yes ? 0 : 3 };
  }
  if (['collect', 'inspect'].includes(action)) {
    check(!opts.previous && !opts.referenceMix, 'report options do not apply to collection');
    const data = await qualityOperation(operation);
    return { data, text: JSON.stringify(data, null, 2), exitCode: action === 'collect' && !opts.yes ? 3 : 0 };
  }
  if (action === 'weekly') {
    const baseline = opts.repositories.length || opts.prMetadata.length || opts.limit !== undefined ? await qualityBaseline(operation) : null;
    const supplied = opts.bundle ? validateQualityBundle(await json(opts.bundle)) : null;
    const inputBundle = baseline || supplied ? { ...(supplied ?? baseline.bundle), episodes: [...(baseline?.bundle.episodes ?? []), ...(supplied?.episodes ?? [])] } : undefined;
    if (inputBundle) validateQualityBundle(inputBundle);
    const data = await qualityWeekly({ ...operation, bundle: undefined, inputBundle,
      previous: opts.previous ? await json(opts.previous) : undefined, referenceMix: opts.referenceMix ? await json(opts.referenceMix) : undefined });
    data.baseline = baseline;
    return { data, text: `${renderQualityReport(data.report)}\nCollection: ${data.collection.status}; report: ${data.saved ? 'retained privately' : 'preview'}.`, exitCode: baseline?.unavailable.length ? 1 : opts.yes ? 0 : 3 };
  }
  check(!opts.yes && !opts.digest, 'reporting and replay proposals are read-only');
  const inspected = await qualityOperation({ ...operation, action: 'inspect' });
  const bundle = inspected.bundle;
  if (action === 'pending') {
    check(!opts.previous && !opts.referenceMix, 'pending accepts workspace only');
    const { qualityAnnotationQueue } = await import('./agent-quality-report.mjs');
    const data = qualityAnnotationQueue(bundle);
    return { data, text: JSON.stringify(data, null, 2), exitCode: 0 };
  }
  const previous = opts.previous ? await json(opts.previous) : undefined;
  const referenceMix = opts.referenceMix ? await json(opts.referenceMix) : undefined;
  const comparisons = inspected.frozen.map(({ plan, execution }) => summarizeComparison(plan, execution));
  const report = qualityReport(bundle, { previous, referenceMix, comparisons, collectionCoverage: inspected.coverage });
  if (action === 'replay-plan') {
    const data = replayProposal({ bundle, report });
    return { data, text: JSON.stringify(data, null, 2), exitCode: 0 };
  }
  return { data: report, text: renderQualityReport(report), exitCode: 0 };
}
