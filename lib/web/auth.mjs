import { nameRow, writeName } from '../names.mjs';
import { aliasValue } from './name-transition.mjs';
import {authEpoch,matchesAuthEpoch,recoveryQuarantined} from './recovery.mjs';
import {describeRoute} from './navigation-routes.mjs';
import { random, hash, equal, opaque, WebError } from './common.mjs';

// Both readers; writers follow the exact table rows. Phase127 moved them to dual
// (Plates writers) after the compatibility baseline (held rows, both readers);
// rollback to that baseline still consumes Plates cookies.
const COOKIE_IDS = { session: 'web:__Host-keel-session', login: 'web:__Host-keel-login', oauth: 'web:__Host-keel-oauth' };
export const COOKIES = Object.fromEntries(Object.entries(COOKIE_IDS).map(([kind, id]) => [kind, writeName(id)]));
const cookieNames = Object.values(COOKIE_IDS).flatMap(id => { const row = nameRow(id); return [row.plates, row.keel]; });
const clearCookies = (...kinds) => kinds.flatMap(kind => { const row = nameRow(COOKIE_IDS[kind]); return [row.plates, row.keel].map(name => cookie(name, '', 0)); });
export const cookie = (name, value, seconds) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
// A fresh flow replaces the alternate alias, including after rollback. This is
// not a migration of a live cookie and never runs on ordinary authorized reads.
export function issueCookies(kind, value, seconds) {
  const row = nameRow(COOKIE_IDS[kind]);
  const writer = writeName(row.id), alternate = writer === row.plates ? row.keel : row.plates;
  return [cookie(writer, value, seconds), cookie(alternate, '', 0)];
}
export function readCookies(request) {
  const result = {};
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 8192) throw new WebError('invalid_request', 400);
  for (const part of header.split(';')) {
    const index = part.indexOf('='); if (index < 0) continue;
    const key = part.slice(0, index).trim(), value = part.slice(index + 1).trim();
    if (cookieNames.includes(key)) {
      if (Object.hasOwn(result, key) || !opaque(value)) throw new WebError('invalid_request', 400);
      result[key] = value;
    }
  }
  const normalized = {};
  for (const [kind, id] of Object.entries(COOKIE_IDS)) {
    const value = aliasValue(id, name => result[name]);
    if (value !== undefined) normalized[COOKIES[kind]] = value;
  }
  return normalized;
}
export const returnPath = value => describeRoute(value)!==null;
export function mutationOrigin(request, origin) {
  if (request.headers.get('origin') !== origin || !['same-origin', null].includes(request.headers.get('sec-fetch-site'))) throw new WebError('invalid_origin', 403);
}
// Phase 154: a renewable session lasts at most a year from sign-in and ends
// after 30 days without use. A session without a refresh token (an App without
// expiring user tokens, or one created before phase 154) keeps the earlier
// bounds: its token's own lifetime in all, thirty minutes idle.
export const SESSION_ABSOLUTE_SECONDS = 365 * 24 * 60 * 60;
export const SESSION_IDLE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_LEGACY_IDLE_SECONDS = 1800;
// The request that sees the access token within five minutes of expiry renews it.
export const TOKEN_RENEW_WITHIN_SECONDS = 300;
// A renewal claim fences one refresh token's single use across instances; it
// lapses after two minutes if its holder never finishes. A caller whose token
// has already lapsed waits up to about three seconds for the holder.
const RENEWAL_CLAIM_SECONDS = 120, RENEWAL_WAITS = 10, RENEWAL_WAIT_MS = 300;
// Why a sign-in ended, as far as the server can know. The page words live in views.
export const SIGN_IN_ENDED = Object.freeze(['ended', 'year', 'github', 'access', 'signed-out']);
const ended = reason => Object.assign(new WebError('sign_in_required', 401), { reason });
const renewable = value => typeof value?.refreshToken === 'string';
// Sessions written before phase 154 carry no tokenExpiry: their token lived to absoluteExpiry.
const tokenExpiry = value => Number.isSafeInteger(value?.tokenExpiry) ? value.tokenExpiry : value?.absoluteExpiry;
const sealedFields = ['userId', 'token', 'csrf', 'absoluteExpiry', 'scope', 'authEpoch', 'tokenExpiry', 'refreshToken', 'refreshExpiry'];
const sessionValue = value => Object.fromEntries(sealedFields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
export function createAuth(config, store, github, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let pendingSessionAlias = null;
  const renewals = new Map();
  // The same session: a renewal rotates only the token pair, never these.
  const sameSession = (value, current, epoch) => matchesAuthEpoch(config,value,epoch)
    && ['userId','csrf','scope','absoluteExpiry'].every(key => value?.[key] === current[key]);
  const idleSeconds = value => Math.min(renewable(value) ? SESSION_IDLE_SECONDS : SESSION_LEGACY_IDLE_SECONDS,
    Math.floor((value.absoluteExpiry - now()) / 1000));
  async function session(request, refresh = false) {
    const epoch = authEpoch(config);
    const raw = readCookies(request)[COOKIES.session];
    if (!raw) throw new WebError('sign_in_required', 401);
    const key = hash(raw), stored = await store.read('session', key);
    if (!stored || !matchesAuthEpoch(config,stored.value,epoch) || stored.value.absoluteExpiry <= now()) {
      await store.revoke(key);
      throw ended(stored && matchesAuthEpoch(config,stored.value,epoch) && renewable(stored.value) ? 'year' : 'ended');
    }
    if (refresh) {
      const renewed=await store.renew(key,stored.version,Math.max(1,idleSeconds(stored.value)));
      if(!renewed||!sameSession(renewed.value,stored.value,epoch))throw ended('ended');
    }
    return { ...stored.value, key, version: stored.version };
  }
  // A token within five minutes of expiry is renewed by exactly one caller per
  // refresh token: in this instance through one shared promise, across instances
  // through a claim CAS-written into the session record with the read version.
  // A caller that loses re-reads and uses the winner's pair, or the old token
  // while it is still valid; it never spends that refresh token itself.
  async function fresh(request) {
    const value = await session(request);
    if (!renewable(value) || tokenExpiry(value) - now() > TOKEN_RENEW_WITHIN_SECONDS * 1000) return { value };
    const shared = hash(`session-refresh:${value.refreshToken}`);
    let pending = renewals.get(shared);
    if (!pending) {
      pending = renew(value, authEpoch(config)).finally(() => renewals.delete(shared));
      renewals.set(shared, pending);
    }
    return pending;
  }
  const located = (latest, key) => ({ ...latest.value, key, version: latest.version });
  const claimed = value => Number.isSafeInteger(value.renewing) && value.renewing > now();
  async function winner(value, epoch, retried = false) {
    for (let attempt = 0; ; attempt++) {
      const latest = await store.read('session', value.key);
      if (!latest || !sameSession(latest.value, value, epoch)) throw ended('ended');
      const current = located(latest, value.key);
      if (current.refreshToken !== value.refreshToken || tokenExpiry(value) > now()) return { value: current };
      // The claimant gave up or lapsed without rotating: claim it once ourselves.
      if (!claimed(current) && !retried) return renew(current, epoch, true);
      if (attempt >= RENEWAL_WAITS) throw new WebError('upstream_unavailable', 503);
      await wait(RENEWAL_WAIT_MS);
    }
  }
  async function renew(value, epoch, retried = false) {
    if (Number.isSafeInteger(value.refreshExpiry) && value.refreshExpiry <= now()) { await store.revoke(value.key); throw ended('github'); }
    if (claimed(value)) return winner(value, epoch, retried);
    const claim = await store.compareAndSwap('session', value.key, value.version,
      { ...sessionValue(value), renewing: now() + RENEWAL_CLAIM_SECONDS * 1000 }, Math.max(1, idleSeconds(value)));
    if (!claim) return winner(value, epoch, retried);
    const held = located(claim, value.key);
    let granted;
    try { granted = await github.refresh(held.refreshToken); }
    catch (error) {
      if (error instanceof WebError && error.status === 401) { await store.revoke(value.key); throw ended('github'); }
      // Unreached or failing GitHub: keep the session; the old token serves while
      // valid, and the claim lapses so a later request can try again.
      if (tokenExpiry(held) > now()) return { value: held };
      throw new WebError('upstream_unavailable', 503);
    }
    if (authEpoch(config) !== epoch) throw ended('ended');
    const at = now();
    const next = { ...sessionValue(held), token: granted.token, tokenExpiry: at + granted.seconds * 1000,
      refreshToken: granted.refreshToken, refreshExpiry: at + granted.refreshSeconds * 1000 };
    let access, failure;
    try { access = await github.access(next.token, held.userId); }
    catch (error) {
      if (error instanceof WebError && [401, 404].includes(error.status)) { await store.revoke(value.key); throw error.status === 401 ? ended('github') : error; }
      failure = error;
    }
    if (access && held.scope !== hash(JSON.stringify(access.projects))) { await store.revoke(value.key); throw ended('access'); }
    // The old refresh token is spent: keep the new pair even when the access
    // check could not finish, so the next request can check again.
    const written = await store.compareAndSwap('session', value.key, held.version, next, Math.max(1, idleSeconds(next)));
    if (!written) {
      const latest = await store.read('session', value.key);
      if (!latest || !sameSession(latest.value, value, epoch)) throw ended('ended');
      if (tokenExpiry(latest.value) > now()) return { value: located(latest, value.key) };
      throw new WebError('upstream_unavailable', 503);
    }
    if (failure) throw failure instanceof WebError ? failure : new WebError('upstream_unavailable', 503);
    return { value: located(written, value.key), access };
  }
  return {
    session,
    // Only authenticated candidate responses migrate a session. Compute the TTL
    // at response time; do not renew the store or invent a flow-cookie lifetime.
    responseCookies() {
      const pending = pendingSessionAlias;
      if (!pending || authEpoch(config) !== pending.epoch) return [];
      const seconds = Math.floor((pending.absoluteExpiry - now()) / 1000);
      return seconds > 0 ? issueCookies('session', pending.raw, seconds) : [];
    },
    // Worker callbacks resolve only an opaque server-side reference. They cannot
    // renew the owner's idle lifetime or disclose this result through a route.
    async resolveInitiator(sessionRef,actorId) {
      const epoch=authEpoch(config);
      if(recoveryQuarantined(config))throw new WebError('recovery_quarantine',503);
      if(typeof sessionRef!=='string'||!/^[a-f0-9]{64}$/.test(sessionRef)||!Number.isSafeInteger(actorId)||actorId<1)throw new WebError('sign_in_required',401);
      const stored=await store.read('session',sessionRef),current=stored?.value;
      if(!current||!matchesAuthEpoch(config,current,epoch)||current.userId!==actorId
        ||typeof current.token!=='string'||current.token.length<1||current.token.length>4096
        ||!Number.isSafeInteger(current.absoluteExpiry)||current.absoluteExpiry<=now()
        ||typeof current.scope!=='string'||!/^[a-f0-9]{64}$/.test(current.scope))throw new WebError('sign_in_required',401);
      const access=await github.access(current.token,current.userId);
      if(current.scope!==hash(JSON.stringify(access.projects)))throw new WebError('sign_in_required',401);
      // A concurrent logout or expiry wins even if provider authorization succeeded.
      const latest=await store.read('session',sessionRef);
      if(recoveryQuarantined(config)||!latest||!matchesAuthEpoch(config,latest.value,epoch)||latest.version!==stored.version||latest.value.absoluteExpiry<=now()
        ||latest.value.userId!==current.userId||latest.value.token!==current.token
        ||latest.value.scope!==current.scope)throw new WebError('sign_in_required',401);
      return {access,token:current.token};
    },
    async start(request, form) {
      mutationOrigin(request, config.origin);
      const cookies = readCookies(request);
      if (!opaque(form.csrf) || !equal(form.csrf, cookies[COOKIES.login]) || !returnPath(form.returnTo)) throw new WebError('invalid_login', 400);
      const epoch=authEpoch(config);
      // One bounded marker fences replay through either browser alias, including
      // concurrent starts on different releases. It outlives the original
      // remaining browser lifetime without extending that lifetime.
      if (!await store.create('record', hash(`login-csrf:${form.csrf}`), { consumed: true, authEpoch: epoch }, 600)) throw new WebError('invalid_login', 400);
      const state = random(), verifier = random(), browser = random();
      if (!await store.create('attempt', hash(state), { verifier, returnTo: form.returnTo, authEpoch:epoch }, 600, hash(browser))) throw new WebError('storage_conflict');
      if(authEpoch(config)!==epoch)throw new WebError('invalid_login',400);
      return { location: github.authorizeUrl(state, verifier), cookies: [...issueCookies('oauth', browser, 600), ...clearCookies('login')] };
    },
    async callback(request, url) {
      const epoch=authEpoch(config);
      for (const name of ['code', 'state']) if (url.searchParams.getAll(name).length !== 1) throw new WebError('invalid_callback', 400);
      const state = url.searchParams.get('state'), code = url.searchParams.get('code');
      const browser = readCookies(request)[COOKIES.oauth];
      if (!opaque(state) || !opaque(browser) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(code)) throw new WebError('invalid_callback', 400);
      const attempt = await store.consume(hash(state), hash(browser));
      if (!attempt || !matchesAuthEpoch(config,attempt.value,epoch) || !returnPath(attempt.value.returnTo) || !opaque(attempt.value.verifier)) throw new WebError('invalid_callback', 400);
      const granted = await github.exchange(code, attempt.value.verifier);
      if(authEpoch(config)!==epoch)throw new WebError('invalid_callback',400);
      const access = await github.access(granted.token);
      if(authEpoch(config)!==epoch)throw new WebError('invalid_callback',400);
      const raw = random(), csrf = random(), at = now(), long = typeof granted.refreshToken === 'string';
      // The refresh token stays inside this sealed record: never a cookie, URL, log or error.
      const lifetime = long ? SESSION_ABSOLUTE_SECONDS : granted.seconds;
      const value = { userId: access.userId, token: granted.token, csrf, absoluteExpiry: at + lifetime * 1000,
        scope: hash(JSON.stringify(access.projects)), authEpoch:epoch, tokenExpiry: at + granted.seconds * 1000,
        ...(long ? { refreshToken: granted.refreshToken, refreshExpiry: at + granted.refreshSeconds * 1000 } : {}) };
      if (!await store.create('session', hash(raw), value, idleSeconds(value), null, String(access.userId))) throw new WebError('storage_conflict');
      if(authEpoch(config)!==epoch){await store.revoke(hash(raw));throw new WebError('invalid_callback',400);}
      const old = readCookies(request)[COOKIES.session];
      if (old) await store.revoke(hash(old));
      if(authEpoch(config)!==epoch)throw new WebError('invalid_callback',400);
      return { location: recoveryQuarantined(config)?'/recovery':attempt.value.returnTo, cookies: [...issueCookies('session', raw, lifetime), ...clearCookies('oauth')] };
    },
    async authorized(request) {
      const epoch=authEpoch(config);
      const { value: current, access: checked } = await fresh(request);
      let access = checked;
      if (!access) {
        try { access = await github.access(current.token, current.userId); }
        catch (error) {
          if (error instanceof WebError && [401, 404].includes(error.status)) await store.revoke(current.key);
          throw error instanceof WebError && error.status === 401 ? ended('github') : error;
        }
      }
      if (!matchesAuthEpoch(config,current,epoch)) { await store.revoke(current.key); throw ended('ended'); }
      if (current.scope !== hash(JSON.stringify(access.projects))) {
        // Privilege changes invalidate the old session; a new login rotates its identifier.
        await store.revoke(current.key); throw ended('access');
      }
      const seconds = idleSeconds(current);
      if(seconds<=0)throw ended(renewable(current)?'year':'ended');
      let renewed=await store.renew(current.key,current.version,seconds);
      if(!renewed){
        // A concurrent renewal rotated the token pair: renew that version instead.
        const latest=await store.read('session',current.key);
        if(latest&&sameSession(latest.value,current,epoch))renewed=await store.renew(current.key,latest.version,seconds);
      }
      if(!renewed||!sameSession(renewed.value,current,epoch))throw ended('ended');
      const row = nameRow(COOKIE_IDS.session);
      // readCookies already rejected conflicting aliases. Inspect presence only
      // to avoid reissuing a plates-only cookie on every ordinary request.
      const names = (request.headers.get('cookie') ?? '').split(';').map(part => part.slice(0, part.indexOf('=')).trim());
      if (writeName(row.id) === row.plates && names.includes(row.keel)) {
        pendingSessionAlias = { raw: readCookies(request)[COOKIES.session], absoluteExpiry: current.absoluteExpiry, epoch };
      }
      return { ...access, csrf: current.csrf };
    },
    async logout(request, csrf, all = false) {
      mutationOrigin(request, config.origin);
      const current = await session(request);
      if (!opaque(csrf) || !equal(csrf, current.csrf)) throw new WebError('invalid_csrf', 403);
      if (all) await store.revokeActor(String(current.userId)); else await store.revoke(current.key);
      return { location: '/signin?ended=signed-out', cookies: clearCookies('session', 'login', 'oauth') };
    },
  };
}
