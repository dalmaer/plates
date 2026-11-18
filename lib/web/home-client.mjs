import {startPlateWorkspace} from './plate-workspace-client.mjs';
import {homeLoadingSummary,homeLoadingStatus} from './home-loading.mjs';
import {clearPrivateView} from './safety-client.mjs';
import {startJournalPreference} from './change-client.mjs';
import {createWebSender,HOLD_MS,reviewMessage} from './review-client.mjs';
// Browser polling and pure state transitions. No private snapshots enter persistent storage.
export const POLL_INTERVAL = 60_000;
export const MAX_BACKOFF = 300_000;
// Leave the server's 55-second bounded read time to return before the client aborts.
export const REQUEST_TIMEOUT = 58_000;
const validCursor = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function createPollState(cursor, { loadingOnly = false } = {}) {
  return { cursor: validCursor(cursor) ? cursor : null, loadingOnly: loadingOnly === true, visible: true, inFlight: false, denied: false,
    pending: null, updates: 0, failures: 0, delay: POLL_INTERVAL, needsFresh: false, status: 'idle', notice: '' };
}
export function transitionPoll(state, event) {
  if (state.denied) return state;
  if (event.type === 'visibility') return { ...state, visible: event.visible, inFlight: event.visible ? state.inFlight : false };
  if (event.type === 'start') return state.inFlight || !state.visible ? state : { ...state, inFlight: true };
  if (event.type === 'apply') return !state.pending ? state : { ...state, loadingOnly: state.loadingOnly && !canHydrateInitial(state), pending: null, updates: 0, notice: event.automatic ? 'Available project sources shown. Further results will wait for your review.' : 'Updated view applied. Recheck any open source details.' };
  if (event.type !== 'response') return state;
  if ([401,403,404].includes(event.status)) return { ...createPollState(null), denied: true, visible: state.visible, status: 'denied', notice: 'Access changed. Sign in again to continue.' };
  if (event.status === 304) return { ...state, inFlight: false, failures: 0, delay: POLL_INTERVAL, status: 'current', needsFresh: false, notice: state.pending ? 'New source information is ready. Your current view is unchanged.' : 'Sources checked; this view is current.' };
  if (event.status !== 200 || !validCursor(event.snapshot?.cursor) || event.snapshot?.schema !== 1 || !Array.isArray(event.snapshot.projects)) {
    const failures = state.failures + 1;
    return { ...state, inFlight: false, failures, delay: Math.min(MAX_BACKOFF, POLL_INTERVAL * 2 ** Math.min(failures, 3)), status: 'stale', needsFresh: false, notice: 'Refresh unavailable. The previous view may be stale; its source times are preserved.' };
  }
  const snapshot = event.snapshot, gap = snapshot.cursorState === 'gap', changed = snapshot.cursor !== state.cursor;
  return { ...state, inFlight: false, failures: 0, delay: POLL_INTERVAL, status: 'current', cursor: snapshot.cursor,
    pending: changed || gap ? snapshot : state.pending, updates: changed || gap ? state.updates + 1 : state.updates,
    needsFresh: gap && !event.fresh,
    notice: gap ? 'Update history has a gap. A fresh bounded view is being requested.' : event.fresh && state.needsFresh ? 'Fresh view received after a history gap. Review and apply the update.' : changed ? `New source information is ready${snapshot.coverage?.state !== 'complete' ? ', with incomplete source coverage' : ''}. Your current view is unchanged.` : state.pending ? state.notice : 'Sources checked; this view is current.' };
}
export function canHydrateInitial(state) {
  if (!state.loadingOnly || state.denied || !state.pending) return false;
  const snapshot = state.pending;
  return snapshot.projects.length === 0 || snapshot.projects.some(project => project.state !== 'loading')
    || ['decisions','walks','waiting','changes'].some(key => Array.isArray(snapshot[key]) && snapshot[key].length > 0);
}
export function matchesHomeFilter({ search = '', groups = '' }, query = '', filter = 'all') {
  return String(search).toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || String(groups).split(/\s+/).includes(filter));
}
/** A native fetch has a deadline even when the server never responds. */
export async function fetchHomeResponse({ fetch, url, headers, controller = new AbortController(), timeout = REQUEST_TIMEOUT }) {
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url,{ method:'GET',credentials:'same-origin',cache:'no-store',headers,signal:controller.signal });
    return { status:response.status,snapshot:response.status === 200 ? await response.json() : null };
  } catch { return { status:503,snapshot:null }; }
  finally { clearTimeout(timer); }
}
/** Native DOM integration; browser walkthrough, not model tests, verifies focus/layout. */
export function startHomeClient({ document, window, fetch, renderHomeSnapshot, renderReviewStart = null, renderAskResult = null, renderAskOperation = null }) {
  const root = document.querySelector('[data-home-root]');
  if (!root) return null;
  const endpoint = root.dataset.endpoint;
  if (!/^\/api\/(?:home|projects\/[a-z][a-z0-9-]{0,63}\/home)$/.test(endpoint)) return null;
  const projectId = root.dataset.projectId || null;
  const refresh = document.querySelector('[data-refresh]'), apply = document.querySelector('[data-apply-updates]');
  const message = document.querySelector('[data-refresh-status]'), search = document.querySelector('[data-home-search]');
  const filter = document.querySelector('[data-home-filter]'), filterStatus = document.querySelector('[data-filter-status]');
  const loading = document.querySelector('[data-home-loading]');
  const loadingTitle = document.querySelector('[data-loading-title]'), loadingDetail = document.querySelector('[data-loading-detail]');
  const loadingSummary = document.querySelector('[data-loading-summary]');
  let journal=null, answerRefresh = false, stopped = false;
  const answeredProjects = new Set();
  const workspace = startPlateWorkspace({root,document});
  let state = createPollState(root.dataset.cursor,{loadingOnly:root.dataset.initialLoading === 'true'}), timer = null, controller = null, generation = 0;
  state = transitionPoll(state,{ type:'visibility',visible:!document.hidden });
  function announce() {
    if (loading) {
      const activity = homeLoadingStatus(state);
      // Once loaded, routine background checks must not shift the page under the reader.
      loading.hidden = state.denied || !(state.status === 'stale' || loading.dataset.waiting === 'true');
      loading.dataset.active = String(activity.active);
      if (loadingTitle && loadingTitle.textContent !== activity.title) loadingTitle.textContent = activity.title;
      if (loadingDetail && loadingDetail.textContent !== activity.detail) loadingDetail.textContent = activity.detail;
    }
    if (message) message.textContent = state.inFlight ? 'Checking for source updates…' : state.notice || 'Updates are checked while this page is visible.';
    if (apply) { apply.hidden = !state.pending; apply.textContent = `${state.updates} new ${state.updates === 1 ? 'update' : 'updates'} · Show changes`; }
    if (refresh) { refresh.disabled = state.inFlight || state.denied; refresh.textContent = state.inFlight ? 'Checking sources…' : 'Refresh sources'; }
    message?.closest('.refresh-notice')?.setAttribute('data-stale', String(state.status === 'stale'));
  }
  function schedule(delay = state.delay) {
    if (timer) window.clearTimeout(timer);
    timer = !state.visible || state.denied ? null : window.setTimeout(() => poll(answerRefresh || state.needsFresh), delay);
  }
  function renderStart(snapshot) {
    const start = document.querySelector('[data-review-start-slot]');
    if (start && renderReviewStart && snapshot) start.innerHTML = snapshot.projectWorkspace ? '' : renderReviewStart(snapshot,{projectId});
  }
  function filterView() {
    let shown = 0, total = 0;
    for (const card of root.querySelectorAll('[data-filterable]')) {
      const match = matchesHomeFilter(card.dataset, search?.value ?? '', filter?.value ?? 'all') && (!card.dataset.changeTime || !journal || journal.matches(card.dataset.changeTime));
      card.hidden = !match; total++; if (match) shown++;
    }
    const active = Boolean(search?.value.trim()) || Boolean(filter?.value && filter.value !== 'all');
    if (filterStatus) { filterStatus.hidden = !active; filterStatus.textContent = `${shown} of ${total} items match. Source problems stay listed under Your plates.`; }
  }
  async function poll(fresh = false) {
    if (state.inFlight || !state.visible || state.denied || stopped) return;
    fresh ||= answerRefresh;
    if (timer) window.clearTimeout(timer);
    const requestGeneration = ++generation;
    state = transitionPoll(state,{type:'start'});
    const requestController = new AbortController(); controller = requestController;
    announce();
    const url = new URL(endpoint,window.location.origin);
    if (state.cursor && !answerRefresh && !(fresh && state.needsFresh)) url.searchParams.set('cursor',state.cursor);
    if (fresh) url.searchParams.set('fresh','1');
    try {
      // Fleet refreshes are bounded to a few projects. Read the answered project first
      // so a card late in a large fleet cannot keep its pre-answer chip indefinitely.
      for (const id of [...answeredProjects]) {
        if (!projectId) {
          const result = await fetchHomeResponse({ fetch, url: new URL(`/api/projects/${encodeURIComponent(id)}/home?fresh=1`, window.location.origin).href, headers: { Accept: 'application/json' }, controller: requestController });
          if (requestGeneration !== generation) return;
          if ([401, 403, 404].includes(result.status)) { state = transitionPoll(state, { type: 'response', status: result.status }); return; }
          if (result.status !== 200 || result.snapshot?.schema !== 1 || !Array.isArray(result.snapshot.projects)) throw new Error('Project refresh unavailable');
        }
        answeredProjects.delete(id);
      }
      const headers = { Accept:'application/json' };
      if (state.cursor && !fresh) headers['If-None-Match'] = `"${state.cursor}"`;
      const {status,snapshot} = await fetchHomeResponse({fetch,url:url.href,headers,controller:requestController});
      if (requestGeneration !== generation) return;
      state = transitionPoll(state,{type:'response',status: answerRefresh && status === 304 ? 503 : status,snapshot,fresh});
      if (status === 200 && state.status === 'current' && loading && loadingSummary) {
        const summary = homeLoadingSummary(snapshot,{projectId});
        loading.dataset.waiting = String(summary.waiting);
        if (loadingSummary.innerHTML !== summary.html) loadingSummary.innerHTML = summary.html;
      }
      // The Start panel is a count and a link, not the reviewed view: it follows every successful read (phase 174).
      if (status === 200 && state.status === 'current' && state.pending === snapshot) renderStart(snapshot);
      if ((answerRefresh || answers?.awaitingSources().length) && status === 200 && state.status === 'current') {
        // An answer owns this refresh: update chips and cards together, without a second Show changes click.
        state.pending = snapshot;
        applyUpdates({ preserveDrafts: true });
        // The requested read finished. Suppressing a settled card is not another pending request.
        answerRefresh = false;
        const waiting = (answers?.awaitingSources().length ?? 0) > 0;
        const stale = waiting || snapshot.projects.some(p => ['stale', 'loading', 'unavailable', 'partial'].includes(p.state));
        state = { ...state, status: stale ? 'stale' : 'current', notice: waiting ? 'Answer recorded. Waiting for the project sources to catch up; this view may be stale.' : stale ? 'Home refreshed. Some project sources are still unavailable or stale.' : 'Home updated from the latest available sources.' };
      } else if (canHydrateInitial(state)) applyUpdates({automatic:true});
      if (status === 304 && state.status === 'current' && answers?.awaitingSources().length) {
        state = { ...state, status: 'stale', notice: 'Answer recorded. Waiting for the project sources to catch up; this view may be stale.' };
      }
    } catch (error) {
      if (requestGeneration !== generation) return;
      state = transitionPoll(state,{type:'response',status:503});
    } finally {
      if (requestGeneration === generation) {
        controller = null;
        if (state.denied) {
          root.replaceChildren();
          const main = document.querySelector('main');
          if (main) clearPrivateView({root:main,document,window});
          document.querySelector('nav[aria-label="Account"]')?.remove();
        } else { announce(); schedule(state.needsFresh ? 0 : state.delay); }
      }
    }
  }
  function applyUpdates(options = {}) {
    if (!state.pending || state.denied) return;
    const open = [...root.querySelectorAll('details[open][data-detail]')].map(element => element.dataset.detail);
    const active = document.activeElement, focusKey = active?.dataset?.focus, focusWasInside = root.contains(active);
    const scroll = { left:window.scrollX,top:window.scrollY };
    const retained = answers?.capture();
    // Retain live forms, including in-flight previews and text selection, across automatic redraws.
    const forms = options.preserveDrafts || options.automatic ? [...root.querySelectorAll('[data-ask-form]')] : [];
    const selection = forms.some(form => form.contains(active)) && typeof active?.selectionStart === 'number'
      ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    root.innerHTML = renderHomeSnapshot(state.pending,{projectId}); root.dataset.cursor = state.pending.cursor;
    const replacements = [...root.querySelectorAll('[data-ask-form]')];
    for (const [index, form] of forms.entries()) {
      if (replacements[index]) replacements[index].replaceWith(form);
      else root.append(form);
    }
    answers?.sync(retained); needsCount(state.pending);
    workspace?.sync();
    renderStart(state.pending);
    for (const detail of root.querySelectorAll('details[data-detail]')) if (open.includes(detail.dataset.detail)) detail.open = true;
    state = transitionPoll(state,{type:'apply',automatic:options?.automatic === true}); root.dataset.initialLoading = String(state.loadingOnly); announce(); filterView();
    const restore = forms.some(form => form.contains(active)) && root.contains(active) ? active : focusKey ? [...root.querySelectorAll('[data-focus]')].find(element => element.dataset.focus === focusKey && !element.closest('[hidden]')) : null;
    if (restore) { restore.focus({preventScroll:true}); if (restore === active && selection) restore.setSelectionRange(selection.start, selection.end, selection.direction); }
    else if (active === apply || focusWasInside) refresh?.focus({preventScroll:true});
    window.scrollTo(scroll);
  }
  function visibility() {
    state = transitionPoll(state,{type:'visibility',visible:!document.hidden});
    if (document.hidden) { generation++; controller?.abort(); controller = null; if (timer) window.clearTimeout(timer); }
    else schedule(0);
    announce();
  }
  // Home's cards (phase 196): answered in place through the docket's answer path; the header's count follows each applied update.
  const refreshAfterAnswer = key => {
    if (stopped || state.denied) return;
    answerRefresh = true; answeredProjects.add(key.split(':')[0]);
    // Supersede any read that began before the answer. Its cached result cannot be applied as current.
    generation++; controller?.abort(); controller = null;
    state = { ...state, inFlight: false, pending: null, updates: 0, status: 'stale', notice: 'Updating Home after your answer…' };
    announce();
    return poll(true);
  };
  const answers = startCardAnswers({ document, window, root, fetch, onRefresh: refreshAfterAnswer });
  const needsCount = snapshot => { const el = document.querySelector('[data-needs-count]'), cards = snapshot?.home?.glance?.cards; if (!el || !Array.isArray(cards)) return; el.textContent = `${cards.length} need you`; el.hidden = !cards.length; };
  // The ask box (phase 166): preview through the ask route, then publish only the approved preview through the night-plan writer.
  const ask = startAsk({ document, root, fetch, renderAskResult, renderAskOperation });
  journal=startJournalPreference({document,window,onChange:filterView});
  filterView(); announce();
  const refreshClick = () => poll(true);
  refresh?.addEventListener('click',refreshClick); apply?.addEventListener('click',applyUpdates);
  search?.addEventListener('input',filterView); filter?.addEventListener('change',filterView);
  document.addEventListener('visibilitychange',visibility); schedule(0);
  return { poll, stop() { stopped = true; workspace?.stop(); ask?.stop(); answers?.stop(); journal?.stop(); generation++; controller?.abort(); if (timer) window.clearTimeout(timer); document.removeEventListener('visibilitychange',visibility); refresh?.removeEventListener('click',refreshClick); apply?.removeEventListener('click',applyUpdates); search?.removeEventListener('input',filterView); filter?.removeEventListener('change',filterView); } };
}
// ---- answering a card in place (plates phase 196) --------------------------------------
// A tap holds the answer for HOLD_MS with Undo (the review session's hold), then
// sends it through createWebSender: POST /api/home/answer, and for a previewed
// writer that exact preview through its apply route, with the page's CSRF token.
// The server keeps every protection it has: session, origin, CSRF, the owner's
// access to the plate, the item still waiting, the answer still offered.
const PREVIEWED_WRITERS = ['walk decide', 'walk done', 'loose-ends mark', 'pr merge'];
/**
 * One controller for every card on the page. states: key → { state: 'held' |
 * 'sending' | 'settled' | 'put-off' | 'failed' | 'uncertain', answer, reason?, link?, until? }.
 * choose(key, answer, { why }) returns { held } or { error: 'why_required' | 'unavailable' | 'busy', answer }.
 */
export function createCardAnswers({ send, prepare = null, timers = { setTimeout, clearTimeout }, holdMs = HOLD_MS, onChange = () => {} }) {
  // attempt: each choose gets its own token; a preview that comes back for an attempt since undone or replaced is ignored.
  const states = new Map(), holds = new Map();
  let attempts = 0;
  async function fire(key) {
    const hold = holds.get(key); if (!hold) return;
    holds.delete(key); timers.clearTimeout(hold.timer);
    states.set(key, { state: 'sending', answer: hold.answer, source: hold.source }); onChange(key);
    let result;
    try { result = await send(hold); } catch { result = { state: 'failed', reason: reviewMessage('request_unavailable') }; }
    states.set(key, { ...result, state: ['settled', 'put-off', 'uncertain'].includes(result?.state) ? result.state : 'failed', answer: hold.answer, source: hold.source, ...(result?.state ? {} : { reason: reviewMessage() }) });
    await onChange(key, 'answered');
  }
  const startHold = (key, hold, consequence = null) => {
    hold.timer = timers.setTimeout(() => fire(key), holdMs);
    holds.set(key, hold); states.set(key, { state: 'held', answer: hold.answer, source: hold.source, ...(consequence ? { consequence } : {}) }); onChange(key);
  };
  return {
    state: key => states.get(key) ?? null,
    /**
     * Answer a card. source: the card's fingerprint as drawn (data-source), so a refresh can tell an answered card
     * from one whose source changed. A previewed writer's preview is asked for first (it writes nothing); its
     * consequence is shown on the card and only then does the hold (and its Undo) start. Returns { held } |
     * { preparing: Promise<{ held } | { error }> } | { error: 'why_required' | 'unavailable' | 'busy', answer }.
     */
    choose(key, answer, { why = '', source = null } = {}) {
      const now = states.get(key)?.state;
      if (['preparing', 'held', 'sending', 'settled', 'put-off', 'uncertain'].includes(now)) return { error: 'busy', answer };
      if (answer.unavailable) return { error: 'unavailable', answer };
      const line = String(why ?? '').replace(/\s+/g, ' ').trim();
      if ((answer.needsWhy ?? 'never') !== 'never' && !line) return { error: 'why_required', answer };
      const hold = { entry: { key }, answer, why: line, until: undefined, prepared: null, timer: null, source };
      if (!(prepare && PREVIEWED_WRITERS.includes(answer.writer))) { startHold(key, hold); return { held: hold }; }
      const attempt = ++attempts;
      states.set(key, { state: 'preparing', answer, source, attempt }); onChange(key);
      const preparing = Promise.resolve().then(() => prepare(hold)).catch(() => ({ refusal: reviewMessage('request_unavailable') })).then(prepared => {
        if (states.get(key)?.state !== 'preparing' || states.get(key)?.attempt !== attempt) return { error: 'cancelled' };
        if (!prepared?.preview) { states.set(key, { state: 'failed', answer, source, reason: prepared?.refusal ?? reviewMessage() }); onChange(key); return { error: 'refused' }; }
        // The exact preview the owner saw is what the hold applies (createWebSender.send reads hold.prepared).
        hold.prepared = Promise.resolve(prepared);
        startHold(key, hold, prepared.summary || 'The preview is ready; its write is applied when the hold ends.');
        return { held: hold };
      });
      return { preparing };
    },
    /** Undo a held (or still preparing) answer: nothing is written, and the card's answers come back. */
    undo(key) {
      const hold = holds.get(key);
      if (!hold && states.get(key)?.state !== 'preparing') return false;
      if (hold) { timers.clearTimeout(hold.timer); holds.delete(key); }
      states.delete(key); onChange(key, 'undone'); return true;
    },
    /** Whether an answer would be lost by leaving now: one preparing, held or in flight. */
    pending: () => [...states.values()].some(e => ['preparing', 'held', 'sending'].includes(e.state)),
    /** Send every held answer now (the page is going away). */
    flush() { for (const key of [...holds.keys()]) fire(key); },
    /**
     * After a refresh (present: key → the card's fingerprint as now drawn): a settled answer whose card is still drawn
     * with the same source stays answered (its answers stay hidden: the source has not caught up yet); one whose
     * source changed, or whose card is gone, is forgotten, so a changed card shows fresh. Held and in-flight answers stay.
     */
    reconcile(present) {
      for (const [key, entry] of [...states]) {
        // An outcome not known (uncertain) is never forgotten or re-enabled by a refresh: it is checked through its operation.
        if (['preparing', 'held', 'sending', 'uncertain'].includes(entry.state)) continue;
        if (!present.has(key) || (entry.source !== null && entry.source !== undefined && present.get(key) !== entry.source)) states.delete(key);
      }
    },
    keys: () => [...states.keys()],
  };
}
/** beforeunload while an answer is pending: flush what is held and ask the browser to confirm leaving. */
export const leaveGuard = controller => event => {
  if (!controller.pending()) return false;
  controller.flush();
  event.preventDefault?.(); event.returnValue = '';
  return true;
};
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeLink = v => typeof v === 'string' && /^(?:\/[^/\\]|https:\/\/github\.com\/)/.test(v) ? v : null;
/** A card's status line for a state, browser-safe and pure. */
export function cardStatus(entry, project = '') {
  if (!entry) return '';
  const label = `<strong>${escapeHtml(entry.answer?.label)}</strong>`, link = safeLink(entry.link);
  if (entry.state === 'preparing') return `<p>Checking what ${label} will do… <button type="button" class="quiet" data-undo>Undo</button></p>`;
  if (entry.state === 'held') return `<p>${label} · ${project ? `recording in ${escapeHtml(project)}` : 'ready to record'}${entry.consequence ? ` · ${escapeHtml(entry.consequence)}` : ''} · <button type="button" class="quiet" data-undo>Undo</button></p>`;
  if (entry.state === 'sending') return `<p>Sending your answer: ${label}…</p>`;
  if (entry.state === 'settled') return `<p>You answered: ${label}.${link ? ` <a href="${escapeHtml(link)}">See the receipt →</a>` : ''}</p>`;
  if (entry.state === 'put-off') return `<p>You answered: ${label}. It comes back${entry.until ? ` on ${escapeHtml(entry.until)}` : ' later'}.</p>`;
  if (entry.state === 'uncertain') return `<p data-error>${escapeHtml(entry.reason)}${link ? ` <a href="${escapeHtml(link)}">Check the operation →</a>` : ''}</p>`;
  return `<p data-error>Not answered: ${escapeHtml(entry.reason)}</p>`;
}
/** The DOM half: answer buttons, the why line, Undo, and the Deploy card's copy button. */
export function startCardAnswers({ document, window, root, fetch, onRefresh = () => {} }) {
  if (typeof root?.addEventListener !== 'function') return null;
  const csrf = document.querySelector('form[action="/api/auth/logout"] input[name="csrf"]')?.value ?? '';
  // keepalive: an answer flushed as the page goes away still reaches the server.
  const sender = createWebSender({ fetch: (url, options = {}) => fetch(url, { ...options, keepalive: true }), csrf });
  const cardOf = key => [...root.querySelectorAll('[data-card]')].find(el => el.dataset.card === key) ?? null;
  const paint = key => {
    const card = cardOf(key); if (!card) return;
    const entry = controller.state(key), status = card.querySelector('[data-card-status]'), actions = card.querySelector('[data-card-actions]');
    if (status) status.innerHTML = cardStatus(entry, key.split(':')[0]);
    const body = card.querySelector('.glance-card-body');
    if (body) body.hidden = !!entry && entry.state !== 'failed';
    card.hidden = ['settled', 'put-off'].includes(entry?.state);
    if (actions) actions.hidden = !!entry && entry.state !== 'failed';
  };
  const controller = createCardAnswers({ send: sender.send, prepare: sender.prepare, timers: { setTimeout: (f, ms) => window.setTimeout(f, ms), clearTimeout: id => window.clearTimeout(id) }, onChange: (key, event) => { paint(key); if (event) return onRefresh(key); } });
  const answerOf = button => ({ id: button.dataset.answer, label: button.dataset.label, needsWhy: button.dataset.needsWhy || 'never', writer: button.dataset.writer, ...(button.dataset.unavailable ? { unavailable: { reason: button.dataset.unavailable } } : {}) });
  const say = (card, html) => { const status = card.querySelector('[data-card-status]'); if (status) status.innerHTML = html; };
  const choose = (card, answer, why) => {
    const result = controller.choose(card.dataset.card, answer, { why, source: card.dataset.source ?? null });
    if (result.error === 'unavailable') say(card, `<p data-error>${escapeHtml(answer.unavailable.reason)} More says where to answer it.</p>`);
    if (result.error === 'why_required') {
      say(card, `<p data-error>${escapeHtml(answer.label)} needs an explanation. Add it in the note field, then choose ${escapeHtml(answer.label)}.</p>`);
      card.querySelector('[data-card-note]')?.focus();
    }
    return result;
  };
  const onClick = async event => {
    const target = event.target?.closest?.('button'); if (!target) return;
    const assign = target.closest('.simple-assign');
    if (assign && root.contains(assign) && target.matches('[data-copy]')) {
      const status = assign.querySelector('[data-copy-status]');
      try { await window.navigator.clipboard.writeText(target.dataset.copy); if (status) status.textContent = 'Copied. Run the preview in the project’s checkout.'; }
      catch { if (status) status.textContent = 'Copy the preview command above and run it in the project’s checkout.'; }
      return;
    }
    const card = target.closest('[data-card]'); if (!card || !root.contains(card)) return;
    if (target.matches('[data-copy]')) {
      const command = target.dataset.copy;
      try { await window.navigator.clipboard.writeText(command); say(card, '<p>Copied. Run it in the project\'s checkout on your Mac.</p>'); }
      catch { const code = card.querySelector('[data-deploy-command]'); if (code) window.getSelection?.()?.selectAllChildren(code); say(card, '<p>Copy it from the line above, then run it in the project\'s checkout on your Mac.</p>'); }
      return;
    }
    if (target.matches('[data-undo]')) { controller.undo(card.dataset.card); card.querySelector('[data-answer]')?.focus(); return; }
    if (target.matches('[data-answer]')) choose(card, answerOf(target), card.querySelector('[data-card-note]')?.value ?? '');
  };
  const away = () => controller.flush(), guard = leaveGuard(controller);
  root.addEventListener('click', onClick); window.addEventListener?.('pagehide', away); window.addEventListener?.('beforeunload', guard);
  // After a refresh re-renders the cards: forget answers whose card is gone or changed, then repaint the rest.
  const capture = () => [...root.querySelectorAll('[data-card]')].map(card => ({ card, note: card.querySelector('[data-card-note]')?.value }));
  const sync = (retained = []) => {
    const present = new Map([...root.querySelectorAll('[data-card]')].map(el => [el.dataset.card, el.dataset.source ?? null]));
    controller.reconcile(present);
    for (const { card, note } of retained) {
      const key = card.dataset.card, entry = controller.state(key), current = cardOf(key);
      if (['preparing', 'held', 'sending', 'uncertain'].includes(entry?.state)) {
        if (current) current.replaceWith(card);
        else {
          let section = root.querySelector('.glance-needs');
          if (!section) {
            section = document.createElement('section'); section.className = 'home-section glance-needs';
            section.id = 'needs-you'; section.setAttribute('aria-labelledby', 'needs-you-title');
            const heading = document.createElement('h2'); heading.id = 'needs-you-title'; heading.textContent = 'Needs you';
            section.append(heading); root.prepend(section);
          }
          let list = section.querySelector('.glance-cards');
          if (!list) { list = document.createElement('ol'); list.className = 'glance-cards'; section.append(list); }
          section.querySelector('.glance-empty')?.remove(); list.append(card);
        }
      } else if (current?.dataset.source === card.dataset.source && note !== undefined) {
        const field = current.querySelector('[data-card-note]'); if (field) field.value = note;
      }
    }
    for (const key of controller.keys()) paint(key);
  };
  return { controller, capture, sync, awaitingSources: () => controller.keys().filter(key => ['settled', 'put-off'].includes(controller.state(key)?.state)), stop() { away(); root.removeEventListener('click', onClick); window.removeEventListener?.('pagehide', away); window.removeEventListener?.('beforeunload', guard); } };
}
/** The ask's command, shell-quoted as the model's askCommand does. */
export const askCommandText = (command, ask) => String(command).replace('{ask}', ask ? `'${String(ask).replace(/'/g, `'\\''`)}'` : '"<ask>"');
/** The ask box's browser half: preview, then apply only that preview's id after the owner ticks approval. */
export function startAsk({ document, root, fetch, renderAskResult, renderAskOperation }) {
  if (!renderAskResult || typeof root.addEventListener !== 'function') return null;
  const csrf = () => document.querySelector('form[action="/api/auth/logout"] input[name="csrf"]')?.value ?? '';
  const post = async (url, body) => { const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csrf: csrf(), ...body }) }); return { status: response.status, data: await response.json().catch(() => null) }; };
  const formOf = target => target?.closest?.('[data-ask-form]');
  const sync = form => { const d = form.querySelector('input[name="destination"]:checked'), code = form.querySelector('[data-ask-command]'); if (d && code) code.textContent = askCommandText(d.dataset.command, form.querySelector('textarea[name="ask"]')?.value.replace(/\s+/g, ' ').trim()); };
  const onInput = event => { const form = formOf(event.target); if (form) sync(form); if (event.target?.matches?.('[data-ask-approve]')) { const button = formOf(event.target)?.querySelector('[data-ask-apply]'); if (button) button.disabled = !event.target.checked; } };
  const onSubmit = async event => {
    const form = formOf(event.target); if (!form) return; event.preventDefault();
    const out = form.querySelector('[data-ask-result]'), plate = form.querySelector('[name="plate"]')?.value, text = form.querySelector('textarea[name="ask"]')?.value ?? '';
    const destination = form.querySelector('input[name="destination"]:checked')?.value;
    if (!text.trim()) { out.textContent = 'Write the ask first.'; return; }
    out.textContent = 'Preparing the preview…';
    const { status, data } = await post(`/api/projects/${encodeURIComponent(plate)}/ask/preview`, { ask: text, destination }).catch(() => ({ status: 503, data: null }));
    out.innerHTML = status === 200 ? renderAskResult(data) : `<p>The preview was refused${data?.error ? ` (${String(data.error).replace(/[<>&"']/g, '')})` : ''}. Nothing was queued.</p>`;
    out.dataset.project = plate;
  };
  const onClick = async event => {
    if (!event.target?.matches?.('[data-ask-apply]')) return;
    const result = event.target.closest('[data-ask-state="preview"]'), out = event.target.closest('[data-ask-result]');
    if (!result || !result.querySelector('[data-ask-approve]')?.checked) return;
    event.target.disabled = true;
    const body = { previewId: result.dataset.previewId, ...(result.dataset.public === 'true' ? { publicAcknowledgement: result.dataset.digest } : {}) };
    const { status, data } = await post(`/api/projects/${encodeURIComponent(out.dataset.project)}/night-plan/apply`, body).catch(() => ({ status: 503, data: null }));
    result.insertAdjacentHTML('beforeend', status === 200 && renderAskOperation ? renderAskOperation(data) : '<p>Not queued: the publication was refused or could not be confirmed.</p>');
  };
  root.addEventListener('input', onInput); root.addEventListener('change', onInput); root.addEventListener('submit', onSubmit); root.addEventListener('click', onClick);
  return { stop() { root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('click', onClick); } };
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('/assets/home-views.mjs').then(({renderHomeSnapshot,renderReviewStart,renderAskResult,renderAskOperation}) => startHomeClient({document,window,fetch:window.fetch.bind(window),renderHomeSnapshot,renderReviewStart,renderAskResult,renderAskOperation})).catch(() => {
    const message = document.querySelector('[data-refresh-status]');
    if (message) message.textContent = 'Live updates could not start. Reload this page to refresh its sources.';
  });
}
