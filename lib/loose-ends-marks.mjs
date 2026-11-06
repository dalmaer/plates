// A plate's loose-ends marks (.plates/loose-ends.json), as bytes: the one shape
// `plates loose-ends mark` (lib/looseends.mjs) writes in a checkout and the
// hosted Done on a step (lib/web/step-marks.mjs, plates phase 187) previews
// for the default branch. Pure, with no imports, so the web reaches it without
// the loose-ends scanner. A mark is { fingerprint, kind, move, date, reason,
// until? }; a new mark replaces any earlier one for its fingerprint.

export const MARKS = '.plates/loose-ends.json';
export const MOVES = ['resume', 'park', 'drop'];

/** A file's marks; null text is no file yet. Throws on a file that is not JSON (it is never overwritten). */
export function marksIn(text) {
  if (text === null || text === undefined) return [];
  const value = JSON.parse(text);
  return Array.isArray(value?.marks) ? value.marks : [];
}

/** The mark entry, shaped as mark() records it. */
export const markEntry = ({ fingerprint, kind, move, reason, until, today }) =>
  ({ fingerprint, kind, move, date: today, reason: String(reason).trim(), ...(until ? { until } : {}) });

/** The file's bytes with `entry` in place of any mark for its fingerprint. */
export function withMark(marks, entry) {
  const next = marks.filter(m => m?.fingerprint !== entry.fingerprint);
  next.push(entry);
  return `${JSON.stringify({ marks: next }, null, 2)}\n`;
}
