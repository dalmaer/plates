// plates audit run (phase 192, increment 2): one lens handed to the owner's
// local agent host when a provider has quota room. Without --yes it previews
// and makes nothing; with it, a detached checkout of HEAD outside the project,
// the brief on stdin, only the basic environment, one run of the host and a
// receipt. No room, no host, or a provider the lens does not name is refused.
// The host here is a stub that records what it was given. Every fixture is Acme's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as audit from '../practices/audits/files/scripts/plates/audit.mjs';
import { auditRun, parseRunArgs, runsDir } from '../lib/audit-run.mjs';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const roomy = (generatedAt = NOW) => ({ v: 1, generatedAt, providers: [
  { id: 'claude', status: 'green', fresh: true, windows: [{ id: 'claude.weekly', kind: 'weekly', label: 'Weekly', usedPct: 40, pacePct: 42 }] },
  { id: 'codex', status: 'green', fresh: true, windows: [{ id: 'codex.weekly', kind: 'weekly', label: 'Weekly', usedPct: 21, pacePct: 53 }] },
] });

async function world(t, { host = 'ok', providers = '["claude", "codex"]', hosts = null, guide = null } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'plates-audit-run-acme-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'acme');
  await mkdir(join(root, '.plates'), { recursive: true });
  await mkdir(join(root, '.agents/audits'), { recursive: true });
  await writeFile(join(root, '.plates/plates.json'), JSON.stringify({ name: 'Acme', agents: { claude: {}, codex: {} }, practices: ['night', 'audits'], ...(guide ? { guide } : {}) }));
  await writeFile(join(root, '.agents/audits/security.md'), `---\nname: security\ndescription: Acme's secrets.\nevery: 14\neffort: quick\nproviders: ${providers}\nminutes: 20\n---\n\nLook for credentials.\n`);
  await writeFile(join(root, 'app.mjs'), 'export const acme = 1;\n');
  git(root, 'init', '-q'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'Acme');
  // The stub host: records its argv, cwd, environment keys and stdin beside itself, then answers.
  const stub = join(base, 'host.mjs');
  const log = join(base, 'host-log.json');
  await writeFile(stub, `#!${process.execPath}
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const input = readFileSync(0, 'utf8');
const runs = existsSync(${JSON.stringify(log)}) ? JSON.parse(readFileSync(${JSON.stringify(log)}, 'utf8')) : [];
runs.push({ argv: process.argv.slice(2), cwd: process.cwd(), env: Object.keys(process.env).sort(), input });
writeFileSync(${JSON.stringify(log)}, JSON.stringify(runs));
${host === 'ok' ? "console.log('acme-session-1');" : host === 'silent' ? "console.log('not a session id!');" : 'process.exit(4);'}
`, { mode: 0o755 });
  const config = join(base, 'config');
  await mkdir(join(config, 'plates'), { recursive: true });
  await writeFile(join(config, 'plates/local-hosts.json'), JSON.stringify({ hosts: hosts ?? { codex: { start: [stub, 'start'] } } }));
  const quota = join(base, 'quota.json');
  await writeFile(quota, JSON.stringify(roomy()));
  const env = { PATH: process.env.PATH, HOME: base, TMPDIR: base, XDG_CONFIG_HOME: config, XDG_STATE_HOME: join(base, 'state'), ANTHROPIC_API_KEY: 'acme-not-a-key', GH_TOKEN: 'acme-not-a-token' };
  const runs = async () => existsSync(log) ? JSON.parse(await readFile(log, 'utf8')) : [];
  return { base, root, quota, env, runs, stub };
}

const go = (w, more = {}) => auditRun({ root: w.root, name: 'security', audit, quotaFile: w.quota, env: w.env, now: NOW, runId: 'run-1', ...more });

test('without --yes a run previews and makes nothing', async t => {
  const w = await world(t);
  const r = await go(w);
  assert.equal(r.exitCode, 3);
  assert.equal(r.data.mode, 'preview');
  assert.equal(r.data.provider, 'codex', 'claude is 2 points under pace; codex has room');
  assert.equal(r.data.host, 'host.mjs');
  assert.match(r.text, /Preview only; nothing was made\. --yes starts it\./);
  assert.equal(existsSync(runsDir({ root: w.root, env: w.env })), false);
  assert.deepEqual(await w.runs(), []);
});

test('with --yes the host runs once, in a detached checkout outside the project, with the brief and the basic environment only', async t => {
  const w = await world(t);
  const r = await go(w, { yes: true });
  assert.equal(r.exitCode, 0, r.text);
  assert.equal(r.data.session, 'acme-session-1');
  const dir = join(runsDir({ root: w.root, env: w.env }), 'run-1');
  assert.ok(!dir.startsWith(w.root), 'a run lives outside the project');
  const [host] = await w.runs();
  assert.equal((await w.runs()).length, 1);
  assert.equal(host.cwd, join(dir, 'checkout'));
  assert.deepEqual(host.argv, ['start', join(dir, 'checkout')]);
  assert.equal(git(join(dir, 'checkout'), 'rev-parse', 'HEAD'), git(w.root, 'rev-parse', 'HEAD'));
  assert.equal(git(join(dir, 'checkout'), 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD', 'detached');
  for (const secret of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'XDG_CONFIG_HOME']) assert.ok(!host.env.includes(secret), `${secret} never reaches the host`);
  assert.match(host.input, /# Audit: security — Acme/);
  assert.match(host.input, new RegExp(`Write exactly one JSON file to ${join(dir, 'findings.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(host.input, /Read only\. Edit no file/);
  const receipt = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  assert.deepEqual([receipt.state, receipt.session, receipt.provider, receipt.lens], ['dispatched', 'acme-session-1', 'codex', 'security']);
  assert.equal(receipt.briefSha256.length, 64);
  assert.match(r.text, /plates audit record security --from .*findings\.json --provider codex/);
  assert.equal(git(w.root, 'status', '--porcelain'), '', 'the project checkout is untouched');
});

test('no room, no host, an unnamed provider or a failing host is refused, and a host is never run twice', async t => {
  const w = await world(t);
  await writeFile(w.quota, JSON.stringify(roomy(NOW - 3 * 3600_000)));
  await assert.rejects(go(w, { yes: true }), e => e.exitCode === 3 && /no provider has room: .*180 minutes old/.test(e.message));
  await writeFile(w.quota, JSON.stringify(roomy()));
  await assert.rejects(go(w, { yes: true, provider: 'gemini' }), /--provider gemini is not one of the lens's providers/);
  const hostless = await world(t, { hosts: { claude: { start: ['/bin/true'] } } });
  await assert.rejects(go(hostless, { yes: true }), e => e.exitCode === 2 && /has no host for codex/.test(e.message));
  assert.equal(existsSync(runsDir({ root: hostless.root, env: hostless.env })), false, 'nothing is made when refused');
  for (const kind of ['fail', 'silent']) {
    const f = await world(t, { host: kind });
    await assert.rejects(go(f, { yes: true }), e => e.exitCode === 1 && /run once and is not run again/.test(e.message));
    assert.equal((await f.runs()).length, 1);
    const receipt = JSON.parse(await readFile(join(runsDir({ root: f.root, env: f.env }), 'run-1', 'run.json'), 'utf8'));
    assert.equal(receipt.state, 'failed');
    assert.equal(receipt.session, null);
  }
});

test('the brief names the project\'s guide, and a runs directory inside a repository is refused', async t => {
  const w = await world(t, { guide: 'WORKING.md' });
  await go(w, { yes: true });
  assert.match((await w.runs())[0].input, /Read the project's guide \(WORKING\.md\)/);
  // XDG_STATE_HOME inside the project, or inside another git working tree: refused, nothing made, no host run.
  for (const state of [join('acme', '.state'), 'other/state']) {
    const v = await world(t);
    if (state.startsWith('other')) { await mkdir(join(v.base, 'other'), { recursive: true }); git(join(v.base, 'other'), 'init', '-q'); }
    const env = { ...v.env, XDG_STATE_HOME: join(v.base, state) };
    await assert.rejects(go(v, { yes: true, env }), /resolves inside (this project|the git working tree)/);
    assert.deepEqual(await v.runs(), []);
    assert.equal(existsSync(join(v.base, state)), false);
  }
});

test('the command line names one lens and its flags', () => {
  assert.deepEqual(parseRunArgs(['security', '--yes', '--provider', 'codex', '--json']), { name: 'security', provider: 'codex', quota: null, quotaUrl: null, yes: true });
  assert.throws(() => parseRunArgs([]), /names one lens/);
  assert.throws(() => parseRunArgs(['security', '--fast']), /unexpected argument: --fast/);
  assert.throws(() => parseRunArgs(['security', '--provider']), /--provider needs a value/);
});
