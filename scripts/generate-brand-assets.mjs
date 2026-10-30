#!/usr/bin/env node
/**
 * generate-brand-assets.mjs
 *
 * Renders the Android launcher icons, the adaptive-icon foreground, and the
 * splash screens directly from the VellumScribe brand mark so the native app
 * matches the web icon (`public/favicon.svg`).
 *
 * It also copies `assets/brand/vellumscribe-mark.svg` and
 * `vellumscribe-mark-maskable.svg` to `public/favicon.svg` and
 * `public/maskable.svg`, so those web icons are never hand-maintained copies.
 *
 * The mark reproduces the favicon geometry
 *   (V arms (4.5,4.5)->(12,19.5)->(19.5,4.5) stroke 2.5,
 *    stem (12,19.5)->(12,11) stroke 2,
 *    dot (12,8.5) r 1.75)
 * scaled by translate(14,14) scale(3) into a 100x100 viewBox.
 *
 * Pure Node (no native deps): geometry is rasterised with 4x supersampling and
 * encoded as PNG with zlib.
 *
 * Usage: npm run assets:brand
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

// Brand colours (kept in sync with public/favicon.svg and index.html).
const ICON_BG = [0x09, 0x09, 0x0b]; // #09090B launcher background
const SPLASH_BG = [0x12, 0x12, 0x15]; // #121215 matches capacitor backgroundColor
const INK = [0xff, 0xff, 0xff]; // #FFFFFF mark

const SS = 4; // supersamples per axis

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Brand mark geometry (0..100 logo space)
// ---------------------------------------------------------------------------
const SEGMENTS = [
  { a: [27.5, 27.5], b: [50, 72.5], half: 3.75 },
  { a: [50, 72.5], b: [72.5, 27.5], half: 3.75 },
  { a: [50, 72.5], b: [50, 47], half: 3.0 },
];
const DOT = { cx: 50, cy: 39.5, r: 5.25 };
const AA = 0.6;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Coverage (0..1) of the white mark at logo-space (u,v). */
function markCoverage(u, v) {
  let cov = 0;
  for (const s of SEGMENTS) {
    const d = distToSegment(u, v, s.a[0], s.a[1], s.b[0], s.b[1]);
    cov = Math.max(cov, clamp(s.half + AA - d, 0, 1));
  }
  cov = Math.max(cov, clamp(DOT.r + AA - Math.hypot(u - DOT.cx, v - DOT.cy), 0, 1));
  return cov;
}

function roundedRectInside(u, v, size = 100, r = 24) {
  if (u < 0 || v < 0 || u > size || v > size) return false;
  const qx = Math.min(u, size - u);
  const qy = Math.min(v, size - v);
  if (qx >= r || qy >= r) return true;
  const dx = r - qx;
  const dy = r - qy;
  return dx * dx + dy * dy <= r * r;
}

function circleInside(u, v, size = 100) {
  const c = size / 2;
  return Math.hypot(u - c, v - c) <= c;
}

const put = (buf, i, rgb, a) => {
  buf[i] = Math.round(rgb[0]);
  buf[i + 1] = Math.round(rgb[1]);
  buf[i + 2] = Math.round(rgb[2]);
  buf[i + 3] = Math.round(clamp(a, 0, 1) * 255);
};

/** Render a square asset (launcher icon / round icon / adaptive foreground). */
function renderSquare(size, { shape = 'rounded', bg = ICON_BG } = {}) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgA = 0;
      let markA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 100;
          const v = ((y + (sy + 0.5) / SS) / size) * 100;
          if (bg) {
            bgA +=
              shape === 'circle' ? (circleInside(u, v) ? 1 : 0) : roundedRectInside(u, v) ? 1 : 0;
          }
          markA += markCoverage(u, v);
        }
      }
      const n = SS * SS;
      bgA /= n;
      markA /= n;
      const i = (y * size + x) * 4;
      if (bg) {
        writeRgb(
          out,
          i,
          [
            bg[0] * (1 - markA) + INK[0] * markA,
            bg[1] * (1 - markA) + INK[1] * markA,
            bg[2] * (1 - markA) + INK[2] * markA,
          ],
          bgA
        );
      } else {
        writeRgb(out, i, INK, markA);
      }
    }
  }
  return out;
}

function writeRgb(buf, i, rgb, a) {
  buf[i] = Math.round(rgb[0]);
  buf[i + 1] = Math.round(rgb[1]);
  buf[i + 2] = Math.round(rgb[2]);
  buf[i + 3] = Math.round(clamp(a, 0, 1) * 255);
}

/** Render a splash screen: solid background + centred mark. */
function renderSplash(width, height) {
  const out = Buffer.alloc(width * height * 4);
  const box = Math.min(width, height) * 0.55;
  const boxX = (width - box) / 2;
  const boxY = (height - box) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let markA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS - boxX) / box) * 100;
          const v = ((y + (sy + 0.5) / SS - boxY) / box) * 100;
          markA += markCoverage(u, v);
        }
      }
      markA /= SS * SS;
      const i = (y * width + x) * 4;
      writeRgb(
        out,
        i,
        [
          SPLASH_BG[0] * (1 - markA) + INK[0] * markA,
          SPLASH_BG[1] * (1 - markA) + INK[1] * markA,
          SPLASH_BG[2] * (1 - markA) + INK[2] * markA,
        ],
        1
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const written = [];

function write(relPath, buffer) {
  const abs = path.join(RES, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  written.push(path.relative(ROOT, abs));
}

// Web icons are copies of the canonical SVGs, not hand-maintained duplicates:
// the mark geometry lives only in assets/brand/ (design audit m-1).
function writeRoot(relPath, buffer) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  written.push(relPath);
}

for (const [source, dest] of [
  ['assets/brand/vellumscribe-mark.svg', 'public/favicon.svg'],
  ['assets/brand/vellumscribe-mark-maskable.svg', 'public/maskable.svg'],
]) {
  writeRoot(dest, fs.readFileSync(path.join(ROOT, source)));
}

const DENSITIES = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

for (const [name, scale] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);
  const dir = `mipmap-${name}`;
  write(
    `${dir}/ic_launcher.png`,
    encodePng(legacy, legacy, renderSquare(legacy, { shape: 'rounded' }))
  );
  write(
    `${dir}/ic_launcher_round.png`,
    encodePng(legacy, legacy, renderSquare(legacy, { shape: 'circle' }))
  );
  write(
    `${dir}/ic_launcher_foreground.png`,
    encodePng(adaptive, adaptive, renderSquare(adaptive, { bg: null }))
  );
}

const SPLASH_PORT = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};
const SPLASH_LAND = {
  mdpi: [480, 320],
  hdpi: [800, 480],
  xhdpi: [1280, 720],
  xxhdpi: [1600, 960],
  xxxhdpi: [1920, 1280],
};

for (const [name, [w, h]] of Object.entries(SPLASH_PORT)) {
  write(`drawable-port-${name}/splash.png`, encodePng(w, h, renderSplash(w, h)));
}
for (const [name, [w, h]] of Object.entries(SPLASH_LAND)) {
  write(`drawable-land-${name}/splash.png`, encodePng(w, h, renderSplash(w, h)));
}
// Default fallback drawable (portrait mdpi size), used by @drawable/splash.
write('drawable/splash.png', encodePng(480, 320, renderSplash(480, 320)));

console.log(`Generated ${written.length} brand assets:`);
for (const f of written) console.log(`  ${f}`);
