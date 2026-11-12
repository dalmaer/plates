// Backlog events on the hosted workspace (SQL019, plates phase 184): per owner,
// an opaque scope digest, the database's own time and the event's short codes
// (lib/backlog-events.mjs), append-only. No source text and no owner words.
//
// Best effort, always: `record` never throws, so the action it records stands.
// Before 019 is applied (or whenever the store cannot be reached) the event is
// skipped, and the first skip in this process is noted once: the web keeps
// working without events. The CLI keeps the same records in each checkout's
// .plates/backlog-events/.
import { exact, hash, requestJson, WebError } from './common.mjs';
import { backlogEvent, storedEvent, EVENT_FIELDS } from '../backlog-events.mjs';

const INPUT = EVENT_FIELDS.filter(f => !['schema', 'id', 'at'].includes(f));
const ONCE = { noted: false };

export function createBacklogEventStore(config, fetcher = fetch, { warn = message => console.warn(message), once = ONCE } = {}) {
  const scopeFor = userId => hash(JSON.stringify(['backlog-events-v1', config.appId, config.installationId, config.workspace.id, config.workspace.repoId, userId]));
  async function rpc(operation, userId, event = null, since = null) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new WebError('invalid_backlog_event_owner', 400);
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/plates_backlog_events_rpc`, { method: 'POST',
      headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_operation: operation, p_scope: scopeFor(userId), p_event: event, p_since: since }) }, 1024 * 1024);
    if (result?.capacity === true) throw new WebError('backlog_events_capacity', 413);
    return result;
  }
  return {
    scopeFor,
    /** Append one event, best effort: { event, skipped }. Never throws. */
    async record(userId, input) {
      try {
        const checked = backlogEvent(input); // the same codes the CLI's store keeps; the database keeps its own time
        const event = Object.fromEntries(INPUT.map(f => [f, checked[f]]));
        const result = await rpc('append', userId, event);
        if (!exact(result, ['appended', 'id', 'at']) || result.appended !== true || !Number.isSafeInteger(result.id)) throw new WebError('invalid_backlog_event_storage');
        return { event: storedEvent({ schema: 1, id: `h${result.id}`, at: result.at, ...event }), skipped: null };
      } catch (error) {
        const code = error?.code ?? error?.message ?? 'unknown';
        if (!once.noted) { once.noted = true; warn(`plates: backlog events are not stored (${code}); actions go on without them. SQL019 stores them.`); }
        return { event: null, skipped: code };
      }
    },
    /** This owner's events at or after `since` (ISO), oldest first, at most 1000. Throws when unread: missing events are never none. */
    async list(userId, since = null) {
      const result = await rpc('list', userId, null, since);
      if (!exact(result, ['events']) || !Array.isArray(result.events) || result.events.length > 1000) throw new WebError('invalid_backlog_event_storage');
      return result.events.map(row => {
        const event = exact(row, [...INPUT, 'id', 'at']) && Number.isSafeInteger(row.id) ? storedEvent({ ...row, schema: 1, id: `h${row.id}` }) : null;
        if (!event) throw new WebError('invalid_backlog_event_storage');
        return event;
      });
    },
  };
}
