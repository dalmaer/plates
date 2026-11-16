// What plates tells people can't fall behind what plates does (phase 18, lesson 16).
// The README's verb tables are read against the live verb registry, and its
// practices table against practices/, both ways — the same shape as the
// agent guide's surface test in tests/cli.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { verbs, announced, CLI_ROOT } from '../lib/cli.mjs';

const README = join(CLI_ROOT, 'README.md');
const registered = () => [...verbs.keys()].filter(v => v !== 'help');

/** The practices plates ships: every practices/<dir> with a practice.json, by its name. */
async function practices() {
  const out = [];
  for (const d of await readdir(join(CLI_ROOT, 'practices'), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const raw = await readFile(join(CLI_ROOT, 'practices', d.name, 'practice.json'), 'utf8').catch(() => null);
    if (raw) out.push(JSON.parse(raw).name);
  }
  return out.sort();
}

/** Markdown tables: each a { header, rows } with rows as arrays of raw cells. */
function tables(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('|') || !/^\|(\s*:?-+:?\s*\|)+\s*$/.test(lines[i + 1])) continue;
    const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
    const t = { header: cells(lines[i]), rows: [] };
    for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) t.rows.push(cells(lines[i]));
    out.push(t);
  }
  return out;
}

/** The verbs README's "Verb" tables name, expanded the way the agent guide's are. */
export function readmeVerbs(text) {
  const firsts = tables(text).filter(t => t.header[0] === 'Verb').flatMap(t => t.rows.map(r => r[0]));
  const spans = firsts.flatMap(c => [...c.matchAll(/`plates ([^`]+)`/g)].map(m => m[1].replace(/\\\|/g, '|')));
  return announced(spans.map(s => `- \`plates ${s}\``).join('\n'));
}

/** The practices README's "Practice" table names (the first backticked word of each row). */
export function readmePractices(text) {
  return tables(text).filter(t => t.header[0] === 'Practice')
    .flatMap(t => t.rows.map(r => /`([^`]+)`/.exec(r[0])?.[1]).filter(Boolean)).sort();
}

const covers = (line, name) => line === name || line.startsWith(`${name} `);

/** Every disagreement between the README and what plates registers and ships. */
export function docGaps(text, names, shipped) {
  const said = readmeVerbs(text), told = readmePractices(text);
  const gaps = [];
  for (const n of names) if (!said.some(l => covers(l, n))) gaps.push(`verb missing from README: plates ${n}`);
  for (const l of said) if (!names.some(n => covers(l, n))) gaps.push(`README names an unregistered verb: plates ${l}`);
  for (const p of shipped) if (!told.includes(p)) gaps.push(`practice missing from README: ${p}`);
  for (const p of told) if (!shipped.includes(p)) gaps.push(`README names a practice that does not exist: ${p}`);
  for (const line of text.split('\n')) {
    const verbsHere = [...line.matchAll(/`plates ([^`]+)`/g)].flatMap(m => announced(`- \`plates ${m[1].replace(/\\\|/g, '|')}\``));
    const hit = verbsHere.find(l => names.some(n => covers(l, n)));
    if (hit && /\bplanned\b|\bcoming\b|not yet built/i.test(line)) gaps.push(`README calls a registered verb unbuilt: plates ${hit}: ${line.trim()}`);
  }
  return gaps;
}

test('the README names every registered verb and practice, and nothing else', async () => {
  assert.deepEqual(docGaps(await readFile(README, 'utf8'), registered(), await practices()), []);
});

test('the README tables are read: verbs expanded, practices named', async () => {
  const text = await readFile(README, 'utf8');
  const said = readmeVerbs(text);
  for (const v of ['goal list', 'goal retire', 'phase new', 'fleet update', 'next']) assert.ok(said.includes(v), `${v} not read from README`);
  assert.ok(readmePractices(text).includes('loop'));
  assert.ok(readmePractices(text).length >= 9);
});

test('each kind of drift fails the check (mutations of the README text, in memory)', async () => {
  const text = await readFile(README, 'utf8');
  const names = registered(), shipped = await practices();
  const gaps = t => docGaps(t, names, shipped);
  const base = gaps(text);
  const added = t => gaps(t).filter(g => !base.includes(g));

  // A verb row removed.
  const releaseRow = text.split('\n').find(l => l.startsWith('| `plates release`'));
  assert.ok(releaseRow);
  assert.deepEqual(added(text.replace(`${releaseRow}\n`, '')), ['verb missing from README: plates release']);
  // One word dropped from a word list.
  assert.deepEqual(added(text.replace('`plates goal list\\|show\\|add\\|retire`', '`plates goal list\\|show\\|add`')), ['verb missing from README: plates goal retire']);
  // A fake verb row added.
  assert.deepEqual(added(text.replace(releaseRow, `${releaseRow}\n| \`plates frobnicate\` | Acme does a thing |`)), ['README names an unregistered verb: plates frobnicate']);
  // A registered verb written as planned, coming, or not yet built.
  for (const word of ['planned', 'coming', 'not yet built']) {
    const g = added(text.replace(releaseRow, `${releaseRow.replace(/ \|$/, '')} (${word}) |`));
    assert.equal(g.length, 1, word);
    assert.match(g[0], /^README calls a registered verb unbuilt: plates release/);
  }
  // A practice row removed.
  const nightRow = text.split('\n').find(l => l.startsWith('| `night`'));
  assert.ok(nightRow);
  assert.deepEqual(added(text.replace(`${nightRow}\n`, '')), ['practice missing from README: night']);
  // A fake practice row added.
  assert.deepEqual(added(text.replace(nightRow, `${nightRow}\n| \`acme\` | Acme things | Acme failures |`)), ['README names a practice that does not exist: acme']);
  // A newly registered verb with no row.
  assert.deepEqual(docGaps(text, [...names, 'frobnicate'], shipped).filter(g => !base.includes(g)), ['verb missing from README: plates frobnicate']);
});

// Audit regressions: the operating instructions must name the shipped contracts.
const document = path => readFile(join(CLI_ROOT, path), 'utf8');
test('drift-7: canvas examples include admission and held property names', async () => {
  const spec = await document('docs/specs/isocan-project-canvas.md');
  const { parseCanvasArgs } = await import('../lib/canvas.mjs');
  const examples = [...spec.matchAll(/`plates canvas connect ([^`]+)`/g)];
  assert.equal(examples.length, 2);
  for (const [, args] of examples) assert.equal(parseCanvasArgs('connect', args.split(' ')).audience, 'owner-only');
  assert.match(spec, /implemented-by/);
  assert.match(spec, /cadence:"manual"/);
  assert.match(spec, /plates canvas night --report/);
  assert.match(await document('docs/guide/project-canvas.md'), /`keel.hash` and `keel.operation`/);
});
test('drift-9: web instructions describe gated writes, saved drafts and media', async () => {
  const readme = await document('README.md');
  assert.doesNotMatch(readme, /Phase 97 now contains locally verified|does not write decisions/);
  assert.match(readme, /docs\/guide\/web-activation.md/);
  assert.doesNotMatch(await document('docs/guide/web-home.md'), /This is a read-only view/);
  assert.doesNotMatch(await document('docs/guide/web-auth-service.md'), /Media remains planned|then explicitly report that the feature is unavailable/);
  assert.match(await document('docs/guide/web-daily-learning.md'), /encrypted.*draft|draft.*encrypted/s);
  assert.doesNotMatch(await document('docs/guide/web-daily-learning.md'), /Hosted execution and publication are unavailable/);
});
test('drift-10: hosted publication names the current canonical plan destination', async () => {
  for (const path of ['docs/guide/web-night-operations.md', 'docs/specs/web-daily-learning.md', 'docs/specs/web-operation-experience.md']) {
    assert.match(await document(path), /plates-night-plan/, path);
  }
});
test('drift-11: agent help exposes audit, all optional practices and home modes', async () => {
  const guide = await document('lib/agent-guide.md');
  assert.match(guide, /<!-- topic: audit \|/);
  for (const mode of ['--backlog','--recurring','--agents','--attach','--assist','--names-evidence']) {
    assert.ok(guide.slice(guide.indexOf('<!-- topic: home |'), guide.indexOf('<!-- topic:', guide.indexOf('<!-- topic: home |') + 1)).includes(mode), mode);
  }
  for (const name of await readdir(join(CLI_ROOT, 'practices'))) {
    const practice = JSON.parse(await document(`practices/${name}/practice.json`).catch(() => '{}'));
    if (!practice.optional) continue;
    for (const topic of ['init','adopt']) {
      const section = guide.split(`<!-- topic: ${topic} |`)[1].split('<!-- topic:')[0];
      assert.ok(section.includes('`'+name+'`'), `${topic}: ${name}`);
    }
  }
  assert.match(await document('practices/audits/README.md'), /plates audit run/);
});
test('drift-12: delivery instructions include the configured Vercel target and grants', async () => {
  assert.doesNotMatch(await document('docs/philosophy.md'), /does not adopt `delivery`/);
  const guide = await document('docs/guide/delivery.md');
  for (const term of ['vercel:<project>', '--migrated', '--migrations-from', '--watch', 'agentPromote']) assert.ok(guide.includes(term), term);
});
test('drift-13: review instructions describe the one progress extension', async () => {
  for (const path of ['lib/agent-guide.md','README.md','docs/guide/reviews-and-prs.md','docs/guide/spin-a-phase.md']) assert.match(await document(path), /2N/, path);
  assert.match(await document('lib/agent-guide.md'), /count, limit, base, reached, pushes, trend/);
  assert.match(await document('docs/guide/when-something-is-red.md'), /OPENAI_API_KEY/);
});
test('drift-14: evaluation specifications describe shipped approval and lifecycle surfaces', async () => {
  assert.match(await document('docs/specs/decisions-and-feedback.md'), /plates shape plan <file> --yes --digest/);
  const learning = await document('docs/specs/evaluated-learning-records.md');
  assert.match(learning, /plates learn evaluate package/);
  assert.doesNotMatch(learning, /verification_interface_unavailable/);
  assert.doesNotMatch(await document('docs/specs/harness-regression-evaluation.md'), /compare and rescore remain planned|Comparison states are draft, frozen, admitted/);
});
test('drift-19: operating examples name current branch and marker writers', async () => {
  const guide = await document('lib/agent-guide.md');
  for (const old of ['keel/update-v','keel-night/', 'keel-climb/', '<!-- keel:class', '<!-- keel:cross-review']) assert.ok(!guide.includes(old), old);
  assert.match(await document('practices/climb/files/.agents/climb/PROTOCOL.md'), /plates-climb\/<job>\/<date>/);
});
