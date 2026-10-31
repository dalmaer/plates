// Web Push with node:crypto only: VAPID (RFC 8292, ES256 JWT) and payload
// encryption (RFC 8291, aes128gcm per RFC 8188). The network is injected.
import { ECDH, createECDH, createPrivateKey, createPublicKey, createCipheriv, hkdfSync, randomBytes, sign } from 'node:crypto';
import { record, WebError } from './common.mjs';

const b64 = buffer => Buffer.from(buffer).toString('base64url');
const fromB64 = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, 'base64url') : null;
const ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'); // P-256 group order

// Known browser push services. Anything else is refused, so a stored
// subscription can never point the server at an arbitrary host.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/];

/** A subscription as the browser's PushSubscription.toJSON() gives it, checked and reduced. */
export function validSubscription(value) {
  if (!record(value) || !record(value.keys) || typeof value.endpoint !== 'string' || value.endpoint.length > 1024) return null;
  if (Object.keys(value).some(key => !['endpoint', 'keys', 'expirationTime'].includes(key))) return null;
  if (!(value.expirationTime === undefined || value.expirationTime === null || Number.isSafeInteger(value.expirationTime))) return null;
  if (Object.keys(value.keys).length !== 2) return null;
  let url; try { url = new URL(value.endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.href !== value.endpoint
    || !PUSH_HOSTS.some(host => host.test(url.hostname))) return null;
  const p256dh = fromB64(value.keys.p256dh), auth = fromB64(value.keys.auth);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4 || !auth || auth.length !== 16) return null;
  try { ECDH.convertKey(p256dh, 'prime256v1', undefined, undefined, 'uncompressed'); } catch { return null; }
  return { endpoint: value.endpoint, keys: { p256dh: b64(p256dh), auth: b64(auth) } };
}

/**
 * The instance's VAPID key, derived from its existing encryption key with
 * HKDF under its own label: no new secret, and a rotated encryption key
 * rotates it (old subscriptions then fail with 403 and the owner subscribes again).
 */
export function vapidKeys(encryptionKey) {
  for (let counter = 0; counter < 16; counter++) {
    const d = Buffer.from(hkdfSync('sha256', encryptionKey, 'plates-web-push', `vapid-p256-v1:${counter}`, 32));
    const scalar = BigInt(`0x${d.toString('hex')}`);
    if (scalar === 0n || scalar >= ORDER) continue;
    const ecdh = createECDH('prime256v1'); ecdh.setPrivateKey(d);
    const publicKey = ecdh.getPublicKey();
    const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: b64(d), x: b64(publicKey.subarray(1, 33)), y: b64(publicKey.subarray(33)) } });
    return { publicKey: b64(publicKey), privateKey };
  }
  throw new WebError('push_key_unavailable');
}

export function publicKeyObject(publicKey) {
  const raw = fromB64(publicKey);
  if (!raw || raw.length !== 65) throw new WebError('invalid_push_key');
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64(raw.subarray(1, 33)), y: b64(raw.subarray(33)) } });
}

/** The Authorization header value for one push request (exp at most 24h; 12h here). */
export function vapidAuthorization({ endpoint, subject, keys, now = Date.now() }) {
  const audience = new URL(endpoint).origin;
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64(signature)}, k=${keys.publicKey}`;
}

/**
 * RFC 8291 encryption to one subscription: a single aes128gcm record.
 * salt and serverKey (an ECDH private key) are injectable for test vectors only.
 */
export function encryptPayload(plaintext, { p256dh, auth }, { salt = randomBytes(16), serverKey = null, recordSize = 4096 } = {}) {
  const data = Buffer.from(plaintext), receiver = fromB64(p256dh), secret = fromB64(auth);
  if (!receiver || receiver.length !== 65 || !secret || secret.length !== 16 || salt.length !== 16) throw new WebError('invalid_push_subscription');
  if (data.length + 1 + 16 > recordSize) throw new WebError('push_payload_limit');
  const ecdh = createECDH('prime256v1');
  if (serverKey) ecdh.setPrivateKey(serverKey); else ecdh.generateKeys();
  const sender = ecdh.getPublicKey(), shared = ecdh.computeSecret(receiver);
  const ikm = Buffer.from(hkdfSync('sha256', shared, secret, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender]), 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([data, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const size = Buffer.alloc(4); size.writeUInt32BE(recordSize);
  return Buffer.concat([salt, size, Buffer.from([sender.length]), sender, body]);
}

/**
 * Send one notification to one subscription through the injected fetch.
 * Returns { ok, status, gone }: gone (404/410) means the subscription is dead.
 */
export async function sendPush({ subscription, payload, keys, subject, fetcher, now = Date.now(), topic = null, ttl = 86400 }) {
  const valid = validSubscription(subscription);
  if (!valid) return { ok: false, status: 0, gone: true };
  const headers = { Authorization: vapidAuthorization({ endpoint: valid.endpoint, subject, keys, now }), 'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high' };
  if (topic) headers.Topic = topic;
  let response;
  try {
    response = await fetcher(valid.endpoint, { method: 'POST', headers, body: encryptPayload(JSON.stringify(payload), valid.keys), redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch { return { ok: false, status: 0, gone: false }; }
  await response.body?.cancel().catch(() => {});
  return { ok: response.status >= 200 && response.status < 300, status: response.status, gone: [404, 410].includes(response.status) };
}
