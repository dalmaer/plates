#!/usr/bin/env node
// Source-only AGY observer. stdout is exclusively the AGY hook protocol.
import { MAX_INPUT_BYTES, observeHook, hookProtocol } from '../lib/agy-door-hook.mjs';

const args = process.argv.slice(2);
// Retain a recognized event even when subsequent option parsing fails.
let event = args[args.indexOf('--event') + 1];
try {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--event', '--root', '--state', '--json'].includes(key) || Object.hasOwn(options, key)) throw new Error();
    options[key] = key === '--json' ? true : args[++i];
  }
  event = options['--event'];
  if (!['PreToolUse', 'PostToolUse'].includes(event) || !options['--root'] || !options['--state']) throw new Error();
  const chunks = []; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) throw new Error();
    chunks.push(chunk);
  }
  const result = await observeHook({ raw: Buffer.concat(chunks).toString('utf8'), event, root: options['--root'], state: options['--state'] });
  console.log(JSON.stringify(result.protocol));
  if (result.diagnostic) console.error(result.diagnostic);
} catch {
  console.log(JSON.stringify(hookProtocol(event)));
  console.error('Malformed or oversized observer input/configuration.');
}
