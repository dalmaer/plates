// Synthetic Acme decisions for the improve selftest, dated from now so the
// window always holds them: three checks came due past their grace and only
// one was made on time. The reading is lib/decision-loop.mjs's own;
// tests/decision-loop.test.mjs covers reading the real records.
import { checkReading, addDays } from '../../../lib/decision-loop.mjs';

export function decisionFixture(now) {
  const date = new Date(now).toISOString().slice(0, 10);
  const due = addDays(date, -12), decided = addDays(date, -40);
  const base = { kind: 'decision-fence', decidedAt: decided, evidence: ['docs/evidence/acme.md'], expects: 'Acme anvils drop once', checkBy: due, problems: [] };
  const decisions = [
    { ...base, ref: 'docs/decisions/acme.md#a', title: 'Acme a' },
    { ...base, ref: 'docs/decisions/acme.md#b', title: 'Acme b' },
    { ...base, ref: 'docs/decisions/acme.md#c', title: 'Acme c', outcome: { outcome: 'held', observedIn: 'docs/evidence/acme.md', at: due } },
  ];
  return { decisionChecks: ({ bound }) => checkReading(decisions, { date, bound }) };
}
