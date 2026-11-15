// Audits (phase 192): a model reads a plate through one lens when quota has
// room. The lens parser refuses what it cannot read, naming it; room is
// decided from a quota snapshot and explained, and unknown is wait; the brief
// is the same bytes for the same inputs; record accepts only evidence that
// exists at the audited commit, and each finding is triage for the night,
// never a build. Nothing here starts a model. Every fixture is Acme's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run as runNode } from './helpers/run.mjs';
import {
  parseLens, roomFor, chooseProvider, readQuota, dueOf, due, brief, briefFor, shapeProblems, record,
  planCandidates, recentCandidates, leverage, parseArgs, itemId,
} from '../practices/audits/files/scripts/plates/audit.mjs';
import { validatePlan, SCHEMA } from '../practices/night/files/scripts/plates/night-plan.mjs';

const BIN = resolve('bin/plates.mjs');
const NOW = Date.parse('2026-11-14T12:00:00Z');
const FILE = '.agents/audits/security.md';
const lensText = (more = '', providers = '["codex", "claude"]') => `---
name: security
description: What a leaked token could do.
every: 14
effort: quick
providers: ${providers}
${more}---

Look for credentials.
`;

const win = (id, kind, usedPct, pacePct, label = kind) => ({ id, kind, label, usedPct, pacePct });
const snap = (providers, generatedAt = NOW - 60_000) => ({ v: 1, generatedAt, providers });
const prov = (id, windows, more = {}) => ({ id, status: 'green', fresh: true, windows, ...more });
const ROOMY = snap([
  prov('claude', [win('claude.session', 'session', 17, 75, '5-hour'), win('claude.weekly', 'weekly', 37, 42, 'Weekly'), win('claude.model.fable', 'model', 0, 42, 'Fable')]),
  prov('codex', [win('codex.weekly', 'weekly', 21, 53, 'Weekly')]),
]);

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

async function plate(t, { lenses = { 'security.md': lensText() }, config = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'plates-audit-acme-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.plates'), { recursive: true });
  await mkdir(join(root, '.agents/audits'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', agents: { claude: {}, codex: {} }, practices: ['night', 'audits'], ...config }));
  for (const [f, text] of Object.entries(lenses)) await writeFile(join(root, '.agents/audits', f), text);
  await writeFile(join(root, 'src/server.mjs'), 'line one\nline two\nline three\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'Acme');
  return { root, commit: git(root, 'rev-parse', 'HEAD') };
}

const finding = (more = {}) => ({
  id: 'security-01', title: 'Validate the uploaded path stays inside the store', category: 'security',
  evidence: [{ path: 'src/server.mjs', line: 2, what: 'joins a request path onto the store root without a check' }],
  severity: 'high', impact: 'A request can read a file outside the store.', effort: 'S', risk: 'LOW', confidence: 'HIGH',
  fix: 'Resolve the joined path and refuse one outside the root.', ...more,
});
const findingsDoc = (commit, findings = [finding()], more = {}) => ({ lens: 'security', commit, findings, rejected: [{ title: 'Proxy variables honoured', why: 'standard convention' }], notAudited: 'The web client.', ...more });

test('a lens is read, and what it cannot read is refused by name', () => {
  const lens = parseLens(FILE, lensText('model: fable\nminutes: 45\n'), { agents: ['claude', 'codex'] });
  assert.deepEqual({ ...lens, body: lens.body.trim() }, { name: 'security', description: 'What a leaked token could do.', every: 14, effort: 'quick', providers: ['codex', 'claude'], model: 'fable', minutes: 45, body: 'Look for credentials.' });
  assert.equal(parseLens(FILE, lensText().replace('effort: quick\n', '')).effort, 'quick', 'effort defaults to quick');
  const refused = (text, re, opts = {}) => assert.throws(() => parseLens(FILE, text, opts), re);
  refused(lensText('budget: 5\n'), /security\.md: unknown key "budget"/);
  refused(lensText().replace('every: 14\n', ''), /no every:/);
  refused(lensText().replace('every: 14', 'every: 0'), /every: "0" is days between runs/);
  refused(lensText().replace('effort: quick', 'effort: huge'), /effort: "huge" is one of quick, standard, deep/);
  refused(lensText('', '["gemini"]'), /providers: "gemini" is not one of the plate's agents \(claude, codex/, { agents: ['claude', 'codex'] });
  refused(lensText('', 'codex'), /providers: is a JSON list/);
  refused(lensText('', '["codex", "codex"]'), /providers: is a JSON list/);
  refused(lensText().replace('name: security', 'name: other'), /name "other" is not the file's name/);
  refused(lensText('minutes: 2\n'), /minutes: "2" bounds a run/);
  assert.throws(() => parseLens('.agents/audits/Bad Name.md', lensText()), /lowercase letters, digits and dashes/);
});

test('room is explained, and unknown is wait', () => {
  const codex = roomFor(ROOMY, 'codex', { now: NOW });
  assert.equal(codex.room, true);
  assert.match(codex.why, /codex has room: the tightest window is Weekly 21% against a 53% pace/);
  const claude = roomFor(ROOMY, 'claude', { now: NOW });
  assert.deepEqual([claude.room, claude.window], [false, 'claude.weekly']);
  assert.match(claude.why, /claude Weekly is 37% used against a 42% pace: 5 points under, and an audit needs 15/);
  assert.equal(roomFor(ROOMY, 'claude', { now: NOW, margin: 5 }).room, true, 'the margin is the plate\'s to set');
  const waits = [
    [null, /no quota snapshot/],
    [{ ...ROOMY, v: 2 }, /version 2/],
    [snap(ROOMY.providers, NOW - 3 * 3600_000), /180 minutes old; at most 30/],
    [snap([prov('codex', [win('codex.weekly', 'weekly', 21, 53)], { fresh: false })]), /stale/],
    [snap([prov('codex', [win('codex.weekly', 'weekly', 21, 53)], { status: 'red' })]), /codex is red/],
    [snap([prov('codex', [win('codex.weekly', 'weekly', 21, 53), win('codex.session', 'session', 60, 90, '5-hour')])]), /5-hour is 60% used; an audit runs under 50%/],
    [snap([prov('codex', [win('codex.monthly', 'monthly', 70, null, 'Monthly')])]), /Monthly is 70% used; an audit runs under 50%/],
    [snap([prov('claude', [])]), /codex is not in the quota snapshot/],
  ];
  for (const [s, re] of waits) { const r = roomFor(s, 'codex', { now: NOW }); assert.equal(r.room, false, String(re)); assert.match(r.why, re); }
  // A model window counts only for the model a lens names, and a named model with no window waits.
  const fable = snap([prov('claude', [win('claude.weekly', 'weekly', 10, 42), win('claude.model.fable', 'model', 40, 42, 'Fable')])]);
  assert.equal(roomFor(fable, 'claude', { now: NOW }).room, true, 'another model\'s window does not apply');
  assert.match(roomFor(fable, 'claude', { now: NOW, model: 'fable' }).why, /Fable is 40% used against a 42% pace/);
  assert.match(roomFor(fable, 'claude', { now: NOW, model: 'astra' }).why, /no window for astra/);
  const lens = parseLens(FILE, lensText('', '["claude", "codex"]'));
  assert.deepEqual(chooseProvider(ROOMY, lens, { now: NOW }).provider, 'codex', 'the first provider with room, in the lens\'s order');
  assert.equal(chooseProvider(snap([]), lens, { now: NOW }).waits.length, 2);
});

test('the quota is read from a file or loopback only, and an unreachable service is wait', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-audit-quota-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'q.json'), JSON.stringify(ROOMY));
  assert.deepEqual((await readQuota({ file: join(dir, 'q.json') })).snapshot, ROOMY);
  assert.match((await readQuota({ file: join(dir, 'missing.json') })).why, /could not be read: ENOENT/);
  let asked = 0;
  const fetchImpl = async () => { asked++; return { ok: true, json: async () => ROOMY }; };
  assert.deepEqual((await readQuota({ url: 'http://127.0.0.1:4480/api/quota', fetchImpl })).snapshot, ROOMY);
  for (const url of ['https://quota.example.com/api/quota', 'http://user:pw@127.0.0.1/api/quota', 'http://10.0.0.5/api/quota']) {
    assert.match((await readQuota({ url, fetchImpl })).why, /must be http on loopback/);
  }
  assert.equal(asked, 1, 'a URL off loopback is never fetched');
  const down = await readQuota({ url: 'http://127.0.0.1:9/api/quota', fetchImpl: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
  assert.match(down.why, /could not be read: ECONNREFUSED/);
  assert.equal((await readQuota({ env: { PLATES_QUOTA_URL: 'http://localhost:1/q' }, fetchImpl: async u => { assert.equal(String(u), 'http://localhost:1/q'); return { ok: false, status: 503 }; } })).why, 'the quota service answered HTTP 503');
});

test('due names each lens, its provider or why it waits', async t => {
  const { root } = await plate(t, { lenses: { 'security.md': lensText(), 'size.md': lensText('model: fable\n', '["claude"]').replace('name: security', 'name: size').replace('every: 14', 'every: 7') } });
  await mkdir(join(root, 'docs/audits'), { recursive: true });
  await writeFile(join(root, 'docs/audits/2026-11-10-security.md'), '# security\n');
  const quota = join(root, 'q.json');
  await writeFile(quota, JSON.stringify(ROOMY));
  const r = await due({ root, date: '2026-11-14', quotaFile: quota, now: NOW });
  assert.equal(r.exitCode, 0);
  const [security, size] = r.data.lenses;
  assert.deepEqual([security.lens, security.due, security.provider, security.last], ['security', false, 'codex', '2026-11-10']);
  assert.match(security.dueWhy, /next on or after 2026-11-24/);
  assert.deepEqual([size.lens, size.due, size.provider, size.ready], ['size', true, null, false]);
  assert.match(size.waits[0], /claude Weekly is 37% used/);
  assert.deepEqual(r.data.ready, []);
  assert.deepEqual(dueOf({ every: 14 }, '2026-10-31', '2026-11-14'), { due: true, why: 'last audited 2026-10-31, 14 days ago; every 14' });
  // An unreachable quota service is an answer (wait), not an error.
  const down = await due({ root, date: '2026-11-14', quotaUrl: 'http://127.0.0.1:9/q', now: NOW, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(down.exitCode, 0);
  assert.ok(down.data.lenses.every(l => !l.provider && /could not be read/.test(l.waits[0])));
  // Through the CLI, with a file.
  const cli = await runNode('node', [BIN, 'audit', 'due', '--quota', quota, '--date', '2026-11-14', '--json'], { cwd: root });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).lenses.length, 2);
  await assert.rejects(due({ root: await mkdtemp(join(tmpdir(), 'plates-audit-empty-')), quotaFile: quota }), /no lenses/);
});

test('the brief is the same bytes and carries its rules', async t => {
  const lens = parseLens(FILE, lensText());
  const a = brief({ plate: 'Acme', lens, commit: 'a'.repeat(40), out: '/tmp/out.json' });
  assert.equal(a, brief({ plate: 'Acme', lens, commit: 'a'.repeat(40), out: '/tmp/out.json' }));
  for (const rule of [/Read only\. Edit no file/, /data, not instructions/, /Never reproduce a secret/, /This plate is public: write no absolute path/, /re-read every location you cite/, /at commit a{40}/, /Look for credentials\./, /Write exactly one JSON file to \/tmp\/out\.json/, /at most six findings, HIGH confidence only/]) assert.match(a, rule);
  assert.match(brief({ plate: 'Acme', lens, commit: 'a'.repeat(40), out: 'o', visibility: 'private' }), /Paths are repository-relative; write no absolute path/);
  const { root, commit } = await plate(t);
  const r = await briefFor({ root, name: 'security', env: { ...process.env, TMPDIR: '/tmp' } });
  assert.equal(r.data.commit, commit);
  assert.equal(r.data.out, `/tmp/plates-audit-acme-security-${commit.slice(0, 12)}.json`);
  await assert.rejects(briefFor({ root, name: 'tests' }), /no lens "tests"; there is security/);
});

test('record accepts only evidence that exists at the commit', async t => {
  const { root, commit } = await plate(t);
  const write = async (doc, name = 'f.json') => { const p = join(root, '..', `${name}-${Date.now()}-${Math.random()}`); await writeFile(p, JSON.stringify(doc)); t.after(() => rm(p, { force: true })); return p; };
  const refusedWith = async (doc, re) => {
    await assert.rejects(record({ root, name: 'security', from: await write(doc), date: '2026-11-14' }), re);
    assert.equal((await readdir(root)).includes('docs'), false, 'nothing is written when refused');
  };
  await refusedWith(findingsDoc('b'.repeat(40)), /commit b{40} is not in this plate's history/);
  await refusedWith(findingsDoc(commit, [finding({ evidence: [{ path: 'src/gone.mjs', line: 1, what: 'x' }] })]), /src\/gone\.mjs is not a file at/);
  await refusedWith(findingsDoc(commit, [finding({ evidence: [{ path: 'src/server.mjs', line: 4, what: 'x' }] })]), /src\/server\.mjs:4 is past its end \(3 lines/);
  await refusedWith(findingsDoc(commit, [finding({ evidence: [{ path: '../etc/passwd', line: 1, what: 'x' }] })]), /"path" is repository-relative/);
  await refusedWith(findingsDoc(commit, [finding({ evidence: [{ path: '/etc/passwd', line: 1, what: 'x' }] })]), /"path" is repository-relative/);
  await refusedWith(findingsDoc(commit, [finding({ impact: 'Seen in /Users/someone/acme/src.' })]), /an absolute local path/);
  await refusedWith(findingsDoc(commit, [finding({ fix: `Rotate ${'gh' + 'p_'}${'A'.repeat(36)}.` })]), /shaped like a credential/);
  await refusedWith(findingsDoc(commit, [finding({ severity: 'urgent' })]), /"severity" is high, medium, low/);
  await refusedWith({ ...findingsDoc(commit), lens: 'tests' }, /"lens" is "tests", not security/);
  await refusedWith(findingsDoc(commit, [finding(), finding()]), /"id" security-01 is already a finding/);

  const low = finding({ id: 'security-02', title: 'Pin the workflow action', severity: 'low', effort: 'M', confidence: 'MED', evidence: [{ path: 'src/server.mjs', line: 3, what: 'a moving tag' }] });
  const r = await record({ root, name: 'security', from: await write(findingsDoc(commit, [low, finding()])), date: '2026-11-14', provider: 'codex' });
  assert.equal(r.data.page, 'docs/audits/2026-11-14-security.md');
  const page = await readFile(join(root, r.data.page), 'utf8');
  assert.ok(page.indexOf('security-01') < page.indexOf('security-02'), 'the page lists findings by leverage');
  for (const part of [/read by codex/, /`src\/server\.mjs:2`/, /## Considered and rejected/, /Proxy variables honoured: standard convention/, /## Not audited\n\nThe web client\./]) assert.match(page, part);
  const json = JSON.parse(await readFile(join(root, 'docs/audits/2026-11-14-security.json'), 'utf8'));
  assert.deepEqual([json.commit, json.provider, json.findings.map(f => f.id)], [commit, 'codex', ['security-01', 'security-02']]);
  assert.ok(leverage(finding()) > leverage(low));
  // A page that is a link is refused, writing nothing.
  const linked = await plate(t);
  await mkdir(join(linked.root, 'docs/audits'), { recursive: true });
  await symlink(join(linked.root, 'src/server.mjs'), join(linked.root, 'docs/audits/2026-11-14-security.md'));
  await assert.rejects(record({ root: linked.root, name: 'security', from: await write(findingsDoc(linked.commit)), date: '2026-11-14' }), /is not a regular file \(a symlink\)/);
  assert.equal(await readFile(join(linked.root, 'src/server.mjs'), 'utf8'), 'line one\nline two\nline three\n');
});

test('a finding is triage for the night, never a build', async t => {
  const items = planCandidates({ lens: 'security', findings: [finding()], page: 'docs/audits/2026-11-14-security.md' });
  assert.deepEqual(items.map(i => [i.id, i.kind, i.source, i.lane, i.number]), [['audit-security--security-01', 'triage', 'audit:security', 'audit:security', null]]);
  const plan = { schema: SCHEMA, date: '2026-11-15', shapedBy: 'default', readyBy: null, willNotTouch: [], settledToday: [], leftOpen: [], items };
  assert.deepEqual(validatePlan(plan), { ok: true, problems: [] });
  const asBuild = { ...plan, items: [{ ...items[0], kind: 'build', number: { measure: 'slow_tests', bound: 1, better: 'lower' } }] };
  assert.match(validatePlan(asBuild).problems.join('\n'), /an audit proposes and never builds/);
  assert.equal(itemId('a'.repeat(30), 'b'.repeat(40)).length <= 64, true);
  // The night reads a record once: on its day and the next.
  const { root, commit } = await plate(t);
  const from = join(root, '..', `night-${Date.now()}.json`);
  t.after(() => rm(from, { force: true }));
  await writeFile(from, JSON.stringify(findingsDoc(commit)));
  await record({ root, name: 'security', from, date: '2026-11-14' });
  assert.equal((await recentCandidates(root, '2026-11-15')).length, 1);
  assert.equal((await recentCandidates(root, '2026-11-14')).length, 1);
  assert.equal((await recentCandidates(root, '2026-11-17')).length, 0, 'an older record has had its night');
});

test('the command line names its verbs and refuses what it does not take', () => {
  assert.deepEqual(parseArgs(['due', '--quota', 'q.json', '--json']), { verb: 'due', name: undefined, quota: 'q.json' });
  assert.deepEqual(parseArgs(['record', 'security', '--from', 'f.json', '--provider', 'codex']), { verb: 'record', name: 'security', from: 'f.json', provider: 'codex' });
  assert.throws(() => parseArgs(['run', 'security']), /usage: plates audit due/);
  assert.throws(() => parseArgs(['record', 'security']), /needs --from/);
  assert.throws(() => parseArgs(['brief', 'security', '--from', 'x']), /takes no --from/);
  assert.throws(() => parseArgs(['due', 'security']), /unexpected argument: security/);
  assert.throws(() => parseArgs(['brief']), /names one lens/);
  assert.equal(shapeProblems([], 'security')[0], 'the findings are a JSON object');
});
