// Untouched-baseline probe only. Never import an agent patch into the evaluator process.
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export async function checkTrial(root, task) {
  const modulePath = join(resolve(root), 'lib/routines/model.mjs');
  const bytes = readFileSync(modulePath);
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== '831fff6973aaf1001725407fde341f964c90e1c4') throw new Error('baseline_only: untrusted or changed candidate must run in a separately contained evaluator worker');
  const { schedule } = await import(pathToFileURL(modulePath));
  const cases = task === 'primary' ? [
    ['FREQ=DAILY;COUNT=2;UNTIL=20261101T090000Z', 'unknown'],
    ['FREQ=DAILY;UNTIL=20261101T090000Z;COUNT=2', 'unknown'],
    ['RRULE:FREQ=DAILY;COUNT=2;UNTIL=20261101T090000Z', 'unknown'],
    ['RRULE:FREQ=DAILY;UNTIL=20261101T090000Z;COUNT=2', 'unknown'],
    ['FREQ=DAILY;COUNT=2', 'rrule'],
    ['FREQ=DAILY;UNTIL=20261101T090000Z', 'rrule'],
    ['RRULE:FREQ=DAILY;COUNT=2', 'rrule'],
    ['RRULE:FREQ=DAILY;UNTIL=20261101T090000Z', 'rrule'],
  ] : task === 'followup' ? [
    ['FREQ=DAILY;INTERVAL=1,2', 'unknown'],
    ['FREQ=DAILY;COUNT=1,2', 'unknown'],
    ['FREQ=DAILY;INTERVAL=2;COUNT=3', 'rrule'],
    ['FREQ=DAILY;BYHOUR=1,2;BYDAY=MO,TU', 'rrule'],
  ] : (() => { throw new Error('task must be primary or followup'); })();
  const results = cases.map(([input, expected]) => ({ input, expected, actual: schedule('rrule', input).kind }));
  return { task, pass: results.every(r => r.expected === r.actual), results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkTrial(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.pass ? 0 : 1;
}
