const keys = ['threadId', 'maxTurns', 'durationMs', 'idleMs', 'inputChars', 'replyChars', 'outputTokens'];

export function validateTrial(value) {
  if (!value || Object.keys(value).sort().join() !== [...keys, ...(value.waitMs === undefined ? [] : ['waitMs'])].sort().join()
    || typeof value.threadId !== 'string' || !/^[1-9][0-9]{16,19}$/.test(value.threadId)
    || !keys.slice(1).every(k => Number.isSafeInteger(value[k]) && value[k] > 0)
    || value.maxTurns > 5 || value.durationMs > 600_000 || value.idleMs > 30_000
    || value.idleMs >= value.durationMs || value.inputChars > 1000
    || value.replyChars > 1500 || value.outputTokens < 256 || value.outputTokens > 2048
    || value.waitMs !== undefined && (!Number.isSafeInteger(value.waitMs) || value.waitMs < 1 || value.waitMs > 300000)) throw new Error('invalid_trial');
  return { ...value };
}

// The callback must stop ingress, cancel queued work, and confirm remote termination.
// A failed stop is retained as uncertain rather than retried or reported as success.
export function superviseTrial({ policy, snapshot, stop, now = Date.now,
  schedule = setTimeout, unschedule = clearTimeout }) {
  validateTrial(policy);
  const connectedAt = now(); let started = policy.waitMs ? null : connectedAt;
  let lastActivity = connectedAt, signature, timer, stopping, finish;
  const done = new Promise(resolve => { finish = resolve; });
  function requestStop(reason = 'operator') {
    if (stopping) return stopping;
    unschedule(timer);
    stopping = Promise.resolve().then(() => stop(reason)).then(
      () => ({ reason, cleanup: 'confirmed' }), () => ({ reason, cleanup: 'uncertain' }),
    ).then(result => { finish(result); return result; });
    return stopping;
  }
  function check() {
    if (stopping) return;
    try {
      if (started === null && now() - connectedAt >= policy.waitMs) { void requestStop('wait_timeout'); return; }
      if (started !== null && now() - started >= policy.durationMs) { void requestStop('run_timeout'); return; }
      const state = snapshot(), tasks = Object.values(state.tasks);
      if (state.trialRun?.stopped) { void requestStop('stopped'); return; }
      if (state.budgetOverrun) { void requestStop('budget_overrun'); return; }
      if (tasks.some(t => t.threadId !== policy.threadId) || tasks.length > 1) { void requestStop('scope_violation'); return; }
      const task = tasks[0];
      if (task) {
        if (task.status !== 'ready') { void requestStop(task.status); return; }
        if (!task.active && task.receipts.length >= policy.maxTurns) { void requestStop('turn_limit'); return; }
        const current = JSON.stringify([task.receipts.length, task.receipts.at(-1)?.status, task.handoffs, task.active, task.queue.length]);
        if (current !== signature) { signature = current; lastActivity = now(); }
        if (!task.active && !task.queue.length && now() - lastActivity >= policy.idleMs) { void requestStop('idle'); return; }
      }
      timer = schedule(check, 100);
    } catch { void requestStop('supervisor_fault'); }
  }
  timer = schedule(check, Math.min(100, policy.durationMs));
  return { done, stop: requestStop,
    accepting() { checkDeadline(); return !stopping; },
    begin() { checkDeadline(); if (stopping) return false; if (started === null) { started = now(); lastActivity = started; } return true; },
    readiness() { return { phase: stopping ? 'stopping' : started === null ? 'waiting_for_owner' : 'executing', connectedAt,
      waitUntil: policy.waitMs ? connectedAt + policy.waitMs : null, executionStartedAt: started,
      executionDeadline: started === null ? null : started + policy.durationMs }; },
  };
  function checkDeadline() {
    if (started === null && now() - connectedAt >= policy.waitMs) void requestStop('wait_timeout');
    else if (started !== null && now() - started >= policy.durationMs) void requestStop('run_timeout');
  }
}
