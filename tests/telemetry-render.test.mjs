// Phase 143: agent runs report telemetry to the place the owner picked, and
// only there. Renders each agent workflow through the real fill (lib/practices.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load, fill } from '../lib/practices.mjs';
import { WORKFLOWS, TELEMETRY_OFF, telemetryConfig } from '../lib/telemetry.mjs';
import { shellProblems } from './helpers/workflows.mjs';

const practices = await load();
const templateOf = path => {
  for (const [, p] of practices) for (const f of p.files) if (f.path === path) return f.template;
  throw new Error(`no template for ${path}`);
};
const base = { name: 'Acme Widgets', tagline: 'Widgets for Acme.', repo: 'acme/widgets', practices: ['claude', 'climb', 'cross-review', 'ci'] };
const telemetry = { endpoint: 'secret:ACME_OTLP_ENDPOINT', protocol: 'http/protobuf', headers: 'secret:ACME_OTLP_ENDPOINT_HEADERS', backend: 'Langfuse Cloud' };
const on = { ...base, telemetry };
const render = (path, config) => fill(templateOf(path), config, path);
const count = (text, needle) => text.split(needle).length - 1;
const CLAUDE = 'uses: anthropics/claude-code-action@v1\n';
const CODEX = 'uses: openai/codex-action@v1\n';
const EXPORT = ['CLAUDE_CODE_ENABLE_TELEMETRY', 'OTEL_METRICS_EXPORTER', 'OTEL_LOGS_EXPORTER', 'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_RESOURCE_ATTRIBUTES'];

/** Each step's text (from its "- " line to the next at the same indent). */
const steps = text => text.split(/\n(?= {6}- )/).filter(s => s.startsWith('      - '));

test('telemetry only where configured', async () => {
  // Every workflow whose jobs run Claude or Codex is in the table.
  for (const [, p] of practices) for (const f of p.files) {
    if (!f.path.startsWith('.github/workflows/')) continue;
    const runs = f.template.includes(CLAUDE) || f.template.includes(CODEX);
    assert.equal(Object.hasOwn(WORKFLOWS, f.path), runs, `${f.path}: ${runs ? 'runs an agent but is not' : 'is'} in WORKFLOWS`);
  }
  for (const path of Object.keys(WORKFLOWS)) {
    const off = render(path, base), yes = render(path, on);
    // Without telemetry: no export setting at all, and each agent job logs it is off.
    for (const key of [...EXPORT, 'OTEL_']) assert.ok(!off.includes(key), `${path}: ${key} rendered without telemetry`);
    const logs = steps(off).filter(s => s.startsWith('      - name: Telemetry\n'));
    assert.ok(logs.length >= 1 && logs.every(s => `${s}\n`.includes(TELEMETRY_OFF)), `${path}: no "telemetry off" log`);
    assert.match(off, /echo "telemetry off/);
    // With it: every Claude step exports, with the attributes; Codex steps say they do not.
    const claude = steps(yes).filter(s => s.includes(CLAUDE));
    assert.ok(claude.length >= 1, `${path}: no Claude step`);
    for (const s of claude) {
      const env = s.slice(s.indexOf(CLAUDE) + CLAUDE.length);
      assert.match(env, /^ {8}env:\n/, `${path}: Claude step's env is not right after uses`);
      for (const key of EXPORT) assert.equal(count(s, `          ${key}: `), 1, `${path}: ${key} not once in a Claude step`);
      assert.match(s, /CLAUDE_CODE_ENABLE_TELEMETRY: \$\{\{ secrets\.ACME_OTLP_ENDPOINT != '' && '1' \|\| '' \}\}\n/);
      assert.match(s, /OTEL_METRICS_EXPORTER: otlp\n/);
      assert.match(s, /OTEL_LOGS_EXPORTER: otlp\n/);
      assert.match(s, /OTEL_EXPORTER_OTLP_PROTOCOL: http\/protobuf\n/);
      assert.match(s, /OTEL_EXPORTER_OTLP_ENDPOINT: \$\{\{ secrets\.ACME_OTLP_ENDPOINT \}\}\n/);
      assert.match(s, /OTEL_EXPORTER_OTLP_HEADERS: \$\{\{ secrets\.ACME_OTLP_ENDPOINT_HEADERS \}\}\n/);
      const attrs = /OTEL_RESOURCE_ATTRIBUTES: "([^"\n]*)"\n/.exec(s)?.[1];
      assert.ok(attrs, `${path}: no OTEL_RESOURCE_ATTRIBUTES`);
      const pairs = Object.fromEntries(attrs.split(',').map(p => p.split(/=(.*)/s).slice(0, 2)));
      assert.equal(pairs['plates.project'], 'Acme%20Widgets');
      assert.match(pairs['plates.job'], /^(claude|robot|robot-review|climb|tend|cross-review)$/);
      assert.equal(pairs['plates.run_url'], '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}');
      if (path.endsWith('plates-climb.yml')) assert.equal(pairs['plates.experiment'], '${{ steps.pick.outputs.job }}');
      else assert.ok(!('plates.experiment' in pairs));
      assert.ok(!('plates.phase' in pairs), 'no workflow knows its phase yet');
    }
    for (const s of steps(yes).filter(s => s.includes(CODEX))) {
      assert.match(s, /# Telemetry \(phase 143\): not exported\./);
      assert.ok(!s.includes('OTEL_'), `${path}: a Codex step got OTEL settings`);
    }
    assert.equal(count(yes, 'CLAUDE_CODE_ENABLE_TELEMETRY:'), count(yes, CLAUDE), `${path}: a Claude step without export`);
    // The log says on when the secret is set and off when it is not; the off step is gone.
    assert.ok(!yes.includes(TELEMETRY_OFF));
    // Each log step keeps its job's guard: it logs only when an agent step may run.
    const guard = s => /^ {8}if: .*$/m.exec(s)?.[0];
    assert.deepEqual(steps(yes).filter(s => s.startsWith('      - name: Telemetry\n')).map(guard), logs.map(guard));
    assert.ok(logs.every(guard), `${path}: a log step without its job's guard`);
    assert.match(yes, /PLATES_TELEMETRY: \$\{\{ secrets\.ACME_OTLP_ENDPOINT != '' \}\}\n/);
    assert.match(yes, /echo "telemetry on: Claude Code runs export OTLP \(http\/protobuf\) to Langfuse Cloud; Codex runs are not exported"/);
    assert.match(yes, /echo "telemetry off: the ACME_OTLP_ENDPOINT secret is not set"/);
    assert.deepEqual(await shellProblems(path, yes), [], `${path} on`);
    // Only what telemetry adds changes: dropping the added lines gives back the off render.
    const added = new Set(yes.split('\n').filter(l => !off.split('\n').includes(l)));
    assert.ok([...added].every(l => /OTEL_|CLAUDE_CODE_ENABLE_TELEMETRY|Telemetry|telemetry|PLATES_TELEMETRY|^ +(env:|run: \||if \[|else|fi)$/.test(l)), `${path}: unexpected lines ${[...added].join('\n')}`);
  }
  // Workflows that run no agent are untouched by telemetry; so is plates's own render.
  const check = '.github/workflows/check.yml';
  assert.equal(render(check, on), render(check, base));
  for (const path of Object.keys(WORKFLOWS)) {
    const self = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.ok(!self.includes('OTEL_') && self.includes(TELEMETRY_OFF), `${path}: plates's own copy`);
  }
  // A grpc endpoint without headers: no headers line.
  const grpc = render('.github/workflows/claude.yml', { ...base, telemetry: { endpoint: 'secret:ACME_OTLP', protocol: 'grpc' } });
  assert.match(grpc, /OTEL_EXPORTER_OTLP_PROTOCOL: grpc\n/);
  assert.ok(!grpc.includes('OTEL_EXPORTER_OTLP_HEADERS'));
  assert.match(grpc, /echo "telemetry on: Claude Code runs export OTLP \(grpc\); Codex runs are not exported"/);
});

test('no prompts or keys leak', () => {
  const key = 'acme-ingest-key-123';
  const url = `https://otlp.acme.example/v1?key=${key}`;
  for (const path of Object.keys(WORKFLOWS)) {
    const yes = render(path, on), off = render(path, base);
    for (const text of [yes, off]) {
      assert.doesNotMatch(text, /OTEL_LOG_USER_PROMPTS|OTEL_LOG_TOOL_DETAILS|log_user_prompt/i, `${path}: a prompt-logging setting`);
    }
    // The endpoint and the key are only ever secret expressions; no literal URL is added.
    for (const line of yes.split('\n').filter(l => /OTEL_EXPORTER_OTLP_(ENDPOINT|HEADERS)/.test(l))) {
      assert.match(line, /^ +OTEL_EXPORTER_OTLP_(ENDPOINT|HEADERS): \$\{\{ secrets\.[A-Z0-9_]+ \}\}$/, `${path}: ${line}`);
    }
    const added = yes.split('\n').filter(l => !off.split('\n').includes(l)).join('\n');
    assert.doesNotMatch(added.replaceAll('${{ github.server_url }}', ''), /https?:\/\//, `${path}: a literal URL`);
  }
  // A literal URL, a key, or a bare header value never reaches a render: refused, without echoing it.
  const refused = [
    { endpoint: url, protocol: 'http/protobuf' },
    { endpoint: `secret:${url}`, protocol: 'http/protobuf' },
    { endpoint: 'secret:ACME_OTLP', protocol: 'http/protobuf', headers: `Authorization=Bearer ${key}` },
    { endpoint: 'secret:GITHUB_TOKEN', protocol: 'http/protobuf' },
    { endpoint: 'secret:acme_otlp', protocol: 'http/protobuf' },
    { endpoint: 'secret:ACME_OTLP', protocol: 'http/json' },
    { endpoint: 'secret:ACME_OTLP', protocol: 'grpc', logUserPrompts: true },
    { endpoint: 'secret:ACME_OTLP', protocol: 'grpc', backend: `Acme"; curl ${url}` },
    'secret:ACME_OTLP',
  ];
  for (const t of refused) {
    for (const path of ['.github/workflows/claude.yml', '.github/workflows/plates-robot.yml']) {
      assert.throws(() => render(path, { ...base, telemetry: t }), e => {
        assert.match(e.message, /telemetry/);
        assert.ok(!e.message.includes(key), `the error echoes the key: ${e.message}`);
        return true;
      }, JSON.stringify(t));
    }
  }
  assert.equal(telemetryConfig(base), null);
  assert.deepEqual(telemetryConfig(on), { endpoint: 'ACME_OTLP_ENDPOINT', protocol: 'http/protobuf', headers: 'ACME_OTLP_ENDPOINT_HEADERS', backend: 'Langfuse Cloud' });
});
