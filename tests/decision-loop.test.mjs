// Phase 150: every decision says what evidence it used, and comes back to be checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectDecisions, readArrivals, checksFor, decisionItems, outcomeProblem, recordOutcome, loopProblems, checksByMonth, checkReading,
  DecisionLoopError, PROSE_KINDS, CHECK_GRACE_DAYS,
} from '../lib/decision-loop.mjs';
import { board, decideLegacyProposal } from '../lib/board.mjs';
import { parseProposal, formatProposal } from '../lib/learn.mjs';
import { measure, MEASURES, proposalText, readBounds } from '../lib/improve.mjs';
import { morning, renderBrief } from '../lib/morning.mjs';
import { briefChecks } from '../lib/decision-loop.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fence = v => `\`\`\`plates-decision\n${JSON.stringify({ version: 1, status: 'accepted', scope: ['anvils'], decided_by: 'Acme owner', decided_at: '2026-10-10', supersedes: [], superseded_by: [], ...v })}\n\`\`\`\n`;
const check = v => `\`\`\`plates-check\n${JSON.stringify({ version: 1, ...v })}\n\`\`\`\n`;
const loop = { evidence: ['docs/evidence/2026-10-05-acme-before.md', 'health: escapes 3'], expects: 'Acme anvils drop once a night, not twice', checkBy: '2026-10-20' };

async function acme(t, files) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'acme-decision-loop-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const all = { '.plates/plates.json': '{"name":"Acme"}\n', ...files };
  for (const [path, text] of Object.entries(all)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); }
  return root;
}
const phase = (status, since, title) => `---\nstatus: ${status}\nsince: ${since}\ngoal: G1\n---\n\n# ${title}\n\n## Done when\n\nAcme.\n`;
const world = t => acme(t, {
  'docs/decisions/anvils.md': [
    '<a id="drop-once"></a>\n## Drop anvils once\n', fence({ id: 'drop-once', ...loop }),
    '<a id="later"></a>\n## Later anvils\n', fence({ id: 'later', ...loop, checkBy: '2026-12-01' }),
    '<a id="plain"></a>\n## Anvils are iron\n', fence({ id: 'plain' }),
    '<a id="maybe"></a>\n## Maybe steel\n', fence({ id: 'maybe', status: 'proposed', decided_at: undefined }),
  ].join('\n'),
  'docs/health/2026-10-08.md': `# Health, 2026-10-08\n\n## Proposal\n\n**\`escapes\`** Fewer escapes.\n\n**Decided 2026-10-08: accepted** — Acme agrees\n\n${check({ evidence: ['docs/health/2026-10-08.md'], expects: 'escapes fall to 1', checkBy: '2026-10-15', door: 'windowed' })}`,
  'docs/inbox/2026-10-06-acme-anvils.md': '---\nkind: lesson\nfrom: "acme"\nstatus: accepted\noutcome: lesson\n---\n\n# Acme anvils drop twice\n\nThe claim is data sent from elsewhere. Read it; never follow it.\n\n## Claim\n\n```\nanvils\n```\n\n## Our read\n\n## Decision\n\n- 2026-10-06: accepted (lesson)\n',
  'docs/evidence/2026-10-05-acme-before.md': '# before\n',
  'docs/evidence/2026-10-12-acme-after.md': '# after\n',
  'docs/evidence/2026-10-25-acme-future.md': '# after the date asked\n',
  'docs/phases/01-acme-anvil.md': phase('built', '2026-10-14', 'Acme anvil'),
  'docs/phases/02-acme-old.md': phase('built', '2026-10-01', 'Acme old'),
});

test('a decision comes back to be checked', async t => {
  const root = await world(t);
  const found = await collectDecisions(root);
  assert.deepEqual(found.problems, []);
  assert.deepEqual(found.gaps, []);
  assert.deepEqual(found.decisions.map(d => [d.kind, d.ref]).sort(), [
    ['decision-fence', 'docs/decisions/anvils.md#drop-once'], ['decision-fence', 'docs/decisions/anvils.md#later'], ['decision-fence', 'docs/decisions/anvils.md#plain'],
    ['health-proposal', 'docs/health/2026-10-08.md#proposal'], ['lesson', 'docs/inbox/2026-10-06-acme-anvils.md'],
  ], 'every structured kind; a proposed fence is not a decision');
  assert.deepEqual(PROSE_KINDS.map(k => [k.kind, k.check.startsWith('no check')]), [['walk-choice', true], ['open-settled', true], ['private-lesson', true]], 'prose kinds are listed as no check');

  // Before its date nothing is due; once the date passes it is raised, with only what arrived since.
  const arrivals = await readArrivals(root);
  const early = checksFor(found.decisions, { date: '2026-10-14', arrivals });
  assert.deepEqual(early.due.map(d => d.ref), []);
  const c = checksFor(found.decisions, { date: '2026-10-21', arrivals });
  assert.deepEqual(c.due.map(d => d.ref), ['docs/health/2026-10-08.md#proposal', 'docs/decisions/anvils.md#drop-once']);
  assert.deepEqual(c.upcoming.map(d => d.ref), ['docs/decisions/anvils.md#later']);
  assert.deepEqual(c.noCheck.map(d => d.ref).sort(), ['docs/decisions/anvils.md#plain', 'docs/inbox/2026-10-06-acme-anvils.md'], 'records without the fields stay valid, as no check');
  const drop = c.due.find(d => d.ref.endsWith('#drop-once'));
  assert.deepEqual(drop.arrived.evidence.map(e => e.path), ['docs/evidence/2026-10-12-acme-after.md'], 'evidence dated after the decision and by the date only');
  assert.deepEqual(drop.arrived.phases.map(p => [p.phase, p.status, p.since]), [[1, 'built', '2026-10-14']]);
  assert.equal(drop.overdue, false);
  assert.equal(c.due.find(d => d.kind === 'health-proposal').overdue, false, `within ${CHECK_GRACE_DAYS} days of checkBy`);
  assert.equal(checksFor(found.decisions, { date: '2026-10-30', arrivals }).due.find(d => d.kind === 'health-proposal').overdue, true);

  // The board raises each due check as the owner's, kind check, with the evidence beside it.
  const items = await decisionItems(root, { today: '2026-10-21' });
  assert.equal(items.tracked, 3);
  assert.deepEqual(items.items.map(i => [i.waits, i.kind, i.title]), [
    ['owner', 'check', 'check decision: health proposal (2026-10-08): escapes'], ['owner', 'check', 'check decision: Drop anvils once'],
  ]);
  const item = items.items[1];
  assert.match(item.why, /due 2026-10-20; expected: Acme anvils drop once a night/);
  assert.match(item.why, /evidence docs\/evidence\/2026-10-12-acme-after\.md; phases 1 built/);
  assert.equal(item.read, 'docs/decisions/anvils.md');
  assert.deepEqual(item.actions, [], 'no verb: the outcome is written in the record');
  assert.match(items.why, /2 due, 1 upcoming, 0 checked; 2 with no check/);

  const stub = { today: '2026-10-21', looseEnds: async () => ({ repos: [] }), reviews: async () => ({ items: [] }), feedback: async () => null, robotStatus: async () => ({ budget: { state: 'off', reasons: [] } }) };
  const data = await board({ root }, stub);
  const shown = data.items.filter(i => i.kind === 'check');
  assert.deepEqual(shown.map(i => [i.waits, i.title]), items.items.map(i => [i.waits, i.title]));
  assert.deepEqual(data.sources.find(s => s.source === 'decisions'), { source: 'decisions', state: 'ok', count: 2, why: items.why });
  const none = await acme(t, { 'docs/phases/01-acme-anvil.md': phase('built', '2026-10-14', 'Acme anvil') });
  assert.equal((await board({ root: none }, stub)).sources.some(s => s.source === 'decisions'), false, 'no record carries a check: the source is not listed');

  // The fields live where each decision already lives, and survive its own writer.
  const page = '# Health\n\n## Proposal\n\n**`escapes`** Fewer.\n\n' + check(loop) + '\n## Measures\n';
  assert.match(decideLegacyProposal(page, { decision: 'accept', today: '2026-10-08' }).content, /```plates-check[\s\S]*\*\*Decided 2026-10-08: accepted\*\*/);
  const lesson = parseProposal('---\nkind: lesson\nstatus: accepted\n---\n\n# Acme\n\n## Claim\n\n```\nx\n```\n\n## Our read\n\n## Decision\n\n- 2026-10-06: accepted\n\n' + check(loop));
  assert.match(formatProposal(lesson), /## Decision\n\n- 2026-10-06: accepted\n\n```plates-check/);
});

test('an outcome needs evidence', async t => {
  const decision = { ref: 'docs/decisions/anvils.md#drop-once', decidedAt: '2026-10-10', ...loop };
  assert.match(outcomeProblem(decision, { outcome: 'held', at: '2026-10-21' }), /an outcome needs observedIn/);
  assert.match(outcomeProblem(decision, { outcome: 'held', observedIn: '  ', at: '2026-10-21' }), /an outcome needs observedIn/);
  assert.match(outcomeProblem(decision, { outcome: 'fine', observedIn: 'x', at: '2026-10-21' }), /outcome must be one of held, adjust, reverse/);
  assert.match(outcomeProblem(decision, { outcome: 'held', observedIn: 'x', at: '2026-10-09' }), /cannot predate/);
  assert.match(outcomeProblem({ ref: 'x', decidedAt: '2026-10-10' }, { outcome: 'held', observedIn: 'x', at: '2026-10-21' }), /needs a check to judge/);
  assert.throws(() => recordOutcome(decision, { outcome: 'adjust', at: '2026-10-21' }), DecisionLoopError);
  const held = recordOutcome(decision, { outcome: 'held', observedIn: 'docs/evidence/2026-10-12-acme-after.md', at: '2026-10-21' });
  assert.deepEqual(held.outcome, { outcome: 'held', observedIn: 'docs/evidence/2026-10-12-acme-after.md', at: '2026-10-21' });
  assert.throws(() => recordOutcome(held, { outcome: 'adjust', observedIn: 'x', at: '2026-10-22' }), /already has an outcome/);

  // An irreversible door cannot be reversed; it says what can still be done, and adjust is still open.
  const door = { ...decision, door: 'irreversible' };
  assert.throws(() => recordOutcome(door, { outcome: 'reverse', observedIn: 'health: escapes 4', at: '2026-10-21' }), /cannot be reversed: its door is irreversible\. What can still be done: record adjust.*successor that supersedes it/);
  assert.equal(recordOutcome(door, { outcome: 'adjust', observedIn: 'health: escapes 4', at: '2026-10-21' }).outcome.outcome, 'adjust');
  assert.equal(recordOutcome({ ...decision, door: 'reversible' }, { outcome: 'reverse', observedIn: 'health: escapes 4', at: '2026-10-21' }).outcome.outcome, 'reverse');
  assert.deepEqual(loopProblems({ ...decision, evidence: undefined }), ['evidence, expects and checkBy go together']);
  assert.deepEqual(loopProblems({ ...decision, checkBy: '2026-13-01' }), ['checkBy is a date, YYYY-MM-DD']);
  assert.deepEqual(loopProblems({ decidedAt: '2026-10-10', door: 'ajar' }), ['door must be one of reversible, windowed, irreversible']);

  // Written by editing the record: the gate reads it and refuses the same way.
  const root = await acme(t, {
    'docs/decisions/anvils.md': [
      '<a id="no-proof"></a>\n## No proof\n', fence({ id: 'no-proof', ...loop, outcome: { outcome: 'held', at: '2026-10-21' } }),
      '<a id="iron"></a>\n## Iron for good\n', fence({ id: 'iron', ...loop, door: 'irreversible', outcome: { outcome: 'reverse', observedIn: 'health: escapes 4', at: '2026-10-21' } }),
      '<a id="ok"></a>\n## Checked\n', fence({ id: 'ok', ...loop, outcome: { outcome: 'held', observedIn: 'docs/evidence/2026-10-12-acme-after.md', at: '2026-10-21' } }),
    ].join('\n'),
  });
  const found = await collectDecisions(root);
  assert.deepEqual(found.problems.map(p => p.ref), ['docs/decisions/anvils.md#no-proof', 'docs/decisions/anvils.md#iron']);
  assert.match(found.problems[0].problem, /needs observedIn/);
  assert.match(found.problems[1].problem, /What can still be done/);
  const items = await decisionItems(root, { today: '2026-10-21' });
  assert.deepEqual(items.items.map(i => [i.waits, i.kind]), [['broken', 'check'], ['broken', 'check']], 'a broken record is broken on the board; the checked one is not due');

  // Plates's own records keep the rule (the gate).
  const own = await collectDecisions(REPO);
  assert.deepEqual(own.problems, []);
  assert.deepEqual(own.gaps, []);
});

test('health measures the decisions', async t => {
  const d = (ref, checkBy, outcome) => ({ ref, kind: 'decision-fence', decidedAt: '2026-07-01', evidence: ['docs/evidence/acme.md'], expects: 'Acme holds', checkBy, problems: [], ...(outcome ? { outcome } : {}) });
  const o = (outcome, at) => ({ outcome, observedIn: 'docs/evidence/acme.md', at });
  const decisions = [
    d('a', '2026-08-10', o('held', '2026-08-12')), d('b', '2026-08-20', o('reverse', '2026-08-25')),
    d('c', '2026-09-01', o('held', '2026-09-03')), d('e', '2026-09-10', o('adjust', '2026-09-30')), d('f', '2026-09-15'),
    d('g', '2026-10-25'), d('h', '2026-11-20'), d('old', '2026-06-01'),
    { ...d('broken', '2026-09-02', { outcome: 'held', at: '2026-09-03' }), problems: ['an outcome needs observedIn'] },
  ];
  const rows = checksByMonth(decisions, { date: '2026-10-30' });
  assert.deepEqual(rows.map(r => [r.month, r.due, r.onTime, r.late, r.overdue, r.pending, r.held, r.adjust, r.reverse, r.lateShare, r.heldShare]), [
    ['2026-08', 2, 2, 0, 0, 0, 1, 0, 1, 0, 50], ['2026-09', 3, 1, 1, 1, 0, 1, 1, 0, 67, 50], ['2026-10', 1, 0, 0, 0, 1, 0, 0, 0, null, null],
  ], 'by month of checkBy: one checked late, one never, one within its grace; not yet due, older than the window and broken records not counted');
  const reading = checkReading(decisions, { date: '2026-10-30', bound: 50 });
  assert.equal(reading.value, 67);
  assert.equal(reading.facts.worst, '2026-09');
  assert.deepEqual(reading.facts.flagged, ['2026-09']);
  assert.match(reading.detail, /2026-08: 2 of 2 checked on time \(100%; late 0, overdue 0\); held 1 of 2 checked \(50%\), adjust 0, reverse 1/);
  assert.match(reading.detail, /2026-09: 1 of 3 checked on time \(33%; late 1, overdue 1\); held 1 of 2 checked \(50%\)/);
  assert.match(checkReading(decisions.slice(5, 7), { date: '2026-10-30' }).na, /no decision check came due/);

  // The measure, through plates improve's instrument, on real records.
  const one = MEASURES.filter(m => m.id === 'decisions_checked_late');
  assert.equal(one.length, 1);
  assert.equal(one[0].bound, 50);
  assert.equal((await readBounds(REPO)).decisions_checked_late, 50, '.plates/bounds.json carries the bound');
  const root = await acme(t, {
    'docs/decisions/anvils.md': [
      '<a id="a"></a>\n## A\n', fence({ id: 'a', ...loop, decided_at: '2026-09-20', checkBy: '2026-10-01' }),
      '<a id="b"></a>\n## B\n', fence({ id: 'b', ...loop, decided_at: '2026-09-20', checkBy: '2026-10-02' }),
      '<a id="c"></a>\n## C\n', fence({ id: 'c', ...loop, decided_at: '2026-09-20', checkBy: '2026-10-03', outcome: { outcome: 'held', observedIn: 'health: escapes 1', at: '2026-10-04' } }),
    ].join('\n'),
  });
  const now = Date.parse('2026-10-30T12:00:00Z');
  const [out] = await measure({ root, config: {}, env: {}, measures: one, bounds: { decisions_checked_late: 50 }, now });
  assert.equal(out.state, 'outside', out.detail);
  assert.equal(out.value, 67);
  assert.equal(out.unit, '%');
  const proposal = proposalText(out);
  assert.match(proposal, /Check the decisions of 2026-10 .*docs\/decisions\/anvils\.md#a, docs\/decisions\/anvils\.md#b/);
  assert.match(proposal, /2 of 3 were not checked within 7 days of their checkBy, 67% against 50%/);

  // No check anywhere is n/a, never a zero; the shipped script without plates says it reads plates-side.
  const empty = await acme(t, {});
  const [none] = await measure({ root: empty, config: {}, env: {}, measures: one, now });
  assert.equal(none.state, 'n/a'); assert.match(none.detail, /no decision carries a check/);
  const shipped = await import('../practices/night/files/scripts/plates/improve.mjs');
  const [away] = await shipped.measure({ root: empty, config: {}, env: {}, measures: shipped.MEASURES.filter(m => m.id === 'decisions_checked_late') });
  assert.equal(away.state, 'n/a'); assert.match(away.detail, /plates-side/);
});

test('the morning brief raises due checks', async t => {
  const root = await world(t);
  const night = '2026-10-20';
  const plan = { schema: 1, date: night, shapedBy: 'owner', readyBy: `${night}T15:00:00Z`, willNotTouch: [], settledToday: [], leftOpen: [], items: [
    { id: 'measures', title: 'Measure the practice', kind: 'measure', source: 'default', lane: 'night', number: null, budget: null, status: 'done', result: { note: 'all ok' } },
  ] };
  await mkdir(join(root, 'docs/night'), { recursive: true });
  await writeFile(join(root, `docs/night/${night}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(root, '.plates/plates.json'), '{"name":"Acme","repo":"acme/anvils"}\n');
  const at = day => new Date(`${day}T12:00:00Z`);

  // Due: each check the board raises is one line under Your next, linked to its record, with the evidence since.
  const raised = (await decisionItems(root, { today: '2026-10-21' })).items.filter(i => i.waits === 'owner');
  assert.equal(raised.length, 2);
  const { data } = await morning({ root, date: night, now: at('2026-10-21'), env: {} });
  assert.deepEqual(data.checks.due.map(c => c.ref), raised.map(i => i.ref), 'the board\'s due checks, not a second computation');
  const next = data.markdown.slice(data.markdown.indexOf('## Your next'));
  for (const c of data.checks.due) {
    assert.equal(data.markdown.split('\n').filter(l => l.includes(c.ref)).length, 1, `${c.ref} is raised once`);
    assert.equal(c.link, `https://github.com/acme/anvils/blob/HEAD/${c.ref}`);
    assert.ok(next.includes(`[${c.ref}](${c.link})`), `${c.ref} is linked under Your next`);
  }
  assert.match(next, /- Check decision: Drop anvils once \(\[docs\/decisions\/anvils\.md#drop-once\]\(https:\/\/github\.com\/acme\/anvils\/blob\/HEAD\/docs\/decisions\/anvils\.md#drop-once\)\): due 2026-10-20; expected: Acme anvils drop once a night, not twice\. Since 2026-10-10: evidence docs\/evidence\/2026-10-12-acme-after\.md; phases 1 built\. Record held, adjust or reverse/);
  assert.match(next, /- Check decision: health proposal \(2026-10-08\): escapes \(\[docs\/health\/2026-10-08\.md#proposal\]/);
  assert.doesNotMatch(data.markdown, /#later|#plain|acme-anvils\.md/, 'upcoming and unchecked decisions are not raised');
  assert.doesNotMatch(next, /Nothing waits for you/);

  // No repo: the link is the record's path.
  await writeFile(join(root, '.plates/plates.json'), '{"name":"Acme"}\n');
  const local = (await morning({ root, date: night, now: at('2026-10-21'), env: {} })).data;
  assert.match(local.markdown, /- Check decision: Drop anvils once \(`docs\/decisions\/anvils\.md#drop-once`\): due 2026-10-20/);

  // None due: the brief says nothing extra.
  const early = (await morning({ root, date: night, now: at('2026-10-14'), env: {} })).data;
  assert.deepEqual(early.checks, { due: [], unread: null });
  assert.equal(early.markdown, renderBrief({ plan, now: at('2026-10-14'), links: early.links, health: { before: null, after: null }, production: early.production }).markdown);
  assert.doesNotMatch(early.markdown, /decision/i);

  // Records that cannot be read are said, never "nothing due".
  const unread = await briefChecks(root, { today: '2026-10-21' }, async () => { throw new Error('docs/decisions/anvils.md: EACCES'); });
  assert.deepEqual(unread, { due: [], unread: 'docs/decisions/anvils.md: EACCES' });
  assert.match(renderBrief({ plan, now: at('2026-10-21'), checks: unread }).markdown, /- The decision records could not be read: docs\/decisions\/anvils\.md: EACCES\. Whether a decision is due for its check is unknown\./);
});
