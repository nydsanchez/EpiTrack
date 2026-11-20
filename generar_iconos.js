// ============================================================================
//  generar_iconos.js — crea los PNG del ícono de la app (sin dependencias)
//  Dibuja un rayo blanco sobre fondo teal (la marca ⚡ de la app), con
//  anti-aliasing por supermuestreo, y lo codifica como PNG a mano (zlib + CRC32).
//  Uso:  node generar_iconos.js   (o npm run iconos)
//  Genera: icon-192.png, icon-512.png, icon-180.png (iPhone), icon-maskable-512.png
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const BASE = path.dirname(fileURLToPath(import.meta.url));

// ---------- PNG mínimo (RGBA 8 bits) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]); }
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, color RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Dibujo del ícono ----------
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TOP = hex('#14b8a6'), BOT = hex('#0f766e'), WHITE = [255, 255, 255];
const BOLT = [[0.56, 0.08], [0.26, 0.55], [0.45, 0.55], [0.40, 0.92], [0.74, 0.42], [0.53, 0.42], [0.66, 0.08]];
function inPoly(x, y, poly) { let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; }
  return inside; }
function render(size, maskable) {
  const SS = 4, S = size * SS;                 // supermuestreo x4 → bordes suaves
  const out = Buffer.alloc(size * size * 4);
  const acc = new Float64Array(size * size * 4);
  const r = maskable ? 0 : 0.22;               // esquinas redondeadas (no en maskable)
  const scale = maskable ? 0.70 : 0.86;        // el rayo dentro de la "zona segura"
  const bolt = BOLT.map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]);
  for (let y = 0; y < S; y++) { const ny = (y + 0.5) / S;
    for (let x = 0; x < S; x++) { const nx = (x + 0.5) / S;
      let bgA = 1;
      if (!maskable) { const cx = Math.min(Math.max(nx, r), 1 - r), cy = Math.min(Math.max(ny, r), 1 - r);
        const dx = nx - cx, dy = ny - cy; bgA = (dx * dx + dy * dy <= r * r) ? 1 : 0; }
      const col = inPoly(nx, ny, bolt) ? WHITE
        : [TOP[0] + (BOT[0] - TOP[0]) * ny, TOP[1] + (BOT[1] - TOP[1]) * ny, TOP[2] + (BOT[2] - TOP[2]) * ny];
      const idx = (Math.floor(y / SS) * size + Math.floor(x / SS)) * 4;
      acc[idx] += col[0] * bgA; acc[idx + 1] += col[1] * bgA; acc[idx + 2] += col[2] * bgA; acc[idx + 3] += bgA * 255;
    } }
  const n = SS * SS;
  for (let i = 0; i < size * size; i++) { const a = acc[i * 4 + 3] / n; out[i * 4 + 3] = Math.round(a);
    if (a > 0) { const f = a / 255; out[i * 4] = Math.round(acc[i * 4] / n / f); out[i * 4 + 1] = Math.round(acc[i * 4 + 1] / n / f); out[i * 4 + 2] = Math.round(acc[i * 4 + 2] / n / f); } }
  return png(size, size, out);
}

const iconos = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-180.png', 180, false], ['icon-maskable-512.png', 512, true]];
for (const [nombre, size, mask] of iconos) {
  fs.writeFileSync(path.join(BASE, nombre), render(size, mask));
  console.log('Ícono creado:', nombre, `(${size}×${size}${mask ? ', maskable' : ''})`);
}
