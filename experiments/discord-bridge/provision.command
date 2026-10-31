#!/bin/zsh
# Run manually in Terminal only after the owner approves this exact mechanism.
set -euo pipefail
umask 077
if [[ "$#" != 1 || "$1" != "--approved" || ! -t 0 || ! -t 2 ]]; then
  print -u2 'After owner approval, run locally: zsh provision.command --approved'
  exit 1
fi
bridge_source="${0:A:h}"
bridge_state="$HOME/Library/Application Support/Plates Discord Test Bridge"
if [[ -e "$bridge_state" ]]; then
  print -u2 'State directory already exists; preserve it and review its receipts. No replacement performed.'
  exit 1
fi
print 'This provisions the existing Plates test bot in your macOS login Keychain.'
print 'Service: org.plates.discord-test-bridge; account: bot-1565878548068311060'
print 'No Discord API call will be made. Never paste the token into chat.'
print -n 'Your Discord user ID (Developer Mode → Copy User ID): '
read -r bridge_user
if [[ ! "$bridge_user" =~ '^[1-9][0-9]{16,19}$' ]]; then
  print -u2 'A numeric Discord user ID is required; nothing was provisioned.'
  exit 1
fi
mkdir -m 700 "$bridge_state"
swiftc "$bridge_source/keychain.swift" -o "$bridge_state/keychain-helper" -module-cache-path "$bridge_state/swift-cache"
chmod 700 "$bridge_state/keychain-helper"
node --input-type=module - "$bridge_source/core.mjs" "$bridge_state/config.json" "$bridge_user" <<'NODE'
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { DESTINATION, validateConfig } = await import(pathToFileURL(process.argv[2]));
const config = validateConfig({ ...DESTINATION, mode: 'synthetic', humans: { [process.argv[4]]: { actorId: 'local-owner', routes: ['gas-city/coordinator', 'gas-city/agent:acme-worker', 'openhands/coordinator', 'openhands/agent:acme-worker'] } } });
writeFileSync(process.argv[3], JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
NODE
PLATES_DISCORD_SECRET_APPROVED=yes "$bridge_state/keychain-helper" store
print 'Provisioning complete. Live validation is a separate approved action.'
