// The climb brief must match the agent's allowlist and the gate after it: the
// workflow blocks a night on any permission denial (agentVerdict), so the
// brief has to say so and name the command shapes that are denied. Every
// scheduled climb from 1 to 5 November 2026 ended blocked on Bash denials
// (5 to 10 a night) while admission had admitted the work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const source = 'practices/climb/files/.agents/climb/PROTOCOL.md';
const section = (text, head) => {
  const at = text.indexOf(`## ${head}`);
  assert.ok(at >= 0, `missing section ${head}`);
  const next = text.indexOf('\n## ', at + 3);
  return text.slice(at, next < 0 ? undefined : next);
};

for (const path of [source, '.agents/climb/PROTOCOL.md']) {
  test(`${path} tells the agent a denied call blocks the night and which shapes are denied`, () => {
    const run = section(read(path), 'What you may run').replace(/\s+/g, ' ');
    assert.match(run, /denied[^.]*blocks the (whole )?night/i, 'a denial is fatal to the night, not a cheap retry');
    for (const shape of ['`|`', '`&&`', '`;`', '`>`', '`cd`', '`$(…)`']) assert.ok(run.includes(shape), `names the denied shape ${shape}`);
    assert.match(run, /environment variable/i, 'an env-assignment prefix is a different command');
    assert.match(run, /Read, Glob (and|or) Grep/i, 'file reading goes through the tools, not cat/ls/find');
    assert.match(run, /measurement command[^.]*(directly|itself)/i, 'the measured command is not run by hand');
  });
}

test('every Bash prefix the climb workflow allows Claude is named in the brief', () => {
  const workflow = read('practices/climb/files/.github/workflows/plates-climb.yml');
  const tools = /--allowedTools "([^"]*)"/.exec(workflow)[1].split(',');
  const run = section(read(source), 'What you may run');
  const bash = tools.filter(t => t.startsWith('Bash(')).map(t => t.slice(5, -1).replace(/\s*\*$/, '').replace(/\*$/, ''));
  assert.ok(bash.length >= 10);
  for (const prefix of bash) {
    const words = prefix.split(' ');
    const named = run.includes(`\`${prefix}`) || words.at(-1) && run.includes(`\`${words.at(-1)}\``);
    assert.ok(named, `brief names ${prefix}`);
  }
});

test('the test-time job reads the ledger with the file tools and measures through climb.mjs', () => {
  const job = read('practices/climb/files/.agents/climb/jobs/test-time.md').replace(/\s+/g, ' ');
  assert.match(job, /with Read/i, 'ledger files are read with Read, not a shell pipeline');
  assert.match(job, /do not run (it|the measurement command) (directly|yourself)/i);
});
