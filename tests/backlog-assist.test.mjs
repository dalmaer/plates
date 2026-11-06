// Assists (plates phase 182): an agent's decision draft is a record beside the
// owner's question, never an answer, and it is withdrawn when its source
// moves. One Acme checkout on this disk; no network, no agent process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assistCommand, draftDecision, draftPreview, withDrafts, backlogWithDrafts, offeredAssists, evidenceLink, blobRevision, draftLine, assistDirs, ASSIST_WRITES, BUILT_ASSISTS } from '../lib/assist.mjs';
import { backlogText } from '../lib/home.mjs';
import { renderBacklog } from '../lib/web/backlog-views.mjs';
import { run } from './helpers/run.mjs';

const BIN = fileURLToPath(new URL('../bin/plates.mjs', import.meta.url));
const CHOICES = 'It held | It broke | Not yet (say why)';
const phase = (choices = CHOICES) => `---
status: partial
owes: walk
since: 2026-10-01
goal: G0
depends: []
note: "Acme."
evidence: ["evidence/acme-1.md"]
---

# Build the anvil

## Done when

The anvil lands.

## Scope

Small.

## Acceptance

- [x] Lands. \`tests/anvil.test.mjs\`
- [ ] ⚑ by hand: the owner drops it.

## Your part

- **Ask:** Drop the anvil once.
- **Why:** Only you can lift it.
- **Choices:** ${choices}
- **Takes:** About 5 minutes.

## Proof

A command.

## Deliberately open

Nothing yet.

## Next action

Drop it.
`;
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CONFIG = { name: 'Acme', repo: 'acme/app', practices: ['phases'], agents: { claude: {}, codex: {} } };
const FILE = 'docs/phases/01-anvil.md', KEY = 'app:phase:1';
const env = { PLATES_PROVIDER: 'claude' };

async function acme(t) {
  const dir = await mkdtemp(join(tmpdir(), 'plates-assist-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const w = async (p, text) => { await mkdir(dirname(join(dir, p)), { recursive: true }); await writeFile(join(dir, p), text); };
  await w('.plates/plates.json', JSON.stringify(CONFIG));
  await w('docs/goals.json', JSON.stringify([{ id: 'G0', title: 'Anvils', outcome: 'They land.' }]));
  await w('docs/evidence/acme-1.md', '# Evidence: phase 1\n');
  await w('tests/anvil.test.mjs', '// the anvil\n');
  await w(FILE, phase());
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  git(dir, 'add', '-A'); git(dir, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'acme');
  return dir;
}
/** The backlog as both forms read it: the phase's card in Yours, asking its question, with the walk's answers. */
const backlog = (choices = CHOICES.split(' | ')) => ({ schema: 1, generatedAt: '2026-11-06T09:00:00.000Z', lane: null, plates: [{ projectId: 'app', projectName: 'Acme', state: 'read', coverage: 'complete' }],
  lanes: [{ lane: 'yours', title: 'Yours', count: 1, items: [{ key: KEY, projectId: 'app', projectName: 'Acme', kind: 'phase', ref: '1', title: 'Build the anvil', why: ['Owes a walk'],
    question: { ask: 'Drop the anvil once.', choices, recommend: null }, answers: choices.map((c, i) => ({ id: `choice-${i + 1}`, label: c, writer: 'walk done' })),
    assists: [], children: ['app:walk:1'], source: { file: FILE, revision: null } }] }] });
const draft = { key: KEY, recommend: 'It held', why: 'the drop test passed on the tested revision', evidence: ['tests/anvil.test.mjs', 'https://github.com/acme/app/actions/runs/1'] };

test('assists never decide', async t => {
  const root = await acme(t);
  const before = { head: git(root, 'rev-parse', 'HEAD'), file: await readFile(join(root, FILE), 'utf8') };
  // The preview writes nothing at all: exit 3, no journal, no draft.
  const preview = await assistCommand({ root, ...draft }, { env });
  assert.equal(preview.exitCode, 3);
  assert.match(preview.text, /writes: a draft under the checkout's git dir; no answer, acceptance, status or evidence/);
  const dirs = await assistDirs(root);
  await assert.rejects(readdir(dirs.journal), { code: 'ENOENT' });
  // Kept: the journal and the draft under the git dir, and nothing in the source tree. No answer, box, status or evidence moved.
  const kept = await assistCommand({ root, ...draft, yes: true }, { env });
  assert.deepEqual([kept.exitCode, kept.data.state], [0, 'drafted']);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '', 'nothing in the working tree changed');
  assert.equal(git(root, 'rev-parse', 'HEAD'), before.head, 'nothing was committed');
  assert.equal(await readFile(join(root, FILE), 'utf8'), before.file, 'the phase file (its status, acceptance, Your part and evidence) is byte for byte as it was');
  assert.deepEqual(kept.data.effect.writes, [...ASSIST_WRITES]);
  // Under the git dir, and its backlog event (phase 184) in the ignored private store: metadata only, never the draft.
  assert.ok(ASSIST_WRITES.every(w => w.startsWith('git-dir:') || w === 'ignored:.plates/backlog-events'), 'an assist writes only under the git dir and its ignored event');
  assert.equal(kept.data.eventNote, undefined, 'its event was written');
  const events = await readdir(join(root, '.plates/backlog-events'));
  const event = JSON.parse(await readFile(join(root, '.plates/backlog-events', events.find(n => n.endsWith('.json'))), 'utf8'));
  assert.deepEqual([event.action, event.key, event.actor, event.outcome], ['assist', KEY, 'agent:claude', 'drafted']);
  assert.ok(!JSON.stringify(event).includes(draft.why) && !JSON.stringify(event).includes(draft.recommend), 'the event holds no draft words');
  assert.ok(dirs.journal.startsWith(join(root, '.git')) && dirs.drafts.startsWith(join(root, '.git')));
  // On the card it is the agent's, beside the person's Recommend: the question's recommend and every answer are unchanged.
  const shown = await backlogWithDrafts(root, backlog(), 'app');
  const card = shown.lanes[0].items[0], plain = backlog().lanes[0].items[0];
  assert.equal(card.question.recommend, null, 'a draft never becomes the Recommend');
  assert.deepEqual(card.answers, plain.answers, 'nor marks an answer recommended or chosen');
  assert.deepEqual(card.assists.map(a => [a.assist, a.agent, a.recommend]), [['decision-draft', 'claude', 'It held']]);
  // A recommendation must be one of the item's choices, with a reason and evidence; an item with no choices has nothing to draft.
  await assert.rejects(assistCommand({ root, ...draft, recommend: 'Ship it' }, { env }), /must be one of the item's choices: It held \| It broke \| Not yet \(say why\)/);
  await assert.rejects(assistCommand({ root, ...draft, evidence: [] }, { env }), /links its evidence/);
  await assert.rejects(assistCommand({ root, ...draft, evidence: ['tests/missing.test.mjs'] }, { env }), /tests\/missing\.test\.mjs is not in this checkout's HEAD/);
  await assert.rejects(assistCommand({ root, ...draft, evidence: ['http://example.com/x'] }, { env }), /neither an https link nor a path/);
  await assert.rejects(draftDecision({ root, projectId: 'app', itemKey: KEY, file: FILE, choices: [], agent: 'claude', ...draft, sourceRevision: 'a'.repeat(40), config: CONFIG }), /asks nothing with choices/);
  await assert.rejects(assistCommand({ root, ...draft, provider: 'gemini' }, { env }), /not one of this plate's agents/);
  // The policy: absent offers decision-draft only; a plate can switch it off; walk-prep and shape are not built.
  assert.deepEqual([offeredAssists({}), offeredAssists({ backlog: { assists: ['shape'] } }), BUILT_ASSISTS], [['decision-draft'], ['shape'], ['decision-draft']]);
  await assert.rejects(draftDecision({ root, projectId: 'app', itemKey: KEY, file: FILE, choices: ['It held'], agent: 'claude', ...draft, sourceRevision: 'a'.repeat(40), config: { ...CONFIG, backlog: { assists: [] } } }), /decision-draft is off/);
  // From the terminal: a preview exits 3, and the draft is never an answer there either.
  const cli = run(process.execPath, [BIN, 'home', '--assist', KEY, '--recommend', 'It broke', '--why', 'it cracked', '--evidence', 'docs/evidence/acme-1.md'], { cwd: root, env: { ...process.env, PLATES_GH: '/nonexistent', PLATES_PROVIDER: 'codex' } });
  assert.equal(cli.status, 3, cli.stderr);
  assert.match(cli.stdout, /Draft codex's recommendation on app:phase:1/);
  assert.equal(git(root, 'status', '--porcelain', '--untracked-files=all'), '');
});

test('a stale recommendation is withdrawn', async t => {
  const root = await acme(t);
  const kept = await assistCommand({ root, ...draft, yes: true }, { env });
  assert.equal(kept.data.effect.draft.sourceRevision, git(root, 'rev-parse', `HEAD:${FILE}`), 'the draft names the blob it read');
  assert.equal(blobRevision(await readFile(join(root, FILE))), kept.data.effect.draft.sourceRevision, 'the same id the hosted read gets from a tree');
  // While the source holds still, the card shows it with its evidence, attributed, in both forms.
  const now = await backlogWithDrafts(root, backlog(), 'app');
  const a = now.lanes[0].items[0].assists[0];
  assert.deepEqual(a.evidence, draft.evidence, 'it links its evidence');
  assert.deepEqual(now.withdrawn, []);
  assert.equal(draftLine(a), 'Agent recommends: It held, because the drop test passed on the tested revision (tests/anvil.test.mjs, https://github.com/acme/app/actions/runs/1) · claude');
  assert.ok(backlogText(now).includes(`       ${draftLine(a)}`));
  const html = renderBacklog(now);
  assert.match(html, /<span class="backlog-ref" data-backlog-assist>Agent recommends: <strong>It held<\/strong>, because the drop test passed on the tested revision \(tests\/anvil\.test\.mjs, <a href="https:\/\/github\.com\/acme\/app\/actions\/runs\/1"/);
  assert.match(html, / · claude<\/span>/);
  // Asked again, the same draft is not written again.
  assert.equal((await assistCommand({ root, ...draft, yes: true }, { env })).data.repeated, true);
  // The phase file moves (a commit to it): the draft is withdrawn, said why, and not shown.
  await writeFile(join(root, FILE), phase().replace('Drop it.', 'Drop it twice.'));
  git(root, 'add', '-A'); git(root, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-q', '-m', 'move');
  const moved = await backlogWithDrafts(root, backlog(), 'app');
  assert.deepEqual(moved.lanes[0].items[0].assists, []);
  assert.equal(moved.withdrawn.length, 1);
  assert.match(moved.withdrawn[0].why, new RegExp(`^docs/phases/01-anvil\\.md moved from ${kept.data.effect.draft.sourceRevision.slice(0, 7)} to [0-9a-f]{7}$`));
  assert.match(backlogText(moved), /claude's recommendation on app:phase:1 \(It held\) was withdrawn: docs\/phases\/01-anvil\.md moved from /);
  assert.doesNotMatch(backlogText(moved), /Agent recommends/);
  assert.match(renderBacklog(moved), /data-backlog-notes><li>claude&#39;s recommendation on app:phase:1 \(It held\) was withdrawn/);
  assert.doesNotMatch(renderBacklog(moved), /data-backlog-assist/);
  // A choice the question no longer offers withdraws it too, and so does a source whose revision cannot be read.
  const record = { assist: 'decision-draft', itemKey: KEY, agent: 'codex', recommend: 'It held', why: 'x', evidence: ['tests/anvil.test.mjs'], file: FILE, sourceRevision: 'b'.repeat(40) };
  assert.match(withDrafts(backlog(['It broke']), [record], () => 'b'.repeat(40)).withdrawn[0].why, /"It held" is no longer one of its choices/);
  assert.match(withDrafts(backlog(), [record], () => null).withdrawn[0].why, /revision could not be read/);
  // The digest covers the revision: the same words on a moved source are another draft.
  const base = { projectId: 'app', itemKey: KEY, file: FILE, agent: 'claude', recommend: 'It held', why: 'x', evidence: ['tests/anvil.test.mjs'] };
  assert.notEqual(draftPreview({ ...base, sourceRevision: 'a'.repeat(40) }).digest, draftPreview({ ...base, sourceRevision: 'b'.repeat(40) }).digest);
  assert.deepEqual([evidenceLink('docs/x.md:"name"', p => p === 'docs/x.md').link, evidenceLink('../x', () => true).why !== undefined], ['docs/x.md:"name"', true]);
});
