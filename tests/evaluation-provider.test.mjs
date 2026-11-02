import './helpers/hermetic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createEvaluationProvider, prepareEvaluationProviderPacket, EVALUATION_PROVIDER_LIMITS as limits } from '../lib/evaluation-provider.mjs';

// Synthetic Acme inputs only. Every adapter instance receives a fake fetcher.
const key = 'acme-synthetic-provider-credential-only';
const at = Date.parse('2026-11-01T00:00:00.000Z');
const model = { requested: 'acme-requested', resolved: 'acme-resolved-2026-01-01' };
const scope = { organization: 'org-acme', project: 'proj-acme' };
const input = () => ({ key, scope: { ...scope }, model: { ...model },
  packet: { instructions: 'Return one Acme artifact envelope.', input: 'Acme public source and requirements.' } });
const inspectInput = () => ({ key, scope: { ...scope }, model: { ...model }, responseId: 'resp_acme' });
const textItem = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
const response = (overrides = {}) => ({ object: 'response', id: 'resp_acme', model: model.resolved,
  service_tier: 'default', status: 'completed', created_at: at / 1000,
  output: [textItem('{"schemaVersion":1,"files":[]}')],
  usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130,
    input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 10 } }, ...overrides });
const json = (body, options) => new Response(JSON.stringify(body), options);
const provider = (fetcher, options = {}) => createEvaluationProvider({ fetcher, timeoutMs: 1000, now: () => at, ...options });
const safeFailure = (code, dispatch = 'uncertain') => error => {
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.dispatch, dispatch);
  assert.equal(Object.hasOwn(error, 'cause'), false);
  for (const value of [key, Buffer.from(key).toString('base64'), Buffer.from(key).toString('base64url')])
    assert.equal(JSON.stringify(error).includes(value) || error.stack.includes(value), false);
  return true;
};

test('live count/start/inspect bind the public packet, model, scope and standard tier without a planning prompt', async () => {
  const calls = [];
  const adapter = provider(async (url, options) => {
    // Store booleans about credentials, never the credential or authorization header.
    calls.push({ url, method: options.method, body: options.body === undefined ? null : JSON.parse(options.body),
      redirect: options.redirect, authMatches: options.headers.Authorization === `Bearer ${key}`,
      organization: options.headers['OpenAI-Organization'], project: options.headers['OpenAI-Project'] });
    return json(url.endsWith('/input_tokens') ? { object: 'response.input_tokens', input_tokens: 100 } : response());
  });
  const count = await adapter.count(input()), started = await adapter.start({ ...input(), maxOutputTokens: 50 });
  const inspected = await adapter.inspect(inspectInput());
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ['POST', 'https://api.openai.com/v1/responses/input_tokens'],
    ['POST', 'https://api.openai.com/v1/responses'], ['GET', 'https://api.openai.com/v1/responses/resp_acme'],
  ]);
  const countedBody = { model: model.resolved, ...input().packet };
  assert.deepEqual(calls[0].body, countedBody);
  assert.deepEqual(calls[1].body, { ...countedBody, tools: [], tool_choice: 'none', store: true,
    background: false, stream: false, truncation: 'disabled', max_output_tokens: 50, service_tier: 'default' });
  assert.equal(calls[2].body, null);
  for (const call of calls) {
    assert.equal(call.redirect, 'error'); assert.equal(call.authMatches, true);
    assert.equal(call.organization, scope.organization); assert.equal(call.project, scope.project);
  }
  assert.equal(count.packetDigest, createHash('sha256').update(JSON.stringify(countedBody)).digest('hex'));
  assert.deepEqual(prepareEvaluationProviderPacket({ model, packet: input().packet }), { body: countedBody, packetDigest: count.packetDigest });
  assert.equal(started.packetDigest, count.packetDigest);
  assert.deepEqual(count.model, model); assert.deepEqual(started.model, model);
  assert.equal(count.inputTokens, 100); assert.equal(count.requestedServiceTier, 'default');
  assert.equal(started.actualServiceTier, 'default'); assert.equal(started.terminal, true);
  assert.equal(inspected.id, 'resp_acme'); assert.equal(started.outputLimitExceeded, false);
  assert.deepEqual(adapter.requestCancel(), { supported: false, reason: 'foreground-cancellation-unsupported', confirmation: 'unavailable' });
  assert.equal(calls.length, 3);
  assert.equal(JSON.stringify({ calls, count, started, inspected }).includes(key), false);
});

test('live transport refuses unsupported input before dispatch and requires explicit timeout and identities', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json(response()); }, adapter = provider(fetcher);
  for (const timeoutMs of [undefined, 0, -1, 0.5, limits.timeoutMs + 1])
    assert.throws(() => createEvaluationProvider({ fetcher, timeoutMs }), safeFailure('evaluation_provider_input', 'not-dispatched'));
  for (const changed of [
    { key: undefined }, { model: undefined }, { model: { requested: 'acme', resolved: null } },
    { model: { requested: 'acme', resolved: key } }, { scope: undefined },
    { scope: { organization: 'org-acme', project: '../other' } },
    { scope: { organization: key, project: null } }, { priorConversation: 'acme' },
    { packet: { instructions: '', input: 'Acme' } }, { packet: { instructions: 'Acme', input: 'a\0b' } },
    { packet: { ...input().packet, input: key } },
    { packet: { ...input().packet, input: Buffer.from(key).toString('base64') } },
    { packet: { ...input().packet, input: 'x'.repeat(limits.packetBytes + 1) } },
  ]) await assert.rejects(adapter.count({ ...input(), ...changed }), safeFailure('evaluation_provider_input', 'not-dispatched'));
  for (const maxOutputTokens of [undefined, 0, -1, 0.5, limits.tokens + 1])
    await assert.rejects(adapter.start({ ...input(), maxOutputTokens }), safeFailure('evaluation_provider_input', 'not-dispatched'));
  for (const responseId of ['../other', 'resp_acme?expand=all', `resp_${key}`])
    await assert.rejects(adapter.inspect({ ...inspectInput(), responseId }), safeFailure('evaluation_provider_input', 'not-dispatched'));
  assert.equal(calls, 0);
});

test('live response validates actual model/tier/identity/status/usage and rejects tools or unknown content', async () => {
  for (const changed of [
    { model: model.requested }, { service_tier: 'flex' }, { service_tier: undefined }, { id: 'resp_other' },
    { object: 'other' }, { status: 'invented' }, { created_at: at / 1000 + 61 },
    { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 2 } },
    { usage: { input_tokens: -1, output_tokens: 2, total_tokens: 1 } },
    { usage: { input_tokens: 1.5, output_tokens: 2, total_tokens: 3.5 } },
    { usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER } },
    { usage: { ...response().usage, output_tokens_details: { reasoning_tokens: 31 } } },
    { usage: { ...response().usage, input_tokens_details: { cached_tokens: '1' } } },
    { output: [{ type: 'function_call', arguments: '{}' }] },
    { output: [{ type: 'message', role: 'user', content: [] }] },
    { output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Acme' }] }] },
    { output: [textItem('a\0b')] }, { output: [] },
    { output: Array.from({ length: limits.items + 1 }, () => textItem('Acme')) },
  ]) await assert.rejects(provider(async () => json(response(changed))).inspect(inspectInput()), safeFailure('evaluation_provider_response'));
  for (const body of [{ object: 'wrong', input_tokens: 1 }, { object: 'response.input_tokens', input_tokens: 0 },
    { object: 'response.input_tokens', input_tokens: '100' }, { object: 'response.input_tokens', input_tokens: limits.tokens + 1 }])
    await assert.rejects(provider(async () => json(body)).count(input()), safeFailure('evaluation_provider_response'));
});

test('live receipts retain unknown usage and output-cap breaches without exporting hidden reasoning', async () => {
  for (const status of ['queued', 'in_progress', 'failed', 'cancelled', 'incomplete']) {
    const result = await provider(async () => json(response({ status, output: [], usage: null }))).inspect(inspectInput());
    assert.equal(result.terminal, !['queued', 'in_progress'].includes(status));
    assert.equal(result.usage, null); assert.equal(result.text, '');
  }
  const hidden = 'Acme hidden reasoning must remain private';
  const result = await provider(async () => json(response({ output: [{ type: 'reasoning', summary: [{ text: hidden }] }, ...response().output] })))
    .start({ ...input(), maxOutputTokens: 20 });
  assert.equal(JSON.stringify(result).includes(hidden), false);
  assert.equal(result.usage.outputTokens, 30); assert.equal(result.usage.reasoningTokens, 10);
  assert.equal(result.outputLimitExceeded, true);
  const unknown = await provider(async () => json(response({ usage: undefined }))).start({ ...input(), maxOutputTokens: 20 });
  assert.equal(unknown.usage, null); assert.equal(unknown.outputLimitExceeded, null);
});

test('live transport sanitizes failures and rejects raw, encoded, header and escaped credential reflections', async () => {
  const cases = [
    [async () => { throw Error(key); }, 'evaluation_provider_unavailable'],
    [async () => json({ error: key }, { status: 401 }), 'evaluation_provider_denied'],
    [async () => json(response({ output: [textItem(key)] })), 'evaluation_provider_response'],
    [async () => json(response({ metadata: { private: Buffer.from(key).toString('base64') } })), 'evaluation_provider_response'],
    [async () => json(response(), { headers: { 'x-acme': key } }), 'evaluation_provider_response'],
    [async () => new Response(JSON.stringify(response({ metadata: { private: key } })).replaceAll('acme', '\\u0061cme')), 'evaluation_provider_response'],
  ];
  for (const [fetcher, code] of cases) await assert.rejects(provider(fetcher).inspect(inspectInput()), safeFailure(code));
});

test('live transport retains original reflection and output-limit bindings across caller mutation', async () => {
  const original = { ...input(), maxOutputTokens: 20 };
  const adapter = provider(async () => {
    original.key = 'acme-different-synthetic-credential';
    original.maxOutputTokens = 1000;
    original.model.resolved = 'acme-other-model';
    return json(response());
  });
  const result = await adapter.start(original);
  assert.deepEqual(result.model, model);
  assert.equal(result.outputLimitExceeded, true);
  const inspecting = inspectInput();
  await assert.rejects(provider(async () => {
    inspecting.key = 'acme-different-synthetic-credential';
    return json(response({ output: [textItem(key)] }));
  }).inspect(inspecting), safeFailure('evaluation_provider_response'));
});

test('live transport bounds streamed bytes, text, malformed UTF8/JSON, nesting and redirected endpoints', async () => {
  const deep = {}; let nested = deep;
  for (let i = 0; i < limits.depth + 1; i++) { nested.child = {}; nested = nested.child; }
  const cases = [
    [() => new Response('x'.repeat(limits.responseBytes + 1)), 'evaluation_provider_limit'],
    [() => json(response({ output: [textItem('x'.repeat(limits.textBytes + 1))] })), 'evaluation_provider_limit'],
    [() => new Response(new Uint8Array([0xff])), 'evaluation_provider_response'],
    [() => new Response('{'), 'evaluation_provider_response'],
    [() => json(response({ metadata: deep })), 'evaluation_provider_response'],
    [() => { const r = json(response()); Object.defineProperty(r, 'redirected', { value: true }); return r; }, 'evaluation_provider_response'],
    [() => { const r = json(response()); Object.defineProperty(r, 'url', { value: 'https://acme.invalid/other' }); return r; }, 'evaluation_provider_response'],
  ];
  for (const [make, code] of cases) await assert.rejects(provider(async () => make()).inspect(inspectInput()), safeFailure(code));
  let cancelled = false;
  await assert.rejects(provider(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(limits.responseBytes)); controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; },
  }))).inspect(inspectInput()), safeFailure('evaluation_provider_limit'));
  assert.equal(cancelled, true);
});

test('live foreground timeout and slow/incomplete bodies remain uncertain without retries or waiting for cancellation', async () => {
  for (const fetcher of [
    async () => new Promise(() => {}),
    async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { return new Promise(() => {}); } })),
  ]) {
    let calls = 0, signal;
    const adapter = provider(async (...args) => { calls++; signal = args[1].signal; return fetcher(...args); }, { timeoutMs: 15 });
    await assert.rejects(adapter.start({ ...input(), maxOutputTokens: 50 }), safeFailure('evaluation_provider_timeout'));
    assert.equal(calls, 1); assert.equal(signal.aborted, true);
  }
  for (const status of [403, 429, 500]) {
    let calls = 0;
    const adapter = provider(async () => { calls++; return json({ error: key }, { status }); });
    const code = status === 403 ? 'evaluation_provider_denied' : status === 429 ? 'evaluation_provider_throttled' : 'evaluation_provider_unavailable';
    await assert.rejects(adapter.start({ ...input(), maxOutputTokens: 50 }), safeFailure(code));
    assert.equal(calls, 1);
  }
});

test('live reader rejects immediate empty chunks without relying on a deadline timer', async () => {
  let reads = 0, calls = 0, cancelled = false;
  const bytes = new TextEncoder().encode(JSON.stringify(response()));
  // Finite even without the fix: the old reader consumes 4097 empty chunks,
  // then valid JSON and EOF. This cannot hang the main test process.
  const adapter = provider(async () => {
    calls++;
    return { ok: true, redirected: false, url: '', headers: new Headers(), body: { getReader: () => ({
      async read() {
        reads++;
        return reads <= 4097 ? { done: false, value: new Uint8Array(0) }
          : reads === 4098 ? { done: false, value: bytes } : { done: true };
      },
      async cancel() { cancelled = true; },
    }) } };
  });
  await assert.rejects(adapter.inspect(inspectInput()), safeFailure('evaluation_provider_response'));
  assert.equal(reads, 1); assert.equal(calls, 1); assert.equal(cancelled, true);
});

test('live reader accepts 4096 progressing chunks but refuses the next chunk below the byte ceiling', async () => {
  for (const count of [4096, 4097]) {
    let reads = 0, calls = 0, cancelled = false;
    const bytes = new TextEncoder().encode(JSON.stringify(response()));
    assert.ok(count + bytes.byteLength < limits.responseBytes);
    const adapter = provider(async () => {
      calls++;
      return { ok: true, redirected: false, url: '', headers: new Headers(), body: { getReader: () => ({
        async read() {
          reads++;
          // Whitespace followed by JSON is a valid response, independent of
          // transport chunking. All reads settle immediately, but are finite.
          return reads < count ? { done: false, value: new Uint8Array([32]) }
            : reads === count ? { done: false, value: bytes } : { done: true };
        },
        async cancel() { cancelled = true; },
      }) } };
    });
    if (count === 4096) {
      assert.equal((await adapter.inspect(inspectInput())).id, 'resp_acme');
      assert.equal(reads, 4097); // Includes the final EOF read.
    } else {
      await assert.rejects(adapter.inspect(inspectInput()), safeFailure('evaluation_provider_limit'));
      assert.equal(reads, 4097);
    }
    assert.equal(calls, 1); assert.equal(cancelled, true);
  }
});

test('pure provider packet preparation preserves the fixed wire identity and snapshots inputs', () => {
  const original = { model: { requested: 'acme-alias', resolved: 'acme-resolved' }, packet: { instructions: 'Acme instructions.', input: 'Acme input.' } };
  const prepared = prepareEvaluationProviderPacket(original);
  assert.equal(JSON.stringify(prepared.body), '{"model":"acme-resolved","instructions":"Acme instructions.","input":"Acme input."}');
  // Independent fixed vector, not computed by the helper under test.
  assert.equal(prepared.packetDigest, '48bab5a7295308deadc6c2a073f63e3c7617e46509343202cfd1b5d8a1b1c930');
  original.model.requested = 'acme-other-alias';
  assert.equal(prepareEvaluationProviderPacket(original).packetDigest, prepared.packetDigest);
  original.model.resolved = 'acme-other-resolved';
  assert.notEqual(prepareEvaluationProviderPacket(original).packetDigest, prepared.packetDigest);
  original.packet.input = 'Acme changed';
  assert.equal(prepared.body.input, 'Acme input.');
  assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.body));
  assert.throws(() => { prepared.body.model = 'changed'; }, TypeError);
});

test('pure provider packet preparation rejects unsupported shape, Unicode and exact byte overflow', () => {
  const valid = { model: { ...model }, packet: { instructions: 'Acme', input: 'x' } };
  for (const changed of [
    { ...valid, key }, { ...valid, scope }, { ...valid, model: 'acme' },
    { ...valid, model: { requested: 'acme', resolved: null } },
    { ...valid, model: { ...model, other: 'acme' } },
    ...['', ' ', 'x\0y', '\ud800', '\udfff'].map(s => ({ ...valid, packet: { instructions: 'Acme', input: s } })),
    { ...valid, packet: { ...valid.packet, other: 'acme' } },
  ]) assert.throws(() => prepareEvaluationProviderPacket(changed), safeFailure('evaluation_provider_input', 'not-dispatched'));
  const overhead = Buffer.byteLength(JSON.stringify({ instructions: 'Acme', input: '' }));
  const exact = { ...valid, packet: { instructions: 'Acme', input: 'x'.repeat(limits.packetBytes - overhead) } };
  assert.equal(Buffer.byteLength(JSON.stringify(exact.packet)), limits.packetBytes);
  assert.ok(prepareEvaluationProviderPacket(exact).packetDigest);
  assert.throws(() => prepareEvaluationProviderPacket({ ...exact, packet: { ...exact.packet, input: exact.packet.input + 'x' } }), safeFailure('evaluation_provider_input', 'not-dispatched'));
  const throwing = { model: { ...model }, get packet() { throw Error('Acme private canary'); } };
  assert.throws(() => prepareEvaluationProviderPacket(throwing), e => e.message === 'evaluation_provider_input' && e.cause === undefined && !e.stack.includes('Acme private canary'));
});

test('shared packet validation refuses malformed Unicode before count or generation dispatch', async () => {
  let calls = 0;
  const adapter = provider(async () => { calls++; return json(response()); });
  for (const operation of ['count', 'start']) {
    const request = { ...input(), packet: { instructions: 'Acme', input: '\ud800' }, ...(operation === 'start' ? { maxOutputTokens: 50 } : {}) };
    await assert.rejects(adapter[operation](request), safeFailure('evaluation_provider_input', 'not-dispatched'));
  }
  assert.equal(calls, 0);
});
