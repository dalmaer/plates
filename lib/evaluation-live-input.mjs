// Controller-private local preparation. No provider, credential or mutation path.
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { evaluationBytes } from './evaluation-ledger.mjs';
import { fingerprint, byteDigest, checkEvaluation as check } from './evaluation-records.mjs';
import { parseLiveDescriptor, liveOperationIdentity } from './evaluation-live-records.mjs';
import { prepareCorpusInputPartition } from './evaluation-corpus.mjs';
import { publicInputView, partitionIdentity, reconstructEvaluatorInput } from './evaluation-input-partition.mjs';
import { preparePublicPacket, PUBLIC_PACKET_TEMPLATE_VERSION, PUBLIC_RESULT_FORMAT } from './evaluation-public-packet.mjs';
import { LIVE_BUILDER_BRIDGE } from './evaluation-docker.mjs';
import { validateFiles } from './evaluation-artifacts.mjs';
import { controllerIdentity } from './evaluation-provenance.mjs';
import { quoteSpend } from './evaluation-spend.mjs';
import { inspectBudgetTarget, inspectBudget } from './validation-budget.mjs';
const ref = r => ({ kind: r.kind, id: r.id, digest: r.digest });
const same = (a, b) => fingerprint(a) === fingerprint(b);
export async function liveDescriptor(path, plan) {
  check(typeof path === 'string' && isAbsolute(path) && await realpath(path) === path, 'canonical live descriptor required');
  const raw = await evaluationBytes(path, 65536);
  return { descriptor: parseLiveDescriptor(raw, { plan }), descriptorPath: path, descriptorHash: byteDigest(raw) };
}
export function liveSlot(plan, pairId, arm) {
  const pair = plan.bundle.comparison.pairs.find(p => p.id === pairId);
  check(pair && ['baseline', 'candidate'].includes(arm), 'unplanned live slot');
  const task = plan.bundle.cases.find(c => c.digest === pair.case.digest);
  const config = plan.bundle.configurations.find(c => c.digest === plan.bundle.comparison[arm].digest);
  check(config?.policy.execution === 'host-gateway-v1', 'live policy required');
  return { slot: `${pairId}-${arm}`, task, config };
}
export function fixedRequestQuote(kind, packetDigest, live) {
  const rates = live.priceEvidence.rates[kind];
  check(rates.inputTokens.microUsd === 0 && rates.outputTokens.microUsd === 0, 'fixed-request pricing required');
  return quoteSpend({ kind, packetDigest, inputTokens: 0, maxOutputTokens: 0, priceEvidence: live.priceEvidence });
}
export async function prepareLiveInput(options, plan, loaded, countResult) {
  const started = Date.now(), { descriptor: request, descriptorHash, descriptorPath } = loaded;
  check(['count', 'generation'].includes(request.stage) && request.planDigest === plan.digest, 'live plan/stage mismatch');
  const { slot, task, config } = liveSlot(plan, request.pairId, request.arm);
  const handle = await prepareCorpusInputPartition({ plan, caseRef: ref(task), configurationRef: ref(config), repository: request.repository, sourcePaths: request.sourcePaths });
  const view = publicInputView(handle), partition = partitionIdentity(handle);
  const packet = preparePublicPacket({ view, model: request.live.model }), controller = await controllerIdentity();
  check(packet.publicViewDigest === partition.publicViewDigest, 'live public view changed');
  check(same(request.live.model, { requested: config.model.requested, resolved: config.model.resolved }), 'frozen live model mismatch');
  const expectedPacket = { format: PUBLIC_PACKET_TEMPLATE_VERSION, templateDigest: packet.templateDigest, packetDigest: packet.packetDigest,
    responseFormat: PUBLIC_RESULT_FORMAT, converterVersion: packet.converterVersion, controllerDigest: controller.digest, bridgeDigest: LIVE_BUILDER_BRIDGE.digest };
  check(same(request.packet, expectedPacket), 'live packet expectation mismatch');
  const environment = task.environment;
  const binding = { case: ref(task), configuration: ref(config), environment, partitionIdentityDigest: partition.digest,
    publicViewDigest: packet.publicViewDigest, packetPreparationDigest: packet.digest, packetDigest: packet.packetDigest,
    templateDigest: packet.templateDigest, converterVersion: packet.converterVersion, controllerDigest: controller.digest, bridgeDigest: LIVE_BUILDER_BRIDGE.digest };
  const identity = liveOperationIdentity({ planDigest: plan.digest, slot, stage: request.stage });
  let quote;
  if (request.stage === 'count') quote = fixedRequestQuote('count', packet.packetDigest, request.live);
  else {
    check(countResult?.observation?.state === 'observed' && countResult.observation.response.kind === 'evaluation-provider-count'
      && countResult.digest === request.count.resultDigest && countResult.operationId === request.count.operationId
      && countResult.observation.response.packetDigest === packet.packetDigest && same(countResult.observation.response.model, request.live.model), 'original count required');
    quote = quoteSpend({ kind: 'generation', packetDigest: packet.packetDigest, inputTokens: countResult.observation.response.inputTokens,
      maxOutputTokens: request.limits.maxOutputTokens, priceEvidence: request.live.priceEvidence });
  }
  const a = request.admission, manifest = await evaluationBytes(a.manifest, 65536);
  const target = await inspectBudgetTarget({ manifest: a.manifest, root: request.repository, repo: a.repo, deadline: started + 10000 });
  check(a.repo === plan.bundle.comparison.repository && byteDigest(manifest) === byteDigest(await evaluationBytes(a.manifest, 65536)), 'live admission changed');
  const host = await inspectBudget({ stateDir: a.stateDir, capacity: a.capacity, targetRoot: request.repository });
  check(!host.coordinationBusy, 'live admission unavailable');
  // Derive the builder from the public view; independent reconstruction remains
  // private and is used only for checks after the builder has terminated.
  const builderFiles = validateFiles([...view.files, { path: 'requirements.json', mode: '100644', base64: Buffer.from(JSON.stringify({ publicBrief: view.publicBrief, requirements: view.requirements })).toString('base64') }]);
  const driver = reconstructEvaluatorInput(handle, '{"schemaVersion":1,"files":[]}').driver;
  const protectedPaths = builderFiles.filter(f => !view.writablePaths.includes(f.path)).map(f => f.path);
  const requestDigest = fingerprint({ stage: request.stage, packetDigest: packet.packetDigest, model: request.live.model, scope: request.live.scope,
    credential: request.live.credential, credentialChannel: 'pipe-json-v1', limits: request.limits });
  return { loaded, identity, slot, task, config, handle, view, packet, binding, controller, builderFiles, protectedPaths, driver, quote, requestDigest,
    target, admissionManifestHash: byteDigest(manifest), host, preparationMs: Date.now() - started, descriptorHash, descriptorPath };
}
