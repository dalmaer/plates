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
//      (never committed, as claim tokens are kept).
//   4. Dispatch the route, then write the receipt beside the intent.
//   5. An intent with no receipt is an uncertain dispatch: the next attach
//      with the same digest recovers it through the route's recover(), and
//      never dispatches again. A receipt already there is returned as it is.
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
import { readFile, readdir, writeFile, mkdir, rename, rm, stat, access, chmod, constants, realpath } from 'node:fs/promises';
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
// Both run with argv (no shell), bounded in time and output, and with an
// environment of PATH, HOME, user, shell, locale and temp only: no token or
// credential plates holds is passed. Plates never stops or restarts a host.
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
  if (host.prompt !== undefined && (host.harness === undefined || !PROMPTS.includes(host.prompt))) throw new AttachError(`${file}: hosts.${provider}.prompt, when present, is ${PROMPTS.map(p => `"${p}"`).join(' or ')} and goes with a harness`);
  return { file, start: host.start ? [...host.start] : null, state: host.state ? [...host.state] : null, harness: host.harness ? [...host.harness] : null, ...(host.harness ? { prompt: harnessPrompt({ harness: host.harness, prompt: host.prompt }) } : {}) };
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

/** The environment a host runs with: nothing plates holds beyond the basics. */
export const hostEnv = (env = process.env) => Object.fromEntries(HOST_ENV.filter(k => typeof env[k] === 'string').map(k => [k, env[k]]));

/** Run one host command: argv, stdin, a time bound and an output cap. { code, stdout } (and stderr when asked) or throws. */
export function runHost(command, { cwd, input = '', env, timeoutMs = 60_000, maxBytes = 64 * 1024, stderr = false }) {
  return new Promise((done, fail) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['pipe', 'pipe', stderr ? 'pipe' : 'ignore'] });
    let out = '', err = '', over = false;
    const timer = setTimeout(() => { over = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; if (Buffer.byteLength(out) > maxBytes) { over = true; child.kill('SIGKILL'); } });
    if (stderr) { child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { err += chunk; if (Buffer.byteLength(err) > maxBytes) { over = true; child.kill('SIGKILL'); } }); }
    child.on('error', error => { clearTimeout(timer); fail(new AttachError(`the host command ${command[0]} could not run: ${error.code ?? error.message}`, 1)); });
    child.on('close', code => { clearTimeout(timer); if (over) fail(new AttachError(`the host command ${command[0]} ran past its bound (${timeoutMs} ms or ${maxBytes} bytes)`, 1)); else done(stderr ? { code, stdout: out, stderr: err } : { code, stdout: out }); });
    child.stdin.on('error', () => {});
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
async function briefsOutsideRepositories(dir, checkout, env) {
  let at = dir;
  for (;;) {
    try { at = await realpath(at); break; } catch { const up = dirname(at); if (up === at) throw new AttachError(`the brief directory ${dir} has no existing ancestor; nothing was started`); at = up; }
  }
  const top = await realpath(checkout);
  if (at === top || at.startsWith(top + sep)) throw new AttachError(`refused: the brief directory ${dir} resolves inside this checkout (${top}); set XDG_STATE_HOME outside it. Nothing was started.`);
  const inside = await new Promise(done => execFile('git', ['-C', at, 'rev-parse', '--show-toplevel'], { env: hostEnv(env), timeout: 10_000 }, (error, stdout) => done(error ? '' : String(stdout).trim())));
  if (inside) throw new AttachError(`refused: the brief directory ${dir} resolves inside the git working tree ${inside}; a brief never lands in a repository. Nothing was started.`);
}

/** Write a brief to a new mode-600 file in a private directory under plates's state directory; its path. */
async function writeBriefFile(brief, env, checkout) {
  const dir = join(platesState(env), 'rex-briefs');
  await briefsOutsideRepositories(dir, checkout, env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const file = join(dir, `${randomBytes(16).toString('hex')}.brief`);
  await writeFile(file, brief, { mode: 0o600, flag: 'wx' });
  return file;
}

/**
 * Start a harness in Rex: find or create the `<plate>-<provider>` session, then
 * open one tab running lib/rex-run.mjs with the brief file and the harness.
 * Every Rex call runs with hostEnv only, inside one `timeoutMs` bound.
 * Returns { session: 'rex:<session>/<block>', label, created, tab }.
 */
export async function rexDispatch({ rex, plate, provider, label: given = null, checkout, harness, prompt = null, brief, tab, env = process.env, timeoutMs = 60_000 }) {
  const label = given ?? rexLabel(plate, provider), deadline = Date.now() + timeoutMs;
  const call = async args => {
    const left = deadline - Date.now();
    if (left <= 0) throw new AttachError(`Rex did not answer within ${timeoutMs} ms`, 1);
    const r = await runHost([rex.bin, ...args], { cwd: checkout, env: hostEnv(env), timeoutMs: left });
    if (r.code !== 0) throw new AttachError(`rex ${args[0]} exited ${r.code}`, 1);
    try { return JSON.parse(r.stdout); } catch { throw new AttachError(`rex ${args[0]} answered no JSON`, 1); }
  };
  let session = rex.sessions.find(s => s.label === label)?.session_id ?? null, created = false;
  if (!session) { session = (await call(['new', label, '-c', checkout, '--json']))?.session_id; created = true; }
  if (!REX_ID.test(String(session ?? ''))) throw new AttachError(`rex new answered no session id for ${label}`, 1);
  const file = await writeBriefFile(brief, env, checkout);
  try {
    const out = await call(['run', '-s', session, '-c', checkout, '--label', tab, '--keep-open', '--focus=false', '--json', '--', process.execPath, REX_RUN, ...(harnessPrompt({ harness, prompt }) === 'arg' ? ['--prompt=arg'] : []), file, '--', ...harness]);
    const block = typeof out?.block_id === 'string' ? out.block_id : Array.isArray(out?.block_ids) ? out.block_ids[0] : null;
    if (!REX_ID.test(String(block ?? ''))) throw new AttachError('rex run answered no block id', 1);
    return { session: `rex:${session}/${block}`, label, created, tab };
  } catch (error) {
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
 * a harness and no Rex is refused, saying why. { session, via, rex? }.
 */
export async function startHost({ host, plate, provider, label = null, checkout, brief, tab, env = process.env, find = findRex }) {
  const rex = host.harness ? await find({ env }) : null;
  if (rex) { const r = await rexDispatch({ rex, plate, provider, label, checkout, harness: host.harness, prompt: host.prompt ?? null, brief, tab, env }); return { session: r.session, via: 'rex', rex: { label: r.label, created: r.created, tab: r.tab } }; }
  if (!host.start) throw new AttachError(`this host names only a harness, and Rex is not answering here (no rex on PATH, or rex ls --json failed): nothing was started. Start Rex, or add a start command to ${host.file ?? 'local-hosts.json'}`, 2);
  const r = await runHost([...host.start, checkout], { cwd: checkout, input: brief, env: hostEnv(env) });
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
    `Release, if it will not be built: plates phase claim ${phase} --release`, ''].join('\n');
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

/** The journal: one file per digest under the checkout's git dir. { intent, receipt? }. */
export function attachJournal(dir) {
  const file = digest => join(dir, `${digest}.json`);
  return {
    async read(digest) { try { return JSON.parse(await readFile(file(digest), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw new AttachError(`the attach journal ${file(digest)} could not be read: ${error.code ?? error.message}; nothing is dispatched until it is`, 1); } },
    async list() {
      let names;
      try { names = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const out = [];
      for (const n of names.filter(n => /^[0-9a-f]{64}\.json$/.test(n)).sort()) { try { out.push({ digest: n.slice(0, 64), ...JSON.parse(await readFile(join(dir, n), 'utf8')) }); } catch { /* a torn entry is not listed */ } }
      return out;
    },
    async write(digest, value) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file(digest)}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(tmp, file(digest));
    },
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
    dispatch: async ({ effect, root, env }) => {
      const h = effect.host;
      // The prompt mode the preview showed (and its digest covers) is the one dispatched; an intent from before it had one takes the harness's default.
      const r = await startHost({ host: { file: h.config, start: h.start, harness: h.harness ?? null, prompt: h.prompt ?? null }, provider: effect.provider, label: h.rex?.label ?? null, checkout: root, brief: effect.brief.text, tab: h.rex?.tab, env });
      if (r.via === 'rex') return { state: 'dispatched', session: r.session, rex: r.rex };
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
    if (r?.route !== 'local-host' || !r.result?.session || !e?.host) continue;
    const state = await query({ state: e.host.state, session: r.result.session, env });
    if (state) out.push({ phase: e.phase, state, source: `local host ${e.provider}, session ${r.result.session}` });
  }
  return out;
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
  const at = () => new Date(deps.now ?? Date.now()).toISOString();
  const seen = await journal.read(digest);
  // Already attached: the receipt as it is. Nothing is claimed or dispatched again.
  if (seen?.receipt) return { data: { ok: true, state: 'attached', effect, digest, receipt: seen.receipt, repeated: true }, text: `${shown}\nAlready attached at ${seen.receipt.at}; nothing was done again.\n\n${seen.receipt.result.brief ?? ''}`.trimEnd(), exitCode: 0 };
  // An intent with no receipt: the dispatch's outcome is unknown. Recover it; never dispatch again.
  if (seen?.intent) {
    const result = await handler.recover({ effect, digest, intent: seen.intent });
    const receipt = { route, at: at(), claim: seen.intent.claim, result };
    await journal.write(digest, { intent: seen.intent, receipt });
    const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'recovered', receipt: `attach:${digest}` }, deps);
    return withNote({ data: { ok: true, state: 'attached', effect, digest, receipt, recovered: true }, text: `${shown}\nRecovered the attach journaled at ${seen.intent.at}; it was not dispatched again.\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 }, note);
  }

  // A host already run for this phase (another digest: the phase or its decisions moved since) is never run again from here.
  if (route !== 'session') {
    const earlier = (await (journal.list?.() ?? [])).find(x => x.digest !== digest && x.intent?.route === route && String(x.intent?.effect?.phase) === String(phase) && x.intent?.effect?.projectId === projectId);
    if (earlier) return { data: { ok: false, state: 'already-dispatched', effect, digest, earlier: { digest: earlier.digest, at: earlier.intent.at, result: earlier.receipt?.result ?? null } }, text: `${shown}\nAlready handed to a ${route} at ${earlier.intent.at}${earlier.receipt?.result?.session ? ` (session ${earlier.receipt.result.session})` : ''}; it is not run again. Release the claim first to hand it over afresh.`, exitCode: 1 };
  }
  const claimed = await (deps.claim ?? (async args => (await import('./claim.mjs')).claim(args, { env: deps.env })))({ root, phase, provider });
  if (!claimed.data?.ok) {
    const holder = claimed.data?.holder;
    const who = holder ? `${holder.provider ?? 'someone'}${holder.machine ? ` on ${holder.machine}` : ''}${holder.at ? ` since ${holder.at}` : ''}` : 'no one it could name';
    const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'taken' }, deps);
    return withNote({ data: { ok: false, state: 'taken', effect, digest, holder: holder ?? null }, text: `${shown}\nTaken by ${who}: ${claimed.text}\nNothing was dispatched.`, exitCode: 1 }, note);
  }
  const intent = { route, at: at(), effect, claim: { ref: effect.claimRef, sha: claimed.data.sha ?? null, held: claimed.data.claimed ? 'claimed now' : 'already this session\'s' } };
  await journal.write(digest, { intent });
  const result = await handler.dispatch({ effect, digest, intent, root, env });
  const receipt = { route, at: at(), claim: intent.claim, result };
  await journal.write(digest, { intent, receipt });
  const note = await noteEvent(root, { actor: `agent:${provider}`, key: `${projectId}:phase:${phase}`, action: 'attach', route, lane: 'agent-ready', outcome: 'attached', receipt: `attach:${digest}` }, deps);
  return withNote({ data: { ok: true, state: 'attached', effect, digest, receipt }, text: `${shown}\nClaimed (${intent.claim.held}). Hand it to ${provider}:\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 }, note);
}

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
