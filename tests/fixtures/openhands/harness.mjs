// Synthetic HTTP contract fixture, not an OpenHands server.
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Evaluation } from '../../../experiments/openhands/evaluation.mjs';
import { OpenHandsClient } from '../../../experiments/openhands/client.mjs';
export async function harness(t) {
  const state = { now: Date.parse('2026-10-30T12:00:00.000Z'), calls: [], conversations: new Map(), drop: null, pause: null, exited: false, fenced: true, remaining: 5 };
  const users = { alice: { actorId: 1, projects: ['acme-one', 'acme-two'], execute: true, review: true }, bob: { actorId: 2, projects: ['acme-one', 'acme-two'], execute: true, review: false } };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    const url = new URL(req.url, 'http://127.0.0.1');
    state.calls.push({ method: req.method, path: url.pathname, body });
    if (req.headers['x-session-api-key'] !== 'acme-local-key') { res.writeHead(401).end(); return; }
    const parts = url.pathname.split('/'), conversation = state.conversations.get(parts[3]);
    let output;
    if (req.method === 'POST' && parts.length === 3) {
      if (body.workspace?.kind !== 'LocalWorkspace' || body.workspace?.working_dir !== `/acme/${body.tags?.platesproject}` || body.initial_message || body.confirmation_policy?.kind !== 'AlwaysConfirm' || body.autotitle !== false) { res.writeHead(422).end(); return; }
      output = state.conversations.get(body.conversation_id) ?? { id: body.conversation_id, tags: body.tags, execution_status: 'idle', messages: [] };
      state.conversations.set(output.id, output);
    } else if (!conversation) { res.writeHead(404).end(); return; }
    else if (req.method === 'GET' && parts.length === 4) output = conversation;
    else if (req.method === 'GET' && parts[4] === 'events') output = { items: conversation.messages, next_page_id: null };
    else if (req.method === 'POST' && parts[4] === 'events') {
      if (body.role !== 'user' || body.run !== false) { res.writeHead(422).end(); return; }
      conversation.messages.push({ id: `event-${conversation.messages.length}`, source: 'user', ...body }); output = { success: true };
    } else if (req.method === 'POST' && parts[4] === 'run') { conversation.execution_status = 'running'; output = { success: true }; }
    else if (req.method === 'POST' && parts[4] === 'interrupt') { conversation.execution_status = 'paused'; output = { success: true }; }
    else { res.writeHead(404).end(); return; }
    if (state.pause) await state.pause();
    if (state.drop === `${req.method} ${url.pathname}`) { state.drop = null; req.socket.destroy(); return; }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(output));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const directory = await mkdtemp(join(tmpdir(), 'plates-openhands-acme-'));
  const broker = 'b'.repeat(64), policy = 'c'.repeat(64), connection = 'd'.repeat(64);
  const bindings = Object.fromEntries([1, 2].map(actor => [actor, { version: 1, ownerActorId: actor, provider: 'openai', accountIdentity: { account: `acme-account-${actor}`, workspace: null, scope: 'account' }, poolId: 'acme-pool', brokerScope: broker, connectionGeneration: 1, connectionPolicyDigest: connection,
    grant: { id: String(actor).repeat(64), version: 1, state: 'active', projects: [{ id: 'acme-one', repoId: 101, modelPolicyDigest: policy }, { id: 'acme-two', repoId: 102, modelPolicyDigest: policy }], models: ['acme-model'], expiresAt: '2026-10-30T13:00:00.000Z' },
    evidence: { digest: 'e'.repeat(64), observedAt: '2026-10-30T12:00:00.000Z', expiresAt: '2026-10-30T12:05:00.000Z' } }]));
  const client = new OpenHandsClient({ baseURL: `http://127.0.0.1:${server.address().port}`, sessionKey: 'acme-local-key' });
  const options = { file: join(directory, 'state.sqlite'), client, authenticate: token => users[token], now: () => state.now,
    funding: (actor, project) => ({ binding: bindings[actor], context: { project: { id: project, repoId: project === 'acme-one' ? 101 : 102 }, model: 'acme-model', modelPolicyDigest: policy, connectionPolicyDigest: connection, connectionGeneration: 1, brokerScope: broker }, capacity: { id: 'acme-window', remaining: state.remaining, expiresAt: Date.parse('2026-10-30T12:05:00Z') } }),
    authorizeProfile: run => run.profile === '11111111-1111-4111-8111-111111111111' ? { profile: run.profile, account: run.account, workspace: `/acme/${run.project}` } : null,
    termination: run => ({ conversation: run.conversation, epoch: run.epoch, exited: state.exited, launchFenced: state.fenced }),
  };
  let adapter = new Evaluation(options);
  t.after(async () => { adapter.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const input = overrides => ({ project: 'acme-one', task: 'acme-task', pr: 'acme/repo#1', stage: 'build', source: 'issue', eventId: 'acme-event-1', profile: '11111111-1111-4111-8111-111111111111', ...overrides });
  return { state, users, bindings, options, client, input, get adapter() { return adapter; }, restart(epoch) { adapter.close(); adapter = new Evaluation({ ...options, ...(epoch ? { epoch } : {}) }); return adapter; } };
}
