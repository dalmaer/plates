// Isolated experiment, deliberately not wired into Plates jobs, HTTP routes or Switchboard.
// Trusted host adapters supply authentication, current funding and process termination evidence.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { checkFundingBinding, fundingDigest } from '../../lib/web/funding.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => structuredClone(value);
const fail = code => { throw new Error(code); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/#-]{1,160}$/.test(value);

export class Evaluation {
  constructor({ file, client, authenticate, funding, termination, authorizeProfile, now = Date.now, epoch = 'acme-epoch-1' }) {
    this.client = client; this.authenticate = authenticate; this.funding = funding;
    this.termination = termination; this.authorizeProfile = authorizeProfile; this.now = now; this.epoch = epoch;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=2000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({ runs: {}, effects: {}, messages: {}, lessons: {}, usage: {}, events: [] }));
  }
  close() { this.db.close(); }
  read() { return JSON.parse(this.db.prepare('SELECT data FROM state WHERE id=1').get().data); }
  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const state = this.read(), result = fn(state); this.db.prepare('UPDATE state SET data=? WHERE id=1').run(JSON.stringify(state)); this.db.exec('COMMIT'); return copy(result); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  event(state, run, kind) { state.events.push({ seq: state.events.length + 1, operation: run.id, project: run.project, kind }); }
  actor(token, project, write = false) {
    const actor = this.authenticate(token);
    if (!actor?.projects?.includes(project) || write && !actor.execute) fail('authority');
    return actor;
  }
  authorized(token, operation, write = false) {
    const run = this.read().runs[operation]; if (!run) fail('missing_operation');
    const actor = this.actor(token, run.project, write);
    if (run.epoch !== this.epoch) fail('restore_quarantine');
    if (write && actor.actorId !== run.actorId) fail('original_owner_required');
    return run;
  }
  capacity(actor, project, pinned = null) {
    const { binding, context, capacity } = this.funding(actor.actorId, project);
    checkFundingBinding(binding, { ...context, actorId: actor.actorId, now: this.now() });
    const pin = fundingDigest(binding);
    if (pinned && pin !== pinned) fail('funding_changed');
    if (!capacity || !id(capacity.id) || !Number.isSafeInteger(capacity.remaining) || capacity.remaining < 0 || !Number.isFinite(capacity.expiresAt) || capacity.expiresAt <= this.now()) fail('capacity_unavailable');
    return { pin, account: binding.accountIdentity.account, capacity };
  }
  admit(token, input) {
    const { project, task, pr, stage, source, eventId, profile } = input;
    if (![project, task, pr, source, eventId].every(id) || !['plan', 'build', 'review'].includes(stage)) fail('input');
    const actor = this.actor(token, project, true), payer = this.capacity(actor, project);
    const key = digest([project, source, eventId]), fingerprint = digest(input);
    return this.change(state => {
      const prior = Object.values(state.runs).find(r => r.inputKey === key);
      if (prior) { if (prior.fingerprint !== fingerprint || prior.actorId !== actor.actorId) fail('input_conflict'); return prior; }
      const history = Object.values(state.runs).filter(r => r.project === project && r.task === task);
      if (history.some(r => r.actorId !== actor.actorId || r.account !== payer.account)) fail('payer_switch');
      if (Object.values(state.runs).some(r => r.project === project && !r.terminated)) fail('lane_held');
      const reserved = Object.values(state.runs).filter(r => r.account === payer.account && r.capacityWindow === payer.capacity.id).length;
      if (reserved >= payer.capacity.remaining) fail('capacity_exhausted');
      const run = { id: randomUUID(), conversation: randomUUID(), project, task, pr, stage, profile,
        actorId: actor.actorId, account: payer.account, funding: payer.pin, capacityWindow: payer.capacity.id, capacityExpiresAt: payer.capacity.expiresAt, inputKey: key, fingerprint,
        epoch: this.epoch, state: 'admitted', terminated: false, learning: null, revision: 0, stop: null };
      state.runs[run.id] = run; this.event(state, run, 'admitted'); return run;
    });
  }
  visible(token, run) {
    const actor = this.actor(token, run.project);
    if (actor.actorId === run.actorId) return copy(run);
    return { id: run.id, conversation: run.conversation, project: run.project, state: run.state, stop: run.stop, terminated: run.terminated, learning: run.learning };
  }
  async effect(token, operation, name, action, { requireCapacity = true } = {}) {
    const run = this.authorized(token, operation, true), actor = this.actor(token, run.project, true);
    let envelope;
    if (requireCapacity) {
      const current = this.capacity(actor, run.project, run.funding);
      if (run.capacityExpiresAt <= this.now() || current.capacity.id !== run.capacityWindow || current.capacity.expiresAt !== run.capacityExpiresAt) fail('capacity_reservation_expired');
      envelope = this.authorizeProfile?.(copy(run));
      if (!envelope || envelope.profile !== run.profile || envelope.account !== run.account || typeof envelope.workspace !== 'string' || !envelope.workspace.startsWith('/')) fail('profile_authority_unverified');
    }
    const effectKey = `${operation}:${name}`;
    const send = this.change(state => {
      if (state.effects[effectKey]) return false;
      const current = state.runs[operation];
      if (current.terminated || requireCapacity && current.stop) fail('execution_stopped');
      state.effects[effectKey] = { operation, name, state: 'uncertain' };
      this.event(state, current, `${name}:intent`); return true;
    });
    if (!send) return copy(this.read().effects[effectKey]);
    let result, succeeded = false;
    try { result = await action({ ...run, workspace: envelope?.workspace }); succeeded = true; }
    catch { /* Keep the original uncertain effect, including 404/429/timeouts. */ }
    if (succeeded) this.change(state => { const effect = state.effects[effectKey]; effect.state = 'acknowledged'; this.event(state, run, `${name}:acknowledged`); return effect; });
    this.authorized(token, operation); // withhold buffered response after revocation
    return { ...copy(this.read().effects[effectKey]), ...(succeeded ? { result } : {}) };
  }
  create(token, operation) { return this.effect(token, operation, 'create', run => this.client.create({ id: run.conversation, profile: run.profile, project: run.project, operation, workspace: run.workspace })); }
  run(token, operation) { return this.effect(token, operation, 'run', run => this.client.run(run.conversation)); }
  async observe(token, operation) {
    const run = this.authorized(token, operation), info = await this.client.inspect(run.conversation);
    this.authorized(token, operation); // final read authorization after a buffered response
    if (info.id !== run.conversation || info.tags?.platesoperation !== operation || info.tags?.platesproject !== run.project) fail('upstream_identity');
    if (!['idle', 'running', 'paused', 'waiting_for_confirmation', 'finished', 'error', 'stuck'].includes(info.execution_status)) fail('upstream_status');
    return this.change(state => {
      const current = state.runs[operation]; current.state = info.execution_status;
      if (['finished', 'error', 'stuck'].includes(info.execution_status) && current.learning === null) current.learning = 'pending';
      const create = state.effects[`${operation}:create`]; if (create) create.state = 'observed';
      this.event(state, current, 'observed'); return this.visible(token, current);
    });
  }
  async stop(token, operation) {
    const run = this.authorized(token, operation, true);
    if (run.terminated) return run;
    this.change(state => { state.runs[operation].stop = 'pending'; this.event(state, run, 'stop:pending'); });
    await this.effect(token, operation, 'interrupt', r => this.client.interrupt(r.conversation), { requireCapacity: false });
    return this.read().runs[operation];
  }
  async confirmTermination(token, operation) {
    const run = this.authorized(token, operation), evidence = await this.termination(copy(run));
    this.authorized(token, operation);
    if (!evidence || evidence.conversation !== run.conversation || evidence.epoch !== run.epoch || evidence.exited !== true || evidence.launchFenced !== true) fail('termination_unknown');
    return this.change(state => { const r = state.runs[operation]; r.terminated = true; if (r.stop) r.stop = 'confirmed'; this.event(state, r, 'termination:confirmed'); return this.visible(token, r); });
  }
  async message(token, operation, { eventId, target, text, revision }) {
    const run = this.authorized(token, operation), actor = this.actor(token, run.project);
    if (!id(eventId) || !['worker', 'coordinator'].includes(target) || typeof text !== 'string' || text.length > 8000) fail('message_input');
    const key = digest([operation, eventId]), fingerprint = digest([actor.actorId, target, text, revision]);
    const message = this.change(state => {
      if (state.messages[key]) { if (state.messages[key].fingerprint !== fingerprint) fail('message_conflict'); return state.messages[key]; }
      const current = state.runs[operation], conflict = revision !== current.revision || actor.actorId !== current.actorId;
      const result = { operation, key, fingerprint, target, actor: actor.actorId, text, state: conflict ? 'conflict' : 'pending' };
      state.messages[key] = result; if (!conflict) current.revision++;
      this.event(state, current, `message:${result.state}`); return result;
    });
    if (message.state !== 'pending') return message;
    // The coordinator is a durable inbox here, not a second autonomous scheduler.
    if (target === 'coordinator') return message;
    const receipt = await this.effect(token, operation, `message:${key}`, r => this.client.message(r.conversation, text));
    return this.change(state => { state.messages[key].state = receipt.state; return state.messages[key]; });
  }
  learning(token, operation, decision) {
    this.authorized(token, operation, true);
    if (!['captured', 'no-useful-lesson'].includes(decision.status) || decision.status === 'captured' && (!id(decision.lessonId) || !decision.text || !decision.evidence)) fail('learning_input');
    return this.change(state => {
      const run = state.runs[operation]; if (run.learning === null) fail('outcome_missing');
      const fingerprint = digest(decision);
      if (run.learning !== 'pending') { if (run.lessonDecision !== fingerprint) fail('learning_conflict'); return run; }
      run.learning = decision.status; run.lessonDecision = fingerprint;
      if (decision.status === 'captured') {
        if (state.lessons[decision.lessonId]) fail('lesson_identity_conflict');
        state.lessons[decision.lessonId] = { id: decision.lessonId, operation, project: run.project, text: decision.text, evidence: decision.evidence, revision: 1, eligible: [], history: [] };
      }
      this.event(state, run, `learning:${run.learning}`); return run;
    });
  }
  reviewLesson(token, lessonId, projects, revision) {
    const lesson = this.read().lessons[lessonId]; if (!lesson) fail('lesson_missing');
    const actor = this.actor(token, lesson.project, true);
    if (!actor.review || !Array.isArray(projects) || !projects.length || new Set(projects).size !== projects.length) fail('review_authority');
    for (const project of projects) this.actor(token, project, true);
    return this.change(state => {
      const current = state.lessons[lessonId]; if (current.revision !== revision) fail('lesson_revision');
      current.history.push({ revision, eligible: current.eligible, reviewer: actor.actorId });
      current.revision++; current.eligible = [...projects]; return current;
    });
  }
  lessonContext(token, project) { this.actor(token, project); return Object.values(this.read().lessons).filter(l => l.eligible.includes(project)).map(l => ({ id: l.id, revision: l.revision, text: l.text, authority: 'reviewed-guidance-only' })); }
  recordUsage(token, operation, receipt) {
    const run = this.authorized(token, operation, true);
    if (!id(receipt.id) || !(receipt.tokens === null || Number.isSafeInteger(receipt.tokens) && receipt.tokens >= 0)) fail('usage_input');
    return this.change(state => {
      const key = digest([run.account, receipt.id]), row = { ...receipt, operation, account: run.account, pr: run.pr, project: run.project, stage: run.stage };
      if (state.usage[key] && digest(state.usage[key]) !== digest(row)) fail('usage_conflict');
      state.usage[key] = row; return row;
    });
  }
  usage(token, projects, pr) {
    for (const project of projects) this.actor(token, project);
    const state = this.read(), runs = Object.values(state.runs).filter(r => projects.includes(r.project) && r.pr === pr);
    const rows = Object.values(state.usage).filter(r => runs.some(run => run.id === r.operation));
    const complete = runs.length > 0 && runs.every(r => r.terminated && rows.some(u => u.operation === r.id)) && rows.every(r => r.tokens !== null);
    return { attempts: runs.length, knownTokens: rows.reduce((n, r) => n + (r.tokens ?? 0), 0), totalTokens: complete ? rows.reduce((n, r) => n + r.tokens, 0) : null, billingVerified: false };
  }
  missionControl(token, project, after = 0) {
    this.actor(token, project);
    const state = this.read();
    return { runs: Object.values(state.runs).filter(r => r.project === project).map(r => ({ operation: r.id, conversation: r.conversation, state: r.state, stop: r.stop, learning: r.learning, terminated: r.terminated })), events: state.events.filter(e => e.project === project && e.seq > after), stale: true, source: 'local-experimental-ledger' };
  }
}
