// Controller-private lifetime fence. The ledger creates it only under its actual
// acquired writer context; descriptors cannot supply callbacks, paths or owners.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint, sealRecord, checkEvaluation as check } from './evaluation-records.mjs';
import { safePath, storeImmutable } from './session-ledger-io.mjs';
import { validateLiveReceipt, liveReceiptPath, inspectLiveInventory, liveRetentionPlan } from './evaluation-live-records.mjs';
import { reserveRequestBudget, settleRequestBudget, reconcileRequestBudget, reserveExternalBudget, settleExternalBudget, reconcileExternalBudget } from './validation-budget.mjs';
const slotPattern = /^[a-z][a-z0-9-]{0,63}-(baseline|candidate)$/;
const executionKinds = { 'intent': 'evaluation-intent', 'lease': 'evaluation-lease', 'admission-refusal': 'evaluation-admission-refusal',
  'builder': 'evaluation-stage', 'artifact': 'evaluation-artifact', 'verdict': 'evaluation-verdict', 'result': 'evaluation-result', 'dispatch-builder': 'evaluation-dispatch' };
const failure = code => Object.assign(new Error(code), { code, exitCode: 2 });
// Installed CLI only: a pending mutation cannot be detached from its retained
// writer by returning to the command loop. Do not wait on untrusted cleanup.
export function terminateStuckLiveWriter(error) {
  if (error?.code !== 'evaluation_live_writer_stuck') throw error;
  process.stderr.write(JSON.stringify({ error: 'evaluation_live_writer_stuck', retainedLock: true }) + '\n');
  process.exit(2);
}
export function createLiveWriterFence({ dir, planDigest, plan, deadline, cleanupDeadline, owner, inspectOwner, spendTail, stopSpend, onDeadline = () => {} }) {
  let state = 'OPEN', tail = Promise.resolve(), closing;
  const abort = new AbortController();
  const open = () => { if (state !== 'OPEN' || Date.now() >= deadline) throw failure('evaluation_live_writer_closed'); };
  const verifyOwner = async () => { check(fingerprint(await inspectOwner()) === fingerprint(owner), 'live writer ownership changed'); };
  const beginClosing = () => { if (state === 'OPEN') { state = 'CLOSING'; stopSpend(); abort.abort(); } };
  const timer = setTimeout(() => {
    beginClosing();
    void close().then(() => onDeadline(failure('evaluation_live_writer_closed')), onDeadline);
  }, Math.max(1, deadline - Date.now()));
  function close() {
    if (closing) return closing;
    beginClosing(); clearTimeout(timer);
    closing = (async () => {
      let expiry;
      try {
        await Promise.race([Promise.all([tail, spendTail()]).then(verifyOwner), new Promise((_, reject) => {
          expiry = setTimeout(() => { state = 'STUCK'; reject(failure('evaluation_live_writer_stuck')); }, Math.max(1, cleanupDeadline - Date.now()));
        })]);
        state = 'DRAINED';
      } finally { clearTimeout(expiry); }
    })();
    return closing;
  }
  function register(path, record) {
    open();
    const value = structuredClone(record);
    const result = tail.then(async () => {
      await verifyOwner();
      check(await safePath(dir), 'live experiment unavailable');
      if (plan) {
        const retained = await inspectLiveInventory(dir, plan);
        check(retained.usage !== null && retained.frozenUsage !== null && retained.gaps.length === 0, 'live receipt inventory unavailable');
        // A controller-owned intermediate prefix may lack its next predecessor.
        // Credit only individually read-back canonical immutable records for
        // capacity; this does not remove chain gaps or grant dispatch authority.
        const files = retained.files.map(f => ({ ...f, valid: f.record !== null }));
        files.push({ path, bytes: Buffer.byteLength(JSON.stringify(value) + '\n'), record: value, valid: true });
        check(liveRetentionPlan({ plan, files, frozenUsage: retained.frozenUsage }).fits, 'live receipt category capacity exhausted');
      }
      const parts = path.split('/'); let parent = dir;
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        if (!await safePath(parent)) await mkdir(parent, { mode: 0o700 });
        check(await safePath(parent), 'live receipt directory unavailable');
      }
      await storeImmutable(join(dir, path), value);
      await verifyOwner();
      return value;
    });
    tail = result.then(() => {}, () => {}); return result;
  }
  // The same drain owns coordinator mutations too: its deadline cannot cancel
  // an already-started filesystem write. No caller-provided task is accepted.
  function coordinator(method, args, branded = []) {
    open();
    const ordinary = Object.fromEntries(Object.entries(args).filter(([k]) => !branded.includes(k)));
    const captured = { ...structuredClone(ordinary), ...Object.fromEntries(branded.map(k => [k, args[k]])) };
    const result = tail.then(async () => { await verifyOwner(); open(); const value = await method(captured); await verifyOwner(); return value; });
    tail = result.then(() => {}, () => {}); return result;
  }
  return Object.freeze({
    signal: abort.signal,
    assertOpen: async () => { open(); await verifyOwner(); open(); },
    reserveRequest: args => coordinator(reserveRequestBudget, args, ['target']),
    settleRequest: args => coordinator(settleRequestBudget, args, ['completion']),
    reconcileRequest: args => coordinator(reconcileRequestBudget, args),
    reserveBuilder: args => coordinator(reserveExternalBudget, args, ['target']),
    settleBuilder: args => coordinator(settleExternalBudget, args),
    reconcileBuilder: args => coordinator(reconcileExternalBudget, args),
    persist(record, options) {
      open(); const value = validateLiveReceipt(record, options);
      check(value.planDigest === planDigest, 'live receipt plan mismatch');
      return register(liveReceiptPath(value, options), value);
    },
    persistExecution(slot, name, record) {
      open(); check(slotPattern.test(slot), 'invalid live slot');
      const kind = executionKinds[name] ?? (/^check-[0-7]$/.test(name) ? 'evaluation-stage' : /^dispatch-check-[0-7]$/.test(name) ? 'evaluation-dispatch'
        : name === 'reconciliation-' + record.digest ? 'evaluation-reconciliation' : null);
      check(kind && record.schemaVersion === 2 && record.kind === kind && sealRecord(record).digest === record.digest
        && typeof record.id === 'string' && /^[a-f0-9]{32}$/.test(record.id), 'invalid live execution receipt');
      if (name === 'intent') check(record.input.planDigest === planDigest && record.slot === slot && record.dispatchProtocol === 'ordered-live-authorization-v1', 'live intent binding mismatch');
      return register(`execution/${slot}/${name}.json`, record);
    },
    persistReservation(record) {
      open(); check(record.schemaVersion === 2 && record.kind === 'evaluation-reservation' && record.planDigest === planDigest
        && sealRecord(record).digest === record.digest, 'live reservation mismatch');
      return register('execution/reservation.json', record);
    },
    close,
    released: () => { check(state === 'DRAINED', 'live writer not drained'); state = 'RELEASED'; },
    inspect: () => ({ state }),
  });
}
