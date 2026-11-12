// plates home --answer <item-key> <answer-id> [--why "<line>"] [--until YYYY-MM-DD] [--yes]
// (plates phase 173): settle one item in "Needs you" from the terminal, through
// the writer its answer names in the model (lib/work-items.mjs answersFor).
// It reads the same home model plates home --json prints, finds the item by its
// key and the answer by its id, and previews by default (exit 3); --yes writes
// (exit 0). An answer this form cannot run, a missing why, an item that is not
// waiting, or a writer's refusal writes nothing (exit 2; a stale-claim refusal
// is exit 1, as plates phase claim's).
//
// Writers, each the existing path (nothing is re-implemented here):
//   walk done        lib/work-items.mjs walkDone, in the plate's checkout (leaves a diff)
//   walk decide      walkDecide (a decline needs a why), in the plate's checkout
//   learn decide     lib/learn.mjs decide, with its own preview and --yes
//   loose-ends mark  lib/looseends.mjs mark, drop with the owner's why
//   lessons send     lib/lessons.mjs lessons (--dry-run, then --yes)
//   claim release    lib/claim.mjs releaseStale, recorded in the phase's Trajectory
//   agent issue      lib/robot-issue.mjs ensureRobotIssue: its preview, then --yes
//   not now          lib/not-now.mjs putOff, outside every project
//   pr merge         lib/pr-ready.mjs cliMerge: gh pr merge --match-head-commit, at the card's head (phase 176)
//   pr comment       lib/pr-ready.mjs cliRequestChanges: the why as a comment review on the PR
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { home, platesOf, HomeError } from './home.mjs';
import { WRITERS, viewerLogin, walkDone, walkDecide, recordTrajectory, notNowRecord, proposalOf, estimateOf } from './work-items.mjs';
import { parseTimeProposal } from '../practices/night/files/scripts/plates/time-proposals.mjs';
import { parseHygieneProposal } from '../practices/night/files/scripts/plates/hygiene-proposals.mjs';

const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { const t = oneLine(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const PREVIEW = 3;

/** Every item a home model holds, in Needs you and put off, with the list it is in. */
export function itemsOf(model) {
  const out = [];
  for (const list of ['decisions', 'walks', 'reviews']) for (const item of model[list] ?? []) if (item.key) out.push({ list, item });
  for (const row of model.sections ?? []) for (const item of row.items ?? []) if (item.key) out.push({ list: 'sections', section: row.id, item });
  for (const p of model.putOff?.items ?? []) out.push({ list: p.list, item: p.item, putOff: { until: p.until, reason: p.reason ?? null } });
  return out;
}

/** The owner's name for a record: their GitHub login, else git's identity here (user.name, or GIT_COMMITTER_NAME), else "the owner". */
async function ownerName(root, env, me) {
  if (me) return me;
  const login = await viewerLogin(env).catch(() => null);
  if (login) return login;
  const name = await new Promise(done => execFile('git', ['-C', root, 'var', 'GIT_COMMITTER_IDENT'], { env, encoding: 'utf8' }, (e, out) => done(e ? null : /^(.*?) </.exec(out)?.[1]?.trim() || null)));
  return name ?? 'the owner';
}

/** The issue an agent gets for an item: the robot rubric (practices/climb/files/scripts/plates/robot-rubric.mjs), from what the item says and the owner's why. */
export function agentIssueFor(item, key, answer, why, repo) {
  const adding = answer.id === 'add';
  const title = clip(adding ? `Add ${item.title.replace(/^[^:]+: /, '')} to plates.json` : `Owner's answer: ${item.title}`, 120);
  const rubric = {
    version: 1,
    problem: clip(`${item.title}.${item.why ? ` ${item.why}` : ''}`, 3900),
    reproduction: clip(`plates home --json lists ${key} waiting on the owner${item.link ? ` (${item.link})` : ''}${item.read ? `; read it with: ${item.read}` : ''}.`, 3900),
    acceptance: clip(adding ? `${item.title.replace(/^[^:]+: /, '')} is a managed plate in plates.json, and plates home no longer lists ${key}.` : `What the owner asked is done${why ? ` (${why})` : ''}, and plates home no longer lists ${key} as waiting on the owner.`, 3900),
    change: clip(why || (adding ? `Add ${item.title.replace(/^[^:]+: /, '')} to plates.json as a managed plate.` : `Settle: ${item.title}`), 3900),
    prerequisites: [],
    ownerBlockers: [],
  };
  return { title, rubric, repo };
}

/**
 * plates home --answer. deps: env, now, me, cliRoot, home (the model reader),
 * and each writer's own deps (tests inject gh and remotes through env).
 */
export async function homeAnswer({ root, key, answerId, why, until, yes = false }, deps = {}) {
  const env = deps.env ?? process.env, now = deps.now ?? Date.now;
  const today = new Date(now()).toISOString().slice(0, 10);
  if (typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,63}:[a-z]+:\S/.test(key)) throw new HomeError('plates home --answer <item-key> <answer-id>: the key is the item\'s, as plates home --json gives it (plate:kind:id)');
  if (typeof answerId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(answerId)) throw new HomeError('plates home --answer <item-key> <answer-id>: the answer id is one of the item\'s answers');
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  const plates = await platesOf(root, config);
  const plateId = key.split(':')[0], plate = plates.find(p => p.project.id === plateId);
  // Only the item's plate is read (sections are read whole: they are local).
  const model = await (deps.home ?? home)({ root, projectId: plate ? plateId : plates[0].project.id }, deps);
  const found = itemsOf(model).find(x => x.item.key === key);
  if (!found) throw new HomeError(`no item ${key} waits on you in plates home now (it may be settled, or its source unread): plates home --json lists the keys`);
  const { item } = found;
  const answer = item.answers.find(a => a.id === answerId);
  if (!answer) throw new HomeError(`${key} has no answer "${answerId}": ${item.answers.map(a => a.id).join(', ')}`);
  if (answer.unavailable) throw new HomeError(`${answer.label} is not written from here: ${answer.unavailable.reason} (${answer.unavailable.command})`);
  const line = oneLine(why);
  if (/[\x00-\x1f]/.test(String(why ?? '').replace(/[\t\n\r]/g, ' '))) throw new HomeError('--why is one line of text');
  if (answer.needsWhy !== 'never' && !line) throw new HomeError(`${answer.label} needs a why: --why "<line>"${answer.needsWhy === 'decline' ? ' (a decline says why, for whoever reads it next)' : ''}. Nothing written`);
  if (until !== undefined && answer.writer !== 'not now') throw new HomeError('--until goes with a Not now answer');
  const dir = item.dir ?? plate?.dir ?? root;
  const out = (state, text, more = {}, exitCode = state === 'preview' ? PREVIEW : 0) => ({ data: { ok: !['refused'].includes(state), key, answer: answer.id, writer: answer.writer, command: WRITERS[answer.writer], state, item: { title: item.title, list: found.list }, ...more }, text, exitCode });
  const pass = (r, state) => ({ ...r, data: { ok: r.exitCode === undefined || r.exitCode === 0 || r.exitCode === PREVIEW, key, answer: answer.id, writer: answer.writer, state: state ?? (r.exitCode === PREVIEW ? 'preview' : r.exitCode ? 'refused' : 'written'), result: r.data }, exitCode: r.exitCode ?? 0 });

  // Each written answer leaves a backlog event (phase 184) in the item's checkout: metadata only (the answer's id, a
  // Not now's reason as a code), best effort, so a failed event write is a note on the result and never undoes the answer.
  const settled = await (async () => { switch (answer.writer) {
    case 'not now': {
      const record = notNowRecord({ until, reason: line, today });
      const { putOff, notNowFile } = await import('./not-now.mjs');
      if (!yes) return out('preview', `Would put off ${item.title} until ${record.until}${record.reason ? ` (${record.reason})` : ''}, in ${notNowFile(env)}; it returns to Needs you on that date. --yes puts it off.`, { until: record.until });
      const written = await putOff(env, key, { until: record.until, reason: record.reason, today, now: now() });
      return out('written', `Put off until ${written.until}: ${item.title}. It returns to Needs you on that date (${written.file}).`, { until: written.until, file: written.file });
    }
    case 'walk done': {
      if (!plate?.dir) throw new HomeError(`${plateId} has no checkout here to write its walk in`);
      const choice = answer.id.startsWith('choice-') ? answer.label : undefined;
      const args = { root: plate.dir, phase: item.phase, box: item.box ?? undefined, choice, note: line || undefined, today };
      return pass(yes ? await walkDone(args) : { ...(await walkDone({ ...args, dryRun: true })), exitCode: PREVIEW });
    }
    case 'walk decide': {
      if (!plate?.dir && !item.dir) throw new HomeError(`${plateId} has no checkout here to record the decision in`);
      const path = item.decisionTarget?.path ?? item.read;
      const text = await readFile(join(dir, path), 'utf8').catch(() => { throw new HomeError(`${path} could not be read in ${dir}`); });
      const structured = parseTimeProposal(text).proposal ?? parseHygieneProposal(text).proposal;
      const instance = item.instanceId ?? structured?.instanceId;
      const accept = answer.id === 'accept';
      if (!yes) {
        const p = structured ? null : proposalOf(text);
        if (!structured && (!p || p.decided)) throw new HomeError(`${path}'s proposal is missing or already decided. Nothing written`);
        return out('preview', `Would record ${path}'s proposal as ${accept ? 'accepted' : 'declined'}${line ? ` — ${line}` : ''}${structured ? `, through its policy-bound writer (walk decide --instance ${instance})` : ''}. --yes decides it.`, { proposal: path });
      }
      return pass(await walkDecide({ root: dir, proposal: path, instance: structured ? instance : undefined, ...(accept ? { accept: line } : { decline: line }), today }));
    }
    case 'learn decide': {
      const r = await (await import('./learn.mjs')).decide({ dir: root, slug: item.ref, decision: answer.id === 'accept' ? 'accepted' : 'declined', note: line || undefined, yes }, { env });
      return pass(r);
    }
    case 'loose-ends mark': {
      const { scan, mark } = await import('./looseends.mjs');
      // A roadmap step is a loose end of its plate too (fingerprint phase:<n>, a partial phase whose next action is the owner's);
      // home stops listing it once the mark is on the default branch.
      let id = /^[0-9a-f]{6}$/.test(item.id ?? '') ? item.id : null;
      if (!id) {
        const projects = await scan({ home: root, env, now: now() });
        id = projects.filter(p => p.dir && resolve(p.dir) === resolve(plate?.dir ?? root)).flatMap(p => p.items).find(it => it.fingerprint === `phase:${item.phase}`)?.id ?? null;
        if (!id) throw new HomeError(`phase ${item.phase} is not a loose end of ${plateId} (plates loose-ends lists a partial phase whose next action is yours), so Done has nothing to mark. Hand it to an agent, or put it off. Nothing written`);
      }
      if (!yes) return out('preview', `Would mark loose end ${id} (${item.title}) drop in its checkout's .plates/loose-ends.json: ${line}. --yes marks it; commit the file so other machines see it.`, { id });
      return pass(await mark({ home: root, id, move: 'drop', reason: line, env, now: now() }));
    }
    case 'lessons send': {
      const { lessons } = await import('./lessons.mjs');
      if (!deps.cliRoot) throw new HomeError('sending lessons needs the plates CLI root');
      return pass(await lessons({ dir, dryRun: !yes, yes }, { cliRoot: deps.cliRoot, env }), yes ? undefined : 'preview');
    }
    case 'claim release': {
      const { releaseStale } = await import('./claim.mjs');
      const who = await ownerName(root, env, deps.me);
      let recorded = null;
      const record = async ({ branch, holder }) => {
        const r = await recordTrajectory({ root, phase: item.phase, today,
          line: `- **${today}** — The owner (${who}) released the stale claim ${branch} (${holder.provider} on ${holder.machine}, no push for ${holder.idle} days) from plates home: ${line.replace(/\.$/, '')}.` });
        recorded = r;
        return r.undo;
      };
      const r = await releaseStale({ root, phase: item.phase, yes, record }, { env, now: now() });
      return { ...pass(r, r.data.state), data: { ...pass(r, r.data.state).data, by: who, why: line, ...(recorded ? { recorded: recorded.path, diff: recorded.diff } : {}) },
        text: `${r.text}${recorded ? `\nRecorded in ${recorded.path} (who: ${who}; why: ${line}), left as a diff: commit it when the gate passes.\n\n${recorded.diff}` : ''}` };
    }
    case 'agent issue': {
      const m = await import('./robot-issue.mjs');
      const repo = item.repo ?? model.projects.find(p => p.id === plateId)?.repo ?? config.repo;
      const issue = agentIssueFor(item, key, answer, line, repo);
      const policy = await m.robotTargetPolicy({ root: plate?.dir ?? root, repo });
      const { subjectKey, instanceId } = m.manualRobotIssueIdentity(repo, issue.title, issue.rubric);
      const r = m.robotIssueOutput(await m.ensureRobotIssue({ root, repo, title: issue.title, rubric: issue.rubric, policy, subjectKey, instanceId,
        yes, stateDir: join(root, '.plates', 'robot-issues'), ...(deps.github ? { github: deps.github } : {}) }));
      return pass(r);
    }
    case 'pr merge':
    case 'pr comment': {
      const repo = model.projects.find(p => p.id === plateId)?.repo ?? config.repo;
      const pr = item.merge;
      if (!pr || !Number.isSafeInteger(pr.number) || !repo) throw new HomeError(`${key} names no pull request to ${answer.writer === 'pr merge' ? 'merge' : 'answer'}. Nothing written`);
      const m = await import('./pr-ready.mjs');
      const r = answer.writer === 'pr merge'
        ? await m.cliMerge({ repo, number: pr.number, head: pr.head, title: item.title.replace(/^[^:]+: /, ''), yes }, { env })
        : await m.cliRequestChanges({ repo, number: pr.number, head: pr.head, why: line, yes }, { env });
      return out(r.state, r.text, { pr: { repo, number: pr.number, head: pr.head }, ...(r.method ? { method: r.method } : {}), ...(r.url ? { url: r.url } : {}) }, r.state === 'preview' ? PREVIEW : r.state === 'refused' ? 1 : 0);
    }
    default:
      throw new HomeError(`${answer.writer} is not a writer plates home runs`);
  } })();
  if (!yes || settled.exitCode !== 0 || ['preview', 'refused'].includes(settled.data?.state)) return settled;
  const { recordBacklogEvent, notNowReason } = await import('./backlog-events.mjs');
  const action = answer.writer === 'not now' ? 'not-now' : answer.writer === 'claim release' ? 'release' : 'answer';
  const { note } = await (deps.events ?? recordBacklogEvent)(plate?.dir ?? root, { actor: 'owner', key, action, ...(action === 'not-now' ? { reason: notNowReason(line) } : {}),
    takes: estimateOf(item).minutes, outcome: answer.id }, { env, now: now() });
  return note ? { ...settled, data: { ...settled.data, eventNote: note } } : settled;
}
