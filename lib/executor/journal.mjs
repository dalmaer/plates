// The durable intent journal a Plates host keeps around any executor (phase 146).
// An effect (create, run, message, stop) is written as `uncertain` before it is
// sent, and only an acknowledgement or an explicit reconciliation with evidence
// moves it. A failed, timed-out or interrupted send stays uncertain across a
// restart and is never sent again blindly. Each run holds its project lane until
// termination is confirmed under the run's fence, and a separate capacity hold
// for its pool that the journal never releases (the capacity window's owner
// resets it).
//
// Ported, executor-agnostic, from the stopped trials:
//   codex/openhands-evaluation@9d891e96 experiments/openhands/evaluation.mjs
//     (effect intents, uncertain-on-error, lane and capacity admission, learning decision)
//   codex/gas-city-evaluation@1f9b083d experiments/gas-city/bridge.mjs
//     (fences, launch-uncertain holds, stale-callback refusal, stop-pending, outcome -> learning)
// Left out: funding bindings and payer checks (checkFundingBinding, unpublished
// codex/switchboard-consolidation), actor authentication, SQLite storage (main
// has no node:sqlite use; this is one JSON file replaced atomically), lesson
// promotion into Plates' learning records (phase 148), upstream event observation.
import { openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

const fail = code => { throw Object.assign(new Error(`executor journal: ${code}`), { code }); };
const check = (ok, code) => { if (!ok) fail(code); };
const id = x => typeof x === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(x);
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 4096;
const canonical = x => Array.isArray(x) ? `[${x.map(canonical).join(',')}]`
  : x !== null && typeof x === 'object' ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`
  : JSON.stringify(x);
const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
const OUTCOMES = ['success', 'failure', 'abandoned'];
const LEARNING = ['captured', 'no-useful-lesson'];

/**
 * Open (or create) a journal file. Opening the same file again is a restart:
 * every hold and uncertain effect is read back as it was written.
 * One writer at a time: a change takes `<file>.lock` exclusively and a held
 * lock is refused (`journal-busy`), never reclaimed as stale.
 * @param {string} file
 * @param {{ now?: () => number, newFence?: () => string }} [options]
 */
export function openJournal(file, { now = Date.now, newFence = randomUUID } = {}) {
  const lock = `${file}.lock`;
  const read = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schema: 1, runs: {}, effects: {} };
  function change(fn) {
    let fd;
    try { fd = openSync(lock, 'wx', 0o600); } catch (e) { if (/** @type {any} */ (e).code === 'EEXIST') fail('journal-busy'); throw e; }
    try {
      const state = read();
      check(state.schema === 1, 'journal-schema');
      const result = fn(state);
      const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
      const out = openSync(temp, 'w', 0o600);
      try { writeFileSync(out, JSON.stringify(state)); fsyncSync(out); } finally { closeSync(out); }
      renameSync(temp, file);
      try { const d = openSync(dirname(file), 'r'); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* directory fsync is unsupported on some platforms */ }
      return structuredClone(result);
    } finally { closeSync(fd); unlinkSync(lock); }
  }
  const runOf = (state, runId) => state.runs[runId] ?? fail('run-missing');

  const journal = {
    /** @param {string} runId */
    run: runId => structuredClone(read().runs[runId] ?? null),
    /** @param {string} runId @param {string} name */
    effect: (runId, name) => structuredClone(read().effects[`${runId}:${name}`] ?? null),

    /**
     * Admit a run once. The same id with the same input returns the original run;
     * different input is a conflict. A project with a held lane, or a pool whose
     * held units would exceed the host-supplied capacity, is refused.
     * @param {{ id: string, project: string, pool: string, units?: number, input?: unknown, capacity: { pool: string, remaining: number } }} request
     */
    admit({ id: runId, project, pool, units = 1, input = null, capacity }) {
      check(id(runId) && id(project) && id(pool) && Number.isSafeInteger(units) && units > 0, 'invalid-admission');
      check(capacity?.pool === pool && Number.isSafeInteger(capacity.remaining) && capacity.remaining >= 0, 'capacity-unavailable');
      const fingerprint = digest({ project, pool, units, input });
      return change(state => {
        const prior = state.runs[runId];
        if (prior) { check(prior.fingerprint === fingerprint, 'operation-conflict'); return { run: prior, admitted: false }; }
        const runs = Object.values(state.runs);
        check(!runs.some(r => r.project === project && r.lane), 'project-lane-held');
        const held = runs.filter(r => r.pool === pool && r.capacityHold).reduce((n, r) => n + r.units, 0);
        check(held + units <= capacity.remaining, 'capacity-exhausted');
        const run = { id: runId, project, pool, units, fingerprint, fence: newFence(), lane: true, capacityHold: true,
          state: 'admitted', stopRequested: false, terminationEvidence: null, outcome: null, learning: null, lesson: null, createdAt: now() };
        state.runs[runId] = run;
        return { run, admitted: true };
      });
    },

    /**
     * Perform an effect at most once per attempt. The intent is durable before
     * `action` is called; an action that throws (timeout, 5xx, lost connection)
     * leaves the effect uncertain, and a later call returns it without sending.
     * `action` receives an idempotency key to pass upstream.
     * @param {string} runId @param {string} name
     * @param {(context: { run: string, fence: string, effect: string, attempt: number, idempotencyKey: string }) => unknown} action
     */
    async perform(runId, name, action) {
      check(id(name), 'invalid-effect');
      const key = `${runId}:${name}`;
      const claim = change(state => {
        const run = runOf(state, runId), prior = state.effects[key];
        if (prior && prior.state !== 'released') return { effect: prior, send: false, fence: run.fence };
        check(name === 'stop' || (!run.stopRequested && run.state !== 'terminated'), 'execution-stopped');
        const effect = { run: runId, name, attempt: (prior?.attempt ?? 0) + 1, state: 'uncertain', error: null, evidence: null, intendedAt: now() };
        state.effects[key] = effect;
        return { effect, send: true, fence: run.fence };
      });
      if (!claim.send) return { ...claim.effect, sent: false };
      const { attempt } = claim.effect;
      let result, error = null;
      try { result = await action({ run: runId, fence: claim.fence, effect: name, attempt, idempotencyKey: `${key}:${attempt}` }); }
      catch (e) { error = String(/** @type {any} */ (e)?.message ?? e).slice(0, 200); }
      const effect = change(state => {
        const current = state.effects[key];
        if (error === null) current.state = 'acknowledged'; else current.error = error;
        return current;
      });
      return { ...effect, sent: true, ...(error === null ? { result } : {}) };
    },

    /**
     * Settle an uncertain effect from an observation, never from a guess:
     * `acknowledged` when upstream shows it happened, `absent` when upstream
     * shows it did not (the next perform is a new attempt).
     * @param {string} runId @param {string} name @param {{ observed: 'acknowledged'|'absent', evidence: string }} observation
     */
    reconcile(runId, name, { observed, evidence }) {
      check(['acknowledged', 'absent'].includes(observed) && text(evidence), 'reconciliation-evidence-required');
      return change(state => {
        runOf(state, runId);
        const effect = state.effects[`${runId}:${name}`] ?? fail('effect-missing');
        check(effect.state === 'uncertain', 'effect-not-uncertain');
        effect.state = observed === 'acknowledged' ? 'acknowledged' : 'released';
        effect.evidence = evidence;
        return effect;
      });
    },

    /** Request a stop and send it once; an uncertain stop stays pending. @param {string} runId @param {(context: any) => unknown} kill */
    async stop(runId, kill) {
      change(state => {
        const run = runOf(state, runId);
        run.stopRequested = true;
        if (run.state !== 'terminated') run.state = 'stop-pending';
      });
      return journal.perform(runId, 'stop', kill);
    },

    /** Confirm termination under the run's fence; releases the lane, keeps the capacity hold. @param {string} runId @param {{ fence: string, evidence: string }} proof */
    terminated(runId, { fence, evidence }) {
      return change(state => {
        const run = runOf(state, runId);
        check(run.fence === fence, 'stale-fence');
        check(text(evidence), 'termination-evidence-required');
        run.state = 'terminated'; run.lane = false; run.terminationEvidence = evidence;
        return run;
      });
    },

    /** Record the outcome once, under the fence; the run then owes a learning decision. @param {string} runId @param {{ fence: string, outcome: string }} report */
    complete(runId, { fence, outcome }) {
      check(OUTCOMES.includes(outcome), 'invalid-outcome');
      return change(state => {
        const run = runOf(state, runId);
        check(run.fence === fence, 'stale-fence');
        check(run.outcome === null || run.outcome === outcome, 'outcome-conflict');
        run.outcome = outcome;
        run.learning ??= 'pending';
        return run;
      });
    },

    /**
     * The reviewed learning decision for an outcome: `captured` with text and
     * evidence, or `no-useful-lesson`. A second, different decision is a conflict.
     * @param {string} runId @param {{ status: 'captured'|'no-useful-lesson', text?: string, evidence?: string }} decision
     */
    decideLearning(runId, { status, text: words = '', evidence = '' }) {
      check(LEARNING.includes(status), 'invalid-learning');
      check(status !== 'captured' || (text(words) && text(evidence)), 'lesson-evidence-required');
      const decision = { status, text: words, evidence };
      return change(state => {
        const run = runOf(state, runId);
        check(run.outcome !== null, 'outcome-required');
        check(run.lesson === null || digest(run.lesson) === digest(decision), 'learning-conflict');
        run.learning = status; run.lesson = decision;
        return run;
      });
    },
  };
  return journal;
}
