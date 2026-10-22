#!/usr/bin/env node
// Local formatting only. Existing Markdown/observations/delivery intents remain
// owned by the reporting workflow. Never overwrite an existing edition.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderReportEmail } from '../lib/report-email.mjs';

const args = process.argv.slice(2), json = args.includes('--json');
const paths = args.filter(arg => arg !== '--json');
try {
  if (paths.length !== 2 || paths.some(p => p.startsWith('--'))) {
    throw new Error('Usage: node scripts/render-report-email.mjs <report.md> <new-preview.html> [--json]');
  }
  const [input, output] = paths.map(p => resolve(p));
  if (input === output) throw new Error('Input and output must be different files');
  const html = renderReportEmail(await readFile(input, 'utf8'));
  await writeFile(output, html, { flag: 'wx' });
  console.log(json ? JSON.stringify({ ok: true, input, output, bytes: Buffer.byteLength(html) }) : output);
} catch (error) {
  console.error(json ? JSON.stringify({ ok: false, error: error.message }) : error.message);
  process.exitCode = 1;
}
