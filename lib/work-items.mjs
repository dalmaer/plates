import { namesEvidenceContext, namesObservation, namesGap, namesFragment, namesPlanProjection } from '../practices/night/files/scripts/plates/verification.mjs';
import { environmentValue } from './names.mjs';
import { planningConfig } from '../practices/night/files/scripts/plates/planning-config.mjs';
import { milestonePlan, milestoneSummary, requireLocalPhases } from '../practices/night/files/scripts/plates/milestones.mjs';
// The owner's open work, as one item model (plates phase 156; it began as
// plates board, phase 51: docs/research/2026-10-08-whose-turn-board.md). The
// web home (lib/web/projects.mjs), goodnight, the morning brief and the CLI
// read it from here; each renders it its own way.
//
//   workItems({ root })        every open item, each { waits, title, why, read,
//                            link, source, kind, actions }, and each source's
//                            state; phases (every phase's drill-down, by number)
//                            and roadmap (built/total per goal, the headline)
//   plates walk done <phase> --note "<what you saw>" [--box <n>]
//   plates walk done <phase> --choice "<one of its Your part's Choices>" [--note "…"] [--box <n>]
//   plates walk decide --proposal <health page> --accept ["<why>"] | --decline "<why>"
//
// The model derives nothing its sources do not already say. Sources:
//   roadmap      the phase files (roadmap.mjs): a walk owed → owner, time or
//                external by its `waits:`, and never the owner's while its
//                ## Your part says "Ready when" (then time, or external,
//                with that reason); buildable phases in nextPhase's
//                order → agent; a phase dated `after:` a day to come → time
//   loose-ends   plates loose-ends (every fleet checkout): a step marked
//                "⚑ yours", a question a session asked, a phase's ⚑ next
//                action → owner; the rest by kind (files, branches, PRs:
//                agent). Its review, and home's health and inbox items, come
//                from the sources below instead, so nothing is listed twice
//   reviews      unanswered review comments on open PRs, home and each managed
//                fleet repo (the night's repo-wide read; at most REVIEW_REPOS)
//                → broken
// GitHub reads (reviews, loose-ends', the fleet) are kept 10 minutes in plates's
// cache (lib/quota.mjs): the page's 60 s refresh asks GitHub nothing inside
// that; its Refresh button and --fresh read again. Reviews are an optional
// read: under the quota floor they are n/a, "saving your GitHub quota (N left
// until HH:MM)". `github` says what the reads cost and what is left.
//   health       the newest health page's proposal, undecided → owner
//   inbox        lessons proposed and waiting for a person → owner, settled
//                by plates learn decide (not re-implemented here)
//   decisions    a decision whose checkBy has passed with no outcome → owner,
//                kind check, with the evidence that arrived since; a record
//                breaking the check rule → broken (lib/decision-loop.mjs,
//                plates phase 150); listed only when a record carries a check
//   fleet        plates fleet (home only): the strip, red CI → broken, and a
//                draft keel/update- PR (an update whose check failed) → broken
//   claims       a phase claim (claims/phase-<n>, lib/claim.mjs) with no push
//                for seven days → owner; listed only where there is a remote
//   verify       production's latest verify (the delivery practice's
//                scripts/plates/verify.mjs, recorded on keel-verify), failed →
//                owner; listed only with delivery on (plates phase 81)
// A source that cannot be read is listed in `sources` as n/a with why, never
// left out. gh is PLATES_GH or gh, as everywhere; tests inject the sources.
//
// Writes: walk done and walk decide only, each to the working tree, printing
// the diff. Committing stays the conductor's (the gate runs first).
import { readFile, readdir, writeFile, mkdir, unlink, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {
  collect, parsePhase, sectionsOf, boxes, isWalk, owesWalk, waitsOf, dated, satisfies, DONE, localToday, run as roadmap,
  yourPartOf, yourPartReady, thenFor,
} from '../practices/phases/files/scripts/roadmap.mjs';
import { healthDirOf, reviewConfigOf, rateSpend, REVIEW_ROUNDS, reviewRoundLimit, judgeRounds } from '../practices/night/files/scripts/plates/lib.mjs';
import { githubRead, readRepoReviewState, quotaGuard, quotaShown } from './quota.mjs';
import { proposals } from './learn.mjs';
import { parseTimeProposal, readTimeProposals } from '../practices/night/files/scripts/plates/time-proposals.mjs';
import { decideTimeProposal } from './time-proposal-actions.mjs';
import { parseHygieneProposal, readHygieneProposals } from '../practices/night/files/scripts/plates/hygiene-proposals.mjs';
import { decideHygieneProposal, safeHygienePath, safeHygienePage } from './hygiene-proposal-actions.mjs';

export const COLUMNS = Object.freeze([
  { waits: 'owner', title: 'Yours' },
  { waits: 'broken', title: 'Broken' },
  { waits: 'agent', title: "The agent's" },
  { waits: 'time', title: 'Waiting on time' },
  { waits: 'external', title: 'Waiting on something outside' },
]);
export const WAITS = COLUMNS.map(c => c.waits);
/**
 * Every kind of item, defined once, with the source that raises it. Items are
 * plain objects carrying `kind`; a renderer looks a kind up here and never
 * decides one itself (phase 173 attaches each kind's answers in this table).
 * tests/work-items.test.mjs fails on an item whose kind is not listed.
 */
export const KINDS = Object.freeze(Object.fromEntries(Object.entries({
  walk: { label: 'Walk', sources: ['roadmap', 'milestones'] },
  step: { label: 'Step', sources: ['roadmap'] },
  phase: { label: 'Phase', sources: ['roadmap', 'milestones', 'loose-ends'] },
  dated: { label: 'Dated phase', sources: ['roadmap'] },
  review: { label: 'Review', sources: ['reviews'] },
  proposal: { label: 'Health proposal', sources: ['health'] },
  lesson: { label: 'Lesson', sources: ['inbox'] },
  check: { label: 'Decision check', sources: ['decisions'] },
  claim: { label: 'Stale claim', sources: ['claims'] },
  ci: { label: 'Red CI', sources: ['fleet'] },
  update: { label: 'Failing update', sources: ['fleet'] },
  robot: { label: 'Robot', sources: ['robot'] },
  verify: { label: 'Production verify', sources: ['verify'] },
  files: { label: 'Uncommitted files', sources: ['loose-ends'] },
  branch: { label: 'Branch', sources: ['loose-ends'] },
  worktree: { label: 'Worktree', sources: ['loose-ends'] },
  pr: { label: 'Pull request', sources: ['loose-ends'] },
  session: { label: 'Session', sources: ['loose-ends'] },
  repo: { label: 'Repo', sources: ['loose-ends'] },
  lessons: { label: 'Lessons', sources: ['loose-ends'] },
  health: { label: 'Health page', sources: ['loose-ends'] },
  inbox: { label: 'Inbox', sources: ['loose-ends'] },
  gap: { label: 'Unread source', sources: ['loose-ends'] },
}).map(([kind, value]) => [kind, Object.freeze({ kind, ...value, sources: Object.freeze(value.sources) })])));
/** An item's kind, from KINDS; undefined for a kind nobody defined (a test fails on it). */
/** The morning brief's checks due (phase 150), from the decision records: the model's check items, as the brief reads them. */
export { briefChecks } from './decision-loop.mjs';
export const kindOf = item => Object.hasOwn(KINDS, item?.kind ?? '') ? KINDS[item.kind] : undefined;
/** The verbs an action may run: the board writes nothing its own way. */
export const ACTION_VERBS = Object.freeze(['walk done', 'walk decide', 'learn decide']);
export const REVIEW_REPOS = 12;
const GH_TIMEOUT = 15_000;
export const DIFF_NOTE = 'left as a diff: commit it when the gate passes';

export class WorkItemError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

const exec = (cmd, args, { env, timeout = GH_TIMEOUT, cwd } = {}) => new Promise(done => {
  execFile(cmd, args, { env, cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    done(error ? { ok: false, why: String(stderr || error.message).trim().split('\n').filter(Boolean).pop() ?? 'failed', stdout: stdout ?? '' } : { ok: true, stdout });
  });
});
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 160) => { const t = oneLine(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const blob = (config, path) => /^[\w.-]+\/[\w.-]+$/.test(config?.repo ?? '') ? `https://github.com/${config.repo}/blob/main/${path}` : null;

// ---- the sources ---------------------------------------------------------------

const OWNER_STEP = /^\s*(⚑|owner\b)/i;

/** The open walk boxes of a phase file's Acceptance: [{ n (1-based among all boxes), text, walk }]. */
export function openBoxes(raw) {
  const block = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  return boxes(sectionsOf(block?.[1] ?? '').Acceptance ?? '').map((b, i) => ({ n: i + 1, ...b, walk: isWalk(b.text) })).filter(b => !b.checked);
}

/** The last n Trajectory entries of a phase body, each one line, oldest first. */
export function trajectoryTail(trajectory = '', n = 4) {
  const out = [];
  for (const line of String(trajectory).split(/\r?\n/)) {
    if (/^- /.test(line)) out.push(line.slice(2).trim());
    else if (out.length && /^\s+\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out.slice(-n);
}

/** A phase file's ## Your part, parsed (roadmap.mjs's yourPartOf), or null. */
export function yourPartIn(raw) {
  const block = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(raw ?? '');
  return yourPartOf(sectionsOf(block?.[1] ?? '')['Your part']);
}

/**
 * Which Your part answers which walk box: a part whose `### ` heading names
 * "box <n>" answers that box; otherwise parts answer the phase's walk boxes
 * (checked or not) in order. [{ part, n }] with n null when no box matches.
 */
export function partsByBox(yp, raw) {
  if (!yp) return [];
  const parts = yp.parts ?? [yp];
  const block = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(raw ?? '');
  const walkBoxes = boxes(sectionsOf(block?.[1] ?? '').Acceptance ?? '').map((b, i) => ({ n: i + 1, walk: isWalk(b.text) })).filter(b => b.walk).map(b => b.n);
  return parts.map((part, i) => ({ part, n: Number(/\bbox (\d+)\b/i.exec(part.heading ?? '')?.[1] ?? walkBoxes[i] ?? NaN) || null }));
}

const bareOf = ({ actions, ...part }) => part;

/** Relative Markdown links in a phase file's text, pointed at the repo on GitHub (or left as text when there is none). */
const linksFrom = (text, config, base = 'docs/phases/') => text == null ? text : String(text).replace(/\]\(([^)\s]+)\)/g, (m, href) => {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return m;
  const parts = [];
  for (const seg of `${base}${href}`.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
  const url = blob(config, parts.join('/'));
  return url ? `](${url})` : m;
});

/**
 * One phase as the board's drill-down reads it: { id, title, file, link, goal,
 * status, since, owes, waits, after, done, next, boxes: [{ n, text, checked,
 * walk }], trajectory (the last few entries), evidence: [{ path, link }] }.
 * raw is the phase file; without it (unreadable) boxes and trajectory are empty.
 */
export function phaseDetail(p, raw, config) {
  const path = `docs/phases/${p.file}`;
  const block = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(raw ?? '');
  const sections = sectionsOf(block?.[1] ?? '');
  return {
    id: p.id, title: p.title, file: path, link: blob(config, path), goal: p.goal, status: p.status, since: p.since ?? null,
    owes: p.owes ?? null, waits: p.owes === 'walk' ? waitsOf(p) : null, after: p.after ?? null,
    done: p.done ?? null, next: p.next ?? null,
    boxes: boxes(sections.Acceptance ?? '').map((b, i) => ({ n: i + 1, text: b.text, checked: b.checked, walk: isWalk(b.text) })),
    trajectory: trajectoryTail(sections.Trajectory),
    evidence: (p.evidence ?? []).map(e => ({ path: `docs/${e}`, link: blob(config, `docs/${e}`) })),
  };
}

/** Per live goal, built of total and walks owed; and the headline the roadmap prints. */
export function progressOf({ phases, goals }) {
  const live = goals.filter(g => !g.retired);
  const liveIds = new Set(live.map(g => g.id));
  const built = phases.filter(p => DONE.includes(p.status)).length;
  const owed = phases.filter(p => owesWalk(p) && liveIds.has(p.goal)).length;
  return {
    built, total: phases.length, owed,
    headline: `${built} of ${phases.length} built${owed ? `; ${owed} owe${owed === 1 ? 's' : ''} a walk` : ''}`,
    goals: live.map(g => {
      const group = phases.filter(p => p.goal === g.id);
      return { id: g.id, title: g.title, built: group.filter(p => DONE.includes(p.status)).length, total: group.length, owed: group.filter(owesWalk).length };
    }),
  };
}

/** Milestone issue state is planning data; no local mutation actions. */
function milestoneItems(data) {
  const phases = Object.fromEntries(data.phases.map(p => [p.id, { ...p, file: null, trajectory: [] }]));
  const items = data.phases.filter(p => p.status !== 'closed').flatMap(p => {
    const base = { title: `milestone ${p.id}: ${p.title}`, source: 'milestones', phase: p.id, read: p.url, link: p.url, next: p.next, actions: [] };
    const walks = p.boxes.filter(b => b.walk);
    const unknown = p.ownershipComplete === false;
    return [...(unknown ? [{ ...base, waits: 'broken', kind: 'phase', why: 'Ownership unavailable: issue or label pagination may hide owner work.' }]
      : !walks.length || p.boxes.some(b => !b.checked && !b.walk) ? [{ ...base, waits: 'agent', kind: 'phase', why: p.next }] : []),
      ...walks.map(b => ({ ...base, title: b.text, waits: 'owner', kind: 'walk', link: b.url, read: b.url, why: 'Open GitHub issue labelled for the owner; source state only.' }))];
  });
  return { items, config: data.config, phases, coverage: data.coverage, github: data.github,
    failed: data.coverage.gaps, why: data.coverage.complete ? 'GitHub milestones (read-only)' : data.coverage.gaps.join('; '),
    progress: { source: 'milestones', closed: data.phases.filter(p => p.status === 'closed').length, built: 0, total: data.phases.length, owed: 0, headline: milestoneSummary(data), goals: [] } };
}

/** The roadmap's items: walks owed, buildable phases, dated ones; and every phase's detail, and progress per goal. */
export async function roadmapItems(root, { today = localToday(), read, readPhase = file => readFile(join(root, 'docs', 'phases', file), 'utf8'), ...options } = {}) {
  const data = read ? await read(root) : await milestonePlan(root, options) ?? await collect(root);
  if (data.source === 'milestones') return milestoneItems(data);
  const retired = new Set(data.goals.filter(g => g.retired).map(g => g.id));
  const byId = new Map(data.phases.map(p => [p.id, p]));
  const raws = new Map(await Promise.all(data.phases.map(async p => [p.id, await readPhase(p.file).catch(() => null)])));
  const phases = Object.fromEntries(data.phases.map(p => [p.id, phaseDetail(p, raws.get(p.id), data.config)]));
  const items = [];
  for (const p of data.phases) {
    if (retired.has(p.goal) || DONE.includes(p.status) || p.status === 'superseded') continue;
    const path = `docs/phases/${p.file}`;
    const base = { title: `phase ${p.id}: ${p.title}`, read: path, link: blob(data.config, path), source: 'roadmap', phase: p.id };
    if (owesWalk(p)) {
      const raw = raws.get(p.id) ?? await readPhase(p.file);
      const walks = openBoxes(raw).filter(b => b.walk);
      const several = walks.length > 1;
      const yp = yourPartIn(raw);
      const plainWhy = `walk owed${p.waits && p.waits !== 'owner' ? ` (waits on ${p.waits})` : ''}: ${walks.map(b => clip(b.text, 200)).join(' · ')}`;
      const doneActions = b => [
        { label: several ? `Box ${b.n}: done — looks good` : 'Done — looks good', verb: 'walk done', args: [String(p.id), ...(several ? ['--box', String(b.n)] : []), '--note', 'Looks good.'] },
        { label: several ? `Box ${b.n}: done, with a note` : 'Done, with a note', verb: 'walk done', args: [String(p.id), ...(several ? ['--box', String(b.n)] : [])], note: 'required' },
      ];
      if (!yp) {
        items.push({ ...base, waits: waitsOf(p), kind: 'walk', why: plainWhy, next: p.next, yourPart: null, actions: walks.flatMap(doneActions) });
        continue;
      }
      // Not ready ("Ready when"): never the owner's, whatever waits: says; it waits on time (or on the thing outside), with that reason.
      if (!yourPartReady(yp)) {
        const when = (yp.parts ?? [yp]).map(x => x.ready?.when).filter(Boolean).join('; ');
        items.push({ ...base, waits: p.waits === 'external' ? 'external' : 'time', kind: 'walk', why: `Ready when: ${when}`, next: p.next, yourPart: yp, ready: false, actions: [] });
        continue;
      }
      const open = new Set(walks.map(b => b.n));
      const parts = partsByBox(yp, raw).filter(x => x.n === null || open.has(x.n));
      if (!parts.length) { items.push({ ...base, waits: waitsOf(p), kind: 'walk', why: plainWhy, next: p.next, yourPart: null, actions: walks.flatMap(doneActions) }); continue; }
      const shown = parts.map(({ part, n }) => {
        const box = several && n ? ['--box', String(n)] : [];
        const answer = { ...part, ask: linksFrom(part.ask, data.config), why: linksFrom(part.why, data.config), look: linksFrom(part.look, data.config), then: linksFrom(part.then, data.config), box: n };
        // One action per choice; the note is optional and goes with the choice. With no Choices, the plain done buttons.
        answer.actions = part.choices.length
          ? part.choices.map(c => ({ label: c, verb: 'walk done', args: [String(p.id), ...box, '--choice', c], note: 'optional', choice: c, then: thenFor(answer.then, part.choices, c), ...(part.keepsOpen.includes(c) ? { keepsOpen: true } : {}) }))
          : walks.filter(b => b.n === n || (!several && n === null)).flatMap(doneActions);
        return answer;
      });
      items.push({ ...base, waits: waitsOf(p), kind: 'walk', why: shown[0]?.why ?? plainWhy, ask: shown[0]?.ask ?? null, next: p.next, ready: true,
        yourPart: shown.length === 1 ? bareOf(shown[0]) : { ...bareOf(shown[0]), parts: shown.map(bareOf) },
        actions: shown.flatMap(x => x.actions.map(a => ({ ...a, part: shown.indexOf(x) }))) });
      continue;
    }
    if (dated(p, today)) {
      items.push({ ...base, waits: 'time', kind: 'dated', why: `not buildable before ${p.after}`, after: p.after, next: p.next, actions: [] });
      continue;
    }
    if (p.depends.every(id => satisfies(byId.get(id)))) {
      // A buildable phase whose next action is the owner's (⚑, or "Owner …") is the owner's turn, as loose-ends reads it.
      const owners = OWNER_STEP.test(p.next ?? '');
      items.push({ ...base, waits: owners ? 'owner' : 'agent', kind: owners ? 'step' : 'phase', why: `${p.status}: ${clip(p.next, 200)}`, next: p.next, actions: [] });
    }
  }
  return { items, config: data.config, phases, progress: progressOf(data) };
}

/** loose-ends' items, mapped: "⚑ yours" and questions to the owner; reviews and home's health and inbox are other sources'. */
export function looseItems(data, { home } = {}) {
  const items = [];
  for (const r of data?.projects ?? []) {
    // Uncommitted files are one item per project, not one each.
    const files = (r.items ?? []).filter(it => it.kind === 'file' && it.state !== 'hidden');
    if (files.length) {
      items.push({ waits: 'agent', kind: 'files', title: `${r.repo}: ${files.length} uncommitted file${files.length === 1 ? '' : 's'}`,
        why: `${files.slice(0, 6).map(f => f.title).join(', ')}${files.length > 6 ? ', …' : ''} → commit them, or put them back`, read: `git -C ${r.dir} status`, link: null,
        source: 'loose-ends', commands: [`git -C ${r.dir} status`], actions: [] });
    }
    for (const it of r.items ?? []) {
      if (it.kind === 'file') continue;
      if (it.state === 'hidden' || it.kind === 'review') continue;
      const isHome = r.dir && home && resolve(r.dir) === resolve(home);
      if (isHome && ['health', 'inbox'].includes(it.kind)) continue;
      if (isHome && it.kind === 'phase') continue; // the roadmap source reads home's phases
      const yours = /⚑ yours/.test(it.move ?? '') || ['phase', 'health', 'inbox', 'lessons', 'repo'].includes(it.kind) || (it.kind === 'session' && it.ending === 'question');
      items.push({ waits: it.kind === 'gap' ? 'broken' : yours ? 'owner' : 'agent', kind: it.kind, title: `${r.repo}: ${it.kind === 'session' ? `"${it.title}"` : it.title}`,
        why: [it.detail, it.move && `→ ${it.move}`].filter(Boolean).join(' '), read: it.commands?.[0] ?? null, link: it.url ?? null,
        source: 'loose-ends', id: it.id, commands: it.commands ?? [], actions: [] });
    }
  }
  return items;
}

/**
 * Whether a PR's review comments are the owner's to answer: they opened it,
 * or a bot or agent did (Claude, Codex, Renovate), or its author is unknown.
 * Anyone else's PR is theirs; the board shows it as waiting outside.
 */
export const ours = (author, me) => !author || !me || author === me || /\[bot\]$/.test(author) || author.startsWith('app/');

/** The owner's GitHub login (REST, not the GraphQL allowance), or null. */
export async function viewerLogin(env = process.env) {
  const r = await exec((environmentValue('variable:KEEL_GH', env) ?? 'gh'), ['api', 'user', '-q', '.login'], { env });
  return r.ok ? r.stdout.trim() || null : null;
}

/**
 * Unanswered review comments on open PRs, one item per PR: the night's
 * repo-wide read, per repo, through the cache (10 minutes; `fresh` reads
 * again) and the quota floor (an optional read: under it, nothing is asked).
 * `read` replaces the live read, cache and floor with it (tests inject the
 * PRs). { items, failed, skipped, saving, oldest }.
 *
 * A PR at its review-round limit (phase 71: `rounds` of the read, against the
 * repo's "review".rounds, 3 unset) is the owner's item in place of that: the
 * fix-and-push loop has stopped, and merge, split or close is theirs. A repo
 * whose limit could not be read (`rounds: null`, `roundsGap` saying why;
 * plates#118) is held to none: its PRs are listed by their unanswered comments
 * as before, and `gaps` names it. Never assumed to be three.
 */
export async function reviewItems(repos, { env = process.env, today = localToday(), me = null, read, fresh = false, spend = rateSpend(), guard = () => quotaGuard(env, spend) } = {}) {
  const items = [], failed = [];
  let saving = null, oldest = null;
  const list = repos.slice(0, REVIEW_REPOS);
  const gaps = list.filter(x => x.rounds === null).map(x => `${x.repo}: ${clip(x.roundsGap ?? 'its review config was not read', 120)}`);
  const readRepo = read ? async x => ({ value: await read(x) })
    : x => githubRead(env, `review-state-${x.repo}-${(x.reviewers ?? []).join('+')}-${today}`, () => readRepoReviewState(x, { env, today, spend }), { fresh, guard });
  // Each repo's items in the repos' order, whichever read answers first.
  const per = list.map(() => []);
  await Promise.all(list.map(async (x, i) => {
    try {
      const got = await readRepo(x);
      if (got.at && (!oldest || got.at < oldest)) oldest = got.at;
      // An injected read may give the PRs alone (no rounds read).
      const { prs = [], rounds = [] } = Array.isArray(got.value) ? { prs: got.value } : got.value ?? {};
      // undefined: a caller that names no limit (the default). null: a limit that could not be read, so none is applied.
      const limit = x.rounds === undefined ? REVIEW_ROUNDS : x.rounds;
      // At the limit the first rounds are judged (phase 133): progress extends it once; a read with no findings keeps the limit.
      const applies = pr => (Array.isArray(pr.findings) ? judgeRounds(pr.findings, limit)?.limit : null) ?? limit;
      const limited = limit === null ? [] : rounds.filter(pr => pr.rounds >= applies(pr));
      for (const pr of limited) {
        // Phase 133's verdict on the rounds so far, and the merge rule's counts, as fields and in the title.
        const verdict = applies(pr) > limit ? 'extended: progress' : pr.rounds >= limit && Array.isArray(pr.findings) ? 'stopped: repeating' : null;
        const n = pr.open, base = { kind: 'review', title: `${x.repo}#${pr.number}: review round ${pr.rounds} of ${applies(pr)}${verdict ? ` (${verdict})` : ''}, ${n} open finding${n === 1 ? '' : 's'}`,
          read: `plates review ${x.repo}#${pr.number}`, link: pr.url, source: 'reviews', actions: [], rounds: pr.rounds, limit: applies(pr), open: n,
          verdict, mergeRule: { fixFirst: pr.fixFirst ?? null, track: pr.track ?? null, unsorted: pr.unsorted ?? null } };
        if (ours(pr.author, me)) per[i].push({ ...base, waits: 'owner',
          why: `${clip(pr.title, 100)}. The review reached its limit, so no more fixes are pushed. Choose: merge with the rest tracked (${pr.fixFirst} to fix first, ${pr.track} to track, ${pr.unsorted} unsorted), split it, or close it.` });
        else per[i].push({ ...base, waits: 'external',
          why: `Someone else's PR (${pr.author}): ${clip(pr.title, 100)}. Its review reached its limit; merge, split or close is theirs.` });
      }
      for (const pr of prs.filter(p => p.state === 'open' && !limited.some(l => l.number === p.number))) {
        const title = `${x.repo}#${pr.number}: ${pr.unanswered} review comment${pr.unanswered === 1 ? '' : 's'} unanswered`;
        const base = { kind: 'review', title, read: `plates review ${x.repo}#${pr.number}`, link: pr.url, source: 'reviews', actions: [] };
        if (ours(pr.author, me)) per[i].push({ ...base, waits: 'broken',
          why: `${clip(pr.title, 100)}; the oldest from ${pr.oldest}. Validate each against the code, then answer it: fixed, tracked or not valid.` });
        else per[i].push({ ...base, waits: 'external',
          why: `Someone else's PR (${pr.author}): ${clip(pr.title, 100)}. Their reviewer's comments are theirs to answer.` });
      }
    } catch (e) {
      if (e?.saving) saving = e.message;
      failed.push(`${x.repo}: ${clip(e.message, 120)}`);
    }
  }));
  items.push(...per.flat());
  const skipped = repos.length - list.length;
  return { items, failed, skipped, saving, oldest, gaps };
}

/**
 * A managed fleet repo's review-round limit, from the fleet read's row for it
 * (plates fleet already reads each repo's .plates/plates.json; lib/fleet.mjs
 * `review`): { rounds } when its config is valid or it has none (not
 * adopted: three, as plates review says of a repo with no .plates/plates.json),
 * else { rounds: null, roundsGap } saying why it could not be read.
 */
export function fleetRoundLimit(row, noFleet = 'the fleet could not be read') {
  const gap = roundsGap => ({ rounds: null, roundsGap });
  if (!row) return gap(noFleet);
  if (row.unreadable) return gap(`unreadable: ${row.unreadable}`);
  if (row.adopted === false) return { rounds: REVIEW_ROUNDS };
  if (row.adopted !== true) return gap(`its .plates/plates.json is unreadable${row.adopted?.unreadable ? `: ${row.adopted.unreadable}` : ''}`);
  if (row.review?.problem) return gap(row.review.problem);
  if (!Number.isSafeInteger(row.review?.rounds) || row.review.rounds < 1) return gap('the fleet read carries no review config for it (read again: --fresh)');
  return { rounds: row.review.rounds };
}

/** The newest health page's proposal under root, and whether it is decided: { page, path, measure, text, decided } or null. */
export async function healthProposal(root) {
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  const rel = healthDirOf(config);
  const pages = (await readdir(join(root, rel)).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e))).filter(n => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
  if (!pages.length) return null;
  const path = `${rel}/${pages.at(-1)}`;
  const p = proposalOf(await readFile(join(root, path), 'utf8'));
  return p && { page: pages.at(-1).slice(0, 10), path, ...p, config };
}

const DECIDED = /^\*\*Decided (\d{4}-\d{2}-\d{2}): (accepted|declined)\*\*/m;
/** A health page's ## Proposal section: { measure, text, decided, start, end } (offsets into the page), or null. */
export function proposalOf(text) {
  const timing = parseTimeProposal(text);
  if (timing.problems.length) throw new WorkItemError(timing.problems.join('; '));
  const head = /^## Proposal[ \t]*\r?\n/m.exec(text);
  if (!head) return null;
  const start = head.index + head[0].length;
  const rest = text.slice(start);
  const next = /^## /m.exec(rest);
  const end = next ? start + next.index : text.length;
  const body = text.slice(start, end).trim();
  const measure = /^\*\*`([a-z0-9_]+)`\*\*/.exec(body)?.[1] ?? null;
  if (!body || /^none\b/i.test(body)) return null;
  const hygiene=parseHygieneProposal(text);
  if(hygiene.problems.length)throw new WorkItemError(hygiene.problems.join('; '));
  if(hygiene.proposal){const p=hygiene.proposal;return {measure:p.measure,text:body,decided:['accepted','declined'].includes(p.lifecycle.state)?{date:p.lifecycle.decidedAt?.slice(0,10),decision:p.lifecycle.state}:null,start,end,hygieneProposal:p};}
  const d = DECIDED.exec(body);
  return { measure, text: body, decided: timing.proposal ? (['accepted','declined'].includes(timing.proposal.lifecycle.state) ? {date:timing.proposal.lifecycle.decidedAt?.slice(0,10),decision:timing.proposal.lifecycle.state} : null) : d ? { date: d[1], decision: d[2] } : null, start, end, ...(timing.proposal ? {timeProposal:timing.proposal} : {}) };
}

/** Lessons waiting for a person: one item each, settled by plates learn decide. */
export async function inboxItems(root) {
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  if (config.plates !== 'self') return { na: 'the inbox is plates\'s (home only)' };
  const items = [];
  for (const p of (await proposals(root)).filter(x => x.meta.status === 'proposed')) {
    items.push({ waits: 'owner', kind: 'lesson', title: `lesson to decide: ${clip(p.title, 100)}`,
      why: `proposed: ${p.meta.outcome ?? '?'}${p.meta.note ? ` — ${clip(p.meta.note, 160)}` : ''}`, read: p.file, link: blob(config, p.file), source: 'inbox',
      actions: [
        { label: 'Accept', verb: 'learn decide', args: [p.slug, 'accepted'], note: 'optional' },
        { label: 'Decline', verb: 'learn decide', args: [p.slug, 'declined'], note: 'required' },
      ] });
  }
  const inbox = await readFile(join(root, 'docs', 'INBOX.md'), 'utf8').catch(() => '');
  const priv = Number(/^\| proposed \| (\d+) \|$/m.exec(inbox)?.[1] ?? 0);
  if (priv) items.push({ waits: 'owner', kind: 'lesson', title: `${priv} private inbox proposal${priv === 1 ? '' : 's'} to decide`, why: 'in the private inbox; decide each with plates learn decide <issue#>', read: 'plates learn', link: null, source: 'inbox', actions: [] });
  return { items };
}

/** The fleet strip and its broken rows, from plates fleet --json's data. */
export function fleetOf(data) {
  const strip = [], items = [], failed = [];
  for (const r of (data?.rows ?? []).filter(x => x.role === 'managed')) {
    const bad = v => v && typeof v === 'object' && 'unreadable' in v;
    const row = { repo: r.repo };
    if (r.unreadable) { strip.push({ ...row, unreadable: r.unreadable }); failed.push(`${r.repo}: ${clip(r.unreadable, 100)}`); continue; }
    row.practice = r.adopted === true ? (r.practice?.behind === 'current' ? `${r.practice.version} current` : r.practice?.behind ?? '?') : r.adopted === false ? 'not adopted' : 'unreadable';
    row.health = bad(r.health) ? `unreadable: ${r.health.unreadable}` : r.health?.state === 'none' ? 'no health page' : `${r.health?.last ?? '?'}${r.health?.state === 'silent' ? ' (silent)' : ''}`;
    row.ci = bad(r.ci) ? `unreadable: ${r.ci.unreadable}` : r.ci?.state ?? '?';
    strip.push(row);
    if (!bad(r.ci) && r.ci?.state === 'red') {
      items.push({ waits: 'broken', kind: 'ci', title: `${r.repo}: CI red on ${r.branch ?? 'the default branch'}`, why: `${r.ci.workflow ?? 'the gate'} ${r.ci.conclusion ?? 'failed'} at ${r.ci.at ?? '?'}`,
        read: `gh run list -R ${r.repo} --branch ${r.branch ?? 'main'} --limit 5`, link: `https://github.com/${r.repo}/actions`, source: 'fleet', actions: [] });
    }
    // A draft plates update PR: the fleet kept an update whose check failed (phase 52); its description says what failed.
    const drafts = bad(r.machinePrs) || !Array.isArray(r.machinePrs?.drafts) ? [] : r.machinePrs.drafts;
    for (const d of drafts) {
      const version = /^(?:plates|keel)\/update-(v[\w.+-]+)$/.exec(String(d?.head ?? ''))?.[1];
      if (!version || !Number.isInteger(d.number) || d.number < 1 || !/^[\w.-]+\/[\w.-]+$/.test(r.repo)) continue;
      const name = r.repo.split('/')[1];
      items.push({ waits: 'broken', kind: 'update', title: `${r.repo}: plates update ${version} fails ${name}'s check`,
        why: `a draft PR on ${d.head}: its description opens with what failed. The fix is one commit on that branch; then mark it ready and merge it.`,
        read: `gh pr view ${d.number} -R ${r.repo}`, link: `https://github.com/${r.repo}/pull/${d.number}`, source: 'fleet', actions: [] });
    }
  }
  return { strip, items, failed, ...(failed.length ? { why: `unreadable: ${failed.join('; ')}` } : {}) };
}

/** Explicit allowlist: private feedback text and filesystem paths never enter the board. */
export function feedbackSummary(data) {
  const states = new Set(['pending', 'linked', 'declined', 'superseded', 'unavailable']);
  const rows = Array.isArray(data?.items) ? data.items : [];
  const reference = value => {
    if (typeof value !== 'string') return null;
    if (/^proposal:[a-f0-9]{64}$/.test(value)) return value;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search ? url.href : null; } catch { return null; }
  };
  const items = rows.filter(row => /^[a-f0-9]{64}$/.test(row?.id ?? '')).sort((a, b) => Number(!['pending', 'unavailable'].includes(a.state)) - Number(!['pending', 'unavailable'].includes(b.state))).slice(0, 30).map(row => ({
    id: row.id, revision: Number.isSafeInteger(row.revision) ? row.revision : null,
    state: states.has(row.state) ? row.state : 'unavailable',
    gaps: Array.isArray(row.gaps) ? row.gaps.length : 0,
    resolution: row.resolution && states.has(row.resolution.state) ? {
      state: row.resolution.state,
      reference: reference(row.resolution.reference),
      supersededBy: /^[a-f0-9]{64}$/.test(row.resolution.supersededBy ?? '') ? row.resolution.supersededBy : null,
    } : null,
  }));
  const reason = data?.status === 'ok' ? null : data?.error === 'git_unavailable' ? 'Git identity is unavailable; private feedback coverage cannot be verified.' : data?.status === 'unavailable' ? 'Some retained reviewed results are unavailable; inspect local feedback coverage.' : 'Private feedback could not be read or its storage boundary could not be verified.';
  return { state: data?.status === 'ok' ? 'ok' : 'unavailable', reason, items, total: rows.length,
    pending: rows.filter(row => ['pending', 'unavailable'].includes(row?.state)).length,
    omitted: Math.max(0, rows.length - items.length), gaps: Array.isArray(data?.coverage) ? data.coverage.filter(entry => entry?.state !== 'complete').length : 0 };
}

// ---- every source, read locally ------------------------------------------------

/**
 * Every open item. deps (each optional; tests inject them, the CLI uses the
 * real ones): roadmap(root), looseEnds(root) → loose-ends data, reviews(repos)
 * → { items, failed, skipped }, fleet(root) → plates fleet data, today.
 */
export async function workItems({ root, namesEvidence = false }, deps = {}) {
  const context=namesEvidenceContext(namesEvidence), observation=namesObservation('home',context);
  let nightPlan=null;
  const env = deps.env ?? process.env;
  const today = deps.today ?? localToday();
  // The Refresh button and --fresh read GitHub again; the page's 60 s refresh uses what was read in the last 10 minutes.
  const fresh = !!deps.fresh;
  const spend = rateSpend();
  const reads = [];
  const config = JSON.parse(await readFile(join(root, '.plates', 'plates.json'), 'utf8'));
  planningConfig(config);
  const home = config.plates === 'self';
  const sources = [], items = [];
  // deps.only names the sources to read (plates home reads the rest through the shared home model).
  const wanted = name => !deps.only || deps.only.includes(name);
  const source = async (name, fn) => {
    if (!wanted(name)) return null;
    try {
      const r = await fn();
      if (r?.na) { sources.push({ source: name, state: 'n/a', why: r.na }); return null; }
      sources.push({ source: name, state: r?.failed?.length ? 'partial' : 'ok', count: r?.items?.length ?? 0, ...(r?.why ? { why: r.why } : {}) });
      items.push(...(r?.items ?? []));
      return r;
    } catch (e) {
      sources.push({ source: name, state: 'n/a', why: clip(e?.message ?? e, 200) });
      return null;
    }
  };
  const rm = await source('roadmap', () => roadmapItems(root, { today, read: deps.roadmap, env, fresh, spend, graphql: deps.milestones, guard: deps.milestoneGuard }));

  if (rm?.github?.readAt) reads.push(rm.github.readAt);
  let fleetJson = null;
  if (home) fleetJson = await readFile(join(root, 'plates.json'), 'utf8').then(t => JSON.parse(t)).catch(() => null);
  // plates fleet's data, read once for the fleet source and for the reviews' round limits (plates#118): kept like the
  // reviews, so the page's 60 s refresh asks GitHub nothing.
  let fleetRead = null;
  const fleetData = () => fleetRead ??= (async () => {
    if (deps.fleet) return deps.fleet(root);
    const got = await githubRead(env, `fleet-${root}`, async () => (await (await import('./fleet.mjs')).fleet({ dir: root }, { env, cli: deps.cli })).data, { fresh });
    reads.push(got.at);
    return got.value;
  })();
  const reposOf = async () => {
    const out = [];
    const add = (repo, reviewers = [], limit = {}) => { if (/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') && !out.some(x => x.repo.toLowerCase() === repo.toLowerCase())) out.push({ repo, reviewers, rounds: REVIEW_ROUNDS, ...limit }); };
    const own = reviewConfigOf(config);
    add(config.repo, own.problem ? [] : own.reviewers, own.problem ? {} : { rounds: reviewRoundLimit(config) });
    const managed = (Array.isArray(fleetJson) ? fleetJson : []).filter(r => r?.role === 'managed');
    if (!managed.length) return out;
    // Each fleet repo's own limit, from the read the fleet strip already makes; one it could not read is a gap, never three.
    let rows = null, why;
    try { rows = (await fleetData())?.rows ?? null; } catch (e) { why = `the fleet could not be read: ${clip(e?.message ?? e, 80)}`; }
    for (const r of managed) add(r.repo, [], fleetRoundLimit(rows?.find(x => String(x?.repo ?? '').toLowerCase() === String(r.repo ?? '').toLowerCase()), why));
    return out;
  };

  const [, , , , fl] = await Promise.all([
    source('loose-ends', async () => {
      const data = deps.looseEnds ? await deps.looseEnds(root)
        : (await (await import('./looseends.mjs')).looseEnds({ home: root, env, fresh, spend, reviews: false, skipPlanningRoot: root })).data;
      if (data?.github?.readAt) reads.push(data.github.readAt);
      return { items: looseItems(data, { home: root }) };
    }),
    source('reviews', async () => {
      const repos = await reposOf();
      if (!repos.length) return { na: '.plates/plates.json names no repo, and there is no fleet' };
      const r = await (deps.reviews ?? (async list => reviewItems(list, { env, today, fresh, spend, me: await viewerLogin(env) })))(repos);
      if (r.oldest) reads.push(r.oldest);
      if (r.saving && r.failed?.length === Math.min(repos.length, REVIEW_REPOS)) return { na: r.saving };
      if (r.failed?.length && r.failed.length === Math.min(repos.length, REVIEW_REPOS)) return { na: `GitHub could not be read: ${r.failed[0]}` };
      return { ...r, why: [r.failed?.length ? `not read: ${r.failed.join('; ')}` : '', r.gaps?.length ? `review-round limit not read, so none is applied: ${r.gaps.join('; ')}` : '', r.skipped ? `${r.skipped} repos past the first ${REVIEW_REPOS} not read` : ''].filter(Boolean).join('; ') || undefined };
    }),
    source('health', async () => {
      const p = await healthProposal(root);
      const config = p?.config ?? JSON.parse(await readFile(join(root,'.plates/plates.json'),'utf8'));
      const history = await readTimeProposals({root,healthDir:healthDirOf(config)});
      const timeItems = history.proposals.filter(p=>p.lifecycle.state!=='declined').map(p=>{
        const state=p.lifecycle.state,issue=p.lifecycle.issue;
        return {waits:state==='accepted'?'external':'owner',kind:'proposal',title:`time proposal: ${p.measure} (${state})`,
          why:state==='accepting' ? (issue?'Issue verified; acceptance incomplete. Owner label action may be needed; retry will not relabel.':p.lifecycle.reason??'Acceptance interrupted; resume this instance.') : state==='accepted' ? `Issue verified; ${p.lifecycle.remeasurement?.state??'remeasurement unavailable'}. Acceptance is not proof of improvement.` : p.candidate.title,
          read:p.path,link:issue?.url??blob(config,p.path),source:'health',instanceId:p.instanceId,
          actions:['proposed','accepting'].includes(state)?[
            {label:state==='accepting'?'Resume acceptance':'Accept',verb:'walk decide',args:['--proposal',p.path,'--instance',p.instanceId,'--accept'],note:'optional'},
            ...(state==='proposed'?[{label:'Decline',verb:'walk decide',args:['--proposal',p.path,'--instance',p.instanceId,'--decline'],note:'required'}]:[]),
          ]:[]};
      });
      const hygieneHistory=await readHygieneProposals({root,healthDir:healthDirOf(config)});
      history.gaps.push(...hygieneHistory.gaps);
      const seenHygiene=new Set();
      for(const h of hygieneHistory.proposals){
        if(seenHygiene.has(h.instanceId))continue;seenHygiene.add(h.instanceId);
        const state=h.lifecycle.state;if(state==='declined')continue;
        timeItems.push({waits:state==='accepted'?'external':'owner',kind:'proposal',title:`health proposal: long_files (${state})`,
          why:state==='accepted'?'Issue verified; acceptance is not proof of a completed split.':h.lifecycle.reason??h.candidate.title,
          read:h.path,link:h.lifecycle.issue?.url??blob(config,h.path),source:'health',instanceId:h.instanceId,
          actions:state==='accepted'?[]:[
            {label:state==='accepting'?'Resume acceptance':'Accept',verb:'walk decide',args:['--proposal',h.path,'--instance',h.instanceId,'--accept'],note:'optional'},
            ...(state==='proposed'?[{label:'Decline',verb:'walk decide',args:['--proposal',h.path,'--instance',h.instanceId,'--decline'],note:'required'}]:[]),
          ]});
      }
      if (!p || p.timeProposal || p.hygieneProposal) return {items:timeItems,...(history.gaps.length?{why:history.gaps.join('; ')}:{})};
      if (p.decided) return { items: timeItems, why: `the ${p.page} proposal is ${p.decided.decision} (${p.decided.date})` };
      return { items: [...timeItems, { waits: 'owner', kind: 'proposal', title: `health proposal (${p.page})${p.measure ? `: ${p.measure}` : ''}`,
        why: clip(p.text.split('\n')[0].replace(/\*\*/g, ''), 240), read: p.path, link: blob(config, p.path), source: 'health',
        actions: [
          { label: 'Accept', verb: 'walk decide', args: ['--proposal', p.path, ...(p.hygieneProposal?['--instance',p.hygieneProposal.instanceId]:[]), '--accept'], note: 'optional' },
          { label: 'Decline', verb: 'walk decide', args: ['--proposal', p.path, ...(p.hygieneProposal?['--instance',p.hygieneProposal.instanceId]:[]), '--decline'], note: 'required' },
        ] }] };
    }),
    source('inbox', () => inboxItems(root)),
    source('fleet', async () => {
      if (!home) return { na: 'plates fleet runs at home, on plates' };
      if (!fleetJson && !deps.fleet) return { na: 'no readable plates.json' };
      return fleetOf(await fleetData());
    }),
  ]);
  // Decisions that came back to be checked (phase 150): listed only once a record carries the loop's fields.
  let checks;
  if (!wanted('decisions')) checks = {};
  else try { checks = await (deps.decisions ?? (async (r, o) => (await import('./decision-loop.mjs')).decisionItems(r, o)))(root, { today }); } catch (e) { checks = { error: e }; }
  if (checks.error || checks.tracked) await source('decisions', async () => { if (checks.error) throw checks.error; return checks; });
  let robot = null, robotRest = null;
  await source('robot', async () => {
    if (deps.robotStatus) robot = await deps.robotStatus({ repo: config.repo, config, now: deps.now, github: deps.github });
    else {
      const got = await (await import('./robot-status.mjs')).boardRobotStatus({ repo: config.repo, config, now: deps.now, github: deps.github, env, fresh });
      robot = got.status; robotRest = got.rest;
      if (got.at) reads.push(got.at);
    }
    const state = robot.budget.state;
    const why = state === 'off' ? 'robot OFF; agent issues are unlabelled, no model spend' :
      state === 'available' ? `${robot.budget.remainingSeconds}s left for build and review; admission rechecks usage` :
      `robot ${state}: ${robot.budget.reasons.join('; ')}`;
    if (['off', 'available'].includes(state)) return { why, items: [] };
    return { why, items: [{ source: 'robot', kind: 'robot', waits: state === 'exhausted' ? 'time' : 'broken', title: `robot ${state}`,
      why, read: '.plates/plates.json', actions: [] }] };
  });
  // A claim idle for seven days is the owner's (plates phase 70). Only where a remote can hold one.
  const claims = await import('./claim.mjs');
  if (wanted('claims') && (deps.claims || await claims.remoteOf(root, env))) await source('claims', () => (deps.claims ?? claims.claimItems)(root, { env, fresh, now: deps.now }));
  // Production's latest verify (phase 81), with the delivery practice on: a failed one is the owner's.
  if (deps.verify || (Array.isArray(config.practices) && config.practices.includes('delivery'))) await source('verify', async () => {
    const { readVerify, verifyLine, VERIFY_BRANCH, productionOf, isProduction } = await import('../practices/night/files/scripts/plates/morning.mjs');
    // An unreadable record throws, so it is n/a with why and never kept as "nothing failed".
    const fetchIt = async () => { const v = deps.verify ? await deps.verify(root) : readVerify(root,{namesEvidence:context,consumer:'home'}); if (v.unread) {
      if(observation && v.observation) {
        observation.reads.push(...v.observation.reads);
        observation.fragments.push(...v.observation.fragments);
        observation.gaps.push(...v.observation.gaps);
      } else if(observation) namesGap(observation,'verify-provenance-unavailable');
      throw new Error(`the verify record (${VERIFY_BRANCH}) could not be read: ${v.unread}`);
    } return v; };
    const got = deps.verify ? { value: await fetchIt() } : await githubRead(env, `verify-${root}`, fetchIt, { fresh: context ? true : fresh });
    if (got.at) reads.push(got.at);
    // Production's results only: a preview's pass (verify.mjs --site) never clears production's failure (PR #182 review).
    const production = productionOf(config);
    const latest = got.value.results.find(r => isProduction(r, production));
    if(observation) {
      const projection=namesFragment(observation,'verify-displayed',JSON.stringify(latest?[{sha:latest.sha,ok:latest.ok,at:latest.at}]:[]));
      if(got.value.observation) {
        observation.reads.push(...got.value.observation.reads.map(r=>({...r,outputProjection:projection})));
        observation.gaps.push(...got.value.observation.gaps);
      } else namesGap(observation,'verify-provenance-unavailable');
    }
    if (!latest) return { why: `no verify of production${production ? ` (${production})` : ''} recorded on ${VERIFY_BRANCH} yet`, items: [] };
    const what = `the latest verify (${latest.at}, ${latest.sha.slice(0, 7)}) ${latest.ok ? 'passed' : 'failed'}`;
    if (latest.ok) return { why: what, items: [] };
    return { why: what, items: [{ source: 'verify', kind: 'verify', waits: 'owner', title: `production failed its verify for ${latest.sha.slice(0, 7)}`,
      why: verifyLine(latest), read: latest.run ?? `node scripts/plates/verify.mjs ${latest.sha}`, link: latest.run ?? null, actions: [] }] };
  });
  if(observation) {
    try {
      const {finalPlan,lastNight}=await import('../practices/night/files/scripts/plates/morning.mjs');
      const found=await finalPlan({root,date:lastNight(deps.now?new Date(deps.now):new Date()),namesEvidence:context,consumer:'home'});
      nightPlan=namesPlanProjection(found.plan);
      observation.reads.push(...found.observation.reads);
      observation.fragments.push(...found.observation.fragments);
      observation.gaps.push(...found.observation.gaps);
    } catch {namesGap(observation,'plan-read-unavailable');}
  }
  // A draft update PR is the fleet's broken item; loose-ends (a fleet checkout's open PRs) does not list it again.
  const broken = new Set(items.filter(i => i.source === 'fleet' && i.kind === 'update').map(i => i.link));
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].source !== 'loose-ends' || items[i].kind !== 'pr' || !broken.has(items[i].link)) continue;
    items.splice(i, 1);
    const s = sources.find(x => x.source === 'loose-ends');
    if (s?.count) s.count--;
  }
  let feedback = null;
  if (wanted('feedback')) try { feedback = feedbackSummary((deps.feedback ? await deps.feedback(root) : await (await import('./feedback-service.mjs')).feedbackList({ root, env })).data); }
  catch { feedback = feedbackSummary(null); }
  if (feedback) sources.push({ source: 'feedback', state: feedback.state === 'ok' ? 'ok' : 'n/a', count: feedback.total, ...(feedback.state !== 'ok' || feedback.gaps ? { why: feedback.reason || 'Private feedback coverage is incomplete; use plates feedback list --json.' } : {}) });
  const named = ['feedback', 'roadmap', 'loose-ends', 'reviews', 'health', 'inbox', 'decisions', 'robot', 'fleet', 'claims', 'verify'];
  sources.sort((a, b) => named.indexOf(a.source) - named.indexOf(b.source));
  const order = { walk: 0, step: 1, proposal: 2, lesson: 3, check: 4 };
  items.sort((a, b) => WAITS.indexOf(a.waits) - WAITS.indexOf(b.waits) || (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  items.forEach((it, i) => { it.actions = (it.actions ?? []).map((a, j) => ({ id: `${i}.${j}`, ...a })); });
  const counts = Object.fromEntries(WAITS.map(w => [w, items.filter(i => i.waits === w).length]));
  // What this board's GitHub reads cost, the oldest kept read it shows, and what is left of the hour's allowance.
  // Shown from this refresh's reads, else the last remembered: never a query of its own.
  const quota = await quotaShown(env, spend);
  const github = { readAt: reads.length ? reads.sort()[0] : null, cost: spend.cost, queries: spend.queries,
    remaining: quota?.remaining ?? spend.remaining, resetAt: quota?.resetAt ?? spend.resetAt, rest: robotRest };
  const timing = !wanted('timing') ? null : await import('./time.mjs').then(m => m.platesTime({ root, weeks: 8, env: { CI: 'true' } })).then(r => ({ weeks: r.data.weeks, coverage: r.data.coverage })).catch(() => ({ weeks: [], coverage: { note: 'Timing records unavailable' } }));
  return { ok: true, root, name: config.name ?? null, repo: /^[\w.-]+\/[\w.-]+$/.test(config.repo ?? '') ? config.repo : null, today, counts, items, sources, fleet: fl?.strip ?? null,
    robot, timing, feedback, phases: rm?.phases ?? {}, roadmap: rm?.progress ?? null, github, ...(observation?{nightPlan,observation}:{}) };
}


// ---- writing: walk done, walk decide ----------------------------------------------

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** Set (or, with value undefined, drop) one front-matter field, keeping the others in place. */
export function setField(raw, key, value) {
  const m = FRONT.exec(raw);
  const lines = m[1].split(/\r?\n/);
  const i = lines.findIndex(l => l.startsWith(`${key}:`));
  if (value === undefined) { if (i >= 0) lines.splice(i, 1); }
  else if (i >= 0) lines[i] = `${key}: ${value}`;
  else lines.push(`${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${raw.slice(m[0].length)}`;
}

/** Check the n-th Acceptance box (1-based among all boxes). */
function checkBox(raw, n) {
  const lines = raw.split('\n');
  let inAcceptance = false, seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) inAcceptance = /^## Acceptance\s*$/.test(lines[i]);
    else if (inAcceptance && /^- \[[ x]\]/.test(lines[i]) && ++seen === n) {
      lines[i] = lines[i].replace(/^- \[ \]/, '- [x]');
      return lines.join('\n');
    }
  }
  throw new WorkItemError(`no Acceptance box ${n}`);
}

function setSection(raw, name, text) {
  const m = new RegExp(`^## ${name}[ \\t]*\\r?\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm').exec(raw);
  if (!m) throw new WorkItemError(`no ## ${name} section`);
  const tail = raw.slice(m.index + m[0].length);
  return `${raw.slice(0, m.index)}## ${name}\n\n${text}\n${tail ? '\n' : ''}${tail}`;
}

const cell = s => oneLine(s).replaceAll('|', '\\|');

/** The owner's read appended to an evidence file: a row under today's "## The owner's read (date)" table. */
export function appendRead(text, { date, walked, note }) {
  const head = `## The owner's read (${date})`;
  const row = `| ${cell(walked)} | ${cell(note)} |`;
  const body = text.replace(/\s*$/, '');
  const last = body.lastIndexOf('\n## ');
  if (last >= 0 && body.slice(last + 1).startsWith(head)) return `${body}\n${row}\n`;
  return `${body}\n\n${head}\n\n| Walked | The owner's note |\n| --- | --- |\n${row}\n`;
}

async function git(root, args) { return exec('git', ['-C', root, ...args], { timeout: 30_000 }); }

/** The working-tree diff of the given paths (repo-relative), new files shown whole. */
async function diffOf(root, paths, created = []) {
  const tracked = paths.filter(p => !created.includes(p));
  const d = tracked.length ? await git(root, ['diff', '--no-color', '--', ...tracked]) : { ok: true, stdout: '' };
  const parts = [d.ok ? d.stdout.trimEnd() : `(git diff could not run: ${d.why})`];
  for (const p of created) parts.push(`new file ${p}:\n${(await readFile(join(root, p), 'utf8')).split('\n').map(l => `+${l}`).join('\n')}`);
  return parts.filter(Boolean).join('\n');
}

/** Write files, regenerate the roadmap; put every file back if the roadmap rejects the result (as plates goal does). */
async function writeAll(root, writes, { today }) {
  const before = [];
  for (const [path, content] of writes) {
    before.push([path, await readFile(join(root, path), 'utf8').catch(() => null)]);
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
  try { await roadmap({ root, mode: 'write', today }); } catch (e) {
    for (const [path, content] of before) await (content === null ? unlink(join(root, path)) : writeFile(join(root, path), content));
    throw new WorkItemError(`nothing written; the roadmap rejects the result: ${e.message}`, 1);
  }
}

/**
 * plates walk done <phase> --note "<text>" [--box <n>]: check the phase's open ⚑
 * box (the only one, or box n), append the owner's read to its first evidence
 * file (a new one when it has none), and when no box is left open set it
 * built, drop owes and waits, since today, Next action None. A box that is not
 * a walk is refused, writing nothing.
 *
 * --choice "<choice>" answers the phase's ## Your part instead: the read is
 * "Chose: <choice>." and the note after it (optional then). A choice not in
 * that part's Choices (the part for the box, by partsByBox) is refused, exit 2,
 * writing nothing. A choice is only a record: what it changes is the
 * conductor's next step, which the part's Then says (returned as `then`).
 */
export function walkWritePlan({ file, raw, evidenceText, note, box, choice, today }) {
  const id = Number(file.match(/^\d+/)?.[0]), path = `docs/phases/${file}`;
  if (!Number.isSafeInteger(id) || typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new WorkItemError('invalid walk source');
  if (choice !== undefined && !oneLine(choice)) throw new WorkItemError('choice is required');
  if (choice === undefined && !oneLine(note)) throw new WorkItemError('owner observation is required');
  const p = parsePhase(file, raw);
  if (DONE.includes(p.status) || p.status === 'superseded') throw new WorkItemError(`phase ${id} is ${p.status}: no walk is open`);
  const open = openBoxes(raw);
  const walks = open.filter(b => b.walk);
  let chosen;
  if (box !== undefined) {
    chosen = open.find(b => b.n === Number(box));
    if (!chosen) throw new WorkItemError(`box ${box} of phase ${id} is not an open Acceptance box; open: ${open.map(b => `${b.n}${b.walk ? ' (walk)' : ''}`).join(', ') || 'none'}`);
    if (!chosen.walk) throw new WorkItemError(`box ${box} of phase ${id} is not a walk ("${clip(chosen.text, 80)}"): it names a test or a command, so it is built, not walked. Nothing written`);
  } else {
    if (!walks.length) throw new WorkItemError(`phase ${id} has no open walk box (⚑ by hand, or a \`gh …\` check). Nothing written`);
    if (walks.length > 1) throw new WorkItemError(`phase ${id} has ${walks.length} open walk boxes: name one with --box ${walks.map(b => b.n).join('|')} (${walks.map(b => `${b.n}: ${clip(b.text, 50)}`).join('; ')})`);
    chosen = walks[0];
  }
  let picked = null, then = null, keepsOpen = false;
  if (choice !== undefined) {
    const yp = yourPartIn(raw);
    const mapped = partsByBox(yp, raw);
    const part = (mapped.find(x => x.n === chosen.n) ?? (mapped.length === 1 ? mapped[0] : null))?.part;
    if (!part?.choices?.length) throw new WorkItemError(`phase ${id} has no Choices for box ${chosen.n} (its ## Your part names none): use --note "<what you saw>". Nothing written`);
    picked = part.choices.find(c => oneLine(c).toLowerCase() === oneLine(choice).toLowerCase());
    if (!picked) throw new WorkItemError(`"${clip(choice, 80)}" is not one of phase ${id}'s choices: ${part.choices.join(' | ')}. Nothing written`);
    then = thenFor(part.then, part.choices, picked);
    // A deferring choice (Keeps it open) records the answer and ticks nothing.
    keepsOpen = (part.keepsOpen ?? []).some(c => oneLine(c).toLowerCase() === picked.toLowerCase());
  }
  const read = picked ? `Chose: ${picked}.${oneLine(note) ? ` ${oneLine(note)}` : ''}` : note;
  let text = keepsOpen ? raw : checkBox(raw, chosen.n);
  const left = keepsOpen ? open : open.filter(b => b.n !== chosen.n);
  const writes = [], created = [];
  let evidence = p.evidence[0];
  if (!evidence) {
    evidence = `evidence/${today}-phase-${id}-walk.md`;
    created.push(`docs/${evidence}`);
    text = setField(text, 'evidence', JSON.stringify([evidence]).replaceAll('","', '", "'));
  }
  const evPath = `docs/${evidence}`;
  const evText = created.length
    ? `# Evidence: phase ${id} — ${p.title}\n\n- Date: ${today}\n- Phase: ${id}\n- Claim being checked: the walk the phase owed, read by the owner.\n`
    : evidenceText;
  if (typeof evText !== 'string') throw new WorkItemError('existing evidence is unavailable');
  writes.push([evPath, appendRead(evText, { date: today, walked: chosen.text, note: read })]);
  let moved = null;
  if (!keepsOpen && !left.length) {
    text = setField(setField(setField(setField(text, 'status', 'built'), 'owes', undefined), 'waits', undefined), 'since', today);
    text = setSection(text, 'Next action', 'None.');
    moved = 'built';
  }
  if (text !== raw) writes.unshift([path, text]);
  const files = [...(text !== raw ? [path] : []), evPath, 'docs/ROADMAP.md'];
  const what = keepsOpen ? `phase ${id}: chose "${picked}", recorded in ${evPath}; the walk stays open (box ${chosen.n} unchecked, status stays ${p.status})` : `phase ${id}: box ${chosen.n} checked ("${clip(chosen.text, 80)}"); the owner's read appended to ${evPath}${moved ? `; status built (owes dropped, since ${today}, Next action None.)` : `; ${left.length} box${left.length === 1 ? '' : 'es'} still open (${left.some(b => !b.walk) ? 'buildable work left' : 'walks'}), status stays ${p.status}`}`;
  return {writes, created, files, what, data:{ok:true,phase:id,file:path,box:chosen.n,walked:chosen.text,choice:picked,then,keepsOpen,evidence:evPath,created,status:moved??p.status,left:left.map(b=>({n:b.n,walk:b.walk,text:b.text})),files}};
}

export async function walkDone({ root, phase, note, box, choice, today = localToday() }) {
  await requireLocalPhases(root);
  if (!/^\d+$/.test(String(phase ?? ''))) throw new WorkItemError('plates walk done <phase> --note "<what you saw>" | --choice "<choice>" [--box <n>]');
  if (choice !== undefined && !oneLine(choice)) throw new WorkItemError('--choice needs one of the phase\'s Choices (its ## Your part)');
  if (choice === undefined && !oneLine(note)) throw new WorkItemError('--note "<what you saw>" is required: the owner\'s read is the evidence (or --choice "<one of the Your part\'s Choices>")');
  if (box !== undefined && !/^[1-9]\d*$/.test(String(box))) throw new WorkItemError('--box needs a box number (1 is the first Acceptance box)');
  const id = Number(phase);
  const names = (await readdir(join(root, 'docs', 'phases'))).filter(n => /^\d+-.*\.md$/.test(n) && Number(n.split('-')[0]) === id);
  if (names.length !== 1) throw new WorkItemError(names.length ? `phase ${id} is in ${names.length} files` : `no phase ${id} in docs/phases`);
  const file = names[0], path = `docs/phases/${file}`;
  const raw = await readFile(join(root, path), 'utf8');
  const evidence = parsePhase(file, raw).evidence[0];
  const evidenceText = evidence ? await readFile(join(root, `docs/${evidence}`), 'utf8') : undefined;
  const plan = walkWritePlan({file,raw,evidenceText,note,box,choice,today});
  await writeAll(root, plan.writes, {today});
  const diff = await diffOf(root, plan.files, plan.created), {choice:picked,keepsOpen,then}=plan.data;
  return {data:{...plan.data,diff,note:DIFF_NOTE},text:`${plan.what}${picked && !keepsOpen ? `; chose "${picked}"` : ''}.${keepsOpen ? '\nRecorded; the walk stays open.' : ''}${then ? `\nThen: ${then}` : ''}\n${DIFF_NOTE[0].toUpperCase()}${DIFF_NOTE.slice(1)}.\n\n${diff}`};
}

/**
 * plates walk decide --proposal <health page> --accept ["<why>"] | --decline "<why>":
 * the decision is a record line at the end of the page's ## Proposal section,
 * "**Decided <date>: accepted|declined** — why". The board and loose-ends stop
 * listing a decided proposal; an accepted one becomes a phase by plates phase new.
 */
export function decideLegacyProposal(text, { decision, reason = '', today = localToday() }) {
  if (!['accept', 'decline'].includes(decision) || typeof reason !== 'string' || /[\r\n\x00-\x1f]/.test(reason)) throw new WorkItemError('invalid proposal decision');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new WorkItemError('invalid decision date');
  const timing = parseTimeProposal(text), hygiene = parseHygieneProposal(text);
  if (timing.proposal || hygiene.proposal || timing.problems.length || hygiene.problems.length) throw new WorkItemError('structured proposals require their policy-bound writer');
  const p = proposalOf(text);
  if (!p || p.decided) throw new WorkItemError('proposal missing or already decided');
  const why = oneLine(reason);
  if (decision === 'decline' && !why) throw new WorkItemError('declining needs a reason');
  const state = decision === 'accept' ? 'accepted' : 'declined';
  const record = `**Decided ${today}: ${state}**${why ? ` — ${why}` : ''}`;
  const before = text.slice(0, p.end).replace(/\s*$/, ''), after = text.slice(p.end);
  return { content: `${before}\n\n${record}\n${after ? `\n${after}` : ''}`, decision: state, why, record, measure: p.measure };
}
export async function walkDecide({ root, proposal, accept, decline, instance, map, github, at, today = localToday() }) {
  if (!proposal) throw new WorkItemError('plates walk decide --proposal <health page> --accept ["<why>"] | --decline "<why>"');
  if ([accept,decline,map].filter(v=>v!==undefined).length !== 1) throw new WorkItemError('one of --accept ["<why>"] or --decline "<why>"');
  if (decline !== undefined && !oneLine(decline)) throw new WorkItemError('--decline needs "<why>": the night reads it');
  const abs = isAbsolute(proposal) ? proposal : resolve(root, proposal);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new WorkItemError(`${proposal} is outside the project`);
  const resolveDecisionPath=async()=>{
    try { return await safeHygienePath(root, rel); }
    catch { return await safeHygienePage(root, rel); }
  };
  const decisionPath=await resolveDecisionPath();
  const canonicalRel=relative(await realpath(root),decisionPath);
  const text = await readFile(decisionPath, 'utf8').catch(() => { throw new WorkItemError(`cannot read ${rel}`); });
  const timing=parseTimeProposal(text);
  if(timing.problems.length)throw new WorkItemError(timing.problems.join('; '));
  if(timing.proposal){
    let transition=null;
    if(map!==undefined){const raw=await readFile(resolve(root,map),'utf8');if(raw.length>256*1024)throw new WorkItemError('mapping exceeds size bound');try{transition=JSON.parse(raw);}catch{throw new WorkItemError('mapping must be JSON');}}
    const result=await decideTimeProposal({root,path:rel,expectedInstance:instance,decision:map!==undefined?'map':accept!==undefined?'accept':'decline',reason:oneLine(accept??decline)||null,transition,at,github});
    return {data:{...result,timeProposal:result.proposal,proposal:rel,instanceId:timing.proposal.instanceId},exitCode:result.ok?0:2,text:`${rel}: ${result.decision}${result.issue?` — ${result.issue.url}`:''}${result.reasons?.length?'\n'+result.reasons.join('; '):''}`};
  }
  const hygiene=parseHygieneProposal(text);
  if(hygiene.problems.length)throw new WorkItemError(hygiene.problems.join('; '));
  if(hygiene.proposal){
    if(map!==undefined)throw new WorkItemError('--map requires a time proposal');
    const result=await decideHygieneProposal({root,path:rel,expectedInstance:instance,decision:accept!==undefined?'accept':'decline',reason:oneLine(accept??decline)||null,at,github});
    return {data:{...result,hygieneProposal:result.proposal,proposal:rel,instanceId:hygiene.proposal.instanceId},exitCode:result.ok?0:2,text:`${rel}: ${result.state}${result.issue?` — ${result.issue.url}`:''}${result.reasons?.length?'\n'+result.reasons.join('; '):''}`};
  }
  if(instance!==undefined||map!==undefined)throw new WorkItemError('--instance requires a structured proposal; --map requires a time proposal');
  const p = proposalOf(text);
  if (!p) throw new WorkItemError(`${rel} has no proposal (no ## Proposal section, or it is empty)`);
  if (p.decided) throw new WorkItemError(`${rel}'s proposal is already ${p.decided.decision} (${p.decided.date})`);
  const decision = accept !== undefined ? 'accepted' : 'declined';
  const transformed = decideLegacyProposal(text, { decision: accept !== undefined ? 'accept' : 'decline', reason: oneLine(accept ?? decline), today });
  const { why, record } = transformed;
  const next = decision === 'accepted' ? `If it needs building: plates phase new "<title>" --goal <id>${p.measure ? `, naming \`${p.measure}\`` : ''}.` : '';
  if(await resolveDecisionPath()!==decisionPath||await readFile(decisionPath,'utf8')!==text)throw new WorkItemError('health page changed during proposal decision; refresh before deciding');
  await writeFile(decisionPath, transformed.content);
  const diff = await diffOf(root, [canonicalRel]);
  return {
    data: { ok: true, proposal: rel, measure: p.measure, decision, why, record, diff, note: DIFF_NOTE },
    text: `${rel}: the proposal${p.measure ? ` (${p.measure})` : ''} is ${decision}.${next ? ` ${next}` : ''}\n${DIFF_NOTE[0].toUpperCase()}${DIFF_NOTE.slice(1)}.\n\n${diff}`,
  };
}

// ---- home: one read model, two renderers (plates phase 156) -------------------------
//
// The hosted home (lib/web/home.mjs, through the GitHub App) and plates home
// (lib/home.mjs, from the local checkout and gh) build each plate with the
// same reader (lib/web/projects.mjs projectFromSource) and these functions, and
// put the plates together with homeSnapshot. Each renders the result its own
// way: HTML (lib/web/views.mjs), or the terminal and JSON (lib/home.mjs).

/** Source text as home shows it: control characters dropped, bounded. */
export const homeText = (value, limit = 700) => typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, limit) : null;

/** One home item: a plain object naming its plate and the source revision it was read at. */
export const homeAction = (project, key, value) => ({ id: `${project.id}:${key}`, projectId: project.id, projectName: project.name, expectedSourceVersion: project.revision, ...value });

/**
 * The roadmap's items (roadmapItems) as home's lists: the owner's walks, the
 * owner's other turns (decisions), and what waits on time or outside. Agent
 * work names the next action only. { decisions, walks, waiting, next, activeGoal }.
 */
export function homeRoadmap(project, board, phases, linkFor) {
  const out = { decisions: [], walks: [], waiting: [], next: null, activeGoal: null };
  const rank = item => item.waits === 'owner' ? item.kind === 'walk' ? 2 : 1 : item.waits === 'broken' ? 0 : item.waits === 'agent' ? 3 : 4;
  const ordered = board.items.slice().sort((a, b) => rank(a) - rank(b) || a.phase - b.phase);
  out.activeGoal = phases.find(p => p.id === ordered[0]?.phase)?.goal ?? null;
  for (const item of ordered) {
    const kind = item.waits === 'owner' ? item.kind === 'walk' ? 'walk' : 'decision' : ['time', 'external'].includes(item.waits) ? 'waiting' : 'work';
    const sourcePath = `docs/phases/${phases.find(p => p.id === item.phase).file}`;
    const value = homeAction(project, `phase:${item.phase}:${kind}`, { kind, itemKind: item.kind, title: homeText(item.ask || item.title, 180), why: homeText(item.why), next: homeText(item.next),
      link: linkFor(sourcePath), phase: String(item.phase), ready: kind === 'walk' && item.ready !== false,
      details: item.yourPart ? Object.fromEntries(['ask', 'why', 'look', 'then', 'takes'].map(key => [key, homeText(item.yourPart[key])]).concat([['choices', (item.yourPart.choices ?? []).slice(0, 10).map(x => homeText(x, 120))]])) : null });
    if (kind === 'decision') out.decisions.push(value); else if (kind === 'walk') out.walks.push(value); else if (kind === 'waiting') out.waiting.push(value);
    out.next ??= homeText(item.ask || item.next || item.title);
  }
  return out;
}

/** The newest health page's undecided proposal as a home decision, or null. */
export function homeHealth(project, path, proposal, link) {
  if (!proposal || proposal.decided) return null;
  return homeAction(project, `health:${path}`, { kind: 'decision', itemKind: 'proposal', title: `Review ${proposal.measure || 'health'} proposal`,
    why: homeText(proposal.text), next: 'Inspect the source proposal before deciding.', decisionTarget: { kind: 'health', path }, link, phase: null, ready: true, details: null });
}

/** Whose reviews a plate's config asks for, and its round limit: the review read's input (as the board reads home's own). */
export function reviewSourceOf(config, repo) {
  const own = reviewConfigOf(config);
  return own.problem ? { repo, reviewers: [], rounds: null, roundsGap: own.problem } : { repo, reviewers: own.reviewers, rounds: reviewRoundLimit(config) };
}

/** The command that reads reviews in a terminal: plates home reads them through gh. */
export const REVIEWS_COMMAND = 'plates home';

/**
 * A plate's reviews waiting on the owner, from one review-state read (the
 * night's repo-wide read, phase 71 and 133): a PR at its round limit (with
 * its verdict and the merge rule's counts) and a PR with findings left
 * unanswered, both the owner's when the PR is theirs or an agent's; someone
 * else's PR waits outside. read(source) → { prs, rounds }; without a read, the
 * reviews are a gap with the reason, never an empty list.
 * { reviews, waiting, gap }.
 */
export async function homeReviews(project, source, { read, me = null, today = localToday(), unavailable = null } = {}) {
  if (!read) return { reviews: [], waiting: [], gap: { source: 'reviews', reason: unavailable ?? `Reviews are not read here; ${REVIEWS_COMMAND} reads them.` } };
  const r = await reviewItems([source], { read, me, today });
  if (r.failed.length) return { reviews: [], waiting: [], gap: { source: 'reviews', reason: `Reviews could not be read: ${clip(r.failed[0].replace(/^[^:]+: /, ''), 160)}` } };
  const reviews = [], waiting = [];
  for (const item of r.items) {
    const number = Number(/#(\d+)/.exec(item.title)?.[1]);
    const value = homeAction(project, `review:${number}`, { kind: 'review', itemKind: 'review', waits: item.waits, title: homeText(item.title, 180), why: homeText(item.why), next: item.read,
      link: item.link, phase: null, ready: true, details: null,
      review: { number, rounds: item.rounds ?? null, limit: item.limit ?? null, verdict: item.verdict ?? null, open: item.open ?? null,
        mergeRule: item.mergeRule ?? null } });
    (item.waits === 'external' ? waiting : reviews).push(value);
  }
  return { reviews, waiting, gap: r.gaps.length ? { source: 'reviews', reason: `Review-round limit not read, so none is applied: ${clip(r.gaps[0], 160)}` } : null };
}

/**
 * The sections only one form can read, or neither: each is a row in both
 * forms, with its reason and the command that reads it, and is never missing
 * from one. `local` rows the CLI reads on the owner's machine; the hosted
 * home shows them as unavailable. `lessons` neither form reads yet.
 */
export const HOME_SECTIONS = Object.freeze([
  { id: 'lessons', title: 'Lessons waiting', reads: 'none', reason: 'plates-inbox is not readable by the App yet', command: 'plates learn' },
  { id: 'local', title: 'Local work', reads: 'local', sources: ['loose-ends'], reason: 'on your machine', command: 'plates loose-ends' },
  { id: 'feedback', title: 'Feedback to review', reads: 'local', sources: ['feedback'], reason: 'on your machine', command: 'plates feedback list' },
  { id: 'fleet', title: 'Fleet', reads: 'local', sources: ['fleet'], reason: 'CI and update pull requests are read with gh; the App has no Actions or Pull requests read for them', command: 'plates fleet' },
  { id: 'claims', title: 'Stale claims', reads: 'local', sources: ['claims'], reason: 'claim branches are read from your checkout\'s remote', command: REVIEWS_COMMAND },
  { id: 'verify', title: 'Production verify', reads: 'local', sources: ['verify'], reason: 'the verify record is read with gh', command: REVIEWS_COMMAND },
  { id: 'robot', title: 'Robot', reads: 'local', sources: ['robot'], reason: 'the robot\'s budget is read with gh from its issues and runs', command: REVIEWS_COMMAND },
  { id: 'checks', title: 'Decisions to check', reads: 'local', sources: ['decisions'], reason: 'decision records are read from your checkout', command: REVIEWS_COMMAND },
  { id: 'health-history', title: 'Earlier health proposals', reads: 'local', sources: ['health'], reason: 'earlier health pages are past the hosted read bound', command: REVIEWS_COMMAND },
]);

/**
 * The rows for HOME_SECTIONS. `read` maps a section id to { items, why } where
 * this form read it, or { na } where it tried and could not; a section with
 * no entry is not read here. Every section appears, read or not.
 */
export function homeSections(read = {}) {
  return HOME_SECTIONS.map(def => {
    const got = Object.hasOwn(read, def.id) ? read[def.id] : null;
    const base = { id: def.id, title: def.title, command: def.command };
    if (!got) return { ...base, state: 'unavailable', reason: def.reason, count: null, items: [] };
    if (got.na) return { ...base, state: 'unavailable', reason: clip(got.na, 200), count: null, items: [] };
    return { ...base, state: 'read', reason: got.why ? clip(got.why, 200) : null, count: got.count ?? got.items.length, items: got.items };
  });
}

/** Home's lists across plates, the same for both forms. projects: each plate's value from projectFromSource. */
export function homeSnapshot(projects, { sections = homeSections() } = {}) {
  const gaps = projects.flatMap(project => project.gaps.map(gap => ({ projectId: project.id, ...gap })));
  const all = key => projects.flatMap(p => p[key] ?? []).sort((a, b) => a.id.localeCompare(b.id));
  return {
    coverage: { state: projects.length && projects.every(project => project.state === 'unavailable') ? 'unavailable' : gaps.length ? 'partial' : 'complete', gaps }, projects,
    decisions: all('decisions'), walks: all('walks'), reviews: all('reviews'), waiting: all('waiting'),
    changes: projects.flatMap(p => p.changes).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id)).slice(0, 20),
    sections,
  };
}
