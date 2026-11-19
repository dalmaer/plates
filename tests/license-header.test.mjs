// A project's licence header opens the files plates writes, so a project that
// must carry one (an Apache-2.0 notice) never drifts from plates by adding it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { load, fill, render, targets, config as readConfig } from '../lib/practices.mjs';
import { diagnoseDrift, doctor } from '../lib/doctor.mjs';
import { readLock, sha256 } from '../lib/lock.mjs';
import { COMMENT, shapeLicenseHeader, licenseHeaderLines } from '../lib/license-header.mjs';

const practices = await load();
const HEADER = ['Copyright 2026 Acme Widgets', '', 'Licensed under the Apache License, Version 2.0 (the "License");', 'you may not use this file except in compliance with the License.'];
const YAML_HEADER = '# Copyright 2026 Acme Widgets\n#\n# Licensed under the Apache License, Version 2.0 (the "License");\n# you may not use this file except in compliance with the License.\n\n';
const ACME = { name: 'Acme', tagline: 'Acme builds anvils, one checked phase at a time.', repo: 'acme/anvils', practices: ['base', 'agents-md', 'phases', 'evidence', 'lessons', 'conduct', 'ci', 'night'] };
const NIGHT = '.github/workflows/plates-night.yml';

test('without licenseHeader every rendered file is unchanged; with it, each commented file opens with it', () => {
  const on = { ...ACME, licenseHeader: HEADER };
  let headed = 0, plain = 0;
  for (const f of targets(ACME, practices)) {
    if (f.kind === 'block' || f.link !== undefined) continue;
    const off = fill(f.template, ACME, f.path), yes = fill(f.template, on, f.path);
    const mark = COMMENT[extname(f.path).toLowerCase()];
    if (!mark) { assert.equal(yes, off, `${f.path}: has no line comments, so takes no header`); plain++; continue; }
    const header = YAML_HEADER.replaceAll('#', mark);
    const expected = off.startsWith('#!') ? off.replace(/^(#![^\n]*\n)/, `$1${header}`) : header + off;
    assert.equal(yes, expected, `${f.path}: header not at the top`);
    headed++;
  }
  assert.ok(headed > 0 && plain > 0, 'both kinds of file are covered');
  // The workflow isocan-style projects carry: the header, one blank line, then plates's bytes.
  const night = practices.get('night').files.find(f => f.path === NIGHT);
  assert.equal(fill(night.template, on, NIGHT), YAML_HEADER + fill(night.template, ACME, NIGHT));
});

test('a #! line stays first, and blocks take no header', () => {
  assert.equal(shapeLicenseHeader('#!/usr/bin/env node\nrun();\n', { licenseHeader: ['Acme'] }, 'bin/x.mjs'), '#!/usr/bin/env node\n// Acme\n\nrun();\n');
  const block = targets(ACME, practices).find(f => f.kind === 'block');
  assert.equal(fill(block.template, { ...ACME, licenseHeader: HEADER }, block.path, block.block), fill(block.template, ACME, block.path, block.block));
});

test('a malformed licenseHeader is refused, naming the setting', () => {
  assert.equal(licenseHeaderLines({}), null);
  for (const bad of ['Acme', [], [''], [42], null, ['Acme\nInjected'], ['a'.repeat(201)], Array(41).fill('Acme')]) {
    assert.throws(() => licenseHeaderLines({ licenseHeader: bad }), /"licenseHeader"/, JSON.stringify(bad).slice(0, 40));
  }
});

test('render records the header in the lock, drift reads past it, and restore keeps it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plates-license-header-'));
  try {
    await mkdir(join(dir, '.plates'), { recursive: true });
    await writeFile(join(dir, '.plates/plates.json'), `${JSON.stringify({ ...ACME, licenseHeader: HEADER }, null, 2)}\n`);
    await render(dir, { practices });
    const written = await readFile(join(dir, NIGHT), 'utf8');
    assert.ok(written.startsWith(YAML_HEADER));
    assert.equal((await readLock(dir)).files[NIGHT].sha256, sha256(written));
    assert.deepEqual((await diagnoseDrift(dir, { practices })).drift.filter(d => d.path === NIGHT), []);
    // The project edits the workflow below its header: drift, and restore puts back header and template.
    await writeFile(join(dir, NIGHT), written.replace('contents: read', 'contents: write'));
    assert.equal((await diagnoseDrift(dir, { practices })).drift.find(d => d.path === NIGHT)?.state, 'edited');
    await doctor({ root: dir, fix: [NIGHT, 'restore'], yes: true }, { practices });
    assert.equal(await readFile(join(dir, NIGHT), 'utf8'), written);
    assert.equal((await readConfig(dir)).licenseHeader.length, HEADER.length);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the object form limits the header to the paths it names', () => {
  const scoped = { ...ACME, licenseHeader: { lines: HEADER, paths: ['.github/workflows/plates-*.yml'] } };
  let headed = 0;
  for (const f of targets(ACME, practices)) {
    if (f.kind === 'block' || f.link !== undefined) continue;
    const off = fill(f.template, ACME, f.path), yes = fill(f.template, scoped, f.path);
    if (/^\.github\/workflows\/plates-[^/]*\.yml$/.test(f.path)) { assert.equal(yes, YAML_HEADER + off, f.path); headed++; }
    else assert.equal(yes, off, `${f.path}: outside the named paths, so no header`);
  }
  assert.ok(headed > 0);
  // ** crosses segments; * does not.
  const deep = { licenseHeader: { lines: ['Acme'], paths: ['scripts/**/*.mjs'] } };
  assert.equal(shapeLicenseHeader('x\n', deep, 'scripts/plates/a/b.mjs'), '// Acme\n\nx\n');
  assert.equal(shapeLicenseHeader('x\n', { licenseHeader: { lines: ['Acme'], paths: ['scripts/*.mjs'] } }, 'scripts/plates/b.mjs'), 'x\n');
  // A dot in a pattern is a dot, not any character.
  assert.equal(shapeLicenseHeader('x\n', { licenseHeader: { lines: ['Acme'], paths: ['a.yml'] } }, 'abyml.yml'), 'x\n');
  for (const bad of [{ lines: ['Acme'], paths: [] }, { lines: ['Acme'], paths: ['../x.yml'] }, { lines: ['Acme'], paths: ['/x.yml'] }, { lines: ['Acme'], extra: 1 }, { paths: ['x.yml'] }]) {
    assert.throws(() => licenseHeaderLines({ licenseHeader: bad }), /"licenseHeader"/, JSON.stringify(bad));
  }
});
