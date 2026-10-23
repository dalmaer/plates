import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as runCommand } from './helpers/run.mjs';
import { renderReportEmail } from '../lib/report-email.mjs';

const fixture = name => readFile(new URL(`./fixtures/report-email/${name}.md`, import.meta.url), 'utf8');
test('digest has semantic headings, emphasis, lists and unchanged evidence links', async () => {
  const source = await fixture('digest'), html = renderReportEmail(source);
  assert.match(html, /<h1[^>]*>While you were asleep — Acme fleet — 2026-10-22<\/h1>/);
  assert.equal((html.match(/<h2 /g) ?? []).length, 4);
  assert.equal((html.match(/<li[ >]/g) ?? []).length, 4);
  assert.match(html, /<strong[^>]*>No production-verified fix is evidenced\.<\/strong>/);
  assert.match(html, /<code[^>]*>provider-read-failed<\/code>/);
  assert.match(html, /<ol[^>]*start="1"/);
  for (const [, label, url] of source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    assert.ok(html.includes(`href="${url}"`));
    assert.ok(html.includes(`>${label}</a>`));
  }
  assert.ok(html.includes('owner acceptance is still outstanding.'));
  assert.ok(html.includes('acme-fleet-morning-2026-10-22'));
  assert.equal(renderReportEmail(source), html, 'formatting is deterministic');
});

test('quiet report stays quiet and source numbering is preserved', async () => {
  const html = renderReportEmail(await fixture('quiet'));
  assert.ok(html.includes('All quiet: no meaningful changes were observed'));
  assert.ok(html.includes("One project&#39;s production reader remains unavailable"));
  assert.ok(!html.includes('#b3261e'));
  assert.match(renderReportEmail('3. Third\n5. Fifth'), /<ol[^>]*start="3"[^>]*>\n<li value="3"[^>]*>Third<\/li>\n<li value="5"/);
});

test('untrusted report text cannot inject HTML, styles or executable links', () => {
  const html = renderReportEmail('# <script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[unsafe](javascript:alert(3)) [data](data:text/html,boom)\n\n![image](https://example.com/pixel)\n\n[safe](https://example.com/path_(one)?a=1&b=2)');
  assert.ok(!/<script|<img|onerror="|href="(?:javascript|data):/.test(html));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('[unsafe](javascript:alert(3))'));
  assert.ok(html.includes('![image](https://example.com/pixel)'));
  assert.ok(html.includes('href="https://example.com/path_(one)?a=1&amp;b=2"'));
  assert.match(renderReportEmail('`**literal**` and **bold `id`**'), /<code[^>]*>\*\*literal\*\*<\/code> and <strong[^>]*>bold <code[^>]*>id<\/code><\/strong>/);
});

test('email styling remains inline, fluid and readable without head styles', async () => {
  const html = renderReportEmail(await fixture('digest'));
  assert.ok(html.includes('Arial,Helvetica,sans-serif'));
  assert.ok(html.includes('max-width:640px;table-layout:fixed'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
  assert.ok(html.includes('text-transform:uppercase;letter-spacing:.07em;color:#b3261e'));
  assert.ok(html.includes('role="presentation"'));
  assert.ok(!/<style|<link|<script|<img/.test(html));
  // Every foreground on the white card meets WCAG AA normal-text contrast.
  const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
  for (const color of ['#1a1a1a', '#666666', '#b3261e', '#175c83']) {
    assert.ok(1.05 / (luminance(color) + .05) >= 4.5, color);
  }
  assert.ok((luminance('#f3f4f6') + .05) / (luminance('#666666') + .05) >= 4.5);
});

test('report has one white surface and a single 16px inset, including without head CSS', async () => {
  const html = renderReportEmail(await fixture('digest'));
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  const styles = [...visible.matchAll(/<(?:body|table|td)\b[^>]*style="([^"]*)"/g)].map(match => match[1]);
  const backgrounds = styles.flatMap(style => [...style.matchAll(/background-color:([^;]+);/g)].map(match => match[1]));
  assert.ok(backgrounds.length > 0);
  assert.ok(backgrounds.every(color => color === '#ffffff'), 'layout must not add a gray surround');
  const padding = styles.flatMap(style => [...style.matchAll(/(?:^|;)padding:([^;]+);/g)].map(match => match[1]));
  assert.deepEqual(padding.filter(value => value !== '0'), ['16px'], 'one content inset, no nested card padding');
  assert.match(html, /<!--\[if mso\]><table role="presentation" width="640"/);
  assert.match(visible, /width:100%;max-width:640px;table-layout:fixed/);
});

test('local command writes a new preview and refuses overwrite without touching source', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'acme-email-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'report.md'), output = join(dir, 'preview.html');
  const source = await fixture('digest');
  await writeFile(input, source);
  const script = new URL('../scripts/render-report-email.mjs', import.meta.url).pathname;
  const run = (...args) => runCommand(process.execPath, [script, ...args, '--json']);
  const result = run(input, output);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.equal(await readFile(output, 'utf8'), renderReportEmail(source));
  assert.equal(run(input, output).status, 1);
  assert.equal(run(input, input).status, 1);
  assert.equal(await readFile(input, 'utf8'), source);
  assert.equal(await readFile(output, 'utf8'), renderReportEmail(source));
});
