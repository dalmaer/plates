// Synthetic Acme agent attempts for the improve selftest, dated from now so the
// window always holds them: this week three of four failures taught nothing.
// The reading is lib/lesson-status.mjs's own; tests/lesson-status.test.mjs
// covers reading the real ledgers.
import { captureReading } from '../../../lib/lesson-status.mjs';

export function lessonFixture(now) {
  const at = new Date(now).toISOString();
  const attempts = [
    { source: 'session-trials', id: 'acme/run1', at, outcome: 'failed', status: 'none' },
    { source: 'session-trials', id: 'acme/run2', at, outcome: 'reworked', status: 'none' },
    { source: 'session-trials', id: 'acme/run3', at, outcome: 'failed', status: 'none' },
    { source: 'session-trials', id: 'acme/run4', at, outcome: 'failed', status: 'known' },
  ];
  return { lessonCapture: ({ bound }) => captureReading(attempts, { now, bound, experiments: 1 }) };
}
