// One pure finding/decision vocabulary. Adapters retain source identities and
// evidence; this module neither verifies source evidence nor authorizes work.
import { createHash } from 'node:crypto';

import { WEIGHTS, priorityScore } from '../practices/night/files/scripts/plates/finding-score.mjs';
export { priorityScore, auditLeverage } from '../practices/night/files/scripts/plates/finding-score.mjs';
const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be nonempty text`);
  return value.trim();
};
const object = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
};
const key = (...parts) => parts.map(part => encodeURIComponent(text(String(part), 'identity'))).join(':');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Generic adapter for deterministic observations and manual untangle findings.
 * caller must supply a stable source-local identity; no title-based merging. */
export function normalizeObservation(input) {
  object(input, 'finding');
  const source = object(input.source, 'source');
  if (input.commit !== undefined && source.commit !== undefined && input.commit !== source.commit) throw new Error('conflicting observation commits');
  const commit = input.commit ?? source.commit;
  if (commit !== undefined && commit !== null) text(commit, 'commit');
  const kind = text(source.kind, 'source.kind');
  const repo = text(source.repo, 'source.repo').toLowerCase();
  const record = text(source.record, 'source.record');
  const localId = text(String(input.localId ?? ''), 'localId');
  const title = text(input.title, 'title');
  const evidence = input.evidence ?? [];
  if (!Array.isArray(evidence)) throw new Error('evidence must be an array');
  const assessment = Object.fromEntries(Object.keys(WEIGHTS).map(k => [k, Object.hasOwn(WEIGHTS[k], input[k]) ? input[k] : null]));
  const normalized = {
    id: key(kind, repo, record, localId),
    source: { ...source, ...(commit !== undefined ? {commit} : {}), kind, repo, record }, localId, title,
    evidence: structuredClone(evidence), ...assessment,
    impact: input.impact ?? null, fix: input.fix ?? null,
    status: input.status ?? 'open',
    priority: priorityScore(assessment),
  };
  // Bind decisions to the observed revision and content, not merely its stable ID.
  return { ...normalized, fingerprint: digest(normalized) };
}

export function normalizeAudit(doc, { repo, page } = {}) {
  object(doc, 'audit');
  if (!Array.isArray(doc.findings)) throw new Error('audit.findings must be an array');
  const lens = text(doc.lens, 'audit.lens');
  const record = page ?? `${text(doc.date, 'audit.date')}-${lens}`;
  return doc.findings.map(f => normalizeObservation({ ...f, localId: f.id,
    source: { kind: 'audit', repo, record, lens, commit: doc.commit ?? null, page: page ?? null },
  }));
}

export function normalizeReview(data) {
  object(data, 'review');
  if (!Array.isArray(data.comments)) throw new Error('review.comments must be an array');
  const record = Number.isInteger(data.number) && data.number > 0 ? `pr-${data.number}` : data.sha ? `push-${data.sha}` : null;
  if (!record) throw new Error('review needs a PR number or push sha');
  return data.comments.filter(c => !c.status).map(c => normalizeObservation({
    localId: c.id, title: c.text, status: c.answered ? 'answered' : 'open',
    source: { kind: 'review', repo: data.repo, record, commit: data.head ?? data.sha ?? null, url: c.url ?? data.url ?? null, sourceKind: c.kind ?? null, contentRevision: data.contentRevision ?? null },
    evidence: c.path ? [{ path: c.path, line: c.line ?? null, what: c.text }] : [],
    // PR severity scales are intentionally not guessed into audit impact scores.
    // Cost/confidence/risk are missing until somebody assesses them.
    severity: ({ P0: 'high', P1: 'high', P2: 'medium', P3: 'low' })[c.severity] ?? null,
  }));
}

/** Explicit duplicate links connect observations without deleting provenance.
 * Identity repeats with different content are rejected instead of last-write-wins. */
export function groupFindings(findings, links = []) {
  if (!Array.isArray(findings) || !Array.isArray(links)) throw new Error('findings and links must be arrays');
  const byId = new Map();
  for (const f of findings) {
    text(f?.id, 'finding.id');
    if (byId.has(f.id) && JSON.stringify(byId.get(f.id)) !== JSON.stringify(f)) throw new Error(`conflicting observations for ${f.id}`);
    byId.set(f.id, f);
  }
  const parent = new Map([...byId.keys()].map(id => [id, id]));
  const root = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  for (const link of links) {
    if (!byId.has(link?.from) || !byId.has(link?.to)) throw new Error('duplicate link references an unknown finding');
    const a = root(link.from), b = root(link.to);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const groups = new Map();
  for (const [id, finding] of byId) {
    const canonical = root(id);
    if (!groups.has(canonical)) groups.set(canonical, []);
    groups.get(canonical).push(finding);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, observations]) => ({ id, observations: observations.sort((a, b) => a.id.localeCompare(b.id)), duplicate: observations.length > 1 }));
}

/** Decisions are advice/triage, never approval to execute, publish or close a PR.
 * Explore is a bounded way to reduce uncertainty, not a demand for guessed ROI. */
export function evaluateDecision(finding, decision) {
  object(finding, 'finding'); object(decision, 'decision');
  const action = decision.action;
  if (!['keep', 'explore', 'defer', 'drop'].includes(action)) throw new Error('action must be keep, explore, defer or drop');
  const rationale = text(decision.rationale, 'rationale');
  const payoff = object(decision.payoff, 'payoff');
  if (!['yes', 'no', 'unknown'].includes(payoff.verdict)) throw new Error('payoff.verdict must be yes, no or unknown');
  const assessed = { verdict: payoff.verdict, benefit: text(payoff.benefit, 'payoff.benefit'), cost: text(payoff.cost, 'payoff.cost'), complexity: text(payoff.complexity, 'payoff.complexity') };
  let experiment = null;
  if (action === 'explore') {
    const e = object(decision.experiment, 'experiment');
    if (!Number.isFinite(e.minutes) || e.minutes <= 0 || e.minutes > 1440) throw new Error('experiment.minutes must be a positive bound of at most 1440');
    experiment = { question: text(e.question, 'experiment.question'), minutes: e.minutes, success: text(e.success, 'experiment.success'), stop: text(e.stop, 'experiment.stop') };
  }
  return { findingId: text(finding.id, 'finding.id'), fingerprint: text(finding.fingerprint, 'finding.fingerprint'), action, rationale, payoff: assessed, experiment,
    priority: priorityScore(finding), authorizesExecution: false,
    warnings: [...(payoff.verdict === 'unknown' ? ['Payoff remains uncertain.'] : []), ...(action === 'keep' && payoff.verdict === 'no' ? ['Keeping work judged not to pay for itself: retain the rationale for this tradeoff.'] : [])] };
}
