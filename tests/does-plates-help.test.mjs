// scripts/research/does-plates-help.mjs: the phase 13 measures' parts, on synthetic Acme data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers/run.mjs';
import {
  redStreaks, lessonRows, guardFiles, namesExisting, lessonToGuard, frontMatter, phaseMoves, driftValue, readTranscript, median,
} from '../scripts/research/does-plates-help.mjs';

const SCRIPT = join(fileURLToPath(new URL('..', import.meta.url)), 'scripts/research/does-plates-help.mjs');
const at = h => new Date(Date.UTC(2026, 0, 1) + h * 3_600_000).toISOString();
const T0 = Date.UTC(2026, 0, 1);

test('red streak: the longest run of reds, cancelled runs neither break nor extend it, recovery read past the window', () => {
  const runs = [
    { createdAt: at(0), conclusion: 'success' },
    { createdAt: at(1), conclusion: 'failure' },
    { createdAt: at(2), conclusion: 'cancelled' },
    { createdAt: at(3), conclusion: 'failure' },
    { createdAt: at(4), conclusion: 'timed_out' },
    { createdAt: at(5), conclusion: 'success' },
    { createdAt: at(9), conclusion: 'failure' },
    { createdAt: at(12), conclusion: 'success' }, // after the window ends
  ];
  const r = redStreaks(runs, T0, T0 + 10 * 3_600_000);
  assert.equal(r.runs, 7);
  assert.equal(r.counted, 6, 'the cancelled run is not counted');
  assert.equal(r.longest, 3);
  assert.equal(r.streaks, 2);
  assert.equal(r.medianHoursToGreen, 3.5, 'first red to next green: 4 h and 3 h');
  assert.equal(r.unrecovered, 0);
  assert.equal(redStreaks([{ createdAt: at(1), conclusion: 'failure' }], T0, T0 + 3_600_000 * 2).unrecovered, 1);
});

test('lesson rows: a table split by blank lines is still one table; other tables are not read', () => {
  const text = [
    '# Lessons', '', '| # | The shape of it | What it cost | Guard |', '| --- | --- | --- | --- |',
    '| 1 | Acme a | x | `tests/a.test.mjs` asserts it |', '', '| 2 | Acme b | y | Review only |',
    '', '## Elsewhere', '', '| Name | Note |', '| --- | --- |', '| 9 | not a lesson |',
  ].join('\n');
  assert.deepEqual(lessonRows(text).map(r => r.key), ['1', '2']);
  assert.equal(lessonRows(text)[0].guard, '`tests/a.test.mjs` asserts it');
});

test('guard files: paths and file names, not commands, versions or hashes', () => {
  assert.deepEqual(guardFiles('`core/acme.test.ts` and `npm run check` in 2615551 `v1.2.3` `vercel.json`'), ['core/acme.test.ts', 'vercel.json']);
  assert.deepEqual(guardFiles('asserted in tests/acme.test.mjs:12, see `docs/a.md#x`'), ['docs/a.md', 'tests/acme.test.mjs']);
  assert.deepEqual(guardFiles('Review only. *Planned.*'), []);
  const tree = new Set(['packages/web/test/acme.test.ts', 'vercel.json']);
  assert.equal(namesExisting(['acme.test.ts'], tree), true, 'a bare name is the tail of a path');
  assert.equal(namesExisting(['test/acme.test.ts'], tree), true);
  assert.equal(namesExisting(['tests/gone.test.ts'], tree), false);
});

test('lesson to guard: only rows added in the window, share over all of them', () => {
  const table = rows => ['| # | Shape | Cost | Guard |', '| --- | --- | --- | --- |', ...rows].join('\n');
  const start = table(['| 1 | a | x | `a.test.mjs` |']);
  const end = table(['| 1 | a | x | `a.test.mjs` |', '| 2 | b | x | `tests/b.test.mjs` |', '| 3 | c | x | `tests/gone.test.mjs` |', '| 4 | d | x | review |']);
  const r = lessonToGuard(start, end, new Set(['a.test.mjs', 'tests/b.test.mjs']));
  assert.deepEqual(r, { added: 3, namingAFile: 2, guardFileExists: 1, share: 0.33 });
  assert.equal(lessonToGuard(null, start, new Set()).added, 1, 'no file at the start: every row is added');
  assert.equal(lessonToGuard(start, start, new Set()).share, null, 'nothing added is no share, not zero');
});

test('front matter: status and an evidence path, body lines ignored', () => {
  assert.deepEqual(frontMatter('---\nstatus: built\nevidence: ["evidence/a.md"]\n---\nstatus: planned\n'), { status: 'built', evidence: true });
  assert.deepEqual(frontMatter('---\nstatus: built   # note\nevidence: []\n---\n'), { status: 'built', evidence: false });
  assert.deepEqual(frontMatter('---\nstatus: partial\nevidence:\n  - evidence/a.md\n---\n'), { status: 'partial', evidence: true });
  assert.deepEqual(frontMatter('# no front matter\nstatus: built\n'), { status: null, evidence: false });
});

test('phase moves: per week inside the window, and the evidence-backed share of moves to built', () => {
  const day = 86_400_000;
  const moves = [
    { t: T0 + 1 * day, to: 'partial', evidence: false },
    { t: T0 + 2 * day, to: 'built', evidence: true },
    { t: T0 + 9 * day, to: 'built', evidence: false },
    { t: T0 + 20 * day, to: 'built', evidence: true }, // outside
  ];
  const r = phaseMoves(moves, T0, T0 + 14 * day);
  assert.deepEqual(r.perWeek, [2, 1]);
  assert.equal(r.movesPerWeek, 1.5);
  assert.equal(r.toBuilt, 2);
  assert.equal(r.evidenceShare, 0.5);
});

test('drift: the value in a health page drift row; no row is no reading', () => {
  assert.equal(driftValue('| `drift` — managed files the project changed (doctor: edited, both) | 2 | ≤ 0 | outside | a, b |'), 2);
  assert.equal(driftValue('| `other` | 1 |'), null);
});

test('a transcript: builder, phase, wall minutes and whole-check runs counted as plates improve counts them', () => {
  const line = (t, content, type = 'assistant') => JSON.stringify({ type, timestamp: new Date(T0 + t * 60_000).toISOString(), message: { content } });
  const bash = (id, command) => ({ type: 'tool_use', id, name: 'Bash', input: { command } });
  const text = [
    line(0, 'You are the builder for Acme phase 7. Read brief-7.md.', 'user'),
    line(1, [bash('a', 'npm run check')]),
    line(2, [bash('b', 'node --test tests/acme.test.mjs')]),
    line(3, [bash('c', 'cd /tmp/acme-fixture && npm test')]),
    line(30, [{ type: 'text', text: 'done' }]),
  ].join('\n');
  const r = readTranscript(text, null, 'npm run check', '/home/acme/code/acme');
  assert.equal(r.builder, true);
  assert.equal(r.phase, 7);
  assert.equal(r.minutes, 30);
  assert.equal(r.whole, 2, 'any directory: the check and the fixture suite');
  assert.equal(r.wholeInRoot, 1, 'in the checkout: the fixture suite is another project\'s gate');
  assert.equal(readTranscript(line(0, 'Explore Acme', 'user'), { description: 'Search Acme' }, 'npm run check').builder, false);
});

test('median: of nothing is null', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
});

test('the script refuses without --fleet and on an unknown flag, and reads nothing', () => {
  const a = run(process.execPath, [SCRIPT]);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /--fleet <dir> is required/);
  const b = run(process.execPath, [SCRIPT, '--fleet', '/nonexistent-acme', '--bogus']);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /unexpected argument: --bogus/);
});
