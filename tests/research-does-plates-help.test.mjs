// The phase 13 results page's numbers come from scripts/research/does-plates-help.mjs.
// These pin the definitions the page states: what a red streak is, which Guard
// cells name a file, and what counts as a status move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redStreak, guardPaths, lessonTable, frontMatter, readDoctor } from '../scripts/research/does-plates-help.mjs';

const run = (hour, conclusion) => ({ createdAt: `2026-10-01T${String(hour).padStart(2, '0')}:00:00Z`, conclusion });

test('red streak: cancelled runs neither break nor extend it, and the window bounds it', () => {
  const runs = [run(1, 'failure'), run(2, 'success'), run(3, 'failure'), run(4, 'cancelled'), run(5, 'failure'), run(6, 'failure'), run(9, 'success'), run(10, 'failure')];
  const all = redStreak(runs, '2026-10-01T02:00:00Z', '2026-10-01T10:00:00Z');
  assert.deepEqual(
    { runs: all.runs, green: all.green, red: all.red, ignored: all.ignored, longest: all.longestRedStreak },
    { runs: 6, green: 2, red: 3, ignored: 1, longest: 3 },
  );
  // One first red in the window (03:00); its green comes at 09:00.
  assert.deepEqual([all.redEpisodes, all.resolvedEpisodes, all.medianHoursFirstRedToGreen], [1, 1, 6]);
});

test('red streak: a first red is timed to a green after the window; an unresolved one is counted, not timed', () => {
  const late = redStreak([run(1, 'success'), run(2, 'failure'), run(8, 'success')], '2026-10-01T00:00:00Z', '2026-10-01T03:00:00Z');
  assert.deepEqual([late.redEpisodes, late.medianHoursFirstRedToGreen], [1, 6]);
  const open = redStreak([run(1, 'success'), run(2, 'failure')], '2026-10-01T00:00:00Z', '2026-10-01T03:00:00Z');
  assert.deepEqual([open.redEpisodes, open.resolvedEpisodes, open.medianHoursFirstRedToGreen], [1, 0, null]);
});

test('guard cell: path-shaped words only, with line numbers and punctuation trimmed', () => {
  assert.deepEqual(
    guardPaths('`core/time.test.ts:12` pins it; see `npm run check`, AGENTS.md, and web/lib/nav.ts. Not 1.5 or https://example.com/a.js'),
    ['core/time.test.ts', 'AGENTS.md', 'web/lib/nav.ts'],
  );
  assert.deepEqual(guardPaths('A habit, not a check.'), []);
});

test('lessons table: the Guard column is found by its header, rows keyed by first cell', () => {
  const table = lessonTable('# Lessons\n\n| # | Shape | Cost | Guard |\n| --- | --- | --- | --- |\n| 1 | a | b | `x/y.mjs` |\n| 2 | c | d | none |\n');
  assert.equal(table.guardIndex, 3);
  assert.deepEqual([...table.rows.keys()], ['1', '2']);
});

test('front matter: status, and evidence only when a path is named', () => {
  assert.deepEqual(frontMatter('---\nstatus: built\nevidence: ["evidence/a.md"]\n---\n# T'), { status: 'built', evidence: true });
  assert.deepEqual(frontMatter('---\nstatus: partial\nevidence: []\n---\n'), { status: 'partial', evidence: false });
  assert.deepEqual(frontMatter('---\nstatus: built\nevidence:\n  - evidence/a.md\n---\n'), { status: 'built', evidence: true });
  assert.deepEqual(frontMatter('---\nstatus: built\nevidence:      # newest first\n---\n'), { status: 'built', evidence: false });
  assert.equal(frontMatter('# no front matter'), null);
});

// A child process that exited non-zero, as execFileSync throws it.
const exited = (status, stdout = '') => () => { throw Object.assign(new Error(`exit ${status}`), { status, stdout }); };

test('doctor read: a report is a reading, with or without findings', () => {
  const report = JSON.stringify({ drift: [{ state: 'edited' }, { state: 'both' }, { state: 'behind' }], local: { ci: 'own', phases: 'own' } });
  assert.deepEqual(readDoctor(() => report), { computable: true, exit: 0, edited: 1, both: 1, localVariants: 2, total: 4 });
  // Doctor exits 1 when it has findings and still prints the whole report.
  assert.deepEqual(readDoctor(exited(1, report)), { computable: true, exit: 1, edited: 1, both: 1, localVariants: 2, total: 4 });
  assert.deepEqual(readDoctor(() => JSON.stringify({ drift: [] })), { computable: true, exit: 0, edited: 0, both: 0, localVariants: 0, total: 0 });
});

test('doctor read: a failed read is unknown, never zero drift', () => {
  const failed = [
    ['error JSON, exit 2', exited(2, JSON.stringify({ error: 'malformed config' }))],
    ['error JSON, exit 0', () => JSON.stringify({ error: 'not in a plates project' })],
    ['non-zero exit, no output', exited(2)],
    ['non-zero exit other than findings, with a report', exited(2, JSON.stringify({ drift: [] }))],
    ['killed by a signal', exited(null, JSON.stringify({ drift: [] }))],
    ['output that is not JSON', () => 'Error: something broke\n'],
    ['JSON that is not a report', () => '[]'],
    ['a report without a drift list', () => JSON.stringify({ local: {} })],
    ['a malformed local list', () => JSON.stringify({ drift: [], local: ['ci'] })],
    ['a spawn that could not start', () => { throw new Error('ENOENT'); }],
  ];
  for (const [name, run] of failed) {
    const read = readDoctor(run);
    assert.equal(read.computable, false, name);
    assert.equal(read.unknown, true, name);
    assert.equal(read.total, undefined, name);
  }
});
