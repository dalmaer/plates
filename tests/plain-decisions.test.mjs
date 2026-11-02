// Phase 153: a health proposal reads as plain English, says when it fixed
// itself, leads the workspace decision page, the report stays small enough to
// open, and a file too large to open says so. Synthetic Acme data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { page, propose, improve, MEASURES } from '../practices/night/files/scripts/plates/improve.mjs';
import { parsePlain, plainProposal, measureRow, freshness, fixedSince, PLAIN_LABELS } from '../practices/night/files/scripts/plates/plain-proposal.mjs';
import { proposalOf, decideLegacyProposal } from '../lib/board.mjs';
import { snapshot } from '../lib/canvas-snapshot.mjs';
import { createDecisions } from '../lib/web/decisions.mjs';
import { decisionHarness, token } from './helpers/web-decisions.mjs';
import { ENV } from './helpers/improve.mjs';

const WHAT = 'working records contradict references or delivery facts';
const result = (over = {}) => ({ id: 'record_contradictions', what: WHAT, unit: 'contradictions', better: 'lower', bound: 0, state: 'ok', value: 0, detail: 'none observed', facts: {}, ...over });
const broken = result({ state: 'broken', value: null, detail: 'reconciliation incomplete: Command failed: gh api repos/acme/ledger/pulls/130' });
const others = [
  { id: 'lessons_without_guard', what: 'lessons whose guard is empty, "to write", or planned without a phase', unit: 'lessons', better: 'lower', bound: 0, state: 'outside', value: 4, detail: '#3, #5 of 9', facts: { ids: [3, 5], path: 'docs/lessons.md' } },
];
const row = (id, what, value, bound, state, detail) => `| \`${id}\` — ${what} | ${value} | ${bound} | ${state} | ${detail} |`;
const report = (date, rows, proposal) => `# Health — ${date}\n\n| Measure | Value | Bound | State | Detail |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nRatchet: no bound moved.\n\n## Proposal\n\n${proposal}\n\nA person decides whether this becomes a phase, or declines it.\n`;
// An older report, as the night wrote it before phase 153: no plain block.
const OLD_LINE = '**`record_contradictions`** (broken) — Fix the record_contradictions instrument: reconciliation incomplete: Command failed: gh api repos/acme/ledger/pulls/130 <img src=x onerror=alert(1)>. A measure that cannot run is not a zero (lesson 6).';
const oldReport = report('2026-10-25', [row('record_contradictions', WHAT, '—', '≤ 0', 'broken', 'reconciliation incomplete: Command failed: gh api repos/acme/ledger/pulls/130')], OLD_LINE);
const later = (date, state) => report(date, [row('record_contradictions', WHAT, state === 'broken' ? '—' : '0', '≤ 0', state, state === 'ok' ? 'no structured contradictions observed' : 'reconciliation incomplete: a read failed')], 'None: every measure is within its bound.');
const plainLines = text => text.split('\n').filter(l => Object.values(PLAIN_LABELS).some(label => l.startsWith(`- **${label}:**`)));

function assertPlain(plain, lines) {
  for (const key of ['wrong', 'deciding', 'accept', 'decline', 'nothing']) assert.ok(plain[key]?.length > 20, key);
  assert.match(plain.accept, /accepted/i); assert.match(plain.decline, /declined/i); assert.match(plain.nothing, /Nothing changes/);
  assert.ok(['accept', 'decline'].includes(plain.recommend.choice)); assert.ok(plain.recommend.reason.length > 20);
  const block = lines ?? Object.values(plain).map(v => typeof v === 'string' ? v : v.reason).join('\n');
  for (const raw of ['record_contradictions', 'gh api', 'Command failed', 'acme/ledger', 'pulls/130', '`', '<img', 'lesson 6']) assert.equal(block.includes(raw), false, `plain block carries ${raw}`);
}

test('a proposal says what is being decided', () => {
  // A new report: the first line is unchanged, the plain block follows it.
  const results = [broken, ...others], proposal = propose(results, { name: 'Acme' });
  const text = page({ config: { name: 'Acme' }, date: '2026-10-25', results, proposal, tightened: [] });
  const p = proposalOf(text);
  assert.equal(p.measure, 'record_contradictions');
  assert.equal(p.text.split('\n')[0], `**\`record_contradictions\`** (broken) — ${proposal.text}`);
  const plain = parsePlain(p.text), lines = plainLines(p.text);
  assert.ok(plain, 'the report carries a plain block');
  assert.equal(lines.length, 6);
  assertPlain(plain, lines.join('\n'));
  assert.match(plain.wrong, /a GitHub read failed/);
  assert.equal(plain.recommend.choice, 'accept');
  const decided = decideLegacyProposal(text, { decision: 'decline', reason: 'Acme owner: not now', today: '2026-10-26' });
  assert.deepEqual(proposalOf(decided.content).decided, { date: '2026-10-26', decision: 'declined' });
  // An outside measure names its value and limit, still without its id.
  const outside = plainProposal(others[0], { date: '2026-10-25' });
  assertPlain(outside); assert.match(outside.wrong, /found 4 .*at most 0/);
  assert.equal(JSON.stringify(outside).includes('lessons_without_guard'), false);
  // An older report has no block: it still parses, is still decided, and a block is derived the same way.
  const old = proposalOf(oldReport);
  assert.equal(old.measure, 'record_contradictions'); assert.equal(parsePlain(old.text), null);
  const derived = plainProposal(measureRow(oldReport, old.measure), { date: '2026-10-25' });
  assertPlain(derived); assert.deepEqual(derived, plain);
  assert.deepEqual(proposalOf(decideLegacyProposal(oldReport, { decision: 'accept', today: '2026-10-26' }).content).decided, { date: '2026-10-26', decision: 'accepted' });
});

const health = files => {
  const h = decisionHarness();
  Object.assign(h.source.files, files);
  return { h, d: createDecisions(h.config, { fetcher: h.fetcher, now: () => h.state.now }) };
};
const target = { kind: 'health', path: 'docs/health/2026-10-25.md' };

test('a proposal that fixed itself says so', async () => {
  assert.equal(fixedSince('record_contradictions', [{ date: '2026-10-26', text: later('2026-10-26', 'broken') }, { date: '2026-10-28', text: later('2026-10-28', 'ok') }, { date: '2026-10-30', text: later('2026-10-30', 'ok') }]), '2026-10-28');
  assert.equal(fixedSince('record_contradictions', [{ date: '2026-10-30', text: later('2026-10-30', 'broken') }]), null);
  assert.equal(freshness('record_contradictions', []).state, 'newest');
  // Back within its bound in the newer reports: says so and recommends Decline.
  const fixed = await health({ [target.path]: oldReport, 'docs/health/2026-10-27.md': later('2026-10-27', 'broken'), 'docs/health/2026-10-28.md': later('2026-10-28', 'ok'), 'docs/health/2026-10-30.md': later('2026-10-30', 'ok') });
  const q = (await fixed.d.detail(fixed.h.access, token, fixed.h.project, target)).question;
  assert.equal(q.freshness.state, 'fixed'); assert.equal(q.freshness.fixedOn, '2026-10-28');
  assert.equal(q.plain.recommend.choice, 'decline');
  assert.match(q.plain.recommend.reason, /^This fixed itself on 28 October 2026/);
  assert.match(q.freshness.text, /fixed itself on 28 October 2026/);
  // Still outside in the newest report: no such claim; the report's own recommendation stands.
  const still = await health({ [target.path]: oldReport, 'docs/health/2026-10-30.md': later('2026-10-30', 'broken') });
  const s = (await still.d.detail(still.h.access, token, still.h.project, target)).question;
  assert.equal(s.freshness.state, 'still'); assert.equal(s.plain.recommend.choice, 'accept');
  assert.doesNotMatch(JSON.stringify(s), /fixed itself/);
  // A newest report too large to open: the page says it could not check, and claims nothing.
  const big = await health({ [target.path]: oldReport, 'docs/health/2026-10-30.md': later('2026-10-30', 'ok') + 'x'.repeat(262145) });
  const b = (await big.d.detail(big.h.access, token, big.h.project, target)).question;
  assert.equal(b.freshness.state, 'unchecked'); assert.match(b.freshness.text, /couldn’t check whether this is still true.*too large/i);
  assert.equal(b.plain.recommend.choice, 'accept');
});

test('the decision page leads with the plain question', async () => {
  const { h } = health({ [target.path]: oldReport, 'docs/health/2026-10-30.md': later('2026-10-30', 'ok') });
  const signed = await h.login();
  const response = await h.service(h.request(`/projects/studio/decisions?${new URLSearchParams(target)}`, { cookie: signed.cookie }));
  assert.equal(response.status, 200);
  const html = await response.text();
  const plainAt = html.indexOf('data-decision-plain'), technicalAt = html.indexOf('decision-technical'), formAt = html.indexOf('data-decision-form');
  assert.ok(plainAt > 0 && plainAt < technicalAt && technicalAt < formAt, 'plain block, then the proposal as written, then the choice');
  const plain = html.slice(plainAt, technicalAt);
  for (const label of ['What’s wrong', 'What you’re deciding', 'If you accept', 'If you decline', 'If you do nothing', 'Plates recommends: Decline.']) assert.ok(plain.includes(label), label);
  assert.match(plain, /fixed itself on 30 October 2026/);
  const technical = html.slice(html.indexOf('class="decision-markdown"'), formAt);
  assert.match(technical, /<code>record_contradictions<\/code>/);
  assert.equal(/\*\*|`/.test(technical), false, 'no raw markdown markers');
  assert.equal(/<img|onerror=alert\(1\)>/.test(technical.replace(/&lt;img src=x onerror=alert\(1\)&gt;/, '')), false);
  assert.match(technical, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(html.includes('<img'), false);
});

/** A fleet's worth of reconciliation observations, as the reconciliation engine shapes them. */
function fleetFacts() {
  const sha = i => i.toString(16).padStart(64, '0'), blobs = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`docs/phases/${String(i).padStart(4, '0')}-acme-phase.md`, sha(i)]));
  const issue = (rule, i) => ({ rule, path: `docs/phases/${String(i).padStart(4, '0')}-acme-phase.md`, message: `Acme observation ${i}: ${'detail '.repeat(20)}` });
  return {
    findings: Array.from({ length: 300 }, (_, i) => issue('pr-state-contradiction', i)),
    notes: Array.from({ length: 1200 }, (_, i) => issue('legacy-record', i)),
    unknown: Array.from({ length: 150 }, (_, i) => issue('github-unavailable', i)),
    snapshot: { blobs, prs: {}, remote: 'incomplete', config_hash: sha(1), inventory: Object.keys(blobs), actions: {} },
    proposals: Array.from({ length: 12 }, (_, i) => ({ fingerprint: sha(i), rule: 'pr-reference-unresolved', path: issue('x', i).path, manual_only: true, confidence: 'advisory', source: { sha: sha(i) }, proposed_edit: 'Identify the intended Acme PR before asserting its state.', expected_blobs: blobs, expected_prs: {} })),
  };
}

test('a health report stays small enough to open', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-plain-report-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app', practices: ['base', 'night'], canvas: { projectKey: 'acme-project' } }));
  const facts = fleetFacts(), base = MEASURES.find(m => m.id === 'record_contradictions');
  assert.ok(JSON.stringify(facts, null, 2).length > 4 * 128 * 1024, 'the fixture is fleet-sized');
  // An older page that carried the full set inline is still read.
  const inline = { findings: facts.findings.slice(0, 3), unknown: facts.unknown.slice(0, 2), notes: [], snapshot: { blobs: {} }, proposals: [] };
  await mkdir(join(root, 'docs/health'), { recursive: true });
  await writeFile(join(root, 'docs/health/2026-10-29.md'), `${later('2026-10-29', 'ok')}\n## Reconciliation (manual review)\n\n\`\`\`json\n${JSON.stringify(inline, null, 2)}\n\`\`\`\n`);
  await improve({ root, report: true, date: '2026-10-30' }, { env: ENV, measures: [{ ...base, run: () => ({ value: facts.findings.length, facts }) }] });
  const text = await readFile(join(root, 'docs/health/2026-10-30.md'), 'utf8');
  assert.ok(Buffer.byteLength(text) < 128 * 1024, `report is ${Buffer.byteLength(text)} bytes`);
  assert.match(text, /300 findings, 150 unknown, 1200 advisory notes and 12 manual proposals/);
  assert.match(text, /`2026-10-30\.reconciliation\.json` beside this page/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/health/2026-10-30.reconciliation.json'), 'utf8')), facts);
  // The decision reader still parses and decides the bounded page.
  const p = proposalOf(text);
  assert.equal(p.measure, 'record_contradictions'); assert.ok(parsePlain(p.text));
  assert.ok(decideLegacyProposal(text, { decision: 'accept', today: '2026-10-31' }).content.includes('**Decided 2026-10-31: accepted**'));
  // The canvas snapshot finds the full set through the sidecar, and the older page's inline set.
  const s = await snapshot({ root, now: '2026-10-31T12:00:00Z', env: { ...process.env, PLATES_GH: '/not/an/executable', PLATES_STITCH: '/not/an/executable' } });
  const byDate = date => s.entities.find(e => e.key === `health:${date}`);
  assert.equal(byDate('2026-10-30').reconciliation.findings.length, 300, JSON.stringify(s.warnings));
  assert.equal(byDate('2026-10-30').reconciliation.unknown, 150);
  assert.equal(byDate('2026-10-29').reconciliation.findings.length, 3);
  assert.equal(byDate('2026-10-29').reconciliation.unknown, 2);
  assert.equal(s.entities.filter(e => e.kind === 'health' && e.key.startsWith('health:2026')).length, 2, 'the sidecar is not read as a report');
});

test('a file too large to open says so', async () => {
  const { h, d } = health({ [target.path]: oldReport + 'x'.repeat(262145) });
  await assert.rejects(d.detail(h.access, token, h.project, target), e => e.code === 'source_too_large' && e.status === 413);
  const signed = await h.login(), query = new URLSearchParams(target);
  const page = await h.service(h.request(`/projects/studio/decisions?${query}`, { cookie: signed.cookie }));
  assert.equal(page.status, 413);
  const html = await page.text();
  assert.match(html, /too large to open/); assert.match(html, /256 KiB/);
  assert.doesNotMatch(html, /connection is unavailable/);
  const api = await h.service(h.request(`/api/projects/studio/decisions?${query}`, { cookie: signed.cookie }));
  assert.equal(api.status, 413); assert.equal((await api.json()).error, 'source_too_large');
});
