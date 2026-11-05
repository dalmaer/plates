// plates home --review [--quick] [--project <id>] (plates phases 174, 175): the review session
// in a terminal. It walks the same docket as the web's /review, in the same
// order (lib/work-items.mjs docketOf, read through lib/web/review-views.mjs
// docketItems, as the browser reads it): one card at a time, numbered answers,
// w for a why, n for Not now, q to quit. There is no Undo window here: each
// answer is previewed through the writer plates home --answer uses, and
// written only after a yes. A write that is refused comes back once at the end
// with its reason, and the session ends on what it settled and what that set
// moving. --quick walks only the quick ones (the model's 2 minutes or less).
import { home } from './home.mjs';
import { docketItems, cardAnswers, notNowAnswer, aboutMinutes, setsText, setMoving, setMovingText } from './web/review-views.mjs';
import { addDays, NOT_NOW_DAYS } from './work-items.mjs';

const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const plain = s => oneLine(s).replace(/\*\*|`/g, '').replace(/(^|[^*\w])\*(\S[^*]*?)\*(?![*\w])/g, '$1$2');

/** The card as terminal lines: where it sits, the chips, the ask, why, look at, and the numbered answers. */
export function reviewCardText(entry, { index, total, reason = null }) {
  const item = entry.item, details = item.details ?? {};
  const chips = [item.projectName ?? item.plate ?? entry.key.split(':')[0], entry.label, Number.isSafeInteger(entry.minutes) ? aboutMinutes(entry.minutes) : details.takes].filter(Boolean).join(' · ');
  const sets = setsText(entry.sets);
  const answers = cardAnswers(item), later = notNowAnswer(item);
  const why = details.why ?? item.why;
  return [
    `[${index + 1} of ${total}] ${chips}`,
    ...(reason ? [`  Needs another look: ${reason}`] : []),
    '', `  ${plain(details.ask ?? item.title)}`,
    ...(why ? [`  ${plain(why)}`] : []),
    ...(item.link || details.look ? [`  Look at: ${[details.look ? plain(details.look) : null, item.link].filter(Boolean).join(' — ')}`] : []),
    ...(sets.length ? [`  Sets moving: ${sets.join(' · ')}`] : []),
    '',
    ...answers.map((a, i) => `  ${i + 1}) ${a.label}${a.needsWhy !== 'never' ? ' (needs a why)' : ''}${a.unavailable ? ` (not from here: ${a.unavailable.reason})` : ''}`),
    `  w) add why   ${later ? 'n) not now   ' : ''}q) quit`,
  ].join('\n');
}

/** The end, as the web's end screen says it. */
export function reviewEndText({ settled, putOff, again, shown }) {
  if (!shown) return 'Nothing needs you: every item waiting on you is answered or put off.';
  const out = [`Review: ${settled.length} settled · ${putOff.length} put off${again.length ? ` · ${again.length} need${again.length === 1 ? 's' : ''} another look` : ''}`];
  if (again.length) out.push('', 'Needs another look', ...again.map(x => `  ${x.title}: ${x.reason}${x.command ? ` (${x.command})` : ''}`));
  const moving = setMovingText(setMoving(settled));
  if (moving) out.push('', 'Set moving', `  ${moving}: ${[...new Set(settled.flatMap(x => setsText(x.sets)))].join(' · ')}`);
  if (settled.length) out.push('', 'Settled', ...settled.map(x => `  ${x.title}: ${x.label}${x.what ? ` — ${x.what}` : ''}`));
  if (putOff.length) out.push('', 'Put off', ...putOff.map(x => `  ${x.title}: until ${x.until}`));
  return out.join('\n');
}

/**
 * plates home --review. input: an async iterator of lines (stdin, or a test's);
 * write(text): where the cards and prompts go. deps.answer is plates home
 * --answer's writer (homeAnswer); deps.home reads the model.
 */
export async function homeReview({ root, projectId, quick = false, input, write }, deps = {}) {
  const now = deps.now ?? Date.now, today = new Date(now()).toISOString().slice(0, 10);
  const answer = deps.answer ?? (await import('./home-answer.mjs')).homeAnswer;
  const model = await (deps.home ?? home)({ root, projectId }, deps);
  const items = docketItems(model, { projectId: projectId ?? null, quick });
  const queue = items.map(entry => ({ entry, reason: null })), settled = [], putOff = [], again = [], retried = new Set();
  let quit = false;
  const ask = async prompt => { write(prompt); const next = await input.next(); if (next.done) { quit = true; return null; } return String(next.value ?? '').trim(); };
  const title = entry => plain(entry.item.details?.ask ?? entry.item.title);
  for (let i = 0; i < queue.length && !quit; i++) {
    const { entry, reason } = queue[i], item = entry.item;
    write(`\n${reviewCardText(entry, { index: i, total: queue.length, reason })}\n`);
    let why = '', done = false;
    while (!done && !quit) {
      const line = await ask('> ');
      if (line === null || line === 'q') { quit = true; break; }
      let chosen = null, until;
      if (line === 'w') { why = oneLine(await ask('why> ')); continue; }
      if (line === 'n') {
        chosen = notNowAnswer(item);
        if (!chosen) { write('  This item has no Not now.\n'); continue; }
        const date = await ask(`until (Enter for ${addDays(today, NOT_NOW_DAYS)}, or YYYY-MM-DD)> `);
        if (date === null) break;
        if (date) until = date;
      } else if (/^[1-9]$/.test(line)) chosen = cardAnswers(item)[Number(line) - 1] ?? null;
      if (!chosen) { write('  Choose a number, w, n or q.\n'); continue; }
      if (chosen.unavailable) { write(`  ${chosen.label} is not written from here: ${chosen.unavailable.reason}\n  ${chosen.unavailable.command}\n`); continue; }
      if (chosen.needsWhy !== 'never' && !why) {
        why = oneLine(await ask(chosen.needsWhy === 'decline' ? 'why (a decline says why)> ' : `why (${chosen.label} needs one)> `));
        if (!why) { write('  Nothing written: this answer needs a why.\n'); continue; }
      }
      const args = { root, key: entry.key, answerId: chosen.id, why: why || undefined, until };
      const command = `plates home --answer ${entry.key} ${chosen.id}${why ? ` --why ${JSON.stringify(why)}` : ''}${until ? ` --until ${until}` : ''} --yes`;
      try {
        const preview = await answer({ ...args, yes: false }, deps);
        write(`${preview.text}\n`);
        const sure = await ask('Write it? [y/N] ');
        if (sure === null) break;
        if (!/^y(es)?$/i.test(sure)) { write('  Not written; it stays in Needs you.\n'); done = true; continue; }
        const result = await answer({ ...args, yes: true }, deps);
        write(`${result.text}\n`);
        if (result.exitCode && result.exitCode !== 0) throw Object.assign(new Error(String(result.text ?? 'refused').split('\n')[0]), { refused: true });
        if (chosen.writer === 'not now') putOff.push({ key: entry.key, title: title(entry), until: result.data?.until ?? until ?? addDays(today, NOT_NOW_DAYS) });
        else settled.push({ key: entry.key, title: title(entry), label: chosen.label, what: String(result.text ?? '').split('\n')[0], sets: entry.sets ?? [] });
      } catch (error) {
        const why = oneLine(error.message).slice(0, 300) || 'the writer refused';
        write(`  Not written: ${why}\n`);
        if (!retried.has(entry.key)) { retried.add(entry.key); queue.push({ entry, reason: why }); }
        else again.push({ key: entry.key, title: title(entry), reason: why, command });
      }
      done = true;
    }
  }
  // Cards that failed and were never shown again (the session was quit) still say why.
  for (const q of queue.slice(items.length)) if (q.reason && !again.some(a => a.key === q.entry.key) && !settled.some(s => s.key === q.entry.key) && !putOff.some(p => p.key === q.entry.key)) again.push({ key: q.entry.key, title: title(q.entry), reason: q.reason, command: `plates home --answer ${q.entry.key} <answer>` });
  const data = { schema: 1, docket: items.map(e => e.key), settled, putOff, again, quit };
  return { data, text: reviewEndText({ settled, putOff, again, shown: items.length }), exitCode: 0 };
}
