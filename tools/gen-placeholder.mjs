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
 * 더미는 팔레트 5토큰(+완전투명) 밖의 색을 절대 쓰지 않는다. 끝에서 실제 픽셀을 검사한다.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ── 00-OVERVIEW §7-1 팔레트 5토큰 (v3.1) ───────────────────────────── */
const P = {
  // 00-OVERVIEW §7-1 (v3.1) — 지정 3색 + 파생 dust + 강조 wax
  ink: 0x0f1f17,
  mid: 0x3a3c31,
  bone: 0xc2c8a5,
  dust: 0x68735e,
  wax: 0xc0392f,
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

/** Bayer 4x4 임계 행렬 — 1비트 계조의 유일한 수단 (00-OVERVIEW §7-1) */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

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

  /**
   * 03-ASSET-MODULES §4-1 — 오더드 디더(Bayer 4x4).
   * level 0..16. 격자는 이미지 좌표에 정렬한다 (에셋마다 위상이 어긋나면 안 된다).
   */
  dither(x, y, w, h, c, level) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        if (BAYER4[py & 3][px & 3] < level) this.px(px, py, c);
      }
  }

  /** 광원 — 중심에서 멀어질수록 디더 밀도가 떨어진다 */
  glow(cx, cy, r, c, peak = 15) {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const d = Math.sqrt(i * i + j * j);
        if (d > r) continue;
        const level = Math.round(peak * (1 - d / r));
        const px = cx + i;
        const py = cy + j;
        if (level > 0 && BAYER4[py & 3][px & 3] < level) this.px(px, py, c);
      }
  }

  /**
   * 최근접 축소 — 손으로 그린 소품을 선언된 크기에 맞춘다.
   * 보간하지 않는다. 픽셀은 픽셀로 남는다 (03-ASSET-MODULES §4-1).
   */
  resized(w, h) {
    if (w === this.w && h === this.h) return this;
    const out = new Img(w, h);
    for (let j = 0; j < h; j++) {
      const sy = Math.min(this.h - 1, Math.floor((j * this.h) / h));
      for (let i = 0; i < w; i++) {
        const sx = Math.min(this.w - 1, Math.floor((i * this.w) / w));
        const o = (sy * this.w + sx) * 4;
        const q = (j * w + i) * 4;
        out.d[q] = this.d[o];
        out.d[q + 1] = this.d[o + 1];
        out.d[q + 2] = this.d[o + 2];
        out.d[q + 3] = this.d[o + 3];
      }
    }
    return out;
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

/** 384×480 실루엣 한 칸 (머리 + 어깨) — 03-ASSET-MODULES §4 (v3.1) */
function silhouette(img, ox, label) {
  img.rect(ox, 0, 384, 480, P.ink);
  img.frame(ox, 0, 384, 480, P.dust);
  img.disc(ox + 192, 160, 76, P.mid); // 머리
  for (let j = 0; j < 184; j++) {
    // 어깨
    const w = 112 + j;
    img.rect(ox + 192 - (w >> 1), 256 + j, w, 1, P.mid);
  }
  if (label) img.text(ox + 192 - String(label).length * 24, 408, label, P.bone, 8);
}

/* ── 상점 배경 · 소품 (v3.1 레퍼런스) ───────────────────────
   전부 ink/bone/mid 3색 + Bayer 디더로만 그린다. 색을 늘리지 않는다.
   본 아트가 오면 같은 크기의 PNG 로 교체하면 끝이다 (좌표는 04-UI-KIT §1). */

/** 좌측 방 752×792 — 벽 · 바닥 · 나무 상자. 광원은 위에서 떨어진다 */
function shopRoom() {
  const w = 752;
  const h = 792;
  const img = new Img(w, h, P.ink);
  img.glow(Math.round(w / 2), -80, 640, P.mid, 14);      // 천장 채광
  const floorY = Math.round(h * 0.72);
  img.dither(0, floorY, w, h - floorY, P.mid, 6);        // 바닥
  img.rect(0, floorY, w, 2, P.dust);                     // 벽/바닥 경계
  for (let i = 1; i < 5; i++) img.rect(Math.round((w / 5) * i), 0, 2, floorY, P.ink); // 벽 기둥 홈
  // 나무 상자 2개 (좌하단)
  for (const [bx, by, bw] of [[40, floorY - 150, 150], [24, floorY - 74, 190]]) {
    img.rect(bx, by, bw, 148, P.ink);
    img.dither(bx, by, bw, 148, P.mid, 8);
    img.frame(bx, by, bw, 148, P.bone);
    img.rect(bx, by + 72, bw, 2, P.bone);
  }
  // 문틀 (우측)
  img.frame(w - 220, floorY - 420, 180, 420, P.dust);
  return img;
}

/** 우측 작업대 1152×792 — 상판 · 램프 광원 · 긁힌 자국 */
function shopBench() {
  const w = 1152;
  const h = 792;
  const img = new Img(w, h, P.ink);
  img.glow(210, 190, 620, P.mid, 15);   // 램프 자리에서 퍼지는 빛
  img.glow(210, 190, 300, P.bone, 6);
  // 상판 긁힘 — 가로로 얕게
  for (const [sx, sy, sw] of [[520, 470, 300], [700, 600, 180], [180, 690, 240], [860, 300, 140]]) {
    img.rect(sx, sy, sw, 2, P.mid);
    img.rect(sx + 30, sy + 6, Math.round(sw * 0.4), 2, P.mid);
  }
  // 원형 얼룩 (컵 자국)
  for (let a = 0; a < 360; a += 6) {
    const r = 74 + (a % 24 === 0 ? 3 : 0);
    img.px(Math.round(880 + r * Math.cos((a * Math.PI) / 180)), Math.round(660 + r * Math.sin((a * Math.PI) / 180)), P.mid);
  }
  return img;
}

/** 램프 224×352 */
function propLamp() {
  const img = new Img(224, 352);
  img.rect(64, 300, 96, 20, P.bone);          // 받침
  img.rect(78, 268, 68, 34, P.ink);
  img.frame(78, 268, 68, 34, P.bone);         // 기름통
  for (let j = 0; j < 200; j++) {             // 유리 등피 (위로 좁아짐)
    const t = j / 200;
    const half = Math.round(52 - 22 * t);
    img.rect(112 - half, 68 + j, half * 2, 1, P.ink);
    img.px(112 - half, 68 + j, P.bone);
    img.px(112 + half - 1, 68 + j, P.bone);
  }
  img.glow(112, 208, 46, P.bone, 12);         // 불꽃
  img.disc(112, 214, 12, P.bone);
  img.rect(60, 52, 104, 16, P.ink);
  img.frame(60, 52, 104, 16, P.bone);         // 손잡이 고리
  return img;
}

/** 펼친 장부 448×352 */
function propLedger() {
  const img = new Img(448, 352);
  img.rect(0, 40, 448, 300, P.ink);
  img.dither(0, 40, 448, 300, P.mid, 9);
  img.frame(0, 40, 448, 300, P.bone);
  img.rect(222, 40, 4, 300, P.bone);          // 책등
  for (let i = 0; i < 7; i++) {               // 필기 줄
    img.rect(24, 84 + i * 34, 170, 2, P.dust);
    img.rect(246, 84 + i * 34, 170, 2, P.dust);
  }
  return img;
}

/** 봉랍 도장 160×256 */
function propStamp() {
  const img = new Img(160, 256);
  img.disc(80, 52, 40, P.ink);
  img.glow(80, 52, 40, P.bone, 13);           // 손잡이 구
  img.frame(40, 12, 80, 80, P.bone);
  img.rect(70, 92, 20, 84, P.bone);           // 축
  img.rect(28, 176, 104, 56, P.ink);
  img.dither(28, 176, 104, 56, P.mid, 10);
  img.frame(28, 176, 104, 56, P.bone);        // 도장 몸통
  return img;
}

/** 두루마리 256×96 */
function propScroll() {
  const img = new Img(256, 96);
  img.rect(0, 20, 256, 56, P.ink);
  img.dither(0, 20, 256, 56, P.mid, 8);
  img.frame(0, 20, 256, 56, P.bone);
  img.rect(0, 20, 20, 56, P.bone);
  img.rect(236, 20, 20, 56, P.bone);          // 양쪽 마구리
  return img;
}

/** 가격표 192×128 */
function propTag() {
  const img = new Img(192, 128);
  for (let j = 0; j < 128; j++) {             // 왼쪽 모서리를 자른 사각
    const cut = j < 64 ? 64 - j : j - 64;
    img.rect(cut, j, 192 - cut, 1, P.ink);
    img.px(cut, j, P.bone);
  }
  img.dither(40, 8, 148, 112, P.mid, 7);
  img.rect(0, 0, 192, 2, P.bone);
  img.rect(0, 126, 192, 2, P.bone);
  img.rect(190, 0, 2, 128, P.bone);
  img.disc(56, 64, 9, P.bone);                // 끈 구멍
  img.disc(56, 64, 5, P.ink);
  return img;
}

const SHOP_ART = {
  'bg.shop.room': shopRoom,
  'bg.shop.bench': shopBench,
  'prop.lamp': propLamp,
  'prop.ledger': propLedger,
  'prop.stamp': propStamp,
  'prop.scroll': propScroll,
  'prop.tag': propTag,
};

/** 전신 실루엣 — star.body.* (752×792). 상점 좌측 칸을 그대로 채운다 */
function bodySilhouette(w, h, label) {
  const img = new Img(w, h, P.ink);
  img.frame(0, 0, w, h, P.dust);
  const cx = Math.round(w / 2);
  img.glow(cx, Math.round(h * 0.18), Math.round(w * 0.7), P.mid, 10);
  img.disc(cx, Math.round(h * 0.18), Math.round(w * 0.14), P.mid);              // 머리
  const top = Math.round(h * 0.3);
  for (let j = 0; j < h - top; j++) {
    const t = j / (h - top);
    const bw = Math.round(w * (0.26 + t * 0.34));
    img.rect(cx - (bw >> 1), top + j, bw, 1, P.mid);                            // 몸통 → 옷자락
  }
  if (label) img.text(cx - String(label).length * 30, h - 96, label, P.bone, 10);
  return img;
}

/** 적 실루엣 — enemy.* (512×512). 블록을 쌓아 만든 1비트 덩어리 */
function enemyBlob(w, h, name) {
  const img = new Img(w, h);
  let seed = 2166136261;
  for (const ch of name) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619) >>> 0; }
  const rand = (n) => {
    let x = (Math.imul(seed, 0x27d4eb2d) ^ Math.imul(n | 0, 0x165667b1)) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x2545f491) >>> 0; x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
  };
  const cols = 8;
  const rows = 10;
  const cw = Math.floor(w / cols);
  const ch2 = Math.floor((h - 64) / rows);
  for (let r = 0; r < rows; r++) {
    const spread = 1 + Math.floor(rand(r) * (cols / 2));
    for (let c = 0; c < cols; c++) {
      if (Math.abs(c - (cols - 1) / 2) > spread) continue;
      img.dither(c * cw, 32 + r * ch2, cw, ch2, rand(r * 31 + c) > 0.35 ? P.bone : P.mid, 8);
    }
  }
  img.text(16, h - 40, name, P.dust, 4);
  return img;
}

/* ── 타입별 더미 ───────────────────────────────────────────── */
function makeImage(key, entry = {}) {
  const shopArt = SHOP_ART[key];
  if (shopArt !== undefined) {
    const drawn = shopArt();
    // 선언 크기와 다르면 맞춰 준다 — 런타임에 소수배로 줄어드는 것보다 낫다
    return Array.isArray(entry.size) ? drawn.resized(entry.size[0], entry.size[1]) : drawn;
  }

  // 매니페스트의 size 가 정본이다. 본 아트도 이 크기로 그리면 좌표가 그대로 맞는다.
  const [w, h] = entry.size ?? [256, 256];
  const name = key.split('.').pop() ?? key;

  if (key.startsWith('bg.')) {
    // 배경 더미는 조용해야 한다 — 이 위에 실제 UI 가 올라간다.
    // 옅은 디더 한 겹 + 좌하단에 작은 키 이름만.
    const img = new Img(w, h, P.ink);
    img.dither(0, 0, w, h, P.mid, 3);
    img.frame(0, 0, w, h, P.dust);
    img.text(16, h - 28, key + '  ' + w + 'X' + h, P.dust, 2);
    return img;
  }
  if (key.startsWith('star.body.')) return bodySilhouette(w, h, name.slice(0, 2));
  if (key.startsWith('star.portrait.') || key.startsWith('star.appeal.')) {
    const img = new Img(w, h);
    silhouette(img, 0, name.slice(0, 2));
    if (key.startsWith('star.appeal.')) img.frame(0, 0, w, h, P.wax);   // 어필 컷은 붉은 액자로 구분
    return img;
  }
  if (key.startsWith('enemy.')) return enemyBlob(w, h, name);
  if (key === 'ui.logo') {
    const img = new Img(w, h, P.ink);
    img.frame(0, 0, w, h, P.bone);
    img.text(48, Math.round(h / 2) - 28, 'UNDYING SHOP', P.bone, 8);
    return img;
  }

  const img = new Img(w, h, P.mid);
  img.frame(0, 0, w, h, P.dust);
  img.text(12, 12, name, P.dust, 4);
  return img;
}

/**
 * 04-UI-KIT §2-1·§2-2 — 상태마다 채움/테두리가 다르다.
 * 플레이스홀더가 **현재 절차적 버튼과 같은 모습**이어야 본 아트로 갈아낄 때 충격이 없다.
 */
const NINE_STYLE = {
  'ui.button.9s':        { fill: P.mid, border: P.dust },
  'ui.button.hover.9s':  { fill: P.mid, border: P.bone },
  'ui.button.danger.9s': { fill: P.mid, border: P.wax },
  'ui.button.ghost.9s':  { fill: P.ink, border: P.dust },
  'ui.panel.9s':         { fill: P.mid, border: P.bone },
  'ui.panel.sunken.9s':  { fill: P.ink, border: P.dust },
};

function makeNineslice(key, entry) {
  const s = entry.slice ?? [4, 4, 4, 4];
  // 매니페스트의 size 가 정본. 없으면 모서리가 겹치지 않을 최소 크기로.
  const size = entry.size?.[0] ?? Math.max(16, 2 * Math.max(...s) + 2);
  const style = NINE_STYLE[key] ?? { fill: P.ink, border: P.dust };
  const img = new Img(size, size, style.fill);
  // 04-UI-KIT §2-2 (v3.1) — 테두리는 2px
  img.frame(0, 0, size, size, style.border);
  img.frame(1, 1, size - 2, size - 2, style.border);
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
      if (r > 5) img.disc(ox + fw / 2, fh / 2, r - 3, P.ink);
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
if (pack === undefined) throw new Error('manifest 에 placeholder 팩이 없다');
const written = [];

for (const [key, entry] of Object.entries(pack.entries)) {
  let buf;
  let colors = 0;
  if (entry.type === 'audio') {
    buf = makeSilentWav();
  } else {
    let img;
    if (entry.type === 'image') img = makeImage(key, entry);
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
console.log('\nOK — placeholder 팩 누락 0개, 팔레트 5토큰 준수.');
