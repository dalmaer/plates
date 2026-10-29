import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { captureContext, contextLines } from '../docs/examples/pi-context/src/context.mjs';
import { projectEvidence } from '../docs/examples/pi-context/src/evidence.mjs';
import { renderPage } from '../docs/examples/pi-context/src/render.mjs';
import { readEvidenceDirectory } from '../docs/examples/pi-context/src/read-evidence.mjs';
import { contextFixture, decisionFixture, evidenceFixture, fixtureInput } from '../docs/examples/pi-context/fixtures/acme.mjs';
import { bytesDigest } from '../lib/validation-evidence.mjs';
import extension from '../docs/examples/pi-context/extension.mjs';

test('capture uses supplied bytes and explicit wrapped prompt match, never scans disk', () => {
  const snapshot = contextFixture();
  assert.deepEqual(snapshot.instructions.map(i => i.status), ['captured', 'unknown']);
  assert.equal(snapshot.instructions[0].sha256, bytesDigest(Buffer.from(snapshot.instructions[0].content)));
  assert.match(snapshot.skills[0].status, /not verified loaded/);
  assert.equal(snapshot.demo, true);
  assert.equal(captureContext({}).instructions.length, 0);
  assert.match(captureContext({}).gaps.join(' '), /provenance unknown/);
});
test('opaque replacement and absent APIs cannot manufacture loaded-file knowledge', () => {
  const contextFiles = [{ path: '/acme/AGENTS.md', content: '' }, { path: '/acme/B.md', content: 'hello' }];
  const snapshot = captureContext({ getSystemPrompt: () => 'hello', getSystemPromptOptions: () => ({ contextFiles }) });
  assert.deepEqual(snapshot.instructions.map(i => i.status), ['unknown', 'unknown']);
  assert.equal(captureContext({ getSystemPromptOptions() { throw Error('stale context'); } }).instructions.length, 0);
  assert.equal(captureContext({ getSystemPromptOptions: () => ({ contextFiles: [null] }) }).instructions[0].status, 'unknown');
});
test('terminal output neutralizes control characters in API paths', () => {
  const snapshot = contextFixture(); snapshot.instructions[0].path = '\u001b[2J/acme\nFORGED PASS';
  assert.ok(contextLines(snapshot).every(line => !/[\x00-\x1f\x7f-\x9f]/.test(line)));
});
test('mixed result uses existing Plates validator: missing is unknown and explicit plan is not-run', () => {
  const report = projectEvidence(fixtureInput());
  assert.deepEqual(report.checks.map(c => c.status), ['passed', 'failed', 'unknown', 'not-run']);
  assert.equal(report.testedCommit, 'a'.repeat(40));
  assert.equal(report.reuseAuthorized, false);
  assert.equal(report.coverageComplete, false);
  assert.ok(report.findings.some(f => f.code === 'stage_missing'));
});
test('changed commit, tree, dirty state and command digest cannot inherit a reported pass', () => {
  for (const mutate of [f => f.expected.candidate.head = 'd'.repeat(40), f => f.expected.candidate.tree = 'd'.repeat(40),
    f => f.artifact.candidate.dirty = true, f => f.artifact.stages[0].commandDigest = 'd'.repeat(64)]) {
    const fixture = evidenceFixture(); mutate(fixture);
    const report = projectEvidence(fixtureInput(fixture));
    assert.equal(report.checks[0].status, 'unknown');
    assert.equal(report.reuseAuthorized, false);
  }
});
test('tampered, duplicate, incomplete, invalid or missing records never become passed', () => {
  const bytes = fixtureInput(); bytes.artifactBytes = Buffer.concat([bytes.artifactBytes, Buffer.from(' ')]);
  assert.equal(projectEvidence(bytes).testedCommit, null);
  for (const mutate of [f => f.artifact.stages.push(f.artifact.stages[0]), f => f.artifact.stages[0].completed = false,
    f => f.artifact.completed = false, f => f.artifact.status = null,
    f => f.artifact.stages[0].status = '0', f => f.artifact.stages[0].parentInvocationId = 'unrelated']) {
    const fixture = evidenceFixture(); mutate(fixture);
    assert.equal(projectEvidence(fixtureInput(fixture)).checks[0].status, 'unknown');
  }
  const absent = projectEvidence({ expected: evidenceFixture().expected });
  assert.ok(absent.checks.every(c => c.status === 'unknown'));
  assert.equal(absent.testedCommit, null);
});
test('source expiry and wrong provider attempt retain unknown evidence', () => {
  const fixture = fixtureInput(); fixture.source.expiresAt = '2026-10-01T00:00:00.000Z';
  assert.equal(projectEvidence(fixture).checks[0].status, 'unknown');
  fixture.source.attempt = 2;
  assert.equal(projectEvidence(fixture).coverageComplete, false);
});
test('decision-context reuses upstream immutable reader and preserves source digest', async () => {
  const decision = await decisionFixture();
  assert.equal(decision.state, 'complete');
  assert.equal(decision.revision, 'a'.repeat(40));
  assert.equal(decision.decisions.length, 1);
  assert.match(decision.digest, /^[a-f0-9]{64}$/);
  assert.ok(decision.sources.every(s => /^[a-f0-9]{64}$/.test(s.hash)));
});
test('HTML escapes all instruction content, includes exact identities and never reports gate acceptance', async () => {
  const context = contextFixture(); context.instructions[0].content = '</pre><script>alert(1)</script>';
  const html = renderPage([{ id: 'mixed', title: 'Acme', context, evidence: projectEvidence(fixtureInput()), decision: await decisionFixture() }]);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('a'.repeat(40)));
  assert.match(html, /SYNTHETIC ACME DEMO/);
  assert.match(html, /reuseAuthorized: false/);
});
test('UI scenario buttons and status filter actually switch visibility', async () => {
  const html = renderPage([{ id: 'mixed', title: 'Acme', context: contextFixture(), evidence: projectEvidence(fixtureInput()), decision: await decisionFixture() }]);
  const buttons = ['mixed', 'stale', 'missing'].map(view => ({ dataset: { view }, setAttribute(k,v) { this[k] = v; }, addEventListener(_, cb) { this.click = cb; } }));
  const scenarios = buttons.map(b => ({ dataset: { scenario: b.dataset.view }, hidden: false }));
  const rows = ['passed', 'failed', 'unknown', 'not-run'].map(status => ({ dataset: { status }, hidden: false }));
  const select = { value: 'all', closest: () => ({ querySelectorAll: () => rows }), addEventListener(_, cb) { this.change = cb; } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { document: { querySelectorAll: query => ({ '[data-view]': buttons, '[data-scenario]': scenarios, '.status-filter': [select] })[query] } });
  buttons[1].click(); assert.deepEqual(scenarios.map(s => s.hidden), [true, false, true]);
  assert.equal(buttons[1]['aria-pressed'], 'true');
  select.value = 'unknown'; select.change(); assert.deepEqual(rows.map(r => r.hidden), [true, true, false, true]);
  select.value = 'all'; select.change(); assert.ok(rows.every(r => !r.hidden));
});
test('extension registers explicit commands; no eager work and unavailable evidence remains unknown', async () => {
  const commands = new Map(); extension({ registerCommand: (name, command) => commands.set(name, command) });
  assert.equal(commands.size, 2);
  let widget, viewed;
  const ctx = { hasUI: true, getSystemPrompt: () => '', getSystemPromptOptions: () => ({ contextFiles: [] }),
    ui: { setWidget: (_, value) => { widget = value; }, select: async () => 'Evidence and assumptions', editor: async (_, value) => { viewed = value; } } };
  await commands.get('plates-inspect').handler('', ctx);
  assert.ok(widget.some(s => s.includes('EVIDENCE UNKNOWN')));
  assert.match(viewed, /evidence_unavailable/);
  await commands.get('plates-inspect-clear').handler('', ctx); assert.equal(widget, undefined);
});
test('evidence directory reads bounded exact files, rejects symlinks and malformed JSON', async t => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'acme-pi-evidence-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = fixtureInput();
  await writeFile(join(dir, 'expected.json'), JSON.stringify(input.expected));
  await writeFile(join(dir, 'source.json'), JSON.stringify(input.source));
  await writeFile(join(dir, 'artifact.json'), input.artifactBytes);
  assert.equal((await readEvidenceDirectory(dir)).checks[0].status, 'passed');
  await writeFile(join(dir, 'source.json'), '{"schema":1,"schema":2}');
  await assert.rejects(readEvidenceDirectory(dir), /duplicate_json_key/);
  await rm(join(dir, 'source.json')); await symlink('expected.json', join(dir, 'source.json'));
  await assert.rejects(readEvidenceDirectory(dir));
});
