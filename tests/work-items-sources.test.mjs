// The item model's local sources (lib/work-items.mjs; the board's, phase 51) and
// plates walk: a synthetic Acme project and fleet, every source injected (no
// network: the reviews and the fleet are stubs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as boardModule from '../lib/work-items.mjs';
import { workItems as board, reviewItems, walkDone, walkDecide } from '../lib/work-items.mjs';
import vm from 'node:vm';
import { timeSummary } from '../lib/time.mjs';
import { formatProposal } from '../lib/learn.mjs';
import { makeTimeProposal, formatTimeProposal, writeHealthReport, parseTimeProposal } from '../practices/night/files/scripts/plates/time-proposals.mjs';
import { improve } from '../practices/night/files/scripts/plates/improve.mjs';
import { unansweredPrs, fromWindow } from '../practices/night/files/scripts/plates/lib.mjs';
import { run as roadmap } from '../practices/phases/files/scripts/roadmap.mjs';
import { run } from './helpers/run.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-10-08';

const phase = ({ status = 'planned', depends = '[]', evidence = '[]', acceptance, extra = '', title = 'An Acme phase', next = 'Build the anvil.' }) => `---
status: ${status}
since: 2026-10-01
goal: G0
depends: ${depends}
note: "Acme."
evidence: ${evidence}
${extra}---

# ${title}

## Done when

The anvil lands.

## Scope

Small.

## Acceptance

${acceptance}

## Proof

A command.

## Deliberately open

Nothing yet.

## Next action

${next}

## Trajectory

- **2026-10-01** — Acme started.
`;

const built = '- [x] Built. `tests/anvil.test.mjs`';
const walkBox = '- [ ] ⚑ by hand: the owner drops one on a coyote.';

/** An Acme project: a walk owed (owner, time, external), a dated phase, a buildable one, a health proposal and a lesson. */
async function acme({ git = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'plates-board-'));
  const w = async (p, text) => { await mkdir(dirname(join(root, p)), { recursive: true }); await writeFile(join(root, p), text); };
  await w('.plates/plates.json', JSON.stringify({ name: 'Acme', repo: 'acme/app', plates: 'self', inbox: 'acme/inbox' }));
  await w('docs/goals.json', JSON.stringify([{ id: 'G0', title: 'Anvils', outcome: 'They land.' }]));
  await w('docs/evidence/acme-0.md', '# Evidence: phase 0\n');
  await w('docs/evidence/acme-1.md', '# Evidence: phase 1\n\n## Automated checks\n\n- ok\n');
  await w('docs/phases/00-start.md', phase({ status: 'built', evidence: '["evidence/acme-0.md"]', acceptance: '- [x] Started. `tests/a.test.mjs`', next: 'None.' }));
  await w('docs/phases/01-walk.md', phase({ status: 'partial', evidence: '["evidence/acme-1.md"]', acceptance: `${built}\n${walkBox}`, extra: 'owes: walk\n', title: 'The owner walks it', next: '⚑ The owner drops one.' }));
  await w('docs/phases/02-nights.md', phase({ status: 'partial', acceptance: `${built}\n- [ ] ⚑ by hand: seven nights pass green.`, extra: 'owes: walk\nwaits: time\n', title: 'Seven nights' }));
  await w('docs/phases/03-later.md', phase({ acceptance: '- [ ] Lands. `tests/later.test.mjs`', extra: 'after: 2026-11-01\n', title: 'Not before November' }));
  await w('docs/phases/04-build.md', phase({ depends: '[0]', acceptance: '- [ ] Lands. `tests/build.test.mjs`', title: 'Build the anvil' }));
  await w('docs/phases/05-secret.md', phase({ status: 'partial', acceptance: `${built}\n- [ ] ⚑ by hand: Acme Corp sets the secret.`, extra: 'owes: walk\nwaits: external\n', title: 'A secret set elsewhere' }));
  await w('docs/phases/06-two.md', phase({ status: 'partial', acceptance: `${built}\n- [ ] ⚑ by hand: the owner reads one.\n- [ ] ⚑ by hand: the owner reads two.`, extra: 'owes: walk\n', title: 'Two walks' }));
  await w('docs/phases/07-mixed.md', phase({ status: 'partial', acceptance: `${walkBox}\n- [ ] Still to build. \`tests/mixed.test.mjs\``, title: 'Mixed' }));
  await w('docs/phases/08-bare.md', phase({ status: 'partial', acceptance: `${built}\n${walkBox}`, extra: 'owes: walk\n', title: 'No evidence yet' }));
  await w('docs/phases/09-name.md', phase({ depends: '[0]', acceptance: '- [ ] Named. `tests/name.test.mjs`', title: 'Name the anvil', next: '⚑ The owner picks a name.' }));
  await w('docs/health/2026-10-06.md', '# Acme health\n\n## Proposal\n\n**`old_measure`** (outside) — an older one.\n');
  await w('docs/health/2026-10-07.md', '# Acme health\n\n## Measures\n\nfine\n\n## Proposal\n\n**`escapes`** (outside) — Make phase 4 the next hygiene target.\n\nA person decides whether this becomes a phase, or declines it.\n\n## Notes\n\nAcme.\n');
  await w('docs/inbox/2026-10-07-acme-lesson.md', formatProposal({ meta: { kind: 'lesson', from: 'acme/app', status: 'proposed', outcome: 'lesson', note: 'Acme anvils drop twice' }, title: 'Anvils drop twice', claim: 'They drop twice.', read: 'A real shape.' }));
  await w('plates.json', JSON.stringify([{ repo: 'acme/app', kind: 'node', role: 'managed' }, { repo: 'acme/site', kind: 'web', role: 'managed' }]));
  await roadmap({ root, today: TODAY });
  if (git) {
    execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    execFileSync('git', ['-C', root, 'add', '-A']);
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'acme']);
  }
  return root;
}

const looseData = root => ({ projects: [
  { repo: 'acme/app', dir: root, items: [
    { kind: 'repo', title: 'acme/stray', move: 'add it to plates.json, or delete it (⚑ yours)', commands: ['gh repo view acme/stray'] },
    { kind: 'branch', title: 'acme-wip', move: 'open a PR for it', commands: ['git log'] },
    { kind: 'file', title: 'notes.md', move: 'commit it', commands: [] },
    { kind: 'file', title: 'anvil.mjs', move: 'commit it', commands: [] },
    { kind: 'health', title: 'health proposal: escapes', move: 'decide it', commands: [] },
    { kind: 'review', title: 'reviews', move: 'answer', commands: [] },
    { kind: 'phase', phase: 1, title: 'phase 1', move: 'the owner\'s step', commands: [] },
    { kind: 'session', ending: 'question', title: 'Which anvil?', move: 'answer it', commands: ['claude --resume x'] },
  ] },
] });
const prs = [{ number: 7, title: 'Acme anvils', state: 'open', url: 'https://github.com/acme/app/pull/7', unanswered: 2, oldest: '2026-10-01' },
  { number: 6, title: 'Merged', state: 'merged', url: 'https://github.com/acme/app/pull/6', unanswered: 1, oldest: '2026-10-02' }];
const fleetData = { rows: [
  { repo: 'acme/app', role: 'managed', branch: 'main', adopted: true, practice: { version: '0.8.21', behind: 'current' }, health: { state: 'fresh', last: '2026-10-07' }, ci: { state: 'green' } },
  { repo: 'acme/site', role: 'managed', branch: 'main', adopted: true, practice: { version: '0.8.20', behind: '0.8.20 → 0.8.21' }, health: { state: 'fresh', last: '2026-10-07' }, ci: { state: 'red', workflow: 'check', conclusion: 'failure', at: '2026-10-07T03:00:00Z' } },
] };
const deps = root => ({ today: TODAY, looseEnds: async () => looseData(root),
  reviews: list => reviewItems(list, { today: TODAY, read: async ({ repo }) => repo === 'acme/app' ? prs : [] }), fleet: async () => fleetData });
const titles = (data, waits) => data.items.filter(i => i.waits === waits).map(i => i.title);

test('plates board --json puts each kind of item in its column, from every source', async () => {
  const root = await acme();
  try {
    const data = await board({ root }, deps(root));
    const owner = titles(data, 'owner');
    assert.ok(owner.includes('phase 1: The owner walks it'), 'a ⚑ walk is yours');
    assert.ok(owner.includes('phase 6: Two walks'));
    assert.ok(owner.includes('health proposal (2026-10-07): escapes'), 'the newest page\'s proposal, not an older one');
    assert.ok(owner.some(t => t.startsWith('lesson to decide: Anvils drop twice')));
    assert.ok(owner.includes('acme/app: acme/stray'), 'a loose end marked ⚑ yours');
    assert.ok(owner.includes('acme/app: "Which anvil?"'), 'a question a session asked');
    assert.ok(owner.includes('phase 9: Name the anvil'), 'a buildable phase whose next action is ⚑ is the owner\'s step');
    assert.ok(!owner.some(t => /old_measure/.test(t)));
    // Home's health and phase-1 items and every review come from their own sources: never twice.
    assert.equal(data.items.filter(i => /escapes/.test(i.title)).length, 1);
    assert.equal(data.items.filter(i => /phase 1\b/.test(i.title)).length, 1);
    assert.deepEqual(titles(data, 'agent'), ['phase 4: Build the anvil', 'phase 7: Mixed', 'acme/app: 2 uncommitted files', 'acme/app: acme-wip'], 'buildable phases in order, then the agent\'s loose ends, files as one');
    assert.deepEqual(titles(data, 'time'), ['phase 2: Seven nights', 'phase 3: Not before November'], 'a waits: time walk and an after: phase');
    assert.match(data.items.find(i => i.phase === 3).why, /not buildable before 2026-11-01/);
    assert.deepEqual(titles(data, 'external'), ['phase 5: A secret set elsewhere']);
    assert.deepEqual(titles(data, 'broken').sort(), ['acme/app#7: 2 review comments unanswered', 'acme/site: CI red on main'], 'an open PR\'s unanswered review and a red CI; a merged PR is not listed');
    // Actions settle a "yours" item through a verb.
    const walk = data.items.find(i => i.phase === 1);
    assert.deepEqual(walk.actions.map(a => [a.verb, a.args]), [['walk done', ['1', '--note', 'Looks good.']], ['walk done', ['1']]]);
    assert.equal(walk.actions[1].note, 'required');
    assert.deepEqual(data.items.find(i => i.phase === 6).actions.map(a => a.args.join(' ')), ['6 --box 2 --note Looks good.', '6 --box 2', '6 --box 3 --note Looks good.', '6 --box 3']);
    assert.deepEqual(data.items.find(i => i.kind === 'proposal').actions.map(a => [a.verb, ...a.args].join(' ')), ['walk decide --proposal docs/health/2026-10-07.md --accept', 'walk decide --proposal docs/health/2026-10-07.md --decline']);
    assert.deepEqual(data.items.find(i => i.kind === 'lesson').actions.map(a => [a.verb, ...a.args].join(' ')), ['learn decide acme-lesson accepted', 'learn decide acme-lesson declined']);
    assert.deepEqual(data.fleet.map(r => [r.repo, r.ci]), [['acme/app', 'green'], ['acme/site', 'red']]);
    assert.deepEqual(data.sources.map(s => [s.source, s.state]), [['feedback', 'n/a'], ['roadmap', 'ok'], ['loose-ends', 'ok'], ['reviews', 'ok'], ['health', 'ok'], ['inbox', 'ok'], ['robot', 'ok'], ['fleet', 'ok']]);
    assert.match(data.sources.find(s => s.source === 'feedback').why, /Git identity is unavailable.*cannot be verified/);
    assert.deepEqual(data.counts, { owner: 8, broken: 2, agent: 4, time: 2, external: 1 });
    // A fleet row that could not be read: the strip says so, and the source is partial.
    const some = await board({ root }, { ...deps(root), fleet: async () => ({ rows: [...fleetData.rows, { repo: 'acme/lost', role: 'managed', unreadable: 'HTTP 404' }] }) });
    assert.deepEqual(some.fleet.at(-1), { repo: 'acme/lost', unreadable: 'HTTP 404' });
    assert.deepEqual(['partial', 'unreadable: acme/lost: HTTP 404'], [some.sources.at(-1).state, some.sources.at(-1).why]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unanswered reviews are broken only on the owner\'s or an agent\'s PRs; anyone else\'s wait outside', async () => {
  const mixed = [{ number: 7, title: 'Mine', state: 'open', url: 'u7', author: 'acme-owner', unanswered: 1, oldest: '2026-10-01' },
    { number: 8, title: 'Claude\'s', state: 'open', url: 'u8', author: 'claude[bot]', unanswered: 1, oldest: '2026-10-01' },
    { number: 9, title: 'Renovate', state: 'open', url: 'u9', author: 'app/renovate', unanswered: 1, oldest: '2026-10-01' },
    { number: 10, title: 'Paul\'s idea', state: 'open', url: 'u10', author: 'pkinlan', unanswered: 3, oldest: '2026-10-01' }];
  const r = await reviewItems([{ repo: 'acme/app' }], { today: TODAY, me: 'acme-owner', read: async () => mixed });
  const where = Object.fromEntries(r.items.map(i => [i.title.split(':')[0], i.waits]));
  assert.deepEqual(where, { 'acme/app#7': 'broken', 'acme/app#8': 'broken', 'acme/app#9': 'broken', 'acme/app#10': 'external' });
  assert.match(r.items.find(i => i.waits === 'external').why, /^Someone else's PR \(pkinlan\)/);
  // Who the owner is unknown: every PR stays broken, never hidden.
  const blind = await reviewItems([{ repo: 'acme/app' }], { today: TODAY, read: async () => mixed });
  assert.ok(blind.items.every(i => i.waits === 'broken'));
});

// Phase 71: a review that keeps going is the owner's, not one more thing to fix.
test('a PR past its review-round limit is the owner\'s item, with the round count and its open findings; under the limit it stays broken', async () => {
  const state = {
    prs: [{ number: 7, title: 'Acme anvils', state: 'open', url: 'u7', author: 'acme-owner', unanswered: 2, oldest: '2026-10-01' },
      { number: 8, title: 'Acme skates', state: 'open', url: 'u8', author: 'acme-owner', unanswered: 1, oldest: '2026-10-01' }],
    // #7 is at three rounds; #8 at two; #9 at four with nothing unanswered a day yet; #10 is someone else's.
    rounds: [{ number: 7, title: 'Acme anvils', url: 'u7', author: 'acme-owner', rounds: 3, open: 3, fixFirst: 1, track: 1, unsorted: 1 },
      { number: 8, title: 'Acme skates', url: 'u8', author: 'acme-owner', rounds: 2, open: 1, fixFirst: 0, track: 0, unsorted: 1 },
      { number: 9, title: 'Acme rockets', url: 'u9', author: 'app/claude', rounds: 4, open: 1, fixFirst: 0, track: 1, unsorted: 0 },
      { number: 10, title: 'Paul\'s idea', url: 'u10', author: 'pkinlan', rounds: 5, open: 0, fixFirst: 0, track: 0, unsorted: 0 }],
  };
  const r = await reviewItems([{ repo: 'acme/app' }], { today: TODAY, me: 'acme-owner', read: async () => state });
  const by = Object.fromEntries(r.items.map(i => [i.title, i]));
  assert.deepEqual(r.items.map(i => [i.waits, i.title]), [
    ['owner', 'acme/app#7: review round 3 of 3, 3 open findings'],
    ['owner', 'acme/app#9: review round 4 of 3, 1 open finding'],
    ['external', 'acme/app#10: review round 5 of 3, 0 open findings'],
    ['broken', 'acme/app#8: 1 review comment unanswered'],
  ], 'a PR at the limit is listed once, as the owner\'s; one under it is as before');
  const item = by['acme/app#7: review round 3 of 3, 3 open findings'];
  assert.deepEqual([item.kind, item.source, item.read, item.link, item.rounds, item.limit, item.open], ['review', 'reviews', 'plates review acme/app#7', 'u7', 3, 3, 3]);
  assert.match(item.why, /^Acme anvils\. The review reached its limit, so no more fixes are pushed\. Choose: merge with the rest tracked \(1 to fix first, 1 to track, 1 unsorted\), split it, or close it\.$/);
  assert.match(by['acme/app#10: review round 5 of 3, 0 open findings'].why, /^Someone else's PR \(pkinlan\)/);
  // Phase 133: with the findings read, a PR whose first three rounds made progress is extended once; one that repeats is marked.
  const judged = { prs: [], rounds: [
    { number: 11, title: 'Acme magnets', url: 'u11', author: 'acme-owner', rounds: 3, open: 0, fixFirst: 0, track: 0, unsorted: 0,
      findings: [{ round: 1, path: 'a.js', line: 1, severity: 1 }, { round: 1, path: 'b.js', line: 1, severity: 2 }, { round: 2, path: 'c.js', line: 1, severity: 2 }, { round: 3, path: 'd.js', line: 1, severity: 3 }] },
    { number: 12, title: 'Acme glue', url: 'u12', author: 'acme-owner', rounds: 3, open: 1, fixFirst: 0, track: 0, unsorted: 1,
      findings: [{ round: 1, path: 'a.js', line: 1, severity: 2 }, { round: 2, path: 'a.js', line: 3, severity: 2 }, { round: 3, path: 'b.js', line: 1, severity: 3 }] },
    { number: 13, title: 'Acme tunnel', url: 'u13', author: 'acme-owner', rounds: 6, open: 0, fixFirst: 0, track: 0, unsorted: 0,
      findings: [{ round: 1, path: 'a.js', line: 1, severity: 1 }, { round: 1, path: 'b.js', line: 1, severity: 2 }, { round: 2, path: 'c.js', line: 1, severity: 2 }, { round: 3, path: 'd.js', line: 1, severity: 3 },
        { round: 4, path: 'a.js', line: 1, severity: 3 }, { round: 5, path: 'a.js', line: 1, severity: 3 }, { round: 6, path: 'a.js', line: 1, severity: 3 }] }] };
  const j = await reviewItems([{ repo: 'acme/app' }], { today: TODAY, me: 'acme-owner', read: async () => judged });
  assert.deepEqual(j.items.map(i => [i.waits, i.title, i.limit]), [
    ['owner', 'acme/app#12: review round 3 of 3 (stopped: repeating), 1 open finding', 3],
    ['owner', 'acme/app#13: review round 6 of 6 (extended: progress), 0 open findings', 6],
  ], '#11 made progress and is under its extended limit, so it is no one\'s item');
  // The repo's own limit: "review": {"rounds": 2} brings #8 to the owner too; 5 leaves only #10 past it.
  const tight = await reviewItems([{ repo: 'acme/app', rounds: 2 }], { today: TODAY, me: 'acme-owner', read: async () => state });
  assert.ok(tight.items.some(i => i.waits === 'owner' && i.title === 'acme/app#8: review round 2 of 2, 1 open finding'));
  assert.equal(tight.items.filter(i => i.waits === 'broken').length, 0);
  const loose = await reviewItems([{ repo: 'acme/app', rounds: 5 }], { today: TODAY, me: 'acme-owner', read: async () => state });
  assert.deepEqual(loose.items.map(i => i.waits), ['external', 'broken', 'broken']);

  // On the board itself: the owner's column, from the project's own "review".rounds.
  const root = await acme();
  try {
    const seen = [];
    const data = await board({ root }, { ...deps(root), reviews: list => { seen.push(...list); return reviewItems(list, { today: TODAY, read: async ({ repo }) => repo === 'acme/app' ? state : [] }); } });
    assert.ok(titles(data, 'owner').includes('acme/app#7: review round 3 of 3, 3 open findings'));
    assert.ok(!titles(data, 'broken').some(t => t.startsWith('acme/app#7')));
    assert.equal(seen.find(x => x.repo === 'acme/app').rounds, 3, 'three when the project names none');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// plates#118: a fleet repo's PRs are held to that repo's own limit, read by the fleet read the board already makes.
test('a fleet repo\'s review-round limit is its own, from the fleet read; one that could not be read is a gap, never three', async () => {
  const { fleetRoundLimit } = boardModule;
  const row = over => ({ repo: 'acme/site', role: 'managed', adopted: true, review: { rounds: 3 }, ...over });
  assert.deepEqual(fleetRoundLimit(row({ review: { rounds: 5 } })), { rounds: 5 });
  assert.deepEqual(fleetRoundLimit(row({ adopted: false, review: undefined })), { rounds: 3 }, 'no .plates/plates.json: the defaults, as plates review says');
  for (const [bad, why] of [
    [undefined, /^the fleet could not be read$/],
    [row({ unreadable: 'HTTP 404' }), /^unreadable: HTTP 404$/],
    [row({ adopted: { unreadable: 'HTTP 502' }, review: undefined }), /^its \.plates\/plates\.json is unreadable: HTTP 502$/],
    [row({ review: { problem: '.plates/plates.json "review" "rounds" must be a whole number of review rounds, 1 or more' } }), /"rounds" must be a whole number/],
    [row({ review: undefined }), /carries no review config/],
  ]) {
    const got = fleetRoundLimit(bad);
    assert.equal(got.rounds, null);
    assert.match(got.roundsGap, why);
  }

  // Four rounds on a PR of acme/site, and two comments unanswered a day.
  const state = { prs: [{ number: 4, title: 'Acme site', state: 'open', url: 'u4', author: 'acme-owner', unanswered: 2, oldest: '2026-10-01' }],
    rounds: [{ number: 4, title: 'Acme site', url: 'u4', author: 'acme-owner', rounds: 4, open: 2, fixFirst: 0, track: 0, unsorted: 2 }] };
  const root = await acme();
  try {
    const run = async fleet => {
      const seen = [];
      const data = await board({ root }, { ...deps(root), fleet, reviews: list => { seen.push(...list); return reviewItems(list, { today: TODAY, me: 'acme-owner', read: async ({ repo }) => repo === 'acme/site' ? state : [] }); } });
      return { data, site: seen.find(x => x.repo === 'acme/site'), reviews: data.sources.find(s => s.source === 'reviews') };
    };
    const rows = site => async () => ({ rows: [fleetData.rows[0], { ...fleetData.rows[1], ...site }] });
    // acme/site allows five: four rounds are not the owner's yet, whatever plates's own limit is.
    const five = await run(rows({ review: { rounds: 5 } }));
    assert.equal(five.site.rounds, 5);
    assert.deepEqual(titles(five.data, 'owner').filter(t => t.startsWith('acme/site#')), []);
    assert.ok(titles(five.data, 'broken').includes('acme/site#4: 2 review comments unanswered'));
    assert.equal(five.reviews.why, undefined);
    // It allows two: the owner's.
    const two = await run(rows({ review: { rounds: 2 } }));
    assert.ok(titles(two.data, 'owner').includes('acme/site#4: review round 4 of 2, 2 open findings'));
    // Its config is invalid, or the fleet could not be read at all: a gap that is said, and no limit assumed.
    for (const [fleet, why] of [
      [rows({ review: { problem: '.plates/plates.json "review" "rounds" must be a whole number of review rounds, 1 or more' } }), /review-round limit not read, so none is applied: acme\/site: .*"rounds" must be a whole number/],
      [async () => { throw new Error('gh: HTTP 401'); }, /review-round limit not read, so none is applied: acme\/site: the fleet could not be read: gh: HTTP 401/],
    ]) {
      const gap = await run(fleet);
      assert.deepEqual([gap.site.rounds, typeof gap.site.roundsGap], [null, 'string']);
      assert.match(gap.reviews.why, why);
      assert.deepEqual(titles(gap.data, 'owner').filter(t => t.startsWith('acme/site#')), [], 'not promoted on an assumed three');
      assert.ok(titles(gap.data, 'broken').includes('acme/site#4: 2 review comments unanswered'), 'still listed, as before');
    }
    // The fleet is read once for the strip and the limits.
    let reads = 0;
    await run(async () => { reads++; return fleetData; });
    assert.equal(reads, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the repo-wide read counts each open PR\'s rounds and sorts its open findings, from the window it already reads', () => {
  const [A, B, C] = ['a', 'b', 'c'].map(x => `${x}1`.repeat(20));
  const c = (author, body, commit) => ({ databaseId: 1, author: { login: author }, body, createdAt: `${TODAY}T09:00:00Z`, url: 'u', originalCommit: { oid: commit } });
  const thread = (id, ...nodes) => ({ id, isResolved: false, tail: { totalCount: nodes.length, nodes } });
  const pr = (number, threads, state = 'OPEN') => ({ keelWindow: 'PullRequest', number, title: `Acme ${number}`, url: `u${number}`, state, mergedAt: state === 'MERGED' ? `${TODAY}T00:00:00Z` : null, updatedAt: `${TODAY}T00:00:00Z`, author: { login: 'acme-owner' },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: threads }, comments: { pageInfo: { hasPreviousPage: false }, nodes: [] }, reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] } });
  const mark = kind => `<!-- keel:class ${kind} -->\nClassed.`;
  const three = [
    thread('T1', c('acme-reviewer', 'No brakes.', A), c('acme-owner', 'Fixed in abc1234.', B)),
    thread('T2', c('acme-reviewer', 'No bell.', B), c('acme-owner', mark('security'), C)),
    thread('T3', c('acme-reviewer', 'No paint.', C), c('acme-owner', mark('other'), C)),
    thread('T4', c('acme-second', 'No horn.', C)),
  ];
  const full = nodes => nodes.map(n => fromWindow(n).pr);
  const repository = { open: { pageInfo: { hasNextPage: false }, nodes: full([pr(7, three), pr(8, [])]) }, merged: { pageInfo: { hasNextPage: false }, nodes: full([pr(6, three, 'MERGED')]) } };
  const got = unansweredPrs(repository, [], TODAY);
  // Found today, so the day-old count has none of them; the rounds do. A merged PR has no loop left to stop.
  assert.deepEqual(got.prs, []);
  // The findings travel with it (phase 133), so the board can judge the limit from the same read. These threads name no path.
  const findings = [1, 2, 3, 3].map(round => ({ round, path: null, line: null, severity: null }));
  assert.deepEqual(got.rounds, [{ number: 7, title: 'Acme 7', url: 'u7', author: 'acme-owner', rounds: 3, findings, open: 3, fixFirst: 1, track: 1, unsorted: 1 }]);
});

test('a source that cannot be read is n/a with why, never missing', async () => {
  const root = await acme();
  try {
    const data = await board({ root }, { ...deps(root),
      reviews: list => reviewItems(list, { today: TODAY, read: async () => { throw new Error('gh: could not resolve host'); } }),
      fleet: async () => { throw new Error('gh: HTTP 401'); },
      looseEnds: async () => { throw new Error('plates.json: Unexpected token'); } });
    const by = Object.fromEntries(data.sources.map(s => [s.source, s]));
    assert.equal(by.reviews.state, 'n/a');
    assert.match(by.reviews.why, /GitHub could not be read: acme\/app: gh: could not resolve host/);
    assert.deepEqual([by.fleet.state, by.fleet.why], ['n/a', 'gh: HTTP 401']);
    assert.deepEqual([by['loose-ends'].state, by['loose-ends'].why], ['n/a', 'plates.json: Unexpected token']);
    assert.equal(by.roadmap.state, 'ok', 'the others are still read');
    assert.ok(titles(data, 'owner').includes('phase 1: The owner walks it'));
    // One repo of two failing is partial, and says which.
    const half = await board({ root }, { ...deps(root), reviews: list => reviewItems(list, { today: TODAY, read: async ({ repo }) => { if (repo === 'acme/site') throw new Error('HTTP 404'); return prs; } }) });
    const reviews = half.sources.find(s => s.source === 'reviews');
    assert.equal(reviews.state, 'partial');
    assert.match(reviews.why, /not read: acme\/site: HTTP 404/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a draft plates update PR is broken, linking the PR; other drafts are not, and loose-ends does not list it twice (phase 52)', async () => {
  const root = await acme();
  try {
    const site = fleetData.rows[1];
    const rows = [fleetData.rows[0], { ...site, machinePrs: { total: 3, queues: {}, heads: [], drafts: [
      { number: 12, head: 'keel/update-v0.8.21' },
      { number: 13, head: 'keel-night/2026-10-07' }, // a draft night PR is the night's, not an update that fails
      { number: '14"><script>', head: 'keel/update-v0.8.22' }, // never a link built from what is not a PR number
    ] } }];
    const pr = 'https://github.com/acme/site/pull/12';
    const loose = root2 => {
      const data = looseData(root2);
      data.projects.push({ repo: 'acme/site', dir: '/acme/site', items: [{ kind: 'pr', title: 'plates update: practice 0.8.20 → 0.8.21', url: pr, detail: 'keel/update-v0.8.21, draft', move: 'review it: merge, or close it', commands: [] }] });
      return data;
    };
    const data = await board({ root }, { ...deps(root), fleet: async () => ({ rows }), looseEnds: async () => loose(root) });
    const it = data.items.find(i => i.kind === 'update');
    assert.deepEqual([it.waits, it.title, it.link, it.source], ['broken', "acme/site: plates update v0.8.21 fails site's check", pr, 'fleet']);
    assert.match(it.why, /^a draft PR on keel\/update-v0\.8\.21: its description opens with what failed/);
    assert.equal(data.items.filter(i => i.kind === 'update').length, 1, 'only the draft on a plates update branch, with a real PR number');
    assert.equal(data.items.filter(i => i.link === pr).length, 1, 'listed once: the fleet\'s broken item, not loose-ends\' PR as well');
    assert.deepEqual(titles(data, 'broken').sort(), ['acme/app#7: 2 review comments unanswered', 'acme/site: CI red on main', "acme/site: plates update v0.8.21 fails site's check"]);
    assert.equal(data.counts.broken, 3);
    // Machine PRs the fleet could not read: nothing is invented.
    const blind = await board({ root }, { ...deps(root), fleet: async () => ({ rows: [{ ...site, machinePrs: { unreadable: 'saving your GitHub quota' } }] }) });
    assert.equal(blind.items.filter(i => i.kind === 'update').length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const snapshot = async root =>Object.fromEntries(await Promise.all(['docs/phases/01-walk.md', 'docs/phases/07-mixed.md', 'docs/evidence/acme-1.md', 'docs/ROADMAP.md'].map(async p => [p, await readFile(join(root, p), 'utf8')])));

test('plates walk done checks the walk, appends the owner\'s read, and moves a phase with nothing else open to built', async () => {
  const root = await acme({ git: true });
  try {
    const r = await walkDone({ root, phase: '1', note: 'Dropped one; it | landed.', today: TODAY });
    assert.equal(r.data.status, 'built');
    const text = await readFile(join(root, 'docs/phases/01-walk.md'), 'utf8');
    assert.match(text, /^status: built$/m);
    assert.match(text, /^since: 2026-10-08$/m);
    assert.doesNotMatch(text, /^owes:/m);
    assert.match(text, /- \[x\] ⚑ by hand: the owner drops one on a coyote\./);
    assert.match(text, /## Next action\n\nNone\.\n\n## Trajectory\n/, 'Next action None, the Trajectory kept');
    const ev = await readFile(join(root, 'docs/evidence/acme-1.md'), 'utf8');
    assert.match(ev, /## Automated checks\n\n- ok\n\n## The owner's read \(2026-10-08\)\n\n\| Walked \| The owner's note \|\n\| --- \| --- \|\n\| ⚑ by hand: the owner drops one on a coyote\. \| Dropped one; it \\\| landed\. \|\n$/);
    assert.match(r.text, /left as a diff: commit it when the gate passes/i);
    assert.match(r.data.diff, /^-- \[ \] ⚑ by hand/m, 'the working-tree diff is printed');
    assert.match(r.data.diff, /^\+status: built$/m);
    // The roadmap was regenerated: its check passes on the result.
    assert.match(await roadmap({ root, mode: 'check', today: TODAY }), /Checked roadmap/);
    assert.equal(execFileSync('git', ['-C', root, 'log', '--oneline'], { encoding: 'utf8' }).trim().split('\n').length, 1, 'nothing committed');
    // waits: dropped too.
    await walkDone({ root, phase: '2', note: 'Seven green nights.', today: TODAY });
    assert.doesNotMatch(await readFile(join(root, 'docs/phases/02-nights.md'), 'utf8'), /^(owes|waits):/m);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a phase with a buildable box left stays partial; several walks need --box; no evidence yet makes a file', async () => {
  const root = await acme({ git: true });
  try {
    const mixed = await walkDone({ root, phase: '7', note: 'Read it.', today: TODAY });
    assert.equal(mixed.data.status, 'partial');
    const text = await readFile(join(root, 'docs/phases/07-mixed.md'), 'utf8');
    assert.match(text, /^status: partial$/m);
    assert.match(text, /- \[x\] ⚑ by hand/);
    assert.match(text, /- \[ \] Still to build/);
    assert.match(text, /## Next action\n\nBuild the anvil\./, 'untouched');
    assert.equal(mixed.data.evidence, 'docs/evidence/2026-10-08-phase-7-walk.md', 'a phase with no evidence gets a file for the owner\'s read');
    assert.match(text, /^evidence: \["evidence\/2026-10-08-phase-7-walk\.md"\]$/m);
    await assert.rejects(walkDone({ root, phase: '6', note: 'x', today: TODAY }), /2 open walk boxes: name one with --box 2\|3/);
    const one = await walkDone({ root, phase: '6', box: '3', note: 'Two read.', today: TODAY });
    assert.equal(one.data.status, 'partial');
    assert.match(await readFile(join(root, 'docs/phases/06-two.md'), 'utf8'), /^owes: walk$/m, 'a walk still owed');
    assert.equal((await walkDone({ root, phase: '6', note: 'One read.', today: TODAY })).data.status, 'built');
    const bare = await walkDone({ root, phase: '8', note: 'Done.', today: TODAY });
    assert.equal(bare.data.status, 'built');
    assert.deepEqual(bare.data.created, ['docs/evidence/2026-10-08-phase-8-walk.md']);
    assert.match(await roadmap({ root, mode: 'check', today: TODAY }), /Checked roadmap/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a box that is not a walk is refused, writing nothing', async () => {
  const root = await acme();
  try {
    const before = await snapshot(root);
    await assert.rejects(walkDone({ root, phase: '7', box: '2', note: 'Looks good.', today: TODAY }), e => e.exitCode === 2 && /box 2 of phase 7 is not a walk .*Nothing written/.test(e.message));
    await assert.rejects(walkDone({ root, phase: '1', box: '1', note: 'x', today: TODAY }), /box 1 of phase 1 is not an open Acceptance box/);
    await assert.rejects(walkDone({ root, phase: '4', note: 'x', today: TODAY }), /phase 4 has no open walk box/);
    await assert.rejects(walkDone({ root, phase: '0', note: 'x', today: TODAY }), /phase 0 is built: no walk is open/);
    await assert.rejects(walkDone({ root, phase: '1', note: ' ', today: TODAY }), /--note .* is required/);
    assert.deepEqual(await snapshot(root), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// An accepted proposal's record is the person's decision and reason only: advice like
// "make it a phase" goes to the output, never into the page (the 2026-10-08 escapes
// proposal was accepted as handled, and the record must not contradict that).
test('plates walk decide --accept writes only the decision and reason; the next step is printed, not recorded', async () => {
  const root = await acme();
  try {
    const r = await walkDecide({ root, proposal: 'docs/health/2026-10-07.md', accept: 'Handled by a guard; no phase needed.', today: TODAY });
    const page = await readFile(join(root, 'docs/health/2026-10-07.md'), 'utf8');
    assert.match(page, /\*\*Decided 2026-10-08: accepted\*\* — Handled by a guard; no phase needed\.\n/);
    assert.doesNotMatch(page, /plates phase new|Next:/);
    assert.match(r.text, /plates phase new/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plates walk decide records the decision in the proposal; the board stops listing it', async () => {
  const root = await acme();
  try {
    await assert.rejects(walkDecide({ root, proposal: 'docs/health/2026-10-07.md', decline: '', today: TODAY }), /--decline needs/);
    const r = await walkDecide({ root, proposal: 'docs/health/2026-10-07.md', decline: 'Phase 4 is next anyway.', today: TODAY });
    assert.equal(r.data.decision, 'declined');
    const page = await readFile(join(root, 'docs/health/2026-10-07.md'), 'utf8');
    assert.match(page, /declines it\.\n\n\*\*Decided 2026-10-08: declined\*\* — Phase 4 is next anyway\.\n\n## Notes\n\nAcme\.\n$/);
    await assert.rejects(walkDecide({ root, proposal: 'docs/health/2026-10-07.md', accept: '', today: TODAY }), /already declined \(2026-10-08\)/);
    const data = await board({ root }, deps(root));
    assert.ok(!data.items.some(i => i.kind === 'proposal'));
    assert.match(data.sources.find(s => s.source === 'health').why, /declined/);
    await assert.rejects(walkDecide({ root, proposal: '../elsewhere.md', accept: '', today: TODAY }), /outside the project/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- the server ----------------------------------------------------------------
test('non-time accept and decline survive same-day managed health refresh without duplicate proposals', async t => {
  for (const decision of ['accept','decline']) await t.test(decision, async () => {
    const root=await acme(),path='docs/health/2026-10-08.md';
    try {
      await writeHealthReport({root,path,generated:'# Acme health\n\nOld measured value.\n\n## Proposal\n\n**`escapes`** (outside) — Acme original proposal.\n'+(decision==='decline'?'\n## Notes\n\nAcme generated notes.\n':'')});
      await walkDecide({root,proposal:path,[decision]:'Acme owner decision.',today:TODAY});
      await writeFile(join(root,path),(await readFile(join(root,path),'utf8'))+'\nAcme human suffix.\n');
      const measures=[{id:'escapes',what:'Acme escapes',unit:'escapes',bound:0,better:'lower',run:()=>({value:3,detail:'Fresh Acme measurement.'})}];
      for(let i=0;i<2;i++)await improve({root,report:true,date:TODAY},{env:{CI:'true'},measures});
      const text=await readFile(join(root,path),'utf8');
      assert.equal((text.match(/^## Proposal$/gm)??[]).length,1);
      assert.equal((text.match(/\*\*Decided /g)??[]).length,1);
      assert.match(text,new RegExp(`Decided ${TODAY}: ${decision==='accept'?'accepted':'declined'}`));
      assert.match(text,/Acme original proposal/);assert.match(text,/Acme human suffix/);
      assert.match(text,/Fresh Acme measurement/);assert.doesNotMatch(text,/Old measured value/);
      assert.ok(!(await board({root},deps(root))).items.some(i=>i.kind==='proposal'));
      const edited=text.replace('Fresh Acme measurement.','Acme human-edited measurement.');
      await writeFile(join(root,path),edited);
      await assert.rejects(improve({root,report:true,date:TODAY},{env:{CI:'true'},measures}),/managed-region drift/);
      assert.equal(await readFile(join(root,path),'utf8'),edited);
    } finally {await rm(root,{recursive:true,force:true});}
  });
});

test('plates walk runs from the CLI', async () => {
  const root = await acme();
  try {
    const env = { ...process.env, PLATES_GH: join(root, 'no-gh'), PLATES_CLAUDE_DIR: join(root, 'no-claude'), PLATES_FLEET_PRACTICE: '0.8.21' };
    const bad = run(process.execPath, [join(PLATES, 'bin', 'plates.mjs'), 'walk', 'done', '7', '--box', '2', '--note', 'x', '--json'], { cwd: root, env });
    assert.equal(bad.status, 2);
    assert.match(JSON.parse(bad.stdout).error, /not a walk/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Your part: the owner's ask in plain words ------------------------------------------

const yourPart = ({ ready = '- **Ready:** yes', table = '' } = {}) => `## Your part

- **Ask:** Decide whether to keep the anvil rule.
- **Why:** It settles whether Acme keeps paying for it.
- **Look at:** [the record](../evidence/acme-1.md).
- **Choices:** Keep it | Drop it | Not enough data yet
- **Keeps it open:** Not enough data yet
- **Takes:** 5 minutes
- **Then:** Keep it: nothing changes. Drop it: the conductor drafts a phase that retires it. Not enough data yet: it is read again in November.
${ready}
${table}`;

/** The Acme project, plus a walk with a ready Your part (10) and one that is not ready yet (11). */
async function acmeAsks(opts) {
  const root = await acme(opts);
  const ready = phase({ status: 'partial', evidence: '["evidence/acme-1.md"]', acceptance: `${built}\n${walkBox}`, extra: 'owes: walk\n', title: 'The anvil rule' })
    .replace('## Proof', `${yourPart({ table: '\n| | Before | After |\n| --- | --- | --- |\n| Anvils dropped | 3 | 5 |\n' })}\n## Proof`);
  const later = phase({ status: 'partial', acceptance: `${built}\n- [ ] ⚑ by hand: the owner reads the cooled anvil.`, extra: 'owes: walk\n', title: 'The cooled anvil' })
    .replace('## Proof', `${yourPart({ ready: '- **Ready when:** the anvil has cooled (Monday).' })}\n## Proof`);
  await writeFile(join(root, 'docs/phases/10-rule.md'), ready);
  await writeFile(join(root, 'docs/phases/11-cooled.md'), later);
  await roadmap({ root, today: TODAY });
  if (opts?.git) { execFileSync('git', ['-C', root, 'add', '-A']); execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'asks']); }
  return root;
}

test('a ready walk with a Your part leads with its Ask and offers one button per choice; a walk without one is marked', async () => {
  const root = await acmeAsks();
  try {
    const data = await board({ root }, deps(root));
    const walk = data.items.find(i => i.phase === 10);
    assert.equal(walk.waits, 'owner');
    assert.equal(walk.ask, 'Decide whether to keep the anvil rule.');
    assert.equal(walk.yourPart.takes, '5 minutes');
    assert.deepEqual(walk.yourPart.table, { head: ['', 'Before', 'After'], rows: [['Anvils dropped', '3', '5']] });
    assert.equal(walk.yourPart.look, '[the record](https://github.com/acme/app/blob/main/docs/evidence/acme-1.md).', 'a relative link points at the repo');
    assert.deepEqual(walk.actions.map(a => [a.label, a.args.join(' '), a.note]), [
      ['Keep it', '10 --choice Keep it', 'optional'], ['Drop it', '10 --choice Drop it', 'optional'], ['Not enough data yet', '10 --choice Not enough data yet', 'optional']]);
    assert.equal(walk.actions[1].then, 'the conductor drafts a phase that retires it.', 'each choice carries its own Then');
    assert.equal(walk.actions[2].keepsOpen, true);
    // A walk with no Your part: today's card, with the marker.
    assert.equal(data.items.find(i => i.phase === 1).yourPart, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a walk whose Your part says Ready when waits, with that reason, and is never yours', async () => {
  const root = await acmeAsks();
  try {
    const data = await board({ root }, deps(root));
    const later = data.items.find(i => i.phase === 11);
    assert.equal(later.waits, 'time', 'not ready: waiting, though its waits: is the owner\'s');
    assert.equal(later.why, 'Ready when: the anvil has cooled (Monday).');
    assert.deepEqual(later.actions, []);
    assert.ok(!titles(data, 'owner').includes('phase 11: The cooled anvil'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plates walk done --choice records the choice and its note, and refuses a choice not in the list, writing nothing', async () => {
  const root = await acmeAsks({ git: true });
  try {
    const before = await readFile(join(root, 'docs/phases/10-rule.md'), 'utf8');
    const evBefore = await readFile(join(root, 'docs/evidence/acme-1.md'), 'utf8');
    await assert.rejects(walkDone({ root, phase: '10', choice: 'Drop the anvil', today: TODAY }),
      e => e.exitCode === 2 && /"Drop the anvil" is not one of phase 10's choices: Keep it \| Drop it \| Not enough data yet\. Nothing written/.test(e.message));
    await assert.rejects(walkDone({ root, phase: '1', choice: 'Keep it', today: TODAY }), e => e.exitCode === 2 && /phase 1 has no Choices/.test(e.message), 'a walk without a Your part takes --note');
    assert.equal(await readFile(join(root, 'docs/phases/10-rule.md'), 'utf8'), before);
    assert.equal(await readFile(join(root, 'docs/evidence/acme-1.md'), 'utf8'), evBefore);
    // A choice that keeps the walk open: the row is written, nothing is ticked, the status stays.
    const r = await walkDone({ root, phase: '10', choice: 'not enough data yet', note: 'Read it again in November.', today: TODAY });
    assert.equal(r.data.choice, 'Not enough data yet', 'matched aside from case, recorded as written');
    assert.equal(r.data.then, 'it is read again in November.');
    assert.equal(r.data.keepsOpen, true);
    assert.equal(r.data.status, 'partial');
    const still = await readFile(join(root, 'docs/phases/10-rule.md'), 'utf8');
    assert.equal(still, before, 'the phase file is untouched: box open, status and owes as they were');
    assert.match(still, /^- \[ \] ⚑ by hand: the owner drops one on a coyote\.$/m);
    assert.match(await readFile(join(root, 'docs/evidence/acme-1.md'), 'utf8'), /## The owner's read \(2026-10-08\)[\s\S]*\| ⚑ by hand: the owner drops one on a coyote\. \| Chose: Not enough data yet\. Read it again in November\. \|\n$/);
    assert.match(r.text, /the walk stays open[\s\S]*Recorded; the walk stays open\.\nThen: it is read again in November\./);
    assert.equal((await board({ root }, deps(root))).items.find(i => i.phase === 10).waits, 'owner', 'still ready: the owner can choose again');
    // A closing choice still ticks the box and settles the walk.
    const closed = await walkDone({ root, phase: '10', choice: 'Drop it', today: TODAY });
    assert.equal(closed.data.keepsOpen, false);
    assert.equal(closed.data.status, 'built', 'a closing choice settles the walk like any read');
    assert.match(await readFile(join(root, 'docs/phases/10-rule.md'), 'utf8'), /^- \[x\] ⚑ by hand: the owner drops one on a coyote\.$/m);
    assert.match(await readFile(join(root, 'docs/evidence/acme-1.md'), 'utf8'), /\| Chose: Drop it\. \|\n$/);
    assert.match(await roadmap({ root, mode: 'check', today: TODAY }), /Checked roadmap/);
    // From the CLI: an unknown choice exits 2.
    const env = { ...process.env, PLATES_GH: join(root, 'no-gh') };
    const bad = run(process.execPath, [join(PLATES, 'bin', 'plates.mjs'), 'walk', 'done', '11', '--choice', 'Melt it', '--json'], { cwd: root, env });
    assert.equal(bad.status, 2);
    assert.match(JSON.parse(bad.stdout).error, /not one of phase 11's choices/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- GitHub reads: kept 10 minutes, and never under the quota floor ---------------------

/**
 * A gh for the board's live review read: GraphQL's rateLimit probe, and the
 * repo-wide read (lib.mjs windowFragment) answering one open PR with an
 * unanswered thread and costing 3 points. Every call is logged.
 */
async function quotaGh(dir, { remaining = 4000, resetAt = new Date(Date.now() + 60 * 60_000).toISOString() } = {}) {
  const path = join(dir, 'gh'), log = join(dir, 'gh.log');
  const pr = { keelWindow: 'PullRequest', number: 7, title: 'Acme anvils', url: 'https://github.com/acme/app/pull/7', state: 'OPEN', mergedAt: null, updatedAt: '2026-10-07T00:00:00Z', author: { login: 'acme-owner' },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'T1', isResolved: false, tail: { totalCount: 1, nodes: [{ databaseId: 1, author: { login: 'acme-reviewer' }, body: 'Brakes.', createdAt: '2026-10-01T09:00:00Z', url: 'https://github.com/acme/app/pull/7#c1' }] } }] },
    comments: { pageInfo: { hasPreviousPage: false }, nodes: [] }, reviews: { pageInfo: { hasPreviousPage: false }, nodes: [] } };
  await writeFile(path, `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(argv) + '\\n');
const q = (argv.find(a => a.startsWith('query=')) ?? '').slice(6);
const rate = ${JSON.stringify({ remaining, resetAt })};
if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('PlatesReviewWindow'))
  console.log(JSON.stringify({ data: { rateLimit: { cost: 3, ...rate }, repository: { open: { pageInfo: { hasNextPage: false }, nodes: [${JSON.stringify(pr)}] }, merged: { pageInfo: { hasNextPage: false }, nodes: [] } } } }));
else if (argv[0] === 'api' && argv[1] === 'graphql' && q.includes('rateLimit')) console.log(JSON.stringify({ data: { rateLimit: rate } }));
else { console.error('stub gh: unknown ' + argv.join(' ')); process.exit(1); }
`);
  await (await import('node:fs/promises')).chmod(path, 0o755);
  const calls = async () => (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { path, reads: async () => (await calls()).filter(c => c.some(a => a.includes('PlatesReviewWindow'))).length, probes: async () => (await calls()).filter(c => c.some(a => a.startsWith('query=query { rateLimit'))).length };
}

test('the board keeps its GitHub reads 10 minutes: the 60 s refresh asks GitHub nothing, the Refresh button and --fresh read again, and it says what the reads cost', async () => {
  const root = await acme();
  try {
    const gh = await quotaGh(root);
    const env = { ...process.env, PLATES_GH: gh.path, PLATES_CACHE: join(root, '.cache') };
    const live = { env, today: TODAY, looseEnds: async () => looseData(root), fleet: async () => fleetData };
    const first = await board({ root }, live);
    assert.equal(first.sources.find(s => s.source === 'reviews').state, 'ok');
    assert.ok(titles(first, 'broken').includes('acme/app#7: 1 review comment unanswered'));
    const reads = await gh.reads(), probes = await gh.probes();
    assert.equal(reads, 2, 'one page for each of acme/app and acme/site');
    assert.equal(probes, 1, 'the floor asked once, for both');
    assert.deepEqual([first.github.cost, first.github.queries, first.github.remaining], [6, 2, 4000]);
    assert.ok(first.github.readAt);
    // The page's 60 s refresh: nothing asked of GitHub, the same items, the kept read's age.
    const again = await board({ root }, live);
    assert.equal(await gh.reads(), reads, 'no read inside the 10 minutes');
    assert.equal(await gh.probes(), probes, 'nor a quota probe');
    assert.deepEqual(titles(again, 'broken'), titles(first, 'broken'));
    assert.equal(again.github.readAt, first.github.readAt);
    assert.equal(again.github.cost, 0);
    assert.equal(again.github.remaining, 4000, 'the last remembered');
    // --fresh (the Refresh button): read again.
    await board({ root }, { ...live, fresh: true });
    assert.equal(await gh.reads(), reads * 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a kept read lasts 10 minutes, and a failed read is never kept', async () => {
  const { cachedRead } = await import('../lib/quota.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'plates-cache-'));
  try {
    const env = { PLATES_CACHE: dir };
    let n = 0;
    const read = () => cachedRead(env, 'acme', async () => ++n, { now: t0 + at });
    const t0 = Date.parse('2026-10-08T12:00:00Z');
    let at = 0;
    assert.deepEqual((await read()).value, 1);
    at = 9 * 60_000;
    assert.deepEqual([(await read()).value, (await read()).cached], [1, true]);
    at = 10 * 60_000 + 1;
    assert.deepEqual((await read()).value, 2, 'past 10 minutes: read again');
    await assert.rejects(cachedRead(env, 'down', async () => { throw new Error('gh: offline'); }, { now: t0 }));
    assert.deepEqual((await cachedRead(env, 'down', async () => 'up', { now: t0 + 1 })).value, 'up', 'the failure was not kept');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('under the quota floor the board\'s reviews are n/a, saving the quota, and GitHub is asked nothing but what is left', async () => {
  const root = await acme();
  try {
    const gh = await quotaGh(root, { remaining: 500 });
    const env = { ...process.env, PLATES_GH: gh.path, PLATES_CACHE: join(root, '.cache') };
    delete env.PLATES_QUOTA_FLOOR;
    const data = await board({ root }, { env, today: TODAY, looseEnds: async () => looseData(root), fleet: async () => fleetData });
    const reviews = data.sources.find(s => s.source === 'reviews');
    assert.equal(reviews.state, 'n/a');
    assert.match(reviews.why, /^saving your GitHub quota \(500 left until \d\d:\d\d\)$/);
    assert.equal(await gh.reads(), 0, 'no review read under the floor');
    assert.equal(await gh.probes(), 1, 'one probe for both repos');
    // A second refresh: the remembered number settles it, with no probe.
    await board({ root }, { env, today: TODAY, looseEnds: async () => looseData(root), fleet: async () => fleetData });
    assert.deepEqual([await gh.reads(), await gh.probes()], [0, 1]);
    // PLATES_QUOTA_FLOOR lowers it: the read goes ahead.
    const low = await board({ root }, { env: { ...env, PLATES_QUOTA_FLOOR: '100' }, today: TODAY, looseEnds: async () => looseData(root), fleet: async () => fleetData });
    assert.equal(low.sources.find(s => s.source === 'reviews').state, 'ok');
    assert.equal(await gh.reads(), 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('board exposes robot OFF exhausted invalid and unavailable usage without enabling work', async t => {
  const root = await acme(); t.after(() => rm(root, { recursive: true, force: true }));
  const off = await board({ root }, deps(root));
  assert.equal(off.robot.policy.enabled, false); assert.equal(off.robot.budget.state, 'off');
  for (const state of ['exhausted', 'unknown', 'invalid', 'available']) {
    const got = await board({ root }, { ...deps(root), robotStatus: async () => ({ policy: { valid: state !== 'invalid', enabled: true, weeklyMinutes: 10 }, budget: { state, remainingSeconds: state === 'available' ? 300 : null, reasons: ['Acme usage unavailable'], complete: state === 'available' } }) });
    assert.equal(got.robot.budget.state, state);
    if (state !== 'available') {
      const item = got.items.find(i => i.source === 'robot'); assert.equal(item.waits, state === 'exhausted' ? 'time' : 'broken'); assert.deepEqual(item.actions, []);
    }
  }
});

test('board robot budget caches attempt reads and accounts REST refreshes separately', async t => {
  const root = await acme(); t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, '.plates/plates.json');
  const config = JSON.parse(await readFile(path, 'utf8'));
  config.robot = { on: true, budgetMinutes: 10 };
  await writeFile(path, JSON.stringify(config));
  const now = new Date('2026-10-08T12:00:00Z'), sha = 'a'.repeat(40);
  let calls = 0, remaining = 4000;
  const paths = [];
  const github = async ({ method, path }) => {
    assert.equal(method, 'GET'); calls++; paths.push(path);
    if (path.endsWith('/keel-robot.yml')) return { status: 404, data: { message: 'Not Found' } };
    const data = path.endsWith('/plates-robot.yml') ? { id: 1, path: '.github/workflows/plates-robot.yml' }
      : path.includes('/runs?') ? { total_count: 1, workflow_runs: [{ id: 2, workflow_id: 1, repository: { full_name: 'acme/app' }, head_sha: sha, run_attempt: 2, updated_at: now.toISOString(), status: 'completed' }] }
      : { total_count: 1, jobs: [{ id: 3, run_id: 2, run_attempt: path.includes('/attempts/1/') ? 1 : 2, head_sha: sha, status: 'completed', conclusion: 'skipped' }] };
    return { status: 200, data, headers: { 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(now.getTime() / 1000 + 3600) } };
  };
  const live = { ...deps(root), now, github, env: { ...process.env, PLATES_CACHE: join(root, '.cache'), PLATES_QUOTA_FLOOR: '1000' } };
  const first = await board({ root }, live);
  assert.equal(first.robot.budget.state, 'available');
  assert.equal(calls, 5, 'both workflow names, current runs, and both attempts');
  assert.equal(paths.filter(path => path.endsWith('/keel-robot.yml')).length, 1, 'legacy history is checked before declaring available budget');
  assert.equal(first.github.rest.requests, 5); assert.equal(first.github.rest.remaining, 4000);
  assert.equal(first.github.cost, 0, 'REST is not GraphQL points');
  assert.equal(first.github.readAt, now.toISOString());
  const again = await board({ root }, { ...live, now: new Date(+now + 60_000) });
  assert.equal(calls, 5); assert.equal(again.github.rest.requests, 0);
  assert.equal(again.github.readAt, first.github.readAt);
  await board({ root }, { ...live, fresh: true }); assert.equal(calls, 10);
  await board({ root }, { ...live, now: new Date(+now + 11 * 60_000) }); assert.equal(calls, 15);
  config.robot.budgetMinutes = 20; await writeFile(path, JSON.stringify(config));
  const changed = await board({ root }, live); assert.equal(calls, 20); assert.equal(changed.robot.budget.remainingSeconds, 1200);
  remaining = 500;
  const low = await board({ root }, { ...live, fresh: true });
  assert.equal(calls, 21, 'stop after headers establish the REST floor');
  assert.equal(low.robot.budget.state, 'unknown'); assert.match(low.robot.budget.reasons.join(' '), /REST quota/);
  assert.equal(low.github.rest.requests, 1);
  await board({ root }, live); assert.equal(calls, 21, 'automatic refresh retains unavailable coverage too');
  config.robot.on = false; await writeFile(path, JSON.stringify(config));
  const off = await board({ root }, { ...live, fresh: true }); assert.equal(off.robot.budget.state, 'off'); assert.equal(calls, 21);
});


test('board time proposal actions bind instance and explicit acceptance files an OFF issue without second yes',async()=>{
 const root=await acme();
 try{
  const p=makeTimeProposal({measure:'gate_time',identity:{kind:'timing',scope:'.',runner:'node',configHash:'acme-config',flagsHash:'acme-flags',machineClass:'acme-machine',commandHash:'acme-command',target:'gate'},candidate:{title:'Acme gate work',rubric:{version:1,problem:'Acme gate takes too long',reproduction:'npm test',acceptance:'gate inside frozen bound',change:'remove redundant Acme check',prerequisites:[],ownerBlockers:[]},remeasureCommand:'plates improve --json'},baseline:{windowStart:'2026-09-01T00:00:00Z',windowEnd:'2026-09-29T00:00:00Z',value:1000,unit:'ms',runIds:['acme-run'],revisionShas:['a'.repeat(40)]},threshold:{contractVersion:1,rule:'gate_time',parameters:{maxMs:1250}},coverage:{retained:12,eligible:12,omitted:0,dates:['2026-09-01'],sampled:true,gaps:[]},at:'2026-10-08T00:00:00Z'});
  const proposal='docs/health/2026-10-08.md';await writeHealthReport({root,path:proposal,generated:'# Acme health\n\n## Proposal\n\n'+formatTimeProposal(p)});
  let issue,posts=0;
  const github=async r=>{
    assert.ok(r.path.startsWith('/repos/acme/app/'));
    if(r.method==='POST'){posts++;assert.deepEqual(r.body.labels,[]);issue={number:42,state:'open',body:r.body.body,html_url:'https://github.com/acme/app/issues/42',url:'https://api.github.com/repos/acme/app/issues/42',labels:[]};return {status:201,data:issue};}
    return {status:200,data:r.path.includes('/issues?')?(issue?[issue]:[]):issue};
  };
  let data=await board({root},deps(root));const item=data.items.find(i=>i.instanceId===p.instanceId);assert.ok(item);assert.deepEqual(item.actions[0].args,['--proposal',proposal,'--instance',p.instanceId,'--accept']);
  await assert.rejects(walkDecide({root,proposal,accept:'',github}),/instance/);assert.equal(posts,0);
  const result=await walkDecide({root,proposal,instance:p.instanceId,accept:'Acme owner accepts',github});assert.equal(result.data.decision,'accepted');assert.equal(posts,1);assert.equal(result.data.issue.url,issue.html_url);
  assert.equal(parseTimeProposal(await readFile(join(root,proposal),'utf8')).proposal.lifecycle.state,'accepted');
  data=await board({root},deps(root));assert.equal(data.items.find(i=>i.instanceId===p.instanceId).waits,'external');
  for(const args of [ ['--instance'],['--map'],['--instance',p.instanceId,'--accept','--decline','reason'],['--instance',p.instanceId,'--instance',p.instanceId,'--accept'] ]){
    const out=run(process.execPath,[join(PLATES,'bin/plates.mjs'),'walk','decide','--proposal',proposal,...args,'--json'],{cwd:root});assert.notEqual(out.status,0);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

// Phase 70: a claim nobody has pushed to for seven days is the owner's to release or leave. plates releases nothing.
test('a claim idle for seven days is the owner\'s item; a fresher one, one with a recent push, and one whose phase is built are not', async t => {
  const { claim } = await import('../lib/claim.mjs');
  const root = await acme({ git: true });
  const origin = `${root}-origin.git`;
  t.after(() => Promise.all([root, origin, `${root}-gh`].map(d => rm(d, { recursive: true, force: true }))));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['clone', '-q', '--bare', root, origin]);
  git('remote', 'add', 'origin', origin);
  git('fetch', '-q', 'origin');
  git('remote', 'set-head', 'origin', 'main');
  // The claims are made through plates, which asks gh for the open PRs: a stub with none. The board itself asks gh nothing here.
  const gh = `${root}-gh`;
  await writeFile(gh, `#!${process.execPath}\nconsole.log('[]');\n`, { mode: 0o755 });
  const env = { ...process.env, PLATES_GH: gh, PLATES_MACHINE: 'acme-laptop' };
  const now = new Date('2026-10-20T12:00:00Z'), ago = days => new Date(+now - days * 86_400_000);
  const read = async (more = {}) => (await board({ root }, { ...deps(root), env, now, ...more }));
  const claimsOf = data => data.items.filter(i => i.source === 'claims');

  // No claim: the source is read (there is a remote) and has nothing.
  let data = await read();
  assert.deepEqual(claimsOf(data), []);
  assert.deepEqual(data.sources.find(s => s.source === 'claims'), { source: 'claims', state: 'ok', count: 0, why: 'as last fetched; --fresh fetches' });
  assert.equal(data.sources.at(-1).source, 'claims', 'after the sources the board already had');

  // Phase 4 claimed eight days ago, phase 7 six days ago, phase 9 eight days ago with a push to its work branch yesterday.
  for (const [n, days] of [[4, 8], [7, 6], [9, 8]]) assert.equal((await claim({ root, phase: String(n), provider: 'claude' }, { env, now: ago(days) })).data.ok, true);
  const tip = execFileSync('git', ['-C', root, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'acme work'], { encoding: 'utf8', env: { ...env, GIT_COMMITTER_DATE: ago(1).toISOString() } }).trim();
  git('push', '-q', 'origin', `${tip}:refs/heads/claude/phase-9`);
  data = await read({ fresh: true });
  const mine = claimsOf(data);
  assert.deepEqual(mine.map(i => [i.waits, i.kind, i.phase, i.title]), [['owner', 'claim', 4, 'phase 4: claimed by claude on acme-laptop, idle 8 days']]);
  assert.match(mine[0].why, /^claims\/phase-4 since 2026-10-12, no push since 2026-10-12\. Release it \(git push origin --delete claims\/phase-4\) or leave it: plates never releases another session's claim\.$/);
  assert.deepEqual(mine[0].actions, [], 'the board offers no button: the owner releases it by hand, or leaves it');
  assert.ok(titles(data, 'owner').includes(mine[0].title));
  assert.deepEqual(data.sources.find(s => s.source === 'claims'), { source: 'claims', state: 'ok', count: 1 });
  // A day later phase 7 is idle seven days too; phase 9's push still counts.
  assert.deepEqual(claimsOf(await read({ now: new Date(+now + 86_400_000) })).map(i => i.phase), [4, 7]);
  // The board released nothing.
  assert.equal(git('ls-remote', 'origin', 'refs/heads/claims/*').split('\n').length, 3);

  // Phase 4 is built on the default branch: its claim has ended, and is nobody's item.
  const file = join(root, 'docs/phases/04-build.md');
  await writeFile(file, (await readFile(file, 'utf8')).replace('status: planned', 'status: built').replace('evidence: []', 'evidence: ["evidence/acme-0.md"]').replace('- [ ]', '- [x]'));
  git('commit', '-q', '-am', 'phase 4: built');
  git('push', '-q', 'origin', 'main');
  assert.deepEqual(claimsOf(await read({ fresh: true, now: new Date(+now + 86_400_000) })).map(i => i.phase), [7]);

  // --fresh with the origin gone: the source is n/a with why, never an empty list.
  git('remote', 'set-url', 'origin', `${origin}-gone`);
  const gone = (await read({ fresh: true })).sources.find(s => s.source === 'claims');
  assert.equal(gone.state, 'n/a');
  assert.match(gone.why, /^the claims could not be read: git fetch origin failed/);
});

test('milestone board details are read-only links and escape remote markup, with incomplete coverage visible', async t => {
  const { projectMilestones } = await import('../practices/night/files/scripts/plates/milestones.mjs');
  const { milestoneConfig, milestone, issue, response } = await import('./helpers/milestones.mjs');
  const { roadmapItems } = await import('../lib/work-items.mjs');
  const root = await acme(); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify(milestoneConfig));
  const m = milestone(1, 'OPEN', [issue(1, 'OPEN', ['keel:owner'])]);
  m.title = '</script><img src=x onerror=alert(1)>';
  m.description = '<script>Acme</script>';
  const plan = projectMilestones(response([m, milestone(2, 'CLOSED')], { open: true }), milestoneConfig);
  const data = await roadmapItems(root, { read: async () => plan });
  let calls = 0;
  const env = { ...process.env, PLATES_CACHE: join(root, 'cache'), PLATES_GH: '/no-real-gh' };
  const readOptions = { env, guard: async () => null, graphql: async () => { calls++; return response([m], { open: true }); } };
  const first = await roadmapItems(root, readOptions), second = await roadmapItems(root, readOptions);
  assert.equal(calls, 1); assert.equal(first.github.cached, false); assert.equal(second.github.cached, true);
  assert.equal(data.items.length, 1); assert.deepEqual(data.items[0].actions, []);
  assert.equal(data.items[0].link, m.issues.nodes[0].url);
  assert.equal(data.phases[2].status, 'closed');
  assert.match(data.progress.headline, /coverage incomplete/);
  await assert.rejects(walkDone({ root, phase: 1, note: 'Acme saw it' }), /read-only/);
});

// Phase 81: production's verify, recorded by the delivery practice's verify.mjs on keel-verify.
test('a failed verify of production is the owner\'s item on the board; a passed one is nothing; an unreadable record is n/a, never "nothing failed"', async t => {
  const root = await acme({ git: true });
  const origin = `${root}-origin.git`;
  t.after(() => Promise.all([root, origin].map(d => rm(d, { recursive: true, force: true }))));
  const sha = 'a1b2c3d'.padEnd(40, '0'), at = '2026-10-07T21:04:00Z';
  const failed = { sha, ok: false, at, site: 'https://anvils.acme.example', serving: 'b'.repeat(40), failures: ['production serves bbbbbbb, which does not contain a1b2c3d, after 61 reads over 600s', 'GET /login: expected 307, got 500'], run: 'https://github.com/acme/app/actions/runs/7' };
  const passed = { ...failed, ok: true, at: '2026-10-07T22:00:00Z', serving: sha, failures: [] };
  const verifyOf = data => data.items.filter(i => i.source === 'verify');
  // Without the delivery practice there is no verify source.
  assert.equal((await board({ root }, deps(root))).sources.some(s => s.source === 'verify'), false);
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app', plates: 'self', inbox: 'acme/inbox', practices: ['night', 'delivery'] }));
  // The latest failed: the owner's, with every failure and the run.
  let data = await board({ root }, { ...deps(root), verify: async () => ({ results: [failed] }) });
  const [item] = verifyOf(data);
  assert.deepEqual([item.waits, item.kind, item.title, item.link], ['owner', 'verify', 'production failed its verify for a1b2c3d', failed.run]);
  assert.equal(item.why, `Production failed its verify for \`a1b2c3d\` at ${at} (https://anvils.acme.example): ${failed.failures.join('; ')}. ${failed.run}`);
  assert.ok(titles(data, 'owner').includes(item.title));
  assert.deepEqual(data.sources.at(-1), { source: 'verify', state: 'ok', count: 1, why: `the latest verify (${at}, a1b2c3d) failed` });
  // A later pass clears it.
  data = await board({ root }, { ...deps(root), verify: async () => ({ results: [passed, failed] }) });
  assert.deepEqual(verifyOf(data), []);
  assert.match(data.sources.at(-1).why, /passed$/);
  // Unreadable: n/a with why.
  data = await board({ root }, { ...deps(root), verify: async () => ({ results: [], unread: 'git ls-remote exited 128' }) });
  assert.deepEqual(data.sources.at(-1), { source: 'verify', state: 'n/a', why: 'the verify record (plates-verify) could not be read: git ls-remote exited 128' });
  // The real read: origin's keel-verify branch, as verify.mjs --record leaves it.
  const g = (args, input) => execFileSync('git', ['-C', root, ...args], { input, encoding: 'utf8' }).trim();
  execFileSync('git', ['clone', '-q', '--bare', root, origin]);
  g(['remote', 'add', 'origin', origin]);
  const blob = g(['hash-object', '-w', '--stdin'], JSON.stringify({ results: [failed] }));
  const tree = g(['mktree'], `100644 blob ${blob}\tverify.json\n`);
  g(['push', '-q', 'origin', `${g(['commit-tree', tree, '-m', 'plates verify: failed'])}:refs/heads/keel-verify`]);
  data = await board({ root }, { ...deps(root), env: { ...process.env, PLATES_CACHE: join(root, '.cache-test') }, fresh: true });
  assert.deepEqual(verifyOf(data).map(i => i.title), ['production failed its verify for a1b2c3d']);
  const passedBlob=g(['hash-object','-w','--stdin'],JSON.stringify({results:[passed]}));
  const passedTree=g(['mktree'],`100644 blob ${passedBlob}\tverify.json\n`);
  g(['push','-q','origin',`${g(['commit-tree',passedTree,'-m','Acme verify pass'])}:refs/heads/plates-verify`]);
  data=await board({root},{...deps(root),env:{...process.env,PLATES_CACHE:join(root,'.cache-test')},fresh:true});
  assert.deepEqual(verifyOf(data),[], 'newer plates production pass clears the old failed verify');

});

// PR #182 review: a passing preview (verify.mjs --site … --record) after a production failure cleared production's item.
test('a preview\'s pass never clears production\'s failed verify on the board; only production\'s own pass does', async t => {
  const root = await acme({ git: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const prod = 'https://anvils.acme.example', preview = 'https://preview-7.anvils.acme.example';
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', repo: 'acme/app', plates: 'self', inbox: 'acme/inbox', practices: ['night', 'delivery'], delivery: { site: prod, version: '/api/version' } }));
  const sha = 'a1b2c3d'.padEnd(40, '0');
  const r = (site, ok, at) => ({ sha, ok, at, site, serving: sha, failures: ok ? [] : ['GET /: expected 200, got 500'], run: null });
  const verifyOf = async results => (await board({ root }, { ...deps(root), verify: async () => ({ results }) })).items.filter(i => i.source === 'verify');
  const failed = r(prod, false, '2026-10-07T21:00:00Z');
  assert.deepEqual((await verifyOf([r(preview, true, '2026-10-07T22:00:00Z'), failed])).map(i => i.title), ['production failed its verify for a1b2c3d'], 'a preview\'s pass is not production\'s');
  assert.deepEqual(await verifyOf([r(prod, true, '2026-10-07T23:00:00Z'), r(preview, true, '2026-10-07T22:00:00Z'), failed]), [], 'production\'s own pass clears it');
  assert.deepEqual(await verifyOf([r(preview, false, '2026-10-07T22:00:00Z')]), [], 'a preview\'s failure is the brief\'s, not a production item');
});

test('board recognizes each update namespace as one draft repair',async t=>{
 for(const name of ['plates','keel']) {
  const root=await acme();t.after(()=>rm(root,{recursive:true,force:true}));
  const site=fleetData.rows[1], rows=[{...site,machinePrs:{total:1,queues:{},heads:[],drafts:[{number:12,head:`${name}/update-v0.8.21`}]}}];
  const data=await board({root},{...deps(root),fleet:async()=>({rows})});
  const items=data.items.filter(i=>i.kind==='update');assert.equal(items.length,1);assert.equal(items[0].waits,'broken');
 }
});
