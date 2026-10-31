// The installed app's icon: a plate on the workspace green. SVG for browsers
// that take it, PNG rasterized here with node:zlib only (no image dependency).
import { deflateSync, crc32 } from 'node:zlib';

export const THEME = { green: '#245c48', paper: '#f5f5ef' };
// One geometry for every format: circles as fractions of the icon side. All
// of it sits inside the maskable safe zone (a centred circle of radius 0.4).
const LAYERS = [
  { r: 0.33, color: THEME.paper },
  { r: 0.25, color: THEME.green },
  { r: 0.225, color: THEME.paper },
];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

export function iconSvg({ maskable = false } = {}) {
  const background = maskable
    ? `<rect width="512" height="512" fill="${THEME.green}"/>`
    : `<rect width="512" height="512" rx="112" fill="${THEME.green}"/>`;
  const circles = LAYERS.map(layer => `<circle cx="256" cy="256" r="${Math.round(layer.r * 512 * 100) / 100}" fill="${layer.color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><title>Plates</title>${background}${circles}</svg>`;
}

// Full-bleed square (iOS and maskable launchers round it themselves). Each
// circle edge is antialiased by its distance to the pixel centre.
export function iconPng(size) {
  if (!Number.isInteger(size) || size < 16 || size > 1024) throw new Error('icon size out of range');
  const base = rgb(THEME.green), layers = LAYERS.map(layer => ({ r: layer.r * size, color: rgb(layer.color) }));
  const row = size * 4 + 1, raw = Buffer.alloc(row * size), centre = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      let [r, g, b] = base;
      for (const layer of layers) {
        const alpha = Math.min(1, Math.max(0, layer.r - distance + 0.5));
        if (!alpha) continue;
        r += (layer.color[0] - r) * alpha; g += (layer.color[1] - g) * alpha; b += (layer.color[2] - b) * alpha;
      }
      const at = y * row + 1 + x * 4;
      raw[at] = Math.round(r); raw[at + 1] = Math.round(g); raw[at + 2] = Math.round(b); raw[at + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0; // 8-bit RGBA, no interlace
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
