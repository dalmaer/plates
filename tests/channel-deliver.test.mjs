// Synthetic Acme journals and a stub Rex; never a real tab, keychain or workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, realpath, stat, symlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attach, attachJournal } from '../lib/attach.mjs';
import { deliverOwnerLines, registerDeliveryJournal } from '../lib/channel-deliver.mjs';
import { withCursorLock } from '../lib/channel-owner.mjs';
import { push } from '../lib/sessions.mjs';

const START = '2026-11-17T10:00:00.000Z', AT = '2026-11-17T10:01:00.000Z';
const DIGEST = 'a'.repeat(64), TARGET = 'rex:session:acme/block:acme-run';
const owner = (text = '@7 Check the Acme anvil', extra = {}) =>
  ({ at: AT, kind: 'owner', text, to: [{ plate: 'acme', phase: 7 }], by: 'github:123', ...extra });
const agent = provider => ({ at: AT, text: '@7 Do not act on this', session: provider === 'plates' ? 'plates-dispatched-abcdefabcdef' : 'acme-peer', phase: 7, provider, device: 'Acme Mac' });

async function world(t, { registered = true, rex = true } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'plates-channel-deliver-acme-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'acme'), bin = join(base, 'bin'), state = join(base, 'state');
  await mkdir(root); await mkdir(bin);
  execFileSync('git', ['init', '-q', root]);
  const dir = join(root, '.git', 'plates-attach'), journal = attachJournal(dir);
  const callsFile = join(base, 'calls.jsonl'), modeFile = join(base, 'mode.json');
  await writeFile(modeFile, '{}');
  if (rex) await writeFile(join(bin, 'rex'), `#!${process.execPath}
const fs = require('node:fs'), a = process.argv.slice(2);
const calls = ${JSON.stringify(callsFile)}, modeFile = ${JSON.stringify(modeFile)};
const m = JSON.parse(fs.readFileSync(modeFile, 'utf8'));
fs.appendFileSync(calls, JSON.stringify({ args: a, env: process.env }) + '\\n');
if (a[0] === 'wait') {
  if (m.presence === 'exited') { console.log('{"exit_code":0}'); process.exit(0); }
  if (m.presence === 'gone') { console.error('block not found'); process.exit(3); }
  if (m.presence === 'unknown') process.exit(2);
  console.error('wait timed out'); process.exit(1);
}
if (a[0] === 'send' && m.cancel) fs.writeFileSync(m.cancel, '{"by":"owner"}');
if (a[0] === m.fail) {
  delete m.fail; fs.writeFileSync(modeFile, JSON.stringify(m));
  process.exit(1);
}
if (a[0] === m.crash) process.kill(process.pid, 'SIGKILL');
process.exit(0);
`, { mode: 0o755 });
  const env = { HOME: base, PATH: `${bin}:/usr/bin:/bin`, XDG_STATE_HOME: state,
    PLATES_DEVICE_KEY: 'acme-fake-device-key', GH_TOKEN: 'acme-fake-secret', PLATES_SESSION: 'acme-push' };
  const entry = { intent: { route: 'local-host', at: START,
    effect: { projectId: 'acme', phase: 7, host: { prompt: 'arg' }, brief: { text: 'ACME PRIVATE BRIEF' } },
    claim: { session: 'acme-worker', token: 'ACME PRIVATE CLAIM' } },
  receipt: { route: 'local-host', at: START, result: { state: 'dispatched', session: TARGET } } };
  await journal.write(DIGEST, entry);
  if (registered) await registerDeliveryJournal({ root, dir, env });
  const requests = [], items = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer acme-fake-device-key');
    if (url.endsWith('/api/sessions/waiting')) return Response.json({ pushed: true });
    assert.equal(new URL(url).searchParams.get('owner'), '1');
    assert.equal(new URL(url).searchParams.get('project'), 'acme');
    return Response.json({ items });
  };
  const options = { origin: 'https://acme.test', env, fetcher, key: async () => env.PLATES_DEVICE_KEY };
  const calls = async () => (await readFile(callsFile, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const input = async () => (await calls()).filter(c => ['send', 'send-key'].includes(c.args[0]));
  const cursorDir = join(state, 'plates', 'channel-delivery', 'runs');
  const cursors = async () => Promise.all((await readdir(cursorDir).catch(() => [])).filter(n => n.endsWith('.json')).map(async n => ({ path: join(cursorDir, n), value: JSON.parse(await readFile(join(cursorDir, n), 'utf8')) })));
  return { base, root, dir, journal, entry, env, options, items, requests, calls, input, cursors,
    mode: m => writeFile(modeFile, JSON.stringify(m)), deliver: extra => deliverOwnerLines({ ...options, ...extra }) };
}

test('push delivers only authenticated owner lines addressed to the receipt phase or worker, once each', async t => {
  const w = await world(t);
  const one = owner(), two = owner('@acme-worker Reply here', { to: [{ session: 'acme-worker' }] });
  w.items.push(agent('codex'), agent('plates'), owner('@8 elsewhere', { to: [{ plate: 'acme', phase: 8 }] }),
    owner('@other-worker elsewhere', { to: [{ session: 'other-worker' }] }), owner('Old owner line', { at: '2026-11-17T09:00:00.000Z' }), two, one, one);
  const r = await push({ site: w.options.origin, env: w.env, fetcher: w.options.fetcher, key: w.options.key, machine: 'Acme Mac' });
  assert.equal(r.data.pushed, true);
  assert.equal(r.data.delivery[0].delivered, 2);
  assert.match(r.text, /Channel delivery acme#7\/acme-worker: sent 2/);
  assert.deepEqual(await w.deliver(), []);
  const calls = await w.input();
  assert.deepEqual(calls.map(c => c.args[0]), ['send', 'send-key', 'send', 'send-key']);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(1, 5), ['-s', 'session:acme', '-b', 'block:acme-run']);
    assert.ok(!('GH_TOKEN' in call.env) && !('PLATES_DEVICE_KEY' in call.env) && !('PLATES_SESSION' in call.env));
    assert.doesNotMatch(JSON.stringify(call), /ACME PRIVATE|acme-fake/);
  }
  assert.deepEqual(new Set(calls.filter(c => c.args[0] === 'send').map(c => c.args[6])), new Set([one, two].map(l => l.text + "\n\nReply with PLATES_SITE='https://acme.test' plates say; this came from the owner via the plates channel.")));
  assert.ok(calls.filter(c => c.args[0] === 'send-key').every(c => c.args[5] === 'Enter'));
  const [cursor] = await w.cursors();
  assert.equal((await stat(cursor.path)).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(cursor.value), /PRIVATE|Check the|Reply here|fake/);
  // A later read can add another line at the same millisecond without losing or replaying any.
  w.items.push(owner('@7 One more Acme check'));
  assert.equal((await w.deliver())[0].delivered, 1);
  assert.equal((await w.input()).length, 6);
});

test('option-shaped owner text is literal Rex payload after the separator', async t => {
  const w = await world(t);
  w.items.push(owner('-b evil'));
  assert.equal((await w.deliver())[0].delivered, 1);
  const [sent] = await w.input();
  assert.deepEqual(sent.args.slice(0, 6), ['send', '-s', 'session:acme', '-b', 'block:acme-run', '--']);
  assert.match(sent.args[6], /^-b evil\n\nReply with /);
});

test('the reply instruction uses the push origin despite a different ambient workspace', async t => {
  const w = await world(t); w.items.push(owner());
  const site = 'https://acme-explicit.test:8443';
  await push({ site, env: { ...w.env, PLATES_SITE: 'https://acme-other.test' },
    fetcher: w.options.fetcher, key: w.options.key, machine: 'Acme Mac' });
  const [sent] = await w.input();
  assert.ok(sent.args.at(-1).includes("Reply with PLATES_SITE='https://acme-explicit.test:8443' plates say;"));
  assert.doesNotMatch(sent.args.at(-1), /acme-other/);
  assert.ok(w.requests.every(r => new URL(r.url).origin === site));
});

test('stale empty and partial lock initialization recovers without expiring a live complete lock', async t => {
  const w = await world(t), path = join(w.base, 'acme-cursor.json'), old = new Date(Date.now() - 600_000);
  for (const partial of ['', 'partial', `${process.pid}:`]) {
    await writeFile(path + '.lock', partial);
    await utimes(path + '.lock', old, old);
    assert.equal(await withCursorLock(path, async () => 'recovered', { staleMs: Infinity, waitMs: 500, pollMs: 5 }), 'recovered', JSON.stringify(partial));
  }
  await writeFile(path + '.lock', `${process.pid}:1:alive`);
  await utimes(path + '.lock', old, old);
  await assert.rejects(withCursorLock(path, async () => assert.fail('live holder was reclaimed'),
    { staleMs: Infinity, waitMs: 100, pollMs: 5 }), /another plates channel inbox/);
});

test('a killed initializer or partial cursor temporary file cannot replay a delivered line', async t => {
  const w = await world(t); w.items.push(owner());
  await w.deliver();
  const [cursor] = await w.cursors(), old = new Date(Date.now() - 600_000);
  await writeFile(cursor.path + '.lock', '');
  await utimes(cursor.path + '.lock', old, old);
  await writeFile(cursor.path + '.999999999.partial.tmp', '{"schema":1,');
  await writeFile(cursor.path + '.lock.999999999-partial.tmp', '999');
  w.items.push(owner('@7 A second anvil', { at: '2026-11-17T10:02:00.000Z' }));
  assert.equal((await w.deliver())[0].delivered, 1);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send', 'send-key', 'send', 'send-key']);
  // Recovery of the lock preserves typed and uncertain transport stages.
  w.items.push(owner('@7 A third anvil', { at: '2026-11-17T10:03:00.000Z' }));
  await w.mode({ fail: 'send-key' });
  await w.deliver();
  await writeFile(cursor.path + '.lock', '999999999:1:dead');
  assert.equal((await w.deliver())[0].delivered, 1);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send', 'send-key', 'send', 'send-key', 'send', 'send-key', 'send-key']);
  const uncertain = (await w.cursors())[0].value;
  uncertain.pending = { id: 'f'.repeat(64), stage: 'sending' };
  await writeFile(cursor.path, JSON.stringify(uncertain));
  await writeFile(cursor.path + '.lock', '999999999:1:dead');
  assert.match(JSON.stringify(await w.deliver()), /outcome uncertain/);
  assert.equal((await w.input()).length, 7);
});

test('quiet pushes share one incremental project read and never reprobe ended or current runs', async t => {
  const w = await world(t);
  const other = structuredClone(w.entry);
  other.intent.effect.phase = 8;
  other.intent.claim.session = 'acme-second';
  other.receipt.result.session = 'rex:session:acme/block:acme-second';
  await w.journal.write('b'.repeat(64), other);
  w.items.push(owner(), owner('@8 Second run', { to: [{ plate: 'acme', phase: 8 }] }));
  assert.equal((await w.deliver()).reduce((n, r) => n + r.delivered, 0), 2);
  assert.equal(w.requests.length, 1, 'one project read for two runs');
  const calls = (await w.calls()).length;
  await w.deliver();
  assert.equal(w.requests.length, 2, 'a quiet push makes only one shared project read');
  assert.equal(new URL(w.requests[1].url).searchParams.get('since'), '2026-11-17T10:00:59.999Z');
  assert.equal((await w.calls()).length, calls, 'caught-up cursors need no Rex calls');
  await w.mode({ presence: 'exited' });
  w.items.push(owner('@7 Finish', { at: '2026-11-17T10:02:00.000Z' }));
  await w.deliver(); // the first run's ended receipt is now durable
  const afterEnd = (await w.calls()).length;
  await w.deliver();
  assert.equal((await w.calls()).length, afterEnd, 'the ended block is never queried again');
  assert.equal((await w.input()).length, 4, 'no replay or new input on an ended block');
});

test('when every recorded Rex block has ended subsequent pushes do no channel or Rex reads', async t => {
  const w = await world(t);
  await w.mode({ presence: 'gone' });
  await w.deliver();
  const calls = (await w.calls()).length;
  await w.deliver();
  assert.equal((await w.calls()).length, calls);
  assert.equal(w.requests.length, 0);
});

test('a failed send is named by push and retried; a failed Enter retries only Enter', async t => {
  for (const failed of ['send', 'send-key']) {
    const w = await world(t);
    w.items.push(owner());
    await w.mode({ fail: failed });
    const r = await push({ site: w.options.origin, env: w.env, fetcher: w.options.fetcher, key: w.options.key, machine: 'Acme Mac' });
    assert.match(r.text, new RegExp('rex ' + failed + ' failed.*retry next push'));
    assert.equal((await w.cursors())[0].value.at, START, 'a failed send never advances the delivery cursor');
    assert.equal((await w.deliver())[0].delivered, 1);
    assert.deepEqual(await w.deliver(), []);
    assert.deepEqual((await w.input()).map(c => c.args[0]), failed === 'send'
      ? ['send', 'send', 'send-key'] : ['send', 'send-key', 'send-key']);
  }
});

test('concurrent pushes serialize the run across a slow read and deliver only once', async t => {
  const w = await world(t);
  w.items.push(owner());
  let release, entered;
  const gate = new Promise(r => { release = r; }), reached = new Promise(r => { entered = r; });
  const first = w.deliver({ fetcher: async (...args) => { entered(); await gate; return w.options.fetcher(...args); } });
  await reached;
  const second = w.deliver();
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results.flat().reduce((n, r) => n + (r.delivered ?? 0), 0), 1);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send', 'send-key']);
});

test('cancelled runs never receive input, including phase cancels, unreadable cancels and another attach of that phase', async t => {
  for (const kind of ['run', 'phase', 'unreadable', 'other']) {
    const w = await world(t);
    w.items.push(owner());
    if (kind === 'run') await w.journal.cancel(DIGEST, { by: 'owner' });
    if (kind === 'phase') await w.journal.cancelPhase(7, { by: 'owner' });
    if (kind === 'unreadable') await writeFile(join(w.dir, 'phase-7.cancel.json'), '{');
    if (kind === 'other') {
      await w.journal.write('b'.repeat(64), w.entry);
      await w.journal.cancel('b'.repeat(64), { by: 'owner' });
    }
    await w.deliver();
    assert.deepEqual(await w.input(), [], kind);
    assert.equal(w.requests.length, 0, kind);
  }
});

test('a cancel arriving while text is typed prevents Enter and every subsequent retry', async t => {
  const w = await world(t);
  w.items.push(owner());
  await w.mode({ cancel: join(w.dir, 'phase-7.cancel.json') });
  assert.deepEqual(await w.deliver(), []);
  assert.deepEqual(await w.deliver(), []);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send']);
  assert.equal((await w.cursors())[0].value.at, START);
});

test('only a live interactive run with an attach receipt is a destination', async t => {
  for (const kind of ['no-receipt', 'guessed', 'session-route', 'headless', 'uncertain', 'exited', 'gone', 'unknown']) {
    const w = await world(t);
    w.items.push(owner());
    if (kind === 'no-receipt') delete w.entry.receipt;
    if (kind === 'guessed') w.entry.receipt.result.session = 'acme-worker';
    if (kind === 'session-route') w.entry.intent.route = 'session';
    if (kind === 'headless') w.entry.intent.effect.host.prompt = 'stdin';
    if (kind === 'uncertain') w.entry.receipt.result.state = 'uncertain';
    if (['exited', 'gone', 'unknown'].includes(kind)) await w.mode({ presence: kind });
    await w.journal.write(DIGEST, w.entry);
    await w.deliver();
    assert.deepEqual(await w.input(), [], kind);
    assert.equal(w.requests.length, 0, kind);
  }
});

test('no index, no journals, or no Rex adds no push output or owner reads', async t => {
  for (const kind of ['no-index', 'no-journals', 'no-rex']) {
    const w = await world(t, { registered: kind !== 'no-index', rex: kind !== 'no-rex' });
    if (kind === 'no-journals') await rm(w.dir, { recursive: true });
    const r = await push({ site: w.options.origin, env: w.env, fetcher: w.options.fetcher, key: w.options.key, machine: 'Acme Mac' });
    assert.equal(r.data.delivery, undefined, kind);
    assert.doesNotMatch(r.text, /delivery/i);
    assert.equal(w.requests.length, 1);
    assert.deepEqual(await w.input(), []);
  }
});

test('malformed, secret-shaped or falsely marked owner lines fail closed without putting their contents in output', async t => {
  for (const bad of [
    { ...owner(), device: 'Acme Mac' },
    owner('sk-' + 'a'.repeat(24)),
    owner('Acme\u001b[31m'),
    owner('Not authenticated', { by: 'codex' }),
  ]) {
    const w = await world(t); w.items.push(bad);
    assert.match(JSON.stringify(await w.deliver()), /owner lines unavailable/);
    assert.deepEqual(await w.input(), []);
    assert.deepEqual(await w.cursors(), []);
  }
});

test('an uncertain Rex result or crash at the send boundary cannot replay text or Enter', async t => {
  const w = await world(t); w.items.push(owner());
  await w.mode({ crash: 'send' });
  assert.match(JSON.stringify(await w.deliver()), /outcome uncertain/);
  await w.mode({});
  assert.match(JSON.stringify(await w.deliver()), /outcome uncertain/);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send']);
  const [cursor] = await w.cursors();
  cursor.value.pending.stage = 'entering';
  await writeFile(cursor.path, JSON.stringify(cursor.value));
  assert.match(JSON.stringify(await w.deliver()), /outcome uncertain/);
  assert.equal((await w.input()).length, 1);
});

test('an unsupported owner endpoint or corrupt cursor is a named gap and never advances delivery', async t => {
  const w = await world(t); w.items.push(owner());
  let calls = 0;
  const unsupported = await w.deliver({ fetcher: async () => {
    calls++;
    return Response.json({ error: 'invalid_query' }, { status: 400 });
  } });
  assert.match(JSON.stringify(unsupported), /owner lines unavailable/);
  assert.equal(calls, 1, 'delivery cannot fall back to an agent-only read');
  assert.deepEqual(await w.cursors(), []);
  await w.mode({ fail: 'send' });
  await w.deliver();
  const [cursor] = await w.cursors();
  await writeFile(cursor.path, '{');
  assert.match(JSON.stringify(await w.deliver()), /delivery state unavailable/);
  assert.deepEqual((await w.input()).map(c => c.args[0]), ['send']);
});

test('a legacy receipt can receive phase lines without guessing its missing worker session', async t => {
  const w = await world(t);
  delete w.entry.intent.claim.session;
  await w.journal.write(DIGEST, w.entry);
  w.items.push(owner(), owner('@acme-worker only', { to: [{ session: 'acme-worker' }] }));
  assert.equal((await w.deliver())[0].delivered, 1);
  assert.equal((await w.input()).length, 2);
});

test('a run ending during the owner read receives no terminal input', async t => {
  const w = await world(t); w.items.push(owner());
  const result = await w.deliver({ fetcher: async (...args) => {
    await w.mode({ presence: 'exited' });
    return w.options.fetcher(...args);
  } });
  assert.match(JSON.stringify(result), /no longer confirmed live/);
  assert.deepEqual(await w.input(), []);
});

test('the index is private, outside repositories even through symlinks, and attach writes it before dispatch', async t => {
  const w = await world(t, { registered: false });
  const index = join(w.env.XDG_STATE_HOME, 'plates', 'channel-delivery', 'journals');
  const args = { root: w.root, projectId: 'acme', phase: 8, title: 'Acme anvils', route: 'local-host', provider: 'codex', yes: true,
    config: { name: 'Acme', agents: { codex: {} }, backlog: { routes: ['local-host'] } },
    phaseText: { doneWhen: 'The anvil lands.', acceptance: '- [ ] Lands.', context: {} },
    host: { file: 'hosts.json', start: null, state: null, harness: ['/acme/codex'], prompt: 'arg' } };
  const deps = { env: w.env, events: async () => null, progress: async () => null,
    claim: async () => ({ data: { ok: true, claimed: true, sha: 'c'.repeat(40) }, text: 'claimed' }),
    handlers: { 'local-host': { dispatch: async () => {
      const files = await readdir(index);
      assert.equal(files.length, 1, 'discovery is durable before the tab opens');
      assert.equal((await stat(join(index, files[0]))).mode & 0o777, 0o600);
      const value = JSON.parse(await readFile(join(index, files[0]), 'utf8'));
      assert.deepEqual(value, { schema: 1, root: w.root, dir: w.dir });
      return { state: 'dispatched', session: TARGET };
    } } } };
  assert.equal((await attach(args, deps)).exitCode, 0);
  const alias = join(w.base, 'checkout-link');
  await symlink(w.root, alias);
  await registerDeliveryJournal({ root: alias, dir: join(alias, '.git', 'plates-attach'), env: w.env });
  assert.equal((await readdir(index)).length, 1, 'aliases cannot give one journal two delivery cursors');
  const link = join(w.base, 'state-link');
  await symlink(w.root, link);
  for (const location of [w.root, link]) await assert.rejects(registerDeliveryJournal({ root: w.root, dir: w.dir, env: { ...w.env, XDG_STATE_HOME: location } }), /inside/);
});
