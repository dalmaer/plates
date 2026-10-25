import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, lstat, readdir, chmod, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { namesMachine, machineLaunchctl } from '../lib/names-machine.mjs';
import { nameRow } from '../lib/names.mjs';
import { run } from './helpers/run.mjs';

const ids = ['machine:~/.keel/night-card/run.sh', 'machine:~/Library/LaunchAgents/com.keel.night-card.plist', 'machine:~/.keel/tools/'];
const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
async function tree(path) {
  const rows = [];
  async function walk(at) { const s = await lstat(at); rows.push([at.slice(path.length), s.mode & 0o7777, s.isFile() ? (await readFile(at)).toString('base64') : null]); if (s.isDirectory()) for (const n of (await readdir(at)).sort()) await walk(join(at, n)); }
  await walk(path); return rows;
}
async function fixture(t, { loaded = true, shell = '/bin/sh', tools = true } = {}) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'plates-acme-machine '))); await chmod(home, 0o700);
  t.after(() => rm(home, { recursive: true, force: true }));
  const paths = ids.map(id => { const r = nameRow(id); return { from: join(home, r.keel.slice(2)), to: join(home, r.plates.slice(2)) }; });
  const oldLabel = basename(paths[1].from, '.plist'), newLabel = basename(paths[1].to, '.plist');
  for (const p of paths.slice(0, 2)) await mkdir(dirname(p.from), { recursive: true, mode: 0o700 });
  const script = '#!/bin/sh\nprintf "%s\\n" "$(dirname "$0")" > "$ACME_OUTPUT"\n# Acme owner comment kept byte-for-byte\n';
  await writeFile(paths[0].from, script, { mode: 0o755 });
  const args = shell ? [shell, paths[0].from] : [paths[0].from];
  const unrelated = '\n  <!-- Acme unrelated schedule & owner comment -->\n  <key>RunAtLoad</key><true/>\n  <key>StartInterval</key><integer>600</integer>\n  <key>EnvironmentVariables</key><dict><key>ACME_NOTE</key><string>keep &amp; preserve</string></dict>\n';
  const plist = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>'+oldLabel+'</string>\n<key>ProgramArguments</key><array>'+args.map(a => '<string>'+xml(a)+'</string>').join('')+'</array>'+unrelated+'</dict></plist>\n';
  await writeFile(paths[1].from, plist, { mode: 0o644 });
  if (tools) { await mkdir(join(paths[2].from, 'nested'), { recursive: true, mode: 0o755 }); await writeFile(join(paths[2].from, 'nested', 'acme-tool'), 'Acme opaque tool bytes; do not execute or rewrite\n', { mode: 0o755 }); }
  const untouched = join(home, 'owner.txt'); await writeFile(untouched, 'Acme unrelated bytes\n');
  const calls = [], state = { old: loaded ? 'loaded' : 'unloaded', next: 'unloaded', stopFails: false, stopLies: false, ambiguous: false, inspectUnknown: false, beforeStop: null };
  const launchctl = async r => {
    calls.push({ ...r }); const key = r.label === oldLabel ? 'old' : 'next';
    if (r.action === 'inspect') return { state: state.inspectUnknown ? 'unknown' : state[key], matches: true };
    if (r.action === 'stop') { if (state.beforeStop) await state.beforeStop(); if (state.stopFails) return { ok: false }; if (!state.stopLies) state.old = 'unloaded'; return { ok: true }; }
    assert.equal(r.action, 'start'); assert.equal(state.old, 'unloaded', 'old service must be proven unloaded before new start');
    state.next = 'loaded'; if (state.ambiguous) throw new Error('Acme lost bootstrap response');
    return { ok: true };
  };
  const options = { home, env: { HOME: home }, uid: process.getuid(), root: home, launchctl, worktrees: async () => [join(home, 'other', 'keel'), join(home, 'other', 'acme')] };
  return { home, paths, oldLabel, newLabel, script, plist, unrelated, calls, state, options, untouched };
}
async function approved(f) { const preview = await namesMachine(f.options); assert.equal(preview.exitCode, 3, JSON.stringify(preview)); return { ...f.options, yes: true, digest: preview.data.digest }; }

test('machine preview binds exact bytes and modes without writing or executing', async t => {
  const f = await fixture(t), before = await tree(f.home);
  const a = await namesMachine(f.options), b = await namesMachine(f.options);
  assert.equal(a.exitCode, 3); assert.equal(a.data.digest, b.data.digest); assert.equal(a.data.actions.length, 3);
  assert.deepEqual(await tree(f.home), before); assert.ok(f.calls.every(c => c.action === 'inspect'));
  for (const p of f.paths) { assert.ok(a.text.includes(JSON.stringify(resolve(p.from)))); assert.ok(a.text.includes(JSON.stringify(resolve(p.to)))); }
  assert.ok(a.text.includes(f.oldLabel)); assert.ok(a.text.includes(f.newLabel)); assert.ok(a.text.includes(JSON.stringify(join(f.home, 'other', 'keel'))));
  assert.match(a.text, /Stop and confirm/); assert.match(a.text, /inventory only/);
  assert.deepEqual(a.data.worktrees, [join(f.home, 'other', 'keel')]); assert.equal(a.data.worktreeAction, 'inventory-only');
  assert.ok(!JSON.stringify(a).includes(f.script)); assert.ok(!JSON.stringify(a).includes('opaque tool bytes'));
});

test('the night card moves and still runs; unrelated plist fields and opaque tools survive', async t => {
  const f = await fixture(t), toolBefore = await tree(f.paths[2].from), approval = await approved(f);
  const done = await namesMachine(approval); assert.equal(done.exitCode, 0, JSON.stringify(done));
  assert.equal(await readFile(f.paths[0].to, 'utf8'), f.script);
  const after = await readFile(f.paths[1].to, 'utf8');
  assert.equal(after, f.plist.replace('<string>'+f.oldLabel+'</string>', '<string>'+f.newLabel+'</string>').replace('<string>'+xml(f.paths[0].from)+'</string>', '<string>'+xml(f.paths[0].to)+'</string>'));
  assert.ok(after.includes(f.unrelated)); assert.deepEqual(await tree(f.paths[2].to), toolBefore);
  for (const p of f.paths) await assert.rejects(lstat(p.from), { code: 'ENOENT' });
  assert.equal((await lstat(f.paths[0].to)).mode & 0o777, 0o755); assert.equal((await lstat(f.paths[1].to)).mode & 0o777, 0o644);
  assert.equal(await readFile(f.untouched, 'utf8'), 'Acme unrelated bytes\n');
  const output = join(f.home, 'executed'); const r = run('/bin/sh', [f.paths[0].to], { env: { ...process.env, HOME: f.home, ACME_OUTPUT: output } });
  assert.equal(r.status, 0, r.stderr); assert.equal(await readFile(output, 'utf8'), dirname(f.paths[0].to)+'\n');
  assert.deepEqual(f.calls.filter(c => c.action !== 'inspect').map(c => c.action), ['stop', 'start']);
  const recovered = await namesMachine({ ...f.options, recover: done.data.operation }); assert.equal(recovered.exitCode, 0);
  const again = await namesMachine(approval); assert.equal(again.exitCode, 0); assert.equal(f.calls.filter(c => c.action === 'start').length, 1);
});

test('initially unloaded job is moved without loading or starting it', async t => {
  const f = await fixture(t, { loaded: false, shell: null, tools: false });
  const done = await namesMachine(await approved(f)); assert.equal(done.exitCode, 0, JSON.stringify(done));
  assert.equal(done.data.originalState, 'unloaded'); assert.equal(done.data.newJob, 'unloaded'); assert.ok(f.calls.every(c => c.action === 'inspect'));
});

for (const shell of ['/bin/bash', '/bin/zsh']) test(`exact ${shell} invocation is supported without shell evaluation`, async t => {
  const f = await fixture(t, { shell }); assert.equal((await namesMachine(await approved(f))).exitCode, 0);
});

for (const kind of ['script', 'plist', 'tools', 'mode']) test(`changed ${kind} invalidates approval before stop`, async t => {
  const f = await fixture(t), approval = await approved(f);
  if (kind === 'mode') await chmod(f.paths[0].from, 0o700);
  else { const path = kind === 'script' ? f.paths[0].from : kind === 'plist' ? f.paths[1].from : join(f.paths[2].from, 'nested', 'acme-tool'); await writeFile(path, (await readFile(path))+'\n'); }
  const after = await tree(f.home), r = await namesMachine(approval);
  assert.equal(r.exitCode, 1); assert.equal(r.data.reason, 'stale_approval'); assert.deepEqual(await tree(f.home), after); assert.ok(f.calls.every(c => c.action === 'inspect'));
});

for (const kind of ['destination', 'source-link', 'parent-link', 'unknown-mode', 'tools-link']) test(`unsafe ${kind} refuses without job changes`, async t => {
  const f = await fixture(t);
  if (kind === 'destination') { await mkdir(dirname(f.paths[0].to), { recursive: true }); await writeFile(f.paths[0].to, 'Acme collision'); }
  if (kind === 'source-link') { await unlink(f.paths[0].from); await symlink(f.untouched, f.paths[0].from); }
  if (kind === 'parent-link') await symlink(dirname(dirname(f.paths[0].from)), dirname(dirname(f.paths[0].to)));
  if (kind === 'unknown-mode') await chmod(f.paths[0].from, 0o777);
  if (kind === 'tools-link') await symlink(f.untouched, join(f.paths[2].from, 'unsafe'));
  const r = await namesMachine(f.options); assert.equal(r.exitCode, 1, JSON.stringify(r)); assert.ok(f.calls.every(c => c.action === 'inspect'));
});

for (const kind of ['embedded-script', 'wrong-label', 'command-shell', 'duplicate-label', 'program-key', 'malformed-xml', 'embedded-plist', 'external-doctype', 'wrong-encoding']) test(`unsupported ${kind} remains a blocker, never rewritten`, async t => {
  const f = await fixture(t);
  if (kind === 'embedded-script') await writeFile(f.paths[0].from, f.script+'\n# '+dirname(f.paths[0].from));
  else {
    let content = f.plist;
    if (kind === 'wrong-label') content = content.replace(f.oldLabel, 'com.acme.other');
    if (kind === 'command-shell') content = content.replace('<string>/bin/sh</string>', '<string>/bin/sh</string><string>-c</string>');
    if (kind === 'duplicate-label') content = content.replace('<key>Label</key>', '<key>Label</key><string>Acme</string><key>Label</key>');
    if (kind === 'program-key') content = content.replace('<key>Label</key>', '<key>Program</key><string>/bin/sh</string><key>Label</key>');
    if (kind === 'malformed-xml') content = content.replace('</plist>', '');
    if (kind === 'external-doctype') content = content.replace('<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">', '<!DOCTYPE plist SYSTEM \"file:///Acme-unread\">');
    if (kind === 'wrong-encoding') content = content.replace('encoding=\"UTF-8\"', 'encoding=\"ISO-8859-1\"');
    if (kind === 'embedded-plist') content = content.replace('keep &amp; preserve', xml(dirname(f.paths[0].from)));
    await writeFile(f.paths[1].from, content);
  }
  const before = await tree(f.home), r = await namesMachine(f.options); assert.equal(r.exitCode, 1, JSON.stringify(r)); assert.deepEqual(await tree(f.home), before);
});

for (const kind of ['failure', 'still-loaded']) test(`stop ${kind} prevents all moves and new startup`, async t => {
  const f = await fixture(t), approval = await approved(f); f.state.stopFails = kind === 'failure'; f.state.stopLies = kind === 'still-loaded';
  const r = await namesMachine(approval); assert.equal(r.exitCode, 1); assert.ok(r.data.operation);
  assert.equal(await readFile(f.paths[0].from, 'utf8'), f.script); await assert.rejects(lstat(f.paths[0].to), { code: 'ENOENT' }); assert.ok(!f.calls.some(c => c.action === 'start'));
  const calls = f.calls.length; const recovered = await namesMachine({ ...f.options, recover: r.data.operation }); assert.equal(recovered.exitCode, 1); assert.ok(f.calls.slice(calls).every(c => c.action === 'inspect'));
});

test('ambiguous bootstrap retains original intent and recovery never duplicates dispatch', async t => {
  const f = await fixture(t), approval = await approved(f); f.state.ambiguous = true;
  const r = await namesMachine(approval); assert.equal(r.exitCode, 1); assert.equal(r.data.reason, 'bootstrap_uncertain');
  const journal = join(dirname(dirname(f.paths[0].to)), 'names-machine', `${r.data.operation}.json`);
  const before = await readFile(journal); assert.equal(JSON.parse(before).stage, 'start-attempted');
  const recovered = await namesMachine({ ...f.options, recover: r.data.operation }); assert.equal(recovered.exitCode, 0); assert.equal(recovered.data.state, 'observed-complete');
  f.state.next = 'unloaded'; const missing = await namesMachine(approval); assert.equal(missing.exitCode, 1); assert.equal(missing.data.operation, r.data.operation);
  assert.equal(f.calls.filter(c => c.action === 'start').length, 1); assert.deepEqual(await readFile(journal), before);
});

test('unknown job observations and existing new job never imply absence', async t => {
  const f = await fixture(t); f.state.inspectUnknown = true; assert.equal((await namesMachine(f.options)).exitCode, 1);
  f.state.inspectUnknown = false; f.state.next = 'loaded'; assert.equal((await namesMachine(f.options)).data.reason, 'job_collision');
  assert.ok(f.calls.every(c => c.action === 'inspect'));
});

test('source changes during stop refuse the move and retain original journal', async t => {
  const f = await fixture(t), approval = await approved(f); f.state.beforeStop = () => writeFile(f.paths[0].from, 'Acme owner changed');
  const r = await namesMachine(approval); assert.equal(r.data.reason, 'source_changed'); assert.ok(r.data.operation);
  assert.equal(await readFile(f.paths[0].from, 'utf8'), 'Acme owner changed'); assert.ok(!f.calls.some(c => c.action === 'start'));
});

test('invalid approval and recovery options do not touch launchctl', async t => {
  const f = await fixture(t);
  for (const extra of [{ yes: true }, { digest: 'a'.repeat(64) }, { yes: true, digest: 'a'.repeat(64), recover: 'b'.repeat(64) }, { recover: '../owner' }]) assert.equal((await namesMachine({ ...f.options, ...extra })).exitCode, 2);
  assert.equal(f.calls.length, 0);
});

test('default launchctl observation distinguishes confirmed absence, unreadable state and wrong loaded identity', async () => {
  const req = { action: 'inspect', domain: `gui/${process.getuid()}`, label: 'com.acme.night-card', plist: '/Acme home/job.plist', args: ['/bin/sh', '/Acme home/run.sh'] }, calls = [];
  let reply = { status: 113, stderr: 'Could not find service "com.acme.night-card" in domain for user gui', stdout: '' };
  const adapter = machineLaunchctl({}, async (file, args) => { calls.push({ file, args }); return reply; });
  assert.deepEqual(await adapter(req), { state: 'unloaded' });
  for (const status of [1, 5, 'EACCES', 'ETIMEDOUT']) { reply = { status, stderr: 'Permission denied', stdout: '' }; assert.deepEqual(await adapter(req), { state: 'unknown' }); }
  reply = { status: 0, stderr: '', stdout: '\tpath = /Acme home/job.plist\n\targuments = {\n\t\t/bin/sh\n\t\t/Acme home/run.sh\n\t}\n' };
  assert.deepEqual(await adapter(req), { state: 'loaded', matches: true });
  assert.deepEqual(await adapter({ ...req, args: ['/bin/sh', '/Acme other/run.sh'] }), { state: 'loaded', matches: false });
  await adapter({ ...req, action: 'stop' }); await adapter({ ...req, action: 'start' });
  assert.deepEqual(calls.at(-2).args, ['bootout', `${req.domain}/${req.label}`]);
  assert.deepEqual(calls.at(-1).args, ['bootstrap', req.domain, req.plist]);
});

test('changed destination after moves blocks startup rather than executing unapproved bytes', async t => {
  const f = await fixture(t), approval = await approved(f), adapter = f.options.launchctl;
  let changed = false;
  f.options.launchctl = async req => {
    if (!changed && req.action === 'inspect' && f.state.old === 'unloaded') {
      try { await lstat(f.paths[0].to); await writeFile(f.paths[0].to, 'Acme changed destination'); changed = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return adapter(req);
  };
  const r = await namesMachine({ ...approval, launchctl: f.options.launchctl });
  assert.equal(r.exitCode, 1); assert.equal(r.data.reason, 'destination_changed'); assert.ok(!f.calls.some(c => c.action === 'start'));
  assert.equal(await readFile(f.paths[0].to, 'utf8'), 'Acme changed destination');
});

test('late filesystem collision retains partial original operation without bootstrapping', async t => {
  const f = await fixture(t), approval = await approved(f);
  f.state.beforeStop = async () => { await mkdir(f.paths[2].to, { recursive: true }); await writeFile(join(f.paths[2].to, 'owner'), 'Acme new owner data'); };
  const r = await namesMachine(approval); assert.equal(r.exitCode, 1); assert.equal(r.data.reason, 'source_changed');
  const before = await tree(f.home); const recovery = await namesMachine({ ...f.options, recover: r.data.operation });
  assert.equal(recovery.exitCode, 1); assert.equal(recovery.data.state, 'recovery-required'); assert.deepEqual(await tree(f.home), before);
  assert.ok(!f.calls.some(c => c.action === 'start')); assert.equal(await readFile(join(f.paths[2].to, 'owner'), 'utf8'), 'Acme new owner data');
});

test('tool directory modes survive restrictive process umask', async t => {
  const f = await fixture(t), approval = await approved(f), expected = await tree(f.paths[2].from), mask = process.umask(0o077);
  try { const r = await namesMachine(approval); assert.equal(r.exitCode, 0, JSON.stringify(r)); assert.deepEqual(await tree(f.paths[2].to), expected); }
  finally { process.umask(mask); }
});

test('unsafe recovery read keeps its original operation identity and never repeats startup', async t => {
  const f = await fixture(t), approval = await approved(f); f.state.ambiguous = true;
  const attempted = await namesMachine(approval); await chmod(f.paths[0].to, 0o777);
  const recovered = await namesMachine({ ...f.options, recover: attempted.data.operation });
  assert.equal(recovered.exitCode, 1); assert.equal(recovered.data.operation, attempted.data.operation);
  assert.equal(f.calls.filter(c => c.action === 'start').length, 1);
});

test('credential-shaped tool entries refuse automatic inventory rather than inspecting their contents', async t => {
  const f = await fixture(t); await writeFile(join(f.paths[2].from, '.env'), 'Acme synthetic private fixture');
  const r = await namesMachine(f.options); assert.equal(r.exitCode, 1); assert.equal(r.data.reason, 'sensitive_tool_entry_manual_review');
  assert.ok(!JSON.stringify(r).includes('synthetic private fixture')); assert.equal(f.calls.length, 0);
});
