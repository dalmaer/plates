// Phase 194, increment 3b: the installed sessions push job delivers authenticated
// owner lines to the exact Rex blocks in attach receipts. The private index is
// discovery only; every push rereads the journal, cancellations and Rex presence.
// No brief, claim token, device key or owner text is copied into delivery state.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, open, rename, rm, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { attachJournal, briefsOutsideRepositories, hostEnv, rexBin, rexProbe, REX_RECEIPT, runHost } from './attach.mjs';
import { addressedTo, validLine, withCursorLock } from './channel-owner.mjs';
import { readSays } from './channel-say.mjs';
import { stateDir } from './not-now.mjs';

export const replyInstruction = origin => `Reply with PLATES_SITE='${origin.replaceAll("'", "'\\''")}' plates say; this came from the owner via the plates channel.`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const indexDir = env => join(stateDir(env), 'channel-delivery', 'journals');
const lineId = line => hash([line.at, line.text, line.to, line.by]);
const hex = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const time = s => typeof s === 'string' && Number.isFinite(Date.parse(s));

async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Private, atomic replacement; flush before an external effect can follow it. */
async function save(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await open(tmp, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
  try { await rename(tmp, path); } finally { await rm(tmp, { force: true }); }
  const dir = await open(dirname(path), 'r');
  try { await dir.sync(); } finally { await dir.close(); }
}

/** One entry per checkout journal, outside every repository, written before attach dispatch. */
export async function registerDeliveryJournal({ root, dir, env = process.env }) {
  const checkout = await realpath(root);
  await briefsOutsideRepositories(indexDir(env), checkout, env);
  if (!isAbsolute(dir)) throw new Error('delivery journal must be absolute');
  dir = join(await realpath(dirname(dir)), basename(dir));
  await save(join(indexDir(env), hash(dir) + '.json'), { schema: 1, root: checkout, dir });
}

function runOf(entry) {
  const intent = entry?.intent, effect = intent?.effect, receipt = entry?.receipt;
  const target = receipt?.result?.session;
  // Neither a label, a claim alone, nor a recovered unknown dispatch is a target.
  if (intent?.route !== 'local-host' || receipt?.route !== 'local-host' || receipt?.result?.state !== 'dispatched'
    || !REX_RECEIPT.test(target ?? '') || !/^rex:session:[^/]+\/block:[^/]+$/.test(target)
    || !hex(entry.digest) || !time(intent.at)
    || !/^[a-z][a-z0-9-]{0,63}$/.test(effect?.projectId ?? '')
    || !Number.isSafeInteger(effect?.phase) || effect.phase < 0
    || (intent.claim?.session !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(intent.claim.session))
    || effect.host?.prompt !== 'arg') return null;
  return { target, project: effect.projectId, phase: effect.phase, session: intent.claim?.session ?? null,
    since: new Date(Date.parse(intent.at)).toISOString() };
}

async function cancelled(journal, digest, phase, target = null) {
  if (await journal.cancelOf(digest) || await journal.phaseCancelOf(phase)) return true;
  if (target && journal.phaseClears && (await journal.phaseClears(phase)).some(c => c.unreadable || c.runs?.some(r => r.receiptSession === target))) return true;
  // Older attach versions recorded a phase cancel on another digest only.
  return (await journal.list()).some(e => e.cancel && e.intent?.effect?.phase === phase);
}

function validCursor(v) {
  return v?.schema === 1 && time(v.at) && Array.isArray(v.seen) && v.seen.every(hex)
    && (v.readAt === undefined || time(v.readAt)) && (v.ended === undefined || v.ended === true)
    && (v.pending === null || (hex(v.pending?.id) && ['ready', 'sending', 'typed', 'entering'].includes(v.pending.stage)));
}

const cursorPath = (env, origin, dir, entry, run) => join(stateDir(env), 'channel-delivery', 'runs', hash([origin, dir, entry.digest, run.target]) + '.json');

async function deliverRun({ journal, path, root, entry, run, origin, env, readProject, bin, timeoutMs }) {
  await briefsOutsideRepositories(dirname(path), root, env);
  // A live holder is never reclaimed by age. A dead holder leaves its pending
  // stage behind, so a crash at the transport boundary cannot cause a replay.
  return withCursorLock(path, async () => {
    let cursor = await json(path);
    if (cursor !== null && !validCursor(cursor)) throw new Error('delivery cursor unreadable; not delivered');
    if (cursor?.ended) return 0;
    const fresh = await journal.read(entry.digest);
    if (JSON.stringify(runOf({ digest: entry.digest, ...fresh })) !== JSON.stringify(run)) throw new Error('attach receipt changed; not delivered');
    if (await cancelled(journal, entry.digest, run.phase, run.target)) return 0;
    const firstRead = cursor === null;
    cursor ??= { schema: 1, at: run.since, seen: [], pending: null };
    if (firstRead) {
      const presence = await rexProbe({ receipt: run.target, env, timeoutMs });
      if (presence === 'exited' || presence === 'gone') { await save(path, { ...cursor, ended: true }); return 0; }
      if (presence !== 'running') throw new Error('Rex presence unavailable; retry next push');
    }
    if (['sending', 'entering'].includes(cursor.pending?.stage))
      throw new Error('delivery outcome uncertain; inspect the tab and private cursor before retrying');
    const response = await readProject(run.project);
    if (response.state !== 'read') throw new Error('owner lines unavailable; retry next push');
    const lines = response.items.map(validLine);
    if (lines.some(l => !l)) throw new Error('invalid channel line; not delivered');
    const seen = new Set(cursor.seen), ids = new Set();
    const mine = lines.filter(l => l.kind === 'owner' && addressedTo(l, { plate: run.project, session: run.session, phase: run.phase })
      && (l.at > cursor.at || (l.at === cursor.at && !seen.has(lineId(l)))))
      .sort((a, b) => a.at.localeCompare(b.at) || lineId(a).localeCompare(lineId(b)))
      .filter(l => { const id = lineId(l); if (ids.has(id)) return false; ids.add(id); return true; });
    if (cursor.pending && !mine.some(l => lineId(l) === cursor.pending.id)) throw new Error('pending owner line is no longer readable; inspect the tab before retrying');
    // A typed line must finish first even if another line arrived at the same timestamp.
    if (cursor.pending) mine.sort((a, b) => Number(lineId(b) === cursor.pending.id) - Number(lineId(a) === cursor.pending.id));
    const match = REX_RECEIPT.exec(run.target);
    let delivered = 0;
    for (const line of mine) {
      if (await cancelled(journal, entry.digest, run.phase, run.target)) break;
      // Fetching (or delivering the previous line) may have outlived the harness.
      const presence = await rexProbe({ receipt: run.target, env, timeoutMs });
      if (presence === 'exited' || presence === 'gone') await save(path, { ...cursor, ended: true });
      if (presence !== 'running')
        throw new Error('Rex run no longer confirmed live; retry next push');
      const id = lineId(line);
      if (!cursor.pending) { cursor.pending = { id, stage: 'ready' }; await save(path, cursor); }
      const call = async (command, payload, before, after) => {
        cursor.pending.stage = before;
        await save(path, cursor);
        // Errors with an unknown outcome retain the in-flight stage. Never echo
        // Rex stderr, which may contain the text or a host's credential.
        let result;
        try { result = await runHost([bin, command, '-s', match[1], '-b', match[2], ...(command === 'send' ? ['--'] : []), payload],
          { cwd: homedir(), env: hostEnv(env), timeoutMs }); }
        catch { throw new Error(`rex ${command} outcome uncertain; inspect the tab before retrying`); }
        if (!Number.isInteger(result.code)) throw new Error(`rex ${command} outcome uncertain; inspect the tab before retrying`);
        if (result.code !== 0) {
          cursor.pending.stage = after;
          await save(path, cursor);
          throw new Error(`rex ${command} failed (exit ${result.code}); retry next push`);
        }
      };
      if (cursor.pending.stage === 'ready') {
        await call('send', `${line.text}\n\n${replyInstruction(origin)}`, 'sending', 'ready');
        cursor.pending.stage = 'typed';
        await save(path, cursor);
      }
      if (await cancelled(journal, entry.digest, run.phase)) break;
      await call('send-key', 'Enter', 'entering', 'typed');
      const newer = line.at > cursor.at;
      cursor = { schema: 1, at: newer ? line.at : cursor.at,
        seen: newer ? [id] : [...new Set([...cursor.seen, id])], pending: null };
      await save(path, cursor);
      delivered++;
    }
    // This read position includes unaddressed owner lines; it never consumes an
    // unfinished delivery. Keep the millisecond overlap for late equal-time rows.
    if (!cursor.pending) {
      const readAt = lines.filter(l => l.kind === 'owner').reduce((at, l) => l.at > at ? l.at : at, cursor.readAt ?? cursor.at);
      if (firstRead || readAt !== cursor.readAt) await save(path, { ...cursor, readAt });
    }
    return delivered;
  }, { staleMs: Infinity });
}

/** Empty index or no Rex: no network reads, new state, or added push output. */
export async function deliverOwnerLines({ origin, env = process.env, fetcher = fetch, key, timeoutMs = 10_000 }) {
  let names;
  try { names = (await readdir(indexDir(env))).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).sort(); }
  catch (error) { return error.code === 'ENOENT' ? [] : [{ run: 'index', error: 'delivery index unreadable; retry next push' }]; }
  if (!names.length) return [];
  const bin = await rexBin(env);
  if (!bin) return [];
  const out = [], candidates = [], sinceByProject = new Map(), reads = new Map();
  const readProject = project => {
    if (!reads.has(project)) reads.set(project, readSays({ plates: [project],
      since: new Date(Date.parse(sinceByProject.get(project)) - 1).toISOString(),
      env: { ...env, PLATES_SITE: origin }, fetcher, key, requireOwner: true }).then(r => r[project]));
    return reads.get(project);
  };
  for (const name of names) {
    let entries, record, journal;
    try {
      record = await json(join(indexDir(env), name));
      if (record?.schema !== 1 || typeof record.root !== 'string' || !isAbsolute(record.root)
        || typeof record.dir !== 'string' || !isAbsolute(record.dir) || name !== hash(record.dir) + '.json')
        throw new Error('invalid index');
      journal = attachJournal(record.dir);
      entries = await journal.list();
    } catch { out.push({ run: name.slice(0, 12), error: 'attach journal index unreadable; retry next push' }); continue; }
    for (const entry of entries) {
      const run = runOf(entry);
      if (!run || entry.cancel) continue;
      const label = `${run.project}#${run.phase}/${run.session ?? entry.digest.slice(0, 12)}`;
      try {
        const path = cursorPath(env, origin, record.dir, entry, run), cursor = await json(path);
        if (cursor !== null && !validCursor(cursor)) throw new Error('invalid cursor');
        if (cursor?.ended) continue;
        const since = cursor?.readAt ?? cursor?.at ?? run.since, prior = sinceByProject.get(run.project);
        if (!prior || since < prior) sinceByProject.set(run.project, since);
        candidates.push({ journal, ...record, entry, run, path, label });
      } catch { out.push({ run: label, error: 'delivery state unavailable; retry next push' }); }
    }
  }
  for (const candidate of candidates) {
    try {
      const delivered = await deliverRun({ ...candidate, origin, env, readProject, bin, timeoutMs });
      if (delivered) out.push({ run: candidate.label, delivered });
    } catch (error) {
      // Only our fixed diagnostics leave the private state boundary.
      const message = String(error.message);
      out.push({ run: candidate.label, error: /^(?:rex |Rex |owner lines |invalid channel |attach receipt |delivery |pending owner )/.test(message)
        ? message : 'delivery state unavailable; retry next push' });
    }
  }
  return out;
}
