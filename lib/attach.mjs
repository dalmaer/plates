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
//
// Routes built here: `session` (the claim, then the /spin <n> brief for the
// owner to open in Claude Code or Codex; no process is started). The plate's
// `backlog.routes` policy says which routes it offers (absent: session only);
// a route it offers that is not built here is refused, saying so.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { offeredRoutes } from './web/agents-model.mjs';

export class AttachError extends Error { constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; } }

/** The routes this build can start. The rest are listed in the spec and refused here until they are built. */
export const BUILT_ROUTES = Object.freeze(['session']);
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

/**
 * The preview: { effect, digest }. effect: { schema, projectId, phase, title,
 * claimRef, provider, route, brief: { bytes, sha256, text }, budget }. The
 * digest covers every field: a change to any of them is a different attach.
 */
export function attachPreview({ projectId, phase, title, route, provider }) {
  if (!BUILT_ROUTES.includes(route)) throw new AttachError(`route ${route} is not built yet; this build attaches ${BUILT_ROUTES.join(', ')}`);
  const text = sessionBrief({ projectId, phase, title, provider });
  const effect = { schema: 1, projectId, phase, title, claimRef: `refs/heads/claims/phase-${phase}`, provider, route,
    brief: { bytes: Buffer.byteLength(text), sha256: sha256(text), text },
    budget: { minutes: null, from: 'none: a session spends the owner\'s own agent time, not a plates allowance' } };
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
    async write(digest, value) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file(digest)}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(tmp, file(digest));
    },
  };
}
const gitPath = (root, path) => new Promise(done => execFile('git', ['-C', root, 'rev-parse', '--git-path', path], { encoding: 'utf8' }, (error, stdout) => done(error ? null : resolve(root, stdout.trim()))));

/** The session route: hand over the brief. No outward call; recovery hands the same brief again. */
export const ROUTE_HANDLERS = Object.freeze({
  session: { dispatch: async ({ effect }) => ({ state: 'handed', brief: effect.brief.text }), recover: async ({ effect }) => ({ state: 'handed', brief: effect.brief.text, recovered: true }) },
});

/**
 * Attach: preview (yes false), or the whole contract (yes true). deps (tests):
 * claim (lib/claim.mjs's), journal, handlers, now. Returns { data, text,
 * exitCode }: 3 for a preview, 1 when taken or refused, 0 attached.
 */
export async function attach({ root, projectId, phase, title, route, provider, config, yes = false }, deps = {}) {
  checkRoute(config, route);
  if (!provider) throw new AttachError('which agent? --provider <name> (a key of "agents" in .plates/plates.json), or PLATES_PROVIDER');
  if (config?.agents && typeof config.agents === 'object' && !Object.hasOwn(config.agents, provider)) throw new AttachError(`--provider ${provider} is not one of this plate's agents (${Object.keys(config.agents).join(', ')})`);
  const { effect, digest } = attachPreview({ projectId, phase, title, route, provider });
  const shown = `Attach ${provider} to ${projectId} #${phase} (${title}) by route ${route}.\n  claim: ${effect.claimRef} (create-only, read back)\n  brief: ${effect.brief.bytes} bytes, sha256 ${effect.brief.sha256.slice(0, 12)}\n  budget: ${effect.budget.from}\n  digest: ${digest}`;
  if (!yes) return { data: { ok: true, state: 'preview', effect, digest }, text: `${shown}\nNothing is claimed yet. Add --yes to claim and start it.`, exitCode: 3 };

  const journal = deps.journal ?? attachJournal(await gitPath(root, 'plates-attach') ?? join(root, '.git', 'plates-attach'));
  const handler = (deps.handlers ?? ROUTE_HANDLERS)[route];
  const at = () => new Date(deps.now ?? Date.now()).toISOString();
  const seen = await journal.read(digest);
  // Already attached: the receipt as it is. Nothing is claimed or dispatched again.
  if (seen?.receipt) return { data: { ok: true, state: 'attached', effect, digest, receipt: seen.receipt, repeated: true }, text: `${shown}\nAlready attached at ${seen.receipt.at}; nothing was done again.\n\n${seen.receipt.result.brief ?? ''}`.trimEnd(), exitCode: 0 };
  // An intent with no receipt: the dispatch's outcome is unknown. Recover it; never dispatch again.
  if (seen?.intent) {
    const result = await handler.recover({ effect, digest, intent: seen.intent });
    const receipt = { route, at: at(), claim: seen.intent.claim, result };
    await journal.write(digest, { intent: seen.intent, receipt });
    return { data: { ok: true, state: 'attached', effect, digest, receipt, recovered: true }, text: `${shown}\nRecovered the attach journaled at ${seen.intent.at}; it was not dispatched again.\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 };
  }

  const claimed = await (deps.claim ?? (async args => (await import('./claim.mjs')).claim(args, { env: deps.env })))({ root, phase, provider });
  if (!claimed.data?.ok) {
    const holder = claimed.data?.holder;
    const who = holder ? `${holder.provider ?? 'someone'}${holder.machine ? ` on ${holder.machine}` : ''}${holder.at ? ` since ${holder.at}` : ''}` : 'no one it could name';
    return { data: { ok: false, state: 'taken', effect, digest, holder: holder ?? null }, text: `${shown}\nTaken by ${who}: ${claimed.text}\nNothing was dispatched.`, exitCode: 1 };
  }
  const intent = { route, at: at(), effect, claim: { ref: effect.claimRef, sha: claimed.data.sha ?? null, held: claimed.data.claimed ? 'claimed now' : 'already this session\'s' } };
  await journal.write(digest, { intent });
  const result = await handler.dispatch({ effect, digest, intent });
  const receipt = { route, at: at(), claim: intent.claim, result };
  await journal.write(digest, { intent, receipt });
  return { data: { ok: true, state: 'attached', effect, digest, receipt }, text: `${shown}\nClaimed (${intent.claim.held}). Hand it to ${provider}:\n\n${result.brief ?? ''}`.trimEnd(), exitCode: 0 };
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
  return attach({ root, projectId: here, phase: id, title: p.title, route, provider: providerOf(env, provider), config: data.config, yes }, deps);
}
