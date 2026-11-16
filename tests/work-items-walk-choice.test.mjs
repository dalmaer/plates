// Walk answers record decisions; only the phase's declared outcome accepts it.
// Synthetic Acme phases exercise the pure writer shared by CLI and hosted Home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkWritePlan } from '../lib/work-items.mjs';

const file = '01-acme.md', path = `docs/phases/${file}`;
const phase = ({ choices = 'Looks right | Something is missing (say what)', then = 'The conductor records the answer.', keeps = '', extra = '' } = {}) => `---
status: partial
since: 2026-10-01
goal: G0
depends: []
note: "Acme owner read remains."
evidence: ["evidence/acme.md"]
${extra ? '' : 'owes: walk\nwaits: owner'}
---
# Acme owner read
## Done when
The Acme result works for its owner.
## Scope
One Acme result.
## Acceptance
- [x] Implemented. \`tests/acme.test.mjs\`
- [ ] ⚑ by hand: the owner reads the Acme result.
${extra}
## Your part
- **Ask:** Does the Acme result work?
- **Choices:** ${choices}
${keeps ? `- **Keeps it open:** ${keeps}` : ''}
- **Then:** ${then}
- **Ready:** yes
## Proof
Read the Acme result by hand.
## Deliberately open
None.
## Next action
Read the Acme result.
`;
const plan = (raw, choice, note) => walkWritePlan({ file, raw, choice, note, today: '2026-11-15', evidenceText: '# Acme evidence\n' });
const changedPhase = (p, raw) => p.writes.find(([name]) => name === path)?.[1] ?? raw;

test('a multi-choice answer without a completion declaration records the read and stays partial', () => {
  const raw = phase();
  for (const choice of ['Looks right', 'Something is missing (say what)']) {
    const p = plan(raw, choice, 'Acme needs another read.');
    assert.equal(p.data.status, 'partial');
    assert.equal(p.data.keepsOpen, true);
    assert.equal(changedPhase(p, raw), raw, 'acceptance, owes, since and next action are preserved');
    assert.ok(p.writes.find(([name]) => name === 'docs/evidence/acme.md')[1].includes(`Chose: ${choice}. Acme needs another read.`));
  }
  assert.equal(plan(raw, undefined, 'A note without a choice.').data.status, 'partial');
});

test('only the explicitly completing choice builds; another choice cannot borrow its Then', () => {
  const raw = phase({ choices: 'Yes, shortlist them | All still needed', then: 'Yes: the conductor prepares an Acme shortlist. All still needed: the phase is built.' });
  assert.equal(plan(raw, 'Yes, shortlist them').data.status, 'partial', 'Then fallback is not a completion declaration');
  const p = plan(raw, 'all still needed');
  assert.equal(p.data.status, 'built');
  assert.match(changedPhase(p, raw), /status: built/);
  assert.match(changedPhase(p, raw), /\[x\] ⚑/);
  assert.match(changedPhase(p, raw), /## Next action\n\nNone\./);
  assert.doesNotMatch(changedPhase(p, raw), /^(owes|waits):/m);
});

test('a choice label inside a longer one never borrows its declaration', () => {
  // "Works" sits inside "Not Works:"; "Useful" inside "Not useful:".
  assert.equal(plan(phase({ choices: 'Works | Not Works', then: 'Not Works: the phase is built.' }), 'Works').data.status, 'partial');
  assert.equal(plan(phase({ choices: 'Works | Not Works', then: 'Not Works: the phase is built.' }), 'Not Works').data.status, 'built');
  assert.equal(plan(phase({ choices: 'Useful | Not useful', then: 'Not useful: superseded.' }), 'Useful').data.status, 'partial', 'Useful never retires');
  assert.equal(plan(phase({ choices: 'Useful | Not useful', then: 'Not useful: fix it. Useful: built.' }), 'Useful').data.status, 'built', 'Useful completes from its own clause');
  assert.equal(plan(phase({ choices: 'Useful | Not useful', then: 'Not useful: fix it. Useful: built.' }), 'Not useful').data.status, 'partial');
});

test('conditional, negated and unscoped Then prose never declares a completing choice', () => {
  for (const then of ['Looks right: the phase is not built.', 'Looks right: the phase is built after another review.', 'Looks right: if checks pass, the phase is built.', 'The phase is built.']) {
    assert.equal(plan(phase({ then }), 'Looks right').data.status, 'partial', then);
  }
});

test('a retirement answer supersedes the phase without checking its acceptance', () => {
  assert.equal(plan(phase({ choices: 'Retire it' }), undefined, 'Acme observation.').data.status, 'partial', 'a note does not select retirement');
  for (const [choices, then, choice] of [
    ['Retire it | Keep both', 'Retire it: the conductor drafts the Acme removal. Keep both: recorded.', 'Retire it'],
    ['Useful | Not worth it', 'Useful: the phase is built. Not worth it: the phase is superseded.', 'Not worth it'],
    ['Retire it', 'The conductor drafts the Acme removal.', 'Retire it'],
  ]) {
    const raw = phase({ choices, then }), p = plan(raw, choice);
    assert.equal(p.data.status, 'superseded');
    const text = changedPhase(p, raw);
    assert.match(text, /status: superseded/);
    assert.match(text, /\[ \] ⚑/);
    assert.doesNotMatch(text, /^(owes|waits):/m);
    assert.ok(p.writes.find(([name]) => name === 'docs/evidence/acme.md')[1].includes(`Chose: ${choice}.`));
    assert.match(p.what, /superseded/);
  }
});

test('single-choice and legacy note-only walks still complete, while deferrals and other boxes remain open', () => {
  assert.equal(plan(phase({ choices: 'Read it' }), 'Read it').data.status, 'built');
  assert.equal(plan(phase({ choices: '' }), undefined, 'Acme read it.').data.status, 'built');
  assert.equal(plan(phase({ choices: 'Read it', keeps: 'Read it' }), 'Read it').data.status, 'partial');
  const declared = { then: 'Looks right: built. Something is missing (say what): fix it.' };
  assert.equal(plan(phase(declared), 'Looks right').data.status, 'built');
  assert.equal(plan(phase({ ...declared, keeps: 'Looks right' }), 'Looks right').data.status, 'partial');
  assert.equal(plan(phase({ ...declared, extra: '- [ ] Build another part. `tests/other.test.mjs`' }), 'Looks right').data.status, 'partial');
});
