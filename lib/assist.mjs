// Assists: what an agent may do on an item that is not a build (plates phase
// 182; docs/specs/web-backlog.md, "Assists" and "Boundaries"). Built here:
// `decision-draft`, an agent's recommendation on a phase's Your part, with
// the evidence it rests on.
//
// A draft is a record, never an answer. It is { itemKey, recommend (one of the
// item's choices), why, evidence: [links], sourceRevision, agent, at }. It
// goes through the attach contract (lib/attach.mjs) with route `session`: the
// agent is the owner's own session, run by hand. Nothing starts a process.
//   1. Preview: the exact draft and its digest; the CLI exits 3 until --yes.
//   2. No claim: an assist is not a build, so it never takes the phase's
//      claim (the spec's "every route that builds starts by creating the
//      claim"); a build attached to the same phase is not blocked by it.
//   3. Journal the intent under the checkout's git dir, then store the draft,
//      then the receipt. An intent with no receipt is recovered from the
//      store, never written twice.
//
// Where it is stored: no existing digest-bound path holds an agent's
// recommendation (decision writes record the owner's answer; walk drafts hold
// the owner's walk; shaping drafts hold a spec body). So drafts are kept
// locally, under the checkout's git dir beside the attach journal, never
// committed, and only the CLI's backlog reads them. The hosted side would need
// a store of its own (see the guide).
//
// It also leaves a backlog event (lib/backlog-events.mjs, phase 184) in the
// project's private .plates/backlog-events/: metadata only, never the draft.
//
// What it never writes: an answer, an acceptance box, a status, evidence, a
// Not now, a walk result. ASSIST_WRITES says what it writes, and
// tests/backlog-assist.test.mjs holds the source tree unchanged by one.
//
// Withdrawn: a draft names the git blob of the item's phase file at HEAD when
// it was written (sourceRevision, the same id GitHub's trees give the hosted
// read). When that file's blob moves, the draft is withdrawn: the backlog no
// longer shows it and says it was withdrawn and why.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AttachError, attachJournal, canonical, checkRoute, noteEvent } from './attach.mjs';

/** The assists in the spec, in its order. */
export const ASSISTS = Object.freeze(['walk-prep', 'decision-draft', 'shape']);
/** The assists this build has. */
export const BUILT_ASSISTS = Object.freeze(['decision-draft']);
/** With no `backlog.assists` policy, a plate offers a decision draft: it is local to the checkout and writes nothing a person decides. */
export const DEFAULT_ASSISTS = Object.freeze(['decision-draft']);
/** The only route an assist runs by in this build: the owner's own session. */
export const ASSIST_ROUTE = 'session';
/** Everything an assist writes, and nothing else: its journal and its draft, under the checkout's git dir. Never source. */
export const ASSIST_WRITES = Object.freeze(['git-dir:plates-assist/journal', 'git-dir:plates-assist/drafts', 'ignored:.plates/backlog-events']);
const LIMITS = Object.freeze({ why: 300, link: 300, evidence: 8 });

const sha256 = text => createHash('sha256').update(text).digest('hex');
/** Git's blob id for these bytes: what `git rev-parse HEAD:<path>` and GitHub's trees name a file by. */
export const blobRevision = bytes => { const b = Buffer.from(bytes); return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex'); };
const oneLine = (v, n) => typeof v === 'string' && v.trim() && v.length <= n && !/[\x00-\x1f\x7f]/.test(v) ? v.trim() : null;

/** The assists one plate offers: its `backlog.assists` policy, else DEFAULT_ASSISTS. */
export function offeredAssists(config) {
  const b = config?.backlog;
  return b && typeof b === 'object' && !Array.isArray(b) && Array.isArray(b.assists) ? ASSISTS.filter(a => b.assists.includes(a)) : [...DEFAULT_ASSISTS];
}

/** An evidence link: an https URL, or a path in this repo (optionally `path:"test name"` or `path#anchor`) that exists at HEAD. Returns the kept text or a reason. */
export function evidenceLink(value, exists = () => true) {
  const v = oneLine(value, LIMITS.link);
  if (!v) return { why: `an evidence link is one line of at most ${LIMITS.link} characters` };
  if (/^https:\/\/[^\s/]+\/\S*$/.test(v)) return { link: v };
  const path = v.split(/[:#]/)[0];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || !path || path.startsWith('/') || path.split('/').includes('..')) return { why: `"${v}" is neither an https link nor a path in this repo` };
  if (!exists(path)) return { why: `${path} is not in this checkout's HEAD` };
  return { link: v };
}

/**
 * The preview of a decision draft: { effect, digest }. effect: { schema,
 * assist, route, projectId, itemKey, file, agent, draft: { recommend, why,
 * evidence, sourceRevision } }. The digest covers all of it.
 */
export function draftPreview({ projectId, itemKey, file, agent, recommend, why, evidence, sourceRevision }) {
  const effect = { schema: 1, assist: 'decision-draft', route: ASSIST_ROUTE, projectId, itemKey, file, agent, writes: [...ASSIST_WRITES],
    draft: { recommend, why, evidence: [...evidence], sourceRevision } };
  return { effect, digest: sha256(canonical(effect)) };
}

/** The draft store: one file per item and agent. */
export function draftStore(dir) {
  const name = (itemKey, agent) => `${sha256(`${itemKey}\n${agent}`).slice(0, 32)}.json`;
  const journal = attachJournal(dir); // the same atomic, private writer as the attach journal
  return {
    async put(draft) { await journal.write(name(draft.itemKey, draft.agent).replace(/\.json$/, ''), draft); },
    async get(itemKey, agent) { return journal.read(name(itemKey, agent).replace(/\.json$/, '')); },
    async all() {
      let files;
      try { files = await readdir(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const out = [];
      for (const f of files.filter(f => /^[0-9a-f]{32}\.json$/.test(f)).sort()) { try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8'))); } catch { /* a torn draft is not shown */ } }
      return out;
    },
  };
}

const run = (root, args) => new Promise(done => execFile('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 20 }, (error, stdout) => done(error ? null : stdout.trim())));
/** The git dir paths an assist writes under. */
export async function assistDirs(root) {
  const base = (await run(root, ['rev-parse', '--git-path', 'plates-assist'])) ?? join('.git', 'plates-assist');
  const dir = resolve(root, base);
  return { journal: join(dir, 'journal'), drafts: join(dir, 'drafts') };
}
/** The blob id of a path at HEAD, or null when it is not committed. */
export const headRevision = (root, path) => run(root, ['rev-parse', '--verify', '--quiet', `HEAD:${path}`]);

/**
 * Draft a recommendation: preview (yes false), or the contract (yes true).
 * deps (tests): journal, store, now. Returns { data, text, exitCode }: 3 for a
 * preview, 0 drafted.
 */
export async function draftDecision({ root, projectId, itemKey, file, choices, agent, recommend, why, evidence, sourceRevision, config, yes = false }, deps = {}) {
  checkRoute(config, ASSIST_ROUTE);
  if (!offeredAssists(config).includes('decision-draft')) throw new AttachError('assist decision-draft is off: not in backlog.assists');
  if (!choices.length) throw new AttachError(`${itemKey} asks nothing with choices (its Your part has no Choices), so there is nothing to recommend`);
  if (!choices.includes(recommend)) throw new AttachError(`--recommend must be one of the item's choices: ${choices.join(' | ')}`);
  const because = oneLine(why, LIMITS.why);
  if (!because) throw new AttachError(`--why is the reason, one line of at most ${LIMITS.why} characters`);
  if (!evidence.length) throw new AttachError('a recommendation links its evidence: --evidence <https link or repo path>, once or more');
  if (evidence.length > LIMITS.evidence) throw new AttachError(`at most ${LIMITS.evidence} --evidence links`);
  if (!sourceRevision) throw new AttachError(`${file} is not committed at HEAD, so a draft could not say which revision it read`);
  const { effect, digest } = draftPreview({ projectId, itemKey, file, agent, recommend, why: because, evidence, sourceRevision });
  const shown = `Draft ${agent}'s recommendation on ${itemKey} (assist decision-draft, route ${ASSIST_ROUTE}).\n  recommends: ${recommend}\n  because: ${because}\n  evidence: ${evidence.join(', ')}\n  source: ${file} at ${sourceRevision.slice(0, 12)}\n  writes: a draft under the checkout's git dir; no answer, acceptance, status or evidence\n  digest: ${digest}`;
  if (!yes) return { data: { ok: true, state: 'preview', effect, digest }, text: `${shown}\nNothing is drafted yet. Add --yes to keep it.`, exitCode: 3 };

  const dirs = deps.journal && deps.store ? null : await assistDirs(root);
  const journal = deps.journal ?? attachJournal(dirs.journal), store = deps.store ?? draftStore(dirs.drafts);
  const at = () => new Date(deps.now ?? Date.now()).toISOString();
  const seen = await journal.read(digest);
  if (seen?.receipt) return { data: { ok: true, state: 'drafted', effect, digest, receipt: seen.receipt, repeated: true }, text: `${shown}\nAlready drafted at ${seen.receipt.at}; nothing was done again.`, exitCode: 0 };
  const intent = seen?.intent ?? { assist: 'decision-draft', route: ASSIST_ROUTE, at: at(), effect };
  if (!seen?.intent) await journal.write(digest, { intent });
  // Recovery: a draft already stored with this digest is the one the intent meant; it is not written twice.
  const held = await store.get(itemKey, agent);
  const recovered = !!seen?.intent && held?.digest === digest;
  if (!recovered) await store.put({ schema: 1, assist: 'decision-draft', itemKey, projectId, file, agent, ...effect.draft, at: intent.at, digest });
  const receipt = { assist: 'decision-draft', route: ASSIST_ROUTE, at: at(), stored: 'draft', ...(seen?.intent ? { recovered: true } : {}) };
  await journal.write(digest, { intent, receipt });
  // The backlog event (phase 184): metadata only, best effort. Never the recommendation or its why.
  const eventNote = await noteEvent(root, { actor: `agent:${agent}`, key: itemKey, action: 'assist', route: ASSIST_ROUTE, lane: 'yours', outcome: seen?.intent ? 'recovered' : 'drafted', receipt: `assist:${digest}` }, deps);
  return { data: { ok: true, state: 'drafted', effect, digest, receipt, ...(eventNote ? { eventNote } : {}) }, text: `${shown}\n${seen?.intent ? 'Recovered the draft journaled at ' + seen.intent.at + '. ' : ''}Drafted. The backlog shows it as the agent's recommendation until ${file} moves; it is not an answer.`, exitCode: 0 };
}

/**
 * The drafts on the backlog's cards (pure). backlog: backlogFor's value.
 * drafts: the store's records. revisionOf(projectId, file): the file's current
 * blob, or null when unknown (then a draft is withdrawn: its source cannot be
 * shown to be the one it read). A draft shows on a card with its key whose
 * question still offers its choice and whose source is at its revision;
 * otherwise it is withdrawn, with why. Returns the backlog with each card's
 * `assists` and `withdrawn: [{ itemKey, agent, recommend, why }]`.
 */
export function withDrafts(backlog, drafts, revisionOf) {
  const withdrawn = [], shown = new Set();
  const lanes = (backlog?.lanes ?? []).map(lane => ({ ...lane, items: lane.items.map(item => {
    const mine = drafts.filter(d => d?.itemKey === item.key && d.assist === 'decision-draft');
    if (!mine.length) return item;
    const assists = [...(item.assists ?? [])];
    for (const d of mine) {
      shown.add(d);
      const now = item.source?.file ? revisionOf(item.projectId, item.source.file) : null;
      const why = now !== d.sourceRevision ? (now ? `${d.file} moved from ${String(d.sourceRevision).slice(0, 7)} to ${now.slice(0, 7)}` : `${d.file}'s revision could not be read`)
        : !item.question?.choices?.includes(d.recommend) ? `"${d.recommend}" is no longer one of its choices` : null;
      if (why) withdrawn.push({ itemKey: d.itemKey, agent: d.agent, recommend: d.recommend, why });
      else assists.push({ assist: 'decision-draft', agent: d.agent, recommend: d.recommend, why: d.why, evidence: [...(d.evidence ?? [])], at: d.at ?? null, sourceRevision: d.sourceRevision });
    }
    return { ...item, assists };
  }) }));
  // A draft whose item is not on the backlog any more (built, or out of this lane) is not shown, and not listed as withdrawn: its item is gone, not its source.
  return { ...backlog, lanes, withdrawn };
}

/** The line a card shows for one draft, in both forms: "Agent recommends: X, because Y (evidence) · agent". */
export const draftLine = a => `Agent recommends: ${a.recommend}, because ${a.why} (${a.evidence.join(', ')}) · ${a.agent}`;

/**
 * plates home --assist <plate>:phase:<n> --recommend <choice> --why <line>
 * --evidence <link>... [--provider <p>] [--yes], in the plate's checkout.
 */
export async function assistCommand({ root, key, recommend, why, evidence, provider, yes = false }, deps = {}) {
  const env = deps.env ?? process.env;
  const m = /^([a-z][a-z0-9-]{0,63}):phase:(\d+)$/.exec(String(key ?? ''));
  if (!m) throw new AttachError('--assist takes a phase\'s backlog key, <plate>:phase:<n> (plates home --backlog --json lists them)');
  const [{ collect }, { plateIdOf, yourPartIn }, { providerOf }] = await Promise.all([import('../practices/phases/files/scripts/roadmap.mjs'), import('./work-items.mjs'), import('./claim.mjs')]);
  const data = await collect(root);
  const here = plateIdOf(data.config.repo ?? data.config.name);
  if (m[1] !== here) throw new AttachError(`${key} is ${m[1]}'s; this checkout is ${here}. Run it in ${m[1]}'s checkout`);
  const id = Number(m[2]), p = data.phases.find(x => x.id === id);
  if (!p) throw new AttachError(`no phase ${id} in ${here}`);
  const file = `docs/phases/${p.file}`;
  const raw = await readFile(join(root, file), 'utf8');
  const yp = yourPartIn(raw);
  const choices = [...new Set((yp?.parts ?? (yp ? [yp] : [])).flatMap(part => part.choices ?? []))];
  const agent = providerOf(env, provider);
  if (!agent) throw new AttachError('which agent? --provider <name> (a key of "agents" in .plates/plates.json), or PLATES_PROVIDER');
  if (data.config?.agents && typeof data.config.agents === 'object' && !Object.hasOwn(data.config.agents, agent)) throw new AttachError(`--provider ${agent} is not one of this plate's agents (${Object.keys(data.config.agents).join(', ')})`);
  const tracked = new Set(((await run(root, ['ls-tree', '-r', '--name-only', 'HEAD'])) ?? '').split('\n').filter(Boolean));
  const links = evidence.map(e => evidenceLink(e, path => tracked.has(path) || [...tracked].some(t => t.startsWith(`${path.replace(/\/$/, '')}/`))));
  const bad = links.find(l => l.why);
  if (bad) throw new AttachError(`--evidence: ${bad.why}`);
  return draftDecision({ root, projectId: here, itemKey: key, file, choices, agent, recommend, why, evidence: links.map(l => l.link), sourceRevision: await headRevision(root, file), config: data.config, yes }, deps);
}

/** The CLI backlog's drafts: this checkout's store, joined onto the plate's cards by the files' blobs at HEAD. */
export async function backlogWithDrafts(root, backlog, projectId) {
  const drafts = (await draftStore((await assistDirs(root)).drafts).all()).filter(d => d.projectId === projectId);
  if (!drafts.length) return backlog; // nothing drafted here: the backlog as both forms read it
  const keys = new Set(drafts.map(d => d.itemKey));
  const files = [...new Set((backlog?.lanes ?? []).flatMap(l => l.items).filter(i => keys.has(i.key) && i.source?.file).map(i => i.source.file))];
  const revs = new Map(await Promise.all(files.map(async f => [f, await headRevision(root, f)])));
  return withDrafts(backlog, drafts, (plate, file) => plate === projectId ? revs.get(file) ?? null : null);
}
