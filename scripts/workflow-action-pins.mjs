// Source-only pin maintenance. Release tags are verified by a reviewer, not fetched here.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_ACTIONS } from '../lib/telemetry.mjs';

const pins = new Map(Object.values(WORKFLOW_ACTIONS).map(pin => [pin.split('@')[0], pin]));

export function reconcileActionPins(text) {
  const differences = [];
  const content = text.split('\n').map((line, index) => {
    const use = /^(\s*(?:-\s+)?uses:\s*)(['"]?)([\w.-]+\/[\w.-]+)@[^\s'"#]+\2(?:\s+#.*)?\s*$/.exec(line);
    const pin = pins.get(use?.[3]);
    if (!pin) return line;
    const expected = use[1] + pin;
    if (expected !== line) differences.push({ line: index + 1, expected: pin });
    return expected;
  }).join('\n');
  return { content, differences };
}

async function yamlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return entries.filter(e => e.isFile() && /\.ya?ml$/.test(e.name)).map(e => join(dir, e.name)).sort();
}

async function main(args) {
  if (args.length !== 1 || !['--check', '--sync-templates'].includes(args[0])) {
    throw Error('usage: node scripts/workflow-action-pins.mjs --check|--sync-templates');
  }
  const sync = args[0] === '--sync-templates';
  const practices = (await readdir('practices', { withFileTypes: true })).filter(e => e.isDirectory());
  const templates = await Promise.all(practices.map(({ name }) =>
    yamlFiles(join('practices', name, 'files', '.github', 'workflows'))));
  const files = [...templates.flat(), ...(sync ? [] : await yamlFiles('.github/workflows'))];
  let mismatches = 0;
  for (const file of files) {
    const { content, differences } = reconcileActionPins(await readFile(file, 'utf8'));
    if (!differences.length) continue;
    mismatches += differences.length;
    if (sync) {
      await writeFile(file, content);
      console.log(`Synced ${file}`);
    } else {
      for (const { line, expected } of differences) console.error(`${file}:${line}: expected ${expected} from WORKFLOW_ACTIONS`);
    }
  }
  if (!sync && mismatches) {
    console.error('Verify upstream release refs, update lib/telemetry.mjs, then run --sync-templates and npm run render.');
    process.exitCode = 1;
  } else if (!sync) console.log(`Canonical action pins match in ${files.length} workflow files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
}
