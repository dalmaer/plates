// Plates phase 204: trying the work by hand is an invitation, never a gate.
// An open walk is an optional Try it on Home in both forms (the CLI's
// plates home and the web's Home), answered Works, Something's off or Skip,
// outside the docket, its count and push notifications; a ⚑ step still waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeSnapshot, answersFor, roadmapItems, homeRoadmap, walkDone, tryItWritePlan, followUpIssueFor, WRITERS } from '../lib/work-items.mjs';
import { homeText } from '../lib/home.mjs';
import { renderGlance } from '../lib/web/views.mjs';
import { waitingEvents } from '../lib/web/push-notify.mjs';
import { parsePhase } from '../scripts/roadmap.mjs';

const walk = (ref, since, more = {}) => ({ id: `studio:phase:${ref}:walk`, projectId: 'studio', kind: 'walk', itemKind: 'walk', ref, phase: ref, since, ready: true, title: `phase ${ref}: Acme ${ref}`, details: null, ...more });
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
  assert.doesNotMatch(skip.writes[0][1], /On a phone/);
  assert.equal(parsePhase('05-acme.md', skip.writes[0][1]).status, 'built');
  // A walk that is the phase's only box is checked and marked skipped, since Acceptance needs a box.
  const lone = tryItWritePlan({ file: '05-acme.md', raw: phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [ ] ⚑ by hand: the owner.' }), evidenceText: ev, today: '2026-11-21', tried: 'skip' });
  assert.match(lone.writes[0][1], /^- \[x\] ⚑ by hand: the owner\. \(Skipped: trying it by hand is optional\.\)$/m);
  assert.equal(parsePhase('05-acme.md', lone.writes[0][1]).status, 'built');
  assert.throws(() => tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'off' }), /needs a note/);
  const off = tryItWritePlan({ file: '05-acme.md', raw, evidenceText: ev, today: '2026-11-21', tried: 'off', note: 'The button is grey.', followUp: 'https://github.com/acme/studio/issues/9' });
  assert.match(off.writes[1][1], /Tried it: something's off\. The button is grey\. Follow-up: https:\/\/github\.com\/acme\/studio\/issues\/9\./);
  // A partial phase whose last open box was the walk moves to built, owes dropped.
  const owed = phaseFile({ status: 'partial', extra: 'owes: walk\n', acceptance: '- [x] Publishes: `tests/a.test.mjs`.\n- [ ] ⚑ by hand: the owner.' });
  const moved = tryItWritePlan({ file: '05-acme.md', raw: owed, evidenceText: ev, today: '2026-11-21', tried: 'works' });
  assert.deepEqual([parsePhase('05-acme.md', moved.writes[0][1]).status, /owes:/.test(moved.writes[0][1])], ['built', false]);
  // A box that is not a by-hand walk is never a Try it.
  assert.throws(() => tryItWritePlan({ file: '05-acme.md', raw: phaseFile({ status: 'partial', acceptance: '- [ ] Runs: `npm test`.' }), evidenceText: ev, today: '2026-11-21', tried: 'works' }), /no open walk to try/);

  // The follow-up issue names the phase and carries the note.
  const issue = followUpIssueFor({ phase: 5, title: 'Acme publishes', note: 'The button is grey.', link: 'https://github.com/acme/studio/blob/main/docs/phases/05-acme.md' });
  assert.equal(issue.title, 'Something\'s off: phase 5 — Acme publishes');
  assert.match(issue.body, /> The button is grey\.\n\nPhase: https:\/\/github\.com\/acme\/studio\/blob\/main\/docs\/phases\/05-acme\.md/);

  // plates walk done --tried off in a checkout: the issue first, then the record; a failed issue writes nothing.
  const root = await mkdtemp(join(tmpdir(), 'plates-try-it-'));
  try {
    await mkdir(join(root, '.plates'));
    await mkdir(join(root, 'docs/phases'), { recursive: true });
    await mkdir(join(root, 'docs/evidence'));
    await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Studio', repo: 'acme/studio' }));
    await writeFile(join(root, 'docs/goals.json'), JSON.stringify([{ id: 'G0', title: 'Start', outcome: 'It starts.' }]));
    await writeFile(join(root, 'docs/phases/05-acme.md'), raw);
    await writeFile(join(root, 'docs/evidence/acme.md'), ev);
    const env = { ...process.env, GIT_DIR: join(root, '.no-git') };
    const preview = await walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, today: '2026-11-21', fileIssue: async () => assert.fail('no issue before --yes') });
    assert.equal(preview.exitCode, 3, 'opening an issue waits for --yes');
    await assert.rejects(walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21', fileIssue: async () => { throw new Error('gh: no network'); } }), /no network/);
    assert.equal(await readFile(join(root, 'docs/phases/05-acme.md'), 'utf8'), raw, 'nothing written');
    const filed = [];
    const r = await walkDone({ root, phase: '5', tried: 'off', note: 'Grey.', env, yes: true, today: '2026-11-21', fileIssue: async ({ repo, issue }) => { filed.push([repo, issue.title]); return 'https://github.com/acme/studio/issues/9'; } });
    assert.deepEqual(filed, [['acme/studio', 'Something\'s off: phase 5 — Acme publishes']]);
    assert.equal(r.data.followUp, 'https://github.com/acme/studio/issues/9');
    assert.match(await readFile(join(root, 'docs/evidence/acme.md'), 'utf8'), /Tried it: something's off\. Grey\. Follow-up: https:\/\/github\.com\/acme\/studio\/issues\/9\./);
  } finally { await rm(root, { recursive: true, force: true }); }
});
