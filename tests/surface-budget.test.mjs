// The CLI's surface has a budget and a boundary (phase 142, goal G9): the
// registry in lib/cli.mjs equals .plates/surface.json, and every verb is named
// under "What Plates owns, verb by verb" in docs/design.md. Fixtures extend a
// copy of the registry; lib/cli.mjs is never edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verbs, FLAGS, main } from '../lib/cli.mjs';
import { NAMES_USAGE, parseNamesArgs } from '../lib/names-cli.mjs';
import { checkSurface, surfaceOf, ownedVerbs, SHARED, BUDGET_FILE, DESIGN_FILE } from '../lib/surface-budget.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = () => ({ verbs: new Map(verbs), flags: [...FLAGS] });
const budget = async () => JSON.parse(await readFile(join(PLATES, BUDGET_FILE), 'utf8'));
const design = () => readFile(join(PLATES, DESIGN_FILE), 'utf8');
const names = list => list.join('\n');

test('names and learning help expose their parsed flags to the surface budget', async () => {
  const b = await budget();
  assert.equal(verbs.get('names').usage, NAMES_USAGE);
  for (const [name, parser] of [['names', parseNamesArgs], ['learn', verbs.get('learn').run]]) {
    const flags = [...new Set(parser.toString().match(/--[a-z][a-z0-9-]*/g))];
    const usage = new Set(verbs.get(name).usage.match(/--[a-z][a-z0-9-]*/g));
    for (const flag of flags) {
      assert.ok(usage.has(flag), `${name} help omits ${flag}`);
      assert.ok([...b.surface.shared, ...b.surface.verbs[name]].includes(flag), `${name} budget omits ${flag}`);
    }
  }
});

test('help aliases are top-level only, never advertised as shared verb flags', async () => {
  assert.ok(!SHARED.includes('--help'));
  let output = '';
  assert.equal(await main(['--help', '--json'], { out: text => { output += text; } }), 0);
  assert.equal(JSON.parse(output).verbs.length, verbs.size);
  output = '';
  assert.equal(await main(['status', '--help', '--json'], { out: text => { output += text; } }), 2);
  assert.match(JSON.parse(output).error, /unexpected argument: --help/);
});

test('retired stubs remain budgeted without being advertised as active owned verbs', async () => {
  const d = await design();
  assert.equal(verbs.get('board').retired, true);
  assert.ok(!ownedVerbs(d).includes('board'));
  assert.ok(Object.hasOwn(surfaceOf(real()).verbs, 'board'), 'the exposed retirement stub still counts');
  assert.deepEqual(checkSurface(real(), await budget(), d), []);
});

test('new surface needs the boundary', async () => {
  const [b, d] = [await budget(), await design()];
  const now = surfaceOf(real());
  assert.deepEqual({ verbs: b.verbs, flags: b.flags }, now.counts, 'the budget counts what the registry exposes');
  assert.deepEqual(checkSurface(real(), b, d), []);

  // One more verb: named, with the budget file and the boundary.
  const more = real();
  more.verbs.set('frobnicate', { summary: 'acme', usage: 'plates frobnicate [--json]' });
  const verbProblems = names(checkSurface(more, b, d));
  assert.match(verbProblems, /new verb `plates frobnicate`/);
  assert.match(verbProblems, new RegExp(`raise "verbs" to ${b.verbs + 1} in \\.plates/surface\\.json`));
  assert.match(verbProblems, /What Plates owns, verb by verb" in Own, adopt, watch in docs\/design\.md/);

  // Raising only the count does not let it in: the verb must be listed and owned.
  const raised = { ...b, verbs: b.verbs + 1 };
  assert.match(names(checkSurface(more, raised, d)), /new verb `plates frobnicate`/);

  // One more flag on an existing verb.
  const flagged = real();
  const status = verbs.get('status');
  flagged.verbs.set('status', { ...status, usage: status.usage.replace('[--json]', '[--acme-colour <c>] [--json]') });
  const flagProblems = names(checkSurface(flagged, b, d));
  assert.match(flagProblems, /new flag --acme-colour on `plates status`/);
  assert.match(flagProblems, new RegExp(`raise "flags" to ${b.flags + 1} in \\.plates/surface\\.json`));
  assert.match(flagProblems, /Own, adopt, watch in docs\/design\.md/);

  // A new top-level flag is surface too; a shared flag on one more verb is not.
  const top = real();
  top.flags.push({ name: '--acme', usage: 'plates --acme', summary: 'acme' });
  assert.match(names(checkSurface(top, b, d)), /new top-level flag --acme: raise "flags"/);
  const shared = real();
  const integrate = verbs.get('integrate');
  shared.verbs.set('integrate', { ...integrate, usage: `${integrate.usage} [--yes]` });
  assert.ok(!verbs.get('integrate').usage.includes('--yes'));
  assert.deepEqual(checkSurface(shared, b, d), [], '--yes counts once for the CLI');

  // Swapping one flag for another keeps the count but is still new surface.
  const swapped = real();
  swapped.verbs.set('status', { ...status, usage: status.usage.replace('--project <p>', '--acme <p>') });
  const swapProblems = names(checkSurface(swapped, b, d));
  assert.match(swapProblems, /new flag --acme on `plates status`/);
  assert.match(swapProblems, /gone from the registry: --project on `plates status`/);
});

test('surface removed must lower the budget', async () => {
  const [b, d] = [await budget(), await design()];
  const fewer = real();
  fewer.verbs.delete('time');
  const verbProblems = names(checkSurface(fewer, b, d));
  assert.match(verbProblems, new RegExp(`lower the budget to ${b.verbs - 1} \\("verbs" in \\.plates/surface\\.json\\); gone: \`plates time\``));
  const flags = surfaceOf(real()).verbs.time.length;
  assert.match(verbProblems, new RegExp(`lower the budget to ${b.flags - flags} \\("flags"`));

  const fewerFlags = real();
  const status = verbs.get('status');
  fewerFlags.verbs.set('status', { ...status, usage: status.usage.replace(' [--project <p>]', '') });
  assert.match(names(checkSurface(fewerFlags, b, d)), new RegExp(`lower the budget to ${b.flags - 1} \\("flags".*gone: --project on \`plates status\``));
});

test('the boundary owns every verb', async () => {
  const [b, d] = [await budget(), await design()];
  const owned = ownedVerbs(d);
  assert.deepEqual([...owned].sort(), [...verbs].filter(([, verb]) => !verb.retired).map(([name]) => name).sort(), 'each verb is named exactly once');
  assert.equal(new Set(owned).size, owned.length);

  // A design text missing one verb fails, naming it.
  const missing = d.replace('`plates drain`,', '');
  assert.notEqual(missing, d);
  assert.deepEqual(checkSurface(real(), b, missing), ['`plates drain` is not named under "What Plates owns, verb by verb" in Own, adopt, watch in docs/design.md']);

  // A verb in the budget and registry but not the boundary fails the same way.
  const more = real();
  more.verbs.set('frobnicate', { summary: 'acme', usage: 'plates frobnicate [--json]' });
  const raised = { ...b, verbs: b.verbs + 1, surface: { ...b.surface, verbs: { ...b.surface.verbs, frobnicate: [] } } };
  assert.deepEqual(checkSurface(more, raised, d), ['`plates frobnicate` is not named under "What Plates owns, verb by verb" in Own, adopt, watch in docs/design.md']);
  const owns = d.replace('`plates home`.', '`plates home`, `plates frobnicate`.');
  assert.deepEqual(checkSurface(more, raised, owns), []);

  // A verb listed that no longer exists fails, as does one listed twice.
  const stale = d.replace('`plates home`.', '`plates home`, `plates acme-gone`.');
  assert.deepEqual(checkSurface(real(), b, stale), ['`plates acme-gone` is named under "What Plates owns, verb by verb" in Own, adopt, watch in docs/design.md but is not a verb in lib/cli.mjs']);
  const twice = d.replace('`plates home`.', '`plates home`, `plates drain`.');
  assert.deepEqual(checkSurface(real(), b, twice), ['`plates drain` is named more than once under "What Plates owns, verb by verb" in Own, adopt, watch in docs/design.md']);

  // Names outside the section do not count, and no section at all is a failure.
  const elsewhere = d.replace('`plates drain`,', '').replace('## The problem, in one paragraph', 'Also `plates drain`.\n\n## The problem, in one paragraph');
  assert.match(names(checkSurface(real(), b, elsewhere)), /`plates drain` is not named/);
  assert.deepEqual(checkSurface(real(), b, '# Acme design\n'), ['docs/design.md has no "What Plates owns, verb by verb" under "Own, adopt, watch"']);
});
