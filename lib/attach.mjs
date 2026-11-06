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
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, isAbsolute, sep } from 'node:path';
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

/** What a local host's state query may answer. */
export const HOST_STATES = Object.freeze(['starting', 'running', 'waiting', 'finished', 'failed']);
const SESSION = /^[A-Za-z0-9._:-]{1,128}$/;
const HOST_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM'];
/** The owner's private host configuration file. */
export const localHostsFile = (env = process.env) => join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'plates', 'local-hosts.json');
const argv = v => Array.isArray(v) && v.length >= 1 && v.length <= 16 && v.every(a => typeof a === 'string' && a.length <= 1024 && !/[\x00]/.test(a)) && isAbsolute(v[0]);

/** The host configured for a provider: { file, start, state }. Refused when it is missing, malformed, or inside the checkout (a committed file). */
export async function readLocalHost({ root, provider, env = process.env }) {
  const file = localHostsFile(env);
  if (resolve(file).startsWith(resolve(root) + sep)) throw new AttachError(`${file} is inside this checkout; a local host is configured outside any repo`);
  let config;
  try { config = JSON.parse(await readFile(file, 'utf8')); } catch (error) { throw new AttachError(error.code === 'ENOENT' ? `no local agent host is configured: write ${file} (see docs/guide/web-home.md)` : `${file} could not be read: ${error.code ?? error.message}`); }
  const host = config?.hosts?.[provider];
  if (!host) throw new AttachError(`${file} has no host for ${provider} (hosts: ${Object.keys(config?.hosts ?? {}).join(', ') || 'none'})`);
  if (!argv(host.start)) throw new AttachError(`${file}: hosts.${provider}.start is an argv array whose first entry is an absolute path`);
  if (host.state !== undefined && !argv(host.state)) throw new AttachError(`${file}: hosts.${provider}.state, when present, is an argv array whose first entry is an absolute path`);
  return { file, start: [...host.start], state: host.state ? [...host.state] : null };
}

/** The environment a host runs with: nothing plates holds beyond the basics. */
export const hostEnv = (env = process.env) => Object.fromEntries(HOST_ENV.filter(k => typeof env[k] === 'string').map(k => [k, env[k]]));

/** Run one host command: argv, stdin, a time bound and an output cap. { code, stdout } or throws. */
export function runHost(command, { cwd, input = '', env, timeoutMs = 60_000, maxBytes = 64 * 1024 }) {
  return new Promise((done, fail) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '', over = false;
    const timer = setTimeout(() => { over = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; if (Buffer.byteLength(out) > maxBytes) { over = true; child.kill('SIGKILL'); } });
    child.on('error', error => { clearTimeout(timer); fail(new AttachError(`the host command ${command[0]} could not run: ${error.code ?? error.message}`, 1)); });
    child.on('close', code => { clearTimeout(timer); if (over) fail(new AttachError(`the host command ${command[0]} ran past its bound (${timeoutMs} ms or ${maxBytes} bytes)`, 1)); else done({ code, stdout: out }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** A host's answer to its state query, or null (no state command, an error, or a word not in HOST_STATES): silent. */
export async function hostState({ state, session, env = process.env, timeoutMs = 10_000 }) {
  if (!state || !SESSION.test(String(session ?? ''))) return null;
  try { const r = await runHost([...state, session], { cwd: homedir(), env: hostEnv(env), timeoutMs }); const word = r.stdout.trim(); return r.code === 0 && HOST_STATES.includes(word) ? word : null; } catch { return null; }
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
export function attachPreview({ projectId, phase, title, route, provider, phaseText, host }) {
  if (!BUILT_ROUTES.includes(route)) throw new AttachError(`route ${route} is not built yet; this build attaches ${BUILT_ROUTES.join(', ')}`);
  const local = route === 'local-host';
  if (local && (!host || !phaseText)) throw new AttachError('a local-host attach needs its configured host and the phase\'s Done when, Acceptance and decision context');
  const text = local ? hostBrief({ projectId, phase, title, provider, ...phaseText }) : sessionBrief({ projectId, phase, title, provider });
  const effect = { schema: 1, projectId, phase, title, claimRef: `refs/heads/claims/phase-${phase}`, provider, route,
    brief: { bytes: Buffer.byteLength(text), sha256: sha256(text), text },
    ...(local ? { host: { config: host.file, start: host.start, state: host.state } } : {}),
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
      const r = await runHost([...effect.host.start, root], { cwd: root, input: effect.brief.text, env: hostEnv(env) });
      const session = r.stdout.split('\n')[0].trim();
      if (r.code !== 0) throw new AttachError(`the local host exited ${r.code}; it was asked once and is not asked again (plates phase claim ${effect.phase} --release to give the phase back)`, 1);
      if (!SESSION.test(session)) throw new AttachError('the local host printed no session id (one line of [A-Za-z0-9._:-]); it is not asked again', 1);
      return { state: 'dispatched', session };
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
  const { effect, digest } = attachPreview({ projectId, phase, title, route, provider, phaseText, host });
  const shown = `Attach ${provider} to ${projectId} #${phase} (${title}) by route ${route}.\n  claim: ${effect.claimRef} (create-only, read back)\n  brief: ${effect.brief.bytes} bytes, sha256 ${effect.brief.sha256.slice(0, 12)}${effect.host ? `\n  host: ${effect.host.start.join(' ')} <checkout>, brief on stdin (from ${effect.host.config}); state query: ${effect.host.state ? effect.host.state.join(' ') : 'none, so its card says claimed'}` : ''}\n  budget: ${effect.budget.from}\n  digest: ${digest}`;
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
