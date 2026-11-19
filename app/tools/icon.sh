#!/bin/bash
# Renders Plates's iPhone icon, assets/icon.png (1024 px): the same porcelain
# plate on cobalt the installed web app uses, drawn by the workspace's own
# lib/web/pwa-icons.mjs so the two never differ. iOS rounds the corners
# itself, so the square is opaque and full bleed; sips drops the alpha
# channel, which an iOS icon may not carry. The icon is compiled into the
# app: a new one needs a new install, not an update.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { iconPng } from "'"$APP"'/../lib/web/pwa-icons.mjs";
writeFileSync(process.argv[1], iconPng(1024));
' "$WORK/icon.png"
sips -s format jpeg -s formatOptions best "$WORK/icon.png" --out "$WORK/icon.jpg" >/dev/null
sips -s format png "$WORK/icon.jpg" --out "$APP/assets/icon.png" >/dev/null
sips -g pixelWidth -g pixelHeight -g hasAlpha "$APP/assets/icon.png" | tail -3
