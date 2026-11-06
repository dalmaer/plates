// POST /api/home/answer (plates phase 173): one answer to one item in Home's
// "Needs you", through the writer its answer names in the shared model
// (lib/work-items.mjs answersFor). The server checks session, origin and CSRF
// first, as for walks and decisions. Input: { key, answer, why?, until? }.
//
//   not now      the owner's Not now store (SQL017): written, { state: 'written' }
//   walk decide  the existing decision preview (lib/web/decisions.mjs); the
//                client confirms it through /api/projects/<id>/decisions/apply,
//                under decisionWrites: { state: 'preview', preview }
//   walk done    the home walk writer (lib/web/phase-walks.mjs): the owner's
//                choice and/or note, as plates walk done writes it, previewed
//                and confirmed through the same apply route
//   pr merge     a ready PR (phase 176): the merge preview (lib/web/pr-merges.mjs),
//                bound to the card's head, confirmed through the same apply route
//   any other    listed with why and the command (its `unavailable`): refused
//
// A written Not now leaves a backlog event (SQL019), best effort: skipped, and
// noted once, before 019 is applied.
//
// The item is found in this owner's current home model by its key; an item
// that no longer waits, or an answer that needs a why without one, writes nothing.
import { WebError, deny, record } from './common.mjs';
import { createNotNowStore } from './not-now-store.mjs';
import { createBacklogEventStore } from './backlog-events-store.mjs';
import { notNowReason } from '../backlog-events.mjs';
import { estimateOf } from '../work-items.mjs';
import { createMerges } from './pr-merges.mjs';

const FIELDS = ['key', 'answer', 'why', 'until'];

/** Every item the hosted home holds in Needs you and put off. */
const itemsOf = model => [
  ...['decisions', 'walks', 'reviews'].flatMap(list => (model[list] ?? []).filter(item => item.key)),
  ...(model.putOff?.items ?? []).map(p => p.item),
];

export function createHomeAnswers(config, { fetcher = fetch, now = Date.now, readHome, decisions, phaseWalks, notNow = createNotNowStore(config, fetcher), events = createBacklogEventStore(config, fetcher), merges = createMerges(config, { fetcher, now }) } = {}) {
  return async function answer(access, token, input) {
    if (!record(input) || Object.keys(input).some(key => !FIELDS.includes(key))) throw new WebError('invalid_answer', 400);
    const { key, why, until } = input;
    if (typeof key !== 'string' || key.length > 400 || !/^[a-z][a-z0-9-]{0,63}:[a-z]+:\S/.test(key)) throw new WebError('invalid_answer', 400);
    if (typeof input.answer !== 'string' || !/^[a-z0-9-]{1,64}$/.test(input.answer)) throw new WebError('invalid_answer', 400);
    if (why !== undefined && (typeof why !== 'string' || why.length > 300 || /[\x00-\x1f]/.test(why))) throw new WebError('invalid_why', 400);
    if (until !== undefined && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until))) throw new WebError('invalid_until', 400);
    const project = access.projects.find(p => p.id === key.split(':')[0]);
    if (!project) deny();
    const model = await readHome(access, token, { projectId: project.id });
    const item = itemsOf(model).find(x => x.key === key);
    if (!item) throw new WebError('item_not_waiting', 404);
    const chosen = item.answers.find(a => a.id === input.answer);
    if (!chosen) throw new WebError('answer_not_found', 404);
    if (chosen.unavailable) throw new WebError('answer_unavailable', 409);
    const line = (why ?? '').replace(/\s+/g, ' ').trim();
    if (chosen.needsWhy !== 'never' && !line) throw new WebError('why_required', 400);
    if (until !== undefined && chosen.writer !== 'not now') throw new WebError('invalid_until', 400);
    const today = new Date(now()).toISOString().slice(0, 10);
    if (chosen.writer === 'not now') {
      const written = await notNow.put(access.userId, key, { until, reason: line, today });
      // Its backlog event (phase 184, SQL019): metadata only, best effort; the owner's reason is a code there, never the words.
      await events.record(access.userId, { actor: 'owner', key, action: 'not-now', reason: notNowReason(line), takes: estimateOf(item).minutes, outcome: chosen.id });
      return { schema: 1, state: 'written', key, answer: chosen.id, writer: chosen.writer, until: written.until, ...(written.reason ? { reason: written.reason } : {}) };
    }
    if (chosen.writer === 'walk decide') {
      const preview = await decisions.preview(access, token, project, { target: item.decisionTarget, choice: chosen.id, ...(line ? { reason: line } : {}) });
      return { schema: 1, state: 'preview', key, answer: chosen.id, writer: chosen.writer, preview };
    }
    if (chosen.writer === 'walk done') {
      const choice = item.details?.choices?.find(c => c === chosen.label);
      const preview = await phaseWalks.preview(access, token, project, { phase: Number(item.phase), box: Number.isSafeInteger(item.box) ? item.box : null,
        ...(chosen.id.startsWith('choice-') ? { choice: choice ?? chosen.label } : {}), ...(line ? { note: line } : {}) });
      return { schema: 1, state: 'preview', key, answer: chosen.id, writer: chosen.writer, preview };
    }
    if (chosen.writer === 'pr merge') {
      const preview = await merges.preview(access, token, project, item);
      return { schema: 1, state: 'preview', key, answer: chosen.id, writer: chosen.writer, preview };
    }
    throw new WebError('answer_unavailable', 409);
  };
}
