// Discord's documented T-marked channel permissions, checked 2026-10-31:
// https://docs.discord.com/developers/topics/permissions#bitwise-permission-flags
// Raw permission calculations retain unrelated guild and voice bits. They are not
// additional capabilities in a GUILD_TEXT channel and cannot all be revoked there.
export const TEXT_PERMISSION_BITS = Object.freeze([0, 4, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 28, 29, 31, 34, 35, 36, 37, 38, 39, 46, 49, 50, 51, 52]);
const mask = values => values.reduce((n, bit) => n | (1n << BigInt(bit)), 0n);
export const TEXT_PERMISSION_MASK = mask(TEXT_PERMISSION_BITS);
export const KNOWN_PERMISSION_MASK = ((1n << 53n) - 1n) & ~(1n << 47n);
// Narrow compatibility exception: historical UseClydeAI, omitted from Discord's
// current table. SDK-maintainer evidence identifies this exact retired flag:
// https://docs.discordnet.dev/api/Discord.ChannelPermission.html
// https://docs.dcs.aitsys.dev/api/DisCatSharp/DisCatSharp.Enums.Permissions
// No text capability is granted; arbitrary unknown flags still fail closed.
export const LEGACY_CLYDE_MASK = 1n << 47n;
// Owner/admin and server administration/moderation authority remain disallowed,
// even if a channel overwrite would obscure that authority in a raw calculation.
export const FORBIDDEN_GUILD_MASK = mask([1, 2, 3, 4, 5, 7, 19, 27, 28, 29, 30, 40, 41]);
export function permissionBits(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,32}$/.test(value)) throw new Error('invalid_permissions');
  return BigInt(value);
}
export function textPermissionObservation(value) {
  const raw = permissionBits(value), text = raw & TEXT_PERMISSION_MASK;
  const unknown = raw & ~(KNOWN_PERMISSION_MASK | LEGACY_CLYDE_MASK), forbidden = raw & FORBIDDEN_GUILD_MASK;
  return { expected: '3072', observed: raw.toString(), text: text.toString(),
    missing: (3072n & ~text).toString(), extra: (text & ~3072n).toString(),
    outsideText: (raw & ~TEXT_PERMISSION_MASK).toString(), legacyClyde: (raw & LEGACY_CLYDE_MASK).toString(), unknown: unknown.toString(), forbidden: forbidden.toString() };
}
export function textPermissionsAllowed(value) {
  const p = textPermissionObservation(value);
  return p.text === p.expected && p.unknown === '0' && p.forbidden === '0';
}
