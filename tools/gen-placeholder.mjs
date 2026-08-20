#!/usr/bin/env node
/**
 * 03-ASSET-MODULES §4 — 플레이스홀더 팩 생성기
 *
 *   node tools/gen-placeholder.mjs
 *
 * content/manifest.json 의 placeholder 팩 엔트리를 읽어, 모든 키에 대응하는
 * 더미 파일을 public/assets/packs/placeholder/ 아래에 만든다.
 * 손으로 그리지 않는다. 새 의존성도 쓰지 않는다 (node:zlib 만 사용).
 *
 * 더미는 팔레트 9색(+완전투명) 밖의 색을 절대 쓰지 않는다. 끝에서 실제 픽셀을 검사한다.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ── 00-OVERVIEW §7-1 팔레트 9색 ───────────────────────────── */
const P = {
  soot: 0x12100e,
  ash: 0x1e1a17,
  clay: 0x2c2622,
  line: 0x3d342e,
  bone: 0xe6dcc8,
  dust: 0x8a8073,
  wax: 0xc0392f,
  tallow: 0xe0a63c,
  spirit: 0x5f8c7b,
};
const ALLOWED = new Set(Object.values(P));

/* ── PNG 인코더 (의존성 없이) ──────────────────────────────── */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(img.h * (img.w * 4 + 1));
  for (let y = 0; y < img.h; y++) {
    const o = y * (img.w * 4 + 1);
    raw[o] = 0; // filter: none
    img.d.copy(raw, o + 1, y * img.w * 4, (y + 1) * img.w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 5x7 비트맵 폰트 (키 이름·이니셜 표기 전용) ────────────── */
const GLYPH = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x1f],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x11, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  '.': [0, 0, 0, 0, 0, 0, 0x04],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0x1f],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

/* ── 그리기 헬퍼 ───────────────────────────────────────────── */
class Img {
  constructor(w, h, fill) {
    this.w = w;
    this.h = h;
    this.d = Buffer.alloc(w * h * 4); // 기본값 = 완전투명
    if (fill !== undefined) this.rect(0, 0, w, h, fill);
  }

  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.d[o] = (c >> 16) & 0xff;
    this.d[o + 1] = (c >> 8) & 0xff;
    this.d[o + 2] = c & 0xff;
    this.d[o + 3] = 255;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  frame(x, y, w, h, c) {
    for (let i = 0; i < w; i++) {
      this.px(x + i, y, c);
      this.px(x + i, y + h - 1, c);
    }
    for (let j = 0; j < h; j++) {
      this.px(x, y + j, c);
      this.px(x + w - 1, y + j, c);
    }
  }

  disc(cx, cy, r, c) {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) this.px(cx + i, cy + j, c);
  }

  text(x, y, str, c, s = 1) {
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      const g = GLYPH[ch] ?? GLYPH[' '];
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++)
          if (g[row] & (1 << (4 - col))) this.rect(cx + col * s, y + row * s, s, s, c);
      cx += 6 * s;
    }
  }
}

/** 96×120 실루엣 한 칸 (머리 + 어깨) */
function silhouette(img, ox, label) {
  img.rect(ox, 0, 96, 120, P.ash);
  img.frame(ox, 0, 96, 120, P.line);
  img.disc(ox + 48, 40, 19, P.dust); // 머리
  for (let j = 0; j < 46; j++) {
    // 어깨
    const w = 28 + j;
    img.rect(ox + 48 - (w >> 1), 64 + j, w, 1, P.dust);
  }
  if (label) img.text(ox + 48 - String(label).length * 6, 102, label, P.bone, 2);
}

/* ── 타입별 더미 ───────────────────────────────────────────── */
function makeImage(key) {
  if (key.startsWith('bg.')) {
    // §4 표: 480×244 단색 clay + 좌상단에 키 이름
    const img = new Img(480, 244, P.clay);
    img.text(6, 6, key, P.dust, 2);
    return img;
  }
  if (key.startsWith('star.portrait.')) {
    // §4 표: 96×120 dust 실루엣 + 이니셜
    const img = new Img(96, 120);
    const name = key.split('.').pop() ?? '';
    silhouette(img, 0, name.slice(0, 2));
    return img;
  }
  const img = new Img(64, 64, P.clay);
  img.frame(0, 0, 64, 64, P.line);
  img.text(3, 3, key.split('.').pop() ?? key, P.dust, 1);
  return img;
}

function makeNineslice(key, entry) {
  // §4 표: ash 채움 + line 1px 테두리
  const s = entry.slice ?? [4, 4, 4, 4];
  const size = Math.max(16, 2 * Math.max(...s) + 2);
  const fill = key.includes('button') ? P.clay : P.ash; // 04-UI-KIT §2-2 raised/sunken
  const img = new Img(size, size, fill);
  img.frame(0, 0, size, size, P.line);
  return img;
}

const SHEET_FRAMES = 4;

function makeSpritesheet(key, entry) {
  const fw = entry.frameWidth;
  const fh = entry.frameHeight;
  const img = new Img(fw * SHEET_FRAMES, fh);
  for (let f = 0; f < SHEET_FRAMES; f++) {
    const ox = f * fw;
    if (key === 'ui.seal') {
      // 봉랍 도장: 프레임마다 커지는 wax 원
      const r = Math.round((fh / 2 - 2) * ((f + 1) / SHEET_FRAMES));
      img.disc(ox + fw / 2, fh / 2, r, P.wax);
      if (r > 5) img.disc(ox + fw / 2, fh / 2, r - 3, P.soot);
      if (r > 7) img.disc(ox + fw / 2, fh / 2, r - 5, P.wax);
    } else {
      silhouette(img, ox, f + 1);
    }
  }
  return img;
}

/**
 * §4 표: 0.2초 무음.
 * Ogg Vorbis 는 새 의존성 없이 인코딩할 수 없어 WAV(PCM 무음)로 낸다.
 * manifest 의 audio 엔트리도 .wav 를 가리킨다. 최종 사운드가 도착하면 교체한다.
 */
function makeSilentWav(seconds = 0.2, rate = 22050) {
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2); // 16bit mono 무음
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** 생성된 픽셀을 실제로 훑어 팔레트 준수를 확인한다 */
function assertPalette(img, key) {
  const bad = new Map();
  for (let o = 0; o < img.d.length; o += 4) {
    if (img.d[o + 3] === 0) continue; // 완전투명 허용
    const c = (img.d[o] << 16) | (img.d[o + 1] << 8) | img.d[o + 2];
    if (!ALLOWED.has(c)) bad.set(c, (bad.get(c) ?? 0) + 1);
  }
  if (bad.size) {
    const list = [...bad].map(([c, n]) => '#' + c.toString(16).padStart(6, '0') + '×' + n);
    throw new Error(key + ': 팔레트 밖의 색 ' + list.join(', '));
  }
  const used = new Set();
  for (let o = 0; o < img.d.length; o += 4) {
    if (img.d[o + 3] === 0) continue;
    used.add((img.d[o] << 16) | (img.d[o + 1] << 8) | img.d[o + 2]);
  }
  return used.size;
}

/* ── 실행 ──────────────────────────────────────────────────── */
const manifestPath = join(ROOT, 'content', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pack = manifest.packs.placeholder;
const written = [];

for (const [key, entry] of Object.entries(pack.entries)) {
  let buf;
  let colors = 0;
  if (entry.type === 'audio') {
    buf = makeSilentWav();
  } else {
    let img;
    if (entry.type === 'image') img = makeImage(key);
    else if (entry.type === 'nineslice') img = makeNineslice(key, entry);
    else if (entry.type === 'spritesheet') img = makeSpritesheet(key, entry);
    else throw new Error(key + ': 알 수 없는 type "' + entry.type + '"');
    colors = assertPalette(img, key);
    buf = encodePng(img);
  }
  const out = join(PUBLIC, pack.root, entry.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  written.push({ key, type: entry.type, file: entry.file, bytes: buf.length, colors });
}

/* ── 누락 키 점검 (inherit 폴백 포함) ──────────────────────── */
function resolveEntry(packName, key, seen = new Set()) {
  if (seen.has(packName)) return null;
  seen.add(packName);
  const p = manifest.packs[packName];
  if (!p) return null;
  if (p.entries?.[key]) return { root: p.root, entry: p.entries[key] };
  if (p.inherit) return resolveEntry(p.inherit, key, seen);
  return null;
}

const allKeys = new Set();
for (const p of Object.values(manifest.packs)) for (const k of Object.keys(p.entries ?? {})) allKeys.add(k);

const missing = {};
for (const packName of Object.keys(manifest.packs)) {
  missing[packName] = [];
  for (const key of [...allKeys].sort()) {
    const r = resolveEntry(packName, key);
    if (!r) {
      missing[packName].push({ key, path: '(해석 불가)' });
      continue;
    }
    const p = join(PUBLIC, r.root, r.entry.file);
    if (!existsSync(p)) missing[packName].push({ key, path: r.root + r.entry.file });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('생성 ' + written.length + '개 → public/' + pack.root);
console.log('  ' + pad('KEY', 22) + pad('TYPE', 13) + pad('FILE', 26) + pad('BYTES', 8) + 'COLORS');
for (const w of written) {
  console.log(
    '  ' + pad(w.key, 22) + pad(w.type, 13) + pad(w.file, 26) + pad(w.bytes, 8) +
      (w.type === 'audio' ? '-' : w.colors + '/9'),
  );
}
console.log('');
console.log('매니페스트 키 총계 : ' + allKeys.size);
console.log('placeholder 누락 키: ' + missing.placeholder.length);
for (const m of missing.placeholder) console.log('  ! ' + m.key + ' -> ' + m.path);
console.log('final 미도착 아트  : ' + missing.final.length + '  (inherit 로 placeholder 폴백 — 크래시 아님)');
for (const m of missing.final) console.log('  - ' + m.key + ' -> ' + m.path);

if (missing.placeholder.length > 0) {
  console.error('\nplaceholder 팩에 누락 키가 있다.');
  process.exit(1);
}
console.log('\nOK — placeholder 팩 누락 0개, 팔레트 9색 준수.');
