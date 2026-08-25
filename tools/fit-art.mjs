#!/usr/bin/env node
/**
 * 03-ASSET-MODULES §4-1 — 받은 그림을 슬롯 규격에 **맞춰서** final 팩에 넣는다.
 *
 *   node tools/fit-art.mjs <원본.png> <슬롯키> [--fit=cover|contain|stretch] [--out=경로]
 *   node tools/fit-art.mjs "아트/타이틀 화면/타이틀 배경.png" bg.title
 *
 * `--out` 은 final 팩 대신 다른 곳에 쓴다 — 슬롯에 넣기 전에 눈으로 볼 때만.
 *
 * 왜 필요한가 — 받은 원본은 규격 크기가 아니다 (타이틀 배경 2835x1594, 슬롯은 1920x1080).
 * 그대로 넣으면 Phaser 가 `setDisplaySize` 로 **소수배 축소**를 하고, 그 순간
 * 1비트 Bayer 디더가 뭉개져서 지저분한 회색 얼룩이 된다. 브라우저 리샘플러는
 * 디더 패턴을 모른다.
 *
 * 그래서 여기서 **면적 평균으로 회색조를 만든 뒤 목표 해상도에서 다시 디더링**한다.
 * 톤(밝기)은 보존되고 패턴은 목표 픽셀 격자에 정확히 맞는다.
 *
 * 새 의존성을 쓰지 않는다 (node:zlib 만 사용).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

/* 팔레트 — src/render/palette.ts 와 같은 값이어야 한다 */
const INK = [0x0f, 0x1f, 0x17];
const BONE = [0xc2, 0xc8, 0xa5];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/* ── PNG 디코드 ─────────────────────────────────────────────── */
function decodePng(path) {
  const b = readFileSync(path);
  let off = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let plte = null, trns = null;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error(`비트뎁스 ${depth} 는 못 읽는다 (8 만 지원): ${path}`);
  if (interlace !== 0) throw new Error(`인터레이스 PNG 는 못 읽는다: ${path}`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (ch === undefined) throw new Error(`컬러타입 ${ctype} 는 못 읽는다: ${path}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const bb = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const pp = a + bb - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      cur[x] = v & 0xff;
    }
  }

  // 어떤 컬러타입이든 [luma, alpha] 두 평면으로 편다
  const luma = new Float64Array(w * h);
  const alpha = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (ctype === 3) {
      const idx = out[i];
      r = plte[idx * 3]; g = plte[idx * 3 + 1]; bl = plte[idx * 3 + 2];
      al = trns && idx < trns.length ? trns[idx] : 255;
    } else if (ctype === 0) { r = g = bl = out[i]; }
    else if (ctype === 4) { r = g = bl = out[i * 2]; al = out[i * 2 + 1]; }
    else if (ctype === 2) { r = out[i * 3]; g = out[i * 3 + 1]; bl = out[i * 3 + 2]; }
    else { r = out[i * 4]; g = out[i * 4 + 1]; bl = out[i * 4 + 2]; al = out[i * 4 + 3]; }
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * bl;
    alpha[i] = al;
  }
  return { w, h, luma, alpha };
}

/* ── PNG 인코드 (RGBA) ──────────────────────────────────────── */
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 면적 평균 리샘플 → 목표 해상도의 회색조 ──────────────────── */
/**
 * 원본 사각영역 하나가 목표 픽셀 하나가 되도록 평균을 낸다.
 * 최근접 이웃이 아니라 **평균**이어야 한다 — 디더 패턴이 「50% 회색」이라는
 * 정보를 담고 있고, 평균만이 그 톤을 살려서 내려보낸다.
 * 알파는 가중치로 쓴다 (투명한 곳의 색이 실루엣을 흐리지 않게).
 */
function resampleBox(src, dw, dh, rect) {
  const { x0, y0, x1, y1 } = rect;
  const luma = new Float64Array(dw * dh);
  const alpha = new Float64Array(dw * dh);
  const sw = x1 - x0, sh = y1 - y0;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = y0 + (dy * sh) / dh;
    const sy1 = y0 + ((dy + 1) * sh) / dh;
    const iy0 = Math.floor(sy0), iy1 = Math.max(iy0 + 1, Math.ceil(sy1));
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = x0 + (dx * sw) / dw;
      const sx1 = x0 + ((dx + 1) * sw) / dw;
      const ix0 = Math.floor(sx0), ix1 = Math.max(ix0 + 1, Math.ceil(sx1));
      let ls = 0, as = 0, wsum = 0, areaSum = 0;
      for (let sy = iy0; sy < iy1; sy++) {
        if (sy < 0 || sy >= src.h) continue;
        const cy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (cy <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          if (sx < 0 || sx >= src.w) continue;
          const cx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (cx <= 0) continue;
          const i = sy * src.w + sx;
          const area = cx * cy;
          const a = src.alpha[i] / 255;
          ls += src.luma[i] * area * a;
          as += src.alpha[i] * area;
          wsum += area * a;
          areaSum += area;
        }
      }
      const di = dy * dw + dx;
      // 겹친 넓이의 **합**으로 나눈다. 훑은 칸 수(iy1-iy0)*(ix1-ix0) 로 나누면
      // 가장자리 칸이 부분만 겹치는 만큼 알파가 통째로 깎여서, 불투명한 그림이
      // 절반쯤 뚫린 채로 나온다 (실제로 한 번 그렇게 나왔다)
      luma[di] = wsum > 0 ? ls / wsum : 0;
      alpha[di] = areaSum > 0 ? as / areaSum : 0;
    }
  }
  return { w: dw, h: dh, luma, alpha };
}

/** 원본에서 잘라낼 사각형 — 목표 종횡비에 맞춘다 */
function fitRect(sw, sh, dw, dh, mode) {
  if (mode === 'stretch') return { x0: 0, y0: 0, x1: sw, y1: sh };
  const srcAR = sw / sh, dstAR = dw / dh;
  // cover: 원본을 잘라 목표 비율로 / contain: 원본 전체를 담되 여백이 생긴다
  const wider = mode === 'cover' ? srcAR > dstAR : srcAR < dstAR;
  if (wider) {
    const cw = Math.round(sh * dstAR);
    const x = Math.round((sw - cw) / 2);
    return { x0: x, y0: 0, x1: x + cw, y1: sh };
  }
  const chh = Math.round(sw / dstAR);
  const y = Math.round((sh - chh) / 2);
  return { x0: 0, y0: y, x1: sw, y1: y + chh };
}

/* ── 1비트 Bayer 디더 → RGBA ────────────────────────────────── */
function dither(img) {
  const { w, h, luma, alpha } = img;
  const rgba = Buffer.alloc(w * h * 4);
  // ink~bone 사이에서 어디쯤인지를 0..16 단계로 본다
  const lo = 0.299 * INK[0] + 0.587 * INK[1] + 0.114 * INK[2];
  const hi = 0.299 * BONE[0] + 0.587 * BONE[1] + 0.114 * BONE[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const a = alpha[i];
      if (a < 8) continue; // 완전 투명 — 0 그대로
      const t = Math.max(0, Math.min(1, (luma[i] - lo) / (hi - lo)));
      const level = t * 16;
      const c = level > BAYER4[y & 3][x & 3] ? BONE : INK;
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
      // 알파도 같은 격자로 1비트화한다 — 반투명 가장자리가 남으면 디더가 흐려진다
      rgba[o + 3] = (a / 255) * 16 > BAYER4[y & 3][x & 3] ? 255 : 0;
    }
  }
  return rgba;
}

/* ── main ───────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [srcArg, slotKey] = argv.filter((a) => !a.startsWith('--'));
const fitMode = (flags.find((f) => f.startsWith('--fit='))?.slice(6)) ?? 'cover';

if (!srcArg || !slotKey) {
  console.error('사용법: node tools/fit-art.mjs <원본.png> <슬롯키> [--fit=cover|contain|stretch]');
  process.exit(1);
}
if (!['cover', 'contain', 'stretch'].includes(fitMode)) {
  console.error(`--fit 은 cover|contain|stretch 중 하나여야 한다 (받은 값: ${fitMode})`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entry = manifest.packs.placeholder.entries[slotKey];
if (entry === undefined) {
  console.error(`슬롯 «${slotKey}» 가 매니페스트에 없다. 있는 슬롯:`);
  for (const k of Object.keys(manifest.packs.placeholder.entries)) console.error('  ' + k);
  process.exit(1);
}
if (!Array.isArray(entry.size)) {
  console.error(`슬롯 «${slotKey}» 에는 고정 크기가 없다 (${entry.type}). 이 도구로는 못 맞춘다.`);
  process.exit(1);
}

const [dw, dh] = entry.size;
const src = decodePng(resolve(srcArg));
const rect = fitRect(src.w, src.h, dw, dh, fitMode);
const small = resampleBox(src, dw, dh, rect);
const png = encodePng(dw, dh, dither(small));

const outFlag = flags.find((f) => f.startsWith('--out='))?.slice(6);
const dest = outFlag ? resolve(outFlag) : join(ROOT, 'public', manifest.packs.final.root, entry.file);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, png);

const cropped = rect.x1 - rect.x0 !== src.w || rect.y1 - rect.y0 !== src.h;
console.log('');
console.log(`  ${srcArg}`);
console.log(`  ${src.w}x${src.h}  ->  ${dw}x${dh}   (${fitMode}${cropped ? ' · 잘라냄 ' + (rect.x1 - rect.x0) + 'x' + (rect.y1 - rect.y0) : ''})`);
console.log(`  ${slotKey}  ->  ${outFlag ?? 'public/' + manifest.packs.final.root + entry.file}   ${(png.length / 1024).toFixed(0)}KB`);
console.log('');
if (!outFlag) console.log('  npm run art 로 매니페스트에 반영하고, 개발 서버를 재시작해라.\n');
