// Agent run telemetry (phase 143, goal G9): Plates adopts the agent CLIs' own
// OpenTelemetry export and owns only the attributes. A project names where its
// runs report in .plates/plates.json:
//
//   "telemetry": {
//     "endpoint": "secret:ACME_OTLP_ENDPOINT",   // the OTLP endpoint, a GitHub secret
//     "protocol": "http/protobuf",               // or "grpc"
//     "headers": "secret:ACME_OTLP_ENDPOINT_HEADERS", // optional: the backend's key, as OTLP headers
//     "backend": "Langfuse Cloud"                // optional: named in the job's log
//   }
//
// The endpoint and its key are only ever secret names; a literal URL (which
// may carry a key) is refused, so neither can reach source.
//
// shapeTelemetry is the render's shape for each workflow that runs an agent
// (WORKFLOWS). Its template carries, in each agent job, a step that logs
// "telemetry off": without "telemetry" the template's bytes are the file's
// bytes, and no export setting is rendered. With it:
//   - each Claude step (anthropics/claude-code-action) gets Claude Code's
//     documented export settings and OTEL_RESOURCE_ATTRIBUTES in its env. Never
//     OTEL_LOG_USER_PROMPTS: prompt text stays out unless the owner opts in,
//     and there is no opt-in yet. Export is on only when the endpoint secret
//     is set, so a project without the secret still runs, telemetry off;
//   - each Codex step (openai/codex-action) gets a comment saying it is not
//     exported: Codex reads its exporter from its [otel] config, and the
//     action's way to pass that config was not verifiable offline (phase 143
//     "Deliberately open"). Passing it on the command line would put the key
//     where the agent can read its own process;
//   - the log step says whether the endpoint secret is set, and so whether
//     this run exports.
const fail = message => { throw new Error(message); };

/** The workflows whose jobs run an agent, by target path: the pass each one is (plates.job), per GitHub job where they differ, and the attributes known in its agent job. */
export const WORKFLOWS = Object.freeze({
  '.github/workflows/claude.yml': Object.freeze({ job: 'claude' }),
  '.github/workflows/plates-robot.yml': Object.freeze({ job: 'robot', jobs: Object.freeze({ 'review-agent': 'robot-review' }) }),
  // A climb night's job (climb.mjs JOBS, a fixed key) is the experiment it runs.
  '.github/workflows/plates-climb.yml': Object.freeze({ job: 'climb', experiment: '${{ steps.pick.outputs.job }}' }),
  '.github/workflows/plates-tend.yml': Object.freeze({ job: 'tend' }),
  '.github/workflows/plates-cross-review.yml': Object.freeze({ job: 'cross-review' }),
});

/** What each agent job logs when the project names no telemetry: the template's step's run line. */
export const TELEMETRY_OFF = '        run: echo "telemetry off (.plates/plates.json names no telemetry endpoint)"\n';
/** The template's log step, guarded like the job's agent steps (its if:, kept when the shape replaces it). */
export const TELEMETRY_OFF_STEP = /^ {6}- name: Telemetry\n( {8}if: [^\n]+\n)? {8}run: echo "telemetry off \(\.plates\/plates\.json names no telemetry endpoint\)"\n/gm;
export const PROTOCOLS = Object.freeze(['http/protobuf', 'grpc']);
const CLAUDE = /^( +)uses: anthropics\/claude-code-action@v1\n/gm;
const CODEX = /^( +)uses: openai\/codex-action@v1\n/gm;
const SECRET = /^secret:([A-Z_][A-Z0-9_]*)$/;
const BACKEND = /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,59}$/;

/** A secret reference's name: "secret:NAME" → NAME. Anything else (a URL above all) is refused. */
function secretName(value, key) {
  const m = typeof value === 'string' ? SECRET.exec(value) : null;
  if (!m || m[1].startsWith('GITHUB_')) fail(`.plates/plates.json: telemetry.${key} must be "secret:<NAME>" (a GitHub secret's name, A-Z 0-9 _, not GITHUB_*), never a URL or a key`);
  return m[1];
}

/**
 * The project's telemetry, validated: { endpoint, headers?, protocol, backend? }
 * with secret names, or null when it names none. Throws on anything else.
 */
export function telemetryConfig(config = {}) {
  const t = config.telemetry;
  if (t === undefined || t === null) return null;
  if (typeof t !== 'object' || Array.isArray(t)) fail('.plates/plates.json: "telemetry" must be an object: { "endpoint": "secret:<NAME>", "protocol": "http/protobuf" | "grpc" }');
  const known = ['endpoint', 'protocol', 'headers', 'backend'];
  const unknown = Object.keys(t).filter(k => !known.includes(k));
  if (unknown.length) fail(`.plates/plates.json: telemetry has unknown ${unknown.length > 1 ? 'keys' : 'key'} ${unknown.join(', ')} (known: ${known.join(', ')})`);
  const endpoint = secretName(t.endpoint, 'endpoint');
  if (!PROTOCOLS.includes(t.protocol)) fail(`.plates/plates.json: telemetry.protocol must be ${PROTOCOLS.map(p => `"${p}"`).join(' or ')}`);
  const headers = t.headers === undefined ? undefined : secretName(t.headers, 'headers');
  if (t.backend !== undefined && (typeof t.backend !== 'string' || !BACKEND.test(t.backend))) fail('.plates/plates.json: telemetry.backend must be a short name (letters, digits, space . _ + -, at most 60)');
  return { endpoint, protocol: t.protocol, ...(headers ? { headers } : {}), ...(t.backend ? { backend: t.backend } : {}) };
}

/** An attribute value as OTEL_RESOURCE_ATTRIBUTES carries it (W3C baggage octets; the rest percent-encoded). */
export const attributeValue = value => String(value).replace(/[^A-Za-z0-9._~\-\/:@]/g, c => encodeURIComponent(c).replace(/[!'()*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`));

/** The run's URL, as a GitHub expression. */
export const RUN_URL = '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}';

/**
 * OTEL_RESOURCE_ATTRIBUTES for one agent step: plates.project, plates.job,
 * plates.phase and plates.experiment when known (each a literal, encoded, or a
 * GitHub expression whose values are attribute-safe), plates.run_url.
 */
export function resourceAttributes({ project, job, phase, experiment }) {
  const value = v => /^\$\{\{[^}]*\}\}$/.test(v) ? v : attributeValue(v);
  const pairs = [['plates.project', project], ['plates.job', job], ['plates.phase', phase], ['plates.experiment', experiment]]
    .filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => `${k}=${value(v)}`);
  return [...pairs, `plates.run_url=${RUN_URL}`].join(',');
}

/** The env lines a Claude step gets, at `indent` (the step's keys'), each a `KEY: value` line. */
export function claudeEnv(telemetry, attributes, indent) {
  const pad = `${indent}  `;
  const lines = [
    `# Telemetry (phase 143): Claude Code's own OTLP export, on only when the ${telemetry.endpoint} secret is set. Never prompt text.`,
    `CLAUDE_CODE_ENABLE_TELEMETRY: \${{ secrets.${telemetry.endpoint} != '' && '1' || '' }}`,
    'OTEL_METRICS_EXPORTER: otlp',
    'OTEL_LOGS_EXPORTER: otlp',
    `OTEL_EXPORTER_OTLP_PROTOCOL: ${telemetry.protocol}`,
    `OTEL_EXPORTER_OTLP_ENDPOINT: \${{ secrets.${telemetry.endpoint} }}`,
    ...(telemetry.headers ? [`OTEL_EXPORTER_OTLP_HEADERS: \${{ secrets.${telemetry.headers} }}`] : []),
    `OTEL_RESOURCE_ATTRIBUTES: "${attributes}"`,
  ];
  return lines.map(l => `${pad}${l}\n`).join('');
}

/** The log step a job gets when the project names an endpoint (with the template step's `guard` line): on when the secret is set, else off. */
export function telemetryOnStep(telemetry, guard = '') {
  const to = telemetry.backend ? ` to ${telemetry.backend}` : '';
  return [
    `      - name: Telemetry\n${guard}`.replace(/\n$/, ''),
    '        env:',
    `          PLATES_TELEMETRY: \${{ secrets.${telemetry.endpoint} != '' }}`,
    '        run: |',
    '          if [ "$PLATES_TELEMETRY" = true ]; then',
    `            echo "telemetry on: Claude Code runs export OTLP (${telemetry.protocol})${to}; Codex runs are not exported"`,
    '          else',
    `            echo "telemetry off: the ${telemetry.endpoint} secret is not set"`,
    '          fi',
    '',
  ].join('\n');
}

/** The comment a Codex step gets: a marked omission, not an export. */
export const codexOmission = indent => `${indent}# Telemetry (phase 143): not exported. Codex reads its exporter from its [otel] config; codex-action's way to pass it is unverified, and a command line would show the key to the agent.\n`;

/** The GitHub job (its key under jobs:) a line at `index` sits in. */
function jobAt(text, index) {
  const before = text.slice(0, index);
  const jobs = before.lastIndexOf('\njobs:\n');
  const keys = [...before.slice(jobs < 0 ? 0 : jobs).matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
  return keys.at(-1)?.[1];
}

/**
 * A workflow's bytes for this project's telemetry. Not an agent workflow, or
 * no "telemetry": the text unchanged (its log step says telemetry off).
 */
export function shapeTelemetry(text, config = {}, path = '') {
  const facts = WORKFLOWS[path];
  if (!facts) return text;
  const telemetry = telemetryConfig(config);
  if (!telemetry) return text;
  if (!text.match(TELEMETRY_OFF_STEP)) fail(`${path}: no "Telemetry" step to log the export (the template's ${JSON.stringify(TELEMETRY_OFF.trim())})`);
  if (!text.match(CLAUDE)) fail(`${path}: no anthropics/claude-code-action step to export from`);
  const project = typeof config.name === 'string' && config.name ? config.name : config.repo;
  let out = '', last = 0;
  for (const m of [...text.matchAll(CLAUDE), ...text.matchAll(CODEX)].sort((a, b) => a.index - b.index)) {
    const indent = m[1], at = m.index + m[0].length;
    out += text.slice(last, at);
    if (m[0].includes('openai/codex-action')) { out += codexOmission(indent); last = at; continue; }
    const key = jobAt(text, m.index);
    const job = facts.jobs?.[key] ?? facts.job;
    const env = claudeEnv(telemetry, resourceAttributes({ project, job, phase: facts.phase, experiment: facts.experiment }), indent);
    // The step's own env, when it has one, comes after the telemetry lines.
    const envLine = `${indent}env:\n`;
    out += envLine + env;
    last = text.startsWith(envLine, at) ? at + envLine.length : at;
  }
  out += text.slice(last);
  return out.replace(TELEMETRY_OFF_STEP, (_, guard) => telemetryOnStep(telemetry, guard ?? ''));
}
