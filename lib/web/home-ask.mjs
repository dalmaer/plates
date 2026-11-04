// POST /api/projects/<id>/ask/preview (plates phase 166, increment 3): the ask
// box's preview. It writes nothing of its own. Tonight's plan goes through the
// hosted night-plan publication (lib/web/night-plan.mjs): this builds the plan
// with the ask's item, the item `plates goodnight add --title <ask> --kind
// triage` adds, and asks that writer for its preview; the owner approves that
// exact preview through /api/projects/<id>/night-plan/apply, which rechecks
// the source and refuses a stale one. An agent issue has no hosted writer (the
// App has no Issues write): its answer is the CLI command with the ask filled in.
import { nightOf } from '../../practices/night/files/scripts/plates/night-plan.mjs';
import { HOME_ASK_DESTINATIONS, askItem, askText, askCommand } from '../work-items.mjs';
import { WebError } from './common.mjs';

export function createHomeAsk({ daily, nightPlan, now = Date.now }) {
  return async function preview(access, token, project, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['ask', 'destination'].includes(key))) throw new WebError('invalid_input', 400);
    const ask = askText(input.ask), destination = HOME_ASK_DESTINATIONS.find(d => d.id === input.destination);
    if (!ask || !destination) throw new WebError('invalid_input', 400);
    const command = askCommand(destination.command, ask);
    if (destination.hosted !== 'night-plan') return { schema: 1, kind: 'ask', destination: destination.id, state: 'command', project: { id: project.id, repo: project.repo }, ask, command, reason: destination.note };
    const date = nightOf(new Date(now()));
    const model = await daily.inspect(access, token, project, date), capability = model.capabilities?.nightPlan;
    if (!capability?.review) return { schema: 1, kind: 'ask', destination: destination.id, state: 'command', project: { id: project.id, repo: project.repo }, ask, command, reason: capability?.reason ?? 'Tonight\'s plan cannot be published from the workspace for this plate.' };
    const base = structuredClone(model.plan ?? capability.seed), item = askItem(ask);
    if (base.items.some(i => i.id === item.id)) throw new WebError('ask_already_planned', 409);
    if (base.willNotTouch.includes(item.id)) throw new WebError('ask_will_not_touch', 409);
    const plan = { ...base, shapedBy: 'owner', items: [...base.items, item] };
    const reviewed = await nightPlan.preview(access, token, project, { date, sourceDigest: model.sourceDigest, plan });
    return { schema: 1, kind: 'ask', destination: destination.id, state: 'preview', project: { id: project.id, repo: project.repo }, ask, command, item, preview: reviewed };
  };
}
