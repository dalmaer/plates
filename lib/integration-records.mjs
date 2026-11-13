// plates integrate's run records: one JSON line per run in integrations.jsonl on
// the plates-integrations branch. lib/integrate.mjs writes them (with a lease on
// the tip it read, as plates promote writes deploys.jsonl); this module only
// names the place and reads the lines, so the waits' readers
// (lib/integration-observations.mjs) can read them without the writer's graph.
//
// Why a branch of its own, and not a file under .plates/: integrate runs from
// whichever checkout a session has, often a temporary worktree that is deleted
// afterwards, which is how its gate runs were lost to the test ledger. A record
// that has to say why a run landed nothing must outlive the checkout and be
// readable where the other waits are read, from the remote. Why not
// plates-verify: that branch is created only by a hosting target, and its
// readers refuse one holding neither verify.json nor deploys.jsonl; integrate
// creating it would make deploys refuse it.
//
// A record: { schema: 1, kind: 'integrate', startedAt, endedAt, ms, machine,
// provider, session, branch (main), base, lock: { result: 'held' | 'refused' |
// 'not-taken', holder? }, outcome, exitCode, considered: [{ branch, head,
// readyAt, status }], gates: [{ candidate, mode, status, ms, why }], landed:
// [{ branch, head }], pushed, blocked: [{ branch, head, reason, with }],
// stillBlocked, alreadyLanded, malformed, rounds, moved, more, error, ledger }.

export const INTEGRATIONS_BRANCH = 'plates-integrations';
export const INTEGRATIONS_FILE = 'integrations.jsonl';
/** The newest lines kept on the branch. */
export const INTEGRATIONS_KEEP = 500;
export const RECORD_SCHEMA = 1;

/** Why a run landed nothing, or that it landed: one word per run. */
export const OUTCOMES = Object.freeze(['landed', 'partial', 'nothing-ready', 'blocked', 'refused', 'error']);

/**
 * The outcome of one run, from what it did: landed (everything it gated landed),
 * partial (some landed, some sent back), blocked (nothing landed, something sent
 * back), nothing-ready, refused (the lock was held), error (it stopped: a fetch,
 * a push that main moved under every time, a refused install).
 */
export function outcomeOf({ lock, error, landed = [], blocked = [] }) {
  if (lock === 'refused') return 'refused';
  if (error) return 'error';
  if (landed.length && blocked.length) return 'partial';
  if (landed.length) return 'landed';
  if (blocked.length) return 'blocked';
  return 'nothing-ready';
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Durations are observations, not estimates. Percentiles use nearest rank on
// observed nonnegative milliseconds only; zero is valid, absence is not zero.
// totalMs is the sum of observed samples (not total elapsed time or CPU usage).
function durations(values) {
  const observed = values.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const percentile = p => observed.length ? observed[Math.ceil(p * observed.length) - 1] : null;
  return {
    samples: observed.length, missing: values.length - observed.length,
    totalMs: observed.length ? observed.reduce((sum, v) => sum + v, 0) : null,
    p50Ms: percentile(0.5), p90Ms: percentile(0.9),
  };
}

// Retained records are a bounded sample, not complete run history. Keep each
// validation mode separate: a cheap record check must not imply a faster full
// gate. A not-run record's ms:0 is not an executed gate. Unknown modes and
// unavailable gate lists have no knowable timing denominator and stay visible.
function measurements(runs) {
  const gate = [], recordChecks = [];
  const gates = { unavailableRuns: 0, notRun: 0, unknownMode: 0 };
  for (const run of runs) {
    if (!Array.isArray(run.gates)) { gates.unavailableRuns++; continue; }
    for (const entry of run.gates) {
      if (entry?.mode === 'gate') gate.push(entry.ms);
      else if (entry?.mode === 'record-checks') recordChecks.push(entry.ms);
      else if (entry?.mode === 'not-run') gates.notRun++;
      else gates.unknownMode++;
    }
  }
  return { runMs: durations(runs.map(r => r.ms)), gateMs: durations(gate), recordCheckMs: durations(recordChecks), gates };
}

/**
 * integrations.jsonl's lines, oldest first: the records that parse and are
 * plates's (schema 1, kind integrate). { runs, skipped } — a line that is not
 * one is counted, never guessed at.
 */
export function integrationRuns(text) {
  const runs = [];
  let skipped = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (isObj(r) && r.schema === RECORD_SCHEMA && r.kind === 'integrate' && typeof r.startedAt === 'string' && OUTCOMES.includes(r.outcome)) runs.push(r);
      else skipped++;
    } catch { skipped++; }
  }
  return { runs, skipped };
}

/**
 * What the runs say, bounded: how many, over which window, each outcome's
 * count, and the newest few with why they landed nothing.
 */
export function integrationSummary({ runs, skipped }, { shown = 5 } = {}) {
  const outcomes = Object.fromEntries(OUTCOMES.map(o => [o, 0]));
  for (const r of runs) outcomes[r.outcome]++;
  const str = (v, n = 200) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n) : null;
  return {
    runs: runs.length, skipped,
    window: { from: runs[0]?.startedAt ?? null, to: runs.at(-1)?.endedAt ?? runs.at(-1)?.startedAt ?? null },
    outcomes,
    measurements: measurements(runs),
    landedNothing: runs.filter(r => !['landed', 'partial'].includes(r.outcome)).length,
    recent: runs.slice(-shown).reverse().map(r => ({
      startedAt: str(r.startedAt, 40), ms: Number.isFinite(r.ms) ? r.ms : null, outcome: r.outcome,
      gates: Array.isArray(r.gates) ? r.gates.length : null,
      landed: Array.isArray(r.landed) ? r.landed.map(l => str(l?.branch, 120)).filter(Boolean) : [],
      blocked: Array.isArray(r.blocked) ? r.blocked.map(b => ({ branch: str(b?.branch, 120), reason: str(b?.reason) })) : [],
      ...(r.error ? { error: str(r.error) } : {}),
    })),
  };
}
