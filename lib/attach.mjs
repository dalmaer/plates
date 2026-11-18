// Attach an agent to a phase (plates phase 181; docs/specs/web-backlog.md,
// "Agents join"). The first backlog write. The contract, the same for every
// route:
//
//   1. Preview: the exact effect (claim ref, provider, route, the brief's bytes
//      and digest, the budget charged) and its digest. Nothing is written; the
//      CLI exits 3 until --yes.
//   2. Claim: the existing create-only claim (lib/claim.mjs claim), read back.
//      If another holder won, "taken by <holder>": nothing is dispatched, and
//      the claim is never retried onto theirs.
//   3. Journal the intent before any dispatch, under the checkout's git dir
//      (never committed, as claim tokens are kept). The intent is create-only:
//      of two attaches of one digest, one writes it and may dispatch; the
//      other recovers (5). A host route also takes the phase's one host slot,
//      create-only, so two digests of one phase never both run a host.
//   4. Decide the attach's fate, create-only: "dispatch", unless a cancel got
//      there first (see Cancel). Then dispatch the route and keep the receipt,
//      create-only: a receipt already kept is adopted, never replaced.
//   5. An intent with no receipt is an uncertain dispatch: the next attach
//      with the same digest recovers it through the route's recover(), and
//      never dispatches again. A receipt already there is returned as it is,
//      and the dispatcher's own receipt is read before a recovered one.
//   6. A backlog event (lib/backlog-events.mjs, phase 184), metadata only and
//      best effort: a failed write is the result's eventNote, never a failure.
//
// Routes built here: `session` (the claim, then the /spin <n> brief for the
// owner to open in Claude Code or Codex; no process is started) and, phase
// 183, `local-host` (the claim, then the owner's own local agent host is run
// once with the brief; see "The local host contract" below). The plate's
// `backlog.routes` policy says which routes it offers (absent: session only);
// a route it offers that is not built here is refused, saying so.
import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir, rename, rm, stat, lstat, access, chmod, constants, realpath, link, unlink, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute, sep, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offeredRoutes } from './web/agents-model.mjs';

export class AttachError extends Error { constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; } }

/** The routes this build can start. The rest are listed in the spec and refused here until they are built. */
export const BUILT_ROUTES = Object.freeze(['session', 'local-host']);
const sha256 = text => createHash('sha256').update(text).digest('hex');
/** JSON with sorted keys: the digest of an effect does not depend on how it was built. */
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);

/** The /spin brief a session route hands the owner: plain text, the same bytes every time for the same phase. */
export function sessionBrief({ projectId, phase, title, provider }) {
  return [`Phase ${phase}: ${title} (${projectId})`, `Claimed for ${provider} on claims/phase-${phase}.`,
    `Open ${provider === 'codex' ? 'Codex' : 'Claude Code'} in this plate's checkout and run:`, '', `  /spin ${phase}`, '',
    `Decision context: plates decision context --phase ${phase} --json`, `Release, if it will not be built: plates phase claim ${phase} --release`].join('\n');
}

// ---- The local host contract (phase 183) -------------------------------------
//
// A local agent host is a command on the owner's machine that starts an agent
// session in a plate's checkout. It is configured privately, never in a
// committed file: $XDG_CONFIG_HOME/plates/local-hosts.json (else
// ~/.config/plates/local-hosts.json), keyed by the provider name the host
// claims with, which must be a key of the plate's `agents`:
//
//   { "hosts": { "<provider>": { "start": ["/abs/path/host", "arg"...],
//                                "state": ["/abs/path/host", "state"] } } }
//
// Start: plates runs `start... <checkout path>` once, in the checkout, with
// the brief on stdin, byte for byte the preview's. It prints a session id
// (one line, [A-Za-z0-9._:-], at most 128) and exits 0. State (optional):
// plates runs `state... <session id>`; it prints one of HOST_STATES. Anything
// else, or no state command, is a silent host: its card says only "claimed".
// Stop (optional): `stop... <session id>`, run only when the owner cancels the
// attach (plates home --cancel); exit 0 is stopped. All run with argv (no
// shell), bounded in time and output, and with an environment of PATH, HOME,
// user, shell, locale and temp only: no token or credential plates holds is
// passed. Plates never stops or restarts a host on its own.
//
// Harness (phase 193): a host may instead, or as well, name
// `"harness": ["/abs/path/agent", "arg"...]`, the agent itself, run in the
// checkout, and `"prompt": "stdin" | "arg"`, how it takes the brief: on stdin
// (a headless agent) or as its startup prompt, its last argument, with the
// tab's terminal kept as its stdin (an interactive agent). Without `prompt`,
// a `claude` or `codex` harness is interactive ("arg") unless its arguments
// make it headless (`-p`/`--print`, `exec`); any other harness reads stdin.
// When Rex answers on this machine (see
// "Rex" below) the harness runs in a labelled Rex tab the owner can watch;
// otherwise start/state run as above, and a host with only a harness says it
// cannot start. Rex reports terminal sessions and presence; plates does not own it.

/** What a local host's state query may answer. */
export const HOST_STATES = Object.freeze(['starting', 'running', 'waiting', 'finished', 'failed']);
const SESSION = /^[A-Za-z0-9._:-]{1,128}$/;
/** A run plates opened in Rex: `rex:<session id>/<block id>`. Kept apart from SESSION so a host's own id never carries a slash. */
export const REX_RECEIPT = /^rex:([A-Za-z0-9._:-]{1,128})\/([A-Za-z0-9._:-]{1,128})$/;
/** A session id a route may keep: a host's own, or a Rex receipt. */
export const isHostSession = s => SESSION.test(String(s ?? '')) || REX_RECEIPT.test(String(s ?? ''));
const HOST_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM'];
/** The owner's private host configuration file. */
export const localHostsFile = (env = process.env) => join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'plates', 'local-hosts.json');
const argv = v => Array.isArray(v) && v.length >= 1 && v.length <= 16 && v.every(a => typeof a === 'string' && a.length <= 1024 && !/[\x00]/.test(a)) && isAbsolute(v[0]);

/** The host configured for a provider: { file, start, state, harness } (start/state or harness may be null). Refused when it is missing, malformed, or inside the checkout (a committed file). */
export async function readLocalHost({ root, provider, env = process.env }) {
  const file = localHostsFile(env);
  if (resolve(file).startsWith(resolve(root) + sep)) throw new AttachError(`${file} is inside this checkout; a local host is configured outside any repo`);
  let config;
  try { config = JSON.parse(await readFile(file, 'utf8')); } catch (error) { throw new AttachError(error.code === 'ENOENT' ? `no local agent host is configured: write ${file} (see docs/guide/web-home.md)` : `${file} could not be read: ${error.code ?? error.message}`); }
  const host = config?.hosts?.[provider];
  if (!host) throw new AttachError(`${file} has no host for ${provider} (hosts: ${Object.keys(config?.hosts ?? {}).join(', ') || 'none'})`);
  if (host.harness !== undefined && !argv(host.harness)) throw new AttachError(`${file}: hosts.${provider}.harness, when present, is an argv array whose first entry is an absolute path`);
  if ((host.harness === undefined || host.start !== undefined) && !argv(host.start)) throw new AttachError(`${file}: hosts.${provider}.start is an argv array whose first entry is an absolute path${host.harness === undefined ? ' (or name a harness)' : ''}`);
  if (host.state !== undefined && !argv(host.state)) throw new AttachError(`${file}: hosts.${provider}.state, when present, is an argv array whose first entry is an absolute path`);
  if (host.stop !== undefined && !argv(host.stop)) throw new AttachError(`${file}: hosts.${provider}.stop, when present, is an argv array whose first entry is an absolute path`);
  if (host.prompt !== undefined && (host.harness === undefined || !PROMPTS.includes(host.prompt))) throw new AttachError(`${file}: hosts.${provider}.prompt, when present, is ${PROMPTS.map(p => `"${p}"`).join(' or ')} and goes with a harness`);
  return { file, start: host.start ? [...host.start] : null, state: host.state ? [...host.state] : null, harness: host.harness ? [...host.harness] : null, ...(host.harness ? { prompt: harnessPrompt({ harness: host.harness, prompt: host.prompt }) } : {}), ...(host.stop ? { stop: [...host.stop] } : {}) };
}

/** codex's options that take a value as the next argument (`--model m`), so that value is never read as its subcommand. */
const CODEX_VALUE_OPTIONS = new Set(['-m', '--model', '-p', '--profile', '-c', '--config', '-s', '--sandbox', '-a', '--ask-for-approval', '-C', '--cd', '-i', '--image', '--add-dir', '--local-provider', '--enable', '--disable']);
/** codex's subcommand: its first argument that is neither an option nor an option's value; null when there is none. */
function codexSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return args[i + 1] ?? null;
    if (a.startsWith('-')) { if (!a.includes('=') && CODEX_VALUE_OPTIONS.has(a)) i++; continue; }
    return a;
  }
  return null;
}

/** How a harness takes its brief: on stdin, or as its startup prompt (its last argument). */
export const PROMPTS = Object.freeze(['stdin', 'arg']);
/**
 * A harness's prompt mode: the host's own `prompt` when it names one; else a
 * `claude` or `codex` TUI takes its first prompt as an argument and needs the
 * tab's terminal on stdin, unless its arguments make it headless
 * (`claude -p`/`--print`, `codex exec`), which reads stdin; anything else, stdin.
 */
export function harnessPrompt({ harness, prompt } = {}) {
  if (PROMPTS.includes(prompt)) return prompt;
  const name = String(harness?.[0] ?? '').split('/').pop(), rest = (harness ?? []).slice(1);
  if (name === 'claude') return rest.some(a => a === '-p' || a === '--print' || a.startsWith('--print=')) ? 'stdin' : 'arg';
  if (name === 'codex') return ['exec', 'e'].includes(codexSubcommand(rest)) ? 'stdin' : 'arg';
  return 'stdin';
}

const WORKER_SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKER_PROVIDER = /^[a-z][a-z0-9-]{0,39}$/;

/** The environment a host runs with: nothing plates holds beyond the basics. */
export const hostEnv = (env = process.env) => Object.fromEntries(HOST_ENV.filter(k => typeof env[k] === 'string').map(k => [k, env[k]]));

/** The environment a launched worker runs with: hostEnv, plus only its scoped Plates worker identity when handed a claim. */
export function workerEnv(env = process.env, { session = null, provider = null } = {}) {
  const base = hostEnv(env);
  if (session === null || session === undefined) return base;
  if (typeof session !== 'string' || !WORKER_SESSION.test(session)) throw new AttachError('invalid worker session identity');
  if (provider !== null && provider !== undefined && (typeof provider !== 'string' || !WORKER_PROVIDER.test(provider))) throw new AttachError('invalid worker provider identity');
  return { ...base, PLATES_SESSION: session, ...(provider ? { PLATES_PROVIDER: provider } : {}) };
}

/** Run one host command: argv, stdin, a time bound and an output cap. { code, stdout } (and stderr when asked) or throws. */
export function runHost(command, { cwd, input = '', env, timeoutMs = 60_000, maxBytes = 64 * 1024, stderr = false }) {
  return new Promise((done, fail) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['pipe', 'pipe', stderr ? 'pipe' : 'ignore'] });
    let out = '', err = '', settled = false;
    const closePipes = () => {
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        if (!stream) continue;
        stream.removeAllListeners('data');
        if (!stream.destroyed) stream.destroy();
      }
    };
    const cut = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL'); } catch { /* gone */ } }
      child.stdin.destroy();
      // Descendants may still write to these pipes. Discard their output without
      // breaking the writers or keeping this process alive after the deadline.
      for (const stream of [child.stdout, child.stderr]) {
        if (!stream) continue;
        stream.removeAllListeners('data');
        stream.resume();
        stream.unref();
      }
      child.unref();
      fail(new AttachError(`the host command ${command[0]} ran past its bound (${timeoutMs} ms or ${maxBytes} bytes); the host command wrapper was closed, and any work it started may still be running`, 1));
    };
    const timer = setTimeout(cut, Math.max(1, Math.ceil(timeoutMs)));
    child.stdin.on('error', () => {});
    child.stdout.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; if (Buffer.byteLength(out) > maxBytes) cut(); });
    if (stderr) {
      child.stderr.on('error', () => {});
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => { err += chunk; if (Buffer.byteLength(err) > maxBytes) cut(); });
    }
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closePipes();
      fail(new AttachError(`the host command ${command[0]} could not run: ${error.code ?? error.message}`, 1));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(stderr ? { code, stdout: out, stderr: err } : { code, stdout: out });
    });
    child.stdin.end(input);
  });
}

/**
 * A host's answer to its state query, or null (no state command, an error, or
 * a word not in HOST_STATES): silent. A Rex receipt is read from Rex instead
 * (rexState); `artifact` is the caller's check that a run's own output exists.
 */
export async function hostState({ state, session, env = process.env, timeoutMs = 10_000, artifact = null }) {
  if (REX_RECEIPT.test(String(session ?? ''))) return rexState({ receipt: session, env, artifact, timeoutMs });
  if (!state || !SESSION.test(String(session ?? ''))) return null;
  try { const r = await runHost([...state, session], { cwd: homedir(), env: hostEnv(env), timeoutMs }); const word = r.stdout.trim(); return r.code === 0 && HOST_STATES.includes(word) ? word : null; } catch { return null; }
}

// ---- Rex (phase 193) ------------------------------------------------------------
//
// Rex reports terminal sessions and presence; plates does not own it. Plates
// uses Rex only when a `rex` executable is on the host environment's PATH
// (resolved here, never by a shell) and `rex ls --json` answers JSON within
// 5 s; anything else is "no Rex", silently. With Rex, a run is one new tab,
// keep-open and unfocused, in the session labelled `<plate>-<provider>`
// (reused when one has exactly that label, else created). The tab runs
// lib/rex-run.mjs, which reads the brief from a private file and hands it to
// the harness on stdin, or (prompt "arg") as its startup prompt with the tab's
// terminal as its stdin: the brief stays in its private file, the startup
// prompt only names the file, and the runner removes it when the harness exits
// or the tab closes. The brief is never in any argv, the environment or the
// terminal. Plates reads `rex ls`, and calls only `new`,
// `run` and `wait`: never send, send-key, close, rename or kill, and never a
// tab or session beyond the one tab it opened. Rex's CLI is a preview: only
// session_id, label, block_id(s) and exit_code are read, and anything
// unexpected is no Rex (detection) or failed (state).

const REX_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const REX_RUN = fileURLToPath(new URL('./rex-run.mjs', import.meta.url));
/** plates's state directory, as lib/not-now.mjs's stateDir (not imported: the CLI's import closure is capped). */
const platesState = env => join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'plates');
const slug = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The Rex session label for a plate and provider: `<plate>-<provider>`, lowercased, each run of other characters one hyphen. */
export function rexLabel(plate, provider) {
  const p = slug(plate), a = slug(provider);
  if (!p || !a) throw new AttachError(`a Rex session label needs the plate's name and the provider (${JSON.stringify(plate)}, ${JSON.stringify(provider)})`);
  return `${p}-${a}`;
}

/** The absolute path of `rex` on the host environment's PATH, or null. */
export async function rexBin(env = process.env) {
  for (const dir of String(hostEnv(env).PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir)) continue;
    const file = join(dir, 'rex');
    try { if ((await stat(file)).isFile()) { await access(file, constants.X_OK); return file; } } catch { /* not here */ }
  }
  return null;
}

const rexSessions = v => {
  const list = Array.isArray(v) ? v : Array.isArray(v?.sessions) ? v.sessions : null;
  return list ? list.filter(s => s && typeof s === 'object' && typeof s.session_id === 'string').map(s => ({ session_id: s.session_id, label: typeof s.label === 'string' ? s.label : null })) : null;
};

/** Rex, when it is usable here: { bin, sessions } from `rex ls --json`; else null, silently. */
export async function findRex({ env = process.env, timeoutMs = 5_000 } = {}) {
  const bin = await rexBin(env);
  if (!bin) return null;
  try {
    const r = await runHost([bin, 'ls', '--json'], { cwd: homedir(), env: hostEnv(env), timeoutMs, maxBytes: 1024 * 1024 });
    const sessions = r.code === 0 ? rexSessions(JSON.parse(r.stdout)) : null;
    return sessions ? { bin, sessions } : null;
  } catch { return null; }
}

/**
 * A brief holds decision context, so its directory must never resolve inside
 * the checkout or any git working tree (XDG_STATE_HOME pointed into a repo, or
 * a symlink there): a brief left behind by a stopped run could be committed.
 * The same boundary as an audit run's directory. Checked before anything is made.
 */
export async function briefsOutsideRepositories(dir, checkout, env) {
  let at = dir;
  for (;;) {
    try { at = await realpath(at); break; } catch { const up = dirname(at); if (up === at) throw new AttachError(`the brief directory ${dir} has no existing ancestor; nothing was started`); at = up; }
  }
  const top = await realpath(checkout);
  if (at === top || at.startsWith(top + sep)) throw new AttachError(`refused: the brief directory ${dir} resolves inside this checkout (${top}); set XDG_STATE_HOME outside it. Nothing was started.`);
  // Only git's own "not a git repository" (exit 128) is outside one. Any other failure (no git, a timeout, a repository
  // git will not read) is not known to be outside, so nothing is written.
  const asked = await new Promise(done => execFile('git', ['-C', at, 'rev-parse', '--show-toplevel'], { env: { ...hostEnv(env), LC_ALL: 'C' }, timeout: 10_000 }, (error, stdout, stderr) => done({ error, inside: String(stdout).trim(), stderr: String(stderr) })));
  if (asked.error && !(asked.error.code === 128 && /not a git repository/i.test(asked.stderr))) throw new AttachError(`refused: whether the brief directory ${dir} is inside a git working tree could not be checked (git: ${asked.stderr.trim().split('\n')[0] || asked.error.code || asked.error.message}); a brief never lands in a repository. Nothing was started.`);
  if (!asked.error) throw new AttachError(`refused: the brief directory ${dir} resolves inside the git working tree ${asked.inside}; a brief never lands in a repository. Nothing was started.`);
}

const BRIEF_NAME = /^[0-9a-f]{32}$|^[0-9a-f]{64}$/;
/**
 * The private file a brief named `name` is written to: an attach names it by
 * its digest, so recovery after a restart (or a SIGKILL before the receipt was
 * written) can find and remove it from the journal alone. Null for a name that
 * is not one plates makes.
 */
export const rexBriefFile = (env, name) => BRIEF_NAME.test(String(name ?? '')) ? join(platesState(env), 'rex-briefs', `${name}.brief`) : null;

const briefsDir = env => join(platesState(env), 'rex-briefs');
/** Write a brief to a new mode-600 file in a private directory under plates's state directory; its path. The caller has checked the directory (briefsOutsideRepositories). */
async function writeBriefFile(brief, env, checkout, name = null) {
  const dir = briefsDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const file = rexBriefFile(env, name ?? randomBytes(16).toString('hex'));
  await writeFile(file, brief, { mode: 0o600, flag: 'wx' });
  return file;
}

/**
 * Start a harness in Rex: find or create the `<plate>-<provider>` session, then
 * open one tab running lib/rex-run.mjs with the brief file and the harness.
 * Every Rex call runs with hostEnv only, inside one `timeoutMs` bound (a
 * monotonic clock's: a wall-clock step neither cuts it short nor extends it).
 * `before`, when given, is awaited immediately before `rex run`: it throws
 * to leave the run unstarted (a cancel that landed meanwhile).
 * Returns { session: 'rex:<session>/<block>', label, created, tab }.
 */
export async function rexDispatch({ rex, plate, provider, label: given = null, checkout, harness, prompt = null, brief, briefName = null, tab, session: workerSession = null, env = process.env, timeoutMs = 60_000, before = null }) {
  if (workerSession !== null) workerEnv(env, { session: workerSession, provider });
  const label = given ?? rexLabel(plate, provider), deadline = performance.now() + timeoutMs;
  // Before anything is made in Rex: a brief directory inside a repository refuses the run, and no session is created for it.
  await briefsOutsideRepositories(briefsDir(env), checkout, env);
  const call = async args => {
    const left = Math.ceil(deadline - performance.now());
    if (left <= 0) throw new AttachError(`Rex did not answer within ${timeoutMs} ms`, 1);
    const r = await runHost([rex.bin, ...args], { cwd: checkout, env: hostEnv(env), timeoutMs: left });
    if (r.code !== 0) throw new AttachError(`rex ${args[0]} exited ${r.code}`, 1);
    try { return JSON.parse(r.stdout); } catch { throw new AttachError(`rex ${args[0]} answered no JSON`, 1); }
  };
  let session = rex.sessions.find(s => s.label === label)?.session_id ?? null, created = false;
  if (!session) { session = (await call(['new', label, '-c', checkout, '--json']))?.session_id; created = true; }
  if (!REX_ID.test(String(session ?? ''))) throw new AttachError(`rex new answered no session id for ${label}`, 1);
  const file = await writeBriefFile(brief, env, checkout, briefName);
  const workerFile = workerSession ? `${file}.worker` : null;
  let madeWorker = false;
  try {
    if (workerFile) {
      const wh = await open(workerFile, 'wx', 0o600);
      madeWorker = true;
      try { await wh.writeFile(`${JSON.stringify({ session: workerSession, ...(provider ? { provider } : {}) })}\n`); } finally { await wh.close(); }
    }
    if (before) await before();
    const out = await call(['run', '-s', session, '-c', checkout, '--label', tab, '--keep-open', '--focus=false', '--json', '--', process.execPath, REX_RUN, ...(harnessPrompt({ harness, prompt }) === 'arg' ? ['--prompt=arg'] : []), file, '--', ...harness]);
    const block = typeof out?.block_id === 'string' ? out.block_id : Array.isArray(out?.block_ids) ? out.block_ids[0] : null;
    if (!REX_ID.test(String(block ?? ''))) throw new AttachError('rex run answered no block id', 1);
    return { session: `rex:${session}/${block}`, label, created, tab, briefFile: file };
  } catch (error) {
    if (madeWorker) await rm(workerFile, { force: true });
    await rm(file, { force: true }); // the runner may never read it; a brief is never left behind
    throw error;
  }
}

/**
 * A Rex run's state: `rex wait --for 1s --json` printing {"exit_code":N} has
 * exited (0 is finished only when `artifact`, if given, says the run's output
 * is there; else failed). While the program runs, Rex (0.1.0-preview.18) exits
 * 1 with "wait timed out" on stderr: running. A block or session Rex does not
 * know ("not found", exit 3), or any other answer, is failed. No `rex` on PATH, or an unreadable
 * receipt: null (unknown, silent). Plates never stops a run.
 */
export async function rexState({ receipt, env = process.env, artifact = null, timeoutMs = 10_000 }) {
  const m = REX_RECEIPT.exec(String(receipt ?? ''));
  const bin = m && await rexBin(env);
  if (!bin) return null;
  let r;
  try { r = await runHost([bin, 'wait', '-s', m[1], m[2], '--for', '1s', '--json'], { cwd: homedir(), env: hostEnv(env), timeoutMs, stderr: true }); } catch { return null; }
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
  if (Number.isInteger(out?.exit_code)) return out.exit_code === 0 && (!artifact || await artifact()) ? 'finished' : 'failed';
  if (/\bwait timed out\b/.test(r.stderr)) return 'running';
  return 'failed';
}

/**
 * Start a host's run the way it can: in Rex when the host names a harness and
 * Rex answers; else its start command, as phase 183 built it. A host with only
 * a harness and no Rex is refused, saying why. `before` is awaited immediately
 * before `rex run` or the start command. { session, via, rex? }.
 */
export async function startHost({ host, plate, provider, label = null, checkout, brief, briefName = null, tab, session = null, env = process.env, find = findRex, before = null, timeoutMs = 60_000 }) {
  const deadline = performance.now() + timeoutMs;
  const rex = host.harness ? await find({ env, timeoutMs: Math.min(5_000, Math.max(1, Math.ceil(timeoutMs))) }) : null;
  if (rex) {
    const rem = Math.ceil(deadline - performance.now());
    if (rem <= 0) throw new AttachError(`Rex did not answer within ${timeoutMs} ms`, 1);
    const r = await rexDispatch({ rex, plate, provider, label, checkout, harness: host.harness, prompt: host.prompt ?? null, brief, briefName, tab, session, env, before, timeoutMs: rem });
    return { session: r.session, via: 'rex', rex: { label: r.label, created: r.created, tab: r.tab }, briefFile: r.briefFile };
  }
  if (!host.start) throw new AttachError(`this host names only a harness, and Rex is not answering here (no rex on PATH, or rex ls --json failed): nothing was started. Start Rex, or add a start command to ${host.file ?? 'local-hosts.json'}`, 2);
  const rem = host.harness ? Math.ceil(deadline - performance.now()) : timeoutMs;
  if (rem <= 0) throw new AttachError(`the host command ${host.start[0]} ran past its bound (${timeoutMs} ms)`, 1);
  if (before) await before(); // immediately before the host is run: it throws to leave it unstarted
  const r = await runHost([...host.start, checkout], { cwd: checkout, input: brief, env: workerEnv(env, { session, provider }), timeoutMs: rem });
  return { session: r.stdout.split('\n')[0].trim(), code: r.code, via: 'start' };
}

/**
 * The brief a local host receives on stdin: the phase, its Done when and
 * Acceptance as the phase file says them, the current decisions (plates
 * decision context), then how to build it. The same bytes every time for the
 * same inputs; the preview shows exactly these.
 */
export function hostBrief({ projectId, phase, title, provider, doneWhen, acceptance, context }) {
  const c = context ?? {};
  const decision = d => `- ${d.ref} (${(d.scope ?? []).join(', ')}): ${d.statement}${d.decided_by ? ` (decided by ${d.decided_by}${d.decided_at ? ` on ${d.decided_at}` : ''})` : ''}`;
  return [`Phase ${phase}: ${title} (${projectId})`, `Claimed for ${provider} on claims/phase-${phase}, by route local-host.`, '',
    '## Done when', '', String(doneWhen ?? '').trim() || '(not written)', '', '## Acceptance', '', String(acceptance ?? '').trim() || '(not written)', '',
    `## Current decisions (decision context: ${c.state ?? 'unavailable'}${c.digest ? `, digest ${c.digest}` : ''})`, '',
    ...((c.decisions ?? []).length ? c.decisions.map(decision) : ['None accepted.']),
    ...((c.proposals ?? []).length ? ['', 'Proposed, not decided:', ...c.proposals.map(decision)] : []),
    ...((c.gaps ?? []).length ? ['', 'Gaps (resolve before building on them):', ...c.gaps.map(g => `- ${g.code} ${g.ref ?? ''}: ${g.message ?? ''}`.trim())] : []),
    '', '## How to build it', '', `Run /spin ${phase} in this checkout, or follow AGENTS.md. Land it through plates ready and plates integrate.`,
    `Release, if it will not be built: plates phase claim ${phase} --release`,
    `If this session restarts or resumes, first run: plates home --cancel ${projectId}:phase:${phase} --check. If it says cancelled (exit 1), stop: do not continue, and do not claim the phase again.`, ''].join('\n');
}

/**
 * The preview: { effect, digest }. effect: { schema, projectId, phase, title,
 * claimRef, provider, route, brief: { bytes, sha256, text }, budget }. The
 * digest covers every field: a change to any of them is a different attach.
 */
export function attachPreview({ projectId, phase, title, route, provider, phaseText, host, plate = projectId }) {
  if (!BUILT_ROUTES.includes(route)) throw new AttachError(`route ${route} is not built yet; this build attaches ${BUILT_ROUTES.join(', ')}`);
  const local = route === 'local-host';
  if (local && (!host || !phaseText)) throw new AttachError('a local-host attach needs its configured host and the phase\'s Done when, Acceptance and decision context');
  const text = local ? hostBrief({ projectId, phase, title, provider, ...phaseText }) : sessionBrief({ projectId, phase, title, provider });
  const effect = { schema: 1, projectId, phase, title, claimRef: `refs/heads/claims/phase-${phase}`, provider, route,
    brief: { bytes: Buffer.byteLength(text), sha256: sha256(text), text },
    // A host without a harness keeps phase 183's effect, and so its digest, byte for byte.
    ...(local ? { host: { config: host.file, start: host.start, state: host.state, ...(host.harness ? { harness: host.harness, prompt: harnessPrompt(host), rex: { label: rexLabel(plate, provider), tab: `phase-${phase}` } } : {}) } } : {}),
    budget: { minutes: null, from: local ? 'none: a local host spends the owner\'s own agent time on this machine, not a plates allowance' : 'none: a session spends the owner\'s own agent time, not a plates allowance' } };
  return { effect, digest: sha256(canonical(effect)) };
}

/** Which route a plate offers, or why not: the policy first (absent: session only), then whether this build has it. */
export function checkRoute(config, route) {
  const { on, off } = offeredRoutes(config);
  if (!on.includes(route)) throw new AttachError(off[route] ? `route ${route} is off: ${off[route].why} (${off[route].key})` : `no route ${route}; routes: ${on.join(', ') || 'none'}`);
  if (!BUILT_ROUTES.includes(route)) throw new AttachError(`route ${route} is offered by this plate's policy but not built yet; attach with --route ${BUILT_ROUTES.join(' or ')}`);
  return on;
}

/**
 * The journal: files under the checkout's git dir, each one small fact. Every
 * create-only file is made whole and synced, then linked (a whole file or
 * none; the first link is the only one), and the directory is synced:
 *
 *   <digest>.json            { intent, receipt? }: the intent create-only; the receipt a copy of the kept one
 *   <digest>.receipt.json    the dispatcher's receipt, create-only
 *   <digest>.recovered.json  a recovering attach's receipt, create-only; read only when no other receipt is there
 *   <digest>.fate.json       { fate: 'dispatch' | 'cancel' }, create-only: the one decision a dispatch and a cancel race
 *   <digest>.cancel.json     the cancel's record, create-only, before any of its effects
 *   <digest>.cancelled.json  the cancel's effects, as last settled (replaced)
 *   <digest>.attaching.<nonce>.json  one attach invocation is taking its claim; removed, by that invocation only,
 *                            once its intent is journaled or it was refused; not counted once an hour old
 *   phase-<n>.cancel.json    the phase's cancel, create-only: it needs no entry, so it reaches an attach still claiming
 *   phase-<n>.<route>.json   the one attach (digest) a host route is run for in this phase, create-only
 *
 * Only attach writes an entry or a receipt; only a cancel writes its record
 * and effects. Every reader (a second cancel, a dispatch finishing, a
 * restarted plates) sees the same records.
 */
export function attachJournal(dir) {
  const safe = v => String(v).replace(/[^A-Za-z0-9_-]/g, '_');
  const file = digest => join(dir, `${digest}.json`);
  const cancelFile = digest => join(dir, `${digest}.cancel.json`);
  // A cancel's effects are kept in their own file, never in the entry: settling a cancel can never overwrite a receipt a
  // dispatch writes meanwhile, because only attach writes `<digest>.json`.
  const effectsFile = digest => join(dir, `${digest}.cancelled.json`);
  const fateFile = digest => join(dir, `${digest}.fate.json`);
  const receiptFile = (digest, recovered = false) => join(dir, `${digest}.${recovered ? 'recovered' : 'receipt'}.json`);
  const attemptFile = (digest, nonce) => join(dir, `${digest}.attaching.${nonce}.json`);
  const ATTEMPT = /^([0-9a-f]{64})\.attaching\.([0-9a-f]{16})\.json$/, ATTEMPT_AGE = 60 * 60_000;
  const phaseCancelFile = phase => join(dir, `phase-${safe(phase)}.cancel.json`);
  const phaseClearFile = (phase, id) => join(dir, `phase-${safe(phase)}.clear.${safe(id)}.json`);
  const phaseClearDoneFile = (phase, id) => join(dir, `phase-${safe(phase)}.clear.${safe(id)}.done.json`);
  const phaseClearLockFile = (phase, id) => join(dir, `phase-${safe(phase)}.clear.${safe(id)}.lock.json`);
  const CLEAR_LOCK = /^phase-[A-Za-z0-9_-]+\.clear\.[0-9a-f]{64}\.lock\.json$/, CLEAR_LOCK_AGE = 60_000;
  const archivedFile = (id, name) => join(dir, `cleared-${safe(id).slice(0, 32)}-${name}.archived.json`);
  const slotFile = (phase, route) => join(dir, `phase-${safe(phase)}.${safe(route)}.json`);
  const unread = (what, path, error) => new AttachError(`the attach journal${what} ${path} could not be read: ${error.code ?? error.message}; nothing is dispatched until it is`, 1);
  /** A file's JSON; null when it is not there; throws when it is there and cannot be read. */
  const json = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const quiet = path => json(path).catch(() => null);
  const syncDir = async () => { try { const h = await open(dir, 'r'); try { await h.sync(); } finally { await h.close(); } } catch { /* a platform that cannot sync a directory */ } };
  /** The value, whole and synced, in a private temporary file beside its target. */
  const staged = async (target, value) => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const h = await open(tmp, 'wx', 0o600);
    try { await h.writeFile(`${JSON.stringify(value, null, 2)}\n`); await h.sync(); } finally { await h.close(); }
    return tmp;
  };
  /** Create-only and atomic: true when this call made the file, false when it was already there (and is left as it is). */
  const create = async (target, value) => {
    const tmp = await staged(target, value);
    try { await link(tmp, target); await syncDir(); return true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; return false; }
    finally { await unlink(tmp).catch(() => {}); }
  };
  /** Replace, whole or not at all. */
  const replace = async (target, value) => {
    const tmp = await staged(target, value);
    try { await rename(tmp, target); } catch (error) { await unlink(tmp).catch(() => {}); throw error; }
    await syncDir();
  };
  /**
   * Archive `from` create-only under `to` and unlink `from` only when its parsed JSON passes `verify`
   * (when given) and its inode matches `to`. If `to` already existed from an interrupted clear and
   * `from` was recreated since by a fresh attach, their inodes differ and `from` is never unlinked.
   */
  const retireCompare = async (from, to, verify = null) => {
    let before;
    try { before = await lstat(from); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (verify) {
      let value;
      try { value = JSON.parse(await readFile(from, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      if (!verify(value)) return false;
      let again;
      try { again = await lstat(from); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      if (again.dev !== before.dev || again.ino !== before.ino) return false;
    }
    try { await link(from, to); }
    catch (error) {
      if (error.code === 'ENOENT') return false;
      if (error.code !== 'EEXIST') throw error;
    }
    let cur, arch;
    try { [cur, arch] = await Promise.all([lstat(from), lstat(to)]); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    if (cur.dev !== arch.dev || cur.ino !== arch.ino) return false;
    try { await unlink(from); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const readEffects = digest => quiet(effectsFile(digest)); // none yet, or torn: the effects are settled again
  const readCancel = async digest => { try { return await json(cancelFile(digest)); } catch (error) { throw unread('\'s cancel', cancelFile(digest), error); } };
  const readPhaseCancel = async phase => { try { return await json(phaseCancelFile(phase)); } catch (error) { throw unread('\'s cancel', phaseCancelFile(phase), error); } };
  const unreadable = (path, error) => ({ unreadable: true, file: path, error: error.message });
  /** The receipt that stands: the dispatcher's own, else the entry's (a journal from before receipts had their own file), else a recovered one. */
  const standing = async (digest, entry) => (await quiet(receiptFile(digest))) ?? entry?.receipt ?? (await quiet(receiptFile(digest, true))) ?? null;
  const whole = async (digest, entry) => { const receipt = await standing(digest, entry); return receipt ? { ...entry, receipt } : entry; };
  const read = async digest => {
    let entry;
    try { entry = await json(file(digest)); } catch (error) { throw unread('', file(digest), error); }
    return entry && typeof entry === 'object' ? whole(digest, entry) : null;
  };
  return {
    cancelOf: readCancel,
    cancelledOf: readEffects,
    read,
    /** A cancel's effects, as last settled (tmp then rename: whole or absent). */
    settled: (digest, value) => replace(effectsFile(digest), value),
    /** Record a cancel, create-only and atomic (a whole file or none): { record, first }. A cancel already there is returned, never replaced. */
    async cancel(digest, record) { return await create(cancelFile(digest), record) ? { record, first: true } : { record: await readCancel(digest), first: false }; },
    /** The phase's cancel, by the same rule: { record, first }. It needs no entry. */
    async cancelPhase(phase, record) { return await create(phaseCancelFile(phase), record) ? { record, first: true } : { record: await readPhaseCancel(phase), first: false }; },
    phaseCancelOf: readPhaseCancel,
    /** Every phase cancel: [{ phase, cancel }]; one that cannot be read is listed as one, never as absent. */
    async phaseCancels() {
      const out = [];
      for (const n of (await readdir(dir).catch(() => [])).sort()) {
        const phase = /^phase-([A-Za-z0-9_-]+)\.cancel\.json$/.exec(n)?.[1];
        if (phase) out.push({ phase, cancel: await json(join(dir, n)).catch(error => unreadable(join(dir, n), error)) });
      }
      return out.filter(x => x.cancel);
    },
    /** Every deliberate cancel clear recorded for a phase, oldest first; unreadable files stay visible. */
    async phaseClears(phase) {
      const clearRe = new RegExp(`^phase-${safe(phase)}\\.clear\\.([0-9a-f]{64})\\.json$`), out = [];
      for (const n of (await readdir(dir).catch(() => [])).sort()) {
        if (!clearRe.test(n)) continue;
        const v = await json(join(dir, n)).catch(error => unreadable(join(dir, n), error));
        if (v) out.push(v);
      }
      return out.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
    },
    /**
     * Record a deliberate cancel clear create-only, then archive and remove the cancelled generation's entries, slots and
     * per-digest/phase cancel files in fail-closed order (`phase-<n>.cancel.json` last), comparing every file against the
     * exact cancel/entry snapshot it read so overlapping clears never delete a fresh attach or a newer cancel.
     */
    async clearPhaseCancel(phase, record, digests = []) {
      const id = record.id;
      const target = phaseClearFile(phase, id), doneTarget = phaseClearDoneFile(phase, id), lockTarget = phaseClearLockFile(phase, id);
      const expectedCancelJson = canonical(record.cancel);
      const checkNoNewerCancel = async () => {
        const activePhaseCancel = await json(phaseCancelFile(phase));
        if (activePhaseCancel && canonical(activePhaseCancel) !== expectedCancelJson) {
          throw new AttachError(`phase ${phase}'s cancel record changed before it could be cleared; inspect the new cancel before clearing`, 1);
        }
        for (const n of await readdir(dir).catch(() => [])) {
          const d = /^([0-9a-f]{64})\.cancel\.json$/.exec(n)?.[1];
          if (!d) continue;
          const dc = await quiet(cancelFile(d));
          if (!dc || canonical(dc) === expectedCancelJson) continue;
          const belongs = dc.phase != null ? String(dc.phase) === String(phase) : String((await quiet(file(d)))?.intent?.effect?.phase) === String(phase);
          if (belongs) throw new AttachError(`phase ${phase}'s cancel record changed before it could be cleared; inspect the new cancel before clearing`, 1);
        }
      };
      if (await quiet(doneTarget)) {
        await checkNoNewerCancel();
        return { record: (await json(target)) ?? record, first: false };
      }
      const deadline = Date.now() + 5_000;
      let locked = false;
      while (Date.now() < deadline) {
        if (await quiet(doneTarget)) {
          await checkNoNewerCancel();
          return { record: (await json(target)) ?? record, first: false };
        }
        if (await create(lockTarget, { pid: process.pid, at: new Date().toISOString() })) { locked = true; break; }
        try {
          const st = await lstat(lockTarget);
          if (Date.now() - st.mtimeMs > CLEAR_LOCK_AGE) {
            const cur = await lstat(lockTarget);
            if (cur.dev === st.dev && cur.ino === st.ino) await unlink(lockTarget).catch(() => {});
            continue;
          }
        } catch { continue; }
        await new Promise(r => setTimeout(r, 10));
      }
      if (!locked) throw new AttachError(`clearing phase ${phase}'s cancel is already in progress; try again`, 1);
      try {
        if (await quiet(doneTarget)) {
          await checkNoNewerCancel();
          return { record: (await json(target)) ?? record, first: false };
        }
        await checkNoNewerCancel();
        const candidateDigests = [...new Set([...(record.digests ?? []), ...digests])];
        const diskPhaseCancel = await json(phaseCancelFile(phase));
        const hasMatchingPhaseCancel = !!diskPhaseCancel && canonical(diskPhaseCancel) === expectedCancelJson;
        let hasMatchingDigestCancel = false;
        for (const d of candidateDigests) {
          const dc = await json(cancelFile(d));
          if (dc && canonical(dc) === expectedCancelJson) hasMatchingDigestCancel = true;
        }
        if (!hasMatchingPhaseCancel && !hasMatchingDigestCancel) {
          const existing = await json(target);
          if (existing) {
            await create(doneTarget, { id: existing.id, at: new Date().toISOString() });
            return { record: existing, first: false };
          }
          throw new AttachError(`phase ${phase} is no longer cancelled by the expected cancel record; nothing cleared`, 1);
        }
        const first = await create(target, record);
        const kept = first ? record : (await json(target)) ?? record;
        const digestSet = new Set([...(kept.digests ?? []), ...digests]);
        const runByDigest = new Map((kept.runs ?? []).map(r => [r.digest, r]));
        const slotRe = new RegExp(`^phase-${safe(phase)}\\.([A-Za-z0-9_-]+)\\.json$`);
        for (const n of await readdir(dir).catch(() => [])) {
          const slot = slotRe.exec(n)?.[1];
          if (slot && slot !== 'cancel') {
            await retireCompare(join(dir, n), archivedFile(kept.id, `phase-${safe(phase)}-slot-${slot}`), v => digestSet.has(v?.digest));
          }
        }
        const eligibleDigests = [];
        for (const digest of digestSet) {
          const dc = await json(cancelFile(digest));
          if (dc && canonical(dc) !== expectedCancelJson) continue;
          const runInfo = runByDigest.get(digest);
          const diskEntry = await quiet(file(digest));
          if (diskEntry && runInfo?.intentSha256 && (!diskEntry.intent || sha256(canonical(diskEntry.intent)) !== runInfo.intentSha256)) continue;
          eligibleDigests.push({ digest, runInfo });
          await retireCompare(effectsFile(digest), archivedFile(kept.id, `${digest}-effects`));
          await retireCompare(fateFile(digest), archivedFile(kept.id, `${digest}-fate`));
          await retireCompare(receiptFile(digest, false), archivedFile(kept.id, `${digest}-receipt`),
            runInfo?.receiptSha256 ? v => sha256(canonical(v)) === runInfo.receiptSha256 : null);
          await retireCompare(receiptFile(digest, true), archivedFile(kept.id, `${digest}-recovered`));
          await retireCompare(file(digest), archivedFile(kept.id, `${digest}-entry`),
            runInfo?.intentSha256 ? v => !!v?.intent && sha256(canonical(v.intent)) === runInfo.intentSha256 : null);
        }
        for (const { digest } of eligibleDigests) {
          await retireCompare(cancelFile(digest), archivedFile(kept.id, `${digest}-cancel`), v => canonical(v) === expectedCancelJson);
        }
        await retireCompare(phaseCancelFile(phase), archivedFile(kept.id, `phase-${safe(phase)}-cancel`), v => canonical(v) === expectedCancelJson);
        await create(doneTarget, { id: kept.id, at: new Date().toISOString() });
        await syncDir();
        return { record: kept, first };
      } finally {
        await unlink(lockTarget).catch(() => {});
      }
    },
    /**
     * The one decision a dispatch and a cancel race: `want` is linked create-only. { fate, first }: the fate that stands
     * (null when it cannot be read) and whether this call decided it. The loser yields.
     */
    async fate(digest, want, at = null) { return await create(fateFile(digest), { fate: want, ...(at ? { at } : {}) }) ? { fate: want, first: true } : { fate: (await quiet(fateFile(digest)))?.fate ?? null, first: false }; },
    /** The intent, create-only: { first, entry }. A second attach of the digest gets the entry already there and never dispatches. */
    async intent(digest, intent) { return await create(file(digest), { intent }) ? { first: true, entry: { intent } } : { first: false, entry: await read(digest) }; },
    /**
     * Keep a receipt, create-only: { receipt, first }, the receipt that stands and whether it is this one. A dispatcher's
     * receipt has its own file, which only the attach that wrote the intent makes. A recovered receipt
     * (result.recovered) is kept only when no receipt is there at all, read again now, not as the caller read it.
     */
    async receipt(digest, { intent, receipt }) {
      const recovered = !!receipt?.result?.recovered;
      const first = recovered ? !(await read(digest))?.receipt && await create(receiptFile(digest, true), receipt) : await create(receiptFile(digest), receipt);
      const entry = await quiet(file(digest)), kept = await standing(digest, entry) ?? receipt;
      // The entry's copy, for a reader of the one file (an older plates). Readers here go by the receipt files.
      await replace(file(digest), { intent: entry?.intent ?? intent, receipt: kept });
      return { receipt: kept, first: !!first };
    },
    /** The one attach a host route is run for in a phase, create-only: { digest, at, first }. */
    async slot(phase, route, digest, at) {
      if (await create(slotFile(phase, route), { digest, at })) return { digest, at, first: true };
      let held; try { held = await json(slotFile(phase, route)); } catch (error) { throw unread('\'s host slot', slotFile(phase, route), error); }
      return { digest: held?.digest ?? null, at: held?.at ?? null, first: false, file: slotFile(phase, route) };
    },
    /**
     * An attach is taking its claim, so a cancel has something to cancel before any intent is journaled. The marker is
     * this invocation's own (a nonce): attempt() returns it, and attempted(marker) removes that one only, so another
     * attach of the same digest finishing first never removes the marker of one still claiming. A killed attach's marker
     * is not counted once it is an hour old (no claim takes that long), and the sweep then removes it.
     */
    async attempt(digest, value) { const marker = attemptFile(digest, randomBytes(8).toString('hex')); await create(marker, value); return marker; },
    attempted: marker => unlink(marker).catch(() => {}),
    async attempts(now = Date.now()) {
      const out = [];
      for (const n of (await readdir(dir).catch(() => [])).sort()) {
        const digest = ATTEMPT.exec(n)?.[1];
        if (!digest) continue;
        try { if (now - (await stat(join(dir, n))).mtimeMs > ATTEMPT_AGE) continue; } catch { continue; }
        const v = await quiet(join(dir, n)); if (v) out.push({ digest, ...v });
      }
      return out;
    },
    /** Temporary files a killed write left (each holds a copy of what it was writing) are removed once a minute old; a killed attach's claiming marker once an hour old. */
    async sweep(now = Date.now()) {
      for (const n of await readdir(dir).catch(() => [])) {
        const age = n.endsWith('.tmp') ? 60_000 : CLEAR_LOCK.test(n) ? CLEAR_LOCK_AGE : ATTEMPT.test(n) ? ATTEMPT_AGE : null;
        if (age === null) continue;
        try { if (now - (await stat(join(dir, n))).mtimeMs > age) await unlink(join(dir, n)); } catch { /* gone, or another writer's */ }
      }
    },
    /**
     * Every attach the journal knows, from the union of entry and cancel files: an entry that cannot be read (or is not
     * there) but has a cancel is listed as { digest, torn, cancel }, cancelled with nothing else known, never dropped.
     * A torn entry with no cancel is not listed.
     */
    async list() {
      let names;
      try { names = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const out = [];
      for (const digest of [...new Set(names.map(n => /^([0-9a-f]{64})(?:\.cancel)?\.json$/.exec(n)?.[1]).filter(Boolean))].sort()) {
        let entry = null, torn = false;
        try { entry = await json(file(digest)); } catch { torn = true; }
        if (!entry || typeof entry !== 'object') { torn = torn || entry !== null; entry = null; }
        // An unreadable cancel record is listed as one: a cancel was begun, so the run is treated as cancelled, never as running.
        const cancel = await readCancel(digest).catch(error => unreadable(cancelFile(digest), error));
        if (!entry && !cancel) continue;
        const cancelled = cancel ? await readEffects(digest) : null;
        out.push({ digest, ...(entry ? await whole(digest, entry) : { torn }), ...(cancel ? { cancel, ...(cancelled ? { cancelled } : {}) } : {}) });
      }
      return out;
    },
    /** Replace an entry as given (tmp then rename). attach keeps intents and receipts through intent() and receipt(); this is the plain write a journal without them has. */
    write: (digest, value) => replace(file(digest), value),
  };
}
/**
 * The backlog event an action leaves (phase 184), best effort: its note when it
 * could not be written, else null. deps.events (tests) replaces the writer.
 */
export async function noteEvent(root, input, deps = {}) {
  const write = deps.events ?? (async (r, i) => (await import('./backlog-events.mjs')).recordBacklogEvent(r, i, { env: deps.env, now: deps.now }));
  try { return (await write(root, input))?.note ?? null; } catch (error) { return `backlog event not recorded: ${error?.code ?? error?.message ?? 'unknown'}`; }
}
const withNote = (r, note) => note ? { ...r, data: { ...r.data, eventNote: note } } : r;

/**
 * A run's step on the plate's channel (phase 194): plates's own progress line, provider "plates", through plates say's
 * route and device key (lib/channel-say.mjs postProgress). Best effort: null when posted, else the note saying why not;
 * never a failure. deps.progress (tests) replaces the poster.
 */
export async function noteProgress(line, deps = {}) {
  const post = deps.progress ?? (async (l, d) => (await import('./channel-say.mjs')).postProgress(l, d));
  try { return (await post(line, { env: deps.env ?? process.env }))?.note ?? null; } catch (error) { return `progress line not posted: ${error?.message ?? 'unknown'}`; }
}
const withProgress = (r, note) => note ? { ...r, data: { ...r.data, progressNote: note } } : r;
/** Where a dispatch went, in the words its progress line says. */
export function dispatchedText({ route, provider, phase, result }) {
  if (route === 'session') return `phase ${phase} handed to ${provider} as a /spin ${phase} brief; nothing was started`;
  if (result?.rex) return `phase ${phase} dispatched to ${provider} in Rex tab ${result.rex.tab} of session ${result.rex.label}`;
  return `phase ${phase} dispatched to the ${provider} local host${result?.session ? `, session ${result.session}` : ''}`;
}
const gitPath = (root, path) => new Promise(done => execFile('git', ['-C', root, 'rev-parse', '--git-path', path], { encoding: 'utf8' }, (error, stdout) => done(error ? null : resolve(root, stdout.trim()))));

/**
 * The routes. session: hand over the brief; no outward call, and recovery
 * hands the same brief again. local-host: run the configured start command
 * once with the brief on stdin and keep its session id. Its recovery never
 * runs the host again: whether the first run started a session is unknown,
 * and the receipt says so.
 */
export const ROUTE_HANDLERS = Object.freeze({
  session: { dispatch: async ({ effect }) => ({ state: 'handed', brief: effect.brief.text }), recover: async ({ effect }) => ({ state: 'handed', brief: effect.brief.text, recovered: true }) },
  'local-host': {
    dispatch: async ({ effect, digest, intent, root, env, before = null, timeoutMs }) => {
      const h = effect.host;
      // The prompt mode the preview showed (and its digest covers) is the one dispatched; an intent from before it had one takes the harness's default.
      const r = await startHost({ host: { file: h.config, start: h.start, harness: h.harness ?? null, prompt: h.prompt ?? null }, plate: effect.projectId, provider: effect.provider, label: h.rex?.label ?? null, checkout: root, brief: effect.brief.text, briefName: digest ?? null, tab: h.rex?.tab, session: intent?.claim?.session ?? null, env, before, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
      if (r.via === 'rex') return { state: 'dispatched', session: r.session, rex: r.rex, briefFile: r.briefFile };
      if (r.code !== 0) throw new AttachError(`the local host exited ${r.code}; it was asked once and is not asked again (plates phase claim ${effect.phase} --release to give the phase back)`, 1);
      if (!SESSION.test(r.session)) throw new AttachError('the local host printed no session id (one line of [A-Za-z0-9._:-]); it is not asked again', 1);
      return { state: 'dispatched', session: r.session };
    },
    recover: async ({ effect }) => ({ state: 'uncertain', session: null, recovered: true,
      note: `the host was run once and its answer was not kept, so whether it started is unknown; check the host, or release with plates phase claim ${effect.phase} --release. It is never run again for this attach.` }),
  },
});

/**
 * The execution sources a local host gives the backlog (spec: Agent
 * presence): for each local-host receipt in this checkout's journal with a
 * session id, the host's answer to its state query. A silent host gives
 * nothing, so its card says "claimed". [{ phase, state, source }].
 */
export async function localHostExecutions(root, { env = process.env, journal, query = hostState } = {}) {
  const j = journal ?? attachJournal(await gitPath(root, 'plates-attach') ?? join(root, '.git', 'plates-attach'));
  const out = [];
  for (const entry of await j.list()) {
    const r = entry.receipt, e = entry.intent?.effect;
    if (entry.cancel || r?.route !== 'local-host' || !r.result?.session || !e?.host) continue; // a cancelled run is never shown as running
    const state = await query({ state: e.host.state, session: r.result.session, env });
    if (state) out.push({ phase: e.phase, state, source: `local host ${e.provider}, session ${r.result.session}` });
  }
  return out;
}

// ---- Cancel (phases 181 and 193) ----------------------------------------------
//
// The owner cancels an attach with `plates home --cancel <key> --yes`. The
// cancel is recorded in the attach journal (create-only) before any effect;
// then, and again on every later recovery until they are done, its effects:
// stop what the receipt identifies (the Rex block plates opened, closed with
// `rex block close`; or a host's session through its optional stop command),
// unless it has already ended; and remove the run's private brief file. A
// cancelled attach is never dispatched, recovered or resumed again: attach
// with its digest answers "cancelled", and a dispatch that finishes after a
// cancel landed stops what it just started. Cancelling twice, or a cancel
// racing a finish, leaves the one record the first cancel wrote.
//
// The record is the phase's (phase-<n>.cancel.json, which needs no entry and
// so reaches an attach still taking its claim), then each attach's own: every
// recovery gives the phase's record to each attach of the phase lacking one.
// A cancel and a dispatch race one create-only link, the attach's fate: the
// dispatcher links "dispatch" immediately before it hands anything over, a
// cancel links "cancel" for an attach with no receipt. Whoever loses yields:
// a dispatcher that lost starts nothing; a cancel that lost knows a run is
// being started, says "unknown", and the dispatch (which finds the record
// before `rex run` or the host's start, and again after) stops its own run.

const STOPPED = ['stopped', 'ended', 'none', 'unknown', 'not-stoppable'];
const BRIEF_DONE = ['removed', 'absent'];

/**
 * Rex's own "I do not know that block or session": exit 3 and its wording, both. Any other "not found" (a missing file,
 * a command Rex could not find, a proxy's error) says nothing about the block, and is never taken for an end.
 */
const rexGone = r => r.code === 3 && /\b(?:block|session)\b[^\n]*\bnot found\b/i.test(String(r.stderr ?? ''));

/**
 * Whether a Rex block's program is still running, strictly: 'exited' (wait
 * printed an exit code), 'gone' (Rex says the block or session is not found: exit 3 and that wording),
 * 'running' (wait timed out), or null for anything else: Rex unreachable, a
 * failed call, or an answer this build does not recognise. Only a definite
 * exit or not-found ends a run; a cancel never takes an unknown for an end.
 */
export async function rexProbe({ receipt, env = process.env, timeoutMs = 10_000 }) {
  const m = REX_RECEIPT.exec(String(receipt ?? ''));
  const bin = m && await rexBin(env);
  if (!bin) return null;
  let r;
  try { r = await runHost([bin, 'wait', '-s', m[1], m[2], '--for', '1s', '--json'], { cwd: homedir(), env: hostEnv(env), timeoutMs, stderr: true }); } catch { return null; }
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
  if (Number.isInteger(out?.exit_code)) return 'exited';
  if (/\bwait timed out\b/.test(r.stderr)) return 'running';
  if (rexGone(r)) return 'gone';
  return null;
}

/** Close the Rex block a receipt names, unless its program has definitely ended: 'stopped', 'ended', or 'pending' (Rex not answering here, an answer not recognised, or the close failed). */
export async function rexStop({ receipt, env = process.env, probe = rexProbe, timeoutMs = 10_000 }) {
  const m = REX_RECEIPT.exec(String(receipt ?? ''));
  const bin = m && await rexBin(env);
  if (!bin) return { stop: 'pending', note: 'rex is not on PATH here; the cancel is kept and the tab is closed by the next recovery' };
  const now = await probe({ receipt, env });
  if (now === null) return { stop: 'pending', note: 'Rex did not answer, or answered something not recognised; the tab is closed by the next recovery' };
  if (now === 'exited') return { stop: 'ended', note: 'its program had already exited; the tab is left for you to read' };
  if (now === 'gone') return { stop: 'ended', note: 'Rex no longer knows the block' };
  try {
    const r = await runHost([bin, 'block', 'close', '-s', m[1], m[2]], { cwd: homedir(), env: hostEnv(env), timeoutMs, stderr: true });
    if (r.code === 0) return { stop: 'stopped', note: `closed Rex block ${m[2]}` };
    if (rexGone(r)) return { stop: 'ended', note: 'Rex no longer knows the block' };
    return { stop: 'pending', note: `rex block close exited ${r.code}` };
  } catch (error) { return { stop: 'pending', note: error.message }; }
}

/** What stopping an entry's run means, from its receipt and its fate: { stop, note }. */
async function stopRun(entry, { env, readHost, root, journal }) {
  const route = entry.intent?.route, result = entry.receipt?.result, effect = entry.intent?.effect;
  // No receipt: the cancel races the dispatch for the attach's fate. Won, nothing was or will be started.
  const fate = !entry.receipt && journal?.fate ? await journal.fate(entry.digest, 'cancel', new Date().toISOString()) : null;
  if (route === 'session') return { stop: 'none', note: 'a session route starts no process' };
  if (!entry.intent) return { stop: 'unknown', note: 'the attach\'s journal entry cannot be read, so what it started (if anything) cannot be named; check Rex or the host yourself' };
  // Only an intent journaled by a plates that decides fates (intent.fate) is known unstarted; an older one may have run.
  if (!entry.receipt && fate?.fate === 'cancel' && entry.intent.fate) return { stop: 'none', note: 'the cancel was decided before the run was started; nothing was dispatched' };
  if (!entry.receipt) return { stop: 'unknown', note: 'the dispatch was journaled but its receipt never was, so what it started (if anything) cannot be named; check Rex or the host yourself' };
  if (result?.state === 'not-started') return { stop: 'none', note: 'the cancel was found before the run was started; nothing was dispatched' };
  const session = result?.session;
  if (!session) return { stop: 'unknown', note: 'the receipt names no session; check the host yourself' };
  if (REX_RECEIPT.test(session)) return rexStop({ receipt: session, env });
  let host;
  try { host = await readHost({ root, provider: effect?.provider, env }); } catch (error) { return { stop: 'pending', note: `the host configuration could not be read (${error.message})` }; }
  if (!host.stop) return { stop: 'not-stoppable', note: `the ${effect?.provider} host has no stop command; stop session ${session} yourself` };
  try { const r = await runHost([...host.stop, session], { cwd: homedir(), env: hostEnv(env) }); return r.code === 0 ? { stop: 'stopped', note: `the host's stop command stopped session ${session}` } : { stop: 'pending', note: `the host's stop command exited ${r.code}` }; }
  catch (error) { return { stop: 'pending', note: error.message }; }
}

/** Remove an entry's private brief file, wherever the journal says it is or its digest names it: 'removed' or 'absent'. */
async function removeBrief(entry, env) {
  const named = rexBriefFile(env, entry.digest), recorded = entry.receipt?.result?.briefFile;
  // Only a brief file plates makes is removed, never any path the journal could be made to say: the one this
  // environment names for the digest, and the receipt's when it is that digest's file in a plates rex-briefs directory
  // (the dispatching plates may have had another state directory than the one recovering).
  const ours = f => typeof f === 'string' && isAbsolute(f) && f.split(sep).slice(-3).join('/') === `plates/rex-briefs/${entry.digest}.brief`;
  const files = [...new Set([named, recorded].filter(ours))];
  let removed = false;
  for (const f of files) {
    try { await unlink(`${f}.worker`); removed = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await unlink(f); removed = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return removed ? 'removed' : 'absent';
}

/** Whether a settled cancel is settled again: a receipt names a run (or another run) the last settling did not have. */
const resettle = (prior, entry) => !!entry.receipt && (!prior.receipt || ('session' in prior && prior.session !== (entry.receipt.result?.session ?? null)));

/** Carry out a cancelled entry's effects, until done; the result is written beside the entry. Returns entry.cancelled. */
export async function settleCancel(entry, { journal, env = process.env, readHost = readLocalHost, root, now = Date.now() } = {}) {
  // The entry as it is now, not as a list read it: a dispatch may have written its receipt since. One that cannot be
  // read is settled as it was listed: cancelled, with what it started unknown.
  const fresh = { digest: entry.digest, ...((await journal.read(entry.digest).catch(() => null)) ?? entry) };
  const prior = (journal.cancelledOf ? await journal.cancelledOf(entry.digest) : null) ?? entry.cancelled ?? null;
  // Settled before a receipt named the run: once one is there, the run it names is stopped and its brief file removed.
  const retry = prior && resettle(prior, fresh);
  if (prior?.done && !retry) return prior;
  const { stop, note } = STOPPED.includes(prior?.stop) && !retry ? prior : await stopRun(fresh, { env, readHost, root, journal });
  const brief = await removeBrief(fresh, env);
  const cancelled = { at: new Date(now).toISOString(), stop, note, brief, receipt: !!fresh.receipt, session: fresh.receipt?.result?.session ?? null, done: STOPPED.includes(stop) && BRIEF_DONE.includes(brief) };
  await journal.settled(entry.digest, cancelled);
  return cancelled;
}

/** Whether a listed attach is one of a phase's. One whose entry cannot be read is every phase's its cancel does not rule out. */
const ofPhase = phase => x => x.intent ? String(x.intent.effect?.phase) === String(phase) : !!x.cancel && (x.cancel.phase == null || String(x.cancel.phase) === String(phase));

/**
 * Recovery, run before any attach and by every cancel. A cancel is the
 * phase's: its record (the phase's own file, or any attach's) is given,
 * create-only, to every attach of the phase that lacks one. Then every
 * cancelled attach whose effects are not yet done is settled. One attach that
 * cannot be settled is reported ({ digest, error }) and the rest still are.
 */
export async function recoverCancels(journal, deps = {}) {
  const out = [], failed = [];
  await journal.sweep?.().catch(() => {});
  let entries = await (journal.list?.() ?? []);
  const records = new Map();
  for (const p of await (journal.phaseCancels?.() ?? [])) if (!p.cancel.unreadable) records.set(String(p.phase), p.cancel);
  for (const x of entries) if (x.intent && x.cancel && !x.cancel.unreadable && !records.has(String(x.intent.effect?.phase))) records.set(String(x.intent.effect?.phase), x.cancel);
  let given = false;
  for (const x of entries) {
    if (x.cancel || !x.intent || !records.has(String(x.intent.effect?.phase))) continue;
    try { await journal.cancel(x.digest, records.get(String(x.intent.effect?.phase))); given = true; } catch (error) { failed.push({ digest: x.digest, error: error?.message ?? String(error) }); }
  }
  if (given) entries = await journal.list();
  for (const entry of entries) {
    if (!entry.cancel || (entry.cancelled?.done && !resettle(entry.cancelled, entry))) continue;
    try { out.push({ digest: entry.digest, cancelled: await settleCancel(entry, { journal, ...deps }) }); } catch (error) { failed.push({ digest: entry.digest, error: error?.message ?? String(error) }); }
  }
  return [...out, ...failed];
}

const cancelLine = (c, x) => c?.unreadable ? `cancelled, by a cancel record that cannot be read (${c.file}: ${c.error}); treat it as cancelled` : `cancelled at ${c.at}${c.by ? ` by ${c.by}` : ''}${c.why ? ` (${c.why})` : ''}${x?.stop ? `; run: ${x.stop}${x.note ? ` (${x.note})` : ''}; brief file: ${x.brief}` : ''}`;

/**
 * Confirm a cancelled attach's run is genuinely stopped (never pending, unknown, or still running in Rex or a local host)
 * before a cancellation may be cleared. Returns null when confirmed stopped, or a human-readable reason why it is not.
 */
async function confirmCancelStop(entry, { journal, env, root, readHost, now = Date.now() }) {
  if (entry.torn || !entry.intent) {
    return 'the attach journal entry cannot be read, so whether its run stopped cannot be confirmed';
  }
  let cancelled = entry.cancelled ?? null;
  if (!cancelled || !BRIEF_DONE.includes(cancelled.brief)) {
    return cancelled?.note ?? 'the cancelled attach\'s brief file has not been removed yet';
  }
  if (cancelled.stop === 'none') return null;
  if (cancelled.stop === 'pending' || cancelled.stop === 'unknown' || !['stopped', 'ended', 'not-stoppable'].includes(cancelled.stop)) {
    return cancelled.note ?? `run stop is ${cancelled.stop ?? 'pending'}`;
  }
  const session = entry.receipt?.result?.session;
  if (!session) return cancelled.stop === 'unknown' && cancelled.note ? cancelled.note : 'the attach receipt names no session, so stop cannot be confirmed';
  if (REX_RECEIPT.test(session)) {
    let probe = await rexProbe({ receipt: session, env });
    if (probe === 'running') {
      const retry = await rexStop({ receipt: session, env });
      cancelled = { ...cancelled, at: new Date(now).toISOString(), stop: retry.stop, note: retry.note, done: STOPPED.includes(retry.stop) && BRIEF_DONE.includes(cancelled.brief) };
      await journal.settled?.(entry.digest, cancelled);
      entry.cancelled = cancelled;
      if (retry.stop === 'pending') return retry.note;
      probe = await rexProbe({ receipt: session, env });
    }
    if (probe === 'exited' || probe === 'gone') return null;
    if (probe === 'running') return `Rex block ${session} is still running`;
    return `Rex could not confirm that ${session} has stopped (Rex did not answer or is not on PATH)`;
  }
  const provider = entry.intent.effect?.provider;
  let host;
  try { host = await readHost({ root, provider, env }); }
  catch (error) { return `the ${provider ?? 'local'} host configuration could not be read (${error.message})`; }
  if (cancelled.stop === 'not-stoppable' && host.stop) {
    const retried = await stopRun(entry, { env, readHost: async () => host, root, journal });
    cancelled = { ...cancelled, at: new Date(now).toISOString(), stop: retried.stop, note: retried.note, done: STOPPED.includes(retried.stop) && BRIEF_DONE.includes(cancelled.brief) };
    await journal.settled?.(entry.digest, cancelled);
    entry.cancelled = cancelled;
    if (retried.stop === 'pending' || retried.stop === 'unknown') return retried.note;
  }
  if (host.state) {
    const live = await hostState({ state: host.state, session, env });
    if (live === 'finished' || live === 'failed') return null;
    if (live === 'starting' || live === 'running' || live === 'waiting') return `local host session ${session} is still ${live}`;
    return `the ${provider ?? 'local'} host state query could not confirm session ${session} has stopped`;
  }
  if (cancelled.stop === 'stopped' || cancelled.stop === 'ended') return null;
  return cancelled.note ?? `the ${provider ?? 'local'} host has no stop or state command to confirm session ${session} has stopped`;
}

/**
 * Cancel (or deliberately clear a confirmed-stopped cancel on) the attaches of one phase:
 * preview (yes false, exit 3), check (read only: exit 1 when cancelled, or for
 * a worker session whose own attach was cancelled before a later clear; 0 when
 * not), cancel (yes), or clear (clear + why + yes): records who cleared it,
 * when and why, requires every cancelled run's stop to be confirmed, removes
 * the phase-level and per-digest cancel records create-only/compare-before-delete,
 * and keeps cancelled runs stopped while allowing a new attach.
 */
export async function cancelAttach({ root, projectId, phase, yes = false, check = false, clear = false, why = null, by = null }, deps = {}) {
  const env = deps.env ?? process.env;
  const journal = deps.journal ?? attachJournal(await gitPath(root, 'plates-attach') ?? join(root, '.git', 'plates-attach'));
  const key = `${projectId}:phase:${phase}`;
  // The journal is this checkout's, so every attach in it is this plate's: the phase alone picks them.
  const mine = async () => (await journal.list()).filter(ofPhase(phase));
  let entries = await mine();
  const phaseCancel = journal.phaseCancelOf ? await journal.phaseCancelOf(phase).catch(error => ({ unreadable: true, file: `phase-${phase}.cancel.json`, error: error.message })) : null;
  const cancelled = entries.find(x => x.cancel)?.cancel ?? phaseCancel;
  if (check) {
    if (cancelled) return { data: { ok: true, state: 'cancelled', key, cancel: cancelled }, text: `${key} was ${cancelLine(cancelled)}. Stop: do not continue this phase or claim it again.`, exitCode: 1 };
    const clears = journal.phaseClears ? await journal.phaseClears(phase) : [];
    const badClear = clears.find(c => c.unreadable);
    if (badClear) return { data: { ok: true, state: 'cancelled', key, cancel: badClear }, text: `${key} has an unreadable cancel-clear record (${badClear.file}: ${badClear.error}). Stop: treat it as cancelled.`, exitCode: 1 };
    const callerSession = typeof env.PLATES_SESSION === 'string' && env.PLATES_SESSION ? env.PLATES_SESSION : typeof env.KEEL_SESSION === 'string' && env.KEEL_SESSION ? env.KEEL_SESSION : null;
    const stoppedRun = callerSession ? clears.find(c => Array.isArray(c.runs) && c.runs.some(r => r.session === callerSession)) : null;
    if (stoppedRun) {
      return { data: { ok: true, state: 'cancelled', key, cancel: stoppedRun.cancel, cleared: { at: stoppedRun.at, by: stoppedRun.by, why: stoppedRun.why } },
        text: `${key}: this session's attach was ${cancelLine(stoppedRun.cancel)} (later cleared at ${stoppedRun.at} for a new attach). Stop: do not continue this phase or claim it again.`, exitCode: 1 };
    }
    const lastClear = clears.at(-1) ?? null;
    return { data: { ok: true, state: entries.length || lastClear ? 'not-cancelled' : 'not-attached', key, ...(lastClear ? { cleared: { at: lastClear.at, by: lastClear.by, why: lastClear.why } } : {}) },
      text: entries.length ? `${key} is not cancelled.` : lastClear ? `${key} is not cancelled (cancel cleared at ${lastClear.at} by ${lastClear.by}: ${lastClear.why}).` : `${key} has no attach in this checkout's journal.`, exitCode: 0 };
  }
  // An attach still taking its claim has no entry yet; its marker is what there is to cancel.
  let claiming = (await (journal.attempts?.() ?? [])).filter(x => String(x.phase) === String(phase));
  const describe = x => `  ${x.intent ? `${x.intent.route} at ${x.intent.at}` : `attach ${x.digest.slice(0, 12)}, whose journal entry cannot be read`}${x.receipt?.result?.session ? `, session ${x.receipt.result.session}` : x.receipt || !x.intent ? '' : ', no receipt'}${x.cancel ? `: ${cancelLine(x.cancel, x.cancelled)}` : ''}`;
  const lines = () => [...entries.map(describe), ...claiming.filter(c => !entries.some(x => x.digest === c.digest)).map(c => `  ${c.route ?? 'an attach'} taking its claim since ${c.at}: nothing is journaled for it yet, and it is not dispatched once cancelled`)].join('\n');
  if (clear) {
    if (typeof why !== 'string' || !why.trim() || why.length > 200 || /[\x00-\x1f]/.test(why)) throw new AttachError('--clear needs --why "<line>" (one line of at most 200 characters)', 2);
    if (!cancelled) throw new AttachError(`${key} is not cancelled: nothing to clear`, 1);
    const bad = phaseCancel?.unreadable ? phaseCancel : entries.find(x => x.cancel?.unreadable)?.cancel;
    if (bad) throw new AttachError(`${key} has an unreadable cancel record (${bad.file}: ${bad.error}); inspect it before clearing`, 1);
    if (claiming.length) throw new AttachError(`${key} has an attach still taking its claim; wait for it to finish stopping before clearing`, 1);
    const actor = by ?? 'owner';
    if (!yes) {
      return {
        data: { ok: true, state: 'preview', action: 'clear', key, by: actor, why, cancel: cancelled,
          attaches: entries.map(x => ({ digest: x.digest, route: x.intent?.route ?? null, session: x.receipt?.result?.session ?? null, cancel: x.cancel ?? null, cancelled: x.cancelled ?? null })) },
        text: `Clear cancel on ${key} (${actor}: ${why}):\n  ${cancelLine(cancelled)}${entries.length ? `\n${lines()}` : ''}\nRecords who cleared it, when and why; requires every cancelled run's stop to be confirmed before removing the phase and per-digest cancel records. Any cancelled run stays stopped; clearing only allows a new attach. Release any held claim with plates phase claim ${phase} --release.\nNothing is cleared yet. Add --yes to clear.`,
        exitCode: 3,
      };
    }
    const id = sha256(canonical({ phase: Number(phase), cancel: cancelled }));
    await recoverCancels(journal, { env, root, readHost: deps.readHost ?? readLocalHost, now: deps.now ?? Date.now() });
    entries = await mine();
    const currentPhaseCancel = journal.phaseCancelOf ? await journal.phaseCancelOf(phase).catch(error => ({ unreadable: true, file: `phase-${phase}.cancel.json`, error: error.message })) : null;
    const currentCancelled = entries.find(x => x.cancel)?.cancel ?? currentPhaseCancel;
    if (!currentCancelled) {
      const clears = journal.phaseClears ? await journal.phaseClears(phase) : [];
      const prior = clears.find(c => !c.unreadable && c.id === id);
      if (prior) {
        return {
          data: { ok: true, state: 'cleared', key, already: true, clear: prior, attaches: [] },
          text: `Already cleared cancel on ${key} (${prior.by} at ${prior.at}: ${prior.why}).\nAny cancelled run stays stopped; clearing only allows a new attach. If the phase claim is still held, release it with plates phase claim ${phase} --release.`,
          exitCode: 0,
        };
      }
      throw new AttachError(`${key} is not cancelled: nothing to clear`, 1);
    }
    const badCurrent = currentPhaseCancel?.unreadable ? currentPhaseCancel : entries.find(x => x.cancel?.unreadable)?.cancel;
    if (badCurrent) throw new AttachError(`${key} has an unreadable cancel record (${badCurrent.file}: ${badCurrent.error}); inspect it before clearing`, 1);
    if (canonical(currentCancelled) !== canonical(cancelled) || entries.some(x => !x.cancel || canonical(x.cancel) !== canonical(cancelled))) {
      throw new AttachError(`${key}'s cancel record changed while clearing; inspect it before clearing`, 1);
    }
    claiming = (await (journal.attempts?.() ?? [])).filter(x => String(x.phase) === String(phase));
    if (claiming.length) throw new AttachError(`${key} has an attach still taking its claim; wait for it to finish stopping before clearing`, 1);
    const reasons = [];
    for (const x of entries) {
      const reason = await confirmCancelStop(x, { journal, env, root, readHost: deps.readHost ?? readLocalHost, now: deps.now ?? Date.now() });
      if (reason) reasons.push(reason);
    }
    if (reasons.length) {
      throw new AttachError(`${key} cannot clear its cancel until every cancelled run's stop is confirmed (${reasons.join('; ')})`, 1);
    }
    const clearRecord = {
      schema: 1,
      id,
      phase: Number(phase),
      at: new Date(deps.now ?? Date.now()).toISOString(),
      by: actor,
      why,
      cancel: cancelled,
      digests: entries.map(x => x.digest),
      runs: entries.map(x => ({
        digest: x.digest,
        intentAt: x.intent?.at ?? null,
        intentSha256: x.intent ? sha256(canonical(x.intent)) : null,
        route: x.intent?.route ?? null,
        session: x.intent?.claim?.session ?? null,
        receiptSession: x.receipt?.result?.session ?? null,
        receiptSha256: x.receipt ? sha256(canonical(x.receipt)) : null,
      })),
    };
    const { record: kept, first } = await journal.clearPhaseCancel(phase, clearRecord, entries.map(x => x.digest));
    return {
      data: { ok: true, state: 'cleared', key, already: !first, clear: kept, attaches: first ? entries.map(x => ({ digest: x.digest, cancelled: x.cancelled ?? null })) : [] },
      text: `${first ? 'Cleared' : 'Already cleared'} cancel on ${key} (${kept.by} at ${kept.at}: ${kept.why}).${first && entries.length ? `\n${lines()}` : ''}\nAny cancelled run stays stopped; clearing only allows a new attach. If the phase claim is still held, release it with plates phase claim ${phase} --release.`,
      exitCode: 0,
    };
  }
  if (!entries.length && !claiming.length && !phaseCancel) throw new AttachError(`${key} has no attach in this checkout's journal: nothing to cancel`, 1);
  if (!yes) return { data: { ok: true, state: 'preview', key, attaches: entries.map(x => ({ digest: x.digest, route: x.intent?.route ?? null, session: x.receipt?.result?.session ?? null, cancel: x.cancel ?? null })) }, text: `Cancel ${key}:\n${lines()}\nThe cancel is recorded first; then the run plates opened is stopped (unless it has ended) and its private brief file removed. It is never dispatched again. The claim is kept: release it with plates phase claim ${phase} --release.\nNothing is cancelled yet. Add --yes to cancel.`, exitCode: 3 };
  // The record, before any effect: the phase's own (it needs no entry), then every attach of the phase (recoverCancels).
  // A cancel already recorded for the phase, under any attach, is the record: the first cancel is the only one.
  const known = cancelled && !cancelled.unreadable ? cancelled : null;
  const record = known ?? { at: new Date(deps.now ?? Date.now()).toISOString(), by: by ?? 'owner', ...(why ? { why } : {}), phase };
  let first = false;
  if (journal.cancelPhase) first = (await journal.cancelPhase(phase, record)).first && !known;
  else for (const x of entries) if (!x.cancel) first = (await journal.cancel(x.digest, record)).first || first;
  await recoverCancels(journal, { env, root, readHost: deps.readHost ?? readLocalHost, now: deps.now ?? Date.now() });
  entries = await mine();
  const note = first ? await noteEvent(root, { actor: by?.startsWith('agent:') ? by : 'owner', key, action: 'attach', route: entries.find(x => x.intent)?.intent.route ?? claiming[0]?.route ?? 'session', lane: 'agent-ready', outcome: 'cancelled' }, deps) : null;
  const pending = entries.filter(x => !x.cancelled?.done);
  // One progress line for the phase's cancel, the first time only.
  const stops = [...new Set(entries.map(x => x.cancelled?.stop).filter(Boolean))].join(', ');
  const progress = first ? await noteProgress({ project: projectId, phase: Number(phase), step: 'cancelled', digest: entries[0]?.digest ?? claiming[0]?.digest,
    text: `phase ${phase} cancelled${why ? ` (${why})` : ''}${stops ? `; run: ${stops}` : ''}` }, { ...deps, env }) : null;
  return withProgress(withNote({ data: { ok: true, state: 'cancelled', key, already: !first, attaches: entries.map(x => ({ digest: x.digest, cancel: x.cancel, cancelled: x.cancelled ?? null })) },
    text: `${first ? 'Cancelled' : 'Already cancelled'} ${key}:\n${lines()}${pending.length ? `\n${pending.length} not finished yet; plates finishes them on the next attach or cancel.` : ''}\nThe claim is kept: release it with plates phase claim ${phase} --release.`, exitCode: 0 }, note), progress);
}

/** plates home --cancel <key> [--check | [--why "<line>"] [--yes] | --clear --why "<line>" [--yes]], in the plate's own checkout. */
export async function cancelCommand({ root, key, yes = false, check = false, clear = false, why = null }, deps = {}) {
  const env = deps.env ?? process.env;
  const m = /^([a-z][a-z0-9-]{0,63}):phase:(\d+)$/.exec(String(key ?? ''));
  if (!m) throw new AttachError('--cancel takes a phase\'s backlog key, <plate>:phase:<n>');
  const [{ collect }, { plateIdOf }, { providerOf }] = await Promise.all([import('../practices/phases/files/scripts/roadmap.mjs'), import('./work-items.mjs'), import('./claim.mjs')]);
  const data = await collect(root);
  const here = plateIdOf(data.config.repo ?? data.config.name);
  if (m[1] !== here) throw new AttachError(`${key} is ${m[1]}'s; this checkout is ${here}. Run it in ${m[1]}'s checkout`);
  const who = providerOf(env);
  return cancelAttach({ root, projectId: here, phase: Number(m[2]), yes, check, clear, why, by: who ? `agent:${who}` : null }, deps);
}

/**
 * Attach: preview (yes false), or the whole contract (yes true). deps (tests):
 * claim (lib/claim.mjs's), journal, handlers, now. Returns { data, text,
 * exitCode }: 3 for a preview, 1 when taken or refused, 0 attached.
 */
export async function attach({ root, projectId, phase, title, route, provider, config, yes = false, phaseText, host }, deps = {}) {
  checkRoute(config, route);
  if (!provider) throw new AttachError('which agent? --provider <name> (a key of "agents" in .plates/plates.json), or PLATES_PROVIDER');
  if (config?.agents && typeof config.agents === 'object' && !Object.hasOwn(config.agents, provider)) throw new AttachError(`--provider ${provider} is not one of this plate's agents (${Object.keys(config.agents).join(', ')})`);
  const { effect, digest } = attachPreview({ projectId, phase, title, route, provider, phaseText, host, plate: config?.name ?? projectId });
  const h = effect.host;
  const hostLine = !h ? '' : [h.harness ? `\n  harness: ${h.harness.join(' ')}, ${h.prompt === 'arg' ? 'brief as its startup prompt (the tab\'s terminal stays its input)' : 'brief on stdin'}, in a new Rex tab ${h.rex.tab} of session ${h.rex.label} when Rex answers (from ${h.config})${h.start ? '; otherwise the start command below' : '; without Rex it is not started'}` : '',
    h.start ? `\n  host: ${h.start.join(' ')} <checkout>, brief on stdin (from ${h.config}); state query: ${h.state ? h.state.join(' ') : 'none, so its card says claimed'}` : ''].join('');
  const shown = `Attach ${provider} to ${projectId} #${phase} (${title}) by route ${route}.\n  claim: ${effect.claimRef} (create-only, read back)\n  brief: ${effect.brief.bytes} bytes, sha256 ${effect.brief.sha256.slice(0, 12)}${hostLine}\n  budget: ${effect.budget.from}\n  digest: ${digest}`;
  // A local host sees the exact bytes it will be sent.
  if (!yes) return { data: { ok: true, state: 'preview', effect, digest }, text: `${shown}${effect.host ? `\n\n${effect.brief.text}` : ''}\nNothing is claimed yet. Add --yes to claim and start it.`, exitCode: 3 };

  const journal = deps.journal ?? attachJournal(await gitPath(root, 'plates-attach') ?? join(root, '.git', 'plates-attach'));
  const handler = (deps.handlers ?? ROUTE_HANDLERS)[route];
  const env = deps.env ?? process.env;
  // The installed push job has no checkout. Register only a real checkout's journal,
  // before dispatch, so a killed attach cannot leave a receipt undiscoverable.
  if (route === 'local-host' && !deps.journal) {
    const { registerDeliveryJournal } = await import('./channel-deliver.mjs');
    await registerDeliveryJournal({ root, dir: await gitPath(root, 'plates-attach') ?? join(root, '.git', 'plates-attach'), env });
  }
  const at = () => new Date(deps.now ?? Date.now()).toISOString();
  // Recovery first: a cancel recorded before a restart has its effects finished, and is never undone.
  const recovery = { env, root, readHost: deps.readHost ?? readLocalHost, now: deps.now ?? Date.now() };
  if (journal.cancelOf) await recoverCancels(journal, recovery);
  const initialClears = journal.phaseClears ? await journal.phaseClears(phase) : [];
  const badClear = initialClears.find(c => c.unreadable);
  if (badClear) return { data: { ok: false, state: 'cancelled', effect, digest, cancel: badClear }, text: `${shown}\nPhase ${phase} has an unreadable cancel-clear record (${badClear.file}: ${badClear.error}); treat it as cancelled.`, exitCode: 1 };
  const clearsBefore = initialClears.length;
  // The phase's cancel, wherever it was recorded: this digest's, another attach's of the same phase, or the phase's own
  // record (which needs no entry). Asked at every boundary where something would be handed over, since a cancel can land
  // between any two of them. { cancel, digest (null: the phase's own record), cancelled? }.
  const phaseCancelOf = async () => {
    if (!journal.cancelOf) return null;
    const own = await journal.cancelOf(digest);
    if (own) return { cancel: own, digest };
    const other = (await (journal.list?.() ?? [])).find(x => x.cancel && x.digest !== digest && ofPhase(phase)(x));
    if (other) return { cancel: other.cancel, digest: other.digest, cancelled: other.cancelled ?? null };
    const whole = await journal.phaseCancelOf?.(phase);
    if (whole) return { cancel: whole, digest: null };
    const clearsNow = journal.phaseClears ? await journal.phaseClears(phase) : [];
    if (clearsNow.length > clearsBefore) {
      const during = clearsNow[clearsBefore];
      return { cancel: during.unreadable ? during : during.cancel, digest: null, clearedDuringRun: true };
    }
    return null;
  };
  // At a late boundary: a phase cancel recorded elsewhere is recorded under this digest too (the same record), so
  // recovery and --check see this attach as cancelled; then its effects are settled, with this receipt when there is one.
  const lateCancel = async (intent, receipt = null) => {
    const found = await phaseCancelOf();
    if (!found) return null;
    if (found.clearedDuringRun) {
      const { stop, note } = await stopRun({ digest, intent, ...(receipt ? { receipt } : {}) }, { env, readHost: recovery.readHost, root, journal: null });
      const brief = await removeBrief({ digest, intent, ...(receipt ? { receipt } : {}) }, env);
      return { cancel: found.cancel, cancelled: { at: new Date(recovery.now).toISOString(), stop, note, brief, receipt: !!receipt, session: receipt?.result?.session ?? null, done: STOPPED.includes(stop) && BRIEF_DONE.includes(brief) } };
    }
    if (found.digest !== digest && !found.cancel.unreadable) await journal.cancel(digest, found.cancel);
    const cancelled = await settleCancel({ digest, intent, ...(receipt ? { receipt } : {}) }, { journal, ...recovery });
    return { cancel: found.cancel, cancelled };
  };
  /** Keep a receipt, create-only where the journal can: { receipt, first }, the one that stands and whether it is this one. */
  const keep = async (intent, receipt) => {
    const nowClears = journal.phaseClears ? await journal.phaseClears(phase) : [];
    if (nowClears.length > clearsBefore) return { receipt, first: true, clearedDuringRun: true };
    return journal.receipt ? journal.receipt(digest, { intent, receipt }) : (await journal.write(digest, { intent, receipt }), { receipt, first: true });
  };
  // Already attached: the receipt as it is. Nothing is claimed or dispatched again.
  const repeated = receipt => ({ data: { ok: true, state: 'attached', effect, digest, receipt, repeated: true }, text: `${shown}\nAlready attached at ${receipt.at}; nothing was done again.\n\n${receipt.result?.brief ?? ''}`.trimEnd(), exitCode: 0 });
  // An intent with no receipt: the dispatch's outcome is unknown. Recover it; never dispatch again.
  const recover = async intent => {
    const result = await handler.recover({ effect, digest, intent });
    // Create-only: a receipt kept since this attach read the journal (the dispatch it is recovering finished) stands, and is adopted.
    const { receipt, first } = await keep(intent, { route, at: at(), claim: intent.claim, result });
    // A cancel that landed while it was recovered: nothing is handed over; its effects are settled with this receipt.
    const lateRecover = await lateCancel(intent, receipt);
    if (lateRecover) return { data: { ok: false, state: 'cancelled', effect, digest, receipt, ...lateRecover }, text: `${shown}\nRecovered, but the attach was ${cancelLine(lateRecover.cancel, lateRecover.cancelled)}. Nothing is handed over.`, exitCode: 1 };
    if (!first) return repeated(receipt);
    const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'recovered', receipt: `attach:${digest}` }, deps);
    // Posted only once the outcome is decided: this attach's recovered receipt is the one kept, and no cancel landed.
    const progress = await noteProgress({ project: projectId, phase: Number(phase), step: 'recovered', digest, text: `phase ${phase}: the ${route} attach was recovered and not dispatched again${result.state === 'uncertain' ? '; whether it started is unknown' : ''}` }, { ...deps, env });
    return withProgress(withNote({ data: { ok: true, state: 'attached', effect, digest, receipt, recovered: true }, text: `${shown}\nRecovered the attach journaled at ${intent.at}; it was not dispatched again.\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 }, note), progress);
  };
  const seen = await journal.read(digest);
  // Cancelled: never dispatched, recovered or resumed again, whatever the journal holds. A cancel is the phase's, not one
  // digest's: an attach whose brief or source changed since (another digest) finds it too, and the phase stays cancelled
  // until its cancel is deliberately cleared.
  const was = await phaseCancelOf();
  if (was && was.digest !== digest) return { data: { ok: false, state: 'cancelled', effect, digest, cancel: was.cancel, cancelled: was.cancelled ?? null, cancelledDigest: was.digest }, text: `${shown}\nPhase ${phase} was ${cancelLine(was.cancel, was.cancelled)}${was.digest ? ` (attach ${was.digest.slice(0, 12)})` : ''}. It stays cancelled; nothing is claimed or dispatched.`, exitCode: 1 };
  if (was) { const effects = journal.cancelledOf ? await journal.cancelledOf(digest) : null; return { data: { ok: false, state: 'cancelled', effect, digest, cancel: was.cancel, cancelled: effects }, text: `${shown}\nThis attach was ${cancelLine(was.cancel, effects)}. It is not dispatched again.`, exitCode: 1 }; }
  if (seen?.receipt) return repeated(seen.receipt);
  if (seen?.intent) return recover(seen.intent);

  // A host already run for this phase (another digest: the phase or its decisions moved since) is never run again from here.
  const handed = earlier => ({ data: { ok: false, state: 'already-dispatched', effect, digest, earlier: { digest: earlier.digest, at: earlier.intent?.at ?? earlier.at ?? null, result: earlier.receipt?.result ?? null, cancel: earlier.cancel ?? null } }, text: `${shown}\nAlready handed to a ${route} at ${earlier.intent?.at ?? earlier.at}${earlier.receipt?.result?.session ? ` (session ${earlier.receipt.result.session})` : ''}${earlier.cancel ? `, then ${cancelLine(earlier.cancel)}` : ''}; it is not run again. Release the claim first to hand it over afresh.${earlier.note ?? ''}`, exitCode: 1 });
  if (route !== 'session') {
    const earlier = (await (journal.list?.() ?? [])).find(x => x.digest !== digest && x.intent?.route === route && String(x.intent?.effect?.phase) === String(phase));
    if (earlier) return handed(earlier);
  }
  let intent, claimed;
  const workerSession = route === 'local-host' ? `attach-${randomBytes(16).toString('hex')}` : null;
  // While the claim is taken nothing is journaled for this attach; the marker is what a cancel finds meanwhile.
  const marker = await journal.attempt?.(digest, { phase, route, at: at() });
  try {
    claimed = await (deps.claim
      ? deps.claim({ root, phase, provider })
      : (await import('./claim.mjs')).claim({ root, phase, provider }, { env }));
    if (!claimed.data?.ok) {
      const holder = claimed.data?.holder;
      const who = holder ? `${holder.provider ?? 'someone'}${holder.machine ? ` on ${holder.machine}` : ''}${holder.at ? ` since ${holder.at}` : ''}` : 'no one it could name';
      const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'taken' }, deps);
      return withNote({ data: { ok: false, state: 'taken', effect, digest, holder: holder ?? null }, text: `${shown}\nTaken by ${who}: ${claimed.text}\nNothing was dispatched.`, exitCode: 1 }, note);
    }
    // A cancel of the phase that landed while the claim was taken: nothing is journaled or dispatched.
    const claimCancel = await phaseCancelOf();
    if (claimCancel) return { data: { ok: false, state: 'cancelled', effect, digest, cancel: claimCancel.cancel, cancelledDigest: claimCancel.digest }, text: `${shown}\nPhase ${phase} was ${cancelLine(claimCancel.cancel)} while it was being claimed. Nothing is dispatched; release the claim with plates phase claim ${phase} --release.`, exitCode: 1 };
    // Two attaches of one phase with different digests both pass the check above when neither has journaled yet: the
    // phase's one host slot, create-only, is the first's. The other is told so and runs nothing.
    if (route !== 'session' && journal.slot) {
      const held = await journal.slot(phase, route, digest, at());
      if (held.digest !== digest) {
        const theirs = (await journal.list()).find(x => x.digest === held.digest);
        return handed(theirs ?? { ...held, note: ` (Its intent is not journaled, so it started nothing: if no attach is running now, it was killed there; remove ${held.file} to hand the phase over.)` });
      }
    }
    // fate: this plates decides the attach's fate before it dispatches, so a cancel that wins it knows nothing was started.
    intent = {
      route, at: at(), effect,
      claim: {
        ref: effect.claimRef,
        sha: claimed.data.sha ?? null,
        ...(claimed.data.token ? { token: claimed.data.token } : {}),
        ...(workerSession ? { session: workerSession } : {}),
        held: claimed.data.claimed ? 'claimed now' : 'already this session\'s',
      },
      ...(journal.fate ? { fate: true } : {}),
    };
    // The intent is create-only: of two attaches of one digest that both read an empty journal, one journals it and
    // dispatches. The other takes the recovery path with the entry that is there, and never dispatches.
    const made = journal.intent ? await journal.intent(digest, intent) : (await journal.write(digest, { intent }), { first: true });
    if (!made.first) return made.entry?.receipt ? repeated(made.entry.receipt) : recover(made.entry?.intent ?? intent);
  } finally { if (marker) await journal.attempted?.(marker); }

  // The decision: a cancel recorded since the intent was journaled wins; else the fate is linked "dispatch", create-only,
  // against the cancel's own link. Lost, nothing is started; won, a cancel from here on knows a run is being started.
  const unstarted = async receipt => {
    const stopped = await lateCancel(intent, receipt);
    if (!stopped) throw new AttachError(`this attach's dispatch was already decided by another process; it is not dispatched again (plates home --cancel ${projectId}:phase:${phase} cancels it)`, 1);
    return { data: { ok: false, state: 'cancelled', effect, digest, ...(receipt ? { receipt } : {}), ...stopped }, text: `${shown}\nThe attach was ${cancelLine(stopped.cancel, stopped.cancelled)} before its run was started. Nothing was dispatched; release the claim with plates phase claim ${phase} --release.`, exitCode: 1 };
  };
  if (await phaseCancelOf()) return unstarted(null);
  if (journal.fate) { const fate = await journal.fate(digest, 'dispatch', at()); if (!fate.first) return unstarted(null); }
  let bound = false;
  const bindWorker = async () => {
    if (bound || !workerSession || !claimed.data.token || deps.claim) return;
    bound = true;
    const { bindClaimSession } = await import('./claim.mjs');
    await bindClaimSession({ root, phase, token: claimed.data.token, session: workerSession }, { env });
  };
  let result;
  try {
    // `before` is the last look, immediately before `rex run` or the host's start: a cancel recorded while the route
    // was getting there (finding Rex, making its session) leaves the run unstarted.
    result = await handler.dispatch({
      effect, digest, intent, root, env,
      ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
      before: async () => {
        if (await phaseCancelOf()) throw new Unstarted();
        await bindWorker();
      },
    });
  } catch (error) {
    if (!(error instanceof Unstarted)) throw error;
    return unstarted((await keep(intent, { route, at: at(), claim: intent.claim, result: { state: 'not-started', session: null, note: 'a cancel was recorded before the run was started; nothing was dispatched' } })).receipt);
  }
  const { receipt } = await keep(intent, { route, at: at(), claim: intent.claim, result });
  // A cancel that landed while the dispatch ran: stop what it just started, and report the cancel, not an attach.
  const late = await lateCancel(intent, receipt);
  if (late) return { data: { ok: false, state: 'cancelled', effect, digest, receipt, ...late }, text: `${shown}\nDispatched, but the attach was ${cancelLine(late.cancel, late.cancelled)}. Nothing is handed over.`, exitCode: 1 };
  const tokenNote = route === 'session' && intent.claim.token ? ` Token: ${intent.claim.token} (another session in this checkout resumes or releases with --token ${intent.claim.token}).` : '';
  const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'attached', receipt: `attach:${digest}` }, deps);
  // "dispatched" is said only here: the fate was this dispatch's, the run started, and no cancel landed since. A cancel
  // that won the fate, or was found before or after the run, returned above; its line is the cancel's own.
  const progress = await noteProgress({ project: projectId, phase: Number(phase), step: 'dispatched', digest, text: dispatchedText({ route, provider, phase, result }) }, { ...deps, env });
  return withProgress(withNote({ data: { ok: true, state: 'attached', effect, digest, receipt }, text: `${shown}\nClaimed (${intent.claim.held}).${tokenNote} Hand it to ${provider}:\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 }, note), progress);
}
/** Thrown through a route's dispatch by attach's `before`: the run was left unstarted. */
class Unstarted extends Error {}

/**
 * plates home --attach <key> --route <r> [--provider <p>] [--yes], in the
 * plate's own checkout. key: the backlog's `<plate>:phase:<n>`. The phase must
 * be ready to build (nextPhase) in this checkout's phases.
 */
export async function attachCommand({ root, key, route, provider, yes = false }, deps = {}) {
  const env = deps.env ?? process.env;
  const m = /^([a-z][a-z0-9-]{0,63}):phase:(\d+)$/.exec(String(key ?? ''));
  if (!m) throw new AttachError('--attach takes a phase\'s backlog key, <plate>:phase:<n> (plates home --backlog --json lists them)');
  const [{ collect, nextPhase }, { plateIdOf }, { providerOf }] = await Promise.all([import('../practices/phases/files/scripts/roadmap.mjs'), import('./work-items.mjs'), import('./claim.mjs')]);
  const data = await collect(root);
  const here = plateIdOf(data.config.repo ?? data.config.name);
  if (m[1] !== here) throw new AttachError(`${key} is ${m[1]}'s; this checkout is ${here}. Run it in ${m[1]}'s checkout`);
  const id = Number(m[2]), p = data.phases.find(x => x.id === id);
  if (!p) throw new AttachError(`no phase ${id} in ${here}`);
  const retired = new Set((data.goals ?? []).filter(g => g.retired).map(g => g.id));
  if (!nextPhase(data.phases, x => x === p && !retired.has(x.goal), deps.today)) throw new AttachError(`phase ${id} is not ready to build (built, owing a walk, dated, or waiting on depends): nothing to attach`, 1);
  const who = providerOf(env, provider);
  let phaseText, host;
  if (route === 'local-host') {
    checkRoute(data.config, route); // off by policy: refused before the host's configuration is read
    if (!who) throw new AttachError('which host? --provider <name>: the provider the local host claims with, a key of "agents" and of its local-hosts.json');
    host = await (deps.readHost ?? readLocalHost)({ root, provider: who, env });
    const [{ sectionsOf }, { decisionContext }] = await Promise.all([import('../practices/phases/files/scripts/roadmap.mjs'), import('../practices/reconciliation/files/scripts/plates/decision-context.mjs')]);
    const raw = await readFile(join(root, 'docs', 'phases', p.file), 'utf8');
    const sections = sectionsOf(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(raw)?.[1] ?? '');
    const c = await decisionContext({ root, phase: id });
    phaseText = { doneWhen: sections['Done when'], acceptance: sections.Acceptance, context: { state: c.state, digest: c.digest, decisions: c.decisions, proposals: c.proposals, gaps: c.gaps } };
  }
  return attach({ root, projectId: here, phase: id, title: p.title, route, provider: who, config: data.config, yes, phaseText, host }, deps);
}
