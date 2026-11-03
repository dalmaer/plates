// The owner's open work is one item model, lib/work-items.mjs (plates phase 156).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, kindOf, looseItems, fleetOf, reviewItems } from '../lib/work-items.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));

/** Every .mjs source under the given roots, repo-relative. */
async function sources(...roots) {
  const out = [];
  const visit = async dir => {
    for (const entry of await readdir(join(repo, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await visit(path); }
      else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(path);
    }
  };
  for (const root of roots) await visit(root);
  return out;
}

// A static or dynamic import whose specifier ends in board.mjs.
const importsBoard = text => /(?:from\s*|import\s*\(\s*)['"][^'"]*\bboard\.mjs['"]/.test(text);

test('one item model: no module imports the retired board', async () => {
  // plates board retired (it names plates home and exits 2), and lib/board.mjs with it: nothing may import it.
  const allowed = new Set();
  const offenders = [];
  for (const path of await sources('lib', 'bin', 'scripts', 'practices')) {
    if (allowed.has(path)) continue;
    if (importsBoard(await readFile(join(repo, path), 'utf8'))) offenders.push(path);
  }
  assert.deepEqual(offenders, [], 'these import lib/board.mjs; the item model is lib/work-items.mjs');
  // The named consumers read the model itself.
  for (const path of ['lib/web/projects.mjs', 'lib/web/decisions.mjs', 'lib/web/walks.mjs', 'lib/goodnight.mjs', 'lib/morning.mjs']) {
    assert.match(await readFile(join(repo, path), 'utf8'), /work-items\.mjs['"]/, `${path} reads the item model`);
  }
  // The guard itself catches both import forms.
  assert.ok(importsBoard("import { x } from '../board.mjs';") && importsBoard("await import('./board.mjs')"));
  assert.ok(!importsBoard("import { x } from './work-items.mjs';"));
});

test('every item kind is defined once, in the model', () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    assert.equal(def.kind, kind); assert.equal(typeof def.label, 'string'); assert.ok(def.sources.length);
    assert.ok(Object.isFrozen(def));
  }
  // Items the sources raise, from synthetic Acme reads: each kind is listed.
  const loose = looseItems({ projects: [{ repo: 'acme/studio', dir: '/acme/studio', items: [
    { kind: 'file', title: 'a.txt' }, { kind: 'branch', title: 'work/x' }, { kind: 'worktree', title: 'wt' }, { kind: 'pr', title: '#1' },
    { kind: 'session', title: 'Acme chat', ending: 'question' }, { kind: 'repo', title: 'tidy' }, { kind: 'gap', title: 'unread' },
    { kind: 'phase', title: 'phase 1', move: '⚑ yours' }, { kind: 'lessons', title: 'lessons' },
  ] }] });
  const fleet = fleetOf({ rows: [{ role: 'managed', repo: 'acme/api', adopted: true, practice: { behind: 'current', version: '1.0.0' }, health: { last: '2026-11-01' },
    ci: { state: 'red', workflow: 'gate', conclusion: 'failure', at: '2026-11-01' }, machinePrs: { drafts: [{ head: 'plates/update-v1.2.0', number: 4 }] } }] });
  for (const item of [...loose, ...fleet.items]) assert.ok(kindOf(item), `kind ${item.kind} is defined in KINDS`);
  assert.equal(kindOf({ kind: 'invented' }), undefined);
  assert.equal(kindOf({ kind: 'toString' }), undefined, 'only listed kinds, never a prototype key');
});

test('review items carry their kind from the model', async () => {
  const r = await reviewItems([{ repo: 'acme/studio', rounds: 3 }], { me: 'acme', read: async () => ({ prs: [{ number: 2, title: 'Acme', state: 'open', url: 'https://github.com/acme/studio/pull/2', author: 'acme', unanswered: 1, oldest: '2026-11-01' }], rounds: [] }) });
  assert.equal(r.items.length, 1); assert.equal(kindOf(r.items[0]).label, 'Review');
});
