// A provider that could not start (its credit, its secret) hands the job to another (the owner's rule, 2026-11-08):
// the shared classifier and choice in lib.mjs (startFailureKind, startFailure, fallbackAgent, fallbackLine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFailureKind, startFailure, fallbackAgent, fallbackLine, START_FAILURES } from '../scripts/plates/lib.mjs';
import * as cross from '../scripts/plates/cross-review.mjs';
import * as climb from '../scripts/plates/climb.mjs';

test('startFailureKind: credit, quota and billing are a top-up; 401, 403 and a bad key a new secret; a rate limit a wait; a real error none', () => {
  const cases = [
    ['Credit balance is too low', 'credit'],
    ['Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.', 'credit'],
    ['429 You exceeded your current quota, please check your plan and billing details. (insufficient_quota)', 'credit'],
    ['402 Payment Required', 'credit'],
    ['403 Forbidden: billing is not active for this organization', 'credit'],
    ['Invalid API key · Please run /login', 'auth'],
    ['401 Unauthorized', 'auth'],
    ['OAuth token has expired. Please obtain a new token or refresh your existing token.', 'auth'],
    ['403 Forbidden', 'auth'],
    ['429 Too Many Requests: rate limit reached for requests', 'rate'],
    ['Overloaded', 'rate'],
    ['529 overloaded_error', 'rate'],
    ['model: claude-acme-9 not_found_error', 'model'],
    ["TypeError: Cannot read properties of undefined (reading 'acme')", null],
    ['ENOENT: no such file or directory, open acme.json', null],
    ['Tests failed: 3 of 120 (acme anvils)', null],
    ['', null],
    [undefined, null],
  ];
  for (const [text, kind] of cases) assert.equal(startFailureKind(text), kind, String(text));
});

test('startFailure: only a start counts, and its kind is named; a real error, a timeout or a good run never hands over', () => {
  const claude = (result, extra = {}) => startFailure({ agent: 'claude', outcome: 'failure', result, elapsedSec: 5, minutes: 15, ...extra });
  const early = { is_error: true, num_turns: 1 };
  assert.equal(claude(early, { text: 'Credit balance is too low' }).kind, 'credit');
  assert.equal(claude(early, { text: 'Invalid API key · Please run /login' }).kind, 'auth');
  assert.equal(claude({ is_error: true, num_turns: 0 }, { text: '429 rate limit' }).kind, 'rate');
  assert.equal(claude(early, { text: '' }).kind, 'unread', 'an empty error at the start: plates cannot read why');
  assert.equal(claude(null).kind, 'unread', 'a failed step with no result at all');
  assert.deepEqual(claude(early, { text: 'Credit balance is too low' }), { kind: 'credit', ...START_FAILURES.credit });
  // A real error, or one past the start: stays with its provider, judged as before.
  assert.equal(claude(early, { text: "TypeError: Cannot read properties of undefined (reading 'acme')" }), null);
  assert.equal(claude({ is_error: true, num_turns: 12 }, { text: 'Credit balance is too low' }), null, 'it started: what it did is judged');
  assert.equal(claude({ is_error: true, num_turns: 1, subtype: 'error_max_turns' }, { text: 'Credit balance is too low' }), null);
  assert.equal(claude(early, { text: 'model: claude-acme-9 not_found_error' }), null, 'a refused model is the config, not a provider to swap');
  assert.equal(claude({ is_error: false, num_turns: 9 }, { outcome: 'success' }), null);
  assert.equal(claude(null, { outcome: 'success' }), null);
  assert.equal(claude(early, { text: 'Credit balance is too low', elapsedSec: 15 * 60 }), null, 'past its budget is a timeout');
  // Codex writes nothing plates reads but its final message: none, before the budget, is a start failure of unread kind.
  const codex = extra => startFailure({ agent: 'codex', outcome: 'failure', elapsedSec: 4, minutes: 15, ...extra });
  assert.equal(codex({ message: null }).kind, 'unread');
  assert.equal(codex({ message: '  ', outcome: 'success' }).kind, 'unread');
  assert.equal(codex({ message: 'I found two problems, then the sandbox stopped me.' }), null, 'it wrote: it started');
  assert.equal(codex({ message: 'Summary.', outcome: 'success' }), null);
  assert.equal(codex({ message: null, elapsedSec: 15 * 60 }), null);
});

test('fallbackAgent: the next listed provider with its secret, never one tried, its own provider last; none left is null', () => {
  const order = ['claude', 'codex'];
  assert.equal(fallbackAgent({ order, tried: ['claude'], own: [], pass: 'crossReview' }), 'codex');
  assert.equal(fallbackAgent({ order, tried: ['codex'], own: ['claude'], pass: 'crossReview' }), 'claude', 'its own provider, when it is all that is left');
  assert.equal(fallbackAgent({ order, tried: ['claude'], own: ['codex'], pass: 'crossReview' }), 'codex');
  assert.equal(fallbackAgent({ order, tried: ['claude'], has: { claude: true, codex: false }, pass: 'crossReview' }), null, 'no secret, no fallback');
  assert.equal(fallbackAgent({ order: ['claude'], tried: ['claude'], pass: 'crossReview' }), null, 'one provider listed: none left');
  assert.equal(fallbackAgent({ order, tried: ['claude', 'codex'], pass: 'crossReview' }), null);
  // Its own provider last, whatever "agents" order says; another (here a third, as a test provider) first.
  const agents = { claude: { passes: ['crossReview'] }, codex: { passes: ['crossReview'] }, acme: { passes: ['crossReview'] }, idle: { passes: [] } };
  assert.equal(fallbackAgent({ order: ['claude', 'codex', 'acme'], tried: ['codex'], own: ['claude'], pass: 'crossReview', agents }), 'acme');
  assert.equal(fallbackAgent({ order: ['idle', 'claude'], tried: ['codex'], pass: 'crossReview', agents }), 'claude', 'a provider that does not do the pass is skipped');
  assert.equal(fallbackAgent({ order: ['claude', 'codex'], tried: ['claude'], has: { codex: true }, pass: 'climb' }), 'codex');
});

test('fallbackLine: one line naming who could not start, which kind, who runs instead, and what the owner does', () => {
  const credit = fallbackLine({ from: 'claude', to: 'codex', failure: START_FAILURES.credit, text: 'Credit balance is too low', doing: 'reviewed' });
  assert.equal(credit, 'Claude could not start: its credit, billing or quota ran out ("Credit balance is too low"); reviewed by Codex instead. For Claude: top up its account; the secret itself was accepted.');
  const auth = fallbackLine({ from: 'codex', to: 'claude', failure: START_FAILURES.auth, doing: 'reviewed' });
  assert.match(auth, /^Codex could not start: its secret was refused; reviewed by Claude instead\. For Codex: rotate the secret\.$/);
  assert.doesNotMatch(fallbackLine({ from: 'claude', to: 'codex', failure: START_FAILURES.rate, text: 'a\nb' }), /\n/, 'one line');
  assert.ok(fallbackLine({ from: 'claude', to: 'codex', failure: START_FAILURES.credit, text: 'x'.repeat(500) }).length < 400, 'the error text is bounded');
});

test('errorCause, in both copies, tells a top-up from a new secret', () => {
  for (const m of [cross, climb]) {
    assert.match(m.errorCause('Credit balance is too low'), /^its credit, billing or quota ran out: top up the account/);
    assert.match(m.errorCause('Invalid API key · Please run /login'), /^the secret was refused: check CLAUDE_CODE_OAUTH_TOKEN/);
    assert.match(m.errorCause('429 Too Many Requests'), /^it was rate-limited or overloaded at the start/);
    assert.match(m.errorCause('model: claude-acme-9 not_found_error'), /^the model was refused/);
    assert.equal(m.errorCause('TypeError: acme'), 'check the secret / model');
  }
});

test('the Budget line counts the agent that did the work: after a fallback, the last of the pass\'s same-named steps that ran', async () => {
  const { stepUse } = await import('../scripts/plates/lib.mjs');
  const at = (s, secs) => ({ started_at: new Date(Date.UTC(2026, 10, 8, 2, 0, s)).toISOString(), completed_at: new Date(Date.UTC(2026, 10, 8, 2, 0, s + secs)).toISOString() });
  const run = steps => [{ steps }];
  const handed = run([
    { name: 'Climb', conclusion: 'success', ...at(0, 4) }, // Claude, which could not start (continue-on-error: success)
    { name: 'Climb', conclusion: 'skipped' }, // Codex's first step, not the pass's provider
    { name: 'Could the agent start?', conclusion: 'success', ...at(5, 1) },
    { name: 'Climb', conclusion: 'success', ...at(10, 20 * 60) }, // Codex, the fallback
    { name: 'Did the agent run?', conclusion: 'success', ...at(20 * 60 + 11, 1) },
  ]);
  assert.equal(stepUse(handed, { step: 'Climb', check: 'Did the agent run?', minutes: 45 }).seconds, 20 * 60);
  const plain = run([{ name: 'Climb', conclusion: 'success', ...at(0, 600) }, { name: 'Climb', conclusion: 'skipped' }, { name: 'Climb', conclusion: 'skipped' }]);
  assert.equal(stepUse(plain, { step: 'Climb', check: 'Did the agent run?', minutes: 45 }).seconds, 600, 'no fallback: the one that ran');
});
