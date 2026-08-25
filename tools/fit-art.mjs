#!/usr/bin/env node
/**
 * 03-ASSET-MODULES §4-1 — 받은 그림을 슬롯 규격에 **맞춰서** final 팩에 넣는다.
 *
 *   node tools/fit-art.mjs <원본.png> <슬롯키> [--fit=cover|contain|stretch] [--out=경로]
 *   node tools/fit-art.mjs "아트/타이틀 화면/타이틀 배경.png" bg.title
 *
 * `--out` 은 final 팩 대신 다른 곳에 쓴다 — 슬롯에 넣기 전에 눈으로 볼 때만.
 * `--canvas=WxH` 는 원본을 그 크기 캔버스 가운데에 먼저 얹는다 — 한 동작의 여러 단계를
 * 같은 자리에 맞출 때 (의심도 1~5 처럼).
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
import { decodePng, encodePng, PALETTE, BAYER4 } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'content', 'manifest.json');

/* 팔레트는 png.mjs 한 곳에만 둔다 — 만드는 쪽(fit-art)과 검사하는 쪽(check-art)이
   같은 정의를 봐야 한다. 갈라지면 검사가 통과시키는 파일을 변환기가 못 만든다. */
const INK = PALETTE.ink;
const BONE = PALETTE.bone;

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

/**
 * 원본을 투명한 WxH 캔버스 가운데에 얹는다.
 *
 * 여러 장이 **한 동작의 단계**일 때 필요하다. 의심도 1~5 는 눈이 떠지는 5단인데
 * 저마다 내용에 딱 맞게 잘려 와서(642x245 ~ 593x429) 각자 따로 맞추면 감은 눈이
 * 뜬 눈만큼 커진다. 제일 큰 칸에 다 같이 얹어야 5장이 같은 자리에서 자란다.
 */
function padToCanvas(src, cw, ch) {
  const luma = new Float64Array(cw * ch);
  const alpha = new Float64Array(cw * ch);
  const ox = Math.round((cw - src.w) / 2);
  const oy = Math.round((ch - src.h) / 2);
  for (let y = 0; y < src.h; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= ch) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= cw) continue;
      luma[dy * cw + dx] = src.luma[y * src.w + x];
      alpha[dy * cw + dx] = src.alpha[y * src.w + x];
    }
  }
  return { w: cw, h: ch, luma, alpha };
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
const decoded = decodePng(resolve(srcArg));

// --crop=x,y,w,h — 한 장에 여러 조각이 들어 있을 때 (상단정보바 = 좌/우 패널 두 장)
const cropFlag = flags.find((f) => f.startsWith('--crop='))?.slice(7);
let cropSrc = decoded;
if (cropFlag !== undefined) {
  const n = cropFlag.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) {
    console.error(`--crop 은 x,y,w,h 꼴이어야 한다 (받은 값: ${cropFlag})`);
    process.exit(1);
  }
  const [cx, cy, cw, chh] = n;
  const luma = new Float64Array(cw * chh);
  const alpha = new Float64Array(cw * chh);
  for (let y = 0; y < chh; y++) {
    const sy = y + cy;
    if (sy < 0 || sy >= decoded.h) continue;
    for (let x = 0; x < cw; x++) {
      const sx = x + cx;
      if (sx < 0 || sx >= decoded.w) continue;
      luma[y * cw + x] = decoded.luma[sy * decoded.w + sx];
      alpha[y * cw + x] = decoded.alpha[sy * decoded.w + sx];
    }
  }
  cropSrc = { w: cw, h: chh, luma, alpha };
}

const canvasFlag = flags.find((f) => f.startsWith('--canvas='))?.slice(9);
let src = cropSrc;
if (canvasFlag !== undefined) {
  const m = /^(\d+)x(\d+)$/.exec(canvasFlag);
  if (m === null) {
    console.error(`--canvas 는 640x480 꼴이어야 한다 (받은 값: ${canvasFlag})`);
    process.exit(1);
  }
  src = padToCanvas(cropSrc, Number(m[1]), Number(m[2]));
}

const rect = fitRect(src.w, src.h, dw, dh, fitMode);
const small = resampleBox(src, dw, dh, rect);
const rgba = dither(small);

// 9-slice buttons can have a transparent middle. On request, fill only the
// stretchable center so the scene behind a button can never show through.
const fillCenter = flags.find((f) => f.startsWith('--fill-center='))?.slice(14);
if (fillCenter !== undefined) {
  if (fillCenter !== 'ink') {
    console.error(`--fill-center only accepts ink (received: ${fillCenter})`);
    process.exit(1);
  }
  const [left, right, top, bottom] = entry.slice ?? [];
  if (![left, right, top, bottom].every(Number.isFinite) || left + right >= dw || top + bottom >= dh) {
    console.error(`--fill-center requires valid 9-slice margins (${slotKey})`);
    process.exit(1);
  }
  for (let y = top; y < dh - bottom; y++) {
    for (let x = left; x < dw - right; x++) {
      const offset = (y * dw + x) * 4;
      rgba[offset] = INK[0]; rgba[offset + 1] = INK[1]; rgba[offset + 2] = INK[2]; rgba[offset + 3] = 255;
    }
  }
}
const png = encodePng(dw, dh, rgba);

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
