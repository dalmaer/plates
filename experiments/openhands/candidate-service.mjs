// Generic contained subject runner. Contains no scenario, oracle, expected result or fixture store.
// Parent owns all simulated transport and scoring; candidate cannot report a "pass".
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const write = message => process.stdout.write(JSON.stringify(message) + '\n');
const pending = new Map(); let sequence = 0;
const fetcher = (url, options = {}) => new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, { resolve, reject });
  write({ type: 'fetch', id, url: String(url), options });
});
globalThis.fetch = async () => { throw Error('candidate_default_fetch_denied'); };
const { createWebService } = await import(pathToFileURL(join(process.cwd(), 'lib/web/server.mjs')));
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.type === 'fetch-result') {
    const entry = pending.get(message.id); if (!entry) throw Error('unexpected transport response'); pending.delete(message.id);
    if (message.error) entry.reject(Error(message.error));
    else entry.resolve(new Response(message.body, { status: message.status, headers: message.headers }));
  } else if (message.type === 'request') {
    // Do not await here: the transport replies must continue to enter this loop.
    Promise.resolve().then(async () => {
      const config = { ...message.config, encryptionKey: Buffer.from(message.config.encryptionKeyBase64, 'base64') };
      delete config.encryptionKeyBase64;
      const service = createWebService(config, { fetcher, now: () => message.now });
      const response = await service(new Request(message.url, { headers: { cookie: message.cookie } }));
      write({ type: 'result', id: message.id, status: response.status, body: await response.text() });
    }).catch(error => write({ type: 'failure', id: message.id, error: String(error.message).slice(0,1000) }));
  } else throw Error('unknown command');
}
