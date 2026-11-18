#!/usr/bin/env node
// Source-only, read-only advisory card; not a production CLI verb or hook.
import { readFile } from 'node:fs/promises';
import { assessDoor, formatDoorCard } from '../lib/night-door-policy.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
try {
  const files = args.filter(a => a !== '--json');
  if (files.length !== 1 || files[0].startsWith('-') || args.length !== files.length + Number(json)) {
    throw new Error('Usage: node scripts/assess-door.mjs <input.json> [--json]');
  }
  let input;
  try { input = JSON.parse(await readFile(files[0], 'utf8')); }
  catch { throw new Error('Unable to read or parse assessment JSON.'); }
  let result;
  try { result = assessDoor(input); }
  catch { throw new Error('Malformed assessment description.'); }
  console.log(json ? JSON.stringify(result, null, 2) : formatDoorCard(result));
} catch (error) {
  if (json) console.log(JSON.stringify({ error: error.message, authorizesExecution: false }));
  else console.error(`Door assessment refused: ${error.message}`);
  process.exitCode = 1;
}
