// Explicit foreground entrypoint. Importing this module performs no I/O.
import { readFileSync, realpathSync, lstatSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Bridge, DESTINATION, fail } from './core.mjs';
import { DiscordHTTP, verifyIdentityAndScope, registerCommands } from './transport.mjs';

export function privateFile(path, directory = false) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || stat.uid !== process.getuid() || (stat.mode & 0o077)) fail('private_owned_path_required');
}
export async function start({ root, provisionApproved = false, validateApproved = false }) {
  if (!provisionApproved || !validateApproved) fail('secret_and_live_validation_approval_required');
  if (process.platform !== 'darwin') fail('macos_required');
  root = resolve(root); privateFile(root, true);
  if (realpathSync(root) !== root || root.startsWith(resolve(dirname(fileURLToPath(import.meta.url)), '../..') + '/')) fail('canonical_external_state_required');
  const configFile = join(root, 'config.json'), helper = join(root, 'keychain-helper');
  privateFile(configFile); privateFile(helper);
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const lock = join(root, 'runtime.lock'), fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); closeSync(fd);
  let bridge, client, timer, closed = false, busy = false;
  const shutdown = () => { if (closed) return; closed = true; clearInterval(timer); client?.destroy(); bridge?.close(); unlinkSync(lock); };
  try {
    process.umask(0o077);
    for (const suffix of ['', '-wal', '-shm']) {
      try { privateFile(join(root, `bridge.sqlite${suffix}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    bridge = new Bridge(join(root, 'bridge.sqlite'), config);
    const secret = spawnSync(helper, ['read'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024, env: { PATH: '/usr/bin:/bin', PLATES_DISCORD_SECRET_APPROVED: 'yes' }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (secret.status !== 0 || secret.error || !/^[\w.-]{30,512}$/.test(secret.stdout ?? '')) fail('keychain_read_unavailable');
    let token = secret.stdout; secret.stdout = ''; secret.stderr = '';
    const http = new DiscordHTTP(token);
    const verified = await verifyIdentityAndScope(http);
    await registerCommands(http, bridge);
    const { Client, GatewayIntentBits, Events, Options } = await import('discord.js');
    client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] }, rest: { retries: 0, timeout: 8000 }, makeCache: Options.cacheWithLimits({ MessageManager: 0 }), presence: { activities: [{ name: 'Plates TEST · synthetic only', type: 0 }] } });
    client.on(Events.Error, () => console.error(JSON.stringify({ error: 'gateway_error_redacted' })));
    client.on(Events.ShardError, () => console.error(JSON.stringify({ error: 'gateway_transport_error_redacted' })));
    client.on(Events.Raw, raw => {
      if (raw.t !== 'INTERACTION_CREATE' || closed) return;
      void (async () => {
        let receipt;
        try { receipt = bridge.receive(raw.d); } catch { return; } // off-scope traffic gets no reply
        const ack = await http.acknowledge(raw.d, receipt.duplicate);
        console.log(JSON.stringify({ interaction: receipt.id, acknowledgement: ack ? 'confirmed' : 'unconfirmed', synthetic: true }));
      })().catch(() => console.error(JSON.stringify({ error: 'interaction_failed_redacted' })));
    });
    client.once(Events.ClientReady, () => {
      if (client.user?.id !== DESTINATION.applicationId || client.application?.id !== DESTINATION.applicationId) { shutdown(); return; }
      bridge.smoke();
      console.log(JSON.stringify({ ready: true, verified, mode: 'synthetic', intents: ['Guilds'], backendExecution: 'disabled' }));
      timer = setInterval(() => {
        if (busy || closed || !client.isReady() || Date.now() < http.nextAt) return;
        busy = true;
        void (async () => {
          if (!Object.values(bridge.read().outbox).some(x => x.state === 'pending' && x.retryAt <= Date.now())) return;
          await verifyIdentityAndScope(http); // current permissions before every outbound attempt
          const result = await bridge.deliverOne(http); if (result) console.log(JSON.stringify({ delivery: result }));
        })().catch(() => {
          if (Date.now() < http.nextAt) return; // retain pending rows across explicit rate limits
          console.error(JSON.stringify({ error: 'scope_or_delivery_check_failed_no_send' })); shutdown();
        }).finally(() => { busy = false; });
      }, 1250);
    });
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    await client.login(token); token = ''; // SDK/HTTP retain it only in this process memory.
    return { shutdown };
  } catch (e) { shutdown(); throw e; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log(JSON.stringify({ usage: 'node live.mjs --root /absolute/private/state --secret-approved --validate-approved --json', approval: 'Only after owner approval and manual Keychain provisioning.', behavior: 'verify bot/scope, create three guild commands, send one durable synthetic validation message, receive slash commands' }));
  else {
    const index = args.indexOf('--root');
    try {
      if (index < 0 || !args[index + 1] || args.some((x, i) => !['--root', '--secret-approved', '--validate-approved', '--json'].includes(x) && i !== index + 1)) fail('invalid_arguments');
      await start({ root: args[index + 1], provisionApproved: args.includes('--secret-approved'), validateApproved: args.includes('--validate-approved') });
    } catch { console.error(JSON.stringify({ error: 'bridge_start_failed_details_redacted', hint: 'Check config, private paths, Keychain authorization, exact bot permissions and retained journal; never delete uncertain receipts.' })); process.exitCode = 1; }
  }
}
