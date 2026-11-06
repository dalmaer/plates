// Fixed single-process test runner. Executed only inside default-deny containment.
import { run } from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [task, regression] = process.argv.slice(2);
const suites = { 'task-a': 'tests/web-operations.test.mjs', 'task-b': 'tests/web-migration.test.mjs' };
if (!Object.hasOwn(suites, task) && task !== 'regression') throw Error('unknown fixed check');
if (regression && !/^tests\/[A-Za-z0-9_-]+\.test\.mjs$/.test(regression)) throw Error('explicit direct regression name required');
if (task === 'regression' && !regression) throw Error('regression required');
const files = [...(suites[task] ? [suites[task]] : []), ...(regression ? [regression] : [])];
await import(pathToFileURL(join(process.cwd(), 'tests/helpers/hermetic.mjs')));
const stream = run({ files: files.map(file => join(process.cwd(), file)), isolation: 'none', concurrency: 1, timeout: 25000 });
let summary = null, failed = 0, passed = 0;
for await (const event of stream) {
  if (event.type === 'test:fail') failed++;
  if (event.type === 'test:pass') passed++;
  if (event.type === 'test:summary') summary = event.data;
  if (['test:pass', 'test:fail'].includes(event.type)) process.stdout.write(JSON.stringify({ type: event.type, name: event.data.name, details: event.type === 'test:fail' ? String(event.data.details?.error?.message ?? '') : undefined }) + '\n');
}
const ok = summary?.success === true && failed === 0 && passed > 0 && summary.counts.cancelled === 0 && summary.counts.skipped === 0 && summary.counts.todo === 0;
process.stdout.write(JSON.stringify({ type: 'fixed-check-result', task, files, passed, failed, summary, ok }) + '\n');
if (!ok) process.exitCode = 1;
