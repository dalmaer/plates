// plates audit run: hand one audit lens to the owner's local agent host, when
// a provider has quota room (plates phase 192, increment 2).
//
// The audits practice's own runner (scripts/plates/audit.mjs) decides room,
// writes the brief and checks findings; it starts nothing. This module is the
// one place a model is started, and only through a local agent host the owner
// configured privately (phase 183's $XDG_CONFIG_HOME/plates/local-hosts.json):
// plates never holds a provider credential and never chooses a command.
//
// A run:
//   - previews without --yes (exit 3): the lens, the provider with room and
//     why, the host's command name, the checkout it will read and where its
//     findings land. Nothing is made.
//   - with --yes: refuses when no provider of the lens has room (unknown is
//     wait), or the chosen one has no configured host; else makes a detached
//     worktree of HEAD outside the checkout (in plates's state directory, never
//     the project's), runs the host's start command once in it with the brief
//     on stdin and the basic environment only, and keeps a receipt beside it.
//   - never waits for the agent and never records: the owner (or a later
//     routine) runs `plates audit record <lens> --from <findings>` when the
//     host's session has written them, and `record` checks every cited line.
//   - never runs the host twice: a host that fails or prints no session id is
//     reported with its worktree, and the run is over.
//
// Phase 193: a host that names a harness runs it in a labelled Rex tab
// (`<plate>-<provider>` session, tab `audit-<lens>`) when Rex answers here,
// and its receipt's session is `rex:<session>/<block>`; runState then reads
// the run from Rex, and exit 0 counts as finished only once findings.json is
// there. Without Rex, or without a harness, the start command runs as before.
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { stateDir } from './not-now.mjs';
import { readLocalHost, hostState, startHost, findRex, rexLabel } from './attach.mjs';

export class AuditRunError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}
const fail = (message, exitCode) => { throw new AuditRunError(message, exitCode); };
const SESSION = /^[A-Za-z0-9._:-]{1,128}$/;

function git(cwd, args, env) {
  return new Promise(done => execFile('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => done({ ok: !error, out: String(stdout ?? '').trim(), err: String(stderr ?? '').trim() })));
}

/**
 * Refuse a runs directory inside the project or inside any git working tree,
 * resolving symlinked ancestors first: a run's checkout, receipt and findings
 * never land in a repository. Checks the nearest ancestor that exists.
 */
export async function outsideRepositories({ dir, root, env = process.env }) {
  let at = dir;
  for (;;) {
    try { at = await realpath(at); break; } catch { const up = dirname(at); if (up === at) fail(`the audit runs directory ${dir} has no existing ancestor`); at = up; }
  }
  const top = await realpath(root);
  if (at === top || at.startsWith(top + sep)) fail(`refused: the audit runs directory ${dir} resolves inside this project (${top}); set XDG_STATE_HOME outside it. Nothing was made.`);
  const inside = await git(at, ['rev-parse', '--show-toplevel'], env);
  if (inside.ok && inside.out) fail(`refused: the audit runs directory ${dir} resolves inside the git working tree ${inside.out}; a run never lands in a repository. Nothing was made.`);
}

/** Where a project's audit runs live: plates's state directory, keyed by the checkout, never inside it. */
export const runsDir = ({ root, env = process.env }) => join(stateDir(env), 'audits', createHash('sha256').update(root).digest('hex').slice(0, 16));

/**
 * Plan (and with `yes`, start) one audit run. `audit` is the practice module
 * (scripts/plates/audit.mjs's exports). Returns { data, text, exitCode }.
 */
export async function auditRun({ root, name, audit, provider: asked = null, quotaFile = null, quotaUrl = null, yes = false, env = process.env, now = Date.now(), fetchImpl, runId = null, find = findRex }) {
  const config = await audit.readConfig(root);
  const lenses = await audit.readLenses(root, { agents: audit.auditProviders(config) });
  const found = lenses.find(l => l.lens.name === name);
  if (!found) fail(`no lens "${name}"; there is ${lenses.map(l => l.lens.name).join(', ') || 'none'} (${audit.LENS_DIR}/<name>.md)`);
  const lens = found.lens;
  if (asked !== null && !lens.providers.includes(asked)) fail(`--provider ${asked} is not one of the lens's providers (${lens.providers.join(', ')})`);
  const quota = await audit.readQuota({ file: quotaFile, url: quotaUrl, env, fetchImpl });
  const options = { ...audit.roomOptions(config), now };
  const candidates = asked ? { ...lens, providers: [asked] } : lens;
  const pick = quota.snapshot ? audit.chooseProvider(quota.snapshot, candidates, options) : { provider: null, waits: [quota.why] };
  const head = await git(root, ['rev-parse', 'HEAD'], env);
  if (!head.ok || !/^[0-9a-f]{40}$/.test(head.out)) fail('this is not a git checkout with a commit; an audit names the commit it reads');
  const commit = head.out;
  const id = runId ?? `${new Date(now).toISOString().slice(0, 10)}-${name}-${commit.slice(0, 8)}-${randomBytes(3).toString('hex')}`;
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) fail('the run id is letters, digits, dot, dash and underscore');
  const dir = join(runsDir({ root, env }), id);
  const worktree = join(dir, 'checkout'), out = join(dir, 'findings.json');
  const waits = pick.provider ? null : pick.waits;
  let host = null, hostWhy = null;
  if (pick.provider) {
    try { host = await readLocalHost({ root, provider: pick.provider, env }); } catch (e) { hostWhy = e.message; }
  }
  const command = host ? basename((host.start ?? host.harness)[0]) : null;
  const plate = config.name || basename(root);
  const inRex = host?.harness ? `; its harness (${basename(host.harness[0])}) runs in a Rex tab audit-${name} of session ${rexLabel(plate, pick.provider)} when Rex answers${host.start ? ', else the start command' : ', and is not started without Rex'}` : '';
  const plan = { lens: name, effort: lens.effort, minutes: lens.minutes, commit, provider: pick.provider, room: pick.why ?? null, waits, host: command, hostWhy, worktree, out, run: id };
  const summary = pick.provider
    ? `${name}: ${pick.why}; ${host ? `its local host (${command}) would read ${commit.slice(0, 12)} in a detached checkout and write ${out}${inRex}` : `but ${hostWhy}`}`
    : `${name}: no provider has room: ${waits.join('; ')}`;
  if (!yes) return { data: { mode: 'preview', ...plan }, text: `${summary}\nPreview only; nothing was made. --yes starts it.`, exitCode: 3 };
  if (!pick.provider) fail(`refused: ${summary}. An audit waits for room; nothing was started.`, 3);
  if (!host) fail(`refused: ${hostWhy}. Nothing was started.`, 2);
  // Rex is looked for once, before anything is made: a host with only a harness and no Rex is refused here.
  const rex = host.harness ? await find({ env }) : null;
  if (host.harness && !rex && !host.start) fail(`refused: the ${pick.provider} host names only a harness, and Rex is not answering here (no rex on PATH, or rex ls --json failed). Nothing was made.`, 2);
  await outsideRepositories({ dir, root, env });

  await mkdir(dir, { recursive: true, mode: 0o700 });
  const added = await git(root, ['worktree', 'add', '--detach', worktree, commit], env);
  if (!added.ok) fail(`the audit checkout could not be made: ${added.err.split('\n')[0]}`, 1);
  const brief = audit.brief({ plate, lens, commit, out, visibility: config.visibility === 'private' ? 'private' : 'public', guide: audit.guideOf(config) });
  const receipt = { schema: 1, ...plan, startedAt: new Date(now).toISOString(), briefSha256: createHash('sha256').update(brief).digest('hex'), session: null, state: 'starting' };
  const write = r => writeFile(join(dir, 'run.json'), `${JSON.stringify(r, null, 2)}\n`, { mode: 0o600 });
  await write(receipt);
  let session = null, why = null, via = rex ? 'rex' : 'start', rexInfo = null;
  try {
    const r = await startHost({ host: rex ? host : { ...host, harness: null }, plate, provider: pick.provider, checkout: worktree, brief, tab: `audit-${name}`, env, find: async () => rex });
    session = r.session; rexInfo = r.rex ?? null;
    if (r.via === 'start' && r.code !== 0) why = `the local host exited ${r.code}`;
    else if (r.via === 'start' && !SESSION.test(session)) why = 'the local host printed no session id (one line of [A-Za-z0-9._:-])';
  } catch (e) { why = e.message; }
  await write({ ...receipt, session: why ? null : session, via, ...(rexInfo ? { rex: rexInfo } : {}), state: why ? 'failed' : 'dispatched', ...(why ? { why } : {}) });
  if (why) fail(`${why}; it was run once and is not run again. The checkout is ${worktree} (remove it with git worktree remove).`, 1);
  return {
    data: { mode: 'started', ...plan, session, via },
    text: `${name}: started on ${pick.provider} (${via === 'rex' ? `Rex tab audit-${name} in session ${rexInfo.label}, ` : ''}session ${session}). When it has written ${out}:\n  plates audit record ${name} --from ${out} --provider ${pick.provider}`,
    exitCode: 0,
  };
}

/**
 * One run's state from its receipt: a Rex run from Rex, where exit 0 is
 * finished only when findings.json exists (a harness can exit 0 having written
 * nothing); a start/state host through its state command, as before. One of
 * HOST_STATES, or null (unknown).
 */
export async function runState({ root, run, env = process.env }) {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(String(run ?? ''))) fail('the run id is letters, digits, dot, dash and underscore');
  const dir = join(runsDir({ root, env }), run);
  let receipt;
  try { receipt = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')); } catch { return null; }
  if (!receipt?.session) return receipt?.state === 'failed' ? 'failed' : null;
  const artifact = async () => { try { return (await stat(join(dir, 'findings.json'))).isFile(); } catch { return false; } };
  let state = null;
  if (receipt.via !== 'rex') { try { state = (await readLocalHost({ root, provider: receipt.provider, env })).state; } catch { return null; } }
  return hostState({ state, session: receipt.session, env, artifact });
}

/** `run <lens> [--provider <agent>] [--quota <file> | --quota-url <url>] [--yes]`. */
export function parseRunArgs(args) {
  const valued = ['--provider', '--quota', '--quota-url'];
  const opts = {}, words = [];
  let yes = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') continue;
    if (a === '--yes') { yes = true; continue; }
    if (valued.includes(a)) { if (args[i + 1] === undefined || args[i + 1].startsWith('--')) fail(`${a} needs a value`); opts[a.slice(2)] = args[++i]; continue; }
    if (a.startsWith('--')) fail(`unexpected argument: ${a}`);
    words.push(a);
  }
  if (words.length !== 1) fail('plates audit run names one lens');
  return { name: words[0], provider: opts.provider ?? null, quota: opts.quota ?? null, quotaUrl: opts['quota-url'] ?? null, yes };
}
