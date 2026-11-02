// Synthetic in-memory adapters only: no SDK imports, environment reads or network calls.
export const mockConfig = () => ({ mode: 'offline', liveEnabled: false,
  guildId: '10000000000000001', channelIds: ['10000000000000002'], ownerIds: ['10000000000000003'], userIds: ['10000000000000004'],
  bots: [{ id: '10000000000000005', runtime: 'codex' }, { id: '10000000000000006', runtime: 'claude' }],
  limits: { maxHandoffs: 4, turnTimeoutMs: 1000, taskTimeoutMs: 600_000, turnTokens: 8000, taskTokens: 64_000, totalTokens: 128_000,
    turnMicros: 10_000, taskMicros: 80_000, totalMicros: 160_000, maxQueue: 8, maxTasks: 10, maxMessages: 100 } });

export function mockAdapters(reply = request => ({ text: `Acme ${request.runtime}: discussion turn ${request.history.length + 1}.`, nextBotId: request.peerBotId })) {
  const sent = [], calls = [];
  let sequence = 20000000000000000n;
  return {
    calls, sent,
    providers: Object.fromEntries(['codex', 'claude'].map(runtime => [runtime, { mode: 'offline', async turn(request) {
      calls.push(request);
      const output = await reply(request);
      return { sessionId: request.sessionId, tokens: 100, costMicros: 0, ...output };
    } }])),
    transport: { mode: 'offline', async send(message) {
      const response = { ...message, id: String(++sequence) }; sent.push(response); return { id: response.id };
    } },
  };
}

export function mockMessage(config, changes = {}) {
  return { id: '30000000000000001', guildId: config.guildId, parentId: config.channelIds[0], threadId: '10000000000000007',
    authorId: config.ownerIds[0], bot: false, receiverBotId: config.bots[0].id,
    text: `<@${config.bots[0].id}> Discuss the Acme proposal with your peer.`, mentions: [config.bots[0].id], ...changes };
}

export function mockEcho(config, sent) {
  return mockMessage(config, { id: sent.id, threadId: sent.threadId, authorId: sent.botId, bot: true,
    receiverBotId: config.bots.find(b => b.id !== sent.botId).id, text: sent.content, mentions: sent.allowed_mentions.users });
}
