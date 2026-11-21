// Plates phase 204: trying the work by hand is an invitation, never a gate.
// An open walk is an optional Try it on Home in both forms (the CLI's
// plates home and the web's Home), answered Works, Something's off or Skip,
// outside the docket, its count and push notifications; a ⚑ step still waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeSnapshot, answersFor, roadmapItems, homeRoadmap, walkDone, tryItWritePlan, followUpIssueFor, tryItReadiness, WRITERS } from '../lib/work-items.mjs';
import { homeText } from '../lib/home.mjs';
import { renderGlance } from '../lib/web/views.mjs';
import { waitingEvents } from '../lib/web/push-notify.mjs';
import { parsePhase } from '../scripts/roadmap.mjs';

// A Try it as homeRoadmap gives it: a walk item from an open "⚑ try:" box (tryIt: true).
const walk = (ref, since, more = {}) => ({ id: `studio:phase:${ref}:walk`, projectId: 'studio', kind: 'walk', itemKind: 'walk', ref, phase: ref, since, ready: true, tryIt: true, title: `phase ${ref}: Acme ${ref}`, details: null, ...more });
const project = () => ({ id: 'studio', name: 'Studio', repo: 'acme/studio', gaps: [], changes: [], state: 'complete',
  // A ⚑ setup step: the owner's turn, as before.
  decisions: [{ id: 'studio:phase:1:decision', projectId: 'studio', kind: 'decision', itemKind: 'step', ref: '1', phase: '1', title: 'Create the Acme bucket (⚑, $5 a month)' }],
  walks: [walk('3', '2026-11-02', { details: { ask: 'Publish one post from your phone.', takes: 'About 10 minutes', choices: ['Verified', 'Needs changes'] } }), walk('2', '2026-10-01'),
    { ...walk('8', '2026-09-01'), ready: false, title: 'Not ready yet' }],
  reviews: [], waiting: [] });
const snapshot = can => homeSnapshot([project()], { sections: [], can, today: '2026-11-21' });

test('a walk is an optional Try it on Home, never waiting on the owner', () => {
  const cli = snapshot({ form: 'cli' });
  // Out of the docket and its count; the ⚑ step still waits on the owner, first.
  assert.deepEqual(cli.docket.map(e => [e.key, e.group]), [['studio:step:1', 'unblock']]);
  assert.equal(cli.home.sections.find(s => s.id === 'needs-you').count, 1);
  assert.deepEqual(cli.home.glance.cards.map(c => c.key), ['studio:step:1']);
  assert.equal(cli.home.glance.count, 1);
  assert.equal(cli.home.sections.find(s => s.id === 'plates').items[0].status, 'agent waiting on you', 'the plate counts the step, not the Try its');
  // Listed as optional Try its, oldest first, the walk that is not ready left out (it waits on time).
  assert.deepEqual(cli.tryIt.map(t => [t.key, t.optional, t.question]), [['studio:walk:2', true, 'phase 2: Acme 2'], ['studio:walk:3', true, 'Publish one post from your phone.']]);
  assert.deepEqual(cli.home.glance.tryIt, cli.tryIt, 'one read model: the glance carries the same Try its');
  // Works, Something's off (with a note) or Skip; no Not now, and never a choice the owner owes.
  for (const t of cli.tryIt) assert.deepEqual(t.answers.map(a => [a.id, a.label, a.writer, a.needsWhy, !!a.unavailable]), [['works', 'Works', 'try it', 'never', false], ['off', 'Something\'s off', 'try it', 'always', false], ['skip', 'Skip', 'try it', 'never', false]]);
  assert.ok(Object.hasOwn(WRITERS, 'try it'));
  // The web: Works and Skip write through the walk writer; Something's off says why it is not from here, and the command.
  const web = snapshot({ form: 'web', decisionWrites: true });
  assert.deepEqual(web.docket.map(e => e.key), ['studio:step:1']);
  const answers = web.tryIt[0].answers;
  assert.deepEqual(answers.filter(a => !a.unavailable).map(a => a.id), ['works', 'skip']);
  const off = answers.find(a => a.id === 'off');
  assert.match(off.unavailable.reason, /Issues write permission/);
  assert.equal(off.unavailable.command, 'plates home --answer studio:walk:2 off --why "<line>"');
  // A step's answers are unchanged: Done or Hand to an agent, and Not now.
  assert.deepEqual(answersFor(web.decisions[0], { form: 'cli' }).map(a => a.id), ['done', 'hand', 'not-now']);

  // Both renderers: Needs you counts one, and Try it follows it as optional.
  const text = homeText({ schema: 1, generatedAt: '2026-11-21T09:00:00.000Z', ...cli });
  assert.match(text, /Needs you \(1\)/);
  assert.match(text, /Try it \(2 optional; nothing waits on these\)\n {2}Studio · phase 2: Acme 2\n[\s\S]*Works \| Something's off \| Skip\n {6}answer: plates home --answer studio:walk:2 <works\|off\*\|skip>/);
  assert.ok(text.indexOf('Needs you (1)') < text.indexOf('Try it (2'), 'after what waits on the owner');
  const html = renderGlance(web);
  assert.match(html, /<h2 id="needs-you-title">Needs you<\/h2><span class="meta">1<\/span>/);
  assert.match(html, /<section class="home-section glance-try-it" id="try-it"[^>]*>.*<h2 id="try-it-title">Try it<\/h2><span class="meta">2 optional<\/span>/s);
  assert.ok(html.indexOf('id="needs-you"') < html.indexOf('id="try-it"'));
  assert.match(html, /data-card="studio:walk:3"[\s\S]*data-answer="works"[\s\S]*data-answer="off"[^>]*aria-disabled="true"[\s\S]*data-answer="skip"/);
  assert.doesNotMatch(renderGlance(homeSnapshot([{ ...project(), walks: [] }], { sections: [], today: '2026-11-21' })), /try-it/, 'no Try it, no section');

  // Push: a ready walk never notifies, and the docket's count (what "N new for you" counts) leaves it out.
  assert.deepEqual(waitingEvents({ ...project(), walks: project().walks }).filter(e => e.kind === 'walk'), []);
});

const phaseFile = ({ status = 'built', extra = '', acceptance }) => `---
status: ${status}
since: 2026-11-01
goal: G0
depends: []
note: "Acme."
evidence: ["evidence/acme.md"]
${extra}---

# Acme publishes

## Done when

It publishes.

## Scope

Small.

## Acceptance

${acceptance}

## Proof

\`npm test\`

## Deliberately open

Nothing.

## Next action

None.
`;

test('a built phase with an open walk lists it as a Try it, and each answer writes its record', async () => {
  // The read: built with an open by-hand walk, a Try it; a buildable box elsewhere is the agent's, never a Try it.
  const raw = phaseFile({ acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] On a phone: ⚑ try: the owner: publishes and sees it land.' });
  const data = { source: 'files', config: { repo: 'acme/studio' }, goals: [{ id: 'G0', title: 'Start', outcome: 'It starts.' }], phases: [parsePhase('05-acme.md', raw)], coverage: { complete: true, gaps: [] } };
  const board = await roadmapItems('/nowhere', { read: async () => data, readPhase: async () => raw, today: '2026-11-21' });
  assert.deepEqual(board.items.map(i => [i.kind, i.waits, i.ready]), [['walk', 'owner', true]]);
  const lists = homeRoadmap({ id: 'studio', name: 'Studio', revision: 'abc' }, board, data.phases, p => p);
  assert.deepEqual(lists.walks.map(w => [w.ref, w.ready]), [['5', true]]);

  // The writes: Works checks the box; Skip takes it away; Something's off checks it and names its follow-up.
  const ev = '# Evidence\n';
  const works = tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'works' });
  assert.match(works.writes[0][1], /- \[x\] On a phone: ⚑ try: the owner: publishes and sees it land\./);
  assert.match(works.writes[1][1], /Tried it: works\./);
  assert.equal(works.data.status, 'built');
  const skip = tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'skip' });
  assert.match(skip.writes[0][1], /^- \[x\] On a phone: ⚑ try: the owner: publishes and sees it land\. \(Skipped: trying it by hand is optional\.\)$/m, 'Skip checks the box and says so; it never takes it away');
  assert.equal(parsePhase('05-acme.md', skip.writes[0][1]).status, 'built');
  // A walk that is the phase's only box is checked and marked skipped, since Acceptance needs a box.
  const lone = tryItWritePlan({ file: '05-acme.md', raw: phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [ ] ⚑ try: the owner: opens it.' }), evidenceText: ev, today: '2026-11-21', tried: 'skip' });
  assert.match(lone.writes[0][1], /^- \[x\] ⚑ try: the owner: opens it\. \(Skipped: trying it by hand is optional\.\)$/m);
  assert.equal(parsePhase('05-acme.md', lone.writes[0][1]).status, 'built');
  assert.throws(() => tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'off' }), /needs a note/);
  const off = tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'off', note: 'The button is grey.', followUp: 'https://github.com/acme/studio/issues/9' });
  assert.match(off.writes[1][1], /Tried it: something's off\. The button is grey\. Follow-up: https:\/\/github\.com\/acme\/studio\/issues\/9\./);
  // A partial phase whose last open box was the walk moves to built, owes dropped.
  const owed = phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens it.' });
  const moved = tryItWritePlan({ file: '05-acme.md', raw: owed, evidenceText: ev, today: '2026-11-21', tried: 'works' });
  assert.deepEqual([parsePhase('05-acme.md', moved.writes[0][1]).status, /owes:/.test(moved.writes[0][1])], ['built', false]);
  // A box that is not a walk to try is never a Try it: a test, or a kept "⚑ by hand" decision.
  assert.throws(() => tryItWritePlan({ file: '05-acme.md', raw: phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [x] A.\n- [ ] ⚑ by hand: the owner picks.' }), evidenceText: ev, today: '2026-11-21', tried: 'works' }), /no open walk to try/);
  assert.throws(() => tryItWritePlan({ file: '05-acme.md', raw: phaseFile({ status: 'partial', acceptance: '- [ ] Runs: `npm test`.' }), evidenceText: ev, today: '2026-11-21', tried: 'works' }), /no open walk to try/);

  // The follow-up issue names the phase and carries the note.
  const issue = followUpIssueFor({ phase: 5, title: 'Acme publishes', note: 'The button is grey.', link: 'https://github.com/acme/studio/blob/main/docs/phases/05-acme.md' });
  assert.equal(issue.title, 'Something\'s off: phase 5 — Acme publishes');
  assert.match(issue.body, /> The button is grey\.\n\nPhase: https:\/\/github\.com\/acme\/studio\/blob\/main\/docs\/phases\/05-acme\.md/);

});

// A fake gh, found through PLATES_GH (the KEEL_GH variable) as every gh call here is: it logs each call and plays a script.
async function fakeGh(dir) {
  const gh = join(dir, 'gh'), log = join(dir, 'gh.log'), state = join(dir, 'gh.json');
  await writeFile(state, JSON.stringify({ create: 'ok', issues: [] }));
  await writeFile(gh, `#!${process.execPath}
const fs = require('fs'), a = process.argv.slice(2), st = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'));
fs.appendFileSync(${JSON.stringify(log)}, a.slice(0, 2).join(' ') + '\\n');
if (a[0] === 'issue' && a[1] === 'create') {
  const body = a[a.indexOf('--body') + 1], url = 'https://github.com/acme/studio/issues/' + (9 + st.issues.length);
  if (st.create === 'fail') { console.error('gh: offline'); process.exit(1); }
  st.issues.push({ url, body }); fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(st));
  if (st.create === 'lost') { console.error('gh: connection reset'); process.exit(1); }
  console.log(url);
} else if (a[0] === 'issue' && a[1] === 'list') console.log(JSON.stringify(st.issues));
else { console.error('fake gh: ' + a.join(' ')); process.exit(1); }
`, { mode: 0o755 });
  const calls = async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  const set = async more => writeFile(state, JSON.stringify({ ...JSON.parse(await readFile(state, 'utf8')), ...more }));
  return { gh, calls, set };
}
async function checkout(files) {
  const root = await mkdtemp(join(tmpdir(), 'plates-try-it-'));
  await mkdir(join(root, '.plates'));
  await mkdir(join(root, 'docs/phases'), { recursive: true });
  await mkdir(join(root, 'docs/evidence'));
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Studio', repo: 'acme/studio' }));
  await writeFile(join(root, 'docs/goals.json'), JSON.stringify([{ id: 'G0', title: 'Start', outcome: 'It starts.' }]));
  for (const [path, text] of Object.entries(files)) await writeFile(join(root, path), text);
  return root;
}

test('a Something\'s off opens one follow-up, found again by its marker, through the configured gh', async () => {
  const raw = phaseFile({ acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] On a phone: ⚑ try: the owner: publishes and sees it land.' });
  const root = await checkout({ 'docs/phases/05-acme.md': raw, 'docs/evidence/acme.md': '# Evidence\n' });
  try {
    const fake = await fakeGh(root), env = { ...process.env, PLATES_GH: fake.gh, KEEL_GH: fake.gh, PATH: '/nonexistent', GIT_DIR: join(root, '.no-git') };
    const answer = (more = {}) => walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21', ...more });
    const preview = await walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, today: '2026-11-21' });
    assert.equal(preview.exitCode, 3, 'opening an issue waits for --yes');
    assert.deepEqual(await fake.calls(), [], 'nothing opened before --yes');
    // A create that fails cleanly writes nothing; the next answer looks for the issue first, then opens it once.
    await fake.set({ create: 'fail' });
    await assert.rejects(answer(), /gh issue create failed/);
    assert.equal(await readFile(join(root, 'docs/phases/05-acme.md'), 'utf8'), raw, 'nothing written');
    // A create whose result is lost (it was opened, the answer never came back) is found by its marker, never opened twice.
    await fake.set({ create: 'lost' });
    const r = await answer();
    assert.equal(r.data.followUp, 'https://github.com/acme/studio/issues/9');
    // The failed create is looked for once; the retry looks first, opens, loses the answer, and finds it by its marker.
    assert.deepEqual(await fake.calls(), ['issue create', 'issue list', 'issue list', 'issue create', 'issue list']);
    const issues = JSON.parse(await readFile(join(root, 'gh.json'), 'utf8')).issues;
    assert.equal(issues.length, 1); assert.match(issues[0].body, /<!-- plates:try-it phase:5 box:2 -->/);
    assert.match(await readFile(join(root, 'docs/evidence/acme.md'), 'utf8'), /Tried it: something's off\. Grey\. Follow-up: https:\/\/github\.com\/acme\/studio\/issues\/9\./);
    assert.deepEqual((await readdir(join(root, '.plates/try-it'))).filter(f => f.endsWith('.json')), [], 'the intent is cleared once recorded');
    assert.equal(await readFile(join(root, '.plates/try-it/.gitignore'), 'utf8'), '*\n', 'the intent stays out of git');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a follow-up opened before a failed write is kept, and the retry records it without opening another', async () => {
  // A goal the roadmap no longer knows makes every write fail after the issue would open: validated first, nothing opens.
  const raw = phaseFile({ acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens it.' });
  const root = await checkout({ 'docs/phases/05-acme.md': raw, 'docs/evidence/acme.md': '# Evidence\n' });
  try {
    const fake = await fakeGh(root), env = { ...process.env, PLATES_GH: fake.gh, KEEL_GH: fake.gh, GIT_DIR: join(root, '.no-git') };
    await writeFile(join(root, 'docs/goals.json'), JSON.stringify([{ id: 'G9', title: 'Other', outcome: 'Other.' }]));
    await assert.rejects(walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21' }), /roadmap would reject/);
    assert.deepEqual(await fake.calls(), [], 'the prospective roadmap is checked before any issue');
    await writeFile(join(root, 'docs/goals.json'), JSON.stringify([{ id: 'G0', title: 'Start', outcome: 'It starts.' }]));
    // The write fails after the issue opened (the evidence file is unwritable): the URL is kept and named.
    const { chmod } = await import('node:fs/promises');
    await chmod(join(root, 'docs/evidence/acme.md'), 0o400);
    await assert.rejects(walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21' }), /follow-up is open: https:\/\/github\.com\/acme\/studio\/issues\/9/);
    await chmod(join(root, 'docs/evidence/acme.md'), 0o600);
    const r = await walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21' });
    assert.equal(r.data.followUp, 'https://github.com/acme/studio/issues/9');
    assert.equal((await fake.calls()).filter(c => c === 'issue create').length, 1, 'one issue, however many tries');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a Try it never overwrites an evidence file it did not name', async () => {
  const raw = phaseFile({ acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens it.' }).replace('evidence: ["evidence/acme.md"]', 'evidence: ["evidence/acme.md"]');
  const bare = raw.replace('status: built', 'status: partial').replace('evidence: ["evidence/acme.md"]', 'evidence: []');
  const root = await checkout({ 'docs/phases/05-acme.md': bare, 'docs/evidence/2026-11-21-phase-5-try-it.md': '# Someone else\'s evidence\n' });
  try {
    const fake = await fakeGh(root), env = { ...process.env, PLATES_GH: fake.gh, KEEL_GH: fake.gh, GIT_DIR: join(root, '.no-git') };
    for (const tried of ['works', 'off']) await assert.rejects(walkDone({ root, phase: '5', tried, note: 'Grey.', env, yes: true, today: '2026-11-21' }), /already exists and the phase names no evidence/, tried);
    assert.equal(await readFile(join(root, 'docs/evidence/2026-11-21-phase-5-try-it.md'), 'utf8'), '# Someone else\'s evidence\n');
    assert.deepEqual(await fake.calls(), [], 'refused before any follow-up');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a Try it is offered only when its writer would take it, and one card per open box', async () => {
  const goals = [{ id: 'G0', title: 'Start', outcome: 'It starts.' }];
  const files = {
    '04-acme.md': phaseFile({ status: 'partial', acceptance: '- [ ] Builds: `tests/b.test.mjs`.' }),
    // Depends on 4, which is not built: its Try it waits, with the reason, and offers no answer.
    '05-acme.md': phaseFile({ status: 'partial', acceptance: '- [x] A: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens it.' }).replace('depends: []', 'depends: [4]'),
    // Two open walks to try: two cards, each its own box.
    '06-acme.md': phaseFile({ acceptance: '- [x] A: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens Home.\n- [ ] ⚑ try: the owner: opens the backlog.' }),
  };
  const phases = Object.entries(files).map(([f, text]) => parsePhase(f, text));
  const data = { source: 'files', config: { repo: 'acme/studio' }, goals, phases, coverage: { complete: true, gaps: [] } };
  const board = await roadmapItems('/nowhere', { read: async () => data, readPhase: async f => files[f], today: '2026-11-21' });
  const lists = homeRoadmap({ id: 'studio', name: 'Studio', revision: 'abc' }, board, phases, p => p);
  const model = homeSnapshot([{ id: 'studio', name: 'Studio', repo: 'acme/studio', gaps: [], changes: [], state: 'complete', reviews: [], ...lists }], { sections: [], today: '2026-11-21' });
  assert.deepEqual(model.tryIt.map(t => [t.key, t.box]), [['studio:walk:6.2', 2], ['studio:walk:6.3', 3]]);
  assert.deepEqual(model.waiting.filter(w => w.phase === '5').map(w => [w.why, w.answers ?? []]), [['Ready when: phase 4 first', []]]);
  assert.equal(tryItReadiness(phases[1], { phases, raw: files['05-acme.md'] }).ready, false);
  // The writer: the same refusal, and a box named when several are open.
  const root = await checkout(Object.fromEntries(Object.entries(files).map(([f, t]) => [`docs/phases/${f}`, t]).concat([['docs/evidence/acme.md', '# Evidence\n']])));
  try {
    const env = { ...process.env, GIT_DIR: join(root, '.no-git') };
    await assert.rejects(walkDone({ root, phase: '5', tried: 'works', env, today: '2026-11-21' }), /not ready yet \(phase 4 first\)/);
    await assert.rejects(walkDone({ root, phase: '6', tried: 'works', env, today: '2026-11-21' }), /2 open walks to try: name one with --box 2\|3/);
    const r = await walkDone({ root, phase: '6', tried: 'works', box: '3', env, today: '2026-11-21' });
    assert.equal(r.data.box, 3);
    assert.match(await readFile(join(root, 'docs/phases/06-acme.md'), 'utf8'), /- \[ \] ⚑ try: the owner: opens Home\.\n- \[x\] ⚑ try: the owner: opens the backlog\./);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a Try it comes only from an open ⚑ try: box; a kept ⚑ by hand box still waits on the owner', async () => {
  const goals = [{ id: 'G0', title: 'Start', outcome: 'It starts.' }];
  const files = {
    // owes: walk with an open decision: the owner's turn, in the docket, with its Your part's choices.
    '05-acme.md': phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ by hand: the owner picks the Acme scheduler.' })
      .replace('## Proof', '## Your part\n\n- **Ask:** Pick the Acme scheduler.\n- **Choices:** Daily | Weekly\n- **Ready:** yes\n\n## Proof'),
    // Only a walk to try left (owes: walk or not): an optional Try it, never in the docket.
    '06-acme.md': phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: publishes from a phone and sees it land.' }),
    '07-acme.md': phaseFile({ status: 'partial', acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens Home.' }),
  };
  const phases = Object.entries(files).map(([f, raw]) => parsePhase(f, raw));
  const data = { source: 'files', config: { repo: 'acme/studio' }, goals, phases, coverage: { complete: true, gaps: [] } };
  const board = await roadmapItems('/nowhere', { read: async () => data, readPhase: async f => files[f], today: '2026-11-21' });
  const lists = homeRoadmap({ id: 'studio', name: 'Studio', revision: 'abc' }, board, phases, p => p);
  const model = homeSnapshot([{ id: 'studio', name: 'Studio', repo: 'acme/studio', gaps: [], changes: [], state: 'complete', reviews: [], ...lists }], { sections: [], today: '2026-11-21' });
  assert.deepEqual(model.docket.map(e => [e.key, e.kind]), [['studio:walk:5', 'walk']], 'the decision waits on the owner, in the docket');
  assert.deepEqual(model.walks.find(w => w.key === 'studio:walk:5').answers.map(a => a.label), ['Daily', 'Weekly', 'Not now'], 'with its choices, as before');
  assert.deepEqual(model.tryIt.map(t => t.key), ['studio:walk:6', 'studio:walk:7'], 'only the "⚑ try:" boxes are Try its');
  assert.ok(!model.docket.some(e => ['studio:walk:6', 'studio:walk:7'].includes(e.key)));
  // Push: the decision notifies; the Try its never do.
  assert.deepEqual(waitingEvents({ id: 'studio', walks: model.walks.map(w => ({ ...w, projectId: 'studio' })) }).map(e => e.id.split('\n')[0]), ['studio:phase:5:walk']);
});

test('Skip keeps every box where Home showed it, and an answer for a box that changed is refused', async () => {
  const three = phaseFile({ acceptance: '- [x] A: `tests/a.test.mjs`.\n- [ ] ⚑ try: the owner: opens Home.\n- [ ] ⚑ try: the owner: opens the backlog.\n- [ ] ⚑ try: the owner: opens Recurring.' });
  const goals = [{ id: 'G0', title: 'Start', outcome: 'It starts.' }], phases = [parsePhase('06-acme.md', three)];
  const board = await roadmapItems('/nowhere', { read: async () => ({ source: 'files', config: { repo: 'acme/studio' }, goals, phases, coverage: { complete: true, gaps: [] } }), readPhase: async () => three, today: '2026-11-21' });
  const lists = homeRoadmap({ id: 'studio', name: 'Studio', revision: 'abc' }, board, phases, p => p);
  const model = homeSnapshot([{ id: 'studio', name: 'Studio', repo: 'acme/studio', gaps: [], changes: [], state: 'complete', reviews: [], ...lists }], { sections: [], today: '2026-11-21' });
  const [, second, third] = model.tryIt;
  assert.deepEqual(model.tryIt.map(t => t.key), ['studio:walk:6.2', 'studio:walk:6.3', 'studio:walk:6.4']);
  const root = await checkout({ 'docs/phases/06-acme.md': three, 'docs/evidence/acme.md': '# Evidence\n' });
  try {
    const env = { ...process.env, GIT_DIR: join(root, '.no-git') };
    // Skip the middle one: checked and said to be skipped, never taken away; the boxes after it keep their numbers.
    await walkDone({ root, phase: '6', tried: 'skip', box: String(second.box), boxDigest: second.boxDigest, env, today: '2026-11-21' });
    const after = await readFile(join(root, 'docs/phases/06-acme.md'), 'utf8');
    assert.match(after, /- \[ \] ⚑ try: the owner: opens Home\.\n- \[x\] ⚑ try: the owner: opens the backlog\. \(Skipped: trying it by hand is optional\.\)\n- \[ \] ⚑ try: the owner: opens Recurring\./);
    // The box Home showed as 6.4 is still box 4; once its text changes, an answer carrying the old digest is refused.
    await writeFile(join(root, 'docs/phases/06-acme.md'), after.replace('opens Recurring.', 'opens Recurring on a phone.'));
    await assert.rejects(walkDone({ root, phase: '6', tried: 'works', box: String(third.box), boxDigest: third.boxDigest, env, today: '2026-11-21' }), /changed since it was shown/);
    assert.match(await readFile(join(root, 'docs/phases/06-acme.md'), 'utf8'), /- \[ \] ⚑ try: the owner: opens Recurring on a phone\./, 'nothing written');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a Try it beside a guided walk keeps its plain answers on the web', () => {
  const item = { projectId: 'studio', itemKind: 'walk', kind: 'walk', ref: '6', tryIt: true, guided: true };
  const answers = answersFor(item, { form: 'web', decisionWrites: true });
  assert.deepEqual(answers.filter(a => !a.unavailable).map(a => a.id), ['works', 'skip'], 'the guided route takes no optional observation, so Works and Skip stay');
  // An ordinary walk with a guided walk still goes there.
  assert.ok(answersFor({ ...item, tryIt: false, details: { choices: ['Works', 'Needs changes'] } }, { form: 'web', decisionWrites: true }).filter(a => a.writer === 'walk done').every(a => /guided walk/.test(a.unavailable?.reason ?? '')));
});

test('plates home --project shows the plate\'s Try its and how to answer them', async () => {
  const { simpleProject } = await import('../lib/web/simple-project-model.mjs');
  const cli = snapshot({ form: 'cli' });
  const projectWorkspace = simpleProject({ ...cli, backlog: { lanes: [], claims: [] } }, 'studio');
  const text = homeText({ schema: 1, generatedAt: '2026-11-21T09:00:00.000Z', ...cli, projectWorkspace }, { projectId: 'studio' });
  assert.match(text, /Studio · phase 2: Acme 2\n[\s\S]*Works \| Something's off \| Skip\n {6}answer: plates home --answer studio:walk:2 <works\|off\*\|skip>/);
});
