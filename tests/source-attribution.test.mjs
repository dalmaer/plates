import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('NOTICE credits every adapted practice and its recorded upstream source', async () => {
  const notice = await readFile(new URL('../NOTICE', import.meta.url), 'utf8');
  const sections = notice.split('It includes material adapted from ');
  const practices = new URL('../practices/', import.meta.url);
  let checked = 0;
  for (const entry of await readdir(practices, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const { name, source } = JSON.parse(await readFile(new URL(`${entry.name}/practice.json`, practices), 'utf8'));
    if (!source) continue;
    const credit = sections.find(section => section.includes(`https://github.com/${source.repo})`));
    assert.ok(credit, `${name}: NOTICE must credit ${source.repo}`);
    for (const value of [`practices/${name}`, source.path, source.commit]) {
      assert.ok(credit.includes(value), `${name}: NOTICE must name ${value} under ${source.repo}`);
    }
    checked++;
  }
  assert.ok(checked > 0, 'the attribution check must inspect adapted practices');
});
