// Source-only mandatory installed stage; its receipt is separate from npm test.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { nodePlan } from './plates/time-receipts.mjs';
import { shellWords, flagsIn, where } from './plates/test-ledger.mjs';

const root = process.cwd();
const script = JSON.parse(await readFile('package.json', 'utf8')).scripts['test:installed:node'];
const plan = await nodePlan({ root, script, words: shellWords, flags: flagsIn, revision: where(root).commit });
if (!plan.available) throw new Error(`Installed stage unavailable: ${plan.reason}`);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_') && !['PLATES_SUITE_PLAN', 'KEEL_SUITE_PLAN'].includes(key)));
const result = spawnSync(process.execPath, shellWords(script).slice(1), { cwd: root, env: { ...env, PLATES_SUITE_PLAN: JSON.stringify(plan) }, stdio: 'inherit' });
process.exitCode = result.error || result.signal ? 1 : result.status ?? 1;
