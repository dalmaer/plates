// Phase 193: local agents run in Rex when it is there. A host that names a
// harness runs it in a new, keep-open, unfocused Rex tab in the plate's
// `<plate>-<provider>` session when `rex` is on PATH and `rex ls --json`
// answers; otherwise the phase 183 start/state path runs unchanged.
//
// `rex` here is a stub on a temp PATH: it records every argv, cwd and
// environment it is given, answers fixed JSON, and for `run` executes the tab's
// command itself (the runner, then the harness stub) and keeps what the tab
// printed. The harness stub records its stdin, argv and environment. Every
// fixture is Acme's; no real Rex or agent is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, symlink, truncate, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as audit from '../practices/audits/files/scripts/plates/audit.mjs';
import * as attachLib from '../lib/attach.mjs';
import { attachJournal, cancelAttach, settleCancel, recoverCancels, rexBriefFile, attach, attachPreview, findRex, hostState, isHostSession, readLocalHost, rexLabel, rexState, startHost, localHostExecutions, REX_RECEIPT } from '../lib/attach.mjs';
import { auditRun, runsDir, runState } from '../lib/audit-run.mjs';
import { run as runChild } from './helpers/run.mjs';
const runNode = (args, opts) => runChild(process.execPath, args, opts);

const BRIEF = 'Phase 7: Build the anvil (acme)\nACME-BRIEF-MARKER-7f3e: only the harness may read this.\n';
const NOW = Date.parse('2026-11-15T12:00:00Z');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const SYSTEM_PATH = '/usr/bin:/bin'; // no rex here: the test's PATH is chosen, never the machine's

async function world(t, { rex = true, ls = 'ok', sessions = [], wait = null } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'plates-rex-acme-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const bin = join(base, 'bin'), checkout = join(base, 'acme'), logs = join(base, 'logs');
  await Promise.all([mkdir(bin), mkdir(checkout), mkdir(logs)]);
  const mode = join(logs, 'rex-mode.json');
  const setMode = m => writeFile(mode, JSON.stringify(m));
  await setMode({ ls, sessions, wait });
  if (rex) {
    await writeFile(join(bin, 'rex'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const logs = ${JSON.stringify(logs)}, args = process.argv.slice(2);
fs.appendFileSync(path.join(logs, 'rex-calls.jsonl'), JSON.stringify({ args, cwd: process.cwd(), env: process.env }) + '\\n');
const mode = JSON.parse(fs.readFileSync(path.join(logs, 'rex-mode.json'), 'utf8'));
const at = flag => args[args.indexOf(flag) + 1];
if (args[0] === 'ls') { if (mode.ls === 'fail') process.exit(1); if (mode.ls === 'garbage') { console.log('not json'); process.exit(0); } console.log(JSON.stringify(mode.sessions)); process.exit(0); }
if (args[0] === 'new') { console.log(JSON.stringify({ session_id: 'session:acme-new', initial_windows: [{ window_id: 'window:acme-1', block_ids: ['block:acme-shell'], revision: 1 }] })); process.exit(0); }
if (args[0] === 'run') {
  // A run that is slow to start: held until the test makes the file (the call is already logged above).
  if (mode.runHold) while (!fs.existsSync(mode.runHold)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  const i = args.indexOf('--');
  // The tab: the command with stdout and stderr together, as a terminal shows them,
  // and the tab's own input (what the owner types; a file stands in for the terminal) as its stdin.
  let out = '', status = 0;
  const input = path.join(logs, 'tab-input.txt'); fs.writeFileSync(input, 'TAB-INPUT: typed by the owner\\n');
  const fd = fs.openSync(input, 'r');
  try { out = execFileSync('/bin/sh', ['-c', 'exec "$@" 2>&1', 'sh', ...args.slice(i + 1)], { cwd: at('-c'), env: { ...process.env, REX_SESSION: at('-s'), REX_BLOCK: 'block:acme-tab-1' }, encoding: 'utf8', stdio: [fd, 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout ?? ''); status = e.status ?? 1; }
  fs.writeFileSync(path.join(logs, 'tab-output.txt'), out);
  fs.writeFileSync(path.join(logs, 'tab-exit'), String(status));
  // Rex 0.1.0-preview.18's shape.
  console.log(JSON.stringify({ window_id: 'window:acme-2', block_ids: ['block:acme-tab-1'], revision: 4 })); process.exit(0);
}
if (args[0] === 'block' && args[1] === 'close') {
  // A cancel closes only the block plates opened; it says whether the cancel was already journaled when the close came.
  const j = mode.journal; const recorded = !!j && fs.existsSync(j) && fs.readdirSync(j).some(n => n.endsWith('.cancel.json'));
  fs.appendFileSync(path.join(logs, 'closes.jsonl'), JSON.stringify({ args, recorded }) + '\\n');
  if (mode.close === 'gone') { process.stderr.write('Error: block target not found\\n'); process.exit(3); }
  // Another failure that happens to say "not found": nothing about the block.
  if (mode.close === 'lost') { process.stderr.write('Error: rex daemon socket not found\\n'); process.exit(1); }
  process.exit(mode.close === 'fail' ? 1 : 0);
}
if (args[0] === 'wait') { const w = mode.wait ?? {}; if (w.stdout) process.stdout.write(w.stdout); if (w.stderr) process.stderr.write(w.stderr); process.exit(w.code ?? 0); }
process.exit(64);
`, { mode: 0o755 });
  }
  const harness = join(base, 'harness.cjs');
  await writeFile(harness, `#!${process.execPath}
const fs = require('node:fs'); const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => { fs.writeFileSync(${JSON.stringify(join(logs, 'harness.json'))}, JSON.stringify({ stdin: Buffer.concat(chunks).toString(), argv: process.argv.slice(2), cwd: process.cwd(), env: process.env })); console.log('acme agent at work'); });
`, { mode: 0o755 });
  // An interactive agent (named as the claude TUI is): its first prompt is its last argument, and its
  // stdin is whatever the tab gives it. A prompt naming a private file is read while the agent runs.
  await mkdir(join(base, 'tui'));
  const tui = join(base, 'tui', 'claude');
  await writeFile(tui, `#!${process.execPath}
const fs = require('node:fs'); const chunks = [];
const argv = process.argv.slice(2), first = argv[argv.length - 1] ?? '';
const named = /private file (\\S+) \\./.exec(first)?.[1] ?? null;
const pointed = named && fs.existsSync(named) ? fs.readFileSync(named, 'utf8') : null;
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => { fs.writeFileSync(${JSON.stringify(join(logs, 'tui.json'))}, JSON.stringify({ stdin: Buffer.concat(chunks).toString(), argv, named, pointed, env: process.env })); console.log('acme tui at work'); });
`, { mode: 0o755 });
  const start = join(base, 'start.cjs');
  await writeFile(start, `#!${process.execPath}
const fs = require('node:fs'); const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => { fs.appendFileSync(${JSON.stringify(join(logs, 'start-runs.jsonl'))}, JSON.stringify({ argv: process.argv.slice(2), stdin: Buffer.concat(chunks).toString() }) + '\\n'); console.log('acme-session-1'); });
`, { mode: 0o755 });
  const state = join(base, 'state');
  const env = { PATH: `${bin}:${SYSTEM_PATH}`, HOME: base, TMPDIR: base, XDG_STATE_HOME: state, XDG_CONFIG_HOME: join(base, 'config'), GH_TOKEN: 'acme-not-a-token', PLATES_BRIEF_TEST: 'acme' };
  const lines = async f => existsSync(join(logs, f)) ? (await readFile(join(logs, f), 'utf8')).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  return {
    base, bin, checkout, logs, env, harness, tui, start, setMode,
    tuiRun: async () => existsSync(join(logs, 'tui.json')) ? JSON.parse(await readFile(join(logs, 'tui.json'), 'utf8')) : null,
    rexCalls: () => lines('rex-calls.jsonl'),
    closes: () => lines('closes.jsonl'),
    startRuns: () => lines('start-runs.jsonl'),
    harnessRun: async () => existsSync(join(logs, 'harness.json')) ? JSON.parse(await readFile(join(logs, 'harness.json'), 'utf8')) : null,
    tabOutput: async () => readFile(join(logs, 'tab-output.txt'), 'utf8').catch(() => ''),
    briefDir: join(state, 'plates', 'rex-briefs'),
  };
}

const RUN_FLAGS = ['--keep-open', '--focus=false', '--json'];
const runCalls = calls => calls.filter(c => c.args[0] === 'run');

test('without rex or a harness the local host runs as before', async t => {
  // No rex on PATH: the start command runs, nothing else is tried.
  const none = await world(t, { rex: false });
  assert.equal(await findRex({ env: none.env }), null);
  const host = { file: 'hosts.json', start: [none.start, 'start'], state: null, harness: [none.harness] };
  const a = await startHost({ host, plate: 'Acme', provider: 'claude', checkout: none.checkout, brief: BRIEF, tab: 'phase-7', env: none.env });
  assert.deepEqual([a.via, a.session, a.code], ['start', 'acme-session-1', 0]);
  assert.deepEqual((await none.startRuns()).map(r => [r.argv, r.stdin]), [[['start', none.checkout], BRIEF]]);
  assert.equal(await none.harnessRun(), null);
  // Rex present but `rex ls` failing (or answering no JSON): no Rex, silently; only ls was asked.
  for (const ls of ['fail', 'garbage']) {
    const w = await world(t, { ls });
    assert.equal(await findRex({ env: w.env }), null);
    const r = await startHost({ host: { ...host, start: [w.start, 'start'], harness: [w.harness] }, plate: 'Acme', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env: w.env });
    assert.equal(r.via, 'start');
    assert.deepEqual((await w.rexCalls()).map(c => c.args), [['ls', '--json'], ['ls', '--json']], 'findRex, then startHost\'s own detection: ls and nothing else');
    assert.equal((await w.startRuns()).length, 1);
  }
  // A host without a harness never asks Rex, even when Rex answers.
  const plain = await world(t);
  const p = await startHost({ host: { file: 'hosts.json', start: [plain.start, 'start'], state: null, harness: null }, plate: 'Acme', provider: 'claude', checkout: plain.checkout, brief: BRIEF, tab: 'phase-7', env: plain.env });
  assert.equal(p.via, 'start');
  assert.deepEqual(await plain.rexCalls(), []);
  // A harness-only host without Rex says why it cannot start, and starts nothing.
  await assert.rejects(startHost({ host: { file: 'hosts.json', start: null, state: null, harness: [none.harness] }, plate: 'Acme', provider: 'claude', checkout: none.checkout, brief: BRIEF, tab: 'phase-7', env: none.env }), /names only a harness, and Rex is not answering here.*nothing was started/);
  // Configuration: harness validated like start; a host may have either or both; phase 183's effect (and digest) is unchanged without a harness.
  const config = join(none.base, 'config', 'plates');
  await mkdir(config, { recursive: true });
  const read = async h => { await writeFile(join(config, 'local-hosts.json'), JSON.stringify({ hosts: { claude: h } })); return readLocalHost({ root: none.checkout, provider: 'claude', env: none.env }); };
  assert.deepEqual(await read({ start: ['/bin/acme-host'] }), { file: join(config, 'local-hosts.json'), start: ['/bin/acme-host'], state: null, harness: null });
  assert.deepEqual((await read({ harness: ['/bin/acme-agent', '-p'] })).harness, ['/bin/acme-agent', '-p']);
  for (const harness of [['relative/agent'], [], Array(17).fill('/bin/a'), ['/bin/a', 'x\u0000y'], '/bin/a']) await assert.rejects(read({ harness }), /harness, when present, is an argv array/);
  await assert.rejects(read({}), /start is an argv array whose first entry is an absolute path \(or name a harness\)/);
  await assert.rejects(read({ harness: ['/bin/a'], start: 'nope' }), /start is an argv array/);
  const plainPreview = attachPreview({ projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', phaseText: { doneWhen: 'x', acceptance: 'y', context: {} }, host: { file: 'f', start: ['/bin/acme-host'], state: null, harness: null } });
  assert.deepEqual(Object.keys(plainPreview.effect.host).sort(), ['config', 'start', 'state']);
});

test("a run opens a labelled tab in the plate's provider session", async t => {
  const w = await world(t);
  const host = { file: 'hosts.json', start: null, state: null, harness: [w.harness, '--print'] };
  assert.equal(rexLabel('Acme Anvils!', 'claude'), 'acme-anvils-claude');
  assert.equal(rexLabel('  --Acme__Anvils  ', 'Codex'), 'acme-anvils-codex');
  // No session with the label: plates creates it, then opens one tab in it.
  const first = await startHost({ host, plate: 'Acme Anvils!', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env: w.env });
  assert.equal(first.via, 'rex');
  assert.equal(first.session, 'rex:session:acme-new/block:acme-tab-1');
  assert.ok(REX_RECEIPT.test(first.session) && isHostSession(first.session) && isHostSession('acme-session-1') && !isHostSession('a/b'));
  assert.deepEqual(first.rex, { label: 'acme-anvils-claude', created: true, tab: 'phase-7' });
  const calls = await w.rexCalls();
  assert.deepEqual(calls.map(c => c.args.slice(0, 2)), [['ls', '--json'], ['new', 'acme-anvils-claude'], ['run', '-s']]);
  assert.deepEqual(calls[1].args, ['new', 'acme-anvils-claude', '-c', w.checkout, '--json']);
  const run = calls[2].args, dash = run.indexOf('--');
  assert.deepEqual(run.slice(0, dash), ['run', '-s', 'session:acme-new', '-c', w.checkout, '--label', 'phase-7', ...RUN_FLAGS]);
  assert.equal(run[dash + 1], process.execPath);
  assert.match(run[dash + 2], /\/lib\/rex-run\.mjs$/);
  assert.deepEqual(run.slice(dash + 4), ['--', w.harness, '--print']);
  assert.equal(await realpath(calls[2].cwd), w.checkout);
  // Every Rex call ran with hostEnv only.
  for (const c of calls) for (const k of ['GH_TOKEN', 'PLATES_BRIEF_TEST', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME']) assert.ok(!(k in c.env), `${k} never reaches rex`);
  // The session exists now: reused, a new tab each run, nothing created.
  await w.setMode({ ls: 'ok', sessions: [{ session_id: 'session:acme-new', label: 'acme-anvils-claude', block_ids: ['block:acme-tab-1'] }] });
  const second = await startHost({ host, plate: 'Acme Anvils!', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-8', env: w.env });
  assert.equal(second.rex.created, false);
  const later = (await w.rexCalls()).slice(3);
  assert.deepEqual(later.map(c => c.args[0]), ['ls', 'run']);
  assert.deepEqual(later[1].args.slice(0, 10), ['run', '-s', 'session:acme-new', '-c', w.checkout, '--label', 'phase-8', ...RUN_FLAGS]);
});

test('plates never drives a tab it did not open', async t => {
  const others = [
    { session_id: 'session:acme-owner', label: 'acme-anvils-claude-old', block_ids: ['block:owner-shell'] },
    { session_id: 'session:acme-plain', label: 'acme-anvils', block_ids: ['block:plain'] },
    { session_id: 'session:acme-upper', label: 'Acme-Anvils-Claude', block_ids: ['block:upper'] },
    { session_id: 'session:acme-codex', label: 'acme-anvils-codex', block_ids: ['block:codex'] },
  ];
  const host = { file: 'hosts.json', start: null, state: null, harness: [] };
  // Only similar labels: a new session is created; none of the others is named in any call.
  const w = await world(t, { sessions: others });
  await startHost({ host: { ...host, harness: [w.harness] }, plate: 'Acme Anvils', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env: w.env });
  // The exact label among them: that session gets one new tab; still nothing else is named.
  const v = await world(t, { sessions: [...others, { session_id: 'session:acme-exact', label: 'acme-anvils-claude', block_ids: ['block:someone-typing'] }] });
  await startHost({ host: { ...host, harness: [v.harness] }, plate: 'Acme Anvils', provider: 'claude', checkout: v.checkout, brief: BRIEF, tab: 'phase-7', env: v.env });
  assert.equal(runCalls(await v.rexCalls())[0].args[2], 'session:acme-exact');
  // State is read with wait only, on the tab plates opened.
  await rexState({ receipt: 'rex:session:acme-exact/block:acme-tab-1', env: v.env });
  for (const x of [w, v]) {
    const calls = await x.rexCalls();
    assert.ok(calls.every(c => ['ls', 'new', 'run', 'wait'].includes(c.args[0])), `only ls, new, run and wait: ${calls.map(c => c.args[0])}`);
    for (const c of calls) {
      for (const verb of ['send', 'send-key', 'close', 'rename', 'kill', 'resize']) assert.ok(!c.args.includes(verb), `never ${verb}`);
      const named = c.args.join(' ');
      for (const o of others) { assert.ok(!named.includes(o.session_id), `${o.session_id} is never named`); assert.ok(!named.includes(o.block_ids[0])); }
      assert.ok(!named.includes('block:someone-typing'), 'an existing tab in the reused session is never named');
    }
  }
  assert.deepEqual((await w.rexCalls()).map(c => c.args[0]), ['ls', 'new', 'run']);
  assert.deepEqual((await v.rexCalls()).map(c => c.args[0]), ['ls', 'run', 'wait']);
});

test('the brief reaches the harness only on stdin', async t => {
  const w = await world(t);
  const r = await startHost({ host: { file: 'hosts.json', start: null, state: null, harness: [w.harness, '--acme'] }, plate: 'Acme', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env: w.env });
  assert.equal(r.via, 'rex');
  const got = await w.harnessRun();
  assert.equal(got.stdin, BRIEF, 'byte for byte on stdin');
  assert.deepEqual(got.argv, ['--acme']);
  assert.equal(await realpath(got.cwd), w.checkout, 'the checkout is the working directory');
  // Never in argv or the environment of rex, the runner or the harness; never in what the tab printed.
  const marker = 'ACME-BRIEF-MARKER-7f3e';
  for (const c of await w.rexCalls()) { assert.ok(!JSON.stringify(c.args).includes(marker)); assert.ok(!JSON.stringify(c.env).includes(marker)); }
  assert.ok(!JSON.stringify(got.argv).includes(marker) && !JSON.stringify(got.env).includes(marker));
  for (const k of ['REX_SESSION', 'REX_BLOCK', 'GH_TOKEN', 'PLATES_BRIEF_TEST']) assert.ok(!(k in got.env), `${k} does not reach the harness`);
  const tab = await w.tabOutput();
  assert.ok(!tab.includes(marker) && !tab.includes('Build the anvil'), 'the tab never shows the brief');
  assert.match(tab, /^plates: running .*harness\.cjs --acme in .*, brief on stdin\n/);
  assert.match(tab, /acme agent at work/, "the harness's own output is the tab's");
  assert.equal((await readFile(join(w.logs, 'tab-exit'), 'utf8')), '0');
  // The brief file was private and is gone once the run started.
  assert.equal(statSync(w.briefDir).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(w.briefDir), []);
  // A rex run that fails leaves no brief behind either.
  const broken = await world(t);
  await writeFile(join(broken.bin, 'rex'), `#!${process.execPath}\nif (process.argv[2] === 'ls') { console.log('[]'); process.exit(0); }\nif (process.argv[2] === 'new') { console.log('{"session_id":"session:acme-new"}'); process.exit(0); }\nprocess.exit(5);\n`, { mode: 0o755 });
  await assert.rejects(startHost({ host: { file: 'hosts.json', start: null, state: null, harness: [broken.harness] }, plate: 'Acme', provider: 'claude', checkout: broken.checkout, brief: BRIEF, tab: 'phase-7', env: broken.env }), /rex run exited 5/);
  assert.deepEqual(await readdir(broken.briefDir), []);
});

test('an interactive agent keeps the tab as its input and gets the brief as its startup prompt', async t => {
  // The owner's report (2026-11-16): a claude or codex TUI in a Rex tab started at an empty prompt,
  // because the brief was piped on stdin, which a TUI does not read as its first prompt (and a pipe is not the tab).
  // The brief is private (decision context) and argv is visible to ps: at any size, the startup prompt
  // only names the brief's private file, which is there while the agent reads it and gone once the run ends.
  const marker = 'ACME-BRIEF-MARKER-7f3e';
  const long = `${BRIEF}${'The anvil is heavy. '.repeat(1200)}\n`;
  assert.ok(Buffer.byteLength(long) > 16 * 1024);
  for (const [brief, extra] of [[BRIEF, ['--model', 'acme']], [long, []]]) {
    const w = await world(t);
    const r = await startHost({ host: { file: 'hosts.json', start: null, state: null, harness: [w.tui, ...extra] }, plate: 'Acme', provider: 'claude', checkout: w.checkout, brief, tab: 'phase-7', env: w.env });
    assert.equal(r.via, 'rex');
    const run = runCalls(await w.rexCalls())[0].args, dash = run.indexOf('--');
    assert.deepEqual(run.slice(dash + 1, dash + 4).map((a, i) => i === 1 ? a.split('/').pop() : a), [process.execPath, 'rex-run.mjs', '--prompt=arg']);
    assert.deepEqual(run.slice(dash + 5), ['--', w.tui, ...extra], 'Rex is never given the brief');
    for (const c of await w.rexCalls()) assert.ok(!JSON.stringify(c.args).includes(marker));
    const got = await w.tuiRun();
    assert.ok(got, 'the agent ran');
    assert.equal(got.argv.length, extra.length + 1);
    assert.deepEqual(got.argv.slice(0, -1), extra);
    assert.ok(!got.argv.join('\n').includes(marker) && !got.argv.join('\n').includes('Build the anvil'), 'no brief bytes on its argv');
    assert.ok(Buffer.byteLength(got.argv.at(-1)) < 512, 'a short startup prompt');
    assert.equal(dirname(got.named), w.briefDir, 'it names a file in the private brief directory');
    assert.equal(got.pointed, brief, 'the file holds the brief, byte for byte, while the agent runs');
    assert.equal(got.stdin, 'TAB-INPUT: typed by the owner\n', "its stdin is the tab's own input, not a pipe from plates");
    for (const k of ['REX_SESSION', 'REX_BLOCK', 'GH_TOKEN', 'PLATES_BRIEF_TEST']) assert.ok(!(k in got.env), `${k} does not reach the agent`);
    const tab = await w.tabOutput();
    assert.ok(!tab.includes(marker), 'the tab never shows the brief');
    assert.match(tab, /^plates: running .*\/claude.* in .*, brief as its startup prompt \(a private file it is pointed to\)\n/);
    assert.match(tab, /acme tui at work/);
    assert.deepEqual(await readdir(w.briefDir), [], 'removed when the run ended');
  }
  const v = await world(t), w = v;
  await mkdir(v.briefDir, { recursive: true, mode: 0o700 });

  // Stopping the run (the tab closed, or SIGTERM) removes the file too, while the agent is still going.
  // The agent itself stops the runner once it is up, so the order is fixed: it sees the file, then the stop.
  const file = join(v.briefDir, 'acme-stop.brief'), seen = join(v.logs, 'slow.json');
  await writeFile(file, long, { mode: 0o600 });
  const slow = join(v.base, 'slow.cjs');
  await writeFile(slow, `#!${process.execPath}
const fs = require('node:fs');
process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ before, after: fs.existsSync(${JSON.stringify(file)}) })); process.exit(0); });
const before = fs.existsSync(${JSON.stringify(file)});
setInterval(() => {}, 1000);
process.kill(process.ppid, 'SIGTERM');
`, { mode: 0o755 });
  const stopped = runNode([join(import.meta.dirname, '..', 'lib', 'rex-run.mjs'), '--prompt=arg', file, '--', slow], { cwd: v.checkout, env: v.env, timeout: 20_000 });
  assert.equal(stopped.status, 0, "the runner exits with the agent's code");
  assert.deepEqual(JSON.parse(await readFile(seen, 'utf8')), { before: true, after: false }, 'kept while the agent runs; removed before the stop reaches it');
  assert.equal(existsSync(file), false, 'removed when the run is stopped');

  // How a harness takes its brief: the host may say; else a claude or codex TUI is "arg", their headless forms and anything else stdin.
  for (const [harness, prompt, want] of [[['/x/claude'], undefined, 'arg'], [['/x/claude', '-p'], undefined, 'stdin'], [['/x/claude', '--print', '--model', 'm'], undefined, 'stdin'],
    [['/x/codex'], undefined, 'arg'], [['/x/codex', '--full-auto'], undefined, 'arg'], [['/x/codex', 'exec', '-'], undefined, 'stdin'], [['/x/agent'], undefined, 'stdin'],
    // An option's value is never codex's subcommand.
    [['/x/codex', '--model', 'm', 'exec', '-'], undefined, 'stdin'], [['/x/codex', '-m', 'o3', '--full-auto', 'e'], undefined, 'stdin'], [['/x/codex', '--model=m', 'exec'], undefined, 'stdin'],
    [['/x/codex', '--model', 'exec'], undefined, 'arg'], [['/x/codex', '-c', 'k=v', '--', 'exec'], undefined, 'stdin'],
    [['/x/agent'], 'arg', 'arg'], [['/x/claude'], 'stdin', 'stdin']]) assert.equal(attachLib.harnessPrompt({ harness, prompt }), want, `${harness.join(' ')} ${prompt ?? ''}`);
  const config = join(w.base, 'config', 'plates');
  await mkdir(config, { recursive: true });
  const read = async h => { await writeFile(join(config, 'local-hosts.json'), JSON.stringify({ hosts: { claude: h } })); return readLocalHost({ root: w.checkout, provider: 'claude', env: w.env }); };
  assert.equal((await read({ harness: ['/bin/claude'] })).prompt, 'arg');
  assert.equal((await read({ harness: ['/bin/acme-agent'], prompt: 'arg' })).prompt, 'arg');
  assert.equal((await read({ harness: ['/bin/claude'], prompt: 'stdin' })).prompt, 'stdin');
  for (const h of [{ harness: ['/bin/claude'], prompt: 'argv' }, { harness: ['/bin/claude'], prompt: 1 }, { start: ['/bin/acme-host'], prompt: 'arg' }]) await assert.rejects(read(h), /prompt, when present, is "stdin" or "arg" and goes with a harness/);
  // The preview says which, and the effect carries it.
  const shown = attachPreview({ projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', phaseText: { doneWhen: 'x', acceptance: 'y', context: {} }, host: await read({ harness: ['/bin/claude'] }) });
  assert.equal(shown.effect.host.prompt, 'arg');
});

test('an attach dispatches the prompt mode its preview showed', async t => {
  // A host that says "prompt": "stdin" for a claude harness (whose default is "arg"): the preview says stdin, its digest
  // covers it, and the dispatch pipes the brief on stdin, never pointing the agent at a file.
  const w = await world(t, { sessions: [{ session_id: 'session:acme-anvils', label: 'acme-claude' }] });
  const store = new Map();
  const journal = { read: async d => store.get(d) ?? null, write: async (d, x) => { store.set(d, structuredClone(x)); }, list: async () => [] };
  const deps = { journal, env: w.env, claim: async () => ({ data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }), events: async () => null };
  const config = { name: 'Acme', agents: { claude: {} }, backlog: { routes: ['session', 'local-host'] } };
  const args = { root: w.checkout, projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', config, phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} }, host: { file: 'hosts.json', start: null, state: null, harness: [w.tui], prompt: 'stdin' } };
  const shown = await attach(args, deps);
  assert.equal(shown.data.effect.host.prompt, 'stdin');
  assert.match(shown.text, /claude, brief on stdin, in a new Rex tab/);
  const done = await attach({ ...args, yes: true }, deps);
  assert.equal(done.exitCode, 0, done.text);
  const run = runCalls(await w.rexCalls())[0].args;
  assert.ok(!run.includes('--prompt=arg'), 'dispatched as previewed: stdin');
  const got = await w.tuiRun();
  assert.equal(got.stdin, done.data.effect.brief.text, 'the previewed bytes, on stdin');
  assert.deepEqual(got.argv, [], 'no startup prompt');
  // And the other way: a host saying "arg" for a harness whose default is stdin.
  const v = await world(t, { sessions: [{ session_id: 'session:acme-anvils', label: 'acme-claude' }] });
  const store2 = new Map();
  const deps2 = { ...deps, env: v.env, journal: { read: async d => store2.get(d) ?? null, write: async (d, x) => { store2.set(d, structuredClone(x)); }, list: async () => [] } };
  const other = await attach({ ...args, root: v.checkout, host: { ...args.host, harness: [v.harness], prompt: 'arg' }, yes: true }, deps2);
  assert.equal(other.data.effect.host.prompt, 'arg');
  assert.ok(runCalls(await v.rexCalls())[0].args.includes('--prompt=arg'));
  assert.match((await v.harnessRun()).argv.at(-1), /^Your brief from plates is in the private file /);
});

test('a brief is never written inside the checkout or any git working tree', async t => {
  const w = await world(t);
  const host = { file: 'hosts.json', start: null, state: null, harness: [w.harness] };
  const other = join(w.base, 'acme-other-repo');
  await mkdir(other);
  execFileSync('git', ['init', '-q', other]);
  await symlink(other, join(w.base, 'acme-link'));
  for (const [state, where] of [[join(w.checkout, '.state'), /inside this checkout/], [join(other, 'state'), /inside the git working tree/], [join(w.base, 'acme-link', 'state'), /inside the git working tree/]]) {
    const env = { ...w.env, XDG_STATE_HOME: state };
    await assert.rejects(startHost({ host, plate: 'Acme', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env }), where);
    assert.equal(existsSync(join(state, 'plates', 'rex-briefs')), false, `nothing made under ${state}`);
  }
  assert.ok(!(await w.rexCalls()).some(c => c.args[0] === 'run'), 'no tab is opened');
});

test("state comes from the rex tab and the run's own artifact", async t => {
  const w = await world(t);
  const receipt = 'rex:session:acme-new/block:acme-tab-1';
  const at = async (wait, artifact = null) => { await w.setMode({ ls: 'ok', sessions: [], wait }); return rexState({ receipt, env: w.env, artifact }); };
  assert.equal(await at({ stdout: '{"exit_code":0}' }), 'finished');
  assert.equal(await at({ stdout: '{"exit_code":0}' }, async () => true), 'finished');
  assert.equal(await at({ stdout: '{"exit_code":0}' }, async () => false), 'failed', 'exit 0 without its artifact is failed');
  assert.equal(await at({ stdout: '{"exit_code":3}' }, async () => true), 'failed');
  // Rex 0.1.0-preview.18's own answers, captured from the real CLI.
  assert.equal(await at({ stderr: 'Error: wait timed out after 1s: context deadline exceeded\n', code: 1 }), 'running', 'a wait timeout is running');
  assert.equal(await at({ stdout: '{"exit_code":3,"error":"exit status 3"}\n', stderr: 'Error: exit status 3\n', code: 3 }, async () => true), 'failed');
  assert.equal(await at({ stderr: 'Error: block or window target "block:acme-tab-1" not found\n', code: 3 }), 'failed', 'a block Rex does not know is failed');
  assert.equal(await at({ stdout: '', code: 1 }), 'failed', 'an empty answer is failed');
  assert.equal(await at({ stdout: 'timed out', code: 1 }), 'failed', 'only a timeout Rex reports on stderr is running');
  const wait = (await w.rexCalls()).find(c => c.args[0] === 'wait');
  assert.deepEqual(wait.args, ['wait', '-s', 'session:acme-new', 'block:acme-tab-1', '--for', '1s', '--json']);
  // hostState reads a Rex receipt from Rex; no rex on PATH is unknown, not a state.
  await w.setMode({ ls: 'ok', sessions: [], wait: { stdout: '{"exit_code":0}' } });
  assert.equal(await hostState({ state: null, session: receipt, env: w.env }), 'finished');
  assert.equal(await hostState({ state: null, session: receipt, env: { ...w.env, PATH: SYSTEM_PATH } }), null);
  assert.ok(HOST_STATES_OK(await hostState({ state: null, session: receipt, env: w.env })));
  // The backlog's execution source reads a Rex receipt without a state command.
  const journal = { list: async () => [{ digest: 'd'.repeat(64), intent: { route: 'local-host' }, receipt: { route: 'local-host', result: { session: receipt } } }].map(x => ({ ...x, intent: { ...x.intent, effect: { phase: 7, provider: 'claude', host: { state: null } } } })) };
  assert.deepEqual(await localHostExecutions(w.checkout, { env: w.env, journal }), [{ phase: 7, state: 'finished', source: `local host claude, session ${receipt}` }]);
  // An audit run's receipt: exit 0 is finished only once findings.json is there.
  const root = join(w.base, 'acme-root'); await mkdir(root);
  const dir = join(runsDir({ root, env: w.env }), 'run-1'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'run.json'), JSON.stringify({ provider: 'codex', session: receipt, via: 'rex', state: 'dispatched' }));
  assert.equal(await runState({ root, run: 'run-1', env: w.env }), 'failed', 'exit 0 having written nothing');
  await writeFile(join(dir, 'findings.json'), '{}');
  assert.equal(await runState({ root, run: 'run-1', env: w.env }), 'finished');
  await w.setMode({ ls: 'ok', sessions: [], wait: { stderr: 'Error: wait timed out after 1s: context deadline exceeded\n', code: 1 } });
  assert.equal(await runState({ root, run: 'run-1', env: w.env }), 'running');
});
const HOST_STATES_OK = s => ['starting', 'running', 'waiting', 'finished', 'failed'].includes(s);

test('audit run and local-host attach use rex when configured', async t => {
  // plates audit run: a host with a harness and a start command runs the harness in Rex; start is not run.
  const w = await world(t);
  const root = join(w.base, 'acme-audit');
  await mkdir(join(root, '.plates'), { recursive: true });
  await mkdir(join(root, '.agents/audits'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', agents: { claude: {}, codex: {} }, practices: ['night', 'audits'] }));
  await writeFile(join(root, '.agents/audits/security.md'), '---\nname: security\ndescription: Acme\'s secrets.\nevery: 14\neffort: quick\nproviders: ["codex"]\nminutes: 20\n---\n\nLook for credentials.\n');
  git(root, 'init', '-q'); git(root, 'add', '-A'); git(root, '-c', 'user.name=Acme', '-c', 'user.email=a@acme.test', 'commit', '-qm', 'Acme');
  await mkdir(join(w.env.XDG_CONFIG_HOME, 'plates'), { recursive: true });
  await writeFile(join(w.env.XDG_CONFIG_HOME, 'plates/local-hosts.json'), JSON.stringify({ hosts: { codex: { start: [w.start, 'start'], harness: [w.harness] }, claude: { start: [w.start, 'start'], harness: [w.harness] } } }));
  const quota = join(w.base, 'quota.json');
  await writeFile(quota, JSON.stringify({ v: 1, generatedAt: NOW, providers: [{ id: 'codex', status: 'green', fresh: true, windows: [{ id: 'codex.weekly', kind: 'weekly', label: 'Weekly', usedPct: 21, pacePct: 53 }] }] }));
  const preview = await auditRun({ root, name: 'security', audit, quotaFile: quota, env: w.env, now: NOW, runId: 'run-1' });
  assert.match(preview.text, /runs in a Rex tab audit-security of session acme-codex when Rex answers, else the start command/);
  assert.deepEqual(await w.rexCalls(), [], 'a preview asks Rex nothing');
  const r = await auditRun({ root, name: 'security', audit, quotaFile: quota, env: w.env, now: NOW, runId: 'run-1', yes: true });
  assert.equal(r.exitCode, 0, r.text);
  assert.deepEqual([r.data.via, r.data.session], ['rex', 'rex:session:acme-new/block:acme-tab-1']);
  const dir = join(runsDir({ root, env: w.env }), 'run-1');
  const run = runCalls(await w.rexCalls())[0].args;
  assert.deepEqual(run.slice(0, 7), ['run', '-s', 'session:acme-new', '-c', join(dir, 'checkout'), '--label', 'audit-security']);
  assert.equal((await w.rexCalls()).find(c => c.args[0] === 'new').args[1], 'acme-codex');
  assert.match((await w.harnessRun()).stdin, /# Audit: security — Acme/);
  assert.deepEqual(await w.startRuns(), [], 'the start command is the fallback, not run');
  const receipt = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  assert.deepEqual([receipt.state, receipt.via, receipt.session, receipt.rex.label], ['dispatched', 'rex', 'rex:session:acme-new/block:acme-tab-1', 'acme-codex']);
  // Harness only, no Rex: refused before anything is made.
  await writeFile(join(w.env.XDG_CONFIG_HOME, 'plates/local-hosts.json'), JSON.stringify({ hosts: { codex: { harness: [w.harness] } } }));
  const noRex = { ...w.env, PATH: SYSTEM_PATH };
  await assert.rejects(auditRun({ root, name: 'security', audit, quotaFile: quota, env: noRex, now: NOW, runId: 'run-2', yes: true }), e => e.exitCode === 2 && /names only a harness, and Rex is not answering here.*Nothing was made/.test(e.message));
  assert.equal(existsSync(join(runsDir({ root, env: w.env }), 'run-2')), false);

  // plates home --attach, route local-host: the harness opens a tab phase-7 in the plate's provider session.
  const v = await world(t, { sessions: [{ session_id: 'session:acme-anvils', label: 'acme-anvils-claude' }] });
  const config = { name: 'Acme Anvils', agents: { claude: {} }, backlog: { routes: ['session', 'local-host'] } };
  const store = new Map();
  const journal = { read: async d => store.get(d) ?? null, write: async (d, x) => { store.set(d, structuredClone(x)); }, list: async () => [] };
  const deps = { journal, env: v.env, claim: async () => ({ data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }), events: async () => null };
  const args = { root: v.checkout, projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', config, phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} }, host: { file: 'hosts.json', start: [v.start, 'start'], state: null, harness: [v.harness] } };
  const shown = await attach(args, deps);
  assert.equal(shown.exitCode, 3);
  assert.deepEqual(shown.data.effect.host.rex, { label: 'acme-anvils-claude', tab: 'phase-7' });
  assert.match(shown.text, /harness: .*harness\.cjs, brief on stdin, in a new Rex tab phase-7 of session acme-anvils-claude when Rex answers/);
  const done = await attach({ ...args, yes: true }, deps);
  assert.equal(done.exitCode, 0, done.text);
  assert.equal(done.data.receipt.result.session, 'rex:session:acme-anvils/block:acme-tab-1');
  assert.equal(done.data.receipt.result.rex.created, false);
  assert.deepEqual(runCalls(await v.rexCalls())[0].args.slice(0, 7), ['run', '-s', 'session:acme-anvils', '-c', v.checkout, '--label', 'phase-7']);
  assert.equal((await v.harnessRun()).stdin, done.data.effect.brief.text, 'the previewed bytes, on stdin');
  assert.deepEqual(await v.startRuns(), []);
});

// ---- Cancel, safe across restarts (phases 181 and 193) -------------------------------
const RUNNING = { stderr: 'Error: wait timed out after 1s: context deadline exceeded\n', code: 1 };
async function attached(t, { sessions = [{ session_id: 'session:acme-anvils', label: 'acme-claude' }], handlers } = {}) {
  const w = await world(t, { sessions });
  const dir = join(w.base, 'journal');
  const config = { name: 'Acme', agents: { claude: {} }, backlog: { routes: ['session', 'local-host'] } };
  const claims = [];
  const deps = (extra = {}) => ({ journal: attachJournal(dir), env: w.env, claim: async a => { claims.push(a); return { data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }; }, events: async () => null, ...(handlers ? { handlers } : {}), ...extra });
  const args = { root: w.checkout, projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', config, phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} }, host: { file: 'hosts.json', start: null, state: null, harness: [w.harness] }, yes: true };
  await w.setMode({ ls: 'ok', sessions, wait: RUNNING, journal: dir });
  return { w, dir, deps, args, claims, cancel: (extra = {}, d = {}) => cancelAttach({ root: w.checkout, projectId: 'acme', phase: 7, yes: true, ...extra }, deps(d)) };
}

test('a cancel is journaled before any effect, closes the Rex tab plates opened and removes the brief', async t => {
  const a = await attached(t);
  const done = await attach(a.args, a.deps());
  assert.equal(done.exitCode, 0, done.text);
  const { digest } = done.data, receipt = done.data.receipt.result.session;
  // The brief file is named by the attach's digest and its path is in the receipt, so recovery can find it from the journal alone.
  assert.equal(done.data.receipt.result.briefFile, rexBriefFile(a.w.env, digest));
  assert.match(done.data.effect.brief.text, /If this session restarts or resumes, first run: plates home --cancel acme:phase:7 --check\. If it says cancelled \(exit 1\), stop/);
  // As a run that has not read its brief yet (or a runner killed before it removed it) would leave it.
  await writeFile(rexBriefFile(a.w.env, digest), BRIEF, { mode: 0o600 });
  const preview = await cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7 }, a.deps());
  assert.equal(preview.exitCode, 3);
  assert.deepEqual(await a.w.closes(), [], 'a preview stops nothing');
  assert.equal((await cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7, check: true }, a.deps())).exitCode, 0, 'and records nothing');
  const r = await a.cancel({ why: 'built elsewhere' });
  assert.equal(r.exitCode, 0, r.text);
  assert.deepEqual([r.data.state, r.data.already], ['cancelled', false]);
  const [m] = [/^rex:([^/]+)\/(.+)$/.exec(receipt)];
  assert.deepEqual(await a.w.closes(), [{ args: ['block', 'close', '-s', m[1], m[2]], recorded: true }], 'the one block plates opened is closed, after the cancel was journaled');
  assert.equal(existsSync(rexBriefFile(a.w.env, digest)), false, 'the brief file is gone');
  const effects = JSON.parse(await readFile(join(a.dir, `${digest}.cancelled.json`), 'utf8'));
  assert.deepEqual([effects.stop, effects.brief, effects.done], ['stopped', 'removed', true]);
  assert.equal(JSON.parse(await readFile(join(a.dir, `${digest}.json`), 'utf8')).cancelled, undefined, 'the entry itself is attach\'s alone');
  assert.equal(JSON.parse(await readFile(join(a.dir, `${digest}.cancel.json`), 'utf8')).why, 'built elsewhere');
  // A restarted session's check, and the backlog no longer shows the run.
  assert.equal((await cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7, check: true }, a.deps())).exitCode, 1);
  assert.deepEqual(await localHostExecutions(a.w.checkout, { env: a.w.env, journal: attachJournal(a.dir) }), []);
});

test('cancelling twice, two cancels at once, or a cancel racing a finish has one outcome', async t => {
  const a = await attached(t);
  await attach(a.args, a.deps());
  const [x, y] = await Promise.all([a.cancel({ why: 'one' }), a.cancel({ why: 'two' })]);
  assert.deepEqual([x.data.already, y.data.already].sort(), [false, true], 'one cancel is the first');
  assert.deepEqual(x.data.attaches[0].cancel, y.data.attaches[0].cancel, 'both see the same record');
  const third = await a.cancel({ why: 'three' });
  assert.deepEqual([third.data.already, third.data.attaches[0].cancel], [true, x.data.attaches[0].cancel]);
  assert.ok((await a.w.closes()).length <= 2 && (await a.w.closes()).every(c => c.recorded));
  assert.equal(JSON.parse(await readFile(join(a.dir, `${x.data.attaches[0].digest}.cancelled.json`), 'utf8')).done, true);
  // The run already finished when the cancel came: nothing is closed (its tab is left to read), and the cancel stands.
  const b = await attached(t);
  await attach(b.args, b.deps());
  await b.w.setMode({ ls: 'ok', sessions: [{ session_id: 'session:acme-anvils', label: 'acme-claude' }], wait: { stdout: '{"exit_code":0}' }, journal: b.dir });
  const r = await b.cancel();
  assert.deepEqual([r.data.attaches[0].cancelled.stop, r.data.attaches[0].cancelled.done], ['ended', true]);
  assert.deepEqual(await b.w.closes(), []);
  assert.equal((await attach(b.args, b.deps())).data.state, 'cancelled');
  // A dispatch that finishes after a cancel landed stops what it just started and reports the cancel.
  const c = await attached(t);
  let journalRef = null;
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const racing = { ...ROUTE_HANDLERS, 'local-host': { ...ROUTE_HANDLERS['local-host'], dispatch: async ctx => { const out = await ROUTE_HANDLERS['local-host'].dispatch(ctx); await journalRef.cancel(ctx.digest, { at: '2026-11-16T00:00:00.000Z', by: 'owner' }); return out; } } };
  const d = c.deps({ handlers: racing }); journalRef = d.journal;
  const late = await attach(c.args, d);
  assert.deepEqual([late.exitCode, late.data.state, late.data.cancelled.stop], [1, 'cancelled', 'stopped']);
  assert.equal((await c.w.closes()).length, 1);
});

test('cancel, restart, recover: no duplicate dispatch', async t => {
  const a = await attached(t);
  const done = await attach(a.args, a.deps());
  const { digest } = done.data;
  await writeFile(rexBriefFile(a.w.env, digest), BRIEF, { mode: 0o600 });
  // Rex is not answering when the owner cancels: the cancel is journaled; its effects wait.
  const noRex = await cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7, yes: true }, a.deps({ env: { ...a.w.env, PATH: SYSTEM_PATH } }));
  assert.equal(noRex.data.attaches[0].cancelled.stop, 'pending');
  assert.equal(noRex.data.attaches[0].cancelled.done, false);
  assert.equal(existsSync(rexBriefFile(a.w.env, digest)), false, 'the brief is removed at once all the same');
  assert.match(noRex.text, /1 not finished yet/);
  // plates restarts (a new journal reader on the same directory) and the owner runs the same attach again.
  const runsBefore = runCalls(await a.w.rexCalls()).length, claimsBefore = a.claims.length;
  const again = await attach(a.args, a.deps());
  assert.deepEqual([again.exitCode, again.data.state], [1, 'cancelled']);
  assert.equal(runCalls(await a.w.rexCalls()).length, runsBefore, 'no tab is opened again');
  assert.equal(a.claims.length, claimsBefore, 'nothing is claimed again');
  assert.equal((await a.w.closes()).length, 1, 'recovery closed the tab the receipt names');
  assert.equal(JSON.parse(await readFile(join(a.dir, `${digest}.cancelled.json`), 'utf8')).done, true);
  assert.equal((await attach(a.args, a.deps())).data.state, 'cancelled');
  assert.equal((await a.w.closes()).length, 1, 'a settled cancel is not acted on again');

  // plates was killed after journaling the intent, before the receipt: the brief, named by the digest, is still found and removed;
  // nothing is recovered or dispatched afterwards.
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const killed = { ...ROUTE_HANDLERS, 'local-host': { ...ROUTE_HANDLERS['local-host'], dispatch: async () => { throw new Error('killed'); } } };
  const b = await attached(t, { handlers: killed });
  await assert.rejects(attach(b.args, b.deps()), /killed/);
  const [entry] = await attachJournal(b.dir).list();
  assert.ok(entry.intent && !entry.receipt);
  await mkdir(dirname(rexBriefFile(b.w.env, entry.digest)), { recursive: true });
  await writeFile(rexBriefFile(b.w.env, entry.digest), BRIEF, { mode: 0o600 });
  const r = await b.cancel();
  assert.deepEqual([r.data.attaches[0].cancelled.stop, r.data.attaches[0].cancelled.brief], ['unknown', 'removed']);
  const recovered = await attach(b.args, { ...b.deps(), handlers: ROUTE_HANDLERS });
  assert.equal(recovered.data.state, 'cancelled', 'an uncertain dispatch that was cancelled is not recovered');
  assert.deepEqual(runCalls(await b.w.rexCalls()), [], 'and never dispatched');
});

test("a host's session is stopped through its stop command, or said to be its owner's to stop", async t => {
  const w = await world(t, { rex: false });
  const dir = join(w.base, 'journal');
  const stop = join(w.base, 'stop.cjs');
  await writeFile(stop, `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(join(w.logs, 'stops.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`, { mode: 0o755 });
  const config = { name: 'Acme', agents: { claude: {} }, backlog: { routes: ['session', 'local-host'] } };
  const host = { file: 'hosts.json', start: [w.start, 'start'], state: null, harness: null };
  const deps = readHost => ({ journal: attachJournal(dir), env: w.env, claim: async () => ({ data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }), events: async () => null, readHost });
  const args = { root: w.checkout, projectId: 'acme', phase: 7, title: 'Build the anvil', route: 'local-host', provider: 'claude', config, phaseText: { doneWhen: 'x', acceptance: 'y', context: {} }, host, yes: true };
  assert.equal((await attach(args, deps(() => assert.fail('no host read')))).data.receipt.result.session, 'acme-session-1');
  const none = await cancelAttach({ root: w.checkout, projectId: 'acme', phase: 7, yes: true }, deps(async () => ({ ...host })));
  assert.deepEqual([none.data.attaches[0].cancelled.stop, none.data.attaches[0].cancelled.done], ['not-stoppable', true]);
  assert.match(none.text, /has no stop command; stop session acme-session-1 yourself/);
  // With a stop command configured (read when cancelling, so it is never part of the attach's digest).
  const v = await world(t, { rex: false });
  const dir2 = join(v.base, 'journal');
  const deps2 = readHost => ({ ...deps(readHost), journal: attachJournal(dir2), env: v.env });
  await attach({ ...args, root: v.checkout, host: { ...host, start: [v.start, 'start'] } }, deps2(() => assert.fail('no host read')));
  const stopped = await cancelAttach({ root: v.checkout, projectId: 'acme', phase: 7, yes: true }, deps2(async () => ({ ...host, stop: [stop, 'stop'] })));
  assert.equal(stopped.data.attaches[0].cancelled.stop, 'stopped');
  assert.deepEqual((await readFile(join(w.logs, 'stops.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l)), [['stop', 'acme-session-1']]);
  // The stop command is validated like start.
  const cfg = join(w.base, 'config', 'plates');
  await mkdir(cfg, { recursive: true });
  await writeFile(join(cfg, 'local-hosts.json'), JSON.stringify({ hosts: { claude: { start: ['/bin/acme-host'], stop: 'nope' } } }));
  await assert.rejects(readLocalHost({ root: w.checkout, provider: 'claude', env: w.env }), /stop, when present, is an argv array/);
  await writeFile(join(cfg, 'local-hosts.json'), JSON.stringify({ hosts: { claude: { start: ['/bin/acme-host'], stop: ['/bin/acme-host', 'stop'] } } }));
  assert.deepEqual((await readLocalHost({ root: w.checkout, provider: 'claude', env: w.env })).stop, ['/bin/acme-host', 'stop']);
});

test('a cancel never takes an unknown Rex answer for an end', async t => {
  const sessions = [{ session_id: 'session:acme-anvils', label: 'acme-claude' }];
  // Rex answers something unrecognised (or a failed call): the run is not "ended"; the stop stays pending and nothing is closed.
  const a = await attached(t);
  await attach(a.args, a.deps());
  for (const wait of [{ stdout: '', code: 1 }, { stdout: 'garbage', code: 0 }, { stderr: 'Error: connection refused\n', code: 1 }]) {
    await a.w.setMode({ ls: 'ok', sessions, wait, journal: a.dir });
    const r = await a.cancel();
    assert.deepEqual([r.data.attaches[0].cancelled.stop, r.data.attaches[0].cancelled.done], ['pending', false], JSON.stringify(wait));
  }
  assert.deepEqual(await a.w.closes(), []);
  // Once Rex says it is running, recovery closes it.
  await a.w.setMode({ ls: 'ok', sessions, wait: RUNNING, journal: a.dir });
  assert.equal((await a.cancel()).data.attaches[0].cancelled.stop, 'stopped');
  assert.equal((await a.w.closes()).length, 1);
});

test('settling a cancel never overwrites a newer receipt, and stops the run it names', async t => {
  // A settle working from a stale snapshot (listed before the dispatch wrote its receipt) neither erases the receipt
  // nor misses the run it names.
  const b = await attached(t);
  const done = await attach(b.args, b.deps());
  const { digest } = done.data, journal = attachJournal(b.dir);
  const stale = { digest, intent: done.data.receipt && JSON.parse(await readFile(join(b.dir, `${digest}.json`), 'utf8')).intent };
  await journal.cancel(digest, { at: '2026-11-16T00:00:00.000Z', by: 'owner' });
  const settled = await settleCancel(stale, { journal, env: b.w.env, root: b.w.checkout });
  assert.equal(settled.stop, 'stopped', 'the fresh receipt names the block, and it is closed');
  assert.deepEqual(JSON.parse(await readFile(join(b.dir, `${digest}.json`), 'utf8')).receipt, done.data.receipt, 'the receipt is untouched');
  // A cancel settled as "unknown" before any receipt existed is settled again once a receipt names the run.
  const c = await attached(t);
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  let release; const gate = new Promise(r => { release = r; });
  let starting; const reached = new Promise(r => { starting = r; });
  // The cancel lands while `rex run` is starting: after the dispatch's last look for a cancel, before its receipt.
  const slow = { ...ROUTE_HANDLERS, 'local-host': { ...ROUTE_HANDLERS['local-host'], dispatch: async ctx => ROUTE_HANDLERS['local-host'].dispatch({ ...ctx, before: async () => { await ctx.before?.(); starting(); await gate; } }) } };
  const pending = attach(c.args, c.deps({ handlers: slow }));
  await reached;
  const early = await c.cancel();
  assert.equal(early.data.attaches[0].cancelled.stop, 'unknown', 'no receipt yet');
  release();
  const late = await pending;
  assert.deepEqual([late.data.state, late.data.cancelled.stop], ['cancelled', 'stopped'], 'the dispatch that finished after the cancel stopped its own run');
  assert.ok(JSON.parse(await readFile(join(c.dir, `${late.data.digest}.json`), 'utf8')).receipt, 'and its receipt stands');
  assert.deepEqual(await recoverCancels(attachJournal(c.dir), { env: c.w.env, root: c.w.checkout }), [], 'nothing left to settle');
});

test('a cancel record that cannot be read is never taken for not cancelled', async t => {
  // A cancel record that cannot be read: --check says cancelled (exit 1) and names it; attach refuses; the backlog shows nothing running.
  const d = await attached(t);
  const first = await attach(d.args, d.deps());
  await writeFile(join(d.dir, `${first.data.digest}.cancel.json`), '{ torn');
  const check = await cancelAttach({ root: d.w.checkout, projectId: 'acme', phase: 7, check: true }, d.deps());
  assert.equal(check.exitCode, 1);
  assert.match(check.text, /a cancel record that cannot be read \(.*\.cancel\.json: .*\); treat it as cancelled/);
  await assert.rejects(attach(d.args, d.deps()), e => e.exitCode === 1 && /cancel .* could not be read.*nothing is dispatched until it is/.test(e.message));
  assert.deepEqual(await localHostExecutions(d.w.checkout, { env: d.w.env, journal: attachJournal(d.dir) }), []);
});

test('a cancel is the phase\'s: an attach with a changed brief (another digest) finds it and stays cancelled', async t => {
  // The session route: before, a changed brief made a new digest and the phase was handed over again.
  const a = await attached(t);
  const session = { ...a.args, route: 'session', host: undefined, phaseText: undefined };
  assert.equal((await attach(session, a.deps())).exitCode, 0);
  await a.cancel();
  const claims = a.claims.length;
  const moved = await attach({ ...session, title: 'Build the anvil, again' }, a.deps());
  assert.deepEqual([moved.exitCode, moved.data.state], [1, 'cancelled']);
  assert.notEqual(moved.data.digest, moved.data.cancelledDigest, 'found across digests');
  assert.match(moved.text, /Phase 7 was cancelled at .*It stays cancelled; nothing is claimed or dispatched/);
  assert.doesNotMatch(moved.text, /\/spin 7/);
  assert.equal(a.claims.length, claims, 'nothing claimed');
  // The local-host route: a changed Done when is another digest; no tab is opened.
  const b = await attached(t);
  await attach(b.args, b.deps());
  await b.cancel();
  const runs = runCalls(await b.w.rexCalls()).length;
  const changed = await attach({ ...b.args, phaseText: { ...b.args.phaseText, doneWhen: 'The anvil lands softly.' } }, b.deps());
  assert.equal(changed.data.state, 'cancelled');
  assert.equal(runCalls(await b.w.rexCalls()).length, runs);
});

test('recovering an intent-only attach hands nothing over when a cancel lands during it', async t => {
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const a = await attached(t);
  const session = { ...a.args, route: 'session', host: undefined, phaseText: undefined };
  const killed = { ...ROUTE_HANDLERS, session: { ...ROUTE_HANDLERS.session, dispatch: async () => { throw new Error('killed'); } } };
  await assert.rejects(attach(session, a.deps({ handlers: killed })), /killed/);
  const journal = attachJournal(a.dir);
  const racing = { ...ROUTE_HANDLERS, session: { ...ROUTE_HANDLERS.session, recover: async ctx => { await journal.cancel(ctx.digest, { at: '2026-11-16T00:00:00.000Z', by: 'owner' }); return ROUTE_HANDLERS.session.recover(ctx); } } };
  const r = await attach(session, a.deps({ handlers: racing }));
  assert.deepEqual([r.exitCode, r.data.state], [1, 'cancelled']);
  assert.match(r.text, /Recovered, but the attach was cancelled at .*Nothing is handed over/);
  assert.doesNotMatch(r.text, /\/spin 7/);
});

test('a cancel settled before any receipt rechecks the brief file once a receipt names it', async t => {
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const killed = { ...ROUTE_HANDLERS, 'local-host': { ...ROUTE_HANDLERS['local-host'], dispatch: async () => { throw new Error('killed'); } } };
  const a = await attached(t, { handlers: killed });
  await assert.rejects(attach(a.args, a.deps()), /killed/);
  const journal = attachJournal(a.dir);
  const [entry] = await journal.list();
  const first = await a.cancel();
  assert.deepEqual([first.data.attaches[0].cancelled.stop, first.data.attaches[0].cancelled.brief], ['unknown', 'absent']);
  // The dispatching plates (with its own state directory) wrote its brief file and receipt after all.
  const other = join(a.w.base, 'other-state', 'plates', 'rex-briefs');
  await mkdir(other, { recursive: true });
  const briefFile = join(other, `${entry.digest}.brief`);
  await writeFile(briefFile, BRIEF, { mode: 0o600 });
  await journal.write(entry.digest, { intent: entry.intent, receipt: { route: 'local-host', at: '2026-11-16T00:00:01.000Z', claim: entry.intent.claim, result: { state: 'dispatched', session: 'rex:session:acme-anvils/block:acme-tab-1', briefFile } } });
  // A path the journal names that is not this digest's brief file is never removed.
  const decoy = join(a.w.base, 'decoy.brief');
  await writeFile(decoy, 'keep');
  const [settled] = await recoverCancels(journal, { env: a.w.env, root: a.w.checkout });
  assert.deepEqual([settled.cancelled.stop, settled.cancelled.brief, settled.cancelled.done], ['stopped', 'removed', true]);
  assert.equal(existsSync(briefFile), false, 'the brief file the receipt names is gone');
  assert.deepEqual(await recoverCancels(journal, { env: a.w.env, root: a.w.checkout }), [], 'then settled');
  await journal.write(entry.digest, { intent: entry.intent, receipt: { route: 'local-host', at: '2026-11-16T00:00:02.000Z', claim: entry.intent.claim, result: { state: 'dispatched', session: 'rex:session:acme-anvils/block:acme-tab-1', briefFile: decoy } } });
  await journal.settled(entry.digest, { at: 'x', stop: 'unknown', brief: 'absent', receipt: false, done: true });
  await recoverCancels(journal, { env: a.w.env, root: a.w.checkout });
  assert.equal(existsSync(decoy), true, 'a path that is not the digest\'s brief file is left alone');
});

test('a cancel that lands while a changed attach takes its claim is found before anything is handed over', async t => {
  // The phase has an attach; a session attach with a changed title (another digest) waits on its claim; the owner's
  // cancel completes meanwhile and records only the earlier digest. The second attach must not hand over a brief.
  const a = await attached(t);
  const session = { ...a.args, route: 'session', host: undefined, phaseText: undefined };
  assert.equal((await attach(session, a.deps())).exitCode, 0);
  const cancelled = [];
  const claim = async () => { cancelled.push(await a.cancel({ why: 'mid-claim' })); return { data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }; };
  const second = await attach({ ...session, title: 'Build the anvil, again' }, a.deps({ claim }));
  assert.equal(cancelled[0].data.attaches.length, 1, 'the cancel saw only the earlier attach');
  assert.deepEqual([second.exitCode, second.data.state], [1, 'cancelled']);
  assert.doesNotMatch(second.text, /\/spin 7/, 'no brief is handed over');
  assert.match(second.text, /cancelled at .*mid-claim.*while it was being claimed/);
  assert.equal((await cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7, check: true }, a.deps())).exitCode, 1);
  assert.equal((await attachJournal(a.dir).list()).length, 1, 'nothing was journaled for the second attach');

  // The same at the late boundary: the cancel lands during the dispatch of a changed attach whose intent the cancel did not see.
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const b = await attached(t);
  const s2 = { ...b.args, route: 'session', host: undefined, phaseText: undefined };
  assert.equal((await attach(s2, b.deps())).exitCode, 0);
  const journal = attachJournal(b.dir);
  const [earlier] = await journal.list();
  const racing = { ...ROUTE_HANDLERS, session: { ...ROUTE_HANDLERS.session, dispatch: async ctx => { await journal.cancel(earlier.digest, { at: '2026-11-16T00:00:00.000Z', by: 'owner' }); return ROUTE_HANDLERS.session.dispatch(ctx); } } };
  const late = await attach({ ...s2, title: 'Build the anvil, again' }, b.deps({ handlers: racing }));
  assert.deepEqual([late.exitCode, late.data.state], [1, 'cancelled']);
  assert.doesNotMatch(late.text, /\/spin 7/);
  assert.ok(await journal.cancelOf(late.data.digest), 'the cancel is recorded under the late attach too, for recovery and --check');
});

// ---- Cancel and dispatch race one decision; intents and receipts are create-only (phases 181 and 193) ----
const SESSIONS = [{ session_id: 'session:acme-anvils', label: 'acme-claude' }];
const check = a => cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 7, check: true }, a.deps());
/** A journal whose intent write is followed, once, by `land`: the first moment a cancel can see the attach. */
const afterIntent = (dir, land) => {
  const base = attachJournal(dir); let done = false;
  const once = async () => { if (!done) { done = true; await land(); } };
  return { ...base, write: async (d, v) => { await base.write(d, v); if (!v.receipt) await once(); }, ...(base.intent ? { intent: async (d, v) => { const r = await base.intent(d, v); await once(); return r; } } : {}) };
};
/** Until Rex has been asked to run `n` tabs. */
const untilRuns = async (w, n = 1) => { for (let i = 0; i < 500 && runCalls(await w.rexCalls()).length < n; i++) await new Promise(r => setTimeout(r, 10)); assert.equal(runCalls(await w.rexCalls()).length, n); };

test('a cancel recorded after the intent and before the run starts leaves the Rex run unstarted', async t => {
  const a = await attached(t);
  let cancelled = null;
  const steps = [], progress = async line => { steps.push(line.step); return null; };
  const r = await attach(a.args, a.deps({ progress, journal: afterIntent(a.dir, async () => { cancelled = await a.cancel({}, { progress }); }) }));
  assert.equal(cancelled.exitCode, 0, cancelled.text);
  assert.deepEqual(steps, ['cancelled'], 'the channel hears the cancel, and never "dispatched" for a run that did not start');
  assert.deepEqual(runCalls(await a.w.rexCalls()), [], 'no tab is opened for a cancelled attach');
  assert.equal(await a.w.harnessRun(), null, 'the harness never got the brief');
  assert.deepEqual([r.exitCode, r.data.state, r.data.cancelled.stop, r.data.cancelled.done], [1, 'cancelled', 'none', true]);
  assert.match(r.text, /before its run was started\. Nothing was dispatched/);
  assert.equal(existsSync(rexBriefFile(a.w.env, r.data.digest)), false, 'no brief file is left');
  assert.equal(JSON.parse(await readFile(join(a.dir, `${r.data.digest}.fate.json`), 'utf8')).fate, 'cancel', 'the cancel won the one decision');
  assert.equal((await attach(a.args, a.deps())).data.state, 'cancelled');
  assert.deepEqual(runCalls(await a.w.rexCalls()), []);
});

test('a cancel recorded after the intent leaves a start-command host unstarted', async t => {
  const a = await attached(t);
  const host = { file: 'hosts.json', start: [a.w.start, 'start'], state: null };
  const readHost = async () => ({ ...host }); // no stop command: a host started after the cancel could never be stopped
  const r = await attach({ ...a.args, host }, a.deps({ readHost, journal: afterIntent(a.dir, () => a.cancel({}, { readHost })) }));
  assert.deepEqual(await a.w.startRuns(), [], 'the host is not started after the cancel was recorded');
  assert.deepEqual([r.exitCode, r.data.state, r.data.cancelled.stop], [1, 'cancelled', 'none']);
});

test('a recovering attach adopts the receipt written since it read the journal and the cancel stops the run it names', async t => {
  const a = await attached(t);
  const base = attachJournal(a.dir);
  // One attach has journaled its intent and is inside rex run. A second (a retry) reads the entry now; the first then keeps its receipt.
  const { effect, digest } = attachPreview({ ...a.args, plate: 'Acme' });
  const intent = { route: 'local-host', at: '2026-11-15T12:00:00.000Z', effect, claim: { ref: effect.claimRef, sha: null, held: 'claimed now' } };
  const real = { route: 'local-host', at: '2026-11-15T12:00:01.000Z', claim: intent.claim, result: { state: 'dispatched', session: 'rex:session:acme-anvils/block:acme-tab-1' } };
  await base.write(digest, { intent });
  let once = false;
  const stale = { ...base, read: async d => { const v = await base.read(d); if (!once) { once = true; await base.write(d, { intent, receipt: real }); } return v; } };
  const second = await attach(a.args, a.deps({ journal: stale }));
  assert.deepEqual((await base.read(digest)).receipt, real, 'the receipt that names the run is not replaced by a recovered one');
  assert.deepEqual([second.data.state, second.data.receipt], ['attached', real], 'and the recovering attach adopts it');
  const c = await a.cancel();
  assert.equal(c.data.attaches[0].cancelled.stop, 'stopped');
  assert.equal((await a.w.closes()).length, 1, 'the running block is closed');
});

test('recovery gives a phase cancel to a sibling attach lacking its own record and stops its run', async t => {
  const a = await attached(t);
  const s = await attach({ ...a.args, route: 'session', phaseText: undefined, host: undefined }, a.deps());
  const h = await attach(a.args, a.deps());
  assert.deepEqual([s.exitCode, h.exitCode], [0, 0]);
  await writeFile(rexBriefFile(a.w.env, h.data.digest), BRIEF, { mode: 0o600 }); // an interactive run keeps it while it lives
  // A cancel killed after recording one attach of the phase, before the other.
  await attachJournal(a.dir).cancel(s.data.digest, { at: '2026-11-16T00:00:00.000Z', by: 'owner' });
  assert.equal((await check(a)).exitCode, 1);
  assert.deepEqual(await a.w.closes(), [], 'a check is read only');
  assert.equal((await attach(a.args, a.deps())).data.state, 'cancelled'); // a restart: recovery runs
  assert.deepEqual(await attachJournal(a.dir).cancelOf(h.data.digest), { at: '2026-11-16T00:00:00.000Z', by: 'owner' }, 'the same record, under the sibling too');
  assert.equal((await a.w.closes()).length, 1, 'recovery stopped the identified run of the cancelled phase');
  assert.equal(existsSync(rexBriefFile(a.w.env, h.data.digest)), false, 'and removed its brief');
  assert.deepEqual(await localHostExecutions(a.w.checkout, { env: a.w.env, journal: attachJournal(a.dir) }), []);
});

test('two attaches of one digest that both read an empty journal dispatch once', async t => {
  const a = await attached(t);
  const base = attachJournal(a.dir);
  let release; const gate = new Promise(r => { release = r; });
  let n = 0;
  const slow = { ...base, read: async d => { const v = await base.read(d); if (n++ === 0) await gate; return v; } };
  const second = attach(a.args, a.deps({ journal: slow })); // reads an empty journal, then stalls (as in its claim push)
  await new Promise(r => setTimeout(r, 50));
  const first = await attach(a.args, a.deps());
  release();
  const r = await second;
  assert.equal(runCalls(await a.w.rexCalls()).length, 1, 'one tab, not two');
  assert.deepEqual([first.data.state, r.data.state, r.data.repeated], ['attached', 'attached', true]);
  assert.deepEqual(r.data.receipt, first.data.receipt, 'the one that lost the intent has the same receipt');
});

test('two attaches of one phase with different digests run one host', async t => {
  const a = await attached(t);
  let release; const gate = new Promise(r => { release = r; });
  const claim = async () => { await gate; return { data: { ok: true, claimed: false, sha: 'c'.repeat(40) }, text: 'held' }; };
  // Both pass the check for an earlier host run while neither has journaled; the second waits on its claim.
  const second = attach({ ...a.args, title: 'Build the anvil, revised' }, a.deps({ claim }));
  await new Promise(r => setTimeout(r, 50));
  const first = await attach(a.args, a.deps());
  release();
  const r = await second;
  assert.equal(runCalls(await a.w.rexCalls()).length, 1, 'one tab for the phase');
  assert.deepEqual([first.data.state, r.exitCode, r.data.state, r.data.earlier.digest], ['attached', 1, 'already-dispatched', first.data.digest]);
});

test('a torn entry never hides its phase cancel from a changed attach', async t => {
  const a = await attached(t);
  const first = await attach(a.args, a.deps());
  await a.cancel();
  await truncate(join(a.dir, `${first.data.digest}.json`), 0); // as a power loss leaves an entry that was never synced
  const before = runCalls(await a.w.rexCalls()).length;
  const changed = await attach({ ...a.args, title: 'Build the anvil, revised' }, a.deps());
  assert.equal(runCalls(await a.w.rexCalls()).length, before, 'a cancelled phase is not dispatched');
  assert.deepEqual([changed.exitCode, changed.data.state], [1, 'cancelled']);
  assert.equal((await check(a)).exitCode, 1);
  // The journal lists it from its cancel file: cancelled, with nothing else known.
  const [listed] = await attachJournal(a.dir).list();
  assert.deepEqual([listed.digest, listed.torn, listed.cancel.phase, listed.intent], [first.data.digest, true, 7, undefined]);
  // Without the phase's own record too (a journal from before it had one): still cancelled.
  await rm(join(a.dir, 'phase-7.cancel.json'));
  assert.equal((await attach({ ...a.args, title: 'Build the anvil, revised' }, a.deps())).data.state, 'cancelled');
  assert.equal((await check(a)).exitCode, 1);
});

test('a cancel while the first attach of a phase takes its claim is recorded and nothing is dispatched', async t => {
  const a = await attached(t);
  let cancelled = null;
  const claim = async () => { cancelled = await a.cancel({ why: 'mid-claim' }); return { data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }; };
  const r = await attach(a.args, a.deps({ claim }));
  assert.deepEqual([cancelled.exitCode, cancelled.data.state, cancelled.data.already], [0, 'cancelled', false]);
  assert.match(cancelled.text, /taking its claim since/);
  assert.deepEqual([r.exitCode, r.data.state], [1, 'cancelled']);
  assert.match(r.text, /cancelled at .*mid-claim.*while it was being claimed/);
  assert.deepEqual(runCalls(await a.w.rexCalls()), []);
  assert.deepEqual(await attachJournal(a.dir).list(), [], 'nothing was journaled for the attach');
  assert.deepEqual(await attachJournal(a.dir).attempts(), [], 'and its claiming marker is gone');
  assert.equal((await check(a)).exitCode, 1, 'a restarted session is told to stop');
  assert.equal((await attach(a.args, a.deps())).data.state, 'cancelled');
  // A phase nothing was ever attached to still has nothing to cancel.
  await assert.rejects(cancelAttach({ root: a.w.checkout, projectId: 'acme', phase: 8, yes: true }, a.deps()), /no attach in this checkout's journal: nothing to cancel/);
});

test('only the block or session not found answer of Rex with exit 3 ends a run', async t => {
  const a = await attached(t);
  await attach(a.args, a.deps());
  // "not found" about something else, or without Rex's exit code: not an end. The stop stays pending.
  for (const wait of [{ stderr: 'Error: rex config file not found\n', code: 1 }, { stderr: 'Error: block target not found\n', code: 1 }, { stderr: 'Error: socket not found\n', code: 3 }]) {
    await a.w.setMode({ ls: 'ok', sessions: SESSIONS, wait, journal: a.dir });
    const r = await a.cancel();
    assert.deepEqual([r.data.attaches[0].cancelled.stop, r.data.attaches[0].cancelled.done], ['pending', false], JSON.stringify(wait));
  }
  await a.w.setMode({ ls: 'ok', sessions: SESSIONS, wait: RUNNING, close: 'lost', journal: a.dir });
  assert.equal((await a.cancel()).data.attaches[0].cancelled.stop, 'pending', 'a close that failed is not an end either');
  await a.w.setMode({ ls: 'ok', sessions: SESSIONS, wait: { stderr: 'Error: block target not found\n', code: 3 }, journal: a.dir });
  assert.deepEqual((({ stop, done }) => [stop, done])((await a.cancel()).data.attaches[0].cancelled), ['ended', true]);
});

test('a run whose cancel was settled with a recovered receipt is stopped once the dispatch names it', async t => {
  const a = await attached(t);
  const hold = join(a.w.logs, 'run-release');
  await a.w.setMode({ ls: 'ok', sessions: SESSIONS, wait: RUNNING, journal: a.dir, runHold: hold });
  const first = attach(a.args, a.deps()); // inside rex run
  await untilRuns(a.w);
  const second = await attach(a.args, a.deps()); // a retry meanwhile: it recovers, and never dispatches
  assert.deepEqual([second.data.state, second.data.recovered, second.data.receipt.result.state], ['attached', true, 'uncertain']);
  const c = await a.cancel();
  assert.equal(c.data.attaches[0].cancelled.stop, 'unknown', 'the recovered receipt names no run');
  await writeFile(hold, '');
  const r = await first;
  assert.deepEqual([r.data.state, r.data.cancelled.stop], ['cancelled', 'stopped'], 'the dispatch that finished stopped its own run');
  assert.equal((await a.w.closes()).length, 1);
  assert.equal(runCalls(await a.w.rexCalls()).length, 1);
  assert.equal((await attachJournal(a.dir).read(r.data.digest)).receipt.result.session, r.data.receipt.result.session, 'the dispatcher\'s receipt stands over the recovered one');
  assert.deepEqual(await recoverCancels(attachJournal(a.dir), { env: a.w.env, root: a.w.checkout }), [], 'nothing left to settle');
});

test('one attach that cannot be settled does not keep recovery from settling the rest', async t => {
  const a = await attached(t);
  const one = await attach({ ...a.args, route: 'session', phaseText: undefined, host: undefined }, a.deps());
  const two = await attach({ ...a.args, phase: 8 }, a.deps());
  const base = attachJournal(a.dir);
  for (const d of [one.data.digest, two.data.digest]) await base.cancel(d, { at: '2026-11-16T00:00:00.000Z', by: 'owner' });
  const broken = [one.data.digest, two.data.digest].sort()[0], other = [one.data.digest, two.data.digest].sort()[1];
  const journal = { ...base, settled: async (d, v) => { if (d === broken) throw new Error('disk full'); return base.settled(d, v); } };
  const out = await recoverCancels(journal, { env: a.w.env, root: a.w.checkout });
  assert.deepEqual(out.map(x => [x.digest, x.error ?? x.cancelled.done]).sort(), [[broken, 'disk full'], [other, true]].sort());
  // And a killed write's temporary file (a copy of what it was writing) is removed once it is old; a writer's fresh one is left.
  const old = join(a.dir, `${one.data.digest}.json.123.abcd1234.tmp`), fresh = join(a.dir, `${two.data.digest}.json.123.abcd1234.tmp`);
  await writeFile(old, BRIEF); await writeFile(fresh, BRIEF);
  await utimes(old, new Date(Date.now() - 600_000), new Date(Date.now() - 600_000));
  await recoverCancels(base, { env: a.w.env, root: a.w.checkout });
  assert.deepEqual([existsSync(old), existsSync(fresh)], [false, true]);
});

test('a brief directory that cannot be checked against git refuses the run before anything is made in Rex', async t => {
  const w = await world(t);
  const host = { file: 'hosts.json', start: null, state: null, harness: [w.harness] };
  const env = { ...w.env, PATH: w.bin }; // no git here: whether the directory is in a repository cannot be known
  await assert.rejects(startHost({ host, plate: 'Acme', provider: 'claude', checkout: w.checkout, brief: BRIEF, tab: 'phase-7', env }), /could not be checked.*Nothing was started/);
  assert.deepEqual((await w.rexCalls()).map(c => c.args[0]), ['ls'], 'no session is made and no tab opened');
  assert.equal(existsSync(w.briefDir), false);
});

test('a cancel recorded after the dispatch was decided and before the host or Rex run starts leaves it unstarted', async t => {
  // The window after the fate is linked "dispatch": the route is on its way to the run (finding Rex, making its session).
  const { ROUTE_HANDLERS } = await import('../lib/attach.mjs');
  const real = ROUTE_HANDLERS['local-host'];
  for (const kind of ['start', 'rex']) {
    const a = await attached(t);
    const host = kind === 'start' ? { file: 'hosts.json', start: [a.w.start, 'start'], state: null } : a.args.host;
    const readHost = async () => ({ ...host }); // no stop command: a host started now could never be stopped
    let cancelled = null;
    const handlers = { ...ROUTE_HANDLERS, 'local-host': { ...real, dispatch: async ctx => { cancelled = await a.cancel({}, { readHost }); return real.dispatch(ctx); } } };
    const r = await attach({ ...a.args, host }, a.deps({ handlers, readHost }));
    assert.equal(cancelled.data.attaches[0].cancelled.stop, 'unknown', `${kind}: the cancel lost the decision, so it does not say nothing was started`);
    assert.deepEqual(await a.w.startRuns(), [], `${kind}: the host is not started`);
    assert.deepEqual(runCalls(await a.w.rexCalls()), [], `${kind}: no tab is opened`);
    assert.deepEqual([r.exitCode, r.data.state, r.data.receipt.result.state, r.data.cancelled.stop, r.data.cancelled.done], [1, 'cancelled', 'not-started', 'none', true], kind);
    assert.equal(existsSync(rexBriefFile(a.w.env, r.data.digest)), false, `${kind}: no brief file is left`);
    assert.equal(JSON.parse(await readFile(join(a.dir, `${r.data.digest}.fate.json`), 'utf8')).fate, 'dispatch');
  }
});
