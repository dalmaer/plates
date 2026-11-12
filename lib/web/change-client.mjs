// "Since last visit" starts where Home's "Since you last looked" does: the server's
// stored visit (SQL018, lib/web/last-looked-store.mjs), rendered into the page as
// data-journal-since. Nothing is kept in browser storage. With no stored visit the
// page shows every observed addition and says so (phase 172's look: a fresh
// browser's seven-day default hid every older change).
const DAY = 86400000;
export const ALL_LABEL = 'Showing all observed additions';
export function journalWindow(raw, now = Date.now(), reason = null) {
    const value = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw) ? Date.parse(raw) : NaN;
    if (!(Number.isFinite(value) && value <= now && value >= now - 365 * DAY))
        return { since: null, first: true, mode: 'all', label: `${ALL_LABEL}: ${typeof reason === 'string' && reason ? reason.toLowerCase() : 'no previous visit is stored yet'}, so nothing is hidden by date` };
    // Publication records have day precision, so the entire previous visit day is included.
    const since = Math.floor(value / DAY) * DAY, date = new Date(since).toISOString().slice(0, 10);
    return { since, first: false, mode: 'since', label: `Since you last looked: additions from ${date} UTC, the day of your previous visit, as on Home. The whole day is included because additions have dates, not times; some may already be familiar` };
}
export function journalMatches(date, range, mode) { if (mode !== 'since' || range.since === null)
    return true; const stamp = Date.parse(date); return Number.isFinite(stamp) && stamp >= range.since; }
export function startJournalPreference({ document, window, onChange = () => { } }) {
    const holder = document.querySelector('[data-journal-scope]'), filter = document.querySelector('[data-journal-filter]'), note = document.querySelector('[data-journal-date]');
    if (!holder || !filter)
        return null;
    const range = journalWindow(filter.dataset.journalSince || null, Date.now(), filter.dataset.journalReason || null);
    if (note)
        note.textContent = `${range.label}. This personal filter never hides required decisions or walks.`;
    const apply = () => { let shown = 0, total = 0; for (const card of holder.querySelectorAll('[data-change-time]')) {
        card.hidden = !journalMatches(card.dataset.changeTime, range, filter.value);
        total++;
        if (!card.hidden)
            shown++;
    } const empty = document.querySelector('[data-journal-empty]'); if (empty)
        empty.hidden = !total || shown > 0; onChange(); };
    filter.addEventListener('change', apply);
    apply();
    return { range, matches: date => journalMatches(date, range, filter.value), apply, stop() { filter.removeEventListener('change', apply); } };
}
export function startGallery({ document }) {
    let dialog = null, opener = null;
    const close = () => { dialog?.close(); };
    const click = event => {
        const link = event.target.closest?.('[data-enlarge]');
        if (!link)
            return;
        const src = link.dataset.image;
        if (!/^\/api\/projects\/[a-z][a-z0-9-]{0,63}\/media\/[a-f0-9]{64}\/bytes$/.test(src))
            return;
        event.preventDefault();
        opener = link;
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'journal-dialog';
            dialog.setAttribute('aria-label', 'Enlarged private capture');
            const bar = document.createElement('div');
            bar.className = 'journal-actions';
            const title = document.createElement('strong');
            title.textContent = 'Private capture';
            const button = document.createElement('button');
            button.textContent = 'Close';
            button.addEventListener('click', close);
            bar.append(title, button);
            dialog.append(bar, document.createElement('img'), document.createElement('p'));
            dialog.addEventListener('close', () => opener?.focus());
            document.body.append(dialog);
        }
        const img = dialog.querySelector('img');
        img.src = src;
        img.alt = link.dataset.alt || 'Private capture';
        dialog.querySelector('p').textContent = link.dataset.caption || 'Capture provenance stays with the original receipt.';
        dialog.showModal();
        dialog.querySelector('button').focus();
    };
    const imageError = event => { if (!event.target.matches?.('[data-private-image]'))
        return; const figure = event.target.closest('figure'); event.target.closest('a')?.setAttribute('hidden', ''); const text = figure?.querySelector('[data-image-error]'); if (text)
        text.hidden = false; };
    document.addEventListener('click', click);
    document.addEventListener('error', imageError, true);
    return { stop() { document.removeEventListener('click', click); document.removeEventListener('error', imageError, true); dialog?.remove(); } };
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    startGallery({ document });
    if (!document.querySelector('[data-home-root]'))
        startJournalPreference({ document, window });
}
