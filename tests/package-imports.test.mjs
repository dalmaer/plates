// What the package ships must run without the checkout: every relative import a
// shipped module reaches resolves to a file the package also ships. npm's own
// listing is the oracle (`npm pack --dry-run --json`, offline), so `files` and
// its negated patterns are read exactly as npm reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers/run.mjs';

const PLATES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };

// Templates under practices/*/files/ run from a project's layout after plates
// installs them, never from the package, so their imports resolve there. The
// evaluation corpus's probes likewise run inside the evaluated repository's
// checkout (/work/probes/), importing that repository's files.
const TEMPLATE = /^(?:practices\/[^/]+\/files\/|lib\/evaluation-corpus\/probes\/)/;
const MODULE = /\.(?:mjs|js|cjs)$/;

/** Relative specifiers of static imports/re-exports and literal dynamic imports (not ones quoted inside a string, such as a `node -e` argument). */
export function relativeImports(text) {
  const found = new Set();
  for (const re of [/^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])(\.\.?\/[^'"]+)\1/gm, /^[ \t]*import\s*(['"])(\.\.?\/[^'"]+)\1/gm]) {
    for (const m of text.matchAll(re)) found.add(m[2]);
  }
  // lib/cli.mjs's lazy commands are imports too. (A module URL may be an existsSync
  // probe with a fallback, so `new URL(...)` alone is not followed.)
  for (const m of text.matchAll(/\blazy\(\s*(['"])(\.\.?\/[^'"]+\.m?js)\1\s*\)/g)) found.add(m[2]);
  for (const m of text.matchAll(/\bimport\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g)) {
    const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
    if ((before.match(/"/g) ?? []).length % 2 === 0 && (before.match(/`/g) ?? []).length % 2 === 0) found.add(m[2]);
  }
  return [...found];
}

/** Each relative import reachable from the shipped non-template modules that the package does not ship: [{ from, to }]. */
export async function unshippedImports(shipped, read) {
  const missing = [], seen = new Set();
  const queue = [...shipped].filter(p => MODULE.test(p) && !TEMPLATE.test(p));
  while (queue.length) {
    const from = queue.shift();
    if (seen.has(from)) continue;
    seen.add(from);
    for (const spec of relativeImports(await read(from))) {
      const to = posix.normalize(posix.join(posix.dirname(from), spec.split(/[?#]/)[0]));
      if (!shipped.has(to)) missing.push({ from, to });
      else if (MODULE.test(to)) queue.push(to);
    }
  }
  return missing;
}

test('relativeImports reads static, re-export, side-effect and literal dynamic imports, and nothing else', () => {
  const text = [
    "import { a } from './a.mjs';",
    'import {\n  b,\n  c,\n} from "../lib/b.mjs";',
    "export { d } from './d.mjs';",
    "export * as e from './e.mjs';",
    "import './side.mjs';",
    "const f = await import('./f.mjs');",
    "import { join } from 'node:path';",
    "const g = await import(name);",
    "const text = `import { h } from './template-only.mjs'`;",
    `  { args: ['-e', "await (await import('./lib/cwd-relative.mjs')).run('.')"] },`,
    "const night = lazy('./night.mjs');",
    "const LIB = existsSync(fileURLToPath(new URL('./lib.mjs', import.meta.url))) ? './lib.mjs' : '../fallback/lib.mjs';",
  ].join('\n');
  assert.deepEqual(relativeImports(text).sort(), ['../lib/b.mjs', './a.mjs', './d.mjs', './e.mjs', './f.mjs', './night.mjs', './side.mjs']);
});

test('unshippedImports follows imports transitively and names each one that leaves the package', async () => {
  const files = {
    'bin/acme.mjs': "import { run } from '../lib/cli.mjs';",
    'lib/cli.mjs': "import { x } from './x.mjs';\nimport { y } from '../scripts/dev-only.mjs';",
    'lib/x.mjs': "const z = await import('./z.mjs');",
    'practices/acme/files/scripts/t.mjs': "import { lib } from './lib.mjs';",
    'lib/evaluation-corpus/probes/p.mjs': "import { target } from '../lib/target.mjs';",
  };
  const shipped = new Set(Object.keys(files));
  const read = async p => files[p];
  assert.deepEqual(await unshippedImports(shipped, read), [{ from: 'lib/cli.mjs', to: 'scripts/dev-only.mjs' }, { from: 'lib/x.mjs', to: 'lib/z.mjs' }]);
  files['lib/z.mjs'] = ''; files['scripts/dev-only.mjs'] = '';
  assert.deepEqual(await unshippedImports(new Set(Object.keys(files)), read), [], 'templates and probes resolve in the project they run in, not the package');
});

let listing;
/** The package's files as npm would publish them, listed once per run. */
function packed() {
  listing ??= (() => {
    const pack = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: PLATES, env: ENV });
    assert.equal(pack.status, 0, `npm pack --dry-run failed:\n${pack.stderr}`);
    return new Set(JSON.parse(pack.stdout)[0].files.map(f => f.path));
  })();
  return listing;
}

test('every relative import a shipped module reaches resolves to a shipped file', async () => {
  const shipped = packed();
  assert.ok(shipped.has('bin/plates.mjs') && shipped.has('lib/cli.mjs'), 'the listing has the CLI');
  const missing = await unshippedImports(shipped, p => readFile(join(PLATES, p), 'utf8'));
  assert.deepEqual(missing, [], 'shipped modules import files the package does not ship');
});

// Build/test-time and source-checkout-only modules no shipped entry point
// (bin/, lib/cli.mjs, api/index.mjs, lib/web/serve.mjs) imports: the
// capability source audit and its data (never in the hosted service), the
// source-only validation planner that reads that data, and the Discord pilot
// (docs/development/discord-pilot.md: source-only entrypoints).
const SOURCE_ONLY = ['lib/web/capability-source-inventory.mjs', 'lib/web/capability-source-data.mjs', 'lib/validation-plan.mjs', 'lib/validation-capabilities.mjs', 'lib/validation-conventions.mjs', 'lib/discord-pilot/service.mjs', 'lib/discord-pilot/entrypoint.mjs'];
const RUNTIME = ['bin/plates.mjs', 'lib/cli.mjs', 'api/index.mjs', 'lib/web/serve.mjs', 'lib/web/server.mjs', 'lib/web/capability-cli-data.mjs', 'lib/validation-budget.mjs', 'lib/chat/seam.mjs'];

test('source-only modules stay out of the package and the serverless function bundle', async () => {
  const shipped = packed();
  assert.deepEqual(SOURCE_ONLY.filter(p => shipped.has(p)), [], 'source-only modules npm would publish');
  assert.deepEqual([...shipped].filter(p => p.startsWith('lib/discord-pilot/')), [], 'the Discord pilot is source-only');
  assert.deepEqual(RUNTIME.filter(p => !shipped.has(p)), [], 'the runtime the package needs still ships');
  const { matchesGlob } = await import('node:path');
  const excluded = JSON.parse(await readFile(join(PLATES, 'vercel.json'), 'utf8')).functions['api/index.mjs'].excludeFiles;
  for (const p of [...SOURCE_ONLY, 'scripts/discord-pilot/demo.mjs']) assert.ok(matchesGlob(p, excluded), `${p} is excluded from the function`);
  for (const p of RUNTIME.filter(p => p !== 'bin/plates.mjs')) assert.ok(!matchesGlob(p, excluded), `${p} stays in the function`);
});
