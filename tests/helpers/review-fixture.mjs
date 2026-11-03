// A synthetic Acme docket for the review session (plates phase 174): a walk
// with four choices and a long ask, a health proposal, a stale claim and a
// step. Keys, answers and the docket come from the real model
// (lib/work-items.mjs itemKey, answersFor, docketOf), as /api/home carries them.
import { itemKey, answersFor, docketOf } from '../../lib/work-items.mjs';

const LONG_ASK = 'On your phone, open the Acme studio preview, publish a draft with two images and a caption, then open the published page on a second device and say whether everything you published arrived, in the order you set, with nothing **missing** or duplicated';

export function reviewItems({ decisionWrites = true } = {}) {
  const can = { form: 'web', decisionWrites };
  const base = { projectId: 'studio', projectName: 'Acme Studio', why: 'Source asks for an owner observation.', next: null, link: 'https://github.com/acme/studio/blob/main/docs/phases/3-publish.md' };
  const walk = { ...base, id: 'walk-3', kind: 'walk', itemKind: 'walk', ref: '3', phase: '3', box: 1, ready: true, title: 'Acme Studio: publish from a phone',
    details: { ask: LONG_ASK, why: 'Only a person on a real phone can say whether publishing *feels* reliable.', look: 'The published page on the second device', takes: 'About 10 minutes',
      choices: ['Verified', 'Close, but (say what)', 'Needs changes', 'Cannot check yet'] } };
  const proposal = { ...base, id: 'decision-health', kind: 'decision', itemKind: 'proposal', ref: 'docs/health/2026-11-01.md', title: 'Update the Acme anvil library',
    why: 'The `anvil` library is 14 months old.', decisionTarget: { kind: 'health', path: 'docs/health/2026-11-01.md' }, link: 'https://github.com/acme/studio/blob/main/docs/health/2026-11-01.md' };
  const claim = { plate: 'studio', id: 'claim-7', kind: 'claim', itemKind: 'claim', waits: 'owner', ref: 'claims/phase-7', phase: 7, title: 'Stale claim: phase 7', why: 'No push for 9 days.', link: 'https://github.com/acme/studio/tree/claims/phase-7' };
  const step = { ...base, id: 'step-5', kind: 'decision', itemKind: 'step', ref: '5', phase: '5', title: 'Phase 5: approve the night lane', why: 'The next action is yours.', link: 'https://github.com/acme/studio/blob/main/docs/phases/5-night.md' };
  for (const item of [walk, proposal, claim, step]) Object.assign(item, { key: itemKey(item), answers: answersFor(item, can) });
  return { walk, proposal, claim, step };
}

/** A /api/home snapshot holding the docket: decisions (the proposal and the step), the walk, and a section row (the claim). */
export function reviewSnapshot(options = {}) {
  const { walk, proposal, claim, step } = reviewItems(options);
  const lists = { decisions: [proposal, step], walks: [walk], reviews: [], sections: [{ id: 'claims', title: 'Stale claims', state: 'read', count: 1, items: [claim], command: 'plates home' }] };
  return { schema: 1, cursor: 'a'.repeat(64), cursorState: 'initial', generatedAt: '2026-11-03T16:00:00.000Z', coverage: { state: 'complete', gaps: [] },
    projects: [{ id: 'studio', repo: 'acme/studio', name: 'Acme Studio', state: 'complete', gaps: [], planning: {}, decisions: [], walks: [], reviews: [], waiting: [], changes: [] }],
    ...lists, waiting: [], changes: [], putOff: { count: 0, items: [], unavailable: null }, docket: docketOf(lists), quota: { state: 'known', remaining: 100 } };
}
